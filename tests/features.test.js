import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {createOfflineClient,accountState} from '../src/offline.js';
import {treeOrder,toggleBranch,moveBranch,indentBranch,removeBranch} from '../src/checklist.js';
import {parseKeepEntries,readKeepFiles} from '../src/keepImport.js';
import {zipSync,strToU8} from 'fflate';

test('nested checklist branches move, indent and toggle as a unit',()=>{
  const items=[{id:'a',text:'Food'},{id:'b',text:'Milk',parentId:'a'},{id:'c',text:'Tools'},{id:'d',text:'Hammer',parentId:'c'}];
  assert.deepEqual(toggleBranch(items,'a',true).map(i=>!!i.done),[true,true,false,false]);
  assert.deepEqual(moveBranch(items,'a',1).map(i=>i.id),['c','d','a','b']);
  assert.deepEqual(treeOrder(indentBranch(items,'c',true)).map(i=>i.id),['a','b','c','d']);
  assert.equal(indentBranch(items,'b',false)[1].parentId,null);
  assert.deepEqual(removeBranch(items,'a').map(i=>i.id),['c','d']);
});

test('Keep ZIP imports images, nested items, archive and sharing without importing other owners by default',async()=>{
  const entries={'Takeout/Keep/note.json':strToU8(JSON.stringify({title:'Shopping',isArchived:true,listContent:[{id:'a',text:'Food'},{id:'b',text:'Milk',superListItemId:'a'}],attachments:[{filePath:'image.png'}],sharees:[{email:'partner@example.com',type:'USER'}]})), 'Takeout/Keep/image.png':new Uint8Array([137,80,78,71]),'Takeout/Keep/shared.json':strToU8(JSON.stringify({title:'Shared',sharees:[{email:'other@example.com',isOwner:true}]}))};
  const bytes=zipSync(entries);
  const files=await readKeepFiles([{name:'takeout.zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer}]);
  const result=parseKeepEntries(files);
  assert.equal(result.notes.length,1);assert.equal(result.skipped,1);assert.equal(result.notes[0].items[1].parentId,'a');assert.equal(result.notes[0].archived,true);assert.match(result.notes[0].images[0].src,/^data:image\/png;base64,/);assert.deepEqual(result.notes[0].collaborators,[{email:'partner@example.com'}]);assert.deepEqual(result.warnings,[]);
  assert.equal(parseKeepEntries(files,{onlyOwned:false}).notes.length,2);
  const bad=zipSync({'../note.json':strToU8('{}')});await assert.rejects(()=>readKeepFiles([{name:'bad.zip',size:bad.length,arrayBuffer:async()=>bad.buffer}]),/invalid paths/);
});

test('offline outbox survives client recreation, advances revisions, isolates accounts and exposes conflicts',async()=>{
  let online=true,auth={user:{id:'offline-test-user'},token:'token'};
  let server={id:'n',revision:1,title:'Original',content:'old',archived:false,items:[],tags:[],images:[]};
  const operations=new Map();let writeCount=0,loseResponse=false;
  const request=async(path,opts={})=>{
    if(!online)throw Object.assign(new Error('Network unavailable'),{isNetworkError:true});
    if(!opts.method || opts.method==='GET')return structuredClone(path==='/notes'?[server]:server);
    if(operations.has(opts.operationId))return operations.get(opts.operationId);
    if(opts.body.revision!==server.revision)throw Object.assign(new Error('Conflict'),{status:409,note:structuredClone(server)});
    server={...server,...opts.body,revision:server.revision+1};writeCount++;operations.set(opts.operationId,structuredClone(server));
    if(loseResponse){loseResponse=false;throw Object.assign(new Error('Response lost'),{isNetworkError:true});}return structuredClone(server);
  };
  const make=()=>createOfflineClient({request,session:()=>auth,isOnline:()=>online});let client=make();
  await client.api('/notes',{token:'token'});online=false;
  const first=await client.api('/notes/n',{method:'PATCH',token:'token',body:{revision:1,content:'offline one'}});
  await client.api('/notes/n',{method:'PATCH',token:'token',body:{revision:first.revision,title:'Offline two'}});
  client=make();assert.equal((await client.api('/notes',{token:'token'}))[0].content,'offline one');
  auth={user:{id:'another-account'},token:'other'};assert.deepEqual(await client.api('/notes',{token:'other'}),[]);
  auth={user:{id:'offline-test-user'},token:'token'};online=true;await client.flush();assert.equal(server.revision,3);assert.equal(server.title,'Offline two');assert.equal((await client.state()).ops.length,0);
  loseResponse=true;await client.api('/notes/n',{method:'PATCH',token:'token',body:{revision:3,content:'Acknowledgment lost'}});await client.flush();assert.equal(writeCount,3);assert.equal((await client.state()).notes[0].revision,4);
  online=false;await client.api('/notes/n',{method:'PATCH',token:'token',body:{revision:4,content:'Local draft'}});server={...server,content:'Remote draft',revision:5};online=true;await client.flush();
  const state=await client.state();assert.equal(state.conflicts.n.localNote.content,'Local draft');assert.equal(server.content,'Remote draft');
  await client.resolveConflict('n','local');assert.equal(server.content,'Local draft');assert.equal(server.revision,6);assert.equal((await accountState(auth.user.id)).ops.length,0);
});
