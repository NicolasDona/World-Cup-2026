// ═════════════════════════════════════════════════════════════════════════════
// APP.JS — Coupe du Monde 2026 Live
// ─────────────────────────────────────────────────────────────────────────────
// Script principal : récupère les données depuis api/data.php (proxy PHP),
// calcule les équipes éliminées, et met à jour l'interface toutes les 60s.
//
// Architecture :
//  - Un seul objet `state` contient toutes les données vivantes
//  - Les fonctions render*() lisent `state` et réécrivent le DOM
//  - Pas de framework, pas de dépendances — Vanilla JS pur
//  - XSS protégé via escapeHtml() sur toutes les données dynamiques
// ═════════════════════════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

/** URL du proxy PHP (jamais directement les APIs externes) */
const API_URL = 'api/data.php';

/** Intervalle de rafraîchissement automatique en ms (60 secondes) */
const REFRESH_MS = 60_000;

/** Rafraîchissement sans cache pendant un match live. */
const LIVE_REFRESH_MS = 15_000;

/** Fenetre de secours pour afficher un match TIMED comme live si l'API tarde. */
const LIVE_INFERENCE_WINDOW_MS = 135 * 60_000;

/**
 * Équipes à mettre en avant : bordures dorées, classées en premier.
 * Plusieurs variantes de nom pour la robustesse des comparaisons.
 */
const WATCHED = ['France', 'Portugal', 'Congo', 'Congo DR', 'DR Congo', 'Democratic Republic of the Congo'];

const FIFA_RANKINGS_2026 = {
  'argentina': 1,
  'spain': 2,
  'france': 3,
  'england': 4,
  'portugal': 5,
  'brazil': 6,
  'morocco': 7,
  'netherlands': 8,
  'belgium': 9,
  'germany': 10,
  'croatia': 11,
  'colombia': 13,
  'mexico': 14,
  'senegal': 15,
  'uruguay': 16,
  'united states': 17,
  'usa': 17,
  'japan': 18,
  'switzerland': 19,
  'iran': 20,
  'turkey': 22,
  'turkiye': 22,
  'ecuador': 23,
  'austria': 24,
  'south korea': 25,
  'korea republic': 25,
  'australia': 27,
  'algeria': 28,
  'egypt': 29,
  'canada': 30,
  'norway': 31,
  'ivory coast': 33,
  'cote d ivoire': 33,
  'panama': 34,
  'sweden': 38,
  'czech republic': 40,
  'czechia': 40,
  'paraguay': 41,
  'scotland': 42,
  'tunisia': 45,
  'dr congo': 46,
  'congo dr': 46,
  'democratic republic of the congo': 46,
  'uzbekistan': 50,
  'qatar': 56,
  'iraq': 57,
  'south africa': 60,
  'saudi arabia': 61,
  'jordan': 63,
  'bosnia and herzegovina': 64,
  'bosnia-herzegovina': 64,
  'bosnia-h': 64,
  'cape verde': 67,
  'cape verde islands': 67,
  'cabo verde': 67,
  'ghana': 73,
  'curacao': 82,
  'curaçao': 82,
  'haiti': 83,
  'new zealand': 85,
};

// ─────────────────────────────────────────────────────────────────────────────
// RÉFÉRENCES DOM
// Toutes les queries querySelector sont faites une seule fois au démarrage.
// ─────────────────────────────────────────────────────────────────────────────
const els = {
  status:         document.querySelector('#status'),
  refreshBtn:     document.querySelector('#refreshBtn'),
  teamCount:      document.querySelector('#teamCount'),
  matchCount:     document.querySelector('#matchCount'),
  playedCount:    document.querySelector('#playedCount'),
  nextCount:      document.querySelector('#nextCount'),
  navLinks:       document.querySelectorAll('[data-view]'),
  viewToggles:    document.querySelectorAll('[data-view-toggle]'),
  perfToggles:    document.querySelectorAll('[data-perf-toggle]'),
  modeNotice:     document.querySelector('#modeNotice'),
  modeNoticeLabel: document.querySelector('#modeNoticeLabel'),
  modeNoticeText: document.querySelector('#modeNoticeText'),
  groupsTitle:    document.querySelector('#groupsTitle'),
  groupsHint:     document.querySelector('#groupsHint'),
  teamsTitle:     document.querySelector('#teamsTitle'),
  groups:         document.querySelector('#groups'),
  matches:        document.querySelector('#matches'),
  teams:          document.querySelector('#teams'),
  newsHint:       document.querySelector('#newsHint'),
  newsLinks:      document.querySelector('#newsLinks'),
  watchList:      document.querySelector('#watchList'),
  nextMatch:      document.querySelector('#nextMatch'),
  watchedNextMatch: document.querySelector('#watchedNextMatch'),
  liveMatchTitle: document.querySelector('#liveMatchTitle'),
  liveMatch:      document.querySelector('#liveMatch'),
  todayResults:   document.querySelector('#todayResults'),
  todayResultsHint: document.querySelector('#todayResultsHint'),
  tournamentStats: document.querySelector('#tournamentStats'),
  topScorers:     document.querySelector('#topScorers'),
  finalStageBracket: document.querySelector('#finalStageBracket'),
  quickNav:       document.querySelector('#quickNav'),
  backToTop:      document.querySelector('#backToTop'),
  teamModal:      document.querySelector('#teamModal'),
  teamModalContent: document.querySelector('#teamModalContent'),
  infoModal:      document.querySelector('#infoModal'),
  infoModalContent: document.querySelector('#infoModalContent'),
  matchModal:     document.querySelector('#matchModal'),
  matchModalContent: document.querySelector('#matchModalContent'),
  siteSearchForm: document.querySelector('#siteSearchForm'),
  siteSearch:     document.querySelector('#siteSearch'),
  matchSearch:    document.querySelector('#matchSearch'),
  teamSearch:     document.querySelector('#teamSearch'),
  tickerForm:     document.querySelector('#worldcupTickerForm'),
  tickerInput:    document.querySelector('#worldcupTickerInput'),
  tickerCount:    document.querySelector('#worldcupTickerCount'),
  tickerSend:     document.querySelector('#worldcupTickerSend'),
  tickerText:     document.querySelector('#worldcupTickerText'),
  tickerFeedback: document.querySelector('#worldcupTickerFeedback'),
};

// ─────────────────────────────────────────────────────────────────────────────
// ÉTAT GLOBAL DE L'APPLICATION
// Mis à jour à chaque loadData(), lu par toutes les fonctions render*().
// ─────────────────────────────────────────────────────────────────────────────
let state = {
  teams:     [],   // Tableau d'objets équipe (football-data.org)
  matches:   [],   // Tableau d'objets match
  standings: [],   // Tableau de classements par groupe
  news:      [],   // Articles d'actualite normalises cote proxy PHP
  watchedNews: [], // Articles lies aux equipes suivies
  generatedAt: null,
  eliminated: [],  // Clés des équipes éliminées (calculées côté client)
  dashboardResultCount: 3,
};

/** UTC ISO du prochain match, utilisé pour le compte à rebours en temps réel */
let nextMatchUtc = null;
let watchedNextMatchUtc = null;
let hasLoadedData = false;
let liveRefreshInFlight = false;
const PERF_STORAGE_KEY = 'worldcup2026:performance-mode';
let performanceMode = 'hard';

function applyPerformanceMode(mode) {
  performanceMode = mode === 'light' ? 'light' : 'hard';
  document.documentElement.classList.toggle('perf-light', performanceMode === 'light');

  els.perfToggles.forEach(toggle => {
    const light = performanceMode === 'light';
    toggle.textContent = light ? 'Rapide' : 'Normal';
    toggle.setAttribute('aria-pressed', String(light));
    toggle.title = light ? 'Affichage allégé pour plus de fluidité' : 'Affichage normal avec effets visuels';
    toggle.setAttribute('aria-label', light ? 'Passer en affichage normal' : 'Passer en affichage rapide');
  });
}

try {
  applyPerformanceMode(localStorage.getItem(PERF_STORAGE_KEY) || 'hard');
} catch {
  applyPerformanceMode('hard');
}

/**
 * Nombre de matchs actuellement affichés dans la liste.
 * Augmente de MATCHES_STEP à chaque clic sur "Voir plus".
 * Remis à MATCHES_STEP lors d'une nouvelle recherche ou d'un refresh de données.
 */
const MATCHES_STEP = 6;
let matchesVisible = MATCHES_STEP;

const FINAL_STAGE_SLOTS = [
  ['N°74', 'Seizièmes', '29 juin · 22:30', '1E', '3e ABCDF', 'LAST_32', 30, 54],
  ['N°77', 'Seizièmes', '30 juin · 23:00', '1I', '3e CDFGH', 'LAST_32', 30, 136],
  ['N°73', 'Seizièmes', '28 juin · 21:00', '2A', '2B', 'LAST_32', 30, 218],
  ['N°75', 'Seizièmes', '30 juin · 03:00', '1F', '2C', 'LAST_32', 30, 300],
  ['N°83', 'Seizièmes', '3 juillet · 01:00', '2K', '2L', 'LAST_32', 30, 382],
  ['N°84', 'Seizièmes', '2 juillet · 21:00', '1H', '2J', 'LAST_32', 30, 464],
  ['N°81', 'Seizièmes', '2 juillet · 02:00', '1D', '3e BEFIJ', 'LAST_32', 30, 546],
  ['N°82', 'Seizièmes', '1 juillet · 22:00', '1G', '3e AEHIJ', 'LAST_32', 30, 628],
  ['N°89', 'Huitièmes', '4 juillet · 23:00', 'V74', 'V77', 'LAST_16', 165, 95],
  ['N°90', 'Huitièmes', '4 juillet · 19:00', 'V73', 'V75', 'LAST_16', 165, 259],
  ['N°93', 'Huitièmes', '6 juillet · 21:00', 'V83', 'V84', 'LAST_16', 165, 423],
  ['N°94', 'Huitièmes', '7 juillet · 02:00', 'V81', 'V82', 'LAST_16', 165, 587],
  ['N°97', 'Quarts', '9 juillet · 22:00', 'V89', 'V90', 'QUARTER_FINALS', 300, 177],
  ['N°98', 'Quarts', '10 juillet · 21:00', 'V93', 'V94', 'QUARTER_FINALS', 300, 505],
  ['N°101', 'Demi-finales', '14 juillet · 21:00', 'V97', 'V98', 'SEMI_FINALS', 435, 341],
  ['N°104', 'Finale', '19 juillet · 21:00', 'V101', 'V102', 'FINAL', 570, 300],
  ['N°103', '3e place', '18 juillet · 23:00', 'P101', 'P102', 'THIRD_PLACE', 570, 405],
  ['N°102', 'Demi-finales', '15 juillet · 21:00', 'V99', 'V100', 'SEMI_FINALS', 705, 341],
  ['N°99', 'Quarts', '11 juillet · 23:00', 'V91', 'V92', 'QUARTER_FINALS', 840, 177],
  ['N°100', 'Quarts', '12 juillet · 03:00', 'V95', 'V96', 'QUARTER_FINALS', 840, 505],
  ['N°91', 'Huitièmes', '5 juillet · 22:00', 'V76', 'V78', 'LAST_16', 975, 95],
  ['N°92', 'Huitièmes', '6 juillet · 02:00', 'V79', 'V80', 'LAST_16', 975, 259],
  ['N°95', 'Huitièmes', '7 juillet · 18:00', 'V86', 'V88', 'LAST_16', 975, 423],
  ['N°96', 'Huitièmes', '7 juillet · 22:00', 'V85', 'V87', 'LAST_16', 975, 587],
  ['N°76', 'Seizièmes', '29 juin · 19:00', '1C', '2F', 'LAST_32', 1110, 54],
  ['N°78', 'Seizièmes', '30 juin · 19:00', '2E', '2I', 'LAST_32', 1110, 136],
  ['N°79', 'Seizièmes', '1 juillet · 03:00', '1A', '3e CEFHI', 'LAST_32', 1110, 218],
  ['N°80', 'Seizièmes', '1 juillet · 18:00', '1L', '3e EHIJK', 'LAST_32', 1110, 300],
  ['N°86', 'Seizièmes', '4 juillet · 00:00', '1J', '2H', 'LAST_32', 1110, 382],
  ['N°88', 'Seizièmes', '3 juillet · 20:00', '2D', '2G', 'LAST_32', 1110, 464],
  ['N°85', 'Seizièmes', '3 juillet · 05:00', '1B', '3e EFGIJ', 'LAST_32', 1110, 546],
  ['N°87', 'Seizièmes', '4 juillet · 03:30', '1K', '3e DEIJL', 'LAST_32', 1110, 628],
].map(([matchNo, round, date, home, away, stage, x, y]) => ({ matchNo, round, date, home, away, stage, x, y }));

const FINAL_STAGE_HEADERS = [
  ['Seizièmes', 30],
  ['Huitièmes', 165],
  ['Quarts', 300],
  ['Demi-finales', 435],
  ['Finale', 570],
  ['Demi-finales', 705],
  ['Quarts', 840],
  ['Huitièmes', 975],
  ['Seizièmes', 1110],
].map(([label, x]) => ({ label, x }));
let activeView = 'home';
let easterBuffer = '';
const COLLAPSE_STORAGE_PREFIX = 'worldcup2026:collapsed:';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITAIRES PURS (sans effets de bord)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise une chaîne pour la comparaison insensible à la casse et aux accents.
 * Ex: "Côte d'Ivoire" → "cote d'ivoire"
 */
const norm = value =>
  String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Vérifie si un nom d'équipe est dans la liste des pays suivis.
 * Utilise une comparaison bidirectionnelle pour gérer les noms partiels.
 */
const isWatchedName = name =>
  WATCHED.some(w => norm(name).includes(norm(w)) || norm(w).includes(norm(name)));

/**
 * Échappe les caractères HTML dangereux pour éviter les injections XSS.
 * À utiliser sur TOUTE donnée provenant de l'API avant insertion dans le DOM.
 */
const escapeHtml = str =>
  String(str ?? '').replace(/[&<>'"]/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]
  ));

/**
 * Formate une date ISO 8601 en format local français lisible.
 * Ex: "2026-06-14T18:00:00Z" → "14 juin 2026 à 20:00"
 */
const fmtDate = iso => iso
  ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  : 'Date à venir';

