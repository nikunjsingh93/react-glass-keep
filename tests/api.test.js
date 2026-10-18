import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

async function startServer(t, overrides={}, prepareDatabase) {
  const dir=await mkdtemp(path.join(tmpdir(),'glass-keep-test-'));
  const listener=net.createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening');
  const port=listener.address().port; await new Promise(resolve=>listener.close(resolve));
  const dbFile=path.join(dir,'notes.sqlite');
  if (prepareDatabase) prepareDatabase(dbFile);
  const child=spawn(process.execPath,['server/index.js'],{
    env:{...process.env,NODE_ENV:'production',API_PORT:String(port),DB_FILE:dbFile,JWT_SECRET:'test-only-random-value-for-integration-123456789',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'test-password-long-enough',...overrides},
    stdio:['ignore','pipe','pipe'],
  });
  let logs=''; child.stdout.on('data',b=>logs+=b); child.stderr.on('data',b=>logs+=b);
  t.after(async()=>{ if(child.exitCode===null){child.kill();await once(child,'exit');} await rm(dir,{recursive:true,force:true}); });
  const base=`http://127.0.0.1:${port}/api`;
  for(let i=0;i<100;i++) {
    if(child.exitCode!==null) throw new Error(logs);
    try {if((await fetch(base+'/health')).ok) break;}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
    if(i===99) throw new Error('Server did not become ready: '+logs);
  }
  const api=async(route,{token,method='GET',body,headers={}}={})=>{
    const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,headers:response.headers,data:await response.json()};
  };
  return {api,dbFile,child,base,logs:()=>logs};
}

test('Nginx proxy headers identify separate clients and do not produce validation warnings',async t=>{
  const {api,logs}=await startServer(t,{TRUST_PROXY:'1'});
  for(let i=0;i<31;i++) {
    const result=await api('/login',{method:'POST',headers:{'X-Forwarded-For':'192.0.2.1'},body:{email:'nobody',password:'wrong'}});
    assert.equal(result.status,i<30?401:429);
  }
  assert.equal((await api('/login',{method:'POST',headers:{'X-Forwarded-For':'192.0.2.2'},body:{email:'operator',password:'test-password-long-enough'}})).status,200);
  assert.doesNotMatch(logs(),/ERR_ERL|ValidationError/);
});

test('duplicate import, share restoration, private links, public revocation and mutation replay',async t=>{
  const {api,dbFile}=await startServer(t);
  const login=await api('/login',{method:'POST',body:{email:'operator',password:'test-password-long-enough'}}),token=login.data.token;
  await api('/admin/users',{method:'POST',token,body:{name:'Partner',email:'partner@example.com',password:'partner-test-password-123'}});
  const partner=(await api('/login',{method:'POST',body:{email:'partner@example.com',password:'partner-test-password-123'}})).data.token;
  const headers={'X-Operation-Id':'idempotent-create-123456789'};
  const create=await api('/notes',{method:'POST',token,headers,body:{title:'Replay',content:'Only once'}});
  const replay=await api('/notes',{method:'POST',token,headers,body:{title:'Replay',content:'Only once'}});
  assert.equal(replay.status,201);assert.equal(replay.data.id,create.data.id);assert.equal((await api('/notes',{token})).data.length,1);
  const patchHeaders={'X-Operation-Id':'idempotent-patch-123456789'};
  const patch={revision:1,content:'Updated'};
  assert.equal((await api(`/notes/${create.data.id}`,{method:'PATCH',token,headers:patchHeaders,body:patch})).data.revision,2);
  assert.equal((await api(`/notes/${create.data.id}`,{method:'PATCH',token,headers:patchHeaders,body:patch})).data.revision,2);
  const backup={notes:[{title:'Imported',content:'with sharing',archived:true,collaborators:[{email:'partner@example.com'},{email:'missing@example.com'}]}],restoreSharing:true};
  const imported=await api('/notes/import',{method:'POST',token,body:backup});assert.equal(imported.data.imported,1);assert.deepEqual(imported.data.sharingWarnings,['missing@example.com']);
  assert.equal((await api('/notes/import',{method:'POST',token,body:backup})).data.skipped,1);
  await api('/notes/import',{method:'POST',token,body:{...backup,deduplicate:false}});
  assert.equal((await api('/notes/duplicates',{token})).data[0].length,2);
  const archived=(await api('/notes/archived',{token})).data[0];
  assert.equal((await api(`/notes/${archived.id}`,{token:partner})).status,200);
  assert.equal((await api(`/notes/${archived.id}`)).status,401);
  assert.equal((await api(`/notes/${archived.id}/share-link`,{method:'POST',token:partner,body:{days:7}})).status,404);
  const link=(await api(`/notes/${archived.id}/share-link`,{method:'POST',token,body:{days:7}})).data;
  const shared=await api(`/public-notes/${link.token}`);assert.equal(shared.status,200);assert.equal(shared.data.title,'Imported');assert.equal(shared.data.user_id,undefined);assert.equal(shared.headers.get('cache-control'),'no-store');
  const replacement=(await api(`/notes/${archived.id}/share-link`,{method:'POST',token,body:{days:1}})).data;
  assert.equal((await api(`/public-notes/${link.token}`)).status,404);
  const db=new Database(dbFile);db.prepare('UPDATE note_share_links SET expires_at=?').run('2000-01-01T00:00:00.000Z');db.close();
  assert.equal((await api(`/public-notes/${replacement.token}`)).status,404);
  const final=(await api(`/notes/${archived.id}/share-link`,{method:'POST',token})).data;
  await api(`/notes/${archived.id}/share-link`,{method:'DELETE',token});assert.equal((await api(`/public-notes/${final.token}`)).status,404);
  for(const days of [1,7,30,90,365]) {
    const timed=await api(`/notes/${archived.id}/share-link`,{method:'POST',token,body:{days}});
    assert.equal(timed.status,200);assert.ok(Math.abs(Date.parse(timed.data.expiresAt)-Date.now()-days*86400000)<5000);
  }
  for(const days of [0,-1,366,'never'])assert.equal((await api(`/notes/${archived.id}/share-link`,{method:'POST',token,body:{days}})).status,400);
  const permanent=await api(`/notes/${archived.id}/share-link`,{method:'POST',token,body:{days:null}});
  assert.equal(permanent.data.expiresAt,null);assert.equal((await api(`/public-notes/${permanent.data.token}`)).status,200);
  assert.equal((await api(`/notes/${archived.id}/share-link`,{method:'POST',token:partner,body:{days:null}})).status,404);
  await api(`/notes/${archived.id}/share-link`,{method:'DELETE',token});assert.equal((await api(`/public-notes/${permanent.data.token}`)).status,404);
  assert.equal((await api(`/notes/${create.data.id}`,{method:'DELETE',token,body:{revision:1}})).status,409);
});

