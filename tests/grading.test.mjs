import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculate,letterGrade,parseMark,matchesSearch } from '../src/grading.js';
import { demoData,mutateDemo,enrich } from '../src/data.js';
import { schema } from '../server/schema.mjs';
import { seal,unseal,validateConnection,passwordHash,verifyPassword } from '../server/security.mjs';

test('weighted totals, missing work, and zero marks',()=>{
  assert.equal(calculate({test_1:80,test_2:70,final_exam:90}),82);
  assert.equal(calculate({test_1:0,test_2:0,final_exam:0}),0);
  assert.equal(calculate({test_1:80,test_2:'',final_exam:90}),null);
  assert.equal(calculate({test_1:79.99,test_2:80,final_exam:80}),80);
});
for(const [mark,expected]of [[0,'E'],[39.99,'E'],[40,'D'],[49.99,'D'],[50,'C'],[64.99,'C'],[65,'B'],[79.99,'B'],[80,'A'],[100,'A'],[null,null]]){
  test(`grade boundary ${mark}: ${expected}`,()=>assert.equal(letterGrade(mark),expected));
}
test('malformed and out-of-range marks rejected',()=>{
  for(const value of [-1,101,'1e2','NaN','12.345',{},'Infinity'])assert.throws(()=>parseMark(value));
});
test('search accepts tokens and case variations',()=>{
  assert.ok(matchesSearch('Alya Rahman CRM1963 July 2026','crm1963 alya'));
  assert.ok(!matchesSearch('Alya Rahman','Daniel'));
});
test('browser demo maintains linked results and prevents duplicates',()=>{
  const original=demoData();const subject=mutateDemo(original,'subjects',{code:'TEST',name:'Test subject'});
  const saved=mutateDemo(subject.data,'results',{matric_number:'TEST01',student_name:'Test student',subject_id:subject.id,academic_term:'Test',test_1:80,test_2:70,final_exam:90,feedback:''});
  assert.equal(enrich(saved.data).find(r=>r.id===saved.id).total_marks,82);
  assert.equal(original.records.length,8);
  assert.throws(()=>mutateDemo(saved.data,'results',{matric_number:'TEST01',student_name:'Test student',subject_id:subject.id,academic_term:'Test',test_1:1,test_2:1,final_exam:1}),/already/);
  const deleted=mutateDemo(saved.data,'delete',{id:saved.id});assert.equal(deleted.data.students.length,9);assert.equal(deleted.data.records.length,8);
});
test('schema export matches the version used by initialization',()=>{
  assert.equal(readFileSync(new URL('../database/postgres.sql',import.meta.url),'utf8'),`-- PostgreSQL 16+ / Neon. Objects live in the isolated gradebook schema.\nBEGIN;\n${schema}\nCOMMIT;\n`);
});
test('connection form rejects non-Neon hosts, alternate ports and URL schemes',()=>{
  for(const value of ['http://example.com/db','postgres://user:secret@localhost/db','postgres://user:secret@example.com/db','postgres://user:secret@ep-test.neon.tech:1234/db','postgres://user:secret@ep-test.neon.tech.attacker.test/db'])assert.throws(()=>validateConnection(value,true));
  const result=validateConnection('postgres://user:secret@ep-test-pooler.eu-central-1.aws.neon.tech/db?sslmode=disable',true);
  assert.equal(result.ssl.rejectUnauthorized,true);assert.ok(!result.connectionString.includes('sslmode'));
});
test('connection cookie is encrypted, authenticated, purpose-bound and expires',()=>{
  process.env.GRADING_SESSION_SECRET='test-only-secret-which-is-at-least-32-characters';
  const sealed=seal({url:'postgres://user:secret@ep-test.neon.tech/db',expires:Date.now()+60000},'database');
  assert.ok(!sealed.includes('secret'));assert.ok(unseal(sealed,'database'));
  assert.equal(unseal(sealed.slice(0,-5)+'XXXXX','database'),null);assert.equal(unseal(sealed,'different-purpose'),null);
  assert.equal(unseal(seal({expires:Date.now()-1},'database'),'database'),null);
});
test('password hashes verify without storing a plain password',()=>{
  const pass='test-only-long-password';const digest=passwordHash(pass);
  assert.ok(!digest.includes(pass));assert.ok(verifyPassword(pass,digest));assert.ok(!verifyPassword('incorrect',digest));
});
