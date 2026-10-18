import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {unzipSync} from 'fflate';

test('native client connects, isolates servers, queues offline edits and saves portable ZIPs through native IPC',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'glass-native-')),children=[],requests=[],commands=[],saved=[];
  t.after(async()=>{for(const child of children)if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
  const origins=['http://127.0.0.1:18094','http://127.0.0.1:18095'];
  for(const [i,origin] of origins.entries()){
    children.push(spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:new URL(origin).port,DB_FILE:path.join(dir,`notes-${i}.db`),JWT_SECRET:`native-browser-only-${i}`,INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'native-browser-password-123',CLOUD_BACKUP_PUBLIC_URL:''},stdio:'ignore'}));
  }
  children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.native.config.js','--port','1421','--host','127.0.0.1'],{stdio:'ignore'}));
  for(const origin of [...origins,'http://127.0.0.1:1421'])for(let i=0;i<100;i++){try{if((await fetch(origin+(origin.endsWith('1421')?'/native.html':'/api/health'))).ok)break;}catch{}if(i===99)throw Error('Test server unavailable');await new Promise(r=>setTimeout(r,100));}
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeRequest',async args=>{
    requests.push(args);assert.ok(origins.includes(args.server));assert.ok(args.path.startsWith('/api/'));
    const response=await fetch(args.server+args.path,{method:args.method,headers:args.headers,body:args.body || undefined,redirect:'manual'});
    return {status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer()).toString('base64')};
  });
  await page.exposeFunction('nativeCommand',(command,args)=>{
    commands.push({command,args});if(command==='plugin:dialog|save')return '/chosen/backup.zip';
    if(command==='plugin:fs|write_file'){saved.push(Buffer.from(Object.values(args)));return;}
    if(command==='plugin:dialog|ask')return true;
    if(['plugin:dialog|message','plugin:clipboard-manager|write_text','plugin:opener|open_url'].includes(command))return;
    throw Error('Unexpected native command: '+command);
  });
  await page.addInitScript(()=>{window.__TAURI_INTERNALS__={invoke:(command,args)=>command==='api_request'?window.nativeRequest(args):window.nativeCommand(command,args)};});
  await page.goto('http://127.0.0.1:1421/native.html');
  const connect=async origin=>{await page.getByLabel('Server address',{exact:true}).fill(origin);await page.getByRole('button',{name:'Connect',exact:true}).click();};
  await connect(origins[0]+'/wrong');await expect(page.getByRole('alert')).toContainText('origin only');
  await connect(origins[0]);
  const login=async()=>{await page.getByPlaceholder('Username',{exact:true}).fill('operator');await page.getByPlaceholder('Password',{exact:true}).fill('native-browser-password-123');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByPlaceholder('Write a note...')).toBeVisible();};
  const create=async title=>{await page.getByPlaceholder('Write a note...').click();await page.getByPlaceholder('Title',{exact:true}).fill(title);await page.locator('textarea').fill('Portable native note');await page.getByRole('button',{name:'Add Note',exact:true}).click();await expect(page.locator('.note-card').filter({hasText:title})).toBeVisible();};
  await login();await create('First server only');
  await context.setOffline(true);await create('Pending on first server');
  await page.getByRole('button',{name:'Change server',exact:true}).click();await context.setOffline(false);await connect(origins[1]);await login();await expect(page.locator('.note-card')).toHaveCount(0);
  assert.equal(requests.filter(r=>r.server===origins[1] && r.body?.includes('Pending on first server')).length,0);
  await create('Second server only');
  await page.getByRole('button',{name:'Change server',exact:true}).click();await connect(origins[0]);await expect(page.getByPlaceholder('Write a note...')).toBeVisible();await expect(page.locator('.note-card')).toHaveCount(2);
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Cloud backup',exact:true}).click();await page.getByRole('button',{name:'Download backup ZIP',exact:true}).click();
  await expect.poll(()=>saved.length).toBe(1);const backup=JSON.parse(new TextDecoder().decode(unzipSync(saved[0])['backup.json']));assert.equal(backup.notes.length,2);assert.ok(!JSON.stringify(backup).includes('Second server only'));
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('glass-keep-native-server')),origins[0]);
  const keys=await page.evaluate(()=>Object.keys(localStorage));assert.ok(keys.includes(`glass-keep-auth@${encodeURIComponent(origins[1])}`));assert.ok(!keys.includes(`glass-keep-auth@${encodeURIComponent(origins[0])}`));assert.deepEqual(errors,[]);
});
