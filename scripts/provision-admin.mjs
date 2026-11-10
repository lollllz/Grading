import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { passwordHash } from '../server/security.mjs';

const { values } = parseArgs({ options: { email:{type:'string',default:'admin@gradebook.local'}, netlify:{type:'boolean',default:false}, site:{type:'string'}, url:{type:'string',default:'http://127.0.0.1:5173'} } });
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Enter a valid administrator email.');
if(values.netlify&&!values.site) throw new Error('Specify --site when provisioning a hosted administrator.');
const password=randomBytes(24).toString('base64url');
const config={GRADING_ADMIN_EMAIL:values.email.toLowerCase(),GRADING_ADMIN_PASSWORD_HASH:passwordHash(password)};
mkdirSync('.local',{recursive:true});
const target='.local/admin-credentials.txt';
writeFileSync(target,`Gradebook administrator\n\nSign in: ${values.url}\nEmail: ${config.GRADING_ADMIN_EMAIL}\nPassword: ${password}\n\nKeep this file private. It is ignored by Git.\n`,{mode:0o600});chmodSync(target,0o600);
let local='';try{local=readFileSync('.env','utf8');}catch{}
local=local.split('\n').filter(line=>!/^GRADING_ADMIN_(EMAIL|PASSWORD_HASH)=/.test(line)).join('\n').trim();
writeFileSync('.env',local+'\n'+Object.entries(config).map(([key,value])=>`${key}=${value}`).join('\n')+'\n',{mode:0o600});chmodSync('.env',0o600);
if(values.netlify){
 for(const [key,value]of Object.entries(config)){
  const args=['node_modules/netlify-cli/bin/run.js','env:set',key,value,'--force','--context','production','--site',values.site];
  if(key.endsWith('HASH'))args.push('--secret');
  const result=spawnSync(process.execPath,args,{encoding:'utf8'});
  if(result.status!==0){console.error((result.stderr||result.stdout||'Administrator provisioning failed').replaceAll(value,'[redacted]'));process.exit(1);}
 }
}
console.log(`Administrator created: ${config.GRADING_ADMIN_EMAIL}\nRandom password saved privately in ${target}.`);
console.log('Restart local development or redeploy the site to apply credential changes.');
