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
      <a href="https://psyom.eu/" rel="home">by psyom</a>
    </div>
  </footer>