test('ownership, collaboration revisions, backups, sessions and recovery work end to end', async t=>{
  const {api,dbFile}=await startServer(t);
  const login=await api('/login',{method:'POST',body:{email:'operator',password:'test-password-long-enough'}});
  assert.equal(login.status,200); const admin=login.data.token;
  const createUser=async email=>{
    const result=await api('/admin/users',{method:'POST',token:admin,body:{name:email,email,password:'collaborator-password-123'}});
    assert.equal(result.status,201);
    const auth=await api('/login',{method:'POST',body:{email,password:'collaborator-password-123'}});
    return {token:auth.data.token,user:result.data};
  };
  const editor=await createUser('editor'); const outsider=await createUser('outsider');
  const create=await api('/notes',{method:'POST',token:admin,body:{type:'text',title:'Private note',content:'original',tags:['tag'],images:[{id:'image',name:'example.png',src:'data:image/png;base64,dGVzdA=='}]}});
  assert.equal(create.status,201); const note=create.data;
  assert.equal(note.user_id,login.data.user.id); assert.equal(note.revision,1); assert.equal(note.archived,false);
  assert.equal(create.headers.get('cache-control'),'no-store');
  assert.equal((await api(`/notes/${note.id}/collaborate`,{method:'POST',token:admin,body:{username:'editor'}})).status,200);
  const changed=await api(`/notes/${note.id}`,{method:'PATCH',token:editor.token,body:{revision:1,content:'edited together'}});
  assert.equal(changed.status,200); assert.equal(changed.data.revision,2);
  assert.equal((await api(`/notes/${note.id}`,{method:'PUT',token:admin,body:{revision:1,content:'stale'}})).status,409);
  assert.equal((await api(`/notes/${note.id}`,{method:'PATCH',token:admin,body:{content:'no revision'}})).status,428);
  assert.equal((await api(`/notes/${note.id}`,{method:'PATCH',token:outsider.token,body:{revision:2,content:'attack'}})).status,404);
  const metadata=await api(`/notes/${note.id}`,{method:'PATCH',token:admin,body:{revision:2,color:'blue'}});
  assert.equal(metadata.data.content,'edited together');
  assert.equal((await api(`/notes/${note.id}/archive`,{method:'POST',token:admin,body:{archived:true}})).status,200);
  assert.equal((await api('/notes',{token:admin})).data.length,0);
  const archived=await api('/notes/archived',{token:admin});
  assert.equal(archived.data[0].user_id,note.user_id); assert.equal(archived.data[0].revision,4);
  const backup=await api('/notes/export',{token:admin});
  assert.equal(backup.data.version,2); assert.equal(backup.data.notes.length,1); assert.equal(backup.data.notes[0].archived,true);
  assert.deepEqual(backup.data.notes[0].images,note.images);
  const restored=await api('/notes/import',{method:'POST',token:outsider.token,body:backup.data});
  assert.equal(restored.status,200);
  const restoredNotes=(await api('/notes/archived',{token:outsider.token})).data;
  assert.equal(restoredNotes.length,1); assert.notEqual(restoredNotes[0].id,note.id);
  assert.equal(restoredNotes[0].content,'edited together'); assert.equal(restoredNotes[0].color,'blue');
  assert.equal((await api('/notes',{token:outsider.token})).data.length,0);
  const recovery=await api('/secret-key',{method:'POST',token:editor.token,body:{}});
  assert.equal((await api('/login/secret',{method:'POST',body:{key:recovery.data.key}})).status,200);
  const rotated=await api('/secret-key',{method:'POST',token:editor.token,body:{}});
  assert.notEqual(rotated.data.key,recovery.data.key);
  assert.equal((await api('/login/secret',{method:'POST',body:{key:recovery.data.key}})).status,401);
  // Simulate an existing recovery key from an older installation.
  const db=new Database(dbFile); const oldKey='old-recovery-key-at-least-32-characters';
  db.prepare('UPDATE users SET secret_key_hash=?,secret_key_digest=NULL WHERE id=?').run(bcrypt.hashSync(oldKey,4),editor.user.id); db.close();
  assert.equal((await api('/login/secret',{method:'POST',body:{key:oldKey}})).status,200);
  const check=new Database(dbFile); const migrated=check.prepare('SELECT secret_key_hash,secret_key_digest FROM users WHERE id=?').get(editor.user.id); check.close();
  assert.equal(migrated.secret_key_hash,null); assert.equal(migrated.secret_key_digest.length,64);
  assert.equal((await api(`/admin/users/${editor.user.id}`,{method:'PATCH',token:admin,body:{password:'replacement-password-123'}})).status,200);
  assert.equal((await api('/notes',{token:editor.token})).status,401);
  assert.equal((await api('/admin/users',{method:'POST',token:admin,body:{name:'weak',email:'weak',password:'short'}})).status,400);
  assert.equal((await api(`/notes/${note.id}`,{method:'DELETE',token:outsider.token})).status,404);
});

