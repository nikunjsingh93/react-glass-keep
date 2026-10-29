import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {checkSelectionToolbar} from './selection-toolbar.mjs';
import {checkKeepImportPickers} from './keep-import.browser-checks.mjs';


test('native client connects, isolates servers, queues offline edits and saves portable ZIPs through native IPC',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'glass-native-')),children=[],requests=[],commands=[],saved=[];
  t.after(async()=>{for(const child of children)if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
  const origins=['http://127.0.0.1:18094','http://127.0.0.1:18095'];
  for(const [i,origin] of origins.entries()){
    children.push(spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:new URL(origin).port,DB_FILE:path.join(dir,`notes-${i}.db`),JWT_SECRET:`native-browser-only-${i}`,INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'native-browser-password-123',CLOUD_BACKUP_PUBLIC_URL:''},stdio:'ignore'}));
  }
  children.push(spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.native.config.js','--port','1421','--host','127.0.0.1'],{stdio:'ignore'}));
  for(const origin of [...origins,'http://127.0.0.1:1421'])for(let i=0;i<100;i++){try{if((await fetch(origin+(origin.endsWith('1421')?'/native.html':'/api/health'))).ok)break;}catch{}if(i===99)throw Error('Test server unavailable');await new Promise(r=>setTimeout(r,100));}
  const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const context=await browser.newContext({userAgent:'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('nativeRequest',async args=>{
    requests.push(args);assert.ok(origins.includes(args.server));assert.ok(args.path.startsWith('/api/'));
    const response=await fetch(args.server+args.path,{method:args.method,headers:args.headers,body:args.body || undefined,redirect:'manual'});
    return {status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer()).toString('base64')};
  });
  await page.exposeFunction('nativeCommand',(command,args)=>{
    commands.push({command,args});if(command==='choose_export_folder')return {directory:'C:/test-sync-folder',name:'Test sync folder'};if(command==='save_auto_export'){saved.push(Buffer.from(args.json));return;}if(command==='plugin:dialog|save')return '/chosen/backup.zip';
    if(command==='plugin:fs|write_file'){saved.push(Buffer.from(Object.values(args)));return;}
    if(command==='plugin:dialog|ask')return true;
    if(['plugin:dialog|message','plugin:clipboard-manager|write_text','plugin:opener|open_url'].includes(command))return;
    throw Error('Unexpected native command: '+command);
  });
  await page.addInitScript(()=>{
    let id=0;const callbacks=new Map();window.__nativeBackHandler=null;
    window.__TAURI_INTERNALS__={transformCallback:callback=>{callbacks.set(++id,callback);return id;},unregisterCallback:id=>callbacks.delete(id),invoke:(command,args)=>{
      if(command==='plugin:app|register_listener'){window.__nativeBackHandler=args.handler.onmessage;return Promise.resolve();}
      if(command==='plugin:app|remove_listener'){window.__nativeBackHandler=null;return Promise.resolve();}
      return command==='api_request'?window.nativeRequest(args):window.nativeCommand(command,args);
    }};
  });
  await page.goto('http://127.0.0.1:1421/native.html');
  await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('de');
  await expect(page.getByLabel('Serveradresse',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Verbinden',exact:true})).toBeVisible();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','de');
  await expect(page.getByRole('combobox',{name:'Sprache',exact:true})).toHaveValue('de');
  await page.getByRole('combobox',{name:'Sprache',exact:true}).selectOption('en');
  await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('ru');
  await expect(page.getByLabel('Адрес сервера',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Подключить',exact:true})).toBeVisible();
  await page.reload();await expect(page.locator('html')).toHaveAttribute('lang','ru');
  await expect(page.getByRole('combobox',{name:'Язык',exact:true})).toHaveValue('ru');
  await page.getByRole('combobox',{name:'Язык',exact:true}).selectOption('en');
  await page.getByRole('combobox',{name:'Language',exact:true}).selectOption('fr');
  await expect(page.getByLabel('Adresse du serveur',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('combobox',{name:'Langue',exact:true})).toHaveValue('fr');
  await page.getByRole('combobox',{name:'Langue',exact:true}).selectOption('en');
  const connect=async origin=>{await page.getByLabel('Server address',{exact:true}).fill(origin);await page.getByRole('button',{name:'Connect',exact:true}).click();};
  await connect(origins[0]+'/wrong');await expect(page.getByRole('alert')).toContainText('origin only');
  await connect(origins[0]);
  await page.getByRole('button',{name:'Connection settings',exact:true}).click();
  await expect(page.getByRole('link',{name:origins[0],exact:true})).toHaveAttribute('href',origins[0]);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const settings=async()=>{await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();};
  const changeServer=async origin=>{await settings();await expect(page.getByRole('link',{name:origin,exact:true})).toHaveAttribute('href',origin);await page.getByRole('button',{name:'Change server',exact:true}).click();};
  const login=async()=>{await page.getByPlaceholder('Username',{exact:true}).fill('operator');await page.getByPlaceholder('Password',{exact:true}).fill('native-browser-password-123');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByPlaceholder('Write a note...')).toBeVisible();};
  const create=async title=>{await page.getByPlaceholder('Write a note...').click();await page.getByPlaceholder('Title',{exact:true}).fill(title);await page.locator('textarea').fill('Portable native note');await page.getByRole('button',{name:'Add Note',exact:true}).click();await expect(page.locator('.note-card').filter({hasText:title})).toBeVisible();};
  await login();await create('First server only');
  await page.setViewportSize({width:390,height:844});
  await page.locator('.native-app').evaluate(root=>{root.style.setProperty('--native-safe-top','32px');root.style.setProperty('--native-safe-bottom','24px');root.style.setProperty('--native-safe-left','12px');root.style.setProperty('--native-safe-right','18px');});
  await page.locator('.app-header').evaluate(header=>{const spacer=document.createElement('div');spacer.id='scroll-regression-space';spacer.style.height='2500px';header.parentElement.append(spacer);});
  await page.evaluate(()=>window.scrollTo(0,900));
  await expect.poll(async()=>Math.round((await page.locator('.app-header').boundingBox()).y)).toBe(32);
  assert.ok(await page.evaluate(()=>!document.elementFromPoint(100,16)?.closest('.app-header')));
  await page.evaluate(()=>{document.getElementById('scroll-regression-space').remove();window.scrollTo(0,0);});
  const pressBack=async()=>{
    await expect.poll(()=>page.evaluate(()=>typeof window.__nativeBackHandler)).toBe('function');
    await page.evaluate(()=>window.__nativeBackHandler({canGoBack:false}));
  };
  for(let attempt=0;attempt<2;attempt++){
    await settings();
    const panel=page.locator('.settings-surface[aria-hidden="false"]');
    await expect(panel).toBeVisible();
    await expect.poll(async()=>Math.round((await panel.boundingBox()).y)).toBe(32);
    await expect.poll(async()=>Math.round((await panel.boundingBox()).x)).toBe(12);
    const bounds=await panel.boundingBox();assert.equal(bounds.y+bounds.height,820);
    assert.ok(bounds.x>=12&&bounds.x+bounds.width<=372);
    assert.ok((await panel.getByRole('heading',{name:'Settings',exact:true}).boundingBox()).y>=32);
    if(attempt===0){
      await panel.getByText('Local AI Assistant',{exact:true}).locator('../..').getByRole('button').click();
      await expect(page.getByRole('heading',{name:'Enable AI Assistant?',exact:true})).toBeVisible();
      await pressBack();await expect(page.getByRole('heading',{name:'Enable AI Assistant?',exact:true})).toHaveCount(0);
      await expect(panel).toBeVisible();
      await page.screenshot({path:'artifacts/android-settings-safe-area.png',animations:'disabled'});
    }
    await panel.locator(':scope > div').last().evaluate(body=>body.scrollTop=body.scrollHeight);
    assert.ok((await panel.getByRole('heading',{name:'Settings',exact:true}).boundingBox()).y>=32);
    await pressBack();await expect(panel).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>window.__nativeBackHandler)).toBe(null);
    await page.getByRole('button',{name:'Open tags',exact:true}).click();
    const tags=page.locator('.tags-drawer[aria-hidden="false"]');await expect(tags).toBeVisible();
    await expect.poll(async()=>Math.round((await tags.boundingBox()).y)).toBe(32);
    assert.equal((await tags.boundingBox()).y+(await tags.boundingBox()).height,820);
    assert.ok((await tags.getByRole('heading',{name:'Tags',exact:true}).boundingBox()).y>=32);
    if(attempt===0)await page.screenshot({path:'artifacts/android-tags-safe-area.png',animations:'disabled'});
    await pressBack();await expect(tags).toHaveCount(0);
    await expect(page.locator('.note-card')).toHaveCount(1);
    await expect.poll(()=>page.evaluate(()=>window.__nativeBackHandler)).toBe(null);
  }
  await page.locator('.note-card').filter({hasText:'First server only'}).click();
  const modal=page.locator('.modal-scrim');await expect(modal).toBeVisible();
  const bounds=await modal.boundingBox();assert.equal(bounds.y,32);assert.equal(bounds.y+bounds.height,820);
  assert.ok((await modal.getByPlaceholder('Title',{exact:true}).boundingBox()).y>=32);
  await expect.poll(()=>page.evaluate(()=>typeof window.__nativeBackHandler)).toBe('function');
  await page.evaluate(()=>window.__nativeBackHandler({canGoBack:false}));
  await expect(modal).toHaveCount(0);await expect(page.locator('.note-card').filter({hasText:'First server only'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__nativeBackHandler)).toBe(null);
  await page.locator('.note-card').filter({hasText:'First server only'}).click();
  await modal.getByRole('button',{name:'Edit mode',exact:true}).click();
  await modal.getByPlaceholder('Title',{exact:true}).fill('First server edited');
  await expect.poll(()=>page.evaluate(()=>typeof window.__nativeBackHandler)).toBe('function');
  await page.evaluate(()=>window.__nativeBackHandler({canGoBack:false}));
  await expect(modal).toBeVisible();await expect(modal.getByPlaceholder('Title',{exact:true})).toHaveValue('First server edited');
  await expect(page.getByRole('alert')).toContainText('unsaved changes');
  await page.getByRole('alert').getByRole('button',{name:'Close',exact:true}).click();
  await modal.getByRole('button',{name:'Save',exact:true}).click();await expect(modal).toHaveCount(0);
  await expect(page.locator('.note-card').filter({hasText:'First server edited'})).toBeVisible();
  await page.locator('.native-app').evaluate(root=>{for(const side of ['top','bottom','left','right'])root.style.removeProperty('--native-safe-'+side);});
  await page.setViewportSize({width:1280,height:720});
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Multi select',exact:true}).click();
  await checkSelectionToolbar(page);
  await page.getByRole('button',{name:'Exit multi-select',exact:true}).click();
  await expect(page.locator('.native-server-bar')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Change server',exact:true})).toBeHidden();
  await context.setOffline(true);await create('Pending on first server');
  await changeServer(origins[0]);await context.setOffline(false);await connect(origins[1]);await login();await expect(page.locator('.note-card')).toHaveCount(0);
  assert.equal(requests.filter(r=>r.server===origins[1] && r.body?.includes('Pending on first server')).length,0);
  await create('Second server only');
  await changeServer(origins[1]);await connect(origins[0]);await expect(page.getByPlaceholder('Write a note...')).toBeVisible();await expect(page.locator('.note-card')).toHaveCount(2);
  await settings();
  for(const dark of [false,true]){
    if(dark){await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Dark Mode',exact:true}).click();await settings();}
    const colors=await page.getByLabel('Language',{exact:true}).evaluate(select=>({text:getComputedStyle(select).color,background:getComputedStyle(select).backgroundColor,optionText:getComputedStyle(select.options[0]).color,optionBackground:getComputedStyle(select.options[0]).backgroundColor}));
    assert.equal(colors.text,dark?'rgb(243, 244, 246)':'rgb(17, 24, 39)');assert.equal(colors.background,dark?'rgb(34, 34, 34)':'rgb(255, 255, 255)');assert.equal(colors.optionText,colors.text);assert.equal(colors.optionBackground,colors.background);
    const borders=await page.getByRole('button',{name:'Automatic JSON export',exact:true}).evaluate(button=>({cloud:getComputedStyle(button).borderColor,language:getComputedStyle(document.querySelector('.themed-select').closest('label')).borderColor}));assert.equal(borders.cloud,borders.language);assert.notEqual(borders.cloud,'rgb(243, 244, 246)');
    await expect.poll(()=>page.getByLabel('Language',{exact:true}).evaluate(select=>Math.round(select.closest('[aria-hidden]').getBoundingClientRect().right))).toBe(1280);
    await page.screenshot({path:`artifacts/settings-${dark?'dark':'light'}.png`,animations:'disabled'});
  }
  await page.getByRole('button',{name:'Automatic JSON export',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Automatic JSON export',exact:true})).toHaveCSS('background-color','rgb(34, 34, 34)');
  await page.getByRole('button',{name:'Choose export folder',exact:true}).click();await expect(page.getByText('Test sync folder',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Download JSON now',exact:true}).click();
  await expect.poll(()=>saved.length).toBe(1);const backup=JSON.parse(saved[0].toString());assert.equal(commands.find(c=>c.command==='save_auto_export').args.directory,'C:/test-sync-folder');assert.equal(backup.notes.length,2);assert.ok(!JSON.stringify(backup).includes('Second server only'));
  await page.getByRole('combobox',{name:'Export every',exact:true}).selectOption('7');
  await expect.poll(()=>page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.includes('glass-keep-auto-export-')).map(([,value])=>JSON.parse(value).days))).toEqual([7]);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await checkKeepImportPickers(page,dir,async()=>{
    const auth=await page.evaluate(()=>JSON.parse(localStorage.getItem('glass-keep-auth@'+encodeURIComponent(localStorage.getItem('glass-keep-native-server')))));
    return (await fetch(origins[0]+'/api/notes',{headers:{Authorization:'Bearer '+auth.token}})).json();
  });
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('glass-keep-native-server')),origins[0]);
  const keys=await page.evaluate(()=>Object.keys(localStorage));assert.ok(keys.includes(`glass-keep-auth@${encodeURIComponent(origins[1])}`));assert.ok(!keys.includes(`glass-keep-auth@${encodeURIComponent(origins[0])}`));assert.deepEqual(errors,[]);
});
