import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createImportTransport,retryImportRequest} from '../src/importTransport.js';
import {importNoteBatches} from '../src/importBackup.js';
import {createOfflineClient,accountState} from '../src/offline.js';

test('transient import errors retry, while cancellation and permanent errors stop immediately',async()=>{
  let calls=0;const delays=[];
  assert.equal(await retryImportRequest(async()=>{if(calls++<2)throw Object.assign(Error('Interrupted'),{status:503});return 'ok';},{wait:async ms=>delays.push(ms)}),'ok');assert.deepEqual(delays,[1000,2000]);
  calls=0;await assert.rejects(()=>retryImportRequest(async()=>{calls++;throw Object.assign(Error('Sign in'),{status:401});}),/Sign in/);assert.equal(calls,1);
  const controller=new AbortController();await assert.rejects(()=>retryImportRequest(async()=>{controller.abort();throw Object.assign(Error('Offline'),{isNetworkError:true});},{signal:controller.signal}),{name:'AbortError'});
});

test('chunk uploads preserve UTF-8 bytes and reuse operation/upload identifiers when resuming',async()=>{
  const requests=[],chunks=new Map(),commits=new Map();let lost=true;
  const api=async(path,options)=>{
    requests.push({path,...options});
    if(path.includes('/chunks/'))chunks.set(Number(path.split('/').pop()),Buffer.from(options.body.data,'base64'));
    if(path.endsWith('/commit')){commits.set(options.operationId,true);if(lost){lost=false;throw Object.assign(Error('Lost reply'),{isNetworkError:true});}return {imported:1,skipped:0};}
    return {ok:true};
  };
  const state={operations:new Map(),uploads:new Map()},note={id:'large-test',title:'Русский हिन्दी été 😃',images:[{src:'data:image/png;base64,'+'A'.repeat(750000)}]};
  const transport=createImportTransport(api,'test',{state,wait:async()=>{}});await transport.sendLarge(note);
  assert.deepEqual(JSON.parse(Buffer.concat([...chunks.values()]).toString()),note);assert.equal(commits.size,1);
  const second=createImportTransport(api,'test',{state,wait:async()=>{}});await second.sendLarge(note);
  assert.equal(new Set(requests.filter(r=>r.path.endsWith('/commit')).map(r=>r.path)).size,1);assert.equal(commits.size,1);
  assert.ok(requests.every(r=>Buffer.byteLength(JSON.stringify(r.body||{}))<512*1024));
});

test('large imports bound tiny-note batches and continue past rejected individual large notes',async()=>{
  const notes=Array.from({length:1300},(_,id)=>({id:String(id),title:'Small '+id,images:[]}));notes.splice(953,0,{id:'large',title:'Large',images:[{src:'x'.repeat(600000)}]});
  const sent=[],failed=[];let count=0;
  await importNoteBatches(notes,async body=>{assert.ok(body.notes.length<=50);sent.push(...body.notes);count++;},512*1024,{sendLarge:async note=>{assert.equal(note.id,'large');throw Object.assign(Error('Bad note'),{status:400});},onError:note=>failed.push(note.id)});
  assert.equal(sent.length,1300);assert.deepEqual(failed,['large']);assert.ok(count>=26);assert.equal(sent.at(-1).id,'1299');
});

test('offline wrapper preserves import retry identifiers and errors without rewriting the full cache',async()=>{
  const auth={token:'import-token',user:{id:'import-wrapper-test'}};let calls=0;
  await accountState(auth.user.id,s=>{s.notes=[{id:'existing',archived:false,images:[]}];});
  const original=Object.getOwnPropertyDescriptor(globalThis,'structuredClone');
  const request=async(path,options)=>{assert.equal(options.operationId,'stable-import-operation-123');if(calls++===0)throw Object.assign(Error('Request timeout'),{isNetworkError:true,status:408});return {imported:1};};
  const client=createOfflineClient({session:()=>auth,request,isOnline:()=>true});
  try{
    Object.defineProperty(globalThis,'structuredClone',{configurable:true,value:()=>{throw Error('Import replies must not write cached notes');}});
    await assert.rejects(()=>client.api('/notes/import',{method:'POST',token:auth.token,body:{notes:[]},operationId:'stable-import-operation-123'}),error=>error.status===408&&error.message==='Request timeout');
    assert.equal((await client.api('/notes/import',{method:'POST',token:auth.token,operationId:'stable-import-operation-123'})).imported,1);
  }finally{Object.defineProperty(globalThis,'structuredClone',original);}
});
