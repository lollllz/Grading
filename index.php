<?php
declare(strict_types=1);
require __DIR__ . '/app/bootstrap.php';

$view = is_string($_GET['view'] ?? null) ? $_GET['view'] : 'register';
$error = null; $unavailable = false;
try { db(); } catch (PDOException $ex) { error_log('Grading database connection failed: ' . $ex->getCode()); $unavailable = true; }
if (isset($_SESSION['last_activity']) && time() - $_SESSION['last_activity'] > 1800) {
    unset($_SESSION['user']); session_regenerate_id(true); flash('Your session expired. Please sign in again.');
}
$_SESSION['last_activity'] = time();
$user = $_SESSION['user'] ?? null;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!is_string($_POST['csrf'] ?? null) || !hash_equals(csrf(), $_POST['csrf'])) throw new InvalidArgumentException('Your form expired. Refresh the page and try again.');
        if ($unavailable) throw new InvalidArgumentException('The database is unavailable. Please try again shortly.');
        $action = text_input('action', 30);
        if ($action === 'login') {
            $email = mb_strtolower(text_input('email', 190));
            $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
            if (strlen($password) > 4096) throw new InvalidArgumentException('Email or password is incorrect.');
            // Shared account throttle persists across browser sessions.
            $staff = query('SELECT * FROM staff_users WHERE email = ?', [$email])->fetch();
            $blocked = $staff && $staff['locked_until'] && strtotime($staff['locked_until']) > time();
            $valid = password_verify($password, $staff['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
            if (!$staff || !$valid || $blocked) {
                if ($staff && !$blocked) query('UPDATE staff_users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins >= 5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE) ELSE NULL END WHERE id = ?', [$staff['id']]);
                throw new InvalidArgumentException('Email or password is incorrect, or this account is temporarily locked.');
            }
            query('UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = ?', [$staff['id']]);
            session_regenerate_id(true); $_SESSION['csrf'] = bin2hex(random_bytes(32));
            $_SESSION['user'] = ['id' => (int)$staff['id'], 'name' => $staff['full_name'], 'email' => $staff['email']];
            redirect(url('register'));
        }
        if (!$user) throw new InvalidArgumentException('Please sign in to continue.');
        $owner = (int)$user['id'];
        if ($action === 'logout') { $_SESSION = []; session_regenerate_id(true); redirect(url('login')); }
        if ($action === 'save_subject' || $action === 'save_student') {
            $id = (int)($_POST['id'] ?? 0);
            $table = $action === 'save_subject' ? 'subjects' : 'students';
            $codeKey = $table === 'subjects' ? 'code' : 'matric_number';
            $nameKey = $table === 'subjects' ? 'name' : 'full_name';
            $code = mb_strtoupper(text_input($codeKey, $table === 'subjects' ? 30 : 40));
            $name = text_input($nameKey, 120);
            if ($id) { owned($table, $id, $owner); query("UPDATE $table SET $codeKey = ?, $nameKey = ? WHERE id = ? AND owner_id = ?", [$code, $name, $id, $owner]); }
            else query("INSERT INTO $table (owner_id, $codeKey, $nameKey) VALUES (?, ?, ?)", [$owner, $code, $name]);
            flash(($table === 'subjects' ? 'Subject' : 'Student') . ' saved.'); redirect(url($table));
        }
        if ($action === 'save_record') {
            $id = (int)($_POST['id'] ?? 0);
            if ($id) owned('grade_records', $id, $owner);
            $subjectId = (int)($_POST['subject_id'] ?? 0); owned('subjects', $subjectId, $owner);
            $matric = mb_strtoupper(text_input('matric_number', 40)); $name = text_input('student_name', 120);
            $term = text_input('academic_term', 80); $feedback = text_input('feedback', 3000, false);
            $scores = [score_input('test_1'), score_input('test_2'), score_input('final_exam')];
            db()->beginTransaction();
            $student = query('SELECT * FROM students WHERE owner_id = ? AND matric_number = ?', [$owner, $matric])->fetch();
            if ($student && $student['full_name'] !== $name) throw new InvalidArgumentException('This matric number already belongs to ' . $student['full_name'] . '. Use that name, or update it in Students.');
            if (!$student) { query('INSERT INTO students(owner_id, matric_number, full_name) VALUES (?, ?, ?)', [$owner, $matric, $name]); $studentId = (int)db()->lastInsertId(); }
            else $studentId = (int)$student['id'];
            $values = [$studentId, $subjectId, $term, ...$scores, $feedback];
            if ($id) query('UPDATE grade_records SET student_id=?, subject_id=?, academic_term=?, test_1=?, test_2=?, final_exam=?, feedback=? WHERE id=? AND owner_id=?', [...$values, $id, $owner]);
            else { query('INSERT INTO grade_records (student_id, subject_id, academic_term, test_1, test_2, final_exam, feedback, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [...$values, $owner]); $id = (int)db()->lastInsertId(); }
            db()->commit(); flash('Result saved successfully.'); redirect(url('result', ['id' => $id]));
        }
        if ($action === 'delete_record') {
            $id = (int)($_POST['id'] ?? 0); owned('grade_records', $id, $owner);
            query('DELETE FROM grade_records WHERE id = ? AND owner_id = ?', [$id, $owner]);
            flash('Result deleted. The student and subject are still in your directory.'); redirect(url('register'));
        }
        throw new InvalidArgumentException('That action is unavailable.');
    } catch (InvalidArgumentException $ex) { if (!$unavailable && db()->inTransaction()) db()->rollBack(); $error = $ex->getMessage(); }
      catch (PDOException $ex) {
        if (db()->inTransaction()) db()->rollBack();
        $error = $ex->getCode() === '23000' ? 'That entry already exists. Check the matric number, subject code, or student/subject/term combination.' : 'We could not save your changes. Please try again.';
        error_log('Grading write failed: ' . $ex->getCode());
    }
}
if (!$user) $view = 'login';
if ($user && $view === 'login') redirect(url('register'));
$allowed = ['login', 'register', 'students', 'subjects', 'performance', 'form', 'result'];
if (!in_array($view, $allowed, true)) { http_response_code(404); $view = 'notfound'; }
$flash = $_SESSION['flash'] ?? null; unset($_SESSION['flash']);
$subjects = $students = $records = []; $record = null;
if ($user && !$unavailable) {
    try {
        $owner = (int)$user['id'];
        $subjects = query('SELECT * FROM subjects WHERE owner_id = ? ORDER BY name', [$owner])->fetchAll();
        $students = query('SELECT * FROM students WHERE owner_id = ? ORDER BY full_name', [$owner])->fetchAll();
        $records = query('SELECT * FROM student_subject_performance WHERE owner_id = ? ORDER BY updated_at DESC, id DESC', [$owner])->fetchAll();
        if (in_array($view, ['form', 'result'], true) && isset($_GET['id'])) {
            $record = query('SELECT * FROM student_subject_performance WHERE id = ? AND owner_id = ?', [(int)$_GET['id'], $owner])->fetch() ?: null;
            if (!$record) { http_response_code(404); $view = 'notfound'; }
        } elseif ($view === 'result') { http_response_code(404); $view = 'notfound'; }
    } catch (PDOException $ex) { $unavailable = true; error_log('Grading read failed: ' . $ex->getCode()); }
}
function icon(string $name): string {
    $paths = [
        'register' => '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
        'students' => '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/>',
        'subjects' => '<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
        'performance' => '<path d="M4 20V10M12 20V4M20 20v-7"/>',
        'plus' => '<path d="M12 5v14M5 12h14"/>',
        'arrow' => '<path d="m9 5 7 7-7 7"/>',
        'search' => '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
        'print' => '<path d="M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6Z"/>',
        'logout' => '<path d="M10 4H4v16h6M14 8l4 4-4 4M8 12h13"/>',
        'check' => '<path d="m5 12 4 4L19 6"/>',
    ];
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ($paths[$name] ?? $paths['register']) . '</svg>';
}
$titles = ['register' => 'Marks register', 'students' => 'Students', 'subjects' => 'Subjects', 'performance' => 'Performance', 'form' => $record ? 'Edit result' : 'New result', 'result' => 'Student result', 'notfound' => 'Page not found'];
$complete = array_values(array_filter($records, fn($r) => $r['total_marks'] !== null));
$average = $complete ? array_sum(array_column($complete, 'total_marks')) / count($complete) : null;
$passCount = count(array_filter($complete, fn($r) => (float)$r['total_marks'] >= 40));
require __DIR__ . '/app/layout.php';
