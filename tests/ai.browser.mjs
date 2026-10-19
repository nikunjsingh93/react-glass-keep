import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

test('web and native clients display partial AI answers, source links, cancellation and clear errors',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'glass-ai-browser-')),children=[],base='http://127.0.0.1:18101';
  children.push(spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:'18101',DB_FILE:path.join(dir,'notes.db'),JWT_SECRET:'ai-browser-fixture',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'ai-browser-password-123'},stdio:'ignore'}));
  children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.native.config.js','--port','1423','--host','127.0.0.1'],{stdio:'ignore'}));
  t.after(async()=>{for(const child of children)if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
  for(const url of [base+'/api/health','http://127.0.0.1:1423/native.html'])for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('AI test fixture unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
  const session=await(await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'operator',password:'ai-browser-password-123'})})).json();
  const note=await(await fetch(base+'/api/notes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.token}`},body:JSON.stringify({title:'Reading list',content:'Read Sapiens by Yuval Noah Harari.'})})).json();
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  for(const native of [false,true]){
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    let polls=0,deleted=0,sent=0,mode='normal';
    function fakeAI(route,method){
      if(route==='/api/ai/ask'){sent++;polls=0;return {status:202,data:{id:'fixture-job',status:'loading',answer:'',sources:[]}};}
      if(method==='DELETE'){deleted++;return {status:200,data:{ok:true}};}
      polls++;
      if(mode==='error')return {status:200,data:{id:'fixture-job',status:'error',error:'The AI is answering another question. Please try again shortly.'}};
      return {status:200,data:{id:'fixture-job',status:mode==='wait'?'loading':polls<4?'generating':'done',answer:mode==='wait'?'':polls<4?'Read Sapiens':'Read **Sapiens** by Yuval Noah Harari [1].',sources:mode==='wait'?[]:[{id:note.id,title:'Reading list',excerpt:note.content}]}};
    }
    if(native){
      await page.exposeFunction('nativeRequest',async args=>{
        if(args.path.startsWith('/api/ai/')){const result=fakeAI(args.path,args.method);return {status:result.status,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify(result.data)).toString('base64')};}
        const response=await fetch(args.server+args.path,{method:args.method,headers:args.headers,body:args.body||undefined});return {status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer()).toString('base64')};
      });
      await page.addInitScript(()=>{let id=0;window.__TAURI_INTERNALS__={transformCallback:()=>++id,unregisterCallback:()=>{},invoke:(command,args)=>command==='api_request'?window.nativeRequest(args):Promise.resolve()};});
    }else await page.route('**/api/ai/**',route=>{const result=fakeAI(new URL(route.request().url()).pathname,route.request().method());return route.fulfill({status:result.status,json:result.data});});
    await page.addInitScript(({base,session,native})=>{Object.defineProperty(AbortSignal,'any',{value:undefined});Object.defineProperty(AbortSignal,'timeout',{value:undefined});localStorage.setItem('glass-keep-native-server',base);localStorage.setItem('glass-keep-auth'+(native?'@'+encodeURIComponent(base):''),JSON.stringify(session));localStorage.setItem('localAiEnabled','true');},{base,session,native});
    await page.goto(native?'http://127.0.0.1:1423/native.html':base);
    const search=page.getByPlaceholder('Search or Ask AI...', {exact:true});await expect(search).toBeVisible();
    const ask=page.getByRole('button',{name:'Ask AI',exact:true});await expect(ask).toBeVisible();await expect(ask).toBeDisabled();
    await search.fill('ab');await expect(ask).toBeDisabled();
    await search.fill('Which books should I read?');await expect(ask).toBeEnabled();await ask.click();
    await expect(page.getByRole('button',{name:'Asking AI…',exact:true})).toBeDisabled();
    await expect(page.getByRole('button',{name:'Asking AI…',exact:true})).toHaveAttribute('aria-busy','true');
    await search.press('Enter');
    await expect(page.getByText('Writing answer…',{exact:true})).toBeVisible();
    await expect(page.getByText('Read Sapiens',{exact:true})).toBeVisible();
    const source=page.getByRole('link',{name:'[1] Reading list',exact:true});await expect(source).toBeVisible();
    await expect(page.locator('.note-content').filter({hasText:'Yuval Noah Harari [1].'})).toBeVisible();
    assert.equal(sent,1,'Pressing Enter while busy must not submit another question');
    await source.click();await expect(page.getByRole('button',{name:'Edit mode',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Close',exact:true}).click();
    await page.getByTitle('Clear response',{exact:true}).click();await expect(source).not.toBeVisible();
    mode='wait';await search.fill('Cancel this question');await search.press('Enter');await expect(page.getByText('Loading AI model…',{exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    const busy=page.getByRole('button',{name:'Asking AI…',exact:true});await expect(busy).toBeVisible();
    const bounds=await busy.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,'The labeled button must fit on a phone');
    for(const width of [320,768]){await page.setViewportSize({width,height:844});const box=await busy.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,'The button must fit narrow and tablet screens');}
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:`artifacts/ai-ask-${native?'native':'web'}-phone.png`});
    const before=deleted;await page.getByTitle('Clear response',{exact:true}).click();await expect(page.getByText('Loading AI model…',{exact:true})).not.toBeVisible();await expect.poll(()=>deleted).toBeGreaterThan(before);
    mode='error';await search.fill('Try again');await search.press('Enter');await expect(page.getByText('The AI is answering another question. Please try again shortly.',{exact:true})).toBeVisible();
    assert.deepEqual(errors,[]);await context.close();
  }
});
