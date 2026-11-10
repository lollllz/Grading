<?php
declare(strict_types=1);
// Runs destructive CRUD checks only for newly created disposable test accounts.
if (PHP_SAPI !== 'cli' || getenv('GRADING_TEST_ALLOW_WRITES') !== '1') {
    fwrite(STDERR, "Set GRADING_TEST_ALLOW_WRITES=1 against a disposable test database.\n"); exit(1);
}
require dirname(__DIR__) . '/app/bootstrap.php';
$base = getenv('GRADING_TEST_URL') ?: 'http://127.0.0.1:8097';
if (!preg_match('~^http://(?:127\.0\.0\.1|localhost):\d+$~', $base)) throw new RuntimeException('Use a local test server.');
$jar = tempnam(sys_get_temp_dir(), 'grading-cookie-'); $ownerIds = []; $checks = 0;
function check(bool $condition, string $description): void {
    global $checks;
    if (!$condition) throw new RuntimeException($description);
    $checks++; echo "PASS $description\n";
}
function request(string $path, ?array $post = null): array {
    global $base, $jar;
    $curl = curl_init($base . $path);
    curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_COOKIEJAR=>$jar, CURLOPT_COOKIEFILE=>$jar, CURLOPT_HEADER=>true, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_TIMEOUT=>10]);
    if ($post !== null) curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>http_build_query($post)]);
    $response=curl_exec($curl); if($response===false) throw new RuntimeException(curl_error($curl));
    $code=curl_getinfo($curl,CURLINFO_RESPONSE_CODE); $size=curl_getinfo($curl,CURLINFO_HEADER_SIZE);
    return [$code,substr($response,$size),substr($response,0,$size)];
}
function token(string $body): string {
    if(!preg_match('/name="csrf" value="([a-f0-9]+)"/',$body,$m)) throw new RuntimeException('CSRF token missing'); return $m[1];
}
try {
    $suffix=bin2hex(random_bytes(6)); $email='check-'.$suffix.'@example.test'; $password=bin2hex(random_bytes(20));
    foreach ([$email,'other-'.$suffix.'@example.test'] as $account) {
        query('INSERT INTO staff_users(full_name,email,password_hash) VALUES (?,?,?)',['Integration Check',$account,password_hash($password,PASSWORD_DEFAULT)]); $ownerIds[]=(int)db()->lastInsertId();
    }
    [$owner,$other]=$ownerIds;
    [$code,$body]=request('/?view=register'); check($code===200 && str_contains($body,'Welcome back.'),'unauthenticated register shows login'); $csrf=token($body);
    [$code,$body]=request('/?view=login',['action'=>'login','csrf'=>$csrf,'email'=>$email,'password'=>'wrong']); check(str_contains($body,'incorrect'),'invalid login rejected');
    [$code,,$headers]=request('/?view=login',['action'=>'login','csrf'=>$csrf,'email'=>$email,'password'=>$password]); check($code===303 && str_contains($headers,'view=register'),'valid login redirects');
    [, $body]=request('/?view=subjects'); $csrf=token($body);
    [$code,$body]=request('/?view=subjects',['action'=>'save_subject','csrf'=>'bad','code'=>'BAD','name'=>'Bad']); check(str_contains($body,'form expired'),'invalid CSRF rejected');
    [$code]=request('/?view=subjects',['action'=>'save_subject','csrf'=>$csrf,'code'=>'CHECK101','name'=>'Test subject']); check($code===303,'subject creation');
    $subject=(int)query('SELECT id FROM subjects WHERE owner_id=?',[$owner])->fetchColumn();
    $payload=['action'=>'save_record','csrf'=>$csrf,'student_name'=>'Check Student','matric_number'=>'CHECK01','subject_id'=>$subject,'academic_term'=>'Test term','test_1'=>'80','test_2'=>'70','final_exam'=>'90','feedback'=>'Feedback <script>alert(1)</script>'];
    [$code,,$headers]=request('/?view=form',$payload); check($code===303,'result creation');
    $result=query('SELECT * FROM student_subject_performance WHERE owner_id=?',[$owner])->fetch(); $id=(int)$result['id'];
    check((float)$result['total_marks']===82.0 && $result['final_grade']==='A','20/30/50 weighted total persisted');
    [, $body]=request('/?view=result&id='.$id); check(str_contains($body,'&lt;script&gt;') && !str_contains($body,'Feedback <script>'),'feedback safely escaped');
    [, $body]=request('/?view=register&q=Check+Student'); check(str_contains($body,'CHECK01'),'search finds student');
    [, $body]=request('/?view=register&q=not-present'); check(str_contains($body,'No results match'),'search empty state');
    [$code,$body]=request('/?view=form&id='.$id,array_replace($payload,['id'=>$id,'test_1'=>'101'])); check(str_contains($body,'Marks must be between'),'out-of-range mark rejected');
    check((float)query('SELECT total_marks FROM grade_records WHERE id=?',[$id])->fetchColumn()===82.0,'invalid update leaves stored mark unchanged');
    [$code,$body]=request('/?view=form',$payload); check(str_contains($body,'already exists'),'duplicate student/subject/term rejected');
    foreach ([[0,'E'],[39.99,'E'],[40,'D'],[49.99,'D'],[50,'C'],[64.99,'C'],[65,'B'],[79.99,'B'],[80,'A'],[100,'A']] as [$mark,$expected]) {
        request('/?view=form&id='.$id,array_replace($payload,['id'=>$id,'test_1'=>(string)$mark,'test_2'=>(string)$mark,'final_exam'=>(string)$mark]));
        $r=query('SELECT * FROM student_subject_performance WHERE id=?',[$id])->fetch();
        check($r['final_grade']===$expected && (float)$r['total_marks']===(float)$mark,"boundary $mark maps to $expected");
    }
    [$code]=request('/?view=form&id='.$id,array_replace($payload,['id'=>$id,'final_exam'=>'']));
    check($code===303 && query('SELECT total_marks FROM grade_records WHERE id=?',[$id])->fetchColumn()===null,'blank assessment remains pending');
    // Exact decimal rounding should agree with the browser preview.
    request('/?view=form&id='.$id,array_replace($payload,['id'=>$id,'test_1'=>'79.99','test_2'=>'80','final_exam'=>'80']));
    check(query('SELECT final_grade FROM student_subject_performance WHERE id=?',[$id])->fetchColumn()==='A','rounded 79.998 receives A');
    query('INSERT INTO subjects(owner_id,code,name) VALUES (?,?,?)',[$other,'PRIVATE','Private subject']); $privateSubject=(int)db()->lastInsertId();
    [$code,$body]=request('/?view=form&id='.$id,array_replace($payload,['id'=>$id,'subject_id'=>$privateSubject])); check(str_contains($body,'unavailable'),'foreign account subject blocked');
    query('INSERT INTO students(owner_id,matric_number,full_name) VALUES (?,?,?)',[$other,'PRIVATE','Private Student']); $privateStudent=(int)db()->lastInsertId();
    query('INSERT INTO grade_records(owner_id,student_id,subject_id,academic_term,feedback) VALUES (?,?,?,?,?)',[$other,$privateStudent,$privateSubject,'Private','']); $privateResult=(int)db()->lastInsertId();
    [$code]=request('/?view=result&id='.$privateResult); check($code===404,'foreign result read blocked');
    [$code,$body]=request('/?view=result&id='.$privateResult,['action'=>'delete_record','csrf'=>$csrf,'id'=>$privateResult]); check(str_contains($body,'unavailable') && query('SELECT COUNT(*) FROM grade_records WHERE id=?',[$privateResult])->fetchColumn()==1,'foreign result delete blocked');
    [, $body]=request('/?view=performance'); check(str_contains($body,'Grade distribution') && !str_contains($body,'Private Student'),'performance scoped to account');
    [$code]=request('/?view=result&id='.$id,['action'=>'delete_record','csrf'=>$csrf,'id'=>$id]); check($code===303 && query('SELECT COUNT(*) FROM grade_records WHERE id=?',[$id])->fetchColumn()==0,'delete persists');
    check(query('SELECT COUNT(*) FROM students WHERE owner_id=?',[$owner])->fetchColumn()==1,'deleting result preserves student');
    $student=(int)query('SELECT id FROM students WHERE owner_id=?',[$owner])->fetchColumn();
    [$code]=request('/?view=students&edit='.$student,['action'=>'save_student','csrf'=>$csrf,'id'=>$student,'matric_number'=>'CHECK01','full_name'=>'Updated Student']);
    check($code===303 && query('SELECT full_name FROM students WHERE id=?',[$student])->fetchColumn()==='Updated Student','student details update persists');
    [$code]=request('/?view=subjects&edit='.$subject,['action'=>'save_subject','csrf'=>$csrf,'id'=>$subject,'code'=>'CHECK102','name'=>'Updated Subject']);
    check($code===303 && query('SELECT name FROM subjects WHERE id=?',[$subject])->fetchColumn()==='Updated Subject','subject details update persists');
    foreach(['/docs/local-reference.pdf','/config.local.php','/database_schema.sql','/.git/config','/app/bootstrap.php'] as $path) { [$code]=request($path); check($code===404,'private path blocked: '.$path); }
    request('/?view=register',['action'=>'logout','csrf'=>$csrf]); [, $body]=request('/?view=register'); check(str_contains($body,'Welcome back.'),'logout clears authentication');
    [, $body]=request('/?view=login'); $csrf=token($body);
    for($attempt=0;$attempt<5;$attempt++) request('/?view=login',['action'=>'login','csrf'=>$csrf,'email'=>$email,'password'=>'wrong']);
    $locked=query('SELECT locked_until FROM staff_users WHERE id=?',[$owner])->fetchColumn();
    check($locked!==null,'five failed logins lock the account');
    [$code,$body]=request('/?view=login',['action'=>'login','csrf'=>$csrf,'email'=>$email,'password'=>$password]);
    check($code===200 && str_contains($body,'temporarily locked'),'locked account rejects even a correct password');
    echo "$checks checks passed.\n";
} finally {
    foreach($ownerIds as $owner) { query('DELETE FROM grade_records WHERE owner_id=?',[$owner]); query('DELETE FROM subjects WHERE owner_id=?',[$owner]); query('DELETE FROM students WHERE owner_id=?',[$owner]); query('DELETE FROM staff_users WHERE id=?',[$owner]); }
    if(is_file($jar)) unlink($jar);
}
