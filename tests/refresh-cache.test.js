import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {accountState,createOfflineClient} from '../src/offline.js';
import {uuid} from '../src/uuid.js';
import {parseKeepEntries} from '../src/keepImport.js';

test('LAN HTTP UUID fallback supports valid Keep notes and distinguishes syntax from preparation failures',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'crypto'),secure=globalThis.crypto;
  Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:secure.getRandomValues.bind(secure)}});
  try{
    const values=Array.from({length:1000},()=>uuid());assert.equal(new Set(values).size,1000);assert.ok(values.every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
    const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
    const result=parseKeepEntries(new Map([
      ['Takeout/Keep/Useful linux programs.json',bytes({title:'Useful linux programs ',textContent:'Synthetic fixture'})],
      ['Takeout/Keep/yunohost 2025 apps.json',bytes({title:'yunohost 2025 apps',listContent:[{text:'Synthetic item'}]})],
      ['broken.json',new TextEncoder().encode('{invalid')],
      ['shape.json',bytes({title:'Bad shape',listContent:'invalid'})],
    ]));
    assert.equal(result.notes.length,2);assert.equal(result.notes[0].title,'Useful linux programs ');
    assert.equal(result.warnings[0].message,'Invalid JSON: {file}');assert.equal(result.warnings[1].message,'Could not prepare note: {file}. {reason}');
  }finally{Object.defineProperty(globalThis,'crypto',original);}
});

test('cache quota failures return fresh notes with pending drafts while durable offline data stays intact',async()=>{
  const auth={token:'cache-quota-test',user:{id:'cache-quota-user'}};
  await accountState(auth.user.id,s=>{s.notes=[{id:'draft',title:'Local draft',archived:false,pending:true}];s.ops=[{id:'pending-edit',noteId:'draft'}];});
  const client=createOfflineClient({session:()=>auth,isOnline:()=>true,request:async()=>[{id:'draft',title:'Old server value',archived:false},{id:'new',title:'New server note',archived:false}]});
  const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=()=>{throw new DOMException('Test quota full','QuotaExceededError');};
  try{
    const notes=await client.api('/notes',{token:auth.token});assert.equal(notes.length,2);assert.equal(notes.find(n=>n.id==='draft').title,'Local draft');assert.ok(notes.find(n=>n.id==='new'));
  }finally{IDBObjectStore.prototype.put=put;}
  const saved=await client.state();assert.equal(saved.ops.length,1);assert.equal(saved.notes[0].title,'Local draft');
});

test('out-of-order reads and previous-account replies cannot overwrite the current cache',async()=>{
  let auth={token:'read-order-token',user:{id:'read-order-user'}};const release=[];
  const client=createOfflineClient({session:()=>auth,isOnline:()=>true,request:()=>new Promise(resolve=>release.push(resolve))});
  const first=client.api('/notes',{token:auth.token});const rejected=assert.rejects(first,{name:'AbortError'});
  const second=client.api('/notes',{token:auth.token});release[1]([{id:'latest',title:'Current',archived:false}]);await second;release[0]([]);await rejected;
  assert.equal((await client.state()).notes[0].id,'latest');
  const old=client.api('/notes',{token:auth.token});const oldRejected=assert.rejects(old,{name:'AbortError'});auth={token:'different-token',user:{id:'different-cache-user'}};release[2]([{id:'private-old-user'}]);await oldRejected;assert.equal((await client.state()).notes.length,0);
});
