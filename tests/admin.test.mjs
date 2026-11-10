import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../server/api.mjs';
import { passwordHash, adminSession } from '../server/security.mjs';

test('administrator can sign in before connecting a database; connection controls require administrator access', async()=>{
  const keys=['DATABASE_URL','GRADING_ADMIN_EMAIL','GRADING_ADMIN_PASSWORD_HASH','GRADING_SESSION_SECRET'];
  const original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const password='test-only-random-admin-password';
  delete process.env.DATABASE_URL;process.env.GRADING_SESSION_SECRET='test-only-server-encryption-key-at-least-32';
  process.env.GRADING_ADMIN_EMAIL='admin@example.test';process.env.GRADING_ADMIN_PASSWORD_HASH=passwordHash(password);
  let cookies='';let csrf='';
  async function req(path,data,token=csrf){
    const headers={cookie:cookies};if(data)Object.assign(headers,{'content-type':'application/json',origin:'https://gradebook.example.test','x-csrf-token':token});
    const response=await handler(new Request(`https://gradebook.example.test/api/${path}`,{method:data?'POST':'GET',headers,...(data?{body:JSON.stringify(data)}:{})}));
    return {status:response.status,body:await response.json(),cookies:response.headers.getSetCookie()};
  }
  try{
    const status=await req('status');assert.equal(status.body.configured,false);assert.equal(status.body.adminReady,true);
    assert.equal((await req('connection/test',{connectionUrl:'postgres://user:password@ep-test.neon.tech/db'})).status,403);
    assert.equal((await req('login',{email:'admin@example.test',password:'incorrect'})).status,401);
    const login=await req('login',{email:'admin@example.test',password});assert.equal(login.status,200);assert.equal(login.body.user.role,'admin');
    assert.ok(login.cookies[0].includes('HttpOnly'));assert.ok(login.cookies[0].includes('Secure'));
    cookies=login.cookies.map(value=>value.split(';')[0]).join('; ');csrf=login.body.csrf;
    assert.equal((await req('session')).body.user.name,'Workspace administrator');
    assert.equal((await req('workspace')).body.needsConnection,true);
    assert.equal((await req('connection/test',{connectionUrl:'postgres://user:password@ep-test.neon.tech/db'},'bad')).status,403);
    assert.equal((await req('connection/test',{connectionUrl:'postgres://user:password@example.com/db'})).status,400);
    const logout=await req('logout',{});assert.equal(logout.status,200);assert.ok(logout.cookies.some(value=>value.startsWith('gb_admin=;')));
    process.env.GRADING_ADMIN_PASSWORD_HASH=passwordHash('a-new-test-password');
    assert.equal(adminSession(new Request('https://gradebook.example.test',{headers:{cookie:cookies}})),null);
  }finally{for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}}
});
