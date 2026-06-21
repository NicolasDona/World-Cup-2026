<?php
declare(strict_types=1);

// ─────────────────────────────────────────────────────────────────────────────
// API PROXY — data.php
// ─────────────────────────────────────────────────────────────────────────────
// Ce fichier est le seul point de contact entre le navigateur et les APIs
// externes. Le JavaScript côté client ne connaît jamais les tokens.
//
// Fonctionnement :
//  1. Le JS appelle api/data.php?t=<timestamp> (cache-buster)
//  2. Ce script vérifie si un cache serveur récent existe
//  3. Si oui : on renvoie le cache (0 requête externe)
//  4. Si non : on appelle football-data.org + NewsAPI, on met à jour le cache
//  5. On renvoie un JSON unifié : équipes, matchs, classements, actualités
//
// En cas d'erreur réseau, on renvoie le dernier cache disponible (graceful degradation).
// ─────────────────────────────────────────────────────────────────────────────

require __DIR__ . '/config.php';

// Pendant la Coupe du Monde, les actualités doivent bouger vite.
// Le front interroge déjà ce proxy toutes les 60 secondes.
const NEWS_CACHE_TTL_SECONDS = 120;
const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard';

// ── En-têtes HTTP de la réponse ──────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
// Empêche les navigateurs d'interpréter le JSON comme autre chose
header('X-Content-Type-Options: nosniff');
// On gère le cache côté serveur, pas côté navigateur
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Referrer-Policy: strict-origin-when-cross-origin');

// ── Création du dossier cache si nécessaire ──────────────────────────────────
if (!is_dir(CACHE_DIR)) {
    mkdir(CACHE_DIR, 0755, true);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRE : Réponse JSON + exit
// Centralise tous les retours API en un seul endroit.
// @param array $payload  Données à encoder
// @param int   $status   Code HTTP (200, 502, etc.)
// ─────────────────────────────────────────────────────────────────────────────
function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    echo $json !== false ? $json : '{"ok":false,"message":"Erreur JSON"}';
    exit;
}

define('DASHBOARD_PAYLOAD_CACHE_FILE', CACHE_DIR . '/dashboard_payload_v5.json');

function readDashboardPayloadCache(): ?array
{
    if (!is_file(DASHBOARD_PAYLOAD_CACHE_FILE)) {
        return null;
    }

    $raw = file_get_contents(DASHBOARD_PAYLOAD_CACHE_FILE);
    $payload = is_string($raw) ? json_decode($raw, true) : null;
    return is_array($payload) && ($payload['ok'] ?? false) ? $payload : null;
}

function writeDashboardPayloadCache(array $payload): void
{
    @file_put_contents(
        DASHBOARD_PAYLOAD_CACHE_FILE,
        json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTUALITÉS — fetchNews()
// Appelle NewsAPI.org pour récupérer des articles sur la Coupe du Monde 2026.
// Cache court dédié aux actualités pour garder la page fraîche pendant l'événement.
// @return array  Tableau d'articles [title, link, description, date, image]
// ─────────────────────────────────────────────────────────────────────────────
function articleMatchesWatchedTeams(string $title, string $description = ''): bool
{
    $matchTitle = preg_replace('/\s[-–]\s.{2,90}$/u', '', $title) ?? $title;
    $haystack = $matchTitle . ' ' . $description;
    $patterns = [
        '/\bfrance\b/iu',
        '/\bportugal\b/iu',
        '/\bcongo\b/iu',
        '/\brd\s+congo\b/iu',
        '/\brdc\b/iu',
        '/\bdr\s+congo\b/iu',
        '/république\s+démocratique\s+du\s+congo/iu',
        '/republique\s+democratique\s+du\s+congo/iu',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $haystack)) {
            return true;
        }
    }

    return false;
}

function fetchGoogleNews(string $query, bool $watchedOnly = false): array
{
    $rssUrl = 'https://news.google.com/rss/search?q=' . urlencode($query) . '&hl=fr&gl=FR&ceid=FR:fr';
    $ch = curl_init($rssUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 6,
        CURLOPT_HTTPHEADER     => ['User-Agent: WorldCupDashboard/1.0'],
    ]);
    $rss = curl_exec($ch);
    $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($statusCode >= 400) return [];
    if (!is_string($rss) || $rss === '') return [];

    $xml = @simplexml_load_string($rss, 'SimpleXMLElement', LIBXML_NOCDATA);
    if (!$xml || !isset($xml->channel->item)) return [];

    $news = [];
    foreach ($xml->channel->item as $item) {
        if (count($news) >= 4) break;
        $title = trim((string) $item->title);
        $link = trim((string) $item->link);
        $description = trim((string) $item->description);
        if ($title === '' || $link === '') continue;
        if ($watchedOnly && !articleMatchesWatchedTeams($title)) continue;

        $news[] = [
            'title'       => $title,
            'link'        => $link,
            'description' => $description,
            'source'      => isset($item->source) ? trim((string) $item->source) : 'Google News',
            'date'        => $item->pubDate ? date('c', strtotime((string) $item->pubDate)) : gmdate('c'),
            'image'       => '',
        ];
    }

    return $news;
}

function normalizeNewsApiArticle(array $article): ?array
{
    if (empty($article['title']) || empty($article['url'])) {
        return null;
    }

    return [
        'title'       => $article['title']       ?? '',
        'link'        => $article['url']         ?? '#',
        'description' => $article['description'] ?? '',
        'source'      => $article['source']['name'] ?? '',
        'date'        => $article['publishedAt'] ?? gmdate('c'),
        'image'       => $article['urlToImage']  ?? 'assets/news-placeholder.jpg',
    ];
}

