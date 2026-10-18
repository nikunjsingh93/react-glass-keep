import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

test('compiled Windows application connects and writes through the real Rust transport',async t=>{
  const binary=process.env.GLASS_KEEP_WINDOWS_EXE;
  assert.ok(binary,'Set GLASS_KEEP_WINDOWS_EXE to the built portable executable.');
  const dir=await mkdtemp(path.join(tmpdir(),'glass-native-windows-')),origin='http://127.0.0.1:18096';
  const server=spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:'18096',DB_FILE:path.join(dir,'notes.db'),JWT_SECRET:'native-executable-test-only',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'native-executable-password-123',CLOUD_BACKUP_PUBLIC_URL:''},stdio:'ignore'});
  let browser,pid;
  t.after(async()=>{
    if(browser)await browser.close().catch(()=>{});
    if(pid)try{process.kill(pid);}catch{}
    if(server.exitCode===null){server.kill();await once(server,'exit');}
    assert.ok(path.resolve(dir).startsWith(path.join(tmpdir(),'glass-native-windows-')));
    await rm(dir,{recursive:true,force:true,maxRetries:30,retryDelay:200});
  });
  for(let i=0;i<100;i++){try{if((await fetch(origin+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  const output=execFileSync('powershell.exe',['-NoProfile','-Command','$p = Start-Process -FilePath $env:GLASS_KEEP_TEST_EXE -WindowStyle Hidden -PassThru; $p.Id'],{encoding:'utf8',windowsHide:true,env:{...process.env,GLASS_KEEP_TEST_EXE:path.resolve(binary),WEBVIEW2_USER_DATA_FOLDER:path.join(dir,'webview-profile'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=19341 --remote-debugging-address=127.0.0.1'}});
  pid=Number(output.trim());assert.ok(pid>0);
  for(let i=0;i<150;i++){try{if((await fetch('http://127.0.0.1:19341/json/version')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.connectOverCDP('http://127.0.0.1:19341');
  let page;
  for(let i=0;i<100;i++){page=browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('native.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page,'The packaged native page did not load.');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByLabel('Server address',{exact:true})).toBeVisible();await page.getByLabel('Server address',{exact:true}).fill(origin);await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByPlaceholder('Username',{exact:true}).fill('operator');await page.getByPlaceholder('Password',{exact:true}).fill('native-executable-password-123');await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await page.getByPlaceholder('Write a note...').click();await page.getByPlaceholder('Title',{exact:true}).fill('Real Windows Rust transport');await page.locator('textarea').fill('Saved by the compiled Windows executable');await page.getByRole('button',{name:'Add Note',exact:true}).click();await expect(page.locator('.note-card')).toHaveCount(1);
  const auth=await page.evaluate(()=>JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key=>key.startsWith('glass-keep-auth@')))));
  const response=await fetch(origin+'/api/notes',{headers:{Authorization:'Bearer '+auth.token}});const notes=await response.json();assert.equal(notes[0].title,'Real Windows Rust transport');
  await page.reload();await expect(page.locator('.note-card').filter({hasText:'Real Windows Rust transport'})).toBeVisible();
  const rejected=await page.evaluate(async()=>{try{await window.__TAURI_INTERNALS__.invoke('api_request',{server:'http://127.0.0.1:18096',path:'//other.example/api/login',method:'GET',headers:{},body:null});return false;}catch{return true;}});assert.equal(rejected,true);assert.deepEqual(errors,[]);
});
