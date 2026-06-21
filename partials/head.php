<?php
if (!defined('WORLD_CUP_APP')) {
    http_response_code(403);
    exit;
}
$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$showPsyomReturnHome = in_array($host, ['psyom.eu', 'www.psyom.eu'], true);
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Coupe du Monde 2026 — Live</title>
  <meta name="description" content="Tableau de bord vivant de la Coupe du Monde 2026 : groupes, matchs, résultats et équipes en direct.">
  <meta name="robots" content="index, follow">
  <meta name="theme-color" content="#030509">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:title" content="Coupe du Monde 2026 — Live">
  <meta property="og:description" content="Calendrier, groupes, équipes suivies, articles et résultats dans une interface fan premium.">
  <meta property="og:image" content="assets/worldcup-hero.png">
  <meta name="twitter:card" content="summary_large_image">

  <!-- Favicon SVG inline : ballon de foot stylisé aux couleurs du tournoi -->
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">

  <!-- Préchargement de l'image hero pour éviter un flash au rendu -->
  <link rel="preload" href="assets/worldcup-hero.png?v=16" as="image" fetchpriority="high">

  <!-- Polices Google : Bebas Neue (titres percutants) + DM Sans (corps lisible) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">

  <!-- Feuille de style principale (versionnée pour cache-busting) -->
  <link rel="stylesheet" href="assets/styles.css?v=<?= $assetVersions['css'] ?>">

  <?php if ($showPsyomReturnHome): ?>
  <!-- psyom-return-home -->
  <style>
    .psyom-return-home {
      position: fixed;
      left: clamp(12px, 2vw, 22px);
      top: clamp(12px, 2vw, 22px);
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 42px;
      padding: 0 14px;
      border: 1px solid rgba(255, 255, 255, .22);
      border-radius: 999px;
      background: rgba(7, 10, 14, .76);
      color: #fff;
      font: 900 .78rem/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: .02em;
      text-decoration: none;
      box-shadow: 0 14px 40px rgba(0, 0, 0, .34);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      transition: transform .18s ease, border-color .18s ease, background .18s ease;
    }

    .psyom-return-home::before {
      content: "←";
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, .13);
      color: #f0c040;
      font-size: 1rem;
    }

    .psyom-return-home:hover,
    .psyom-return-home:focus-visible {
      transform: translateY(-2px);
      border-color: rgba(240, 192, 64, .58);
      background: rgba(7, 10, 14, .9);
      outline: none;
    }

    body.modal-open .psyom-return-home {
      display: none;
    }

    @media (max-width: 560px) {
      .psyom-return-home {
        min-height: 38px;
        padding: 0 11px;
        font-size: .72rem;
      }
    }

    @media print {
      .psyom-return-home { display: none; }
    }
  </style>
  <?php endif; ?>
</head>
<body>
  <?php if ($showPsyomReturnHome): ?>
  <a class="psyom-return-home" href="https://psyom.eu/" rel="home">Retour</a>
  <?php endif; ?>
