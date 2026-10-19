import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
const require=createRequire(import.meta.url);
const {installAI}=require('../server/ai.js');
const {installSearch}=require('../server/ai-search.js');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function database(){
  const db=new Database(':memory:');
  db.exec(`CREATE TABLE notes(id TEXT PRIMARY KEY,user_id INTEGER,title TEXT,content TEXT,items_json TEXT DEFAULT '[]',tags_json TEXT DEFAULT '[]',timestamp TEXT DEFAULT '',archived INTEGER DEFAULT 0);
    CREATE TABLE note_collaborators(note_id TEXT,user_id INTEGER);
    INSERT INTO notes(id,user_id,title,content) VALUES('books',1,'Reading list','Sapiens by Yuval Noah Harari. Read next: The Power of Habit by Charles Duhigg.'),('private',2,'Reading secrets','PRIVATE-OWNER-TWO-SECRET');`);
  return db;
}
async function harness(t,runtime){
  const db=database(),app=express();app.use(express.json());
  const service=installAI(app,{db,dbFile:'test.db',runtime,auth:(req,res,next)=>{if(!req.headers.authorization)return res.sendStatus(401);req.user={id:Number(req.headers.authorization)};next();}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}/api/ai`;
  t.after(async()=>{await service.close();await new Promise(resolve=>server.close(resolve));db.close();});
  async function api(route,{method='GET',body,user=1}={}){const response=await fetch(base+route,{method,headers:{Authorization:String(user),'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};}
  return {db,service,api};
}
function runtime(){
  return {calls:[],ensures:0,idles:0,state:'unloaded',status(){return {state:this.state};},async ensure(signal,onState){this.ensures++;signal.throwIfAborted();this.state='ready';onState({state:'loading'});await sleep(10);},
    async complete(messages,{signal,onToken}={}){this.calls.push(messages);signal.throwIfAborted();if(messages[0].content.includes('search keywords'))return 'books reading recommendations';
      for(const text of ['Read Sapiens','Read Sapiens by Yuval Noah Harari [1].']){await sleep(80);signal.throwIfAborted();onToken?.(text);}return 'Read Sapiens by Yuval Noah Harari [1].';},
    idle(){this.idles++;},async stop(){this.state='unloaded';}};
}
async function finish(api,id){for(let i=0;i<100;i++){const result=await api('/requests/'+id);if(['done','error','cancelled'].includes(result.data.status))return result;await sleep(20);}throw Error('AI job did not finish');}

test('AI indexes existing notes, tracks edits/deletion, preserves Unicode, and filters private notes before ranking',()=>{
  const db=database(),search=installSearch(db);
  try{
    assert.deepEqual(search(1,'books').map(n=>n.id),[]); // The title is Reading list; expansion supplies related words.
    assert.deepEqual(search(1,'reading').map(n=>n.id),['books']);
    db.prepare('INSERT INTO note_collaborators VALUES(?,?)').run('private',1);
    assert.deepEqual(search(1,'secrets').map(n=>n.id),['private']);
    db.prepare('DELETE FROM note_collaborators').run();assert.equal(search(1,'secrets').length,0);
    db.prepare('UPDATE notes SET title=?,content=?,archived=1 WHERE id=?').run('Voyage café','मेरी यात्रा फ्रांस','books');
    assert.equal(search(1,'reading').length,0);assert.equal(search(1,'cafe')[0].id,'books');assert.equal(search(1,'यात्रा')[0].id,'books');
    assert.doesNotThrow(()=>search(1,'" OR * NOT ( hello :') );
    db.prepare('DELETE FROM notes WHERE id=?').run('books');assert.equal(search(1,'cafe').length,0);
  }finally{db.close();}
});

test('AI loads only on question, streams snapshots, ignores forged note bodies, isolates users and keeps old JSON clients working',async t=>{
  const ai=runtime(),{api}=await harness(t,ai);
  await api('/initialize',{method:'POST'});await api('/status');assert.equal(ai.ensures,0);
  assert.equal((await api('/ask',{method:'POST',body:{question:'x'}})).status,400);
  assert.equal((await api('/ask',{method:'POST',body:{question:{bad:true}}})).status,400);
  const created=await api('/ask',{method:'POST',body:{question:'Which books should I read?',async:true,notes:[{id:'private',title:'Forged',content:'FORGED-NOTE-TEXT'}]}});
  assert.equal(created.status,202);const id=created.data.id;
  assert.equal((await api('/requests/'+id,{user:2})).status,404);
  assert.equal((await api('/requests/'+id,{user:2,method:'DELETE'})).status,404);
  assert.equal((await api('/ask',{method:'POST',body:{question:'Another question'}})).status,429);
  let partial=false;
  for(let i=0;i<50;i++){const current=(await api('/requests/'+id)).data;if(current.status==='generating'&&current.answer)partial=true;if(current.status==='done')break;await sleep(15);}
  assert.ok(partial,'The response should become visible before generation completes');
  const result=await finish(api,id);assert.equal(result.data.status,'done');assert.equal(result.data.sources[0].id,'books');
  const prompts=JSON.stringify(ai.calls);assert.doesNotMatch(prompts,/PRIVATE-OWNER-TWO-SECRET|FORGED-NOTE-TEXT/);
  const legacy=await api('/ask',{method:'POST',body:{question:'My reading list'}});assert.equal(legacy.status,200);assert.match(legacy.data.answer,/Sapiens/);
  assert.equal(ai.idles,2);
  assert.ok(ai.calls.every(messages=>!messages[0].content.includes('search keywords')),'Matching questions should use one generation pass');
  const fallback=await api('/ask',{method:'POST',body:{question:'Which volumes do you recommend?'}});
  assert.equal(fallback.status,200);assert.equal(fallback.data.sources[0].id,'books');
  assert.ok(ai.calls.some(messages=>messages[0].content.includes('search keywords')),'No-match questions should try query expansion');
});

test('AI cancellation and initialization errors release the worker; deleted or revoked sources cannot be polled',async t=>{
  const ai=runtime(),{api,db}=await harness(t,ai);
  const first=await api('/ask',{method:'POST',body:{question:'reading list',async:true}});
  await api('/requests/'+first.data.id,{method:'DELETE'});await sleep(80);
  assert.equal((await api('/requests/'+first.data.id)).status,404);assert.equal((await api('/status')).data.busy,false);
  const second=await api('/ask',{method:'POST',body:{question:'reading list',async:true}});await finish(api,second.data.id);
  db.prepare('DELETE FROM notes WHERE id=?').run('books');assert.equal((await api('/requests/'+second.data.id)).status,404);
  ai.ensure=async()=>{throw Error('Test missing binary');};
  const third=await api('/ask',{method:'POST',body:{question:'reading list',async:true}});const failed=await finish(api,third.data.id);
  assert.equal(failed.data.status,'error');assert.match(failed.data.error,/missing binary/);assert.equal((await api('/status')).data.busy,false);
});
