<?php
// Use this router with the built-in PHP server; only public assets can be requested.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = dirname(__DIR__);
if (in_array($path, ['/index.css', '/App.js'], true)) {
    header('Content-Type: ' . ($path === '/index.css' ? 'text/css' : 'application/javascript') . '; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    readfile($root . $path); return;
}
if ($path === '/' || $path === '/index.php') { require $root . '/index.php'; return; }
http_response_code(404); echo 'Not found';
