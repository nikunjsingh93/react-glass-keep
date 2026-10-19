// Explicit integration test: downloads the pinned model into ignored artifacts, never real user data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
const image=process.argv[2]||'glass-keep-ai-test:1.0.12';
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true}).trim();
const cache=path.resolve('artifacts/ai-models');mkdirSync(cache,{recursive:true});
let container;
try{
  container=docker('run','-d','-p','127.0.0.1::8080','-v',`${cache}:/app/data/ai-models`,'-v',`${path.resolve('server')}:/app/server:ro`,
    '-e','INITIAL_ADMIN_USERNAME=operator','-e','INITIAL_ADMIN_PASSWORD=ai-docker-test-password','-e','JWT_SECRET=ai-docker-test-only',image);
  const base='http://'+docker('port',container,'8080');
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  const login=await(await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'operator',password:'ai-docker-test-password'})})).json();assert.ok(login.token);
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${login.token}`};
  const api=async(route,{method='GET',body}={})=>{const r=await fetch(base+'/api'+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();assert.ok(r.ok,JSON.stringify(data));return data;};
  assert.equal((await api('/ai/status')).state,'unloaded');
  const note=await api('/notes',{method:'POST',body:{title:'Reading list',content:'Books to read: Sapiens by Yuval Noah Harari. The Power of Habit by Charles Duhigg. My first choice is Sapiens.'}});
  await api('/notes',{method:'POST',body:{title:'Dinner',content:'Tomato soup recipe: tomatoes and basil.'}});
  const memory=()=>JSON.parse(docker('exec',container,'node','-e',`const fs=require('fs');const rows=[];for(const p of fs.readdirSync('/proc').filter(x=>/^\\d+$/.test(x))){try{const command=fs.readFileSync('/proc/'+p+'/cmdline','utf8');if(command.split(String.fromCharCode(0))[0]==='/opt/llama/llama-server')rows.push({pid:Number(p),rssKiB:Number(fs.readFileSync('/proc/'+p+'/status','utf8').match(/VmRSS:\\s+(\\d+)/)?.[1]||0)});}catch{}}console.log(JSON.stringify(rows));`));
  assert.equal(memory().length,0);
  async function ask(label,question,language='en'){
    const start=Date.now(),job=await api('/ai/ask',{method:'POST',body:{question,language,async:true}});let last='',partial=false,answer;
    for(let i=0;i<1600;i++){
      const current=await api('/ai/requests/'+job.id);
      if(current.status!==last){console.log(label+': '+current.status);last=current.status;}
      if(current.status==='generating'&&current.answer)partial=true;
      if(current.status==='error')throw Error(current.error);
      if(current.status==='done'){answer=current;break;}
      await new Promise(r=>setTimeout(r,500));
    }
    assert.ok(answer,'The real model did not finish');assert.ok(answer.sources.some(s=>s.id===note.id));
    console.log(label+': '+Math.round((Date.now()-start)/100)/10+' seconds; partial text observed='+partial+'; worker '+JSON.stringify(memory()));
    console.log('Fixture answer: '+answer.answer);await api('/ai/requests/'+job.id,{method:'DELETE'});return answer.answer;
  }
  assert.match(await ask('First question','Which book should I read first, and who wrote it?'),/Sapiens/i);
  assert.match(await ask('Warm question','Who wrote The Power of Habit?'),/Duhigg/i);
  console.log('Waiting for the default 60-second idle timeout…');
  for(let i=0;i<80;i++){await new Promise(r=>setTimeout(r,1000));if((await api('/ai/status')).state==='unloaded')break;}
  assert.equal((await api('/ai/status')).state,'unloaded');assert.equal(memory().length,0);console.log('Idle worker exited: no llama.cpp process or worker RSS remains.');
  assert.match(await ask('Cached reload','Who wrote Sapiens?'),/Harari/i);
}finally{if(container)docker('rm','-f',container);}
