<?php
if (!defined('WORLD_CUP_APP')) {
    http_response_code(403);
    exit;
}
?>
  <!-- Script principal (defer = après le parsing HTML) -->
  <script src="assets/app.js?v=<?= $assetVersions['js'] ?>" defer></script>
</body>
</html>
