<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function manualEventsExpectedToken(): string
{
    return hash_hmac('sha256', 'worldcup-manual-events', THESPORTSDB_API_KEY);
}

function manualEventsStoreFile(): string
{
    return rtrim(CACHE_DIR, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'worldcup_manual_events.json';
}

function jsonOut(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    jsonOut(['ok' => false, 'message' => 'Méthode non autorisée.'], 405);
}

$auth = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
$token = '';
if (preg_match('/^Bearer\s+(.+)$/i', $auth, $match)) {
    $token = trim($match[1]);
}
if ($token === '') {
    $token = trim((string) ($_POST['token'] ?? $_GET['token'] ?? ''));
}

if ($token === '' || !hash_equals(manualEventsExpectedToken(), $token)) {
    jsonOut(['ok' => false, 'message' => 'Accès refusé.'], 403);
}

$raw = (string) file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    jsonOut(['ok' => false, 'message' => 'JSON invalide.'], 400);
}

$incoming = $payload['events'] ?? null;
if (!is_array($incoming)) {
    $incoming = [$payload];
}

$allowedKinds = ['goal', 'card'];
$events = [];
foreach ($incoming as $event) {
    if (!is_array($event)) {
        continue;
    }

    $matchId = preg_replace('/[^0-9A-Za-z_\-]/', '', (string) ($event['matchId'] ?? ''));
    $kind = strtolower((string) ($event['kind'] ?? ''));
    $player = trim((string) ($event['player'] ?? ''));
    $teamSide = strtolower((string) ($event['teamSide'] ?? ''));
    $type = strtolower((string) ($event['type'] ?? ''));

    if ($matchId === '' || !in_array($kind, $allowedKinds, true) || $player === '') {
        continue;
    }
    if (!in_array($teamSide, ['home', 'away'], true)) {
        $teamSide = '';
    }
    if ($kind === 'card' && !in_array($type, ['yellow', 'red'], true)) {
        $type = 'yellow';
    }

    $minute = $event['minute'] ?? null;
    $minute = is_numeric($minute) ? (int) $minute : null;

    $events[] = [
        'matchId'   => $matchId,
        'kind'      => $kind,
        'type'      => $kind === 'card' ? $type : '',
        'teamSide'  => $teamSide,
        'team'      => trim((string) ($event['team'] ?? '')),
        'player'    => $player,
        'minute'    => $minute,
        'assist'    => trim((string) ($event['assist'] ?? '')),
        'detail'    => trim((string) ($event['detail'] ?? ($kind === 'card' ? 'Yellow Card' : 'Goal'))),
        'source'    => trim((string) ($event['source'] ?? 'Eurosport FR')),
        'providerId'=> trim((string) ($event['providerId'] ?? '')),
        'updatedAt' => gmdate('c'),
    ];
}

if ($events === []) {
    jsonOut(['ok' => false, 'message' => 'Aucun événement valide.'], 400);
}

$file = manualEventsStoreFile();
$dir = dirname($file);
if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
    jsonOut(['ok' => false, 'message' => 'Stockage indisponible.'], 500);
}

$current = [];
if (is_file($file)) {
    $decoded = json_decode((string) file_get_contents($file), true);
    if (is_array($decoded['events'] ?? null)) {
        $current = $decoded['events'];
    }
}

$byKey = [];
foreach ($current as $event) {
    if (!is_array($event)) {
        continue;
    }
    $key = implode('|', [
        $event['matchId'] ?? '',
        $event['kind'] ?? '',
        $event['type'] ?? '',
        $event['teamSide'] ?? '',
        $event['minute'] ?? '',
        mb_strtolower((string) ($event['player'] ?? ''), 'UTF-8'),
    ]);
    $byKey[$key] = $event;
}
foreach ($events as $event) {
    $key = implode('|', [
        $event['matchId'],
        $event['kind'],
        $event['type'],
        $event['teamSide'],
        $event['minute'] ?? '',
        mb_strtolower($event['player'], 'UTF-8'),
    ]);
    $byKey[$key] = $event;
}

$stored = array_values($byKey);
usort($stored, static function (array $a, array $b): int {
    return strcmp((string) ($a['matchId'] ?? ''), (string) ($b['matchId'] ?? ''))
        ?: ((int) ($a['minute'] ?? 9999) <=> (int) ($b['minute'] ?? 9999));
});

if (@file_put_contents($file, json_encode(['events' => $stored, 'updatedAt' => gmdate('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), LOCK_EX) === false) {
    jsonOut(['ok' => false, 'message' => 'Écriture impossible.'], 500);
}

jsonOut(['ok' => true, 'accepted' => count($events), 'stored' => count($stored)]);