test('authentication is throttled',async t=>{
  const {api}=await startServer(t);
  let last;
  for(let i=0;i<31;i++) last=await api('/login',{method:'POST',body:{email:'missing',password:'bad'}});
  assert.equal(last.status,429);
});

test('existing databases migrate without replacing accounts or archived notes',async t=>{
  const {api}=await startServer(t,{},file=>{
    const db=new Database(file);
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL,is_admin INTEGER NOT NULL DEFAULT 0,secret_key_hash TEXT,secret_key_created_at TEXT);
      CREATE TABLE notes (id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,items_json TEXT NOT NULL,tags_json TEXT NOT NULL,images_json TEXT NOT NULL,color TEXT NOT NULL,pinned INTEGER NOT NULL DEFAULT 0,position REAL NOT NULL DEFAULT 0,timestamp TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0);`);
    db.prepare('INSERT INTO users(id,name,email,password_hash,created_at,is_admin) VALUES(1,?,?,?,?,1)').run('Existing','existing',bcrypt.hashSync('existing-password-123',4),new Date().toISOString());
    db.prepare("INSERT INTO notes VALUES('old',1,'text','Archived before upgrade','keep this','[]','[]','[]','default',0,1,?,1)").run(new Date().toISOString());
    db.close();
  });
  const login=await api('/login',{method:'POST',body:{email:'existing',password:'existing-password-123'}});
  assert.equal(login.status,200);
  const notes=(await api('/notes/archived',{token:login.data.token})).data;
  assert.equal(notes[0].content,'keep this'); assert.equal(notes[0].revision,1);
  assert.equal((await api('/admin/users',{token:login.data.token})).data.length,1);
});

test('existing short, placeholder and unset secrets remain compatible with legacy sessions',async t=>{
  for(const secret of ['short','dev-please-change','dev-secret-please-change','']) {
    const {api}=await startServer(t,{JWT_SECRET:secret});
    // Tokens issued before session versions existed remain valid on upgrade.
    const token=jwt.sign({uid:1,email:'operator',name:'Admin',is_admin:true},secret || 'dev-secret-please-change',{expiresIn:'1h'});
    assert.equal((await api('/notes',{token})).status,200);
    const login=await api('/login',{method:'POST',body:{email:'operator',password:'test-password-long-enough'}});
    assert.equal(login.status,200);
    assert.equal((await api('/notes',{token:login.data.token})).status,200);
  }
});

test('fresh installs still require operator-supplied administrator credentials',async t=>{
  await assert.rejects(startServer(t,{INITIAL_ADMIN_PASSWORD:''}),/Fresh installation/);
});
