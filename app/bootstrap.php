<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
header('Cache-Control: no-store');
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start(['use_strict_mode' => 1, 'cookie_httponly' => true,
        'cookie_secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'cookie_samesite' => 'Lax']);
}

function db(): PDO {
    static $pdo;
    if ($pdo) return $pdo;
    $config = [
        'host' => getenv('GRADING_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('GRADING_DB_PORT') ?: '3306',
        'database' => getenv('GRADING_DB_NAME') ?: 'grading',
        'username' => getenv('GRADING_DB_USER') ?: 'grading_app',
        'password' => getenv('GRADING_DB_PASSWORD') ?: '',
    ];
    $local = dirname(__DIR__) . '/config.local.php';
    if (is_file($local)) $config = array_replace($config, require $local);
    $pdo = new PDO("mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
        $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);
    return $pdo;
}
function query(string $sql, array $params = []): PDOStatement {
    $statement = db()->prepare($sql); $statement->execute($params); return $statement;
}
function e(mixed $value): string { return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function csrf(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(32)); }
function redirect(string $url): never { header('Location: ' . $url, true, 303); exit; }
function url(string $view, array $params = []): string { return '?' . http_build_query(['view' => $view] + $params); }
function flash(string $text): void { $_SESSION['flash'] = $text; }
function text_input(string $key, int $max, bool $required = true): string {
    $value = trim(is_string($_POST[$key] ?? null) ? $_POST[$key] : '');
    if (($required && $value === '') || mb_strlen($value) > $max) throw new InvalidArgumentException('Please complete all required fields within their displayed limits.');
    return $value;
}
function score_input(string $key): ?string {
    $value = text_input($key, 10, false);
    if ($value === '') return null;
    if (!preg_match('/^\d{1,3}(?:\.\d{1,2})?$/', $value) || (float)$value > 100) {
        throw new InvalidArgumentException('Marks must be between 0 and 100, with at most two decimal places.');
    }
    return number_format((float)$value, 2, '.', '');
}
function grade(?float $score): ?string {
    if ($score === null) return null;
    return match (true) { $score >= 80 => 'A', $score >= 65 => 'B', $score >= 50 => 'C', $score >= 40 => 'D', default => 'E' };
}
function marks(mixed $value): string { return $value === null ? '—' : number_format((float)$value, 2); }
function owned(string $table, int $id, int $owner): array {
    if (!in_array($table, ['students', 'subjects', 'grade_records'], true)) throw new LogicException('Invalid table');
    $row = query("SELECT * FROM $table WHERE id = ? AND owner_id = ?", [$id, $owner])->fetch();
    if (!$row) throw new InvalidArgumentException('This record is unavailable. Return to the register and try again.');
    return $row;
}
