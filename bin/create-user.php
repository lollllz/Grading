<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require dirname(__DIR__) . '/app/bootstrap.php';
$options = getopt('', ['name:', 'email:', 'demo']);
$name = trim($options['name'] ?? ''); $email = mb_strtolower(trim($options['email'] ?? ''));
if (!$name || mb_strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
    fwrite(STDERR, "Usage: php bin/create-user.php --name=\"Your name\" --email=\"you@example.com\" [--demo]\n"); exit(1);
}
$tty = function_exists('stream_isatty') && stream_isatty(STDIN);
fwrite(STDERR, "Password (at least 12 characters): ");
if ($tty) system('stty -echo');
try { $password = rtrim(fgets(STDIN) ?: '', "\r\n"); }
finally { if ($tty) { system('stty echo'); fwrite(STDERR, "\n"); } }
if (strlen($password) < 12 || strlen($password) > 72) { fwrite(STDERR, "Use a password between 12 and 72 bytes.\n"); exit(1); }
try {
    db()->beginTransaction();
    query('INSERT INTO staff_users(full_name,email,password_hash) VALUES (?,?,?)',[$name,$email,password_hash($password,PASSWORD_DEFAULT)]);
    $owner = (int)db()->lastInsertId();
    if (isset($options['demo'])) {
        $subjects = [['CRM1963','Web Programming with PHP'],['CRM1953','Database Fundamentals'],['CRM1943','Programming Principles']]; $ids=[];
        foreach($subjects as [$code,$title]) { query('INSERT INTO subjects(owner_id,code,name) VALUES (?,?,?)',[$owner,$code,$title]); $ids[]=(int)db()->lastInsertId(); }
        $names = ['Alya Rahman','Daniel Lim','Nur Aisyah','Ethan Tan','Sofia Abdullah','Arjun Kumar','Mei Ling','Amir Hakim'];
        $scores = [[86,82,91],[74,68,72],[90,88,94],[60,57,63],[78,82,85],[38,32,36],[67,70,73],[72,null,null]];
        foreach($names as $i=>$student) {
            query('INSERT INTO students(owner_id,matric_number,full_name) VALUES (?,?,?)',[$owner,'DEMO'.str_pad((string)($i+1),4,'0',STR_PAD_LEFT),$student]); $sid=(int)db()->lastInsertId();
            query('INSERT INTO grade_records(owner_id,student_id,subject_id,academic_term,test_1,test_2,final_exam,feedback) VALUES (?,?,?,?,?,?,?,?)',[$owner,$sid,$ids[$i%3],'July 2026',...$scores[$i], $i===5?'Let’s review the core concepts together and plan a focused revision session.':'']);
        }
    }
    db()->commit(); fwrite(STDOUT,"Account created." . (isset($options['demo']) ? " Synthetic demo records added for this account." : '') . "\n");
} catch (PDOException $ex) {
    if (db()->inTransaction()) db()->rollBack();
    fwrite(STDERR, "Could not create account. Check the database configuration, schema, and unique email.\n"); exit(1);
}
