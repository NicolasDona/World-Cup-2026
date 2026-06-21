<?php
declare(strict_types=1);

if (!defined('WORLD_CUP_APP')) {
    http_response_code(403);
    exit;
}

$assetVersions = [
    'css' => 126,
    'js'  => 142,
];

return [
    'asset_versions' => $assetVersions,
    'front_version'  => 'V.1.' . str_pad((string) max($assetVersions), 3, '0', STR_PAD_LEFT),
];