function articleAgeLabel(iso) {
  if (!iso) return '';
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return '';

  const diffMs = Date.now() - timestamp;
  if (diffMs < -5 * 60 * 1000) return 'daté à venir';
  if (diffMs < 60 * 1000) return 'à l’instant';

  const minutes = Math.floor(diffMs / (60 * 1000));
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

function articleDateLine(iso) {
  if (!iso) return '';
  const published = fmtDate(iso);
  const age = articleAgeLabel(iso);
  return [published, age].filter(Boolean).join(' · ');
}

/** Ajoute un zéro devant les nombres < 10 (pour le compte à rebours) */
const fmtTime = value => String(value).padStart(2, '0');

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source externe';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LABELS LISIBLES — humanLabel()
// Convertit les codes API en français compréhensible.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transforme un code de phase (ex: QUARTER_FINALS) en label français.
 * @param {string} value  Code brut de l'API
 * @returns {string}      Label localisé
 */
function humanLabel(value) {
  if (!value) return '';
  const labels = {
    GROUP_STAGE:   'Phase de groupes',
    LAST_32:       'Seizièmes de finale',
    LAST_16:       'Huitièmes de finale',
    QUARTER_FINALS:'Quarts de finale',
    SEMI_FINALS:   'Demi-finales',
    THIRD_PLACE:   'Match pour la 3e place',
    FINAL:         'Finale',
  };
  if (labels[value]) return labels[value];

  // Groupes : GROUP_A → "Groupe A"
  const groupMatch = String(value).match(/^GROUP_([A-Z])$/);
  if (groupMatch) return `Groupe ${groupMatch[1]}`;

  // Fallback générique : SOME_CODE → "Some Code"
  return String(value).toLowerCase().split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

/**
 * Construit la ligne de méta-info d'un match (ex: "Phase de groupes · Groupe A").
 */
function matchMeta(match) {
  return [match.group, match.stage].map(humanLabel).filter(Boolean).join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS ÉQUIPE
// Les objets équipe dans l'API ont des structures légèrement différentes
// selon qu'ils viennent de /teams, /matches ou /standings. Ces helpers
// normalisent l'accès à ces données.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait toutes les clés identifiantes d'une équipe (id, name, shortName, tla)
 * sous forme normalisée, pour les comparaisons cross-endpoint.
 */
function teamKeys(team = {}) {
  return [team.id, team.name, team.shortName, team.tla].filter(Boolean).map(norm);
}

/**
 * Cherche l'objet équipe complet dans state.teams à partir d'un objet partiel.
 * Utile car les matchs ne contiennent que l'ID + nom, pas le blason ni le squad.
 */
function teamLookup(team = {}) {
  const keys = teamKeys(team);
  return state.teams.find(candidate => {
    const candidateKeys = teamKeys(candidate);
    return keys.some(key => candidateKeys.includes(key));
  }) || team; // fallback sur l'objet original si introuvable
}

/**
 * Clé canonique d'une équipe (id > tla > name > shortName), après lookup complet.
 * Utilisée pour les comparaisons dans computeEliminatedTeams().
 */
function teamKey(team = {}) {
  const full = teamLookup(team);
  return full.id || full.tla || full.name || full.shortName || '';
}

/** Identifiant DOM d'une équipe (pour les data-team-id dans le HTML) */
function teamDomId(team = {}) {
  const full = teamLookup(team);
  return String(full.id || full.tla || full.name || full.shortName || '');
}

/** Vérifie si une équipe figure dans la liste des éliminées */
function isEliminatedTeam(team = {}) {
  const full = teamLookup(team);
  const keys = teamKeys(full);
  return state.eliminated.some(value => keys.includes(norm(value)));
}

function matchHasWatchedTeam(match = {}) {
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  return isWatchedName(home.name) || isWatchedName(away.name);
}

/** Retourne "Éliminée" ou "En course" selon le statut de l'équipe */
function teamStatus(team = {}) {
  return isEliminatedTeam(team) ? 'Éliminée' : 'En course';
}

/**
 * Génère le HTML d'un blason d'équipe (img avec fallback texte TLA).
 * L'attribut onerror remplace l'image cassée par un span stylisé.
 */
function teamVisual(team = {}) {
  const full  = teamLookup(team);
  const name  = full.name || full.shortName || team.name || team.shortName || 'Équipe';
  const tla   = full.tla  || team.tla  || name.slice(0, 3).toUpperCase();
  const crest = full.crest || team.crest || '';

  if (crest) {
    // Le onerror inline remplace dynamiquement l'img par un span si l'image est inaccessible
    return `<img class="crest" src="${escapeHtml(crest)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'crest crest-fallback',textContent:'${escapeHtml(tla)}'}))">`;
  }
  return `<span class="crest crest-fallback">${escapeHtml(tla)}</span>`;
}

/**
 * Génère le HTML d'une ligne équipe cliquable (blason + nom).
 * La classe is-eliminated barre le nom des équipes éliminées.
 */
function teamNameLine(team = {}) {
  const full = teamLookup(team);
  const eliminated = isEliminatedTeam(full);
  return `<span class="team-name team-link ${eliminated ? 'is-eliminated' : ''}" role="button" tabindex="0" data-team-id="${escapeHtml(teamDomId(full))}">${teamVisual(full)}<span>${escapeHtml(full.name || full.shortName || team.name || team.shortName || 'À déterminer')}</span></span>`;
}

/**
 * Extrait le nom de l'entraîneur depuis l'objet équipe.
 * L'API peut retourner coach.name ou {coach.firstName, coach.lastName}.
 */
function coachName(team = {}) {
  const coach = team.coach || team.trainer || {};
  if (coach.name) return coach.name;
  return [coach.firstName, coach.lastName].filter(Boolean).join(' ');
}

function playerName(player = {}) {
  return player.name || [player.firstName, player.lastName].filter(Boolean).join(' ') || 'Joueur';
}

function playerPosition(player = {}) {
  const raw = String(player.position || player.role || '').trim();
  const key = norm(raw);
  if (!key) return 'Joueur';
  if (key.includes('goalkeeper') || key.includes('gardien')) return 'Gardien';
  if (key.includes('defence') || key.includes('defender') || key.includes('defenseur')) return 'Defense';
  if (key.includes('midfield') || key.includes('milieu')) return 'Milieu';
  if (key.includes('offence') || key.includes('forward') || key.includes('attacker') || key.includes('attaquant')) return 'Attaque';
  return raw;
}

function squadGroupTitle(position = '') {
  const key = norm(position);
  if (key.includes('gardien')) return 'Gardiens';
  if (key.includes('defense')) return 'Defenseurs';
  if (key.includes('milieu')) return 'Milieux';
  if (key.includes('attaque')) return 'Attaquants';
  return 'Joueurs';
}

function playerNumber(player = {}) {
  return player.shirtNumber || player.number || player.jerseyNumber || '';
}

function squadHtml(squad = []) {
  if (!squad.length) return `<p class="sheet-muted">La sélection officielle n'est pas encore disponible.</p>`;

  const order = ['Gardien', 'Defense', 'Milieu', 'Attaque', 'Joueur'];
  const groups = new Map();
  squad.forEach(player => {
    const position = playerPosition(player);
    if (!groups.has(position)) groups.set(position, []);
    groups.get(position).push(player);
  });

  const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return `<div class="squad-groups">${sortedGroups.map(([position, players]) => `
    <section class="squad-group">
      <h4>${escapeHtml(squadGroupTitle(position))}<span>${players.length}</span></h4>
      <div class="squad-list">
        ${players.map(player => {
          const number = playerNumber(player);
          return `<article class="squad-player">
            <span class="squad-number">${number ? escapeHtml(String(number)) : '-'}</span>
            <span class="squad-player-main">
              <strong>${escapeHtml(playerName(player))}</strong>
              <small>${escapeHtml(playerPosition(player))}</small>
            </span>
          </article>`;
        }).join('')}
      </div>
    </section>`).join('')}</div>`;
}

/**
 * Trouve le groupe d'une équipe dans les classements.
 * Parcourt state.standings pour trouver la table qui contient l'équipe.
 */
function teamGroup(team = {}) {
  const key = teamKey(team);
  const group = state.standings.find(standing =>
    (standing.table || []).some(row => teamKey(row.team) === key)
  );
  return group ? humanLabel(group.group || group.stage || 'Groupe') : '';
}

/**
 * Retourne les matchs d'une équipe, triés par date.
 * Utilisé dans la modale fiche équipe.
 */
function teamMatches(team = {}) {
  const key = teamKey(team);
  return state.matches
    .filter(m => teamKey(m.homeTeam) === key || teamKey(m.awayTeam) === key)
    .sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
}

function matchGoals(match) {
  return readMatchScore(match);
}

function teamStandingRow(team = {}) {
  const key = teamKey(team);
  for (const standing of state.standings) {
    const row = (standing.table || []).find(item => teamKey(item.team) === key);
    if (row) return row;
  }
  return null;
}

function teamJourneyStats(team = {}, matches = []) {
  const key = teamKey(team);
  const played = matches.filter(match => isFinishedMatch(match) && matchGoals(match));
  const upcoming = matches.filter(isUpcomingMatch);
  const stats = {
    played: played.length,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    lastMatch: played.at(-1) || null,
    nextMatch: upcoming[0] || null,
  };

  played.forEach(match => {
    const goals = matchGoals(match);
    const home = teamKey(match.homeTeam) === key;
    const forGoals = home ? goals.home : goals.away;
    const againstGoals = home ? goals.away : goals.home;

    stats.goalsFor += forGoals;
    stats.goalsAgainst += againstGoals;
    if (forGoals > againstGoals) stats.wins += 1;
    else if (forGoals < againstGoals) stats.losses += 1;
    else stats.draws += 1;
  });

  return stats;
}

function compactMatchLine(match) {
  if (!match) return 'À confirmer';
  const teams = [teamLookup(match.homeTeam).name, teamLookup(match.awayTeam).name]
    .filter(Boolean)
    .join(' - ');
  return `${teams || 'Match à confirmer'} · ${scoreText(match)} · ${fmtDate(match.utcDate)}`;
}

function teamJourneyHtml(team = {}, matches = []) {
  const stats = teamJourneyStats(team, matches);
  const standing = teamStandingRow(team);
  const standingPlayed = numericScore(standing?.playedGames);
  const useStandingStats = standingPlayed !== null && standingPlayed >= stats.played;
  const played = useStandingStats ? standingPlayed : stats.played;
  const wins = useStandingStats ? (numericScore(standing?.won) ?? 0) : stats.wins;
  const draws = useStandingStats ? (numericScore(standing?.draw) ?? 0) : stats.draws;
  const losses = useStandingStats ? (numericScore(standing?.lost) ?? 0) : stats.losses;
  const goalsFor = useStandingStats ? (numericScore(standing?.goalsFor) ?? 0) : stats.goalsFor;
  const goalsAgainst = useStandingStats ? (numericScore(standing?.goalsAgainst) ?? 0) : stats.goalsAgainst;
  const goalDifference = useStandingStats
    ? (numericScore(standing?.goalDifference) ?? (goalsFor - goalsAgainst))
    : goalsFor - goalsAgainst;
  const form = played
    ? `${wins}V ${draws}N ${losses}D`
    : 'À venir';
  const groupPosition = standing?.position
    ? `${standing.position}${standing.position === 1 ? 'er' : 'e'} du groupe`
    : 'Classement à confirmer';

  return `<div class="team-journey">
    <div class="team-journey-stats">
      <article><small>Bilan</small><strong>${escapeHtml(form)}</strong></article>
      <article><small>Buts</small><strong>${goalsFor} / ${goalsAgainst}</strong></article>
      <article><small>Diff.</small><strong>${goalDifference > 0 ? '+' : ''}${goalDifference}</strong></article>
      <article><small>Groupe</small><strong>${escapeHtml(groupPosition)}</strong></article>
    </div>
    <div class="team-journey-flow">
      <article>
        <small>Dernier match</small>
        <strong>${escapeHtml(compactMatchLine(stats.lastMatch))}</strong>
      </article>
      <article>
        <small>Prochain match</small>
        <strong>${escapeHtml(compactMatchLine(stats.nextMatch))}</strong>
      </article>
    </div>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALE FICHE ÉQUIPE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ouvre la modale et injecte le contenu de la fiche pour une équipe donnée.
 * Affiche : blason, faits clés, effectif (si disponible), 5 premiers matchs.
 */
function openTeamModal(team = {}) {
  const full    = teamLookup(team);
  const squad   = Array.isArray(full.squad) ? full.squad : [];
  const squadCount = squad.length || Number(full.squadCount || 0);
  const allMatches = teamMatches(full);
  const matches = allMatches.slice(0, 6);
  const coach   = coachName(full);
  const group   = teamGroup(full);

  els.teamModalContent.innerHTML = `
    <header class="team-sheet-header">
      ${teamVisual(full)}
      <div>
        <p class="eyebrow">Fiche équipe</p>
        <h2 id="teamModalTitle">${escapeHtml(full.name || full.shortName || 'Équipe')}</h2>
        <p>${escapeHtml([full.area?.name, full.tla].filter(Boolean).join(' · '))}</p>
      </div>
    </header>

    <!-- Grille de 4 faits clés -->
    <div class="team-facts">
      <article><small>Statut</small><strong>${teamStatus(full)}</strong></article>
      <article><small>Groupe</small><strong>${escapeHtml(group || 'À confirmer')}</strong></article>
      <article><small>Entraîneur</small><strong>${escapeHtml(coach || 'Non communiqué')}</strong></article>
      <article><small>Effectif</small><strong>${squadCount ? `${squadCount} joueurs` : 'Non communiqué'}</strong></article>
    </div>

    <!-- Parcours -->
    <div class="team-sheet-section">
      <h3>Parcours</h3>
      ${teamJourneyHtml(full, allMatches)}
    </div>

    <!-- Effectif -->
    <div class="team-sheet-section">
      <h3>Effectif</h3>
      ${squadHtml(squad)}
    </div>

    <!-- Matchs de l'équipe -->
    <div class="team-sheet-section">
      <h3>Matchs</h3>
      ${matches.length
        ? `<div class="mini-match-list">${matches.map(m => `
            <div>
              <span>${fmtDate(m.utcDate)}</span>
              <strong class="mini-teams">${teamNameLine(m.homeTeam)}<span class="versus">vs</span>${teamNameLine(m.awayTeam)}</strong>
              <small>${scoreText(m)}${matchMeta(m) ? ' · ' + escapeHtml(matchMeta(m)) : ''}</small>
              ${scorersHtml(m, 'mini-scorers')}
              ${matchFinishedDetailsHtml(m, 'is-mini')}
              ${broadcastBadgesHtml(m, 'is-mini')}
            </div>`).join('')
          }</div>`
        : `<p class="sheet-muted">Aucun match disponible pour le moment.</p>`
      }
    </div>`;

  els.teamModal.hidden = false;
  document.body.classList.add('modal-open'); // Bloque le scroll du fond
}

/** Ferme la modale et réactive le scroll de la page */
function closeTeamModal() {
  els.teamModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function openInfoModal(type) {
  const played = state.matches.filter(isFinishedMatch).length;
  const upcoming = state.matches.filter(isUpcomingMatch).length;
  const payloads = {
    story: {
      eyebrow: 'Esprit du site',
      title: 'Une Coupe du Monde, une histoire à vivre',
      body: [
        'Depuis l’Uruguay 1930, la Coupe du Monde rassemble des pays, des générations et des souvenirs autour du même ballon.',
        'En 2026, la fête prend une nouvelle dimension : Canada, Mexique et États-Unis accueillent ensemble une édition plus grande, plus ouverte, plus imprévisible.',
        'Ce site est pensé comme un coin de tribune : on y revient pour suivre les nations qu’on aime, sentir monter les affiches, garder un oeil sur les groupes et vivre le tournoi avec plaisir.'
      ],
      facts: [
        ['Premier chapitre', 'Uruguay 1930'],
        ['Édition 2026', '48 nations'],
        ['Terres hôtes', 'Canada, Mexique, États-Unis'],
        ['Esprit', 'Fan, vivant, passionné'],
      ],
      actions: [
        { label: 'Accueil', view: 'home', target: '#top' },
        { label: 'Source FIFA', href: 'https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026' },
        { label: 'Histoire', href: 'https://www.britannica.com/sports/World-Cup-football' },
      ],
    },
    vygon: {
      eyebrow: 'Easter egg',
      title: 'Équipe Vygon Stérilisation',
      body: [
        'Respect aux spécialistes de l’ombre : ceux qui préparent, contrôlent, sécurisent et font tourner la mécanique sans forcément chercher la lumière.',
        'Ici, on leur réserve une petite place dans le stade : concentration, précision, sang-froid, et ce supplément d’esprit d’équipe qui transforme une journée chargée en victoire collective.',
        'Message secret débloqué. Le tableau de bord salue l’Équipe Vygon Stérilisation.'
      ],
      facts: [
        ['Code débloqué', 'VYGON'],
        ['Style de jeu', 'Précision'],
        ['Force du collectif', 'Stérilisation'],
        ['Statut', 'Respect maximal'],
      ],
      actions: [
        { label: 'Retour au match', view: activeView || 'home', target: '#top' },
      ],
      special: 'vygon',
    },
    teams: {
      eyebrow: 'La grande scène',
      title: '48 nations, un même rêve',
      body: [
        'Une Coupe du Monde commence toujours de la même façon : des drapeaux, des hymnes, des maillots qu’on ressort, et cette impression que tout peut arriver.',
        'En 2026, quarante-huit nations entrent dans l’histoire du tournoi. Certaines viennent pour confirmer leur légende, d’autres pour écrire la première grande page de leur football.',
        'Chaque sélection porte un pays, une mémoire, une génération de supporters. C’est ce mélange qui rend la Coupe du Monde unique : pendant quelques semaines, le football devient un langage commun.'
      ],
      facts: [
        ['Nations', '48'],
        ['Émotion', 'Hymnes, maillots, histoires'],
      ],
      actions: [{ label: 'Voir les nations', view: 'teams', target: '#equipes' }],
    },
    matches: {
      eyebrow: 'Les affiches',
      title: 'Le théâtre des grands soirs',
      body: [
        'Le calendrier d’une Coupe du Monde, ce n’est pas seulement une liste de dates. C’est une suite de rendez-vous qu’on coche, qu’on attend, qu’on commente avant même le coup d’envoi.',
        'Il y a les chocs annoncés, les matchs pièges, les surprises de groupe, puis cette tension qui monte à mesure que la finale se rapproche.',
        'Ici, les rencontres sont pensées comme un fil de tournoi : savoir qui joue, quand, contre qui, et sentir la compétition avancer.'
      ],
      facts: [
        ['Déjà joués', String(played)],
        ['À vivre', String(upcoming)],
      ],
      actions: [{ label: 'Voir les matchs', view: 'matches', target: '#matchs' }],
    },
    hosts: {
      eyebrow: 'Terres hôtes',
      title: 'Canada, Mexique, États-Unis',
      body: [
        'La Coupe du Monde 2026 traverse trois pays et tout un continent de football. Le Canada, le Mexique et les États-Unis accueillent ensemble une édition pensée à grande échelle.',
        'Le Mexique retrouve une histoire forte avec le tournoi, les États-Unis rallument le souvenir de 1994, et le Canada entre pleinement dans la fête mondiale.',
        'Stades immenses, cultures différentes, voyages longs, ambiances contrastées : cette édition aura le goût des grandes traversées.'
      ],
      facts: [
        ['Pays hôtes', '3'],
        ['Territoire', 'Amérique du Nord'],
      ],
      actions: [],
    },
    live: {
      eyebrow: 'Fil du tournoi',
      title: 'Garder le rythme de la Coupe',
      body: [
        'Une Coupe du Monde vit minute après minute : une compo qui tombe, un résultat qui change tout, un article qui raconte l’ambiance autour d’un pays.',
        'Ce fil garde la page dans le tempo du tournoi, avec les matchs, les classements et les nouvelles qui accompagnent la compétition.',
        'L’idée est simple : revenir ici comme on revient à son coin de stade, pour reprendre le fil sans perdre l’émotion.'
      ],
      facts: [
        ['Rythme', 'Tournoi vivant'],
        ['Ambiance', activeView === 'home' ? 'Nos nations suivies' : 'Toute la compétition'],
      ],
      actions: [{ label: 'Rafraîchir le fil', refresh: true }],
    },
  };

  const info = payloads[type];
  if (!info || !els.infoModal || !els.infoModalContent) return;
  els.infoModal.classList.remove('has-stats-sheet');

  els.infoModalContent.innerHTML = `
    <div class="info-sheet ${info.special ? `info-sheet-${escapeHtml(info.special)}` : ''}">
      <p class="eyebrow">${escapeHtml(info.eyebrow)}</p>
      <h2 id="infoModalTitle">${escapeHtml(info.title)}</h2>
      ${Array.isArray(info.body)
        ? info.body.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('')
        : `<p>${escapeHtml(info.body)}</p>`}
      ${info.facts?.length ? `<p class="info-recap">
        ${info.facts.map(([label, value]) => `
          <span><strong>${escapeHtml(value)}</strong> ${escapeHtml(label).toLowerCase()}</span>`).join('')}
      </p>` : ''}
      ${info.actions.length ? `<div class="info-actions">
        ${info.actions.map(action => action.refresh
          ? '<button type="button" data-info-refresh>Actualiser</button>'
          : action.href
            ? `<a href="${escapeHtml(action.href)}" target="_blank" rel="noopener noreferrer" data-info-external>${escapeHtml(action.label)}</a>`
            : `<a href="${escapeHtml(action.target || '#top')}" data-info-view="${escapeHtml(action.view)}" data-info-target="${escapeHtml(action.target)}">${escapeHtml(action.label)}</a>`
        ).join('')}
      </div>` : ''}
    </div>`;

  els.infoModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeInfoModal() {
  if (!els.infoModal) return;
  els.infoModal.hidden = true;
  els.infoModal.classList.remove('has-stats-sheet');
  document.body.classList.remove('modal-open');
}

function openEfficiencyHelpModal() {
  if (!els.infoModal || !els.infoModalContent) return;
  els.infoModal.classList.remove('has-stats-sheet');

  els.infoModalContent.innerHTML = `
    <div class="info-sheet rating-help-sheet">
      <p class="eyebrow">Méthode</p>
      <h2 id="infoModalTitle">Comment est calculée la note ?</h2>
      <p>La note va de 0 à 100. Elle mesure la performance réelle d'une équipe sur ses matchs terminés ou en direct, puis affiche la moyenne.</p>
      <div class="rating-help-grid">
        <section>
          <strong>45%</strong>
          <span>Résultat</span>
          <p>Victoire, nul ou défaite sont comparés au résultat attendu selon le classement FIFA des deux équipes.</p>
        </section>
        <section>
          <strong>25%</strong>
          <span>Attaque</span>
          <p>Les buts marqués sont comparés à ce qu'on pouvait attendre face au niveau de l'adversaire.</p>
        </section>
        <section>
          <strong>30%</strong>
          <span>Écart</span>
          <p>L'écart au score valorise les victoires nettes et pénalise les défaites lourdes.</p>
        </section>
      </div>
      <p class="rating-help-note"><strong>Adversité</strong> indique la difficulté moyenne des adversaires rencontrés. Plus elle est haute, plus la note a été obtenue contre des équipes fortes.</p>
    </div>`;

  els.infoModal.hidden = false;
  document.body.classList.add('modal-open');
}

function openPlayerPerformanceHelpModal() {
  if (!els.infoModal || !els.infoModalContent) return;
  els.infoModal.classList.remove('has-stats-sheet');

  els.infoModalContent.innerHTML = `
    <div class="info-sheet rating-help-sheet">
      <p class="eyebrow">Méthode</p>
      <h2 id="infoModalTitle">Note performance joueur</h2>
      <p>La note va de 0 à 100. Elle mesure l'impact direct d'un joueur sur ses matchs décisifs, puis compare sa note au repère moyen des joueurs décisifs du tournoi.</p>
      <div class="rating-help-grid">
        <section>
          <strong>But</strong>
          <span>Impact majeur</span>
          <p>Un but rapporte plus qu'une passe, avec un bonus si l'adversaire est difficile.</p>
        </section>
        <section>
          <strong>Passe</strong>
          <span>Création</span>
          <p>Une passe décisive valorise l'action collective et reçoit aussi un bonus selon l'adversité.</p>
        </section>
        <section>
          <strong>Contexte</strong>
          <span>Match</span>
          <p>Match serré, victoire ou nul, et but tardif augmentent la note car l'action pèse davantage.</p>
        </section>
      </div>
      <p class="rating-help-note"><strong>Matchs</strong> indique le nombre de matchs où le joueur a été décisif. La note est calculée en moyenne par match décisif, avec une progression amortie : plus on approche de 100, plus il faut une performance rare pour gagner des points.</p>
    </div>`;

  els.infoModal.hidden = false;
  document.body.classList.add('modal-open');
}

function openStatsModal() {
  if (!els.infoModal || !els.infoModalContent) return;
  els.infoModal.classList.add('has-stats-sheet');

  const efficiency = computeTournamentEfficiencyRanking();
  const scorers = computeTopScorersRanking();
  const playerPerformances = computePlayerPerformanceRanking();

  els.infoModalContent.innerHTML = `
    <div class="info-sheet stats-sheet">
      <p class="eyebrow">Stats complètes</p>
      <h2 id="infoModalTitle">Classements du tournoi</h2>
      <p>La note d'une équipe compare le résultat obtenu, les buts marqués, l'écart au score et la difficulté de l'adversaire selon le classement officiel.</p>
      <p>La note joueur mesure son impact direct : but, passe, moment du match, résultat final et niveau de l'adversaire. L'écart indique sa performance par rapport au repère moyen des joueurs décisifs du tournoi.</p>
      <div class="stats-modal-grid">
        <section>
          <h3>Équipes efficaces</h3>
          <div class="tournament-stats is-modal">
            ${efficiency.length
              ? efficiency.map(efficiencyCard).join('')
              : '<div class="efficiency-empty">Aucune note disponible pour le moment.</div>'}
          </div>
        </section>
        <section>
          <h3>Buteurs</h3>
          <div class="top-scorers is-modal">
            ${scorers.length
              ? scorers.map(topScorerCard).join('')
              : '<div class="top-scorers-empty">Aucun buteur confirmé pour le moment.</div>'}
          </div>
        </section>
        <section>
          <h3 class="stats-title-with-help">Performances joueurs <button class="help-pill" type="button" data-player-performance-help aria-label="Comment est calculée la note performance joueur">?</button></h3>
          <div class="player-performances is-modal">
            ${playerPerformances.length
              ? playerPerformances.map(playerPerformanceCard).join('')
              : '<div class="top-scorers-empty">Aucune performance joueur disponible pour le moment.</div>'}
          </div>
        </section>
      </div>
    </div>`;

  els.infoModal.hidden = false;
  document.body.classList.add('modal-open');
}

function openSearchModal(query) {
  const rawQuery = String(query || '').trim();
  const q = norm(rawQuery);
  if (!q) return;
  els.infoModal?.classList.remove('has-stats-sheet');

  if (q.includes('vygon')) {
    openInfoModal('vygon');
    return;
  }

  const teams = state.teams
    .filter(team => [team.name, team.shortName, team.tla, team.area?.name].some(value => norm(value).includes(q)))
    .slice(0, 5);

  const matches = state.matches
    .filter(match => {
      const home = teamLookup(match.homeTeam);
      const away = teamLookup(match.awayTeam);
      return [
        home.name, home.shortName, home.tla,
        away.name, away.shortName, away.tla,
        match.group, match.stage, match.venue,
      ].some(value => norm(value).includes(q));
    })
    .slice(0, 5);

  const articles = [...state.watchedNews, ...state.news]
    .filter((article, index, list) => article.link && list.findIndex(item => item.link === article.link) === index)
    .filter(article => [article.title, article.source, article.description].some(value => norm(value).includes(q)))
    .slice(0, 4);

  const teamMarkup = teams.length
    ? teams.map(team => `
      <button class="search-result" type="button" data-search-team="${escapeHtml(teamDomId(team))}">
        ${teamVisual(team)}
        <span><strong>${escapeHtml(team.name || team.shortName || 'Équipe')}</strong><small>${escapeHtml(team.tla || team.area?.name || 'Sélection')}</small></span>
      </button>`).join('')
    : '<div class="search-empty">Aucune équipe trouvée.</div>';

  const matchMarkup = matches.length
    ? matches.map(match => {
      const home = teamLookup(match.homeTeam);
      const away = teamLookup(match.awayTeam);
      return `<button class="search-result" type="button" data-search-match="${escapeHtml(rawQuery)}" data-search-match-id="${escapeHtml(matchDomId(match))}">
        <span class="search-ball">⚽</span>
        <span><strong>${escapeHtml(home.name || 'À venir')} vs ${escapeHtml(away.name || 'À venir')}</strong><small>${escapeHtml(fmtDate(match.utcDate))}</small></span>
      </button>`;
    }).join('')
    : '<div class="search-empty">Aucun match trouvé.</div>';

  const articleMarkup = articles.length
    ? articles.map(article => `
      <a class="search-result" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
        <span class="search-ball">↗</span>
        <span><strong>${escapeHtml(article.title)}</strong><small>${escapeHtml(article.source || hostLabel(article.link))}</small></span>
      </a>`).join('')
    : '<div class="search-empty">Aucun article trouvé.</div>';

  els.infoModalContent.innerHTML = `
    <div class="info-sheet search-sheet">
      <p class="eyebrow">Recherche interne</p>
      <h2 id="infoModalTitle">${escapeHtml(rawQuery)}</h2>
      <p>Résultats trouvés dans les équipes, les matchs et les articles du site.</p>
      <div class="search-groups">
        <section><h3>Équipes</h3>${teamMarkup}</section>
        <section><h3>Matchs</h3>${matchMarkup}</section>
        <section><h3>Articles</h3>${articleMarkup}</section>
      </div>
    </div>`;

  els.infoModal.hidden = false;
  document.body.classList.add('modal-open');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS MATCH
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne [label, cssClass] selon le statut d'un match.
 * IN_PLAY et PAUSED → "En direct" (rouge)
 * FINISHED          → "Terminé" (teal)
 * POSTPONED         → "Reporté"
 * autres            → "À venir"
 */
function effectiveMatchStatus(match = {}) {
  const liveStatus = String(match.liveStatus || '').trim().toUpperCase();
  if (liveStatus === 'FT') return 'FINISHED';

  const rawStatus = match.status || 'SCHEDULED';
  if (['SCHEDULED', 'TIMED'].includes(rawStatus) && match.utcDate) {
    const kickoff = Date.parse(match.utcDate);
    const elapsed = Date.now() - kickoff;
    if (Number.isFinite(kickoff) && elapsed >= 0 && elapsed <= LIVE_INFERENCE_WINDOW_MS) {
      return 'IN_PLAY';
    }
  }

  return rawStatus;
}

function isFinishedMatch(match = {}) {
  return effectiveMatchStatus(match) === 'FINISHED';
}

function isLiveMatch(match = {}) {
  return ['IN_PLAY', 'PAUSED'].includes(effectiveMatchStatus(match));
}

function matchStatus(match) {
  const s = effectiveMatchStatus(match);
  if (s === 'IN_PLAY' || s === 'PAUSED') return ['En direct', 'live'];
  if (s === 'FINISHED')                  return ['Terminé',   'finished'];
  if (s === 'POSTPONED')                 return ['Reporté',   ''];
  return ['À venir', ''];
}

function isUpcomingMatch(match) {
  return ['SCHEDULED', 'TIMED'].includes(effectiveMatchStatus(match));
}

function numericScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readMatchScore(match = {}) {
  const home = numericScore(
    match.liveScore?.home ??
    match.score?.fullTime?.home ??
    match.score?.regularTime?.home ??
    match.score?.halfTime?.home
  );
  const away = numericScore(
    match.liveScore?.away ??
    match.score?.fullTime?.away ??
    match.score?.regularTime?.away ??
    match.score?.halfTime?.away
  );

  return home !== null && away !== null ? { home, away } : null;
}

/**
 * Retourne le score formaté "home - away" ou "vs" si le match n'a pas commencé.
 * Essaie d'abord le score temps plein, puis temps réglementaire.
 */
function scoreText(match) {
  const cleanGoals = readMatchScore(match);
  return cleanGoals ? `${cleanGoals.home} - ${cleanGoals.away}` : 'vs';

  const goals = readMatchScore(match);
  return goals ? `${goals.home} â€“ ${goals.away}` : 'vs';

  const home = match.score?.fullTime?.home ?? match.score?.regularTime?.home;
  const away = match.score?.fullTime?.away ?? match.score?.regularTime?.away;
  return (home === null || home === undefined) ? 'vs' : `${home} – ${away}`;
}

function isOwnGoalEvent(event = {}) {
  return norm(event.detail || event.type || '').includes('own goal');
}

function goalDetailLabel(goal = {}) {
  if (isOwnGoalEvent(goal)) return 'CSC';

  const detail = String(goal.detail || '').trim();
  if (!detail || /^normal goal$/i.test(detail)) return '';
  if (/^penalty$/i.test(detail)) return 'Penalty';
  return detail;
}

function goalMainLabel(goal = {}) {
  return isOwnGoalEvent(goal) ? 'CSC' : 'But';
}

function scorersText(match) {
  const scorers = Array.isArray(match.scorers) ? match.scorers : [];
  if (!scorers.length) return '';

  return scorers
    .map(goal => {
      const goalMinute = Number(goal.minute);
      const minute = Number.isFinite(goalMinute) ? `${goalMinute}' ` : '';
      const assist = goal.assist ? `, passe ${goal.assist}` : '';
      const detail = goalDetailLabel(goal);
      return `${minute}${detail ? `${detail} - ` : ''}${goal.player}${assist}`;
    })
    .join(' · ');
}

function eventTeamVisual(match, event = {}) {
  let team = null;
  if (event.teamSide === 'home') team = match.homeTeam;
  if (event.teamSide === 'away') team = match.awayTeam;

  if (!team && event.team) {
    team = [match.homeTeam, match.awayTeam, ...state.teams].find(candidate => {
      const full = teamLookup(candidate);
      return norm(full.name || full.shortName || full.tla) === norm(event.team);
    });
  }

  return team
    ? `<span class="event-team-visual" title="${escapeHtml(teamLookup(team).name || event.team || '')}">${teamVisual(team)}</span>`
    : '';
}

function eventTeamObject(match, event = {}) {
  if (event.teamSide === 'home') return teamLookup(match.homeTeam);
  if (event.teamSide === 'away') return teamLookup(match.awayTeam);
  if (!event.team) return null;

  return [match.homeTeam, match.awayTeam, ...state.teams]
    .map(teamLookup)
    .find(candidate => norm(candidate.name || candidate.shortName || candidate.tla) === norm(event.team)) || null;
}

function opponentForTeamInMatch(match, team) {
  const key = team ? teamDomId(team) || norm(team.name || team.shortName || '') : '';
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const homeKey = teamDomId(home) || norm(home.name || home.shortName || '');
  const awayKey = teamDomId(away) || norm(away.name || away.shortName || '');

  if (key && key === homeKey) return away;
  if (key && key === awayKey) return home;
  return null;
}

function scoreForTeamInMatch(match, team) {
  const key = team ? teamDomId(team) || norm(team.name || team.shortName || '') : '';
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const homeKey = teamDomId(home) || norm(home.name || home.shortName || '');
  const awayKey = teamDomId(away) || norm(away.name || away.shortName || '');
  const goals = readMatchScore(match);

  if (!goals) return null;
  if (key && key === homeKey) return { goalsFor: goals.home, goalsAgainst: goals.away };
  if (key && key === awayKey) return { goalsFor: goals.away, goalsAgainst: goals.home };
  return null;
}

function missingGoalSummaries(match, scorers = []) {
  const score = readMatchScore(match);
  if (!score || score.home + score.away <= scorers.length) return [];

  const sideCounts = { home: 0, away: 0 };
  scorers.forEach(goal => {
    if (goal.teamSide === 'home' || goal.teamSide === 'away') {
      sideCounts[goal.teamSide] += 1;
    }
  });

  const missing = {
    home: Math.max(0, score.home - sideCounts.home),
    away: Math.max(0, score.away - sideCounts.away),
  };
  const missingTotal = Math.max(0, score.home + score.away - scorers.length);

  while (missing.home + missing.away > missingTotal && (missing.home > 0 || missing.away > 0)) {
    if (missing.home >= missing.away && missing.home > 0) missing.home -= 1;
    else if (missing.away > 0) missing.away -= 1;
  }

  return [
    ['home', match.homeTeam, missing.home],
    ['away', match.awayTeam, missing.away],
  ].filter(([, , goals]) => goals > 0);
}

function scorersHtml(match, className = 'match-scorers', limit = Infinity) {
  const scorers = Array.isArray(match.scorers) ? match.scorers : [];
  const missingGoals = missingGoalSummaries(match, scorers);
  if (!scorers.length) {
    const score = readMatchScore(match);
    if (!score || score.home + score.away <= 0) return '';

    const fallbackItems = [
      ['home', match.homeTeam, score.home],
      ['away', match.awayTeam, score.away],
    ].filter(([, , goals]) => goals > 0).map(([side, team, goals]) => {
      const teamName = team?.name || team?.shortName || 'Équipe';
      return `<span class="score-event is-score-fallback">
        <span class="match-info-icon ball-icon" aria-label="But"></span>
        ${eventTeamVisual(match, { teamSide: side, team: teamName })}
        ${escapeHtml(`${goals} but${goals > 1 ? 's' : ''} - buteur${goals > 1 ? 's' : ''} à confirmer`)}
      </span>`;
    }).join('');

    return fallbackItems ? `<small class="${className}">${fallbackItems}</small>` : '';
  }

  const visibleScorers = Number.isFinite(limit) ? scorers.slice(0, limit) : scorers;
  const hiddenCount = scorers.length - visibleScorers.length;
  const items = visibleScorers.map(goal => {
    const goalMinute = Number(goal.minute);
    const minute = Number.isFinite(goalMinute) ? `${goalMinute}' ` : '';
    const assist = goal.assist ? `, passe ${goal.assist}` : '';
    const detail = goalDetailLabel(goal);
    return `<span class="score-event">
      <span class="match-info-icon ball-icon" aria-label="But"></span>
      ${eventTeamVisual(match, goal)}
      ${escapeHtml(`${minute}${detail ? `${detail} - ` : ''}${goal.player}${assist}`)}
    </span>`;
  }).join('');

  const missingItems = missingGoals.map(([side, team, goals]) => {
    const teamName = team?.name || team?.shortName || 'Equipe';
    return `<span class="score-event is-score-fallback">
      <span class="match-info-icon ball-icon" aria-label="But"></span>
      ${eventTeamVisual(match, { teamSide: side, team: teamName })}
      ${escapeHtml(`${goals} but${goals > 1 ? 's' : ''} - buteur${goals > 1 ? 's' : ''} à confirmer`)}
    </span>`;
  }).join('');

  const more = hiddenCount > 0 ? `<span class="score-event is-more">+${hiddenCount} but${hiddenCount > 1 ? 's' : ''}</span>` : '';
  return `<small class="${className}">${items}${missingItems}${more}</small>`;
}

function liveEventsSummaryHtml(match) {
  const scorers = Array.isArray(match.scorers) ? match.scorers : [];
  const cards = Array.isArray(match.cards) ? match.cards : [];
  const score = readMatchScore(match);
  const scoreGoals = score ? score.home + score.away : 0;
  const missingGoals = missingGoalSummaries(match, scorers);

  if (!scorers.length && !cards.length && !scoreGoals) {
    return '';
  }

  const fallbackGoalItems = missingGoals.length
    ? missingGoals.map(([side, team, goals]) => {
        const teamName = team?.name || team?.shortName || 'Équipe';
        return `<li>
          <span class="live-event-minute">But</span>
          <span class="live-event-icon match-info-icon ball-icon" aria-hidden="true"></span>
          <span class="live-event-body">
            <strong>${escapeHtml(`${goals} but${goals > 1 ? 's' : ''} - buteur${goals > 1 ? 's' : ''} à confirmer`)}</strong>
            <small>${eventTeamVisual(match, { teamSide: side, team: teamName })}${escapeHtml('Buteur' + (goals > 1 ? 's' : '') + ' à confirmer par la source')}</small>
          </span>
        </li>`;
      })
    : [];

  const goalItems = scorers.map(goal => {
    const goalMinute = Number(goal.minute);
    const minute = Number.isFinite(goalMinute) ? `${goalMinute}'` : 'But';
    const detail = goalDetailLabel(goal);
    const detailText = detail ? ` · ${detail}` : '';
    const assist = goal.assist ? ` · passe ${goal.assist}` : '';

    return `<li>
      <span class="live-event-minute">${escapeHtml(minute)}</span>
      <span class="live-event-icon match-info-icon ball-icon" aria-hidden="true"></span>
      <span class="live-event-body">
        <strong>${escapeHtml(`${goalMainLabel(goal)} - ${goal.player || 'joueur non précisé'}`)}</strong>
        <small>${eventTeamVisual(match, goal)}${escapeHtml((goal.team || 'Équipe non précisée') + detailText + assist)}</small>
      </span>
    </li>`;
  });

  const cardItems = cards.slice(0, 3).map(card => {
    const cardMinute = Number(card.minute);
    const minute = Number.isFinite(cardMinute) ? `${cardMinute}'` : 'Carton';
    const type = card.type === 'red' ? 'rouge' : 'jaune';

    return `<li>
      <span class="live-event-minute">${escapeHtml(minute)}</span>
      <span class="live-event-icon match-info-icon card-icon ${type}" aria-hidden="true"></span>
      <span class="live-event-body">
        <strong>${escapeHtml(card.player || 'Joueur non précisé')}</strong>
        <small>${eventTeamVisual(match, card)}Carton ${type}</small>
      </span>
    </li>`;
  });

  return `<div class="live-match-feed">
    <strong>Actions live</strong>
    <ul>${[...goalItems, ...fallbackGoalItems, ...cardItems].join('')}</ul>
  </div>`;
}

function cardsText(match) {
  const cards = Array.isArray(match.cards) ? match.cards : [];
  if (!cards.length) return '';

  return cards
    .map(card => {
      const minute = Number.isFinite(card.minute) ? `${card.minute}' ` : '';
      const label = card.type === 'red' ? 'rouge' : 'jaune';
      return `${minute}${card.player} (${label})`;
    })
    .join(' · ');
}

function cardsHtml(match, className = 'match-cards') {
  const cards = Array.isArray(match.cards) ? match.cards : [];
  if (!cards.length) return '';

  const items = cards.map(card => {
    const minute = Number.isFinite(card.minute) ? `${card.minute}' ` : '';
    const type = card.type === 'red' ? 'red' : 'yellow';
    return `<span class="card-event">
      <span class="match-info-icon card-icon ${type}" aria-label="Carton ${type === 'red' ? 'rouge' : 'jaune'}"></span>
      ${eventTeamVisual(match, card)}
      ${escapeHtml(`${minute}${card.player}`)}
    </span>`;
  }).join('');

  return `<small class="${className}">${items}</small>`;
}

function highlightsHtml(match, className = 'match-highlights') {
  return '';
}

function matchFinishedDetailsHtml(match, size = '') {
  if (!isFinishedMatch(match)) return '';
  const details = [
    cardsHtml(match),
    highlightsHtml(match),
  ].filter(Boolean).join('');

  return details ? `<div class="match-finished-details ${size}">${details}</div>` : '';
}

function matchDomId(match = {}) {
  return String(match.id || [
    match.utcDate,
    match.homeTeam?.id || match.homeTeam?.name,
    match.awayTeam?.id || match.awayTeam?.name,
  ].filter(Boolean).join('|'));
}

function findMatchByDomId(value) {
  return state.matches.find(match => matchDomId(match) === String(value || ''));
}

function premiumSignalsHtml(match, className = '') {
  const scorers = Array.isArray(match.scorers) ? match.scorers.length : 0;
  const cards = Array.isArray(match.cards) ? match.cards.length : 0;
  const hasLiveScore = Boolean(match.liveScore);
  const isFinished = isFinishedMatch(match);
  const signals = [
    hasLiveScore ? (isFinished ? ['Score final', 'Validé'] : ['Live', 'Score en cours']) : null,
    scorers ? [`${scorers} buteur${scorers > 1 ? 's' : ''}`, 'Confirmé'] : null,
    cards ? [`${cards} carton${cards > 1 ? 's' : ''}`, 'Signalé'] : null,
  ].filter(Boolean);

  if (!signals.length) {
    signals.push(['À jour', 'Données disponibles']);
  }

  return `<div class="premium-signal-row ${className}">
    ${signals.map(([label, source]) => `<span class="premium-signal"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(source)}</small></span>`).join('')}
  </div>`;
}

