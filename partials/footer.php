<?php
if (!defined('WORLD_CUP_APP')) {
    http_response_code(403);
    exit;
}
?>
  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-data">
        <span>Données, actus et événements servis par nos sources API</span>
        <ul class="source-list">
          <li><strong>football-data.org</strong></li>
          <li><strong>NewsAPI.org</strong></li>
          <li><strong>TheSportsDB</strong></li>
        </ul>
      </div>
    </div>
    <div class="signature-footer">
      <span>Built to make public data readable.</span>
      <span><?= htmlspecialchars($frontVersion, ENT_QUOTES, 'UTF-8') ?></span>
      <a class="signature-psyom" href="https://psyom.eu/" rel="home">by psyom</a>
      <a class="signature-github" href="https://github.com/NicolasDona/World-Cup-2026" target="_blank" rel="noopener noreferrer">Code open source sur GitHub</a>
    </div>
  </footer>
