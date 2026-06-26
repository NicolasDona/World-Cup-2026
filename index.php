<?php
declare(strict_types=1);

define('WORLD_CUP_APP', true);

$app = require __DIR__ . '/config/app.php';
$assetVersions = $app['asset_versions'];
$frontVersion = $app['front_version'];

require __DIR__ . '/partials/head.php';
?>
  <!-- ═══════════════════════════════════════════════════════════════════════
      HEADER HERO — bande d'entrée du site
      Contient la nav, le strip info tournoi, la grille hero principale
      et les deux cartes "prochain match" + "pays suivis"
      ═══════════════════════════════════════════════════════════════════════ -->
  <header class="hero" id="top">

    <!-- ── Barre de navigation ────────────────────────────────────────────── -->
    <nav class="topbar" aria-label="Navigation principale">

      <!-- Logo / marque -->
      <a class="brand" href="#top" data-scroll-top aria-label="Retour à l'accueil">
        <span class="brand-mark" aria-hidden="true">
          <svg class="brand-trophy" viewBox="0 0 64 64" focusable="false">
            <defs>
              <linearGradient id="brandTrophyGold" x1="14" x2="48" y1="6" y2="54" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#fff1a8"/>
                <stop offset=".33" stop-color="#f2c247"/>
                <stop offset=".68" stop-color="#c38420"/>
                <stop offset="1" stop-color="#ffe28a"/>
              </linearGradient>
              <linearGradient id="brandTrophyShadow" x1="20" x2="42" y1="8" y2="56" gradientUnits="userSpaceOnUse">
                <stop offset="0" stop-color="#805319"/>
                <stop offset="1" stop-color="#f8d66b"/>
              </linearGradient>
              <radialGradient id="brandTrophyGlow" cx="50%" cy="28%" r="62%">
                <stop offset="0" stop-color="#fff7c2" stop-opacity=".9"/>
                <stop offset=".58" stop-color="#f0c040" stop-opacity=".22"/>
                <stop offset="1" stop-color="#0ee8b8" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <ellipse class="trophy-aura" cx="32" cy="29" rx="23" ry="25" fill="url(#brandTrophyGlow)"/>
            <path class="trophy-handle" fill="url(#brandTrophyGold)" d="M20.2 15.2H10.6c.3 10.5 5.7 18 14 20.1l1.6-5.1c-5.4-1.5-8.8-5.5-9.9-10.9h4.2l-.3-4.1Z"/>
            <path class="trophy-handle" fill="url(#brandTrophyGold)" d="M43.8 15.2h9.6c-.3 10.5-5.7 18-14 20.1l-1.6-5.1c5.4-1.5 8.8-5.5 9.9-10.9h-4.2l.3-4.1Z"/>
            <path class="trophy-cup" fill="url(#brandTrophyGold)" d="M19.5 9.5h25c-.4 16-4.2 27-12.5 27S19.9 25.5 19.5 9.5Z"/>
            <path class="trophy-inner-shadow" fill="url(#brandTrophyShadow)" d="M37.8 12.6c-.5 12.9-3 20-7 22.5 7.2-.8 10.4-10.3 10.9-22.5h-3.9Z"/>
            <path class="trophy-shine" fill="#ffffff" d="M24.1 12.8c-.1 8.8 1.4 15.3 4.2 18.8-5.1-2.5-7.3-9.4-7.7-18.8h3.5Z"/>
            <path class="trophy-neck" fill="url(#brandTrophyGold)" d="M28 36h8l1.4 8H26.6L28 36Z"/>
            <path class="trophy-plinth" fill="url(#brandTrophyGold)" d="M22.5 44h19l2.6 5.4H19.9L22.5 44Z"/>
            <path class="trophy-base" fill="url(#brandTrophyGold)" d="M16.8 49.2h30.4l3.4 6.3H13.4l3.4-6.3Z"/>
            <path class="trophy-edge" d="M20.8 9.5h22.4"/>
            <path class="trophy-star" d="M32 15.4l1.7 3.4 3.8.6-2.7 2.7.6 3.8-3.4-1.8-3.4 1.8.6-3.8-2.7-2.7 3.8-.6 1.7-3.4Z"/>
          </svg>
        </span>
        <span class="brand-label">
          <strong>Coupe du Monde</strong>
          <em>2026 · Live</em>
        </span>
      </a>

      <!-- Liens de navigation vers les sections de la page -->
      <div class="navlinks">
        <a href="#groupes" data-view="groups">Groupes</a>
        <a href="#equipes" data-view="teams">Équipes</a>
        <a href="#matchs" data-view="matches">Matchs</a>
        <a href="#phase-finale" data-view="final-stage">Phase finale</a>
        <button class="mode-toggle" type="button" data-view-toggle>Mode complet</button>
      </div>

      <form class="site-search" id="siteSearchForm" role="search" aria-label="Recherche sur le site">
        <input id="siteSearch" type="search" placeholder="Rechercher" autocomplete="off">
        <button type="submit" aria-label="Lancer la recherche">⌕</button>
      </form>

      <!-- Bouton actualiser + indicateur de statut -->
      <div class="topbar-right">
        <button class="perf-toggle" type="button" data-perf-toggle aria-pressed="false">Normal</button>
        <button id="refreshBtn" class="refresh-btn" type="button" aria-label="Actualiser les données">
          <span class="refresh-icon" aria-hidden="true">↻</span>
        </button>
        <span id="status" class="status-pill" aria-live="polite">Chargement...</span>
      </div>
    </nav>

    <!-- ── Bandeau de résumé du tournoi ──────────────────────────────────── -->
    <div class="tournament-strip" aria-label="Chiffres clés du tournoi">
      <button type="button" data-strip-info="teams">48 nations</button>
      <button type="button" data-strip-info="matches">Les affiches</button>
      <button type="button" data-strip-info="hosts">Terres hôtes</button>
      <button type="button" class="strip-live" data-strip-info="live">⦿ Fil du tournoi</button>
    </div>

    <!-- ── Grille hero : titre à gauche, widgets à droite ────────────────── -->
    <section class="hero-grid">

      <!-- Colonne gauche : accroche textuelle -->
      <div class="hero-copy">
        <p class="eyebrow">Canada · Mexique · États-Unis</p>
        <h1>Coupe<br>du Monde<br><span class="h1-year">2026</span></h1>
        <p class="beta-status">Version finale évolutive</p>
        <p class="lead">Un espace fan pour suivre la Coupe du Monde 2026 au bon rythme : les matchs qui arrivent, les groupes, les équipes à suivre et les histoires qui font vivre le tournoi.</p>
        <div class="hero-actions" aria-label="Actions principales">
          <a href="#matchs" data-view="matches">Voir le calendrier</a>
          <a href="#groupes" data-view="groups">Classements</a>
          <a href="#phase-finale" data-view="final-stage">Phase finale</a>
        </div>
        <div class="hero-note">
          <span>Focus fan</span>
          <strong>France · Congo · Portugal</strong>
        </div>
      </div>

      <!-- Colonne droite : widgets prochain match + pays suivis -->
      <div class="hero-rail">

        <!-- Widget prochain match — rempli par renderNextMatch() en JS -->
        <aside class="next-match" aria-label="Prochain match">
          <p class="eyebrow">⏱ Prochain match</p>
          <div id="nextMatch" class="next-match-content">
            <div class="next-placeholder">Chargement du prochain match...</div>
          </div>
        </aside>

        <!-- Widget pays suivis (France, Portugal, Congo) — rempli par renderWatchList() -->
        <aside class="spotlight" aria-label="Pays suivis">
          <p class="eyebrow">★ Pays à suivre</p>
          <div class="watch-list" id="watchList"></div>
        </aside>

        <aside class="recruit-brief" aria-label="Journalistes sur le terrain">
          <span>World Cup 2026</span>
          <strong>Nos journalistes sur le terrain</strong>
          <div class="recruit-links">
            <a href="../Tibor_Kovak/">Tibor K</a>
            <a href="../Pedro_gros%20chibro/">Pedro Gros Chibro</a>
            <a href="../Roro_le_Manchot/">Roro le Manchot</a>
            <a href="../Motard_Rose/">Motard Rose</a>
            <a href="../Maxime/">Maxime</a>
            <a href="../Freddy/">Freddy</a>
            <a href="../Thierry/">Thierry</a>
          </div>
        </aside>
      </div>
    </section>
  </header>

  <section class="worldcup-ticker" aria-label="Messages publics en direct">
    <form id="worldcupTickerForm" class="worldcup-ticker-form" autocomplete="off">
      <label for="worldcupTickerInput">Message public</label>
      <input id="worldcupTickerInput" name="message" type="text" maxlength="100" placeholder="Message fan...">
      <span id="worldcupTickerCount" class="worldcup-ticker-count">0 / 100</span>
      <button id="worldcupTickerSend" type="submit">Envoyer</button>
    </form>
    <div class="worldcup-ticker-track" aria-live="polite">
      <div id="worldcupTickerText" class="worldcup-ticker-content">Chargement...</div>
    </div>
    <div id="worldcupTickerFeedback" class="worldcup-ticker-feedback" aria-live="polite"></div>
  </section>

  <!-- ═══════════════════════════════════════════════════════════════════════
       MAIN — contenu principal
       ═══════════════════════════════════════════════════════════════════════ -->
  <main class="container">

    <section id="initialLoading" class="initial-loading" aria-live="polite">
      <div class="initial-loading-copy">
        <span>Connexion aux sources</span>
        <strong>Preparation du tableau de bord...</strong>
        <p>Les matchs, groupes, scores et actus arrivent. La page reste disponible pendant la recuperation.</p>
      </div>
      <div class="initial-loading-steps" aria-hidden="true">
        <i></i>
        <i></i>
        <i></i>
      </div>
      <button class="initial-loading-retry" type="button" data-initial-refresh hidden>Relancer</button>
    </section>

    <!-- ── Compteurs statistiques en haut de page ────────────────────────── -->
    <section class="stats" aria-label="Statistiques du tournoi">
      <a class="stat-card" href="#equipes" data-view="teams">
        <span id="teamCount">0</span>
        <small>équipes</small>
      </a>
      <a class="stat-card" href="#matchs" data-view="matches">
        <span id="matchCount">0</span>
        <small>matchs</small>
      </a>
      <a class="stat-card" href="#matchs" data-view="matches">
        <span id="playedCount">0</span>
        <small>joués</small>
      </a>
      <a class="stat-card" href="#matchs" data-view="matches">
        <span id="nextCount">0</span>
        <small>à venir</small>
      </a>
    </section>

    <section id="modeNotice" class="mode-notice" aria-live="polite">
      <div class="mode-notice-copy">
        <span id="modeNoticeLabel">Mode filtré actif</span>
        <p id="modeNoticeText">Cette vue met en avant les équipes suivies, les prochains matchs et les moments importants. Passez en mode complet pour explorer tout le tournoi.</p>
      </div>
      <button class="mode-notice-action" type="button" data-view-toggle>Voir le tournoi complet</button>
    </section>

    <section id="prochain-match" class="panel live-match-panel" aria-label="Live du match">
      <div class="section-title">
        <div>
          <p class="eyebrow">Live</p>
          <h2 id="liveMatchTitle">Live du match</h2>
        </div>
      </div>
      <div id="liveMatch" class="live-match" aria-live="polite"></div>
    </section>

    <section class="matchday-grid" aria-label="Jour de match">
      <button class="collapse-toggle matchday-grid-toggle" type="button" data-matchday-toggle aria-expanded="true" aria-label="Masquer les blocs du jour" title="Masquer les blocs du jour">
        <span aria-hidden="true"></span>
      </button>
      <section class="panel matchday-panel" aria-label="Résultats du jour">
        <div class="section-title">
          <div>
            <p class="eyebrow">Scores</p>
            <h2>Résultats</h2>
          </div>
          <p class="hint" id="todayResultsHint">Scores validés par la source.</p>
        </div>
        <div id="todayResults" class="daily-match-list"></div>
      </section>

      <section class="panel matchday-panel tournament-stats-panel" aria-label="Stats des équipes les plus efficaces">
        <div class="section-title">
          <div>
            <p class="eyebrow">Tournoi</p>
            <div class="section-title-row">
              <h2>Équipes efficaces</h2>
              <button class="help-pill" type="button" data-efficiency-help aria-label="Comment est calculée la note des équipes efficaces">?</button>
            </div>
            <label class="efficiency-mode">
              <span class="sr-only">Comparer les équipes efficaces</span>
              <select id="efficiencyMode" aria-label="Comparer les équipes efficaces"></select>
            </label>
          </div>
        </div>
        <div id="tournamentStats" class="tournament-stats"></div>
      </section>

      <section class="panel matchday-panel top-scorers-panel" aria-label="Classement des buteurs">
        <div class="section-title">
          <div>
            <p class="eyebrow">Buteurs</p>
            <h2>Classement</h2>
          </div>
        </div>
        <div id="topScorers" class="top-scorers"></div>
      </section>
    </section>

    <!-- ── Section Groupes / Classements ─────────────────────────────────── -->
    <section class="panel watched-next-panel" aria-label="Prochain match des équipes suivies">
      <div class="section-title">
        <div>
          <p class="eyebrow">Nos équipes</p>
          <h2 id="watchedNextTitle">Prochain rendez-vous</h2>
        </div>
        <p id="watchedNextContext" class="hint watched-next-countries">France · Congo · Portugal</p>
      </div>
      <div id="watchedNextMatch" class="watched-next"></div>
    </section>

    <section class="panel news-panel" aria-label="Actualités Coupe du Monde 2026">
      <div class="section-title">
        <div>
          <p class="eyebrow">À lire</p>
          <h2>Actualités</h2>
        </div>
        <p class="hint" id="newsHint">Derniers articles autour de la Coupe du Monde 2026.</p>
      </div>
      <div id="newsLinks" class="news-links"></div>
    </section>

    <section id="groupes" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Classements</p>
          <h2 id="groupsTitle">Groupes suivis</h2>
        </div>
        <p id="groupsHint" class="hint">France · Congo · Portugal</p>
      </div>
      <!-- Grille des cartes de groupe, générée par renderGroups() -->
      <div id="groups" class="groups"></div>
    </section>

    <!-- ── Section Équipes ───────────────────────────────────────────────── -->
    <section id="equipes" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Participants</p>
          <h2 id="teamsTitle">Équipes suivies</h2>
        </div>
        <!-- Champ de recherche filtrant la grille d'équipes en temps réel -->
        <label class="search">
          <span class="sr-only">Rechercher une équipe</span>
          <input id="teamSearch" type="search" placeholder="🔍  Nom du pays…" autocomplete="off">
        </label>
      </div>
      <!-- Grille des cartes équipe, générée par renderTeams() -->
      <div id="teams" class="team-grid"></div>
    </section>

    <!-- ── Section Matchs / Calendrier ───────────────────────────────────── -->
    <section id="matchs" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Calendrier & résultats</p>
          <h2>Matchs</h2>
        </div>
        <!-- Champ de recherche filtrant les matchs en temps réel -->
        <label class="search">
          <span class="sr-only">Filtrer les matchs</span>
          <input id="matchSearch" type="search" placeholder="🔍  France, Portugal, Congo…" autocomplete="off">
        </label>
      </div>
      <!-- Liste des matchs, générée par renderMatches() -->
      <div id="matches" class="match-list"></div>
    </section>

    <section id="phase-finale" class="panel final-stage-panel" aria-label="Tableau de la phase finale">
      <div class="section-title">
        <div>
          <p class="eyebrow">Tableau</p>
          <h2>Phase finale</h2>
        </div>
        <p class="hint">Seizièmes, huitièmes, quarts, demi-finales et finale.</p>
      </div>
      <div id="finalStageBracket" class="final-stage-bracket" aria-live="polite"></div>
    </section>

  </main>

  <!-- ── Pied de page ───────────────────────────────────────────────────── -->