function matchDetailButtonHtml(match, className = '') {
  return `<button class="match-detail-button ${className}" type="button" data-open-match="${escapeHtml(matchDomId(match))}">
    Détails du match
  </button>`;
}

function matchTimelineEvents(match = {}) {
  const rawScorers = Array.isArray(match.scorers) ? match.scorers : [];
  const missingGoals = missingGoalSummaries(match, rawScorers);

  const scorers = rawScorers.map(goal => ({
    kind: isOwnGoalEvent(goal) ? 'own-goal' : 'goal',
    label: goalMainLabel(goal),
    player: goal.player,
    assist: goal.assist,
    detail: goalDetailLabel(goal),
    minute: Number.isFinite(goal.minute) ? goal.minute : null,
    teamSide: goal.teamSide,
    team: goal.team,
    source: goal.source || 'TheSportsDB',
  }));

  const fallbackGoals = missingGoals.length
    ? missingGoals.map(([side, team, goals]) => {
        const teamName = team?.name || team?.shortName || 'Équipe';
        return {
          kind: 'goal',
          label: `${goals} but${goals > 1 ? 's' : ''}`,
          player: teamName,
          detail: `Buteur${goals > 1 ? 's' : ''} à confirmer par la source`,
          minute: null,
          teamSide: side,
          team: teamName,
          source: 'Score officiel',
        };
      })
    : [];

  const cards = (Array.isArray(match.cards) ? match.cards : []).map(card => ({
    kind: card.type === 'red' ? 'red-card' : 'yellow-card',
    label: card.type === 'red' ? 'Carton rouge' : 'Carton jaune',
    player: card.player,
    detail: card.detail,
    minute: Number.isFinite(card.minute) ? card.minute : null,
    teamSide: card.teamSide,
    team: card.team,
    source: card.source || 'TheSportsDB',
  }));

  return [...scorers, ...fallbackGoals, ...cards].sort((a, b) => {
    const ma = Number.isFinite(a.minute) ? a.minute : 999;
    const mb = Number.isFinite(b.minute) ? b.minute : 999;
    return ma - mb;
  });
}

