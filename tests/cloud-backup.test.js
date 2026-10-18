import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
import {unzipSync,zipSync,strToU8} from 'fflate';
import {installCloudBackup,vault} from '../server/cloudBackup.js';
import {createProviders} from '../server/cloudProviders.js';
import {readBackup} from '../src/readBackup.js';
import {createHash} from 'node:crypto';

async function fixture(t) {
  const db=new Database(':memory:');db.pragma('foreign_keys=ON');
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,token_version INTEGER DEFAULT 0);INSERT INTO users(id) VALUES(1),(2);
    CREATE TABLE notes(id TEXT PRIMARY KEY,user_id INTEGER,type TEXT,title TEXT,content TEXT,items_json TEXT,tags_json TEXT,images_json TEXT,color TEXT,pinned INTEGER,position REAL,timestamp TEXT,archived INTEGER);
    INSERT INTO notes VALUES('mine',1,'checklist','Shopping','','[{"id":"parent","text":"Food","done":false},{"id":"child","text":"Milk","parentId":"parent","done":false}]','["private"]','[{"id":"im","src":"data:image/png;base64,dGVzdA==","name":"photo.png"}]','yellow',1,1,'2026-10-18',1);
    INSERT INTO notes VALUES('other',2,'text','Other account','Do not export','[]','[]','[]','default',0,1,'2026-10-18',0);`);
  let time=Date.parse('2026-10-18T12:00:00Z');const now=()=>time,key=Buffer.alloc(32,7),stores=new Map(),flags={};
  const providers={
    publicUrl:'https://keep.test',configured:p=>['google','onedrive'].includes(p),
    authorization:(provider,state)=>`https://auth.test/${provider}?state=${state}`,
    exchange:async(provider,code,verifier)=>{assert.equal(code,'ok');assert.ok(verifier.length>=43);return {access_token:`access-${provider}`,refresh_token:'refresh-secret',expires_at:now()+3600000};},
    refresh:async()=>({access_token:'renewed-access',refresh_token:'rotated-refresh',expires_at:now()+3600000}),
    drive:(provider,access,scope)=>{
      const id=`${provider}:${scope}`;if(!stores.has(id))stores.set(id,[]);const files=stores.get(id);
      return {list:async()=>files.map(f=>({...f})),remove:async id=>{if(flags.failPrune)throw Error('Retention unavailable');files.splice(files.findIndex(f=>f.id===id),1);},upload:async(name,bytes)=>{
        if(flags.wait)await flags.wait;if(flags.failUpload)throw Error('Upload unavailable');
        const item={id:crypto.randomUUID(),name,size:bytes.length,bytes:Buffer.from(bytes)};files.push(item);return item;
      }};
    },
  };
  const app=express();app.use(express.json());
  const auth=(req,res,next)=>{const id=Number(req.headers['x-user-id']);if(![1,2].includes(id))return res.status(401).json({error:'Sign in'});req.user={id};next();};
  const engine=installCloudBackup(app,{db,dbFile:'unused',auth,providers,key,now,scheduler:false});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{engine.stop();await new Promise(resolve=>server.close(resolve));db.close();});
  const request=async(route,{user=1,method='GET',body,cookie}={})=>{
    const response=await fetch(base+route,{method,redirect:'manual',headers:{...(user?{'x-user-id':String(user)}:{}),'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const result={status:response.status,headers:response.headers};
    if(response.headers.get('content-type')?.includes('json'))result.data=await response.json();else result.bytes=Buffer.from(await response.arrayBuffer());return result;
  };
  const begin=async(provider='google',user=1,days=7)=>{
    const result=await request(`/api/cloud-backup/connect/${provider}`,{user,method:'POST',body:{days}});assert.equal(result.status,200);
    return {state:new URL(result.data.url).searchParams.get('state'),cookie:result.headers.get('set-cookie').split(';')[0]};
  };
  const connect=async(provider='google',user=1,days=7)=>{
    const start=await begin(provider,user,days);const result=await request(`/api/cloud-backup/callback/${provider}?code=ok&state=${start.state}`,{user:0,cookie:start.cookie});assert.equal(result.status,303);return start;
  };
  const files=(provider='google',user=1)=>stores.get(`${provider}:${engine.scopeFor(user)}`) || [];
  return {db,app,auth,engine,providers,key,now,request,begin,connect,files,flags,advance:ms=>time+=ms};
}

test('cloud OAuth is browser-bound, single-use, expiring, session-aware and private per user',async t=>{
  const f=await fixture(t),{request,begin,db,engine}=f;
  assert.equal((await request('/api/cloud-backup',{user:0})).status,401);
  assert.equal((await request('/api/cloud-backup/connect/google',{method:'POST',body:{days:2}})).status,400);
  const start=await begin();
  assert.match(start.cookie,/^__Host-/);
  assert.equal((await request(`/api/cloud-backup/callback/google?code=ok&state=${start.state}`,{user:0})).status,400);
  const done=await request(`/api/cloud-backup/callback/google?code=ok&state=${start.state}`,{user:0,cookie:start.cookie});assert.equal(done.status,303);assert.equal(done.headers.get('location'),'https://keep.test/#/notes?cloudBackup=connected');
  assert.equal((await request(`/api/cloud-backup/callback/google?code=ok&state=${start.state}`,{user:0,cookie:start.cookie})).status,400);
  const stored=engine.account(1,'google');assert.ok(!stored.credentials.includes('refresh-secret'));assert.equal(engine.secure.open(stored.credentials).refresh_token,'refresh-secret');assert.throws(()=>vault(Buffer.alloc(32,8)).open(stored.credentials),/unlocked/);
  const own=(await request('/api/cloud-backup')).data;assert.equal(own.connections[0].connected,true);assert.ok(!JSON.stringify(own).includes('refresh-secret'));assert.ok(!JSON.stringify(own).includes('credentials'));
  assert.equal((await request('/api/cloud-backup',{user:2})).data.connections[0].connected,false);
  await request('/api/cloud-backup/google',{method:'PUT',body:{days:30}});assert.equal(engine.account(1,'google').interval_days,30);
  const expired=await begin('onedrive');f.advance(11*60000);assert.equal((await request(`/api/cloud-backup/callback/onedrive?code=ok&state=${expired.state}`,{user:0,cookie:expired.cookie})).status,400);
  const revoked=await begin('onedrive',2);db.prepare('UPDATE users SET token_version=1 WHERE id=2').run();const rejected=await request(`/api/cloud-backup/callback/onedrive?code=ok&state=${revoked.state}`,{user:0,cookie:revoked.cookie});assert.equal(rejected.status,303);assert.match(rejected.headers.get('location'),/cloudBackupError=/);assert.equal(engine.account(2,'onedrive'),undefined);
});

test('personal ZIP restores attachments and archive state; unchanged runs skip and retain only three copies',async t=>{
  const f=await fixture(t);await f.connect();
  const first=await f.engine.run(1,'google');assert.equal(first.count,1);
  const file=f.files()[0];const payload=JSON.parse(new TextDecoder().decode(unzipSync(file.bytes)['backup.json']));
  assert.equal(payload.notes[0].title,'Shopping');assert.equal(payload.notes[0].archived,true);assert.equal(payload.notes[0].images.length,1);assert.equal(payload.notes[0].items[1].parentId,'parent');assert.ok(!JSON.stringify(payload).includes('Other account'));assert.equal(payload.notes[0].user_id,undefined);
  assert.deepEqual(await readBackup(new File([file.bytes],'cloud.zip')),payload.notes);
  const lastSuccess=f.engine.account(1,'google').last_success;f.advance(1000);
  assert.equal((await f.engine.run(1,'google')).skipped,true);assert.equal(f.files().length,1);assert.equal(f.engine.account(1,'google').last_success,lastSuccess);
  for(let i=0;i<5;i++){f.advance(1000);f.db.prepare('UPDATE notes SET title=? WHERE id=?').run(`Version ${i}`,'mine');await f.engine.run(1,'google');}
  assert.equal(f.files().length,3);assert.equal(JSON.parse(new TextDecoder().decode(unzipSync(f.files().at(-1).bytes)['backup.json'])).notes[0].title,'Version 4');
  f.files().splice(0);assert.equal((await f.engine.run(1,'google')).skipped,false);assert.equal(f.files().length,1);
  await f.connect('onedrive',2,1);await f.engine.run(2,'onedrive');assert.notEqual(f.engine.scopeFor(1),f.engine.scopeFor(2));
  assert.equal(JSON.parse(new TextDecoder().decode(unzipSync(f.files('onedrive',2)[0].bytes)['backup.json'])).notes[0].title,'Other account');
  await f.request('/api/cloud-backup/google',{method:'DELETE'});assert.equal(f.engine.account(1,'google'),undefined);assert.equal(f.files().length,1);
});

test('upload/retention failures preserve backups, refresh credentials, retry and resume schedules after restart',async t=>{
  const f=await fixture(t);await f.connect();
  for(let i=0;i<3;i++){f.db.prepare('UPDATE notes SET title=? WHERE id=?').run(`Before ${i}`,'mine');f.advance(1000);await f.engine.run(1,'google');}
  f.db.prepare('UPDATE notes SET title=? WHERE id=?').run('After','mine');const oldHash=f.engine.account(1,'google').last_hash;
  f.flags.failUpload=true;await assert.rejects(()=>f.engine.run(1,'google'),/Upload unavailable/);assert.equal(f.files().length,3);assert.equal(f.engine.account(1,'google').last_hash,oldHash);assert.equal(f.engine.account(1,'google').next_run,f.now()+15*60000);
  f.flags.failUpload=false;f.flags.failPrune=true;f.advance(1000);await assert.rejects(()=>f.engine.run(1,'google'),/Retention unavailable/);assert.equal(f.files().length,4);assert.equal(f.engine.account(1,'google').last_success,f.now());
  f.flags.failPrune=false;await f.engine.run(1,'google');assert.equal(f.files().length,3);assert.equal(f.engine.account(1,'google').last_error,null);
  f.db.prepare('UPDATE cloud_backup_accounts SET credentials=?,next_run=?').run(f.engine.secure.seal({access_token:'old',refresh_token:'refresh-secret',expires_at:0}),f.now());
  const restarted=installCloudBackup(express(),{db:f.db,dbFile:'unused',auth:f.auth,providers:f.providers,key:f.key,now:f.now,scheduler:false});
  await restarted.tick();for(let i=0;i<100 && f.engine.account(1,'google').lease_until;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(f.engine.secure.open(f.engine.account(1,'google').credentials).refresh_token,'rotated-refresh');assert.equal(f.engine.account(1,'google').next_run,f.now()+7*86400000);restarted.stop();
});

test('leases prevent duplicate jobs and disconnect cannot resurrect saved credentials',async t=>{
  const f=await fixture(t);await f.connect();let release;f.flags.wait=new Promise(resolve=>release=resolve);
  const job=f.engine.run(1,'google');await assert.rejects(()=>f.engine.run(1,'google'),{status:409});
  await new Promise(resolve=>setTimeout(resolve,20));await f.request('/api/cloud-backup/google',{method:'DELETE'});release();await assert.rejects(()=>job,/connection changed/);assert.equal(f.engine.account(1,'google'),undefined);
});

test('backup importer accepts legacy JSON and rejects unrelated, oversized and ambiguous ZIPs',async()=>{
  const notes=[{title:'Legacy'}];assert.deepEqual(await readBackup(new File([JSON.stringify(notes)],'notes.json')),notes);
  for(const files of [{'../backup.json':strToU8('{"notes":[]}')},{'backup.json':strToU8('{"notes":[]}'),'extra.json':strToU8('{}')},{'notes.json':strToU8('{}')}])await assert.rejects(()=>readBackup(new File([zipSync(files)],'bad.zip')),/backup ZIP/);
  await assert.rejects(()=>readBackup({name:'huge.zip',size:201*1024*1024}),/200 MB/);
});

test('provider OAuth uses narrow scopes, PKCE, offline access and fixed callback origins',async()=>{
  const env={CLOUD_BACKUP_PUBLIC_URL:'https://keep.example.com',GOOGLE_DRIVE_CLIENT_ID:'google-id',GOOGLE_DRIVE_CLIENT_SECRET:'secret',ONEDRIVE_CLIENT_ID:'ms-id',ONEDRIVE_CLIENT_SECRET:'secret'};
  const p=createProviders({env});
  for(const provider of ['google','onedrive']){assert.equal(p.configured(provider),true);const url=new URL(p.authorization(provider,'state','verifier'));assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.get('redirect_uri'),`https://keep.example.com/api/cloud-backup/callback/${provider}`);assert.ok(!url.toString().includes('client_secret'));}
  const google=new URL(p.authorization('google','state','verifier'));assert.equal(google.searchParams.get('scope'),'https://www.googleapis.com/auth/drive.file');assert.equal(google.searchParams.get('access_type'),'offline');
  const microsoft=new URL(p.authorization('onedrive','state','verifier'));assert.equal(microsoft.searchParams.get('scope'),'offline_access Files.ReadWrite.AppFolder');
  assert.equal(createProviders({env:{...env,CLOUD_BACKUP_PUBLIC_URL:'http://evil.example'}}).configured('google'),false);
});

test('Google Drive uploads use a private folder, resumable transfer, checksum verification and token rotation',async()=>{
  const calls=[],bytes=Buffer.from('zip bytes'),scope='0123456789abcdef',name=`glass-keep-${scope}-snapshot.zip`;
  const json=value=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
  const p=createProviders({env:{CLOUD_BACKUP_PUBLIC_URL:'https://keep.test',GOOGLE_DRIVE_CLIENT_ID:'client',GOOGLE_DRIVE_CLIENT_SECRET:'secret'},fetcher:async(url,options)=>{
    calls.push({url,options});const parsed=new URL(url);
    if(parsed.hostname==='oauth2.googleapis.com'){const form=new URLSearchParams(options.body);assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('refresh_token'),'old-refresh');return json({access_token:'renewed',refresh_token:'rotated',expires_in:3600});}
    assert.equal(options.headers.Authorization,'Bearer access');
    if(parsed.pathname==='/drive/v3/files' && options.method==='POST')return json({id:'folder'});
    if(parsed.pathname==='/drive/v3/files' && !options.method){const q=parsed.searchParams.get('q');return json({files:q.includes('mimeType')?[]:[{id:'saved',name,size:bytes.length},{id:'unrelated',name:'keep-me.zip'}]});}
    if(parsed.pathname==='/upload/drive/v3/files' && options.method==='POST')return new Response(null,{headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test'}});
    if(options.method==='PUT'){assert.deepEqual(options.body,bytes);return json({id:'saved'});}
    if(options.method==='DELETE')return new Response(null,{status:204});
    if(parsed.pathname==='/drive/v3/files/saved')return json({id:'saved',name,size:String(bytes.length),md5Checksum:createHash('md5').update(bytes).digest('hex')});
    throw Error('Unexpected Google request');
  }});
  const remote=p.drive('google','access',scope);assert.equal((await remote.upload(name,bytes)).id,'saved');assert.equal((await remote.list()).length,1);await remote.remove('saved');
  const folder=calls.find(c=>c.url==='https://www.googleapis.com/drive/v3/files' && c.options.method==='POST');assert.equal(JSON.parse(folder.options.body).appProperties.glassKeepScope,scope);
  assert.equal((await p.refresh('google',{refresh_token:'old-refresh'})).refresh_token,'rotated');
});

test('OneDrive app-folder uploads verify hashes and reject pagination URLs that could leak credentials',async()=>{
  const bytes=Buffer.from('zip bytes'),scope='0123456789abcdef',name=`glass-keep-${scope}-snapshot.zip`;let badPage=false,rootCreated=false;
  const p=createProviders({env:{CLOUD_BACKUP_PUBLIC_URL:'https://keep.test',ONEDRIVE_CLIENT_ID:'client',ONEDRIVE_CLIENT_SECRET:'secret'},fetcher:async(url,options)=>{
    assert.equal(new URL(url).hostname,'graph.microsoft.com');assert.equal(options.headers.Authorization,'Bearer access');
    const reply=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    if(url.endsWith('/special/approot')){rootCreated=true;return reply({id:'app-root'});}
    if(url.includes('/special/approot:/')){assert.equal(rootCreated,true);return new Response(null,{status:404});}
    if(url.endsWith('/special/approot/children')){assert.deepEqual(JSON.parse(options.body).folder,{});return reply({id:'folder'});}
    if(options.method==='PUT')return reply({id:'saved',name,size:bytes.length,file:{hashes:{sha1Hash:createHash('sha1').update(bytes).digest('hex').toUpperCase()}}});
    if(options.method==='DELETE')return new Response(null,{status:204});
    return reply({value:[{id:'saved',name,size:bytes.length},{id:'unrelated',name:'other.zip'}],...(badPage?{'@odata.nextLink':'https://evil.example/steal-token'}:{})});
  }});
  const remote=p.drive('onedrive','access',scope);await remote.upload(name,bytes);assert.equal((await remote.list()).length,1);await remote.remove('saved');badPage=true;await assert.rejects(()=>remote.list(),/invalid folder page/);
});
