<?php
declare(strict_types=1);

if (realpath((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === __FILE__) {
    http_response_code(404);
    exit;
}

function envValue(string $key, string $fallback = ''): string
{
    $value = getenv($key);
    return is_string($value) && $value !== '' ? $value : $fallback;
}

$envFile = dirname(__DIR__) . '/.env';
if (is_file($envFile) && is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$key, $value] = array_map('trim', explode('=', $line, 2));
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . trim($value, "\"'"));
        }
    }
}

define('FOOTBALL_DATA_TOKEN', envValue('FOOTBALL_DATA_TOKEN'));
define('NEWS_API_TOKEN', envValue('NEWS_API_TOKEN'));
define('THESPORTSDB_API_KEY', envValue('THESPORTSDB_API_KEY', '3'));

const FOOTBALL_DATA_BASE = 'https://api.football-data.org/v4';
const THESPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json';
const CACHE_TTL_SECONDS = 60;
const COMPETITION_CODE = 'WC';

$cacheDir = envValue('CACHE_DIR', rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . '/psyom-worldcup-cache');
if (!preg_match('/^(?:[A-Za-z]:[\\\\\/]|\/|\\\\\\\\)/', $cacheDir)) {
    $cacheDir = dirname(__DIR__) . '/' . ltrim($cacheDir, '/\\');
}
define('CACHE_DIR', $cacheDir);