function matchTimelineHtml(match = {}) {
  const events = matchTimelineEvents(match);

  if (!events.length) {
    return `<div class="premium-empty">La fiche est prête. Les événements détaillés apparaîtront ici dès qu’ils seront disponibles.</div>`;
  }

  const eventHtml = events.map(event => {
    const minute = Number.isFinite(event.minute) ? `${event.minute}'` : '--';
    const assist = event.assist ? `<small>Passe : ${escapeHtml(event.assist)}</small>` : '';
    return `<article class="premium-event ${escapeHtml(event.kind)}">
      <span class="premium-minute">${escapeHtml(minute)}</span>
      ${eventTeamVisual(match, event)}
      <span class="premium-event-main">
        <strong>${escapeHtml(event.label)} - ${escapeHtml(event.player || 'Joueur')}</strong>
        ${assist}
        ${event.detail && event.detail !== event.label ? `<small>${escapeHtml(event.detail)}</small>` : ''}
      </span>
    </article>`;
  }).join('');

  return `<div class="premium-timeline">${eventHtml}</div>`;
}

function openMatchModal(matchId) {
  if (!els.matchModal || !els.matchModalContent) return;
  const match = findMatchByDomId(matchId);
  if (!match) return;

  const [label, cls] = matchStatus(match);
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const meta = [matchMeta(match), match.venue].filter(Boolean).map(escapeHtml).join(' - ');
  const status = effectiveMatchStatus(match);
  const matchState = status === 'IN_PLAY'
    ? 'En direct'
    : status === 'PAUSED'
      ? 'Pause'
      : status === 'FINISHED'
        ? 'Terminé'
        : 'À venir';

  els.matchModalContent.innerHTML = `
    <div class="premium-match-sheet">
      <header class="premium-match-hero">
        <p class="eyebrow">Détails du match</p>
        <h2 id="matchModalTitle">${escapeHtml(home.name || 'Équipe')} vs ${escapeHtml(away.name || 'Équipe')}</h2>
        <div class="premium-scoreboard">
          <div class="premium-team">${teamVisual(home)}<strong>${escapeHtml(home.name || home.shortName || 'Équipe')}</strong></div>
          <strong class="premium-score">${escapeHtml(scoreText(match))}</strong>
          <div class="premium-team is-away">${teamVisual(away)}<strong>${escapeHtml(away.name || away.shortName || 'Équipe')}</strong></div>
        </div>
        <div class="premium-match-meta">
          <span class="badge ${cls}">${escapeHtml(label)}</span>
          <span>${escapeHtml(fmtDate(match.utcDate))}</span>
          ${meta ? `<span>${meta}</span>` : ''}
        </div>
        ${premiumSignalsHtml(match, 'is-modal')}
      </header>

      <section class="premium-detail-grid" aria-label="Détails du match">
        <article>
          <small>État du match</small>
          <strong>${escapeHtml(matchState)}</strong>
        </article>
        <article>
          <small>Diffusion France</small>
          <strong>${frenchBroadcasters(match).map(channel => escapeHtml(channel.label)).join(' / ')}</strong>
        </article>
        <article>
          <small>Contexte</small>
          <strong>${escapeHtml(matchMeta(match) || 'Coupe du Monde 2026')}</strong>
        </article>
      </section>

      <section class="premium-section">
        <div class="premium-section-title">
          <h3>Actions du match</h3>
          <small>Buteurs et cartons</small>
        </div>
        ${matchTimelineHtml(match)}
      </section>
    </div>`;

  els.matchModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeMatchModal() {
  if (!els.matchModal) return;
  els.matchModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function frenchBroadcasters(match) {
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const hasFrance = isWatchedName(home.name) && norm(home.name).includes('france')
    || isWatchedName(away.name) && norm(away.name).includes('france');

  return hasFrance
    ? [
        { label: 'beIN', className: 'bein', title: 'Diffuseur payant annoncé pour tous les matchs en France.' },
        { label: 'M6', className: 'm6', title: 'Match de la France annoncé en clair sur M6/M6+.' },
        { label: 'M6+', className: 'm6plus', title: 'Match de la France annoncé en clair sur M6/M6+.' },
      ]
    : [
        { label: 'beIN', className: 'bein', title: 'Diffuseur payant annoncé pour tous les matchs en France.' },
        { label: 'M6', className: 'm6', title: 'Une sélection de matchs est annoncée en clair sur M6/M6+ ; affiche à confirmer selon le programme TV.' },
        { label: 'M6+', className: 'm6plus', title: 'Une sélection de matchs est annoncée en clair sur M6/M6+ ; affiche à confirmer selon le programme TV.' },
      ];
}

function broadcastBadgesHtml(match, className = '') {
  const badges = frenchBroadcasters(match);
  return `<div class="broadcast-badges ${className}">
    ${badges.map(channel => `<span class="channel-badge ${channel.className}" title="${escapeHtml(channel.title || channel.label)}">${escapeHtml(channel.label)}</span>`).join('')}
  </div>`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fifaRankForTeam(team = {}) {
  const names = [team.name, team.shortName, team.tla].filter(Boolean);
  for (const name of names) {
    const rank = FIFA_RANKINGS_2026[norm(name)];
    if (Number.isFinite(rank)) return rank;
  }
  return null;
}

function fifaRatingFromRank(rank) {
  if (!Number.isFinite(rank)) return 60;
  return clamp(100 - ((rank - 1) / 84) * 55, 45, 100);
}

function matchResultShare(goalsFor, goalsAgainst) {
  if (goalsFor > goalsAgainst) return 1;
  if (goalsFor === goalsAgainst) return 0.5;
  return 0;
}

function expectedResultShare(teamRank, opponentRank) {
  const teamRating = fifaRatingFromRank(teamRank);
  const opponentRating = fifaRatingFromRank(opponentRank);
  return 1 / (1 + Math.pow(10, (opponentRating - teamRating) / 28));
}

function matchEfficiencyRating(team, opponent, goalsFor, goalsAgainst) {
  const teamRank = fifaRankForTeam(team);
  const opponentRank = fifaRankForTeam(opponent);
  const expected = expectedResultShare(teamRank, opponentRank);
  const actual = matchResultShare(goalsFor, goalsAgainst);
  const difference = goalsFor - goalsAgainst;
  const attackExpectation = clamp(
    1.15 + ((fifaRatingFromRank(teamRank) - fifaRatingFromRank(opponentRank)) / 65),
    0.45,
    2.15
  );

  const resultComponent = clamp(50 + ((actual - expected) * 50), 0, 100);
  const attackComponent = clamp(50 + ((goalsFor - attackExpectation) * 14), 0, 100);
  const marginComponent = clamp(50 + (difference * 10), 0, 100);
  const note = clamp(
    (resultComponent * 0.45) + (attackComponent * 0.25) + (marginComponent * 0.30),
    0,
    100
  );

  return {
    note,
    expected,
    difficulty: clamp(100 - (expected * 55), 45, 100),
  };
}

function parisDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function matchGoals(match) {
  if (!isFinishedMatch(match)) return 0;
  const goals = readMatchScore(match);
  return goals ? goals.home + goals.away : 0;
}

function compactMatchCard(match, variant = '') {
  const [label, cls] = matchStatus(match);
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const isResultCard = variant.includes('is-result');
  const meta = [matchMeta(match), fmtDate(match.utcDate)].filter(Boolean).map(escapeHtml).join(' · ');

  return `<article class="daily-match-card ${variant}">
    <div class="daily-match-main">
      <span class="badge ${cls}">${label}</span>
      <div class="daily-match-teams">
        ${teamNameLine(home)}
        <span class="versus">vs</span>
        ${teamNameLine(away)}
      </div>
      ${scorersHtml(match, 'daily-scorers', isResultCard ? 2 : Infinity)}
      ${isResultCard ? '' : matchFinishedDetailsHtml(match, 'is-compact')}
      ${meta ? `<small>${meta}</small>` : ''}
      ${isResultCard ? '' : premiumSignalsHtml(match, 'is-compact')}
      ${broadcastBadgesHtml(match)}
      ${matchDetailButtonHtml(match, 'is-compact')}
    </div>
    <strong class="daily-match-score">${scoreText(match)}</strong>
  </article>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALCUL DES ÉQUIPES ÉLIMINÉES — computeEliminatedTeams()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vérifie si un groupe de phase de poule est terminé.
 * Un groupe est complet quand chaque équipe a joué contre toutes les autres.
 * (n équipes = n-1 matchs chacune)
 */
function groupIsComplete(group) {
  const table = group.table || [];
  if (!table.length) return false;
  const expectedGames = table.length - 1;
  return table.every(row => Number(row.playedGames || 0) >= expectedGames);
}

/**
 * Retourne l'équipe perdante d'un match éliminatoire terminé.
 * Gère les deux cas : winner explicite dans l'API, ou lecture du score.
 * @returns {object|null}  L'objet équipe perdante, ou null si pas applicable
 */
function knockoutLoser(match) {
  const stage = match.stage || '';
  const knockoutStages = ['LAST_32', 'LAST_16', 'QUARTER_FINALS', 'SEMI_FINALS'];
  if (!knockoutStages.includes(stage) || !isFinishedMatch(match)) return null;

  const winner = match.score?.winner;
  if (winner === 'HOME_TEAM') return match.awayTeam;
  if (winner === 'AWAY_TEAM') return match.homeTeam;

  // Fallback : lecture directe du score si le champ winner est absent
  const goals = readMatchScore(match);
  if (goals?.home > goals?.away) return match.awayTeam;
  if (goals?.away > goals?.home) return match.homeTeam;
  return null;
}

// Helpers pour le classement des meilleurs 3es (format FIFA 2026 : 12 groupes, 8 qualifiés)
const thirdPlaceRank   = row => ({ key: teamKey(row.team), points: Number(row.points || 0), goalDifference: Number(row.goalDifference || 0), goalsFor: Number(row.goalsFor || 0) });
const compareThirdPlaced  = (a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor;
const sameThirdPlaceRank  = (a, b) => a.points === b.points && a.goalDifference === b.goalDifference && a.goalsFor === b.goalsFor;

/**
 * Calcule l'ensemble des équipes éliminées selon le format FIFA 2026 :
 *  1. Phase de poule : les 4es de chaque groupe sont éliminés (si le groupe est complet)
 *  2. Si les 12 groupes sont complets : les 4 moins bons 3es parmi les 12 sont éliminés
 *  3. Phase à élimination directe : le perdant de chaque match KO est éliminé
 *
 * @param {array} standings  Classements de l'API
 * @param {array} matches    Matchs de l'API
 * @returns {string[]}       Tableau de clés d'équipes éliminées
 */
function computeEliminatedTeams(standings, matches) {
  const eliminated = new Set();

  // ── Étape 1 : élimination en phase de poule ────────────────────────────
  const completedGroups = standings.filter(groupIsComplete);

  completedGroups.forEach(group => {
    (group.table || []).forEach(row => {
      // Dans un groupe de 4 : les 4es sont éliminés directement
      if (Number(row.position || 0) > 3) {
        const key = teamKey(row.team);
        if (key) eliminated.add(key);
      }
    });
  });

  // ── Étape 2 : classement des 3es (si tous les 12 groupes sont terminés) ─
  // Format 2026 : sur 12 troisièmes, les 8 meilleurs se qualifient pour les 1/16
  if (completedGroups.length === 12) {
    const thirdPlaced = completedGroups
      .map(group => (group.table || []).find(row => Number(row.position || 0) === 3))
      .filter(Boolean)
      .map(thirdPlaceRank)
      .filter(row => row.key)
      .sort(compareThirdPlaced);

    const cutoff = thirdPlaced[7]; // 8e meilleur 3e = dernier qualifié

    // Tous ceux après le 8e, sauf égalité parfaite avec le cutoff, sont éliminés
    thirdPlaced.slice(8).forEach(row => {
      if (!cutoff || !sameThirdPlaceRank(row, cutoff)) {
        eliminated.add(row.key);
      }
    });
  }

  // ── Étape 3 : phase à élimination directe ─────────────────────────────
  matches.forEach(match => {
    const loser = knockoutLoser(match);
    const key   = loser ? teamKey(loser) : '';
    if (key) eliminated.add(key);
  });

  return [...eliminated];
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCHAIN MATCH & COMPTE À REBOURS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retourne le prochain match programmé dans state.matches.
 * Filtre les matchs SCHEDULED/TIMED dont la date est dans le futur proche (±1min).
 */
function getNextMatch() {
  const now = Date.now();
  return state.matches
    .filter(isUpcomingMatch)
    .filter(m => m.utcDate && new Date(m.utcDate).getTime() >= now - 60_000)
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0] || null;
}

function getNextWatchedMatch() {
  const now = Date.now();
  return state.matches
    .filter(isUpcomingMatch)
    .filter(m => m.utcDate && new Date(m.utcDate).getTime() >= now - 60_000)
    .filter(m => {
      const home = teamLookup(m.homeTeam);
      const away = teamLookup(m.awayTeam);
      return isWatchedName(home.name) || isWatchedName(away.name);
    })
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0] || null;
}

function getLiveMatch() {
  return state.matches
    .filter(isLiveMatch)
    .filter(match => !isAwaitingFinalConfirmation(match))
    .sort((a, b) => {
      const aWatched = matchHasWatchedTeam(a) ? 1 : 0;
      const bWatched = matchHasWatchedTeam(b) ? 1 : 0;
      return bWatched - aWatched || new Date(a.utcDate || 0) - new Date(b.utcDate || 0);
    })[0] || null;
}

function eventMinuteValue(event = {}) {
  const value = Number(event.minute ?? event.time ?? event.intTime);
  return Number.isFinite(value) ? value : 0;
}

function latestEventMinute(match = {}) {
  const scorers = Array.isArray(match.scorers) ? match.scorers : [];
  const cards = Array.isArray(match.cards) ? match.cards : [];
  return [...scorers, ...cards].reduce((max, event) => Math.max(max, eventMinuteValue(event)), 0);
}

function matchElapsedMinutes(match = {}) {
  const startedAt = Date.parse(match.utcDate || '');
  const sourceNow = Date.parse(state.generatedAt || '') || Date.now();
  if (!Number.isFinite(startedAt) || sourceNow < startedAt) return 0;
  return Math.floor((sourceNow - startedAt) / 60_000);
}

function isAwaitingFinalConfirmation(match = {}) {
  if (!isLiveMatch(match)) return false;
  const liveStatus = String(match.liveStatus || '').trim().toUpperCase();
  if (['ET', 'PEN'].includes(liveStatus)) return false;
  return liveStatus === '2H' && latestEventMinute(match) >= 90 && matchElapsedMinutes(match) >= 115;
}

function getAwaitingFinalMatch() {
  return state.matches
    .filter(isAwaitingFinalConfirmation)
    .sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0))[0] || null;
}

/**
 * Calcule et formate le temps restant avant une date ISO.
 * Retourne "Xj XXh XXm" ou "Coup d'envoi imminent" si < 1min.
 */
function countdownText(iso) {
  if (!iso) return 'Date à confirmer';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Coup d\'envoi imminent';
  const totalMinutes = Math.floor(diff / 60_000);
  const days    = Math.floor(totalMinutes / 1440);
  const hours   = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}j ${fmtTime(hours)}h ${fmtTime(minutes)}m`;
  return `${fmtTime(hours)}h ${fmtTime(minutes)}m`;
}

/**
 * Met à jour uniquement le compte à rebours (#nextCountdown) sans re-render complet.
 * Appelé chaque seconde par setInterval.
 */
function updateNextCountdown() {
  const countdown = document.querySelector('#nextCountdown');
  if (countdown) countdown.textContent = countdownText(nextMatchUtc);

  const watchedCountdown = document.querySelector('#watchedNextCountdown');
  if (watchedCountdown) watchedCountdown.textContent = countdownText(watchedNextMatchUtc);

  const liveCountdown = document.querySelector('#liveMatchCountdown');
  const liveMatch = getLiveMatch();
  const match = liveMatch || getNextMatch();
  if (liveCountdown && match) {
    if (isAwaitingFinalConfirmation(match)) {
      liveCountdown.textContent = 'Fin du match à confirmer';
    } else {
      liveCountdown.textContent = liveMatch ? liveClockText(match) : `Départ dans ${countdownText(match.utcDate)}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FONCTIONS DE RENDU — render*()
// Chaque fonction réécrit une partie du DOM à partir de `state`.
// ─────────────────────────────────────────────────────────────────────────────

/** Met à jour les 4 compteurs statistiques (équipes, matchs, joués, à venir) */
function renderStats() {
  const played = state.matches.filter(isFinishedMatch).length;
  const next   = state.matches.filter(isUpcomingMatch).length;
  els.teamCount.textContent   = state.teams.length;
  els.matchCount.textContent  = state.matches.length;
  els.playedCount.textContent = played;
  els.nextCount.textContent   = next;
}

/**
 * Affiche le widget "Prochain match" avec compte à rebours et fixture.
 * Met à jour nextMatchUtc pour le timer secondaire.
 */
function renderNextMatch() {
  const match = getNextMatch();

  if (!match) {
    nextMatchUtc = null;
    els.nextMatch.innerHTML = '<div class="next-placeholder">Aucun prochain match disponible.</div>';
    return;
  }

  nextMatchUtc   = match.utcDate || null;
  const home     = teamLookup(match.homeTeam);
  const away     = teamLookup(match.awayTeam);
  const metaParts = [matchMeta(match), match.venue].filter(Boolean).map(escapeHtml);

  els.nextMatch.innerHTML = `
    <div class="next-countdown">
      <span>Dans</span>
      <strong id="nextCountdown">${countdownText(nextMatchUtc)}</strong>
    </div>
    <div class="next-fixture">
      ${teamNameLine(home)}
      <span class="next-vs">vs</span>
      ${teamNameLine(away)}
    </div>
    <div class="next-meta">
      <span>${fmtDate(match.utcDate)}</span>
      ${metaParts.length ? `<span>${metaParts.join(' · ')}</span>` : ''}
    </div>
    ${broadcastBadgesHtml(match, 'is-hero')}`;
}

/**
 * Affiche les 3 pays suivis (France, Portugal, Congo) dans le widget hero.
 * Fallback sur des entrées textuelles si les équipes ne sont pas encore chargées.
 */
function renderWatchList() {
  const watchedTeams = state.teams.filter(t => isWatchedName(t.name || t.shortName || t.tla));
  // Fallback si l'API n'a pas encore retourné les équipes
  const display = watchedTeams.length
    ? watchedTeams
    : WATCHED.slice(0, 3).map(name => ({ name, tla: '---' }));

  els.watchList.innerHTML = display.slice(0, 5).map(t => `
    <div class="watch team-link" role="button" tabindex="0" data-team-id="${escapeHtml(teamDomId(t))}">
      ${teamVisual(t)}
      <span>
        <b>${escapeHtml(t.name || t.shortName)}</b>
        <small>${escapeHtml(t.area?.name || 'Suivi spécial')}</small>
      </span>
      <strong>${escapeHtml(t.tla || '')}</strong>
    </div>`).join('');
}

function renderViewLabels() {
  const home = activeView === 'home';
  const all = activeView === 'all';
  const toggleLabel = home ? 'Tournoi complet' : 'Mode filtré';

  if (els.groupsTitle) els.groupsTitle.textContent = home ? 'Groupes suivis' : 'Groupes';
  if (els.groupsHint) els.groupsHint.textContent = home
    ? 'France · Congo · Portugal'
    : 'Classements complets du tournoi';
  if (els.teamsTitle) els.teamsTitle.textContent = home ? 'Équipes suivies' : 'Équipes';
  if (els.modeNotice) els.modeNotice.classList.toggle('is-full', !home);
  if (els.modeNoticeLabel) els.modeNoticeLabel.textContent = home ? 'Mode filtré actif' : 'Mode complet actif';
  if (els.modeNoticeText) els.modeNoticeText.textContent = home
    ? 'Cette vue met en avant les équipes suivies, les prochains matchs et les moments importants. Passez en mode complet pour explorer tout le tournoi.'
    : 'Vous consultez tous les groupes, matchs, équipes et classements. Revenez au mode filtré pour retrouver la vue courte centrée sur les équipes suivies.';

  els.viewToggles.forEach(toggle => {
    toggle.textContent = toggle.classList.contains('mode-notice-action')
      ? (home ? 'Voir le tournoi complet' : 'Revenir au mode filtré')
      : toggleLabel;
    toggle.classList.toggle('is-full', !home);
    toggle.setAttribute('aria-label', home ? 'Passer au mode complet du tournoi' : 'Revenir au mode filtré');
  });

  els.navLinks.forEach(link => {
    link.classList.toggle('is-active', link.dataset.view === activeView || (all && link.dataset.view !== 'home'));
  });
}

function renderWatchedNextMatch() {
  const liveMatch = getLiveWatchedMatch();
  const match = liveMatch || getNextWatchedMatch();

  if (!match) {
    watchedNextMatchUtc = null;
    els.watchedNextMatch.innerHTML = `
      <div class="watched-next-empty">
        <strong>Aucun match programmé pour les équipes suivies.</strong>
        <span>Le bloc se mettra à jour dès qu'une affiche France, Portugal ou Congo sera disponible.</span>
      </div>`;
    return;
  }

  watchedNextMatchUtc = match.utcDate || null;
  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const watchedTeams = [home, away].filter(team => isWatchedName(team.name));
  const metaParts = [matchMeta(match), match.venue].filter(Boolean).map(escapeHtml);
  const isLive = Boolean(liveMatch);
  const discipline = disciplineSummary(match);

  els.watchedNextMatch.innerHTML = `
    <article class="watched-next-card ${isLive ? 'is-live' : ''}">
      <div class="watched-next-time">
        <span>${isLive ? 'En direct' : 'Dans'}</span>
        <strong id="watchedNextCountdown">${isLive ? liveScoreText(match) : countdownText(watchedNextMatchUtc)}</strong>
        <small>${isLive ? liveMinuteText(match) : fmtDate(match.utcDate)}</small>
      </div>
      <div class="watched-next-main">
        <div class="watched-next-label">
          ${watchedTeams.map(team => `<span>${escapeHtml(team.name || team.shortName || 'Équipe suivie')}</span>`).join('')}
        </div>
        <div class="watched-next-fixture">
          ${teamNameLine(home)}
          <span class="versus">vs</span>
          ${teamNameLine(away)}
        </div>
        ${metaParts.length ? `<div class="watched-next-meta">${metaParts.join(' · ')}</div>` : ''}
        ${isLive ? `<div class="live-discipline">${discipline}</div>` : ''}
        ${broadcastBadgesHtml(match)}
      </div>
      <a class="watched-next-link" href="#matchs" data-view="matches">${isLive ? 'Live' : 'Calendrier'}</a>
    </article>`;
}

function getLiveWatchedMatch() {
  return state.matches.find(match =>
    isLiveMatch(match) &&
    !isAwaitingFinalConfirmation(match) &&
    matchHasWatchedTeam(match)
  ) || null;
}

function liveScoreText(match) {
  const goals = readMatchScore(match);
  return goals ? `${goals.home} - ${goals.away}` : scoreText(match);
}

function liveElapsedMinute(match) {
  const startedAt = Date.parse(match.utcDate || '');
  const sourceNow = Date.parse(state.generatedAt || '') || Date.now();
  if (!Number.isFinite(startedAt) || sourceNow < startedAt) return null;

  const elapsed = Math.max(1, Math.floor((sourceNow - startedAt) / 60_000) + 1);
  const liveStatus = String(match.liveStatus || '').trim().toUpperCase();

  if (liveStatus === '1H') return Math.min(elapsed, 45);
  if (liveStatus === '2H') return Math.min(Math.max(46, elapsed - 14), 90);
  if (liveStatus === 'ET') return Math.min(Math.max(91, elapsed - 29), 120);

  return elapsed;
}

function liveClockText(match) {
  const liveStatus = String(match.liveStatus || '').trim().toUpperCase();
  const apiMinute = Number(match.minute ?? match.currentMinute ?? match.matchMinute);
  const minuteText = Number.isFinite(apiMinute) ? `${apiMinute}e minute` : '';

  if (isAwaitingFinalConfirmation(match)) return 'Fin du match à confirmer';
  if (liveStatus === 'HT') return 'Mi-temps';
  if (liveStatus === 'PEN') return 'Tirs au but';
  if (liveStatus === '1H') return minuteText ? `${minuteText} · 1re mi-temps` : '1re mi-temps';
  if (liveStatus === '2H') return minuteText ? `${minuteText} · 2e mi-temps` : '2e mi-temps';
  if (liveStatus === 'ET') return minuteText ? `${minuteText} · Prolongation` : 'Prolongation';
  if (effectiveMatchStatus(match) === 'PAUSED') return 'Pause';
  return minuteText || 'En direct';
}

function liveMinuteText(match) {
  if (effectiveMatchStatus(match) === 'PAUSED') return 'Mi-temps ou pause';
  const minute = match.minute ?? match.currentMinute ?? match.matchMinute;
  const liveStatus = String(match.liveStatus || '').trim().toUpperCase();
  if (Number.isFinite(Number(minute))) return `${Number(minute)}e minute`;
  if (liveStatus === '1H') return '1re mi-temps';
  if (liveStatus === '2H') return '2e mi-temps';
  if (liveStatus === 'HT') return 'Mi-temps';
  if (liveStatus === 'ET') return 'Prolongation';
  if (liveStatus === 'PEN') return 'Tirs au but';
  return 'Score en cours';
}

function disciplineSummary(match) {
  const cards = collectCards(match);
  if (!cards.yellow && !cards.red) return 'Cartons : aucun signalé';
  const parts = [];
  if (cards.yellow) parts.push(`jaunes ${cards.yellow}`);
  if (cards.red) parts.push(`rouges ${cards.red}`);
  return `Cartons : ${parts.join(' · ')}`;
}

function collectCards(match) {
  const cards = { yellow: 0, red: 0 };
  const buckets = [match.cards, match.bookings, match.discipline, match.incidents].filter(Array.isArray);

  buckets.flat().forEach(item => {
    const type = norm(item?.type || item?.card || item?.detail || item?.reason);
    if (type.includes('yellow') || type.includes('jaune')) cards.yellow += 1;
    if (type.includes('red') || type.includes('rouge')) cards.red += 1;
  });

  ['homeTeam', 'awayTeam'].forEach(side => {
    const team = match[side] || {};
    cards.yellow += Number(team.yellowCards || team.yellows || 0);
    cards.red += Number(team.redCards || team.reds || 0);
  });

  return cards;
}

function renderLiveMatch() {
  if (!els.liveMatch) return;

  const live = getLiveMatch();
  const awaitingFinal = getAwaitingFinalMatch();
  const match = live || awaitingFinal || getNextMatch();

  if (!match) {
    if (els.liveMatchTitle) els.liveMatchTitle.textContent = 'Live du match';
    els.liveMatch.innerHTML = `
      <article class="live-match-card is-empty">
        <span class="live-match-kicker">Live</span>
        <strong>Aucun match en cours</strong>
        <small>Le score live apparaîtra ici dès qu’un match sera en direct.</small>
      </article>`;
    return;
  }

  const home = teamLookup(match.homeTeam);
  const away = teamLookup(match.awayTeam);
  const metaParts = [matchMeta(match), match.venue].filter(Boolean).map(escapeHtml);
  const isLive = Boolean(live);
  const isAwaitingFinal = !isLive && Boolean(awaitingFinal);
  if (els.liveMatchTitle) {
    els.liveMatchTitle.textContent = isLive
      ? 'Match en direct'
      : (isAwaitingFinal ? 'Fin du match à confirmer' : 'Prochain match');
  }

  els.liveMatch.innerHTML = `
    <article class="live-match-card ${isLive ? 'is-live' : ''} ${isAwaitingFinal ? 'is-live is-pending-final' : ''}">
      <div class="live-match-main">
        <div class="live-match-topline">
          <span class="live-match-kicker">${isLive ? 'Match en cours' : (isAwaitingFinal ? 'Score final probable' : 'Prochain match en live')}</span>
          <span class="live-pulse-badge ${isLive ? 'is-active' : ''}">
            <span aria-hidden="true"></span>
            ${isLive ? 'LIVE' : (isAwaitingFinal ? 'À confirmer' : 'À venir')}
          </span>
        </div>
        <div class="live-match-teams">
          ${teamNameLine(home)}
          <span class="versus">vs</span>
          ${teamNameLine(away)}
        </div>
        ${metaParts.length ? `<small>${metaParts.join(' · ')}</small>` : ''}
        ${isLive || isAwaitingFinal ? liveEventsSummaryHtml(match) : ''}
        ${broadcastBadgesHtml(match)}
        ${matchDetailButtonHtml(match, 'is-compact')}
      </div>
      <div class="live-match-score">
        <strong>${isLive || isAwaitingFinal ? liveScoreText(match) : scoreText(match)}</strong>
        ${isLive || isAwaitingFinal ? '' : `<small>${fmtDate(match.utcDate)}</small>`}
        <small id="liveMatchCountdown" class="${isLive || isAwaitingFinal ? 'live-clock-badge' : 'live-match-countdown'}">${isLive ? liveClockText(match) : (isAwaitingFinal ? 'Fin du match à confirmer' : `Départ dans ${countdownText(match.utcDate)}`)}</small>
      </div>
    </article>`;
}

function dashboardStatsLimits() {
  const resultCount = Math.max(1, Number(state.dashboardResultCount || 3));
  return {
    efficiency: clamp(Math.floor(resultCount * 1.25), 3, 6),
    scorers: clamp(Math.floor(resultCount * 1.7), 4, 8),
  };
}

function statsMoreButton(hiddenCount) {
  if (hiddenCount <= 0) return '';
  return `
    <button class="stats-more" type="button" data-stats-modal>
      Voir toutes les stats <span>+${hiddenCount}</span>
    </button>`;
}

function computeTournamentEfficiencyRanking() {
  const played = state.matches.filter(match => isFinishedMatch(match) || isLiveMatch(match));
  const teams = new Map();

  played.forEach(match => {
    const goals = readMatchScore(match);
    if (!goals) return;
    const homeGoals = goals.home;
    const awayGoals = goals.away;

    [
      [match.homeTeam, match.awayTeam, homeGoals, awayGoals],
      [match.awayTeam, match.homeTeam, awayGoals, homeGoals],
    ].forEach(([team, opponent, goalsFor, goalsAgainst]) => {
      const full = teamLookup(team);
      const opponentFull = teamLookup(opponent);
      const performance = matchEfficiencyRating(full, opponentFull, goalsFor, goalsAgainst);
      const key = teamDomId(full) || norm(full.name || full.shortName || '');
      const current = teams.get(key) || {
        team: full,
        played: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        noteTotal: 0,
        difficultyTotal: 0,
        expectedTotal: 0,
      };

      current.played += 1;
      current.goalsFor += goalsFor;
      current.goalsAgainst += goalsAgainst;
      current.points += goalsFor > goalsAgainst ? 3 : (goalsFor === goalsAgainst ? 1 : 0);
      current.noteTotal += performance.note;
      current.difficultyTotal += performance.difficulty;
      current.expectedTotal += performance.expected;
      teams.set(key, current);
    });
  });

  return [...teams.values()]
    .map(row => ({
      ...row,
      average: row.played ? row.goalsFor / row.played : 0,
      difference: row.goalsFor - row.goalsAgainst,
      averageDifficulty: row.played ? row.difficultyTotal / row.played : 0,
      averageExpected: row.played ? row.expectedTotal / row.played : 0,
      efficiencyRating: row.played ? row.noteTotal / row.played : 0,
    }))
    .sort((a, b) =>
      b.efficiencyRating - a.efficiencyRating ||
      b.averageDifficulty - a.averageDifficulty ||
      b.goalsFor - a.goalsFor ||
      b.difference - a.difference
    );
}

function computeTopScorersRanking() {
  const scorers = new Map();
  state.matches
    .filter(match => (isFinishedMatch(match) || isLiveMatch(match)) && Array.isArray(match.scorers))
    .forEach(match => {
      match.scorers.forEach(goal => {
        const player = String(goal.player || '').trim();
        if (!player) return;
        if (isOwnGoalEvent(goal)) return;

        const team = String(goal.team || '').trim();
        const key = `${norm(player)}|${norm(team)}`;
        const current = scorers.get(key) || {
          player,
          team,
          goals: 0,
          assists: 0,
          latestMinute: 0,
        };

        current.goals += 1;
        if (goal.assist) current.assists += 1;
        if (Number.isFinite(goal.minute)) current.latestMinute = Math.max(current.latestMinute, goal.minute);
        scorers.set(key, current);
      });
    });

  return [...scorers.values()]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player.localeCompare(b.player, 'fr'));
}

function addPlayerPerformance(players, playerName, teamName, impact, matchId) {
  const player = String(playerName || '').trim();
  if (!player) return;
  const team = String(teamName || '').trim();
  const key = `${norm(player)}|${norm(team)}`;
  const current = players.get(key) || {
    player,
    team,
    goals: 0,
    assists: 0,
    points: 0,
    difficultyTotal: 0,
    decisiveMatches: new Set(),
  };

  current.goals += impact.goals || 0;
  current.assists += impact.assists || 0;
  current.points += impact.points || 0;
  current.difficultyTotal += impact.difficulty || 0;
  if (matchId) current.decisiveMatches.add(matchId);
  players.set(key, current);
}

function computePlayerPerformanceRanking() {
  const players = new Map();

  state.matches
    .filter(match => (isFinishedMatch(match) || isLiveMatch(match)) && Array.isArray(match.scorers))
    .forEach(match => {
      const homeName = teamLookup(match.homeTeam).name || match.homeTeam?.name || 'home';
      const awayName = teamLookup(match.awayTeam).name || match.awayTeam?.name || 'away';
      const matchId = match.id || match.utcDate || `${homeName}-${awayName}`;
      match.scorers.forEach(goal => {
        if (isOwnGoalEvent(goal)) return;
        const team = eventTeamObject(match, goal);
        const opponent = opponentForTeamInMatch(match, team);
        const score = scoreForTeamInMatch(match, team);
        const goalsFor = score?.goalsFor ?? 0;
        const goalsAgainst = score?.goalsAgainst ?? 0;
        const matchPerformance = team && opponent && score
          ? matchEfficiencyRating(team, opponent, goalsFor, goalsAgainst)
          : { difficulty: 60 };
        const difficulty = matchPerformance.difficulty || 60;
        const minute = Number(goal.minute);
        const lateBonus = Number.isFinite(minute) && minute >= 75 ? 4 : 0;
        const tightGameBonus = Math.abs(goalsFor - goalsAgainst) <= 1 ? 6 : 0;
        const winBonus = goalsFor > goalsAgainst ? 4 : (goalsFor === goalsAgainst ? 2 : 0);
        const scorerTeam = goal.team || team?.name || team?.shortName || '';

        addPlayerPerformance(players, goal.player, scorerTeam, {
          goals: 1,
          points: 24 + (difficulty * 0.12) + tightGameBonus + winBonus + lateBonus,
          difficulty,
        }, matchId);

        if (goal.assist) {
          addPlayerPerformance(players, goal.assist, scorerTeam, {
            assists: 1,
            points: 15 + (difficulty * 0.08) + (tightGameBonus * 0.45) + (winBonus * 0.45),
            difficulty,
          }, matchId);
        }
      });
    });

  const rows = [...players.values()].map(row => {
    const matchCount = Math.max(1, row.decisiveMatches.size);
    const decisiveActions = row.goals + row.assists;
    const averageImpact = row.points / matchCount;
    const volumeBonus = clamp((decisiveActions - matchCount) * 1.8, 0, 6);
    const rawNote = 42 + (averageImpact * 0.82) + volumeBonus;
    return {
      ...row,
      matchCount,
      averageDifficulty: row.difficultyTotal / Math.max(1, decisiveActions),
      performanceRating: clamp(rawNote, 45, 98),
    };
  });
  const baseline = rows.length
    ? rows.reduce((total, row) => total + row.performanceRating, 0) / rows.length
    : 0;

  return rows
    .map(row => ({
      ...row,
      delta: row.performanceRating - baseline,
    }))
    .sort((a, b) =>
      b.performanceRating - a.performanceRating ||
      (b.goals + b.assists) - (a.goals + a.assists) ||
      b.averageDifficulty - a.averageDifficulty ||
      a.player.localeCompare(b.player, 'fr')
    );
}

function efficiencyCard(row, index) {
  const teamId = teamDomId(row.team);
  return `
    <article class="efficiency-card ${index === 0 ? 'is-leader' : ''}">
      <span class="efficiency-rank">${index + 1}</span>
      <div class="efficiency-team">
        ${teamVisual(row.team)}
        <div>
          <button class="efficiency-team-link" type="button" data-team-id="${escapeHtml(teamId)}">${escapeHtml(row.team.name || row.team.shortName || 'Équipe')}</button>
          <small>${row.goalsFor} but${row.goalsFor > 1 ? 's' : ''} · ${row.played} match${row.played > 1 ? 's' : ''} · diff ${row.difference > 0 ? '+' : ''}${row.difference}</small>
        </div>
      </div>
      <div class="efficiency-score">
        <strong>${Math.round(row.efficiencyRating)}</strong>
        <span>note</span>
      </div>
      <div class="efficiency-breakdown">
        <span>Matchs <strong>${row.played}</strong></span>
        <span>Adversité <strong>${Math.round(row.averageDifficulty)}</strong></span>
      </div>
    </article>`;
}

function topScorerCard(scorer, index) {
  return `
    <article class="top-scorer ${index === 0 ? 'is-leader' : ''}">
      <span class="top-scorer-rank">${index + 1}</span>
      <div class="top-scorer-main">
        <strong>${escapeHtml(scorer.player)}</strong>
        <small>${escapeHtml(scorer.team || 'Sélection non précisée')}</small>
      </div>
      <div class="top-scorer-goals">
        <strong>${scorer.goals}</strong>
        <span>but${scorer.goals > 1 ? 's' : ''}</span>
      </div>
    </article>`;
}

function playerPerformanceCard(player, index) {
  const delta = Math.round(player.delta || 0);
  const deltaText = `${delta >= 0 ? '+' : ''}${delta}`;
  const matchText = `${player.matchCount} match${player.matchCount > 1 ? 's' : ''}`;
  return `
    <article class="player-performance ${index === 0 ? 'is-leader' : ''}">
      <span class="top-scorer-rank">${index + 1}</span>
      <div class="top-scorer-main">
        <strong>${escapeHtml(player.player)}</strong>
        <small>${escapeHtml(player.team || 'Sélection non précisée')} · ${escapeHtml(matchText)} · ${player.goals} but${player.goals > 1 ? 's' : ''} · ${player.assists} passe${player.assists > 1 ? 's' : ''}</small>
      </div>
      <div class="player-performance-score">
        <strong>${Math.round(player.performanceRating)}</strong>
        <span>${escapeHtml(deltaText)}</span>
      </div>
    </article>`;
}

function renderTodayResults() {
  if (!els.todayResults) return;

  const today = parisDateKey();
  const todaysFinished = state.matches
    .filter(match => parisDateKey(match.utcDate) === today && isFinishedMatch(match))
    .sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0));

  const list = todaysFinished.length
    ? todaysFinished
    : state.matches
        .filter(isFinishedMatch)
        .sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0))
        .slice(0, 3);
  state.dashboardResultCount = Math.max(1, list.length);

  if (els.todayResultsHint) {
    els.todayResultsHint.textContent = todaysFinished.length
      ? `${todaysFinished.length} résultat${todaysFinished.length > 1 ? 's' : ''} aujourd'hui.`
      : 'Derniers résultats disponibles.';
  }

  els.todayResults.innerHTML = list.length
    ? list.map(match => compactMatchCard(match, 'is-result')).join('')
    : '<div class="daily-empty">Aucun résultat disponible pour le moment.</div>';
}

function renderTournamentStats() {
  if (!els.tournamentStats) return;

  const played = state.matches.filter(match => isFinishedMatch(match) || isLiveMatch(match));
  const teams = new Map();

  played.forEach(match => {
    const goals = readMatchScore(match);
    if (!goals) return;
    const homeGoals = goals.home;
    const awayGoals = goals.away;

    [
      [match.homeTeam, match.awayTeam, homeGoals, awayGoals],
      [match.awayTeam, match.homeTeam, awayGoals, homeGoals],
    ].forEach(([team, opponent, goalsFor, goalsAgainst]) => {
      const full = teamLookup(team);
      const opponentFull = teamLookup(opponent);
      const performance = matchEfficiencyRating(full, opponentFull, goalsFor, goalsAgainst);
      const key = teamDomId(full) || norm(full.name || full.shortName || '');
      const current = teams.get(key) || {
        team: full,
        played: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        noteTotal: 0,
        difficultyTotal: 0,
        expectedTotal: 0,
      };

      current.played += 1;
      current.goalsFor += goalsFor;
      current.goalsAgainst += goalsAgainst;
      current.points += goalsFor > goalsAgainst ? 3 : (goalsFor === goalsAgainst ? 1 : 0);
      current.noteTotal += performance.note;
      current.difficultyTotal += performance.difficulty;
      current.expectedTotal += performance.expected;
      teams.set(key, current);
    });
  });

  const ranking = [...teams.values()]
    .map(row => ({
      ...row,
      average: row.played ? row.goalsFor / row.played : 0,
      difference: row.goalsFor - row.goalsAgainst,
      averageDifficulty: row.played ? row.difficultyTotal / row.played : 0,
      averageExpected: row.played ? row.expectedTotal / row.played : 0,
      efficiencyRating: row.played ? row.noteTotal / row.played : 0,
    }))
    .sort((a, b) =>
      b.efficiencyRating - a.efficiencyRating ||
      b.averageDifficulty - a.averageDifficulty ||
      b.goalsFor - a.goalsFor ||
      b.difference - a.difference
    )
    .slice(0, dashboardStatsLimits().efficiency);

  if (!ranking.length) {
    els.tournamentStats.innerHTML = '<div class="efficiency-empty">Les équipes les plus efficaces apparaîtront après les premiers matchs terminés.</div>';
    return;
  }

  els.tournamentStats.innerHTML = ranking.map((row, index) => `
    <article class="efficiency-card ${index === 0 ? 'is-leader' : ''}">
      <span class="efficiency-rank">${index + 1}</span>
      <div class="efficiency-team">
        ${teamVisual(row.team)}
        <div>
          <button class="efficiency-team-link" type="button" data-team-id="${escapeHtml(teamDomId(row.team))}">${escapeHtml(row.team.name || row.team.shortName || 'Équipe')}</button>
          <small>${row.goalsFor} but${row.goalsFor > 1 ? 's' : ''} · ${row.played} match${row.played > 1 ? 's' : ''} · diff ${row.difference > 0 ? '+' : ''}${row.difference}</small>
        </div>
      </div>
      <div class="efficiency-score">
        <strong>${Math.round(row.efficiencyRating)}</strong>
        <span>note</span>
      </div>
      <div class="efficiency-breakdown">
        <span>Matchs <strong>${row.played}</strong></span>
        <span>Adversité <strong>${Math.round(row.averageDifficulty)}</strong></span>
      </div>
    </article>`).join('') + statsMoreButton(computeTournamentEfficiencyRanking().length - ranking.length);
}
function renderTopScorers() {
  if (!els.topScorers) return;

  const scorers = new Map();
  state.matches
    .filter(match => (isFinishedMatch(match) || isLiveMatch(match)) && Array.isArray(match.scorers))
    .forEach(match => {
      match.scorers.forEach(goal => {
        const player = String(goal.player || '').trim();
        if (!player) return;
        if (isOwnGoalEvent(goal)) return;

        const team = String(goal.team || '').trim();
        const key = `${norm(player)}|${norm(team)}`;
        const current = scorers.get(key) || {
          player,
          team,
          goals: 0,
          assists: 0,
          latestMinute: 0,
        };

        current.goals += 1;
        if (goal.assist) current.assists += 1;
        if (Number.isFinite(goal.minute)) current.latestMinute = Math.max(current.latestMinute, goal.minute);
        scorers.set(key, current);
      });
    });

  const ranking = [...scorers.values()]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.player.localeCompare(b.player, 'fr'))
    .slice(0, dashboardStatsLimits().scorers);

  if (!ranking.length) {
    els.topScorers.innerHTML = '<div class="top-scorers-empty">Le classement apparaîtra après les premiers buts confirmés.</div>';
    return;
  }

  els.topScorers.innerHTML = ranking.map((scorer, index) => `
    <article class="top-scorer ${index === 0 ? 'is-leader' : ''}">
      <span class="top-scorer-rank">${index + 1}</span>
      <div class="top-scorer-main">
        <strong>${escapeHtml(scorer.player)}</strong>
        <small>${escapeHtml(scorer.team || 'Sélection non précisée')}</small>
      </div>
      <div class="top-scorer-goals">
        <strong>${scorer.goals}</strong>
        <span>but${scorer.goals > 1 ? 's' : ''}</span>
      </div>
    </article>`).join('') + statsMoreButton(computeTopScorersRanking().length - ranking.length);
}

/**
 * Affiche la grille des classements par groupe.
 * Si aucun classement n'est disponible, affiche un message d'attente.
 */
function renderGroups() {
  if (!state.standings.length) {
    els.groups.innerHTML = '<div class="empty">Les classements apparaîtront dès la publication officielle des groupes.</div>';
    return;
  }

  const groups = ['groups', 'all'].includes(activeView)
    ? state.standings
    : state.standings
        .filter(group => (group.table || []).some(row => isWatchedName(teamLookup(row.team).name)));

  if (!groups.length) {
    els.groups.innerHTML = '<div class="empty">Les groupes de France, Congo et Portugal apparaîtront ici dès leur publication.</div>';
    return;
  }

  els.groups.innerHTML = groups.map(group => `
    <article class="group-card">
      <h3>${escapeHtml(humanLabel(group.group || group.stage || 'Groupe'))}</h3>
      <table>
        <thead>
          <tr><th>#</th><th>Équipe</th><th>Pts</th><th>J</th><th>BP</th><th>BC</th><th>Diff.</th></tr>
        </thead>
        <tbody>
          ${(group.table || []).map(row => {
            const team      = teamLookup(row.team);
            const eliminated = isEliminatedTeam(team);
            return `<tr class="${isWatchedName(team.name) ? 'fav' : ''} ${eliminated ? 'eliminated-row' : ''}">
              <td data-label="#">${row.position ?? ''}</td>
              <td data-label="Équipe">${teamNameLine(team)}${eliminated ? '<span class="eliminated-badge">✕ Éliminée</span>' : ''}</td>
              <td data-label="Pts"><b>${row.points ?? 0}</b></td>
              <td data-label="J">${row.playedGames ?? 0}</td>
              <td data-label="BP">${row.goalsFor ?? 0}</td>
              <td data-label="BC">${row.goalsAgainst ?? 0}</td>
              <td data-label="Diff.">${row.goalDifference ?? 0}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </article>`).join('');
}

function finalStageSlotSort(slot) {
  const months = { juin: 6, juillet: 7 };
  const match = String(slot.date || '').match(/(\d{1,2})\s+([a-zû]+)\s+·\s+(\d{2}):(\d{2})/i);
  if (!match) return 999999;
  const [, day, month, hour, minute] = match;
  return (months[month.toLowerCase()] || 9) * 1_000_000 + Number(day) * 10_000 + Number(hour) * 100 + Number(minute);
}

function finalStageMatchesBySlot() {
  const map = new Map();
  const stages = [...new Set(FINAL_STAGE_SLOTS.map(slot => slot.stage))];

  stages.forEach(stage => {
    const slots = FINAL_STAGE_SLOTS
      .filter(slot => slot.stage === stage)
      .sort((a, b) => finalStageSlotSort(a) - finalStageSlotSort(b));
    const matches = state.matches
      .filter(match => match.stage === stage)
      .sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));

    slots.forEach((slot, index) => {
      if (matches[index]) map.set(slot.matchNo.replace(/\D/g, ''), matches[index]);
    });
  });

  return map;
}

function groupLetter(group = '') {
  const match = String(group).match(/([A-L])$/i);
  return match ? match[1].toUpperCase() : '';
}

function standingRowBySeed(group, position) {
  const standing = state.standings.find(item => groupLetter(item.group || item.stage || '') === group);
  return (standing?.table || []).find(row => Number(row.position) === position) || null;
}

function finalStageGroupComplete(group) {
  const standing = state.standings.find(item => groupLetter(item.group || item.stage || '') === group);
  const rows = standing?.table || [];
  return rows.length > 0 && rows.every(row => Number(row.playedGames || 0) >= 3);
}

function standingLine(row, group) {
  if (!row) return '';
  const points = Number(row.points || 0);
  const played = Number(row.playedGames || 0);
  const diff = Number(row.goalDifference || 0);
  return `${points} pt${points > 1 ? 's' : ''}, ${played} match${played > 1 ? 's' : ''}, diff. ${diff > 0 ? '+' : ''}${diff} du groupe ${group}`;
}

function bestThirdCandidate(groups) {
  const candidates = state.standings
    .map(standing => {
      const group = groupLetter(standing.group || standing.stage || '');
      const row = (standing.table || []).find(item => Number(item.position) === 3);
      return group && row && groups.includes(group) ? { group, row } : null;
    })
    .filter(Boolean)
    .sort((a, b) =>
      Number(b.row.points || 0) - Number(a.row.points || 0) ||
      Number(b.row.goalDifference || 0) - Number(a.row.goalDifference || 0) ||
      Number(b.row.goalsFor || 0) - Number(a.row.goalsFor || 0) ||
      a.group.localeCompare(b.group, 'fr')
    );

  return candidates[0] || null;
}

function teamLabelFromRow(row) {
  const team = row ? teamLookup(row.team) : null;
  const name = team?.shortName || team?.name || row?.team?.shortName || row?.team?.name || '';
  return { team, name };
}

function finalStageProbableLine(row, group, name) {
  const stats = standingLine(row, group);
  return name && stats ? `${name} (${stats})` : stats;
}

function finalStageSeedLabel(seed) {
  const clean = String(seed || '').trim();
  const direct = clean.match(/^([12])([A-L])$/i);
  if (direct) {
    const position = Number(direct[1]);
    const group = direct[2].toUpperCase();
    const row = standingRowBySeed(group, position);
    const resolved = teamLabelFromRow(row);
    const probable = finalStageProbableLine(row, group, resolved.name);
    const confirmed = finalStageGroupComplete(group);
    return {
      label: confirmed && resolved.name ? resolved.name : `${position === 1 ? '1er' : '2e'} gr. ${group}`,
      help: row ? `${position === 1 ? (confirmed ? 'Vainqueur' : 'Vainqueur probable') : (confirmed ? 'Deuxième' : 'Deuxième probable')} du groupe ${group} : ${probable}.` : `${position === 1 ? 'Vainqueur' : 'Deuxième'} du groupe ${group}.`,
      team: confirmed ? resolved.team : null,
    };
  }

  const third = clean.match(/^3e\s+([A-L]+)$/i);
  if (third) {
    const groups = third[1].toUpperCase().split('');
    const candidate = bestThirdCandidate(groups);
    if (candidate) {
      const resolved = teamLabelFromRow(candidate.row);
      const probable = finalStageProbableLine(candidate.row, candidate.group, resolved.name);
      const confirmed = groups.every(finalStageGroupComplete);
      return {
        label: confirmed && resolved.name ? resolved.name : `3e gr. ${groups.join('/')}`,
        help: `Meilleur troisième ${confirmed ? 'confirmé' : 'probable'} parmi les groupes ${groups.join(', ')} : ${probable}.`,
        team: confirmed ? resolved.team : null,
      };
    }

    return {
      label: `3e gr. ${groups.join('/')}`,
      help: `Meilleur troisième issu des groupes ${groups.join(', ')}.`,
      team: null,
    };
  }

  const winner = clean.match(/^V(\d+)$/i);
  if (winner) return { label: `Vainq. M${winner[1]}`, help: `Vainqueur du match n°${winner[1]}.`, team: null };

  const loser = clean.match(/^P(\d+)$/i);
  if (loser) return { label: `Perd. M${loser[1]}`, help: `Perdant du match n°${loser[1]}.`, team: null };

  return { label: clean || 'À confirmer', help: '', team: null };
}

function finalStageMatchWinner(match, loser = false) {
  const goals = readMatchScore(match);
  if (!goals || goals.home === goals.away) return null;
  const homeWins = goals.home > goals.away;
  return loser
    ? teamLookup(homeWins ? match.awayTeam : match.homeTeam)
    : teamLookup(homeWins ? match.homeTeam : match.awayTeam);
}

function finalStageResolveSeed(seed, matchMap) {
  const clean = String(seed || '').trim();
  const ref = clean.match(/^([VP])(\d+)$/i);
  if (ref) {
    const match = matchMap.get(ref[2]);
    const team = match ? finalStageMatchWinner(match, ref[1].toUpperCase() === 'P') : null;
    if (team?.name || team?.shortName) {
      return {
        label: team.shortName || team.name,
        help: `${ref[1].toUpperCase() === 'P' ? 'Perdant' : 'Vainqueur'} du match n°${ref[2]}.`,
        team,
      };
    }
  }

  return finalStageSeedLabel(clean);
}

function finalStageTeamHtml(entry, score) {
  const scoreText = score === null || score === undefined ? '-' : String(score);
  const help = entry.help ? ` data-final-tooltip="${escapeHtml(entry.help)}" aria-label="${escapeHtml(entry.help)}"` : '';
  const teamId = entry.team ? teamDomId(entry.team) : '';
  const name = escapeHtml(entry.label || 'À confirmer');
  const nameHtml = teamId
    ? `<button class="final-stage-team-name${entry.help ? ' has-help' : ''}" type="button" data-team-id="${escapeHtml(teamId)}"${help}>${name}</button>`
    : `<span class="final-stage-team-name${entry.help ? ' has-help' : ''}" tabindex="${entry.help ? '0' : '-1'}"${help}>${name}</span>`;

  return `<div class="final-stage-team">${nameHtml}<strong>${escapeHtml(scoreText)}</strong></div>`;
}

function renderFinalStage() {
  if (!els.finalStageBracket) return;

  const matchMap = finalStageMatchesBySlot();
  const matches = FINAL_STAGE_SLOTS.map(slot => {
    const match = matchMap.get(slot.matchNo.replace(/\D/g, ''));
    const goals = readMatchScore(match || {});
    const home = (match?.homeTeam?.name || match?.homeTeam?.shortName)
      ? { label: match.homeTeam.shortName || match.homeTeam.name, help: '', team: teamLookup(match.homeTeam) }
      : finalStageResolveSeed(slot.home, matchMap);
    const away = (match?.awayTeam?.name || match?.awayTeam?.shortName)
      ? { label: match.awayTeam.shortName || match.awayTeam.name, help: '', team: teamLookup(match.awayTeam) }
      : finalStageResolveSeed(slot.away, matchMap);

    return `
      <article class="final-stage-match ${isLiveMatch(match || {}) ? 'is-live' : ''} ${slot.stage === 'FINAL' ? 'is-final' : ''}" style="--x:${slot.x}px; --y:${slot.y}px">
        <div class="final-stage-match-top">
          <span>${escapeHtml(slot.matchNo)}</span>
          <time>${escapeHtml(slot.date)}</time>
        </div>
        ${finalStageTeamHtml(home, goals?.home)}
        ${finalStageTeamHtml(away, goals?.away)}
      </article>`;
  }).join('');

  els.finalStageBracket.innerHTML = `
    <div class="final-stage-scroll" role="region" aria-label="Tableau complet de la phase finale" tabindex="0">
      <div class="final-stage-field">
        ${FINAL_STAGE_HEADERS.map(header => `<h3 class="final-stage-title" style="--x:${header.x}px">${escapeHtml(header.label)}</h3>`).join('')}
        ${matches}
      </div>
    </div>`;

  fitFinalStageBracket();
}

function fitFinalStageBracket() {
  const scroll = els.finalStageBracket?.querySelector('.final-stage-scroll');
  const field = els.finalStageBracket?.querySelector('.final-stage-field');
  if (!scroll || !field) return;

  const width = 1240;
  const height = 704;
  const styles = window.getComputedStyle(scroll);
  const horizontalPadding = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const availableWidth = Math.max(scroll.clientWidth - horizontalPadding - 2, 280);
  const scale = Math.min(1, availableWidth / width);
  field.style.transform = `scale(${scale})`;
  field.style.marginLeft = scale < 1 ? '0' : 'auto';
  field.style.marginRight = scale < 1 ? '0' : 'auto';
  scroll.style.height = `${Math.ceil(height * scale) + 18}px`;
}

/**
 * Affiche la liste des matchs filtrée par le champ de recherche.
 * Les matchs des pays suivis ont une bordure dorée (classe .fav).
 * Triés par date croissante, avec pagination "Voir plus" (MATCHES_STEP par MATCHES_STEP).
 *
 * Logique de pagination :
 *  - On filtre et trie la liste complète
 *  - On n'affiche que les `matchesVisible` premiers
 *  - Si la liste filtrée en contient plus, on ajoute un bouton "Voir plus"
 *  - Le bouton incrémente matchesVisible puis rappelle renderMatches()
 */
function renderMatches() {
  const q    = norm(els.matchSearch.value);
  const list = state.matches
    .filter(m => ['matches', 'all'].includes(activeView) || matchHasWatchedTeam(m))
    .filter(m => !q || norm(`${m.homeTeam?.name} ${m.awayTeam?.name} ${m.group} ${m.stage}`).includes(q))
    .sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));

  if (!list.length) {
    els.matches.innerHTML = '<div class="empty">Aucun match trouvé pour cette recherche.</div>';
    return;
  }

  // Tranche visible
  const visible = list.slice(0, matchesVisible);
  const remaining = list.length - visible.length;
  const upcomingTotal = list.filter(isUpcomingMatch).length;
  const nextMatch = getNextMatch();

  const cardsHtml = visible.map(m => {
    const [label, cls] = matchStatus(m);
    const home = teamLookup(m.homeTeam);
    const away = teamLookup(m.awayTeam);
    const fav  = isWatchedName(home.name) || isWatchedName(away.name);
    const meta = matchMeta(m);
    const next = nextMatch && m === nextMatch;

    return `<article class="match-card ${fav ? 'fav' : ''} ${next ? 'is-next' : ''}">
      <div class="date">${fmtDate(m.utcDate)}</div>
      <div>
        <div class="teams-line">
          ${teamNameLine(home)}
          <span class="versus">vs</span>
          ${teamNameLine(away)}
        </div>
        <span class="badge ${cls}">${label}${meta ? ' · ' + escapeHtml(meta) : ''}</span>
        ${scorersHtml(m)}
        ${matchFinishedDetailsHtml(m)}
        ${premiumSignalsHtml(m)}
        ${broadcastBadgesHtml(m)}
        ${matchDetailButtonHtml(m)}
      </div>
      <div class="score">${scoreText(m)}</div>
    </article>`;
  }).join('');

  // Compteur + bouton "Voir plus" si des matchs restent cachés
  const footerHtml = remaining > 0
    ? `<div class="matches-footer">
        <span class="matches-count">${visible.length} sur ${list.length} matchs</span>
        <button class="show-more-btn" id="matchesShowMore" type="button">
          Afficher ${Math.min(remaining, MATCHES_STEP)} de plus
          <span class="show-more-total">${remaining} restant${remaining > 1 ? 's' : ''}</span>
        </button>
       </div>`
    : `<div class="matches-footer">
        <span class="matches-count">${list.length} match${list.length > 1 ? 's' : ''} au total</span>
       </div>`;

  const digestHtml = `<div class="matches-digest">
    <span class="matches-kicker">Agenda compact</span>
    <strong>${visible.length} affiché${visible.length > 1 ? 's' : ''}</strong>
    <span>${upcomingTotal} match${upcomingTotal > 1 ? 's' : ''} à venir${q ? ' dans cette recherche' : ''}</span>
  </div>`;

  els.matches.innerHTML = digestHtml + `<div class="matches-window">${cardsHtml}</div>` + footerHtml;

  // Le bouton est injecté dans le DOM juste ci-dessus : on peut maintenant l'écouter
  const btn = document.getElementById('matchesShowMore');
  if (btn) {
    btn.addEventListener('click', () => {
      matchesVisible += MATCHES_STEP;
      renderMatches();
    });
  }
}

/**
 * Affiche la grille de toutes les équipes filtrée par le champ de recherche.
 * Les équipes favorites ont un fond doré, les éliminées un fond rouge atténué.
 */
function renderTeams() {
  const q    = norm(els.teamSearch.value);
  const source = ['teams', 'all'].includes(activeView)
    ? state.teams
    : state.teams.filter(t => isWatchedName(t.name || t.shortName || t.tla));
  const list = source.filter(t =>
    !q || norm(`${t.name} ${t.shortName} ${t.tla} ${t.area?.name}`).includes(q)
  );

  els.teams.innerHTML = list.length
    ? list.map(t => {
        const eliminated = isEliminatedTeam(t);
        const fav        = isWatchedName(t.name);
        return `<button class="team-card ${fav ? 'fav' : ''} ${eliminated ? 'team-eliminated' : ''}" type="button" data-team-id="${escapeHtml(teamDomId(t))}">
          ${teamVisual(t)}
          <b>${escapeHtml(t.name || t.shortName || 'Équipe')}</b>
          <small>${escapeHtml(t.area?.name || '')}${t.tla ? ' · ' + escapeHtml(t.tla) : ''}</small>
          ${eliminated ? '<span class="eliminated-badge">✕ Éliminée</span>' : ''}
        </button>`;
      }).join('')
    : '<div class="empty">Aucune équipe trouvée.</div>';
}

function renderNewsLinks() {
  const isFiltered = activeView === 'home';
  const sourceList = isFiltered ? state.watchedNews : state.news;
  if (els.newsHint) {
    els.newsHint.textContent = isFiltered
      ? 'Articles du jour autour de France, Congo et Portugal.'
      : 'Articles du jour autour de la Coupe du Monde 2026.';
  }

  const list = sourceList
    .filter(article => article.title && article.link && article.link !== '#')
    .slice(0, 4);

  if (!list.length) {
    els.newsLinks.innerHTML = '<div class="news-empty">Aucun article du jour disponible pour le moment.</div>';
    return;
  }

  els.newsLinks.innerHTML = list.map(article => {
    const source = article.source || hostLabel(article.link);
    const published = articleDateLine(article.date);
    return `<a class="news-link" href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">
      <span class="news-source">${escapeHtml(source)}</span>
      <strong>${escapeHtml(article.title)}</strong>
      ${published ? `<small>${escapeHtml(published)}</small>` : ''}
    </a>`;
  }).join('');
}

/** Lance tous les renders dans l'ordre optimal */
function renderAll() {
  initCollapsibleSections();
  renderViewLabels();
  renderStats();
  renderNextMatch();
  renderWatchList();
  renderWatchedNextMatch();
  renderLiveMatch();
  renderTodayResults();
  renderTournamentStats();
  renderTopScorers();
  renderGroups();
  renderMatches();
  renderTeams();
  renderFinalStage();
  renderNewsLinks();
}

function mergeStableMatchEvents(previousMatches = [], incomingMatches = []) {
  const previousById = new Map(previousMatches.map(match => [String(match.id || ''), match]));

  return incomingMatches.map(match => {
    const previous = previousById.get(String(match.id || ''));
    if (!previous) return match;

    const merged = { ...match };
    ['scorers', 'cards', 'highlights'].forEach(field => {
      const nextEvents = Array.isArray(match[field]) ? match[field] : [];
      const previousEvents = Array.isArray(previous[field]) ? previous[field] : [];
      const currentScore = readMatchScore(match);
      if (field === 'scorers' && (!currentScore || currentScore.home + currentScore.away <= 0)) {
        return;
      }
      if (!nextEvents.length && previousEvents.length && (isLiveMatch(match) || isFinishedMatch(match))) {
        merged[field] = previousEvents;
      }
    });

    return merged;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHARGEMENT DES DONNÉES — loadData()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Charge les données depuis le proxy PHP, met à jour state et re-render.
 * Le paramètre `?t=` force le rechargement (contourne le cache navigateur).
 * En cas d'erreur, l'UI précédente reste affichée et un message s'affiche.
 */
function setView(view, targetId) {
  activeView = view;
  if (view === 'home') {
    els.teamSearch.value = '';
    els.matchSearch.value = '';
    matchesVisible = activeView === 'matches'
      ? (state.matches.length || MATCHES_STEP)
      : MATCHES_STEP;
  }
  if (view === 'groups') {
    els.teamSearch.value = '';
    matchesVisible = MATCHES_STEP;
  }
  if (view === 'teams') {
    els.teamSearch.value = '';
  }
  if (view === 'matches') {
    matchesVisible = state.matches.length || MATCHES_STEP;
  }
  if (view === 'final-stage') {
    els.teamSearch.value = '';
    els.matchSearch.value = '';
    matchesVisible = MATCHES_STEP;
  }
  if (view === 'all') {
    els.teamSearch.value = '';
    els.matchSearch.value = '';
    matchesVisible = state.matches.length || MATCHES_STEP;
  }
  renderAll();
  if (targetId) document.querySelector(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function sectionCollapseKey(panel, index) {
  return COLLAPSE_STORAGE_PREFIX + (panel.id || panel.getAttribute('aria-label') || `panel-${index}`);
}

function getCollapseState(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch (_) {
    return false;
  }
}

function saveCollapseState(key, collapsed) {
  try {
    localStorage.setItem(key, collapsed ? '1' : '0');
  } catch (_) {
    // La navigation privée ou certains réglages peuvent bloquer localStorage.
  }
}

function setPanelCollapsed(panel, button, collapsed) {
  panel.classList.toggle('is-collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? 'Afficher la section' : 'Masquer la section');
  button.title = collapsed ? 'Afficher la section' : 'Masquer la section';
}

function initMatchdayCollapse() {
  const grid = document.querySelector('.matchday-grid');
  if (!grid) return;
  const button = grid.querySelector('[data-matchday-toggle]');
  if (!button) return;

  const key = COLLAPSE_STORAGE_PREFIX + 'matchday-grid';
  setMatchdayCollapsed(grid, button, getCollapseState(key));
}

function setMatchdayCollapsed(grid, button, collapsed) {
  grid.classList.toggle('is-collapsed', collapsed);
  button.setAttribute('aria-expanded', String(!collapsed));
  button.setAttribute('aria-label', collapsed ? 'Afficher les blocs du jour' : 'Masquer les blocs du jour');
  button.title = collapsed ? 'Afficher les blocs du jour' : 'Masquer les blocs du jour';
}

function initCollapsibleSections() {
  initMatchdayCollapse();

  document.querySelectorAll('main .panel > .section-title').forEach((title, index) => {
    if (title.querySelector('.collapse-toggle')) return;

    const panel = title.closest('.panel');
    if (!panel) return;
    if (panel.classList.contains('matchday-panel')) return;

    const key = sectionCollapseKey(panel, index);
    const button = document.createElement('button');
    button.className = 'collapse-toggle';
    button.type = 'button';
    button.innerHTML = '<span aria-hidden="true"></span>';

    const collapsed = getCollapseState(key);
    setPanelCollapsed(panel, button, collapsed);

    button.addEventListener('click', () => {
      const nextCollapsed = !panel.classList.contains('is-collapsed');
      setPanelCollapsed(panel, button, nextCollapsed);
      saveCollapseState(key, nextCollapsed);
    });

    title.append(button);
  });
}

async function loadData(options = {}) {
  const manual = Boolean(options.manual);
  const silent = Boolean(options.silent);

  // Animation spinner sur le bouton refresh uniquement quand l'utilisateur le demande.
  if (!silent) {
    els.refreshBtn.classList.add('spinning');
    els.status.textContent = 'Mise à jour...';
  }

  try {
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (manual || options.refresh || options.live) params.set('refresh', '1');
    if (options.live) params.set('live', '1');

    const res  = await fetch(`${API_URL}?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();

    if (!res.ok || !data.ok) throw new Error(data.message || 'Mise à jour indisponible');

    const incomingMatches = mergeStableMatchEvents(state.matches, data.matches || []);

    // Mise à jour de l'état global
    state = {
      teams:     data.teams     || [],
      matches:   incomingMatches,
      standings: data.standings || [],
      news:      data.news      || [],
      watchedNews: data.watchedNews || [],
      generatedAt: data.generatedAt || null,
      eliminated: [],
    };

    // Reset de la pagination seulement au premier chargement ou lors d'un refresh manuel.
    if (!hasLoadedData || manual) {
      matchesVisible = MATCHES_STEP;
    }

    // Calcul des équipes éliminées à partir des données fraîches
    state.eliminated = computeEliminatedTeams(state.standings, state.matches);

    renderAll();

    if (!manual && !options.refresh) {
      window.setTimeout(() => loadData({ silent: true, refresh: true }), 250);
    }

    // Horodatage de la dernière mise à jour
    const now = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' }).format(new Date());
    els.status.textContent = `Mis à jour à ${now}`;
    hasLoadedData = true;

  } catch (err) {
    // En cas d'erreur réseau, on conserve les données précédentes
    if (!silent) els.status.textContent = `⚠ ${err.message}`;
  } finally {
    // On retire toujours le spinner, même en cas d'erreur
    if (!silent) els.refreshBtn.classList.remove('spinning');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GESTION DES ÉVÉNEMENTS
// ─────────────────────────────────────────────────────────────────────────────

// Bouton "Actualiser" : rechargement immédiat demandé par l'utilisateur.
els.refreshBtn.addEventListener('click', () => loadData({ manual: true }));

document.addEventListener('click', event => {
  const matchdayToggle = event.target.closest('[data-matchday-toggle]');
  if (!matchdayToggle) return;

  event.preventDefault();
  const grid = matchdayToggle.closest('.matchday-grid');
  if (!grid) return;

  const nextCollapsed = !grid.classList.contains('is-collapsed');
  setMatchdayCollapsed(grid, matchdayToggle, nextCollapsed);
  saveCollapseState(COLLAPSE_STORAGE_PREFIX + 'matchday-grid', nextCollapsed);
});

els.viewToggles.forEach(toggle => {
  toggle.addEventListener('click', () => {
    const fullMode = activeView === 'home';
    setView(fullMode ? 'all' : 'home', fullMode ? '#prochain-match' : '#top');
  });
});

els.perfToggles.forEach(toggle => {
  toggle.addEventListener('click', () => {
    const nextMode = performanceMode === 'light' ? 'hard' : 'light';
    applyPerformanceMode(nextMode);
    try {
      localStorage.setItem(PERF_STORAGE_KEY, nextMode);
    } catch {}
  });
});

els.siteSearchForm?.addEventListener('submit', event => {
  event.preventDefault();
  openSearchModal(els.siteSearch.value);
});

document.addEventListener('click', event => {
  const link = event.target.closest('[data-view]');
  if (!link) return;
  const view = link.dataset.view;
  if (!view) return;
  event.preventDefault();
  setView(view, link.getAttribute('href'));
});

document.addEventListener('click', event => {
  const topLink = event.target.closest('[data-scroll-top]');
  if (!topLink) return;
  event.preventDefault();
  document.querySelector('#top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Champ de recherche matchs : reset de la pagination puis re-render
els.matchSearch.addEventListener('input', () => {
  matchesVisible = MATCHES_STEP; // On repart de 0 à chaque nouvelle recherche
  renderMatches();
});

// Champ de recherche équipes : idem
els.teamSearch.addEventListener('input', renderTeams);

els.matchSearch.addEventListener('focus', () => {
  if (activeView !== 'matches') setView('matches', '#matchs');
});

els.teamSearch.addEventListener('focus', () => {
  if (activeView !== 'teams') setView('teams', '#equipes');
});

/**
 * Délégation d'événement pour les clics sur les cartes équipe.
 * Un seul listener sur le document remplace N listeners sur N cartes.
 * Fonctionne aussi sur les liens équipe dans les matchs, groupes, modale.
 */
document.addEventListener('click', event => {
  const card = event.target.closest('[data-team-id]');
  if (!card) return;
  const team = state.teams.find(t => String(t.id || t.tla || t.name) === card.dataset.teamId);
  if (team) openTeamModal(team);
});

/** Navigation clavier : Enter ou Espace ouvre la fiche équipe */
document.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('[data-team-id]');
  if (!card) return;
  event.preventDefault();
  const team = state.teams.find(t => String(t.id || t.tla || t.name) === card.dataset.teamId);
  if (team) openTeamModal(team);
});

document.addEventListener('keydown', event => {
  const target = event.target;
  const typing = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
  if (typing || event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;

  easterBuffer = (easterBuffer + event.key).slice(-8).toLowerCase();
  if (easterBuffer.endsWith('vygon')) {
    easterBuffer = '';
    openInfoModal('vygon');
  }
});

/** Fermeture de la modale via les éléments data-close-team */
document.querySelectorAll('[data-close-team]').forEach(btn =>
  btn.addEventListener('click', closeTeamModal)
);

document.querySelectorAll('[data-close-info]').forEach(btn =>
  btn.addEventListener('click', closeInfoModal)
);

document.querySelectorAll('[data-close-match]').forEach(btn =>
  btn.addEventListener('click', closeMatchModal)
);

document.addEventListener('click', event => {
  const matchButton = event.target.closest('[data-open-match]');
  if (matchButton) {
    event.preventDefault();
    openMatchModal(matchButton.dataset.openMatch);
    return;
  }

  const stripItem = event.target.closest('[data-strip-info]');
  if (stripItem) {
    openInfoModal(stripItem.dataset.stripInfo);
    return;
  }

  const infoView = event.target.closest('[data-info-view]');
  if (infoView) {
    event.preventDefault();
    closeInfoModal();
    setView(infoView.dataset.infoView, infoView.dataset.infoTarget);
    return;
  }

  const statsModal = event.target.closest('[data-stats-modal]');
  if (statsModal) {
    event.preventDefault();
    openStatsModal();
    return;
  }

  const efficiencyHelp = event.target.closest('[data-efficiency-help]');
  if (efficiencyHelp) {
    event.preventDefault();
    openEfficiencyHelpModal();
    return;
  }

  const playerPerformanceHelp = event.target.closest('[data-player-performance-help]');
  if (playerPerformanceHelp) {
    event.preventDefault();
    openPlayerPerformanceHelpModal();
    return;
  }

  const infoExternal = event.target.closest('[data-info-external]');
  if (infoExternal) {
    event.preventDefault();
    const href = infoExternal.getAttribute('href');
    if (href) window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }

  const refresh = event.target.closest('[data-info-refresh]');
  if (refresh) {
    event.preventDefault();
    closeInfoModal();
    loadData({ manual: true });
    return;
  }

  const searchTeam = event.target.closest('[data-search-team]');
  if (searchTeam) {
    const team = state.teams.find(t => teamDomId(t) === searchTeam.dataset.searchTeam);
    closeInfoModal();
    if (team) openTeamModal(team);
    return;
  }

  const searchMatch = event.target.closest('[data-search-match]');
  if (searchMatch) {
    const matchId = searchMatch.dataset.searchMatchId || '';
    const value = searchMatch.dataset.searchMatch || '';
    closeInfoModal();
    if (matchId && findMatchByDomId(matchId)) {
      openMatchModal(matchId);
      return;
    }
    els.matchSearch.value = value;
    setView('matches', '#matchs');
    renderMatches();
  }
});

/** Fermeture de la modale via la touche Escape */
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !els.teamModal.hidden) closeTeamModal();
  if (event.key === 'Escape' && els.infoModal && !els.infoModal.hidden) closeInfoModal();
  if (event.key === 'Escape' && els.matchModal && !els.matchModal.hidden) closeMatchModal();
});

/** Bouton "Retour vers le haut" : visible après 680px de scroll */
window.addEventListener('scroll', () => {
  const visible = window.scrollY > 680;
  els.backToTop.classList.toggle('is-visible', visible);
  els.quickNav.classList.toggle('is-visible', visible);
}, { passive: true }); // passive: true améliore la performance du scroll

// ─────────────────────────────────────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────────────────────────────────────

const finalStageTooltip = document.createElement('div');
finalStageTooltip.className = 'final-stage-tooltip';
finalStageTooltip.setAttribute('role', 'tooltip');
document.body.appendChild(finalStageTooltip);

function hideFinalStageTooltip() {
  finalStageTooltip.classList.remove('is-visible');
}

function placeFinalStageTooltip(target) {
  const text = target?.dataset?.finalTooltip || '';
  if (!text) {
    hideFinalStageTooltip();
    return;
  }

  finalStageTooltip.textContent = text;
  finalStageTooltip.classList.add('is-visible');

  if (window.matchMedia('(max-width: 759px)').matches) {
    const viewport = window.visualViewport;
    const left = viewport ? viewport.offsetLeft + viewport.width / 2 : window.innerWidth / 2;
    const top = viewport ? viewport.offsetTop + viewport.height / 2 : window.innerHeight / 2;
    const width = viewport ? Math.min(320, viewport.width - 28) : Math.min(320, window.innerWidth - 28);

    finalStageTooltip.style.left = `${left}px`;
    finalStageTooltip.style.top = `${top}px`;
    finalStageTooltip.style.width = `${Math.max(140, width)}px`;
    finalStageTooltip.style.transform = 'translate(-50%, -50%)';
    return;
  }

  finalStageTooltip.style.width = '';
  finalStageTooltip.style.transform = 'translateY(4px)';

  const targetBox = target.getBoundingClientRect();
  const tipBox = finalStageTooltip.getBoundingClientRect();
  const gap = 10;
  let left = targetBox.left;
  let top = targetBox.top - tipBox.height - gap;

  if (top < 8) top = targetBox.bottom + gap;
  if (left + tipBox.width > window.innerWidth - 8) left = window.innerWidth - tipBox.width - 8;
  if (left < 8) left = 8;

  finalStageTooltip.style.left = `${left}px`;
  finalStageTooltip.style.top = `${top}px`;
}

document.addEventListener('mouseover', event => {
  const target = event.target.closest('[data-final-tooltip]');
  if (target) placeFinalStageTooltip(target);
});

document.addEventListener('focusin', event => {
  const target = event.target.closest('[data-final-tooltip]');
  if (target) placeFinalStageTooltip(target);
});

document.addEventListener('mouseout', event => {
  if (event.target.closest('[data-final-tooltip]')) hideFinalStageTooltip();
});

document.addEventListener('focusout', event => {
  if (event.target.closest('[data-final-tooltip]')) hideFinalStageTooltip();
});

window.addEventListener('resize', fitFinalStageBracket);
window.visualViewport?.addEventListener('resize', () => {
  fitFinalStageBracket();
  if (finalStageTooltip.classList.contains('is-visible')) hideFinalStageTooltip();
});
window.visualViewport?.addEventListener('scroll', hideFinalStageTooltip);

window.addEventListener('pageshow', () => {
  window.scrollTo(0, 0);
});

function initWorldCupTicker() {
  const required = [els.tickerForm, els.tickerInput, els.tickerCount, els.tickerSend, els.tickerText, els.tickerFeedback];
  if (required.some(item => !item)) return;

  const apiUrl = '/ticker/api/ticker.php';
  let feedbackTimer = null;

  const showFeedback = (message, isError = false) => {
    clearTimeout(feedbackTimer);
    els.tickerFeedback.textContent = message;
    els.tickerFeedback.classList.toggle('is-error', isError);
    els.tickerFeedback.classList.add('is-visible');
    feedbackTimer = setTimeout(() => {
      els.tickerFeedback.classList.remove('is-visible');
    }, 3000);
  };

  const restartTicker = () => {
    els.tickerText.style.animation = 'none';
    void els.tickerText.offsetHeight;
    els.tickerText.style.animation = '';
  };

  const addSeparator = fragment => {
    const separator = document.createElement('span');
    separator.className = 'worldcup-ticker-sep';
    separator.textContent = '◆';
    fragment.appendChild(separator);
  };

  const appendTickerCycle = messages => {
    const fragment = document.createDocumentFragment();

    for (let loop = 0; loop < 4; loop++) {
      messages.forEach(message => {
        const span = document.createElement('span');
        span.textContent = message;
        fragment.appendChild(span);
        addSeparator(fragment);
      });
    }

    els.tickerText.appendChild(fragment);
  };

  const renderTickerMessages = messages => {
    els.tickerText.replaceChildren();

    const safeMessages = Array.isArray(messages)
      ? messages.map(item => typeof item.message === 'string' ? item.message.trim() : '').filter(Boolean)
      : [];

    if (safeMessages.length === 0) {
      els.tickerText.textContent = 'Aucun message pour le moment.';
      restartTicker();
      return;
    }

    appendTickerCycle(safeMessages);
    appendTickerCycle(safeMessages);

    restartTicker();
  };

  const refreshCount = () => {
    const length = els.tickerInput.value.length;
    els.tickerCount.textContent = `${length} / 100`;
    els.tickerCount.classList.toggle('is-warn', length >= 80 && length < 100);
    els.tickerCount.classList.toggle('is-limit', length >= 100);
  };

  const loadTicker = async () => {
    try {
      const response = await fetch(apiUrl, { cache: 'no-store' });
      const data = await response.json();
      renderTickerMessages(data.messages || []);
    } catch {
      els.tickerText.textContent = 'Impossible de charger les messages.';
    }
  };

  els.tickerInput.addEventListener('input', refreshCount);
  els.tickerForm.addEventListener('submit', async event => {
    event.preventDefault();

    const message = els.tickerInput.value.trim();
    if (!message) return;

    if (message.length > 100) {
      showFeedback('Maximum 100 caractères.', true);
      return;
    }

    els.tickerSend.disabled = true;

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: new URLSearchParams({ message }),
      });
      const data = await response.json();

      if (!response.ok) {
        showFeedback(data.error || 'Message refusé.', true);
        return;
      }

      renderTickerMessages(data.messages || []);
      els.tickerInput.value = '';
      refreshCount();
      showFeedback('Message envoyé.');
    } catch {
      showFeedback('Erreur réseau.', true);
    } finally {
      setTimeout(() => {
        els.tickerSend.disabled = false;
      }, 8000);
    }
  });

  refreshCount();
  loadTicker();
}

initWorldCupTicker();
initCollapsibleSections();

// Premier chargement au démarrage
loadData();

// Rafraîchissement automatique toutes les 60 secondes
setInterval(() => loadData({ silent: true }), REFRESH_MS);

// Pendant un match, l'encart live force des données fraîches, sans cache serveur.
setInterval(async () => {
  if (!getLiveMatch() || liveRefreshInFlight) return;

  liveRefreshInFlight = true;
  try {
    await loadData({ silent: true, refresh: true, live: true });
  } finally {
    liveRefreshInFlight = false;
  }
}, LIVE_REFRESH_MS);

// Compte à rebours du prochain match mis à jour chaque seconde
setInterval(updateNextCountdown, 1_000);