function fetchNewsApiArticles(string $queryText, int $pageSize = 4, bool $watchedOnly = false): array
{
    $query = urlencode($queryText);
    $from = rawurlencode((new DateTimeImmutable('today', new DateTimeZone('Europe/Paris')))->setTimezone(new DateTimeZone('UTC'))->format('c'));
    $url = "https://newsapi.org/v2/everything?q={$query}&language=fr&sortBy=publishedAt&from={$from}&pageSize={$pageSize}";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_HTTPHEADER     => [
            'X-Api-Key: ' . NEWS_API_TOKEN,
            'User-Agent: WorldCupDashboard/1.0'
        ],
    ]);

    $response   = curl_exec($ch);
    $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false || $statusCode !== 200) {
        return [];
    }

    $data = json_decode($response, true);
    if (!isset($data['articles']) || !is_array($data['articles'])) {
        return [];
    }

    $news = [];
    foreach ($data['articles'] as $article) {
        if (!is_array($article)) continue;
        $item = normalizeNewsApiArticle($article);
        if (!$item) continue;
        if ($watchedOnly && !articleMatchesWatchedTeams((string) $item['title'], (string) $item['description'])) {
            continue;
        }
        $news[] = $item;
    }

    return $news;
}

function articleIsFromToday(array $article): bool
{
    $date = (string) ($article['date'] ?? '');
    if ($date === '') return false;

    try {
        $published = new DateTimeImmutable($date);
    } catch (Exception) {
        return false;
    }

    $paris = new DateTimeZone('Europe/Paris');
    $today = new DateTimeImmutable('today', $paris);
    $tomorrow = $today->modify('+1 day');
    $localPublished = $published->setTimezone($paris);

    return $localPublished >= $today && $localPublished < $tomorrow;
}

function todayNewsArticles(array $articles): array
{
    return array_values(array_filter(
        $articles,
        static fn (array $article): bool => articleIsFromToday($article)
    ));
}

function articleSourceIsAllowed(array $article): bool
{
    $source = mb_strtolower((string) ($article['source'] ?? ''), 'UTF-8');
    $blocked = [
        'le tribunal du net',
    ];

    foreach ($blocked as $name) {
        if ($source === $name) {
            return false;
        }
    }

    return true;
}

function trustedNewsArticles(array $articles): array
{
    return array_values(array_filter(
        $articles,
        static fn (array $article): bool => articleSourceIsAllowed($article)
    ));
}

function uniqueNewsArticles(array $articles): array
{
    $seen = [];
    $unique = [];

    foreach ($articles as $article) {
        if (!is_array($article)) continue;
        $titleKey = preg_replace('/\s+/u', ' ', trim((string) ($article['title'] ?? ''))) ?? '';
        $key = $titleKey !== ''
            ? 'title:' . mb_strtolower($titleKey, 'UTF-8')
            : 'link:' . strtolower((string) ($article['link'] ?? ''));
        if ($key === '' || isset($seen[$key])) continue;
        $seen[$key] = true;
        $unique[] = $article;
    }

    return $unique;
}

function fillTodayNews(array $articles, array $queries, int $limit = 4, bool $watchedOnly = false): array
{
    $news = trustedNewsArticles(todayNewsArticles(uniqueNewsArticles($articles)));

    foreach ($queries as $queryText) {
        if (count($news) >= $limit) break;
        $fallbackNews = trustedNewsArticles(todayNewsArticles(fetchGoogleNews((string) $queryText, $watchedOnly)));
        $news = trustedNewsArticles(todayNewsArticles(uniqueNewsArticles(array_merge($news, $fallbackNews))));
    }

    return array_slice($news, 0, $limit);
}

function watchedNewsQueries(): array
{
    $base = '("Coupe du monde 2026" OR "World Cup 2026")';
    return [
        'france'   => $base . ' AND France',
        'portugal' => $base . ' AND Portugal',
        'congo'    => $base . ' AND (Congo OR RDC OR "RD Congo" OR "Congo DR" OR "République démocratique du Congo")',
    ];
}

function articleMatchesWatchedTopic(array $article, string $topic): bool
{
    $haystack = (string) ($article['title'] ?? '') . ' ' . (string) ($article['description'] ?? '');
    $patterns = [
        'france'   => ['/\bfrance\b/iu'],
        'portugal' => ['/\bportugal\b/iu'],
        'congo'    => [
            '/\bcongo\b/iu',
            '/\brd\s+congo\b/iu',
            '/\brdc\b/iu',
            '/\bdr\s+congo\b/iu',
            '/république\s+démocratique\s+du\s+congo/iu',
            '/republique\s+democratique\s+du\s+congo/iu',
        ],
    ];

    foreach ($patterns[$topic] ?? [] as $pattern) {
        if (preg_match($pattern, $haystack)) {
            return true;
        }
    }

    return false;
}

function fetchWatchedNews(): array
{
    $featured = [];
    $pool = [];

    foreach (watchedNewsQueries() as $topic => $queryText) {
        $articles = fetchNewsApiArticles($queryText, 3);
        $articles = fillTodayNews($articles, [$queryText], 3);

        $articles = array_values(array_filter(
            todayNewsArticles(uniqueNewsArticles($articles)),
            static fn (array $article): bool => articleMatchesWatchedTopic($article, (string) $topic)
        ));
        if (!$articles) continue;

        $featured[] = $articles[0];
        $pool = array_merge($pool, array_slice($articles, 1));
    }

    return array_slice(todayNewsArticles(uniqueNewsArticles(array_merge($featured, $pool))), 0, 4);
}

function fetchNews(string $scope = 'global'): array
{
    $isWatched = $scope === 'watched';
    $cacheFile = CACHE_DIR . ($isWatched ? '/news_watched_today_v3.json' : '/news_global_today_v3.json');
    $queryText = $isWatched
        ? '("Coupe du monde 2026" OR "World Cup 2026") AND (France OR Portugal OR Congo OR "Congo DR" OR "République démocratique du Congo")'
        : '"Coupe du monde 2026" OR "World Cup 2026"';
    $globalQueries = [
        '"Coupe du monde 2026"',
        '"Mondial 2026"',
        '"World Cup 2026"',
        '"FIFA 2026"',
    ];

    // Retour du cache si encore valide.
    if (is_file($cacheFile) && (time() - filemtime($cacheFile) < NEWS_CACHE_TTL_SECONDS)) {
        $raw = file_get_contents($cacheFile);
        $cachedNews = is_string($raw) ? (json_decode($raw, true) ?? []) : [];
        if ($cachedNews) return $cachedNews;
    }

    $news = $isWatched
        ? fetchWatchedNews()
        : fillTodayNews(fetchNewsApiArticles($queryText, 4), $globalQueries, 4);

    if (!$news) {
        $fallbackNews = fillTodayNews([], $isWatched ? [$queryText] : $globalQueries, 4, $isWatched);
        if ($fallbackNews) {
            @file_put_contents($cacheFile, json_encode($fallbackNews, JSON_UNESCAPED_UNICODE));
            return $fallbackNews;
        }
        if (is_file($cacheFile)) {
            $raw = file_get_contents($cacheFile);
            return is_string($raw) ? (json_decode($raw, true) ?? []) : [];
        }
        return [];
    }

    @file_put_contents($cacheFile, json_encode($news, JSON_UNESCAPED_UNICODE));
    return $news;
}

