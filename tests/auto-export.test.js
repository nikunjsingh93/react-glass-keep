import test from 'node:test';
import assert from 'node:assert/strict';
import {createAutoExport,readExport,DAY} from '../src/autoExport.js';

function fixture() {
  const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
  let time=100*DAY,count=0,active=true,fail=false;
  const options={storage,key:'user-1@server-a',now:()=>time,active:()=>active,download:async canSave=>{if(fail)throw Error('Disk full');if(!canSave())return false;count++;return true;}};
  return {storage,options,engine:createAutoExport(options),advance:ms=>time+=ms,fail:()=>fail=true,disableSession:()=>active=false,count:()=>count};
}
test('1/7/30 day schedules run once when due, survive restart, and catch up only once',async()=>{
  for(const days of [1,7,30]) {
    const f=fixture();assert.equal(await f.engine.run(),false);f.engine.configure(days);
    assert.equal(await f.engine.run(),true);assert.equal(await f.engine.run(),false);
    f.advance(days*DAY-1);assert.equal(await f.engine.run(),false);f.advance(1);
    const restarted=createAutoExport(f.options);assert.equal(await restarted.run(),true);
    f.advance(365*DAY);assert.equal(await restarted.run(),true);assert.equal(await restarted.run(),false);assert.equal(f.count(),3);
  }
});
test('failed writes do not advance the saved time and retry after fifteen minutes',async()=>{
  const f=fixture();f.engine.configure(1);f.fail();assert.equal(await f.engine.run(),false);
  const state=readExport(f.storage,f.options.key);assert.equal(state.lastRun,0);assert.equal(state.retryAt-state.nextRun,15*60000);assert.equal(state.error,'Disk full');
  assert.equal(await f.engine.run(),false);
});
test('account/server isolation, disabling, cancelled downloads and session changes protect exports',async()=>{
  const f=fixture();f.engine.configure(7);assert.equal(readExport(f.storage,'user-2@server-a').days,0);assert.equal(readExport(f.storage,'user-1@server-b').days,0);
  f.engine.configure(0);assert.equal(await f.engine.run(),false);assert.equal(await f.engine.run(true),true);
  f.disableSession();assert.equal(await f.engine.run(true),false);assert.throws(()=>f.engine.configure(2));
  const g=fixture();g.options.download=async()=>false;const cancelled=createAutoExport(g.options);cancelled.configure(1);assert.equal(await cancelled.run(),false);assert.equal(readExport(g.storage,g.options.key).lastRun,0);
});
test('overlapping checks cannot write two backups, and sign-out prevents the pending write',async()=>{
  const f=fixture();let release,writeAllowed;
  const engine=createAutoExport({...f.options,download:async canSave=>{await new Promise(resolve=>release=resolve);writeAllowed=canSave();return writeAllowed;}});
  engine.configure(1);const first=engine.run();assert.equal(await engine.run(),false);f.disableSession();release();assert.equal(await first,false);assert.equal(writeAllowed,false);assert.equal(readExport(f.storage,f.options.key).lastRun,0);
});