<?php require __DIR__ . '/partials/footer.php'; ?>

  <!-- ── Bouton retour vers le haut (apparaît après 680px de scroll) ──────── -->
  <nav id="quickNav" class="quick-nav" aria-label="Navigation rapide">
    <a href="#top" data-view="home" aria-label="Accueil">Accueil</a>
    <a href="#groupes" data-view="groups">Groupes</a>
    <a href="#equipes" data-view="teams">Équipes</a>
    <a href="#matchs" data-view="matches">Matchs</a>
    <a href="#phase-finale" data-view="final-stage">Finale</a>
    <button class="mode-toggle" type="button" data-view-toggle>Mode complet</button>
    <button class="perf-toggle" type="button" data-perf-toggle aria-pressed="false">Normal</button>
  </nav>

  <a id="backToTop" class="back-to-top" href="#top" data-scroll-top aria-label="Retour vers le haut">↑</a>

  <!-- ═══════════════════════════════════════════════════════════════════════
       MODALE FICHE ÉQUIPE
       Affichée par openTeamModal() au clic sur n'importe quelle carte équipe.
       hidden par défaut — géré via l'attribut HTML hidden + JS.
       ═══════════════════════════════════════════════════════════════════════ -->
  <div id="teamModal" class="team-modal" hidden>
    <!-- Fond semi-transparent cliquable pour fermer la modale -->
    <div class="team-modal-backdrop" data-close-team></div>

    <!-- Panneau de contenu -->
    <section class="team-modal-panel" role="dialog" aria-modal="true" aria-labelledby="teamModalTitle">
      <button class="modal-close" type="button" data-close-team aria-label="Fermer la fiche équipe">×</button>
      <!-- Contenu injecté dynamiquement par openTeamModal() -->
      <div id="teamModalContent"></div>
    </section>
  </div>

  <div id="infoModal" class="team-modal" hidden>
    <div class="team-modal-backdrop" data-close-info></div>
    <section class="team-modal-panel info-modal-panel" role="dialog" aria-modal="true" aria-labelledby="infoModalTitle">
      <button class="modal-close" type="button" data-close-info aria-label="Fermer">×</button>
      <div id="infoModalContent"></div>
    </section>
  </div>

  <div id="matchModal" class="team-modal" hidden>
    <div class="team-modal-backdrop" data-close-match></div>
    <section class="team-modal-panel match-modal-panel" role="dialog" aria-modal="true" aria-labelledby="matchModalTitle">
      <button class="modal-close" type="button" data-close-match aria-label="Fermer la fiche match">&times;</button>
      <div id="matchModalContent"></div>
    </section>
  </div>

<?php require __DIR__ . '/partials/scripts.php'; ?>
