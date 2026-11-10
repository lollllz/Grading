import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { handler } from '../server/api.mjs';
import { passwordHash,hash } from '../server/security.mjs';

test('PostgreSQL API integration with disposable fixtures',{skip:process.env.GRADING_TEST_ALLOW_WRITES!=='1'},async t=>{
  assert.ok(process.env.DATABASE_URL?.includes('127.0.0.1'),'Use an isolated loopback test database.');
  const savedAdmin={email:process.env.GRADING_ADMIN_EMAIL,hash:process.env.GRADING_ADMIN_PASSWORD_HASH};
  if(!process.env.GRADING_TEST_URL){delete process.env.GRADING_ADMIN_EMAIL;delete process.env.GRADING_ADMIN_PASSWORD_HASH;}
  const database=new pg.Pool({connectionString:process.env.DATABASE_URL});
  const suffix=crypto.randomUUID();const email=`test-${suffix}@example.test`;const password=`test-password-${suffix}`;
  const cookies=new Map();let csrf='';let owner;let other;let subject;let result;
  const base=process.env.GRADING_TEST_URL||'http://localhost:5173';
  async function request(path,data,{origin=base,token=csrf}={}){
    const headers={cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join(';')};
    if(data){headers['content-type']='application/json';headers.origin=origin;headers['x-csrf-token']=token;}
    const req=new Request(`${base}/api/${path}`,{method:data?'POST':'GET',headers,...(data?{body:JSON.stringify(data)}:{})});
    const response=process.env.GRADING_TEST_URL?await fetch(req):await handler(req);
    for(const cookie of response.headers.getSetCookie()){const [pair]=cookie.split(';');const [key,value]=pair.split('=');if(value)cookies.set(key,value);else cookies.delete(key);}
    return {status:response.status,body:await response.json()};
  }
  try{
    await t.test('status exposes configuration flags without credentials',async()=>{const r=await request('status');assert.equal(r.status,200);assert.equal(r.body.configured,true);assert.ok(!JSON.stringify(r.body).includes('postgresql://'));});
    await t.test('cross-origin and unverified database setup rejected',async()=>{assert.equal((await request('setup',{}, {origin:'https://evil.test'})).status,403);assert.equal((await request('setup',{})).status,403);});
    await t.test('read-only diagnostics and credential-authorized connection',async()=>{
      const r=await request('connection/test',{connectionUrl:process.env.DATABASE_URL});assert.equal(r.status,200,JSON.stringify(r.body));
      assert.equal(r.body.provider,'PostgreSQL');assert.equal(r.body.host,'127.0.0.1');assert.equal(r.body.initialized,false);assert.ok(!JSON.stringify(r.body).includes('postgresql://'));
      const connected=await request('connection/connect',{connectionUrl:process.env.DATABASE_URL});assert.equal(connected.body.connected,true);
      assert.equal((await request('connection/test',{connectionUrl:'postgres://user:secret@example.com/private'})).status,400);
    });
    await t.test('schema initialization and owner creation',async()=>{
      const r=await request('setup',{name:'Test educator',email,password});assert.equal(r.status,200,JSON.stringify(r.body));
      owner=(await database.query('SELECT id FROM gradebook.staff_users WHERE email=$1',[email])).rows[0].id;
    });
    await t.test('initialization refuses a second owner',async()=>{assert.equal((await request('setup',{name:'Someone',email:'other@example.test',password})).status,409);});
    await t.test('wrong login rejected; valid login sets an HttpOnly session',async()=>{
      assert.equal((await request('login',{email,password:'bad'})).status,401);
      const r=await request('login',{email,password});assert.equal(r.status,200);assert.ok(cookies.get('gb_session'));csrf=r.body.csrf;
      assert.equal((await request('session')).body.user.name,'Test educator');
    });
    await t.test('CSRF and unauthenticated writes blocked',async()=>{assert.equal((await request('subjects',{code:'T',name:'Test'},{token:'bad'})).status,403);});
    await t.test('create subject and weighted result',async()=>{
      const sub=await request('subjects',{code:'TEST01',name:'Test subject'});assert.equal(sub.status,200);subject=sub.body.id;
      const r=await request('results',{subject_id:subject,matric_number:'TEST01',student_name:'Test Student',academic_term:'July 2026',test_1:80,test_2:70,final_exam:90,feedback:'<script>test</script>'});assert.equal(r.status,200,JSON.stringify(r.body));result=r.body.id;
      const row=(await database.query('SELECT * FROM gradebook.student_subject_performance WHERE id=$1',[result])).rows[0];assert.equal(Number(row.total_marks),82);assert.equal(row.final_grade,'A');
    });
    const payload=()=>({id:result,subject_id:subject,matric_number:'TEST01',student_name:'Test Student',academic_term:'July 2026',feedback:''});
    await t.test('validation and duplicate records leave data unchanged',async()=>{
      assert.equal((await request('results',{...payload(),test_1:101})).status,400);
      assert.equal((await request('results',{...payload(),id:undefined,test_1:1,test_2:1,final_exam:1})).status,409);
      assert.equal(Number((await database.query('SELECT total_marks FROM gradebook.grade_records WHERE id=$1',[result])).rows[0].total_marks),82);
    });
    await t.test('all grade boundaries persist correctly',async()=>{
      for(const [mark,g]of [[0,'E'],[39.99,'E'],[40,'D'],[50,'C'],[65,'B'],[79.99,'B'],[80,'A'],[100,'A']]){
        assert.equal((await request('results',{...payload(),test_1:mark,test_2:mark,final_exam:mark})).status,200);
        const row=(await database.query('SELECT * FROM gradebook.student_subject_performance WHERE id=$1',[result])).rows[0];assert.equal(Number(row.total_marks),mark);assert.equal(row.final_grade,g);
      }
      assert.equal((await request('results',{...payload(),test_1:80,test_2:'',final_exam:90})).status,200);
      assert.equal((await database.query('SELECT total_marks FROM gradebook.grade_records WHERE id=$1',[result])).rows[0].total_marks,null);
    });
    await t.test('cross-account access is denied',async()=>{
      other=(await database.query('INSERT INTO gradebook.staff_users(full_name,email,password_hash) VALUES($1,$2,$3) RETURNING id',['Other',`other-${email}`,passwordHash(password)])).rows[0].id;
      const privateSubject=(await database.query('INSERT INTO gradebook.subjects(owner_id,code,name) VALUES($1,$2,$3) RETURNING id',[other,'PRIVATE','Private'])).rows[0].id;
      assert.equal((await request('subjects',{id:privateSubject,code:'BAD',name:'Bad'})).status,404);
      assert.equal((await request('results',{...payload(),subject_id:privateSubject})).status,404);
      const all=await request('workspace');assert.equal(all.body.subjects.length,1);assert.ok(!JSON.stringify(all.body).includes('Private'));
    });
    await t.test('student and subject updates persist',async()=>{
      const student=(await database.query('SELECT student_id FROM gradebook.grade_records WHERE id=$1',[result])).rows[0].student_id;
      assert.equal((await request('students',{id:student,matric_number:'TEST01',full_name:'Updated Student'})).status,200);
      assert.equal((await request('subjects',{id:subject,code:'TEST02',name:'Updated subject'})).status,200);
      const workspace=await request('workspace');assert.equal(workspace.body.records[0].student_name,'Updated Student');assert.equal(workspace.body.records[0].subject_code,'TEST02');
    });
    await t.test('record deletion persists without deleting the student',async()=>{
      assert.equal((await request('results/delete',{id:result})).status,200);
      const workspace=await request('workspace');assert.equal(workspace.body.records.length,0);assert.equal(workspace.body.students.length,1);
    });
    await t.test('logout revokes the database session',async()=>{
      const token=cookies.get('gb_session');assert.equal((await request('logout',{})).status,200);assert.equal((await request('workspace')).status,401);
      assert.equal((await database.query('SELECT count(*)::int AS n FROM gradebook.sessions WHERE token_hash=$1',[hash(token)])).rows[0].n,0);
    });
    await t.test('account throttling blocks a correct password after five failures',async()=>{
      for(let i=0;i<5;i++)await request('login',{email,password:'bad'});
      assert.equal((await request('login',{email,password})).status,401);
    });
  }finally{
    for(const id of [owner,other].filter(Boolean)){
      await database.query('DELETE FROM gradebook.grade_records WHERE owner_id=$1',[id]);await database.query('DELETE FROM gradebook.students WHERE owner_id=$1',[id]);await database.query('DELETE FROM gradebook.subjects WHERE owner_id=$1',[id]);await database.query('DELETE FROM gradebook.staff_users WHERE id=$1',[id]);
    }
    await database.end();
    if(!process.env.GRADING_TEST_URL){for(const [key,value]of Object.entries({GRADING_ADMIN_EMAIL:savedAdmin.email,GRADING_ADMIN_PASSWORD_HASH:savedAdmin.hash})){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  }
});