// ─────────────────────────────────────────────────────────────────────────────
// APPEL API football-data.org — footballDataGet()
// Gère le cache, l'appel cURL et le fallback gracieux.
//
// @param string $path  Chemin relatif, ex: '/competitions/WC/teams'
// @return array        ['ok' => bool, 'cached' => bool, 'data' => array|null, 'status' => int|null]
// ─────────────────────────────────────────────────────────────────────────────
function footballDataGet(string $path, bool $bypassCache = false): array
{
    // Nom de fichier cache dérivé du chemin (ex: _competitions_WC_teams.json)
    $cacheKey  = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $path);
    $cacheFile = CACHE_DIR . '/' . $cacheKey . '.json';

    // Retour du cache si encore valide selon CACHE_TTL_SECONDS
    if (!$bypassCache && is_file($cacheFile) && (time() - filemtime($cacheFile) < CACHE_TTL_SECONDS)) {
        $raw     = file_get_contents($cacheFile);
        $decoded = json_decode((string) $raw, true);
        if (is_array($decoded)) {
            return ['ok' => true, 'cached' => true, 'data' => $decoded];
        }
    }

    // Appel HTTP vers football-data.org
    $url = FOOTBALL_DATA_BASE . $path;
    $ch  = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,                    // 8s max
        CURLOPT_HTTPHEADER     => [
            'X-Auth-Token: ' . FOOTBALL_DATA_TOKEN,
            'Accept: application/json',
        ],
    ]);

    $body   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // Erreur réseau ou HTTP : tentative de fallback sur le cache expiré
    if ($body === false || $status >= 400) {
        if (is_file($cacheFile)) {
            $fallback = json_decode((string) file_get_contents($cacheFile), true);
            if (is_array($fallback)) {
                return ['ok' => true, 'cached' => true, 'data' => $fallback];
            }
        }
        return ['ok' => false, 'cached' => false, 'status' => $status];
    }

    $decoded = json_decode((string) $body, true);
    if (!is_array($decoded)) {
        return ['ok' => false, 'cached' => false];
    }

    // Mise en cache de la réponse fraîche
    @file_put_contents($cacheFile, json_encode($decoded));
    return ['ok' => true, 'cached' => false, 'data' => $decoded];
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉCUPÉRATION DES DONNÉES
// On fait 3 appels en parallèle (séquentiel en PHP sans async, mais cachés donc rapides).
// ─────────────────────────────────────────────────────────────────────────────
function externalJsonGet(string $url, int $timeout = 5): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => ['Accept: application/json', 'User-Agent: WorldCupDashboard/1.0'],
    ]);

    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $status >= 400) return [];
    $decoded = json_decode((string) $body, true);
    return is_array($decoded) ? $decoded : [];
}

function teamSearchNames(array $team): array
{
    $raw = array_filter([$team['name'] ?? '', $team['shortName'] ?? '', $team['tla'] ?? '']);
    $aliases = [
        'Czechia' => 'Czech Republic',
        'Korea Republic' => 'South Korea',
        'Bosnia-Herzegovina' => 'Bosnia and Herzegovina',
        'Bosnia-H.' => 'Bosnia and Herzegovina',
        'Congo DR' => 'DR Congo',
        'Côte d’Ivoire' => 'Ivory Coast',
        'Cote dIvoire' => 'Ivory Coast',
    ];

    $names = [];
    foreach ($raw as $name) {
        $name = trim((string) $name);
        if ($name === '') continue;
        $names[] = $name;
        if (isset($aliases[$name])) $names[] = $aliases[$name];
    }

    return array_values(array_unique($names));
}

function normalizedTeamName(string $name): string
{
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
    $clean = strtolower($ascii !== false ? $ascii : $name);
    return preg_replace('/[^a-z0-9]+/', '', $clean) ?? '';
}

function teamNameKeys(array $team): array
{
    $keys = [];
    foreach (teamSearchNames($team) as $name) {
        $key = normalizedTeamName((string) $name);
        if ($key !== '') {
            $keys[] = $key;
        }
    }
    return array_values(array_unique($keys));
}

function espnTeamNameKeys(array $competitor): array
{
    $team = is_array($competitor['team'] ?? null) ? $competitor['team'] : [];
    $names = [
        $team['displayName'] ?? '',
        $team['name'] ?? '',
        $team['shortDisplayName'] ?? '',
        $team['location'] ?? '',
        $team['abbreviation'] ?? '',
    ];

    $keys = [];
    foreach ($names as $name) {
        $key = normalizedTeamName((string) $name);
        if ($key !== '') {
            $keys[] = $key;
        }
    }
    return array_values(array_unique($keys));
}

function hasSharedTeamName(array $leftKeys, array $rightKeys): bool
{
    return count(array_intersect($leftKeys, $rightKeys)) > 0;
}

function espnScoreboardForDate(string $date): array
{
    static $scoreboards = [];
    $safeDate = preg_replace('/[^0-9]/', '', $date) ?? '';
    if (strlen($safeDate) !== 8) {
        return [];
    }

    if (!array_key_exists($safeDate, $scoreboards)) {
        $scoreboards[$safeDate] = externalJsonGet(ESPN_SCOREBOARD_URL . '?dates=' . rawurlencode($safeDate), 6);
    }

    return is_array($scoreboards[$safeDate]) ? $scoreboards[$safeDate] : [];
}

