import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const Database=require('better-sqlite3'), express=require('express');
const {installAccountPreferences}=require('../server/accountPreferences');

test('AI preference defaults off/unset, persists across sessions, isolates accounts and cannot be reset by legacy initialization',async t=>{
  const db=new Database(':memory:');
  db.pragma('foreign_keys=ON');
  db.exec('CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2)');
  const app=express();app.use(express.json());
  installAccountPreferences(app,db,(req,res,next)=>{
    const id=Number(req.headers.authorization);
    if(![1,2].includes(id))return res.sendStatus(401);
    req.user={id};next();
  });
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
  const base='http://127.0.0.1:'+server.address().port+'/api/account/preferences';
  const request=async(user,body)=>{
    const response=await fetch(base,{method:body?'PATCH':'GET',headers:{Authorization:String(user),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    return {status:response.status,data:response.status===401?null:await response.json()};
  };
  assert.equal((await request(0)).status,401);
  assert.deepEqual((await request(1)).data,{aiEnabled:null});
  assert.equal((await request(1,{aiEnabled:'true'})).status,400);
  assert.equal((await request(1,{aiEnabled:true,initializeOnly:'false'})).status,400);
  await request(1,{aiEnabled:true,initializeOnly:true});
  assert.deepEqual((await request(1)).data,{aiEnabled:true});
  await request(1,{aiEnabled:false,initializeOnly:true});
  assert.equal((await request(1)).data.aiEnabled,true);
  assert.equal((await request(2)).data.aiEnabled,null);
  await request(2,{aiEnabled:false,initializeOnly:true});
  await request(1,{aiEnabled:false,userId:2});
  await request(1,{aiEnabled:true,initializeOnly:true});
  assert.equal((await request(1)).data.aiEnabled,false);
  assert.equal((await request(2)).data.aiEnabled,false);
  await request(1,{aiEnabled:true});
  assert.equal((await request(1)).data.aiEnabled,true);
  assert.equal((await request(2)).data.aiEnabled,false);
  db.prepare('DELETE FROM users WHERE id=1').run();
  assert.equal(db.prepare('SELECT count(*) AS n FROM account_preferences WHERE user_id=1').get().n,0);
});
