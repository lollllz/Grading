import { calculate, letterGrade } from './grading.js';
const STORAGE_KEY = 'gradebook.demo.v2';
export function demoData() {
  const subjects = [{id:'s1',code:'CRM1963',name:'Web Programming with PHP'},{id:'s2',code:'CRM1953',name:'Database Fundamentals'},{id:'s3',code:'CRM1943',name:'Programming Principles'}];
  const names = ['Alya Rahman','Daniel Lim','Nur Aisyah','Ethan Tan','Sofia Abdullah','Arjun Kumar','Mei Ling','Amir Hakim'];
  const scores = [[86,82,91],[74,68,72],[90,88,94],[60,57,63],[78,82,85],[38,32,36],[67,70,73],[72,null,null]];
  const students = names.map((full_name,i)=>({id:`u${i+1}`,full_name,matric_number:`DEMO${String(i+1).padStart(4,'0')}`}));
  const records = students.map((student,i)=>({id:`r${i+1}`,student_id:student.id,subject_id:subjects[i%3].id,academic_term:'July 2026',test_1:scores[i][0],test_2:scores[i][1],final_exam:scores[i][2],feedback:i===5?'Let’s review the core concepts together and plan a focused revision session.':'',updated_at:new Date().toISOString()}));
  return { students, subjects, records };
}
export function readDemo() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return demoData();
  let parsed; try { parsed=JSON.parse(raw); } catch { throw new Error('The browser demo could not be read. Export or clear this site’s browser storage before starting again.'); }
  if (![parsed.students,parsed.subjects,parsed.records].every(Array.isArray)) throw new Error('The browser demo format is invalid.');
  return parsed;
}
export function writeDemo(data) { localStorage.setItem(STORAGE_KEY,JSON.stringify(data)); }
export function enrich(data) {
  const students=new Map(data.students.map(s=>[String(s.id),s])); const subjects=new Map(data.subjects.map(s=>[String(s.id),s]));
  return data.records.map(record=>{
    const student=students.get(String(record.student_id)); const subject=subjects.get(String(record.subject_id));
    const total=calculate(record);
    return {...record,total_marks:total,final_grade:letterGrade(total),student_name:student?.full_name??'Unknown student',matric_number:student?.matric_number??'',subject_code:subject?.code??'',subject_name:subject?.name??''};
  });
}
export function mutateDemo(current,type,input) {
  const next=structuredClone(current);
  if(type==='subjects'||type==='students') {
    const codeKey=type==='subjects'?'code':'matric_number'; const nameKey=type==='subjects'?'name':'full_name';
    const code=input[codeKey].trim().toUpperCase(); const name=input[nameKey].trim();
    if(!code||!name) throw new Error('Complete the required details.');
    if(next[type].some(item=>item[codeKey].toLowerCase()===code.toLowerCase() && item.id!==input.id)) throw new Error('That code or matric number is already in use.');
    const item={id:input.id||crypto.randomUUID(),[codeKey]:code,[nameKey]:name};
    next[type]=input.id ? next[type].map(row=>row.id===input.id?item:row) : [...next[type],item];
    return {data:next,id:item.id};
  }
  if(type==='delete') { next.records=next.records.filter(r=>r.id!==input.id); return {data:next}; }
  const total=calculate(input); const matric=input.matric_number.trim().toUpperCase(); const name=input.student_name.trim();
  if(!name||!matric||!input.academic_term.trim()) throw new Error('Complete the student details and academic term.');
  if(!next.subjects.some(s=>s.id===input.subject_id)) throw new Error('Choose a subject.');
  let student=next.students.find(s=>s.matric_number.toLowerCase()===matric.toLowerCase());
  if(student && student.full_name!==name) throw new Error('This matric number belongs to '+student.full_name+'. Update their name in Students.');
  if(!student) { student={id:crypto.randomUUID(),full_name:name,matric_number:matric}; next.students.push(student); }
  if(next.records.some(r=>r.id!==input.id&&r.student_id===student.id&&r.subject_id===input.subject_id&&r.academic_term.toLowerCase()===input.academic_term.trim().toLowerCase())) throw new Error('This student already has a result for that subject and term.');
  const record={...input,id:input.id||crypto.randomUUID(),student_id:student.id,academic_term:input.academic_term.trim(),total_marks:total,updated_at:new Date().toISOString()};
  next.records=input.id?next.records.map(r=>r.id===input.id?record:r):[record,...next.records];
  return {data:next,id:record.id};
}
export async function api(path, data, csrf) {
  let response;
  try {
    response = await fetch(`/api/${path}`, {method:data?'POST':'GET',credentials:'same-origin',headers:data?{'Content-Type':'application/json',...(csrf?{'X-CSRF-Token':csrf}:{})}:{},...(data?{body:JSON.stringify(data)}:{})});
  } catch { throw Object.assign(new Error('The server could not be reached. Check your connection and retry.'),{status:0}); }
  let result; try { result=await response.json(); } catch { throw Object.assign(new Error('The cloud API is unavailable on this preview. You can still explore the browser demo.'),{status:503}); }
  if(!response.ok) throw Object.assign(new Error(result.error||'The request could not be completed.'),{status:response.status});
  return result;
}