function findEspnCompetitionForMatch(array $match): array
{
    $date = isset($match['utcDate']) ? substr((string) $match['utcDate'], 0, 10) : '';
    if ($date === '') {
        return [];
    }

    $scoreboard = espnScoreboardForDate($date);
    $events = is_array($scoreboard['events'] ?? null) ? $scoreboard['events'] : [];
    $homeKeys = teamNameKeys((array) ($match['homeTeam'] ?? []));
    $awayKeys = teamNameKeys((array) ($match['awayTeam'] ?? []));

    foreach ($events as $event) {
        $competitions = is_array($event['competitions'] ?? null) ? $event['competitions'] : [];
        foreach ($competitions as $competition) {
            $competitors = is_array($competition['competitors'] ?? null) ? $competition['competitors'] : [];
            $espnHome = [];
            $espnAway = [];
            foreach ($competitors as $competitor) {
                $side = (string) ($competitor['homeAway'] ?? '');
                if ($side === 'home') {
                    $espnHome = (array) $competitor;
                } elseif ($side === 'away') {
                    $espnAway = (array) $competitor;
                }
            }

            if ($espnHome === [] || $espnAway === []) {
                continue;
            }

            if (
                hasSharedTeamName($homeKeys, espnTeamNameKeys($espnHome))
                && hasSharedTeamName($awayKeys, espnTeamNameKeys($espnAway))
            ) {
                return (array) $competition;
            }
        }
    }

    return [];
}

function espnMinute(array $detail): ?int
{
    $display = (string) ($detail['clock']['displayValue'] ?? '');
    if (preg_match('/\d+/', $display, $matches)) {
        return (int) $matches[0];
    }

    $seconds = $detail['clock']['value'] ?? null;
    return is_numeric($seconds) ? max(0, (int) ceil(((float) $seconds) / 60)) : null;
}

function espnDetailsForMatch(array $match): array
{
    $competition = findEspnCompetitionForMatch($match);
    if ($competition === []) {
        return ['scorers' => [], 'cards' => [], 'highlights' => []];
    }

    $teamSides = [];
    $competitors = is_array($competition['competitors'] ?? null) ? $competition['competitors'] : [];
    foreach ($competitors as $competitor) {
        $teamId = (string) ($competitor['team']['id'] ?? '');
        $side = (string) ($competitor['homeAway'] ?? '');
        if ($teamId !== '' && in_array($side, ['home', 'away'], true)) {
            $teamSides[$teamId] = $side;
        }
    }

    $goals = [];
    $cards = [];
    $details = is_array($competition['details'] ?? null) ? $competition['details'] : [];
    foreach ($details as $detail) {
        $typeText = trim((string) ($detail['type']['text'] ?? $detail['type']['displayName'] ?? ''));
        $typeKey = strtolower($typeText);
        $athletes = is_array($detail['athletesInvolved'] ?? null) ? $detail['athletesInvolved'] : [];
        $athlete = is_array($athletes[0] ?? null) ? $athletes[0] : [];
        $player = trim((string) ($athlete['shortName'] ?? $athlete['displayName'] ?? $athlete['fullName'] ?? ''));
        $detailTeamId = (string) ($detail['team']['id'] ?? '');
        $athleteTeamId = (string) ($athlete['team']['id'] ?? '');
        $side = $teamSides[$detailTeamId] ?? ($teamSides[$athleteTeamId] ?? '');
        $minute = espnMinute((array) $detail);

        if (($detail['scoringPlay'] ?? false) || str_contains($typeKey, 'goal')) {
            $goals[] = [
                'teamSide' => $side,
                'team'     => $detail['team']['displayName'] ?? '',
                'player'   => $player !== '' ? $player : trim((string) ($detail['text'] ?? '')),
                'minute'   => $minute,
                'assist'   => '',
                'detail'   => ($detail['ownGoal'] ?? false) ? 'Own Goal' : ($typeText !== '' ? $typeText : 'Goal'),
                'source'   => 'ESPN',
            ];
        }

        if (($detail['yellowCard'] ?? false) || ($detail['redCard'] ?? false) || str_contains($typeKey, 'card')) {
            $isRed = ($detail['redCard'] ?? false) || str_contains($typeKey, 'red');
            $cards[] = [
                'type'     => $isRed ? 'red' : 'yellow',
                'teamSide' => $side,
                'team'     => $detail['team']['displayName'] ?? '',
                'player'   => $player !== '' ? $player : trim((string) ($detail['text'] ?? '')),
                'minute'   => $minute,
                'detail'   => $typeText !== '' ? $typeText : ($isRed ? 'Red Card' : 'Yellow Card'),
                'source'   => 'ESPN',
            ];
        }
    }

    return [
        'scorers'    => $goals,
        'cards'      => $cards,
        'highlights' => [],
    ];
}

function eventMinuteValue(array $event): int
{
    $minute = $event['minute'] ?? null;
    return is_numeric($minute) ? (int) $minute : 999;
}

function playerLastNameKey(string $player): string
{
    $parts = preg_split('/\s+/', trim($player));
    $last = is_array($parts) && $parts !== [] ? (string) end($parts) : $player;
    return normalizedTeamName($last);
}

function cardDedupeKey(array $card): string
{
    $type = strtolower((string) ($card['type'] ?? 'yellow'));
    $minute = is_numeric($card['minute'] ?? null) ? (string) ((int) $card['minute']) : 'na';
    $side = strtolower((string) ($card['teamSide'] ?? ''));
    $player = playerLastNameKey((string) ($card['player'] ?? ''));

    return implode('|', [$minute, $type, $side, $player]);
}

