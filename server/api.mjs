import { schema, schemaVersion } from './schema.mjs';
import { env, hash, randomToken, seal, unseal, parseCookies, cookie, passwordHash, verifyPassword, validateConnection, sameSecret, adminConfigured, adminSession } from './security.mjs';
import { connectionFor, poolFor, inTransaction } from './database.mjs';
import { parseMark } from '../src/grading.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, label, optional = false) => {
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.trim().length > max) fail(`${label} is required and must be at most ${max} characters.`);
  return value.trim();
};
const idValue = value => { if (!/^\d+$/.test(String(value))) fail('Choose a valid record.'); return String(value); };
function json(body, status = 200, cookies = []) {
  const headers = new Headers({ 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin' });
  for (const item of cookies) headers.append('Set-Cookie', item);
  return new Response(JSON.stringify(body), { status, headers });
}
async function readBody(request) {
  if (!(request.headers.get('content-type') || '').startsWith('application/json')) fail('Use a JSON request.', 415);
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) fail('This request did not come from this workspace.', 403);
  if (Number(request.headers.get('content-length')) > 12000) fail('This form is too large.', 413);
  const raw = await request.text(); if (Buffer.byteLength(raw) > 12000) fail('This form is too large.', 413);
  try { const parsed = JSON.parse(raw); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('Invalid form.'); return parsed; }
  catch { fail('The form could not be read.'); }
}
async function sessionFor(pool, request) {
  const admin = adminSession(request);
  if (admin) {
    const { rows } = await pool.query('SELECT id FROM gradebook.staff_users WHERE email=$1', [admin.email]);
    return { ...admin, user_id: rows[0]?.id || null };
  }
  const token = parseCookies(request).gb_session;
  if (!token || token.length > 100) return null;
  const { rows } = await pool.query(`SELECT s.csrf,s.user_id,u.full_name,u.email FROM gradebook.sessions s
    JOIN gradebook.staff_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash(token)]);
  return rows[0] || null;
}
const userResponse = session => ({ id: session.user_id, name: session.full_name, email: session.email, role: session.role || 'educator' });
async function requireOwned(client, table, id, owner) {
  if (!['subjects','students','grade_records'].includes(table)) throw new Error('Invalid relation');
  const result = await client.query(`SELECT * FROM gradebook.${table} WHERE id=$1 AND owner_id=$2`, [idValue(id), owner]);
  if (!result.rowCount) fail('This record is unavailable.', 404); return result.rows[0];
}
function publicError(error) {
  if (error.status) return { message: error.message, status: error.status };
  if (error.code === '23505') return { message: 'That entry already exists. Check the student, subject, and term.', status:409 };
  if (error.code === '42P01' || error.code === '3F000') return { message:'This database needs workspace setup. Open Connections to initialize it.', status:409 };
  if (error.code === '23503') return { message:'The student or subject is unavailable. Refresh the workspace.', status:409 };
  return { message:'The database could not complete this request. Check the connection, credentials, and network access, then retry.', status:503 };
}
export async function handler(request) {
  let pool;
  try {
    const path = new URL(request.url).pathname.replace(/^\/\.netlify\/functions\/api/, '/api');
    if (!['GET','POST'].includes(request.method)) return json({error:'Method not allowed.'},405);
    const data = request.method === 'POST' ? await readBody(request) : {};
    const admin = adminSession(request);
    if (path === '/api/status' && request.method === 'GET') {
      const configured = Boolean(connectionFor(request));
      return json({ available:true, configured, sessionReady:Boolean(env('GRADING_SESSION_SECRET')?.length >=32),
        adminReady:adminConfigured(), schemaVersion });
    }
    if (path === '/api/login' && request.method === 'POST' && adminConfigured()
        && typeof data.email === 'string' && data.email.trim().toLowerCase() === env('GRADING_ADMIN_EMAIL').toLowerCase()) {
      if (!verifyPassword(data.password, env('GRADING_ADMIN_PASSWORD_HASH'))) fail('Email or password is incorrect.',401);
      const csrf=randomToken(); const sealed=seal({email:env('GRADING_ADMIN_EMAIL').toLowerCase(),csrf,
        version:hash(env('GRADING_ADMIN_PASSWORD_HASH')),expires:Date.now()+28800000},'admin');
      return json({user:{id:'admin',name:'Workspace administrator',email:env('GRADING_ADMIN_EMAIL'),role:'admin'},csrf},200,[cookie('gb_admin',sealed,request)]);
    }
    if (path === '/api/session' && request.method === 'GET' && admin) return json({user:{...userResponse(admin),id:'admin'},csrf:admin.csrf});
    if (path === '/api/logout' && request.method === 'POST' && admin) {
      if (!sameSecret(request.headers.get('x-csrf-token'),admin.csrf)) fail('Your form expired. Reload and try again.',403);
      return json({signedOut:true},200,[cookie('gb_admin','',request,0),cookie('gb_session','',request,0)]);
    }
    if (path === '/api/workspace' && request.method === 'GET' && admin && !connectionFor(request)) {
      return json({students:[],subjects:[],records:[],needsConnection:true});
    }
    if ((path.startsWith('/api/connection/') || path === '/api/setup') && request.method === 'POST' && adminConfigured()) {
      if (!admin) fail('Sign in as administrator to manage database connections.',403);
      if (!sameSecret(request.headers.get('x-csrf-token'),admin.csrf)) fail('Your form expired. Reload and try again.',403);
    }
    if (['/api/connection/test','/api/connection/connect'].includes(path) && request.method === 'POST') {
      if (!env('GRADING_SESSION_SECRET') || env('GRADING_SESSION_SECRET').length < 32) fail('Set GRADING_SESSION_SECRET on the server first.',503);
      let connection;
      if (data.connectionUrl) connection = validateConnection(data.connectionUrl,true);
      else {
        connection = connectionFor(request);
        pool = poolFor(connection);
        if (!await sessionFor(pool,request)) fail('Paste your Neon connection URL to verify access to the database.',403);
      }
      pool ||= poolFor(connection);
      const started = Date.now();
      const ping = await pool.query("SELECT current_database() AS database, current_setting('server_version') AS version, to_regclass('gradebook.schema_version') IS NOT NULL AS initialized");
      const tablesReady = ping.rows[0].initialized;
      const hasAccount = tablesReady ? (await pool.query('SELECT EXISTS(SELECT 1 FROM gradebook.staff_users) AS ready')).rows[0].ready : false;
      const summary = {provider:connection.provider,host:connection.host,...ping.rows[0],tablesReady,initialized:hasAccount,latency:Date.now()-started};
      if (path.endsWith('/connect')) {
        if (!data.connectionUrl) return json({ ...summary, connected:true });
        const sealed = seal({ url: data.connectionUrl.trim(), expires: Date.now()+28800000 }, 'database');
        return json({ ...summary, connected:true },200,[cookie('gb_database',sealed,request),cookie('gb_session','',request,0)]);
      }
      return json(summary);
    }
    if (path === '/api/connection/disconnect' && request.method === 'POST') {
      return json({disconnected:true},200,[cookie('gb_database','',request,0),cookie('gb_session','',request,0)]);
    }
    pool = poolFor(connectionFor(request));
    if (path === '/api/setup' && request.method === 'POST') {
      if (!admin && !unseal(parseCookies(request).gb_database, 'database')) fail('Connect your database before initializing its workspace.',403);
      const name=admin ? admin.full_name : text(data.name,120,'Name'); const email=admin ? admin.email : text(data.email,190,'Email').toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
      const digest=admin ? env('GRADING_ADMIN_PASSWORD_HASH') : passwordHash(data.password);
      await inTransaction(pool, async client => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('gradebook-initialize'))");
        await client.query(schema);
        const {rows}=await client.query('SELECT count(*)::int AS count FROM gradebook.staff_users');
        if (rows[0].count && !admin) fail('This workspace already has an educator account. Sign in with that account.',409);
        await client.query('INSERT INTO gradebook.staff_users(full_name,email,password_hash) VALUES ($1,$2,$3) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash',[name,email,digest]);
      });
      return json({initialized:true});
    }
    if (path === '/api/login' && request.method === 'POST') {
      const email=text(data.email,190,'Email').toLowerCase();
      const {rows}=await pool.query('SELECT * FROM gradebook.staff_users WHERE email=$1',[email]); const user=rows[0];
      const valid=verifyPassword(data.password,user?.password_hash);
      const locked=user?.locked_until && new Date(user.locked_until).getTime()>Date.now();
      if (!user || !valid || locked) {
        if(user && !locked) await pool.query(`UPDATE gradebook.staff_users SET failed_logins=failed_logins+1,
          locked_until=CASE WHEN failed_logins+1>=5 THEN now()+interval '15 minutes' ELSE NULL END WHERE id=$1`,[user.id]);
        fail('Email or password is incorrect, or this account is temporarily locked.',401);
      }
      const token=randomToken(); const csrf=randomToken();
      await inTransaction(pool,async client=>{
        await client.query('UPDATE gradebook.staff_users SET failed_logins=0,locked_until=NULL WHERE id=$1',[user.id]);
        await client.query('DELETE FROM gradebook.sessions WHERE expires_at < now()');
        await client.query("INSERT INTO gradebook.sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+interval '8 hours')",[hash(token),user.id,csrf]);
      });
      return json({ user:{id:user.id,name:user.full_name,email:user.email},csrf },200,[cookie('gb_session',token,request)]);
    }
    let session;
    try { session=await sessionFor(pool,request); }
    catch(error) { if(admin && path==='/api/workspace' && ['42P01','3F000'].includes(error.code)) return json({students:[],subjects:[],records:[],needsConnection:true}); throw error; }
    if (admin && !session?.user_id && path==='/api/workspace') return json({students:[],subjects:[],records:[],needsConnection:true});
    if (!session) fail('Please sign in to your cloud workspace.',401);
    if (request.method==='POST' && !sameSecret(request.headers.get('x-csrf-token'), session.csrf)) fail('Your form expired. Reload and try again.',403);
    const owner=session.user_id;
    if (!owner) fail('Initialize this database in Connections before adding student data.',409);
    if (path === '/api/session' && request.method==='GET') return json({user:userResponse(session),csrf:session.csrf});
    if (path === '/api/logout' && request.method==='POST') {
      await pool.query('DELETE FROM gradebook.sessions WHERE token_hash=$1',[hash(parseCookies(request).gb_session)]);
      return json({signedOut:true},200,[cookie('gb_session','',request,0)]);
    }
    if (path === '/api/workspace' && request.method==='GET') {
      const [students,subjects,records]=await Promise.all([
        pool.query('SELECT * FROM gradebook.students WHERE owner_id=$1 ORDER BY full_name',[owner]),
        pool.query('SELECT * FROM gradebook.subjects WHERE owner_id=$1 ORDER BY name',[owner]),
        pool.query('SELECT * FROM gradebook.student_subject_performance WHERE owner_id=$1 ORDER BY updated_at DESC,id DESC',[owner]),
      ]);
      return json({students:students.rows,subjects:subjects.rows,records:records.rows});
    }
    if ((path==='/api/subjects' || path==='/api/students') && request.method==='POST') {
      const subject=path.endsWith('subjects'); const table=subject?'subjects':'students';
      const codeKey=subject?'code':'matric_number'; const nameKey=subject?'name':'full_name';
      const code=text(data[codeKey],subject?30:40,subject?'Subject code':'Matric number').toUpperCase();
      const name=text(data[nameKey],120,'Name');
      if(data.id) {
        const result=await pool.query(`UPDATE gradebook.${table} SET ${codeKey}=$1,${nameKey}=$2 WHERE id=$3 AND owner_id=$4 RETURNING id`,[code,name,idValue(data.id),owner]);
        if(!result.rowCount) fail('This entry is unavailable.',404);
        return json({id:result.rows[0].id});
      }
      const {rows}=await pool.query(`INSERT INTO gradebook.${table}(owner_id,${codeKey},${nameKey}) VALUES($1,$2,$3) RETURNING id`,[owner,code,name]);
      return json({id:rows[0].id});
    }
    if (path==='/api/results' && request.method==='POST') {
      const subjectId=idValue(data.subject_id); const matric=text(data.matric_number,40,'Matric number').toUpperCase();
      const name=text(data.student_name,120,'Student name'); const term=text(data.academic_term,80,'Academic term');
      const feedback=text(data.feedback??'',3000,'Feedback',true);
      let scores; try { scores=['test_1','test_2','final_exam'].map(key=>parseMark(data[key])); } catch(error) { fail(error.message); }
      const id=await inTransaction(pool,async client=>{
        if(data.id) await requireOwned(client,'grade_records',data.id,owner);
        await requireOwned(client,'subjects',subjectId,owner);
        const existing=await client.query('SELECT * FROM gradebook.students WHERE owner_id=$1 AND matric_number=$2',[owner,matric]);
        let student=existing.rows[0];
        if(student && student.full_name!==name) fail('That matric number already belongs to '+student.full_name+'. Update their name in Students.');
        if(!student) student=(await client.query('INSERT INTO gradebook.students(owner_id,matric_number,full_name) VALUES($1,$2,$3) RETURNING id',[owner,matric,name])).rows[0];
        const values=[student.id,subjectId,term,...scores,feedback];
        const result=data.id ? await client.query(`UPDATE gradebook.grade_records SET student_id=$1,subject_id=$2,academic_term=$3,test_1=$4,test_2=$5,final_exam=$6,feedback=$7,updated_at=now() WHERE id=$8 AND owner_id=$9 RETURNING id`,[...values,idValue(data.id),owner])
          : await client.query('INSERT INTO gradebook.grade_records(student_id,subject_id,academic_term,test_1,test_2,final_exam,feedback,owner_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[...values,owner]);
        return result.rows[0].id;
      });
      return json({id});
    }
    if (path==='/api/results/delete' && request.method==='POST') {
      const result=await pool.query('DELETE FROM gradebook.grade_records WHERE id=$1 AND owner_id=$2 RETURNING id',[idValue(data.id),owner]);
      if(!result.rowCount) fail('This result is unavailable.',404); return json({deleted:true});
    }
    return json({error:'Endpoint not found.'},404);
  } catch(error) {
    const safe=publicError(error);
    return json({error:safe.message},safe.status);
  } finally { if(pool) await pool.end(); }
}
