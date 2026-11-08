import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {zipSync,strToU8} from 'fflate';
import packageInfo from '../package.json' with {type:'json'};
const {version}=packageInfo;

test('LAN HTTP imports, close/refresh races, cache quota and untouched padded titles retain notes and real drafts',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'glass-refresh-')),apiBase='http://127.0.0.1:18099',base='http://glass-keep.test:18099';
  const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:'18099',DB_FILE:path.join(dir,'notes.db'),JWT_SECRET:'refresh-only-fixture',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'refresh-only-password-123'},stdio:'ignore'});
  let browser,releaseOld;t.after(async()=>{releaseOld?.();await browser?.close();if(server.exitCode===null){server.kill();await once(server,'exit');}await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<100;i++){try{if((await fetch(apiBase+'/api/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--host-resolver-rules=MAP glass-keep.test 127.0.0.1','--no-proxy-server']});const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(base);assert.deepEqual(await page.evaluate(()=>({secure:isSecureContext,uuid:typeof crypto.randomUUID,random:typeof crypto.getRandomValues})),{secure:false,uuid:'undefined',random:'function'});
  await page.getByPlaceholder('Username',{exact:true}).fill('operator');await page.getByPlaceholder('Password',{exact:true}).fill('refresh-only-password-123');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByText('No notes yet. Add one to get started!',{exact:true})).toBeVisible();
  const auth=await page.evaluate(()=>JSON.parse(localStorage.getItem('glass-keep-auth')));
  const api=async(route,method='GET',body)=>{const response=await fetch(apiBase+'/api'+route,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.token},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(response.ok);return response.json();};
  const versionLink=page.getByRole('link',{name:`App version: ${version}. Open update instructions.`,exact:true});await expect(versionLink).toHaveText('v'+version);await expect(versionLink).toHaveAttribute('href',/github\.com.*docs\/updating\.md/);
  await page.setViewportSize({width:320,height:844});await expect(versionLink).toBeVisible();const bounds=await versionLink.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320);await page.setViewportSize({width:1280,height:900});
  let hold=true,held=false,mode='normal',requests=0;
  await page.route('**/api/notes',async route=>{
    if(route.request().method()!=='GET')return route.continue();requests++;
    if(hold){hold=false;const response=await api('/notes');held=true;await new Promise(resolve=>releaseOld=resolve);await route.fulfill({status:200,json:response}).catch(()=>{});return;}
    if(mode==='error')return route.fulfill({status:503,json:{error:'Temporary fixture outage'}});
    if(mode==='network')return route.abort('failed');
    if(mode==='invalid')return route.fulfill({status:200,json:{unexpected:'not an array'}});
    await route.continue();
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>held).toBe(true);
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Import Google Keep (ZIP / folder / JSON)',exact:false}).click();
  const zipped=zipSync({'Takeout/Keep/Useful linux programs.json':strToU8(JSON.stringify({title:'  Useful linux programs  ',textContent:'Synthetic padded title'})),'Takeout/Keep/yunohost 2025 apps.json':strToU8(JSON.stringify({title:'yunohost 2025 apps ',textContent:'Another fixture'}))});
  const dialog=page.getByRole('dialog',{name:'Import Google Keep',exact:true});await dialog.getByLabel('Takeout ZIP',{exact:true}).setInputFiles({name:'takeout.zip',mimeType:'application/zip',buffer:Buffer.from(zipped)});await expect(dialog).toContainText('Notes ready: 2');await dialog.getByRole('button',{name:'Import',exact:true}).click();await expect(dialog).toContainText('Imported: 2');
  await dialog.getByRole('button',{name:'Close',exact:true}).click();releaseOld();releaseOld=null;await expect(page.locator('.note-card')).toHaveCount(2);await expect(page.getByText('No notes yet. Add one to get started!',{exact:true})).toHaveCount(0);
  let writes=0;page.on('request',request=>{if(request.method()==='PATCH')writes++;});
  await page.locator('.note-card').filter({hasText:'Useful linux programs'}).click();await page.waitForTimeout(900);await page.getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('.modal-scrim')).toHaveCount(0);assert.equal(writes,0,'Opening an untouched padded title must not save or conflict');
  await page.evaluate(()=>{window.originalCachePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Fixture storage quota','QuotaExceededError');};});
  await api('/notes','POST',{title:'Fresh despite quota',content:'Must stay visible'});await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.locator('.note-card')).toHaveCount(3);await expect(page.getByText('Offline cache is unavailable. Keep the app connected to access your notes.',{exact:true})).toBeVisible();
  mode='network';const priorRequests=requests;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>requests).toBeGreaterThan(priorRequests);await expect(page.locator('.note-card')).toHaveCount(3);
  mode='error';await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.getByRole('alert')).toContainText('Could not refresh notes.');await expect(page.locator('.note-card')).toHaveCount(3);
  mode='invalid';await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('alert')).toContainText('invalid notes response');await expect(page.locator('.note-card')).toHaveCount(3);
  mode='normal';await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalCachePut;});await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.note-card')).toHaveCount(3);
  await page.locator('.note-card').filter({hasText:'yunohost 2025 apps'}).click();await page.getByRole('button',{name:'Edit mode',exact:true}).click();
  await page.route('**/api/notes/*',async route=>{if(route.request().method()==='PATCH')return route.fulfill({status:409,json:{error:'Synthetic revision conflict'}});await route.continue();});
  await page.locator('.modal-scrim textarea').fill('Real local draft');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.modal-scrim')).toBeVisible();await expect(page.locator('.modal-scrim textarea')).toHaveValue('Real local draft');await page.locator('.modal-scrim').getByRole('button',{name:'Close',exact:true}).click();await expect(page.locator('.modal-scrim')).toBeVisible();assert.equal((await api('/notes')).find(n=>n.title==='yunohost 2025 apps ').content,'Another fixture');
  assert.ok(requests>=5);
});