function mergeCardEvents(array ...$cardLists): array
{
    $merged = [];
    $seen = [];

    foreach ($cardLists as $cards) {
        foreach ($cards as $card) {
            if (!is_array($card)) {
                continue;
            }

            $key = cardDedupeKey($card);
            if ($key === 'na|yellow||' || isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $merged[] = $card;
        }
    }

    usort($merged, static fn (array $a, array $b): int => eventMinuteValue($a) <=> eventMinuteValue($b));
    return $merged;
}

function matchScoreTotal(array $match): int
{
    $home = $match['score']['fullTime']['home'] ?? $match['score']['regularTime']['home'] ?? null;
    $away = $match['score']['fullTime']['away'] ?? $match['score']['regularTime']['away'] ?? null;
    return is_numeric($home) && is_numeric($away) ? (int) $home + (int) $away : 0;
}

function legacyCachedScorersForMatch(array $match): array
{
    $matchId = (string) ($match['id'] ?? '');
    if ($matchId === '') {
        return [];
    }

    $cacheKey = substr(hash('sha256', THESPORTSDB_API_KEY), 0, 8);
    $safeMatchId = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $matchId);
    $files = [
        CACHE_DIR . '/scorers_' . $cacheKey . '_' . $safeMatchId . '.json',
        CACHE_DIR . '/scorers_' . $safeMatchId . '.json',
    ];

    foreach ($files as $file) {
        if (!is_file($file)) {
            continue;
        }

        $cached = json_decode((string) file_get_contents($file), true);
        if (is_array($cached) && $cached !== []) {
            return array_values(array_filter($cached, static fn ($goal): bool => is_array($goal)));
        }
    }

    return [];
}

function eventDetailsSnapshotFileForMatch(array $match): string
{
    $matchId = (string) ($match['id'] ?? md5(json_encode($match)));
    $cacheKey = substr(hash('sha256', THESPORTSDB_API_KEY), 0, 8);
    $safeMatchId = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $matchId);
    return CACHE_DIR . '/match_events_' . $cacheKey . '_' . $safeMatchId . '.json';
}

function cachedEventDetailsForMatch(array $match): array
{
    $file = eventDetailsSnapshotFileForMatch($match);
    if (!is_file($file)) {
        return ['scorers' => [], 'cards' => [], 'highlights' => []];
    }

    $cached = json_decode((string) file_get_contents($file), true);
    if (!is_array($cached)) {
        return ['scorers' => [], 'cards' => [], 'highlights' => []];
    }

    return [
        'scorers'    => array_values(array_filter(is_array($cached['scorers'] ?? null) ? $cached['scorers'] : [], static fn ($item): bool => is_array($item))),
        'cards'      => array_values(array_filter(is_array($cached['cards'] ?? null) ? $cached['cards'] : [], static fn ($item): bool => is_array($item))),
        'highlights' => array_values(array_filter(is_array($cached['highlights'] ?? null) ? $cached['highlights'] : [], static fn ($item): bool => is_array($item))),
    ];
}

function rememberEventDetailsForMatch(array $match, array $details): void
{
    $current = cachedEventDetailsForMatch($match);
    $snapshot = [
        'scorers'    => !empty($details['scorers']) ? $details['scorers'] : $current['scorers'],
        'cards'      => !empty($details['cards']) ? $details['cards'] : $current['cards'],
        'highlights' => !empty($details['highlights']) ? $details['highlights'] : $current['highlights'],
        'updatedAt'  => gmdate('c'),
    ];

    if (empty($snapshot['scorers']) && empty($snapshot['cards']) && empty($snapshot['highlights'])) {
        return;
    }

    @file_put_contents(
        eventDetailsSnapshotFileForMatch($match),
        json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    );
}

function isMatchInsideLiveWindow(array $match): bool
{
    $status = (string) ($match['status'] ?? '');
    if (in_array($status, ['IN_PLAY', 'PAUSED'], true)) {
        return true;
    }

    if (!in_array($status, ['SCHEDULED', 'TIMED'], true)) {
        return false;
    }

    $kickoff = strtotime((string) ($match['utcDate'] ?? ''));
    if ($kickoff === false) {
        return false;
    }

    $elapsed = time() - $kickoff;
    return $elapsed >= 0 && $elapsed <= 135 * 60;
}

function sameScoreAsMatch(array $event, array $match): bool
{
    $matchHome = $match['score']['fullTime']['home'] ?? $match['score']['regularTime']['home'] ?? null;
    $matchAway = $match['score']['fullTime']['away'] ?? $match['score']['regularTime']['away'] ?? null;
    if (!is_numeric($matchHome) || !is_numeric($matchAway)) return true;

    $eventHome = $event['intHomeScore'] ?? null;
    $eventAway = $event['intAwayScore'] ?? null;
    if (!is_numeric($eventHome) || !is_numeric($eventAway)) return true;

    return (int) $eventHome === (int) $matchHome && (int) $eventAway === (int) $matchAway;
}

function shouldAcceptSportsDbEvent(array $event, array $match): bool
{
    $status = (string) ($match['status'] ?? '');
    if (in_array($status, ['IN_PLAY', 'PAUSED'], true)) {
        return true;
    }

    return sameScoreAsMatch($event, $match);
}

function findSportsDbEvent(array $match): array
{
    $date = isset($match['utcDate']) ? substr((string) $match['utcDate'], 0, 10) : '';
    if ($date === '') return [];

    $queries = [];
    foreach (teamSearchNames((array) ($match['homeTeam'] ?? [])) as $homeName) {
        foreach (teamSearchNames((array) ($match['awayTeam'] ?? [])) as $awayName) {
            $queries[] = $homeName . '_vs_' . $awayName;
        }
    }

    foreach (array_slice(array_values(array_unique($queries)), 0, 8) as $query) {
        $url = THESPORTSDB_BASE . '/' . rawurlencode(THESPORTSDB_API_KEY)
             . '/searchevents.php?e=' . rawurlencode($query)
             . '&d=' . rawurlencode($date);
        $data = externalJsonGet($url);
        $events = is_array($data['event'] ?? null) ? $data['event'] : [];

        foreach ($events as $event) {
            if (($event['strLeague'] ?? '') !== 'FIFA World Cup') continue;
            if (($event['dateEvent'] ?? '') !== $date) continue;
            if (!shouldAcceptSportsDbEvent((array) $event, $match)) continue;
            return (array) $event;
        }
    }

    return [];
}

