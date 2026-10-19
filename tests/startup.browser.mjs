import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';

test('web and native startup screens are centered and use saved/system themes before React loads',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'glass-startup-')),children=[];
  t.after(async()=>{for(const child of children)if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
  children.push(spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:'18093',DB_FILE:path.join(dir,'notes.db'),JWT_SECRET:'startup-test-only',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'startup-password-123'},stdio:'ignore'}));
  children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.native.config.js','--port','1422','--host','127.0.0.1'],{stdio:'ignore'}));
  const urls=['http://127.0.0.1:18093/','http://127.0.0.1:1422/native.html'];
  for(const url of urls)for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error('Startup test server unavailable');await new Promise(resolve=>setTimeout(resolve,100));}
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());
  for(const [platform,url] of urls.entries())for(const {saved,system,dark} of [{saved:'true',system:'light',dark:true},{saved:'false',system:'dark',dark:false},{saved:null,system:'dark',dark:true}]) {
    const context=await browser.newContext({colorScheme:system,viewport:{width:390,height:844}}),page=await context.newPage();
    await page.addInitScript(saved=>{if(saved!==null)localStorage.setItem('glass-keep-dark-mode',saved);},saved);
    // Hold the compiled application scripts so this exercises the real HTML first paint.
    await page.route(/\/assets\/.*\.js$/,route=>route.fulfill({contentType:'application/javascript',body:'/* app script intentionally held for startup verification */'}));
    await page.goto(url);const screen=page.getByRole('status');await expect(screen).toBeVisible();
    await expect(screen).toHaveCSS('background-color',dark?'rgb(26, 26, 26)':'rgb(240, 242, 245)');
    const group=await screen.locator('p').boundingBox(),logo=await screen.locator('img').boundingBox();assert.ok(Math.abs(group.x+group.width/2-195)<1);assert.ok(Math.abs((logo.y+group.y+group.height)/2-422)<16);
    await page.screenshot({path:`artifacts/startup-${platform?'native':'web'}-${dark?'dark':'light'}.png`});
    await context.close();
  }
  for(const url of urls)for(const [language,text] of [['fr','Chargement de Glass Keep…'],['ru','Загрузка Glass Keep…']]) {
    const context=await browser.newContext({reducedMotion:'reduce'}),page=await context.newPage();
    await page.addInitScript(language=>localStorage.setItem('glass-keep-language',language),language);
    await page.route(/\/assets\/.*\.js$/,route=>route.fulfill({contentType:'application/javascript',body:''}));await page.goto(url);await expect(page.locator('.startup-spinner')).toHaveCSS('animation-name','none');
    await expect(page.locator('html')).toHaveAttribute('lang',language);await expect(page.getByText(text,{exact:true})).toBeVisible();await expect(page.getByText('Loading Glass Keep…',{exact:true})).toBeHidden();await context.close();
  }
});