function sportsDbHighlightsForEvent(array $event, array $match): array
{
    $links = [];

    $video = trim((string) ($event['strVideo'] ?? ''));
    if ($video !== '') {
        $links[] = [
            'title'  => 'Résumé vidéo',
            'url'    => $video,
            'source' => 'TheSportsDB',
        ];
    }

    $date = isset($match['utcDate']) ? substr((string) $match['utcDate'], 0, 10) : '';
    if ($date !== '') {
        $url = THESPORTSDB_BASE . '/' . rawurlencode(THESPORTSDB_API_KEY)
             . '/eventshighlights.php?d=' . rawurlencode($date);
        if (!empty($event['idLeague'])) {
            $url .= '&l=' . rawurlencode((string) $event['idLeague']);
        }

        $data = externalJsonGet($url);
        $highlights = is_array($data['tv'] ?? null) ? $data['tv'] : [];
        foreach ($highlights as $highlight) {
            $highlightEventId = (string) ($highlight['idEvent'] ?? '');
            $highlightTitle = strtolower((string) ($highlight['strEvent'] ?? ''));
            $eventTitle = strtolower((string) ($event['strEvent'] ?? ''));
            $sameEvent = $highlightEventId !== '' && $highlightEventId === (string) ($event['idEvent'] ?? '');
            $sameTitle = $highlightTitle !== '' && $eventTitle !== '' && $highlightTitle === $eventTitle;
            if (!$sameEvent && !$sameTitle) continue;

            $highlightUrl = trim((string) ($highlight['strVideo'] ?? $highlight['strUrl'] ?? ''));
            if ($highlightUrl === '') continue;

            $links[] = [
                'title'  => trim((string) ($highlight['strTitle'] ?? 'Résumé vidéo')),
                'url'    => $highlightUrl,
                'source' => 'TheSportsDB',
            ];
        }
    }

    $seen = [];
    return array_values(array_filter($links, static function (array $link) use (&$seen): bool {
        $url = $link['url'] ?? '';
        if ($url === '' || isset($seen[$url])) return false;
        $seen[$url] = true;
        return true;
    }));
}

function sportsDbDetailsForMatch(array $match, bool $bypassLiveCache = false): array
{
    if (!in_array((string) ($match['status'] ?? ''), ['FINISHED', 'IN_PLAY', 'PAUSED'], true) && !isMatchInsideLiveWindow($match)) return [];

    $expectedGoals = matchScoreTotal($match);
    $isFinished = ((string) ($match['status'] ?? '')) === 'FINISHED';
    $isLiveData = !$isFinished && isMatchInsideLiveWindow($match);

    $matchId = (string) ($match['id'] ?? md5(json_encode($match)));
    $cacheKey = substr(hash('sha256', THESPORTSDB_API_KEY), 0, 8);
    $scoreKey = $isFinished ? '' : '_' . matchScoreTotal($match);
    $cacheFile = CACHE_DIR . '/match_details_' . $cacheKey . '_' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $matchId . $scoreKey) . '.json';
    $cacheTtl = $isFinished ? 21600 : 0;
    $snapshot = cachedEventDetailsForMatch($match);
    $espnDetails = null;
    $getEspnDetails = static function () use (&$espnDetails, $match): array {
        if ($espnDetails === null) {
            $espnDetails = espnDetailsForMatch($match);
        }
        return is_array($espnDetails) ? $espnDetails : ['scorers' => [], 'cards' => [], 'highlights' => []];
    };

    if (!$isLiveData && is_file($cacheFile) && (time() - filemtime($cacheFile) < $cacheTtl)) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            $espn = [];
            if (empty($cached['scorers']) && matchScoreTotal($match) > 0) {
                $espn = $getEspnDetails();
                $cached['scorers'] = $espn['scorers'] ?: ($snapshot['scorers'] ?: legacyCachedScorersForMatch($match));
            }
            if (empty($cached['cards'])) {
                $espn = $espn ?: $getEspnDetails();
                $cached['cards'] = $espn['cards'] ?: $snapshot['cards'];
            }
            if (empty($cached['highlights'])) {
                $cached['highlights'] = $snapshot['highlights'];
            }
            rememberEventDetailsForMatch($match, $cached);
            return $cached;
        }
        return ['scorers' => [], 'cards' => [], 'highlights' => []];
    }

    $event = findSportsDbEvent($match);
    if (!$event || empty($event['idEvent'])) {
        $espn = $getEspnDetails();
        $empty = [
            'scorers' => $espn['scorers'] ?: ($snapshot['scorers'] ?: legacyCachedScorersForMatch($match)),
            'cards' => mergeCardEvents($espn['cards'] ?? [], $snapshot['cards']),
            'highlights' => $snapshot['highlights'],
            'liveScore' => null,
            'liveStatus' => '',
        ];
        rememberEventDetailsForMatch($match, $empty);
        if (!$isLiveData) {
            @file_put_contents($cacheFile, json_encode($empty));
        }
        return $empty;
    }

    $eventHomeScore = $event['intHomeScore'] ?? null;
    $eventAwayScore = $event['intAwayScore'] ?? null;
    $liveScore = null;
    if (is_numeric($eventHomeScore) && is_numeric($eventAwayScore)) {
        if (!$isFinished) {
            $liveScore = [
                'home'   => (int) $eventHomeScore,
                'away'   => (int) $eventAwayScore,
                'source' => 'TheSportsDB',
            ];
            $expectedGoals = (int) $eventHomeScore + (int) $eventAwayScore;
        }
    }

    $timelineUrl = THESPORTSDB_BASE . '/' . rawurlencode(THESPORTSDB_API_KEY)
                 . '/lookuptimeline.php?id=' . rawurlencode((string) $event['idEvent']);
    $timelineData = externalJsonGet($timelineUrl);
    $timeline = is_array($timelineData['timeline'] ?? null) ? $timelineData['timeline'] : [];
    $goals = [];
    $cards = [];

    foreach ($timeline as $item) {
        $type = strtolower((string) ($item['strTimeline'] ?? ''));
        $detail = strtolower((string) ($item['strTimelineDetail'] ?? ''));
        $player = trim((string) ($item['strPlayer'] ?? ''));

        if (str_contains($type, 'goal') && $player !== '') {
            $goals[] = [
                'teamSide' => (($item['strHome'] ?? '') === 'Yes') ? 'home' : 'away',
                'team'     => $item['strTeam'] ?? '',
                'player'   => $player,
                'minute'   => is_numeric($item['intTime'] ?? null) ? (int) $item['intTime'] : null,
                'assist'   => trim((string) ($item['strAssist'] ?? '')),
                'detail'   => $item['strTimelineDetail'] ?? 'Goal',
                'source'   => 'TheSportsDB',
            ];
        }

        if ((str_contains($type, 'card') || str_contains($detail, 'card')) && $player !== '') {
            $cardType = str_contains($type . ' ' . $detail, 'red') ? 'red' : 'yellow';
            $cards[] = [
                'type'     => $cardType,
                'teamSide' => (($item['strHome'] ?? '') === 'Yes') ? 'home' : 'away',
                'team'     => $item['strTeam'] ?? '',
                'player'   => $player,
                'minute'   => is_numeric($item['intTime'] ?? null) ? (int) $item['intTime'] : null,
                'detail'   => $item['strTimelineDetail'] ?? ($cardType === 'red' ? 'Red Card' : 'Yellow Card'),
                'source'   => 'TheSportsDB',
            ];
        }
    }

    $espn = [];
    if ((count($goals) !== $expectedGoals && $expectedGoals > 0) || $isLiveData || empty($cards)) {
        $espn = $getEspnDetails();
    }
    $completeGoals = count($goals) === $expectedGoals ? $goals : ($espn['scorers'] ?: ($snapshot['scorers'] ?: legacyCachedScorersForMatch($match)));
    $details = [
        'scorers'    => $completeGoals,
        'cards'      => mergeCardEvents($cards, $espn['cards'] ?? [], $snapshot['cards']),
        'highlights' => ($match['status'] ?? '') === 'FINISHED' ? sportsDbHighlightsForEvent($event, $match) : [],
        'liveScore'  => $liveScore,
        'liveStatus' => trim((string) ($event['strStatus'] ?? '')),
    ];
    if (empty($details['highlights'])) {
        $details['highlights'] = $snapshot['highlights'];
    }

    rememberEventDetailsForMatch($match, $details);

    if (!$isLiveData) {
        @file_put_contents($cacheFile, json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    return $details;
}

function enrichMatchesWithDetails(array $matches, bool $bypassLiveCache = false): array
{
    return array_map(static function (array $match) use ($bypassLiveCache): array {
        $details = sportsDbDetailsForMatch($match, $bypassLiveCache);
        $match['scorers'] = is_array($details['scorers'] ?? null) ? $details['scorers'] : [];
        $match['cards'] = is_array($details['cards'] ?? null) ? $details['cards'] : [];
        $match['highlights'] = is_array($details['highlights'] ?? null) ? $details['highlights'] : [];
        if (is_array($details['liveScore'] ?? null)) {
            $match['liveScore'] = $details['liveScore'];
            $match['score']['fullTime']['home'] = $details['liveScore']['home'];
            $match['score']['fullTime']['away'] = $details['liveScore']['away'];
        }
        if (!empty($details['liveStatus'])) {
            $match['liveStatus'] = $details['liveStatus'];
        }
        return $match;
    }, $matches);
}

function applyKnownMatchCorrections(array $matches): array
{
    return array_map(static function (array $match): array {
        if ((string) ($match['id'] ?? '') !== '537371') {
            return $match;
        }

        $match['score']['winner'] = 'HOME_TEAM';
        $match['score']['duration'] = $match['score']['duration'] ?? 'REGULAR';
        $match['score']['fullTime']['home'] = 4;
        $match['score']['fullTime']['away'] = 0;
        $match['score']['regularTime']['home'] = 4;
        $match['score']['regularTime']['away'] = 0;
        unset($match['liveScore']);

        $match['scorers'] = [
            [
                'teamSide' => 'home',
                'team'     => 'Spain',
                'player'   => 'L. Yamal',
                'minute'   => 10,
                'assist'   => '',
                'detail'   => 'Goal',
                'source'   => 'Manual verification',
            ],
            [
                'teamSide' => 'home',
                'team'     => 'Spain',
                'player'   => 'M. Oyarzabal',
                'minute'   => 21,
                'assist'   => '',
                'detail'   => 'Goal',
                'source'   => 'Manual verification',
            ],
            [
                'teamSide' => 'home',
                'team'     => 'Spain',
                'player'   => 'M. Oyarzabal',
                'minute'   => 24,
                'assist'   => '',
                'detail'   => 'Goal',
                'source'   => 'Manual verification',
            ],
            [
                'teamSide' => 'home',
                'team'     => 'Spain',
                'player'   => 'H. Al-Tambakti',
                'minute'   => 49,
                'assist'   => '',
                'detail'   => 'Own Goal',
                'source'   => 'Manual verification',
            ],
        ];

        return $match;
    }, $matches);
}

function compactTeamRef(array $team): array
{
    return [
        'id'        => $team['id']        ?? null,
        'name'      => $team['name']      ?? '',
        'shortName' => $team['shortName'] ?? '',
        'tla'       => $team['tla']       ?? '',
        'crest'     => $team['crest']     ?? '',
    ];
}

function compactPlayer(array $player): array
{
    return [
        'id'          => $player['id']          ?? null,
        'name'        => $player['name']        ?? '',
        'firstName'   => $player['firstName']   ?? '',
        'lastName'    => $player['lastName']    ?? '',
        'position'    => $player['position']    ?? '',
        'dateOfBirth' => $player['dateOfBirth'] ?? '',
        'nationality' => $player['nationality'] ?? '',
        'shirtNumber' => $player['shirtNumber'] ?? null,
    ];
}

function compactTeam(array $team): array
{
    $area = is_array($team['area'] ?? null) ? $team['area'] : [];
    $coach = is_array($team['coach'] ?? null) ? $team['coach'] : [];
    $squad = is_array($team['squad'] ?? null) ? $team['squad'] : [];

    return [
        'id'         => $team['id']        ?? null,
        'name'       => $team['name']      ?? '',
        'shortName'  => $team['shortName'] ?? '',
        'tla'        => $team['tla']       ?? '',
        'crest'      => $team['crest']     ?? '',
        'area'       => [
            'id'   => $area['id']   ?? null,
            'name' => $area['name'] ?? '',
            'code' => $area['code'] ?? '',
            'flag' => $area['flag'] ?? '',
        ],
        'coach'      => [
            'name'      => $coach['name']      ?? '',
            'firstName' => $coach['firstName'] ?? '',
            'lastName'  => $coach['lastName']  ?? '',
        ],
        'squad'      => array_map('compactPlayer', $squad),
        'squadCount' => count($squad),
    ];
}

function compactMatch(array $match): array
{
    $payload = [
        'id'          => $match['id']          ?? null,
        'utcDate'     => $match['utcDate']     ?? '',
        'status'      => $match['status']      ?? '',
        'matchday'    => $match['matchday']    ?? null,
        'stage'       => $match['stage']       ?? '',
        'group'       => $match['group']       ?? '',
        'lastUpdated' => $match['lastUpdated'] ?? '',
        'homeTeam'    => compactTeamRef(is_array($match['homeTeam'] ?? null) ? $match['homeTeam'] : []),
        'awayTeam'    => compactTeamRef(is_array($match['awayTeam'] ?? null) ? $match['awayTeam'] : []),
        'score'       => is_array($match['score'] ?? null) ? $match['score'] : [],
        'scorers'     => is_array($match['scorers'] ?? null) ? $match['scorers'] : [],
        'cards'       => is_array($match['cards'] ?? null) ? $match['cards'] : [],
        'highlights'  => is_array($match['highlights'] ?? null) ? $match['highlights'] : [],
    ];

    foreach (['liveScore', 'liveStatus', 'venue'] as $field) {
        if (array_key_exists($field, $match)) {
            $payload[$field] = $match[$field];
        }
    }

    return $payload;
}

function compactStanding(array $standing): array
{
    $table = is_array($standing['table'] ?? null) ? $standing['table'] : [];
    $standing['table'] = array_map(static function (array $row): array {
        return [
            'position'       => $row['position']       ?? null,
            'team'           => compactTeamRef(is_array($row['team'] ?? null) ? $row['team'] : []),
            'playedGames'    => $row['playedGames']    ?? 0,
            'form'           => $row['form']           ?? null,
            'won'            => $row['won']            ?? 0,
            'draw'           => $row['draw']           ?? 0,
            'lost'           => $row['lost']           ?? 0,
            'points'         => $row['points']         ?? 0,
            'goalsFor'       => $row['goalsFor']       ?? 0,
            'goalsAgainst'   => $row['goalsAgainst']   ?? 0,
            'goalDifference' => $row['goalDifference'] ?? 0,
        ];
    }, $table);

    return [
        'stage' => $standing['stage'] ?? '',
        'type'  => $standing['type']  ?? '',
        'group' => $standing['group'] ?? '',
        'table' => $standing['table'],
    ];
}

function compactNewsArticle(array $article): array
{
    return [
        'title'  => $article['title']  ?? '',
        'link'   => $article['link']   ?? '#',
        'source' => $article['source'] ?? '',
        'date'   => $article['date']   ?? gmdate('c'),
    ];
}

$forceRefresh = (string) ($_GET['refresh'] ?? '') === '1';
$liveRefresh = (string) ($_GET['live'] ?? '') === '1';

if (!$forceRefresh && !$liveRefresh) {
    $cachedPayload = readDashboardPayloadCache();
    if ($cachedPayload !== null) {
        jsonResponse($cachedPayload);
    }
}

$teams     = footballDataGet('/competitions/' . COMPETITION_CODE . '/teams', $forceRefresh && !$liveRefresh);
$matches   = footballDataGet('/competitions/' . COMPETITION_CODE . '/matches', $forceRefresh || $liveRefresh);
$standings = footballDataGet('/competitions/' . COMPETITION_CODE . '/standings', $forceRefresh && !$liveRefresh);

// Erreur fatale uniquement si les 3 appels ont échoué ET qu'il n'y a aucun cache
$hasHardError = !$teams['ok'] && !$matches['ok'] && !$standings['ok']
             && !$teams['cached'] && !$matches['cached'] && !$standings['cached'];

if ($hasHardError) {
    jsonResponse([
        'ok'      => false,
        'message' => "Impossible de joindre l'API principale et aucun cache disponible.",
    ], 502);
}

$matchList = is_array($matches['data']['matches'] ?? null) ? $matches['data']['matches'] : [];
$matchList = enrichMatchesWithDetails($matchList, $liveRefresh);
$matchList = applyKnownMatchCorrections($matchList);
$teamList = is_array($teams['data']['teams'] ?? null) ? $teams['data']['teams'] : [];
$standingList = is_array($standings['data']['standings'] ?? null) ? $standings['data']['standings'] : [];
$newsList = fetchNews('global');
$watchedNewsList = fetchNews('watched');

// ─────────────────────────────────────────────────────────────────────────────
// RÉPONSE FINALE
// On renvoie un objet JSON unifié que le JS lira en une seule requête fetch().
// ─────────────────────────────────────────────────────────────────────────────
$payload = [
    'ok'              => true,
    'generatedAt'     => gmdate('c'),       // Timestamp de génération (ISO 8601 UTC)
    'cacheTtlSeconds' => $liveRefresh ? 0 : CACHE_TTL_SECONDS,
    'liveNoCache'     => $liveRefresh,
    'newsCacheTtlSeconds' => NEWS_CACHE_TTL_SECONDS,
    'teams'           => array_map('compactTeam', $teamList),
    'matches'         => array_map('compactMatch', $matchList),
    'standings'       => array_map('compactStanding', $standingList),
    'news'            => array_map('compactNewsArticle', $newsList),
    'watchedNews'     => array_map('compactNewsArticle', $watchedNewsList),
];

if (!$liveRefresh) {
    writeDashboardPayloadCache($payload);
}
jsonResponse($payload);
