import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import Database from 'better-sqlite3';
import {unzipSync} from 'fflate';
import {vault} from '../server/cloudBackup.js';

test('personal cloud settings, ZIP download and direct restore work in the browser',async t=>{
 const dir=await mkdtemp(path.join(tmpdir(),'glass-cloud-browser-')),base='http://127.0.0.1:18092',dbFile=path.join(dir,'notes.db');
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:'18092',DB_FILE:dbFile,JWT_SECRET:'cloud-browser-test-only',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'cloud-browser-password-123',CLOUD_BACKUP_PUBLIC_URL:'',GOOGLE_DRIVE_CLIENT_ID:'',ONEDRIVE_CLIENT_ID:''},stdio:'pipe'});
 let logs='',db;child.stderr.on('data',b=>logs+=b);
 t.after(async()=>{if(db?.open)db.close();if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===99)throw Error(logs);}
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base);await page.getByPlaceholder('Username',{exact:true}).fill('operator');await page.getByPlaceholder('Password',{exact:true}).fill('cloud-browser-password-123');await page.getByRole('button',{name:'Sign In',exact:true}).click();await expect(page.getByPlaceholder('Write a note...')).toBeVisible();
 const session=await page.evaluate(()=>JSON.parse(localStorage.getItem('glass-keep-auth')));
 const api=async(route,method='GET',body)=>{const r=await fetch(base+'/api'+route,{method,headers:{Authorization:`Bearer ${session.token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json();};
 const note=await api('/notes','POST',{title:'Personal cloud restore',content:'Keep this content',images:[{id:'im',name:'pixel.png',src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl9sAAAAASUVORK5CYII='}]});
 await api('/admin/users','POST',{name:'Other',email:'other',password:'other-browser-password-123'});
 db=new Database(dbFile);const second=db.prepare('SELECT id FROM users WHERE email=?').get('other');db.prepare('INSERT INTO notes(id,user_id,type,title,content,items_json,tags_json,images_json,color,pinned,position,timestamp,archived) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('other-private',second.id,'text','Other private note','Do not export','[]','[]','[]','default',0,0,new Date().toISOString(),0);
 const open=async()=>{await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Cloud backup',exact:true}).click();};
 await page.reload();await open();const dialog=page.getByRole('dialog',{name:'Cloud backup',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByText('Google Drive',{exact:true})).toBeVisible();await expect(dialog.getByText('OneDrive',{exact:true})).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Connect',exact:true}).first()).toBeDisabled();
 await expect(dialog).toHaveCSS('background-color','rgba(255, 255, 255, 0.95)');
 await expect(dialog.getByText('One-time setup by the server owner is needed. After setup, every user can connect their own cloud account without administrator access.',{exact:true})).toHaveCount(2);
 const select=dialog.getByRole('combobox',{name:'Google Drive: Back up every',exact:true});for(const value of ['1','7','30'])await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1);
 const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Download backup ZIP',exact:true}).click();const download=await downloadPromise;const bytes=await readFile(await download.path());const data=JSON.parse(new TextDecoder().decode(unzipSync(bytes)['backup.json']));assert.equal(data.notes.length,1);assert.equal(data.notes[0].images.length,1);assert.equal(data.notes[0].title,'Personal cloud restore');assert.ok(!JSON.stringify(data).includes('Other private note'));
 await api('/notes/'+note.id,'DELETE');await expect(page.locator('.note-card')).toHaveCount(0);
 const chooserPromise=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:'Import backup',exact:true}).click();const chooser=await chooserPromise;await chooser.setFiles({name:'cloud-backup.zip',mimeType:'application/zip',buffer:bytes});await expect(page.locator('.note-card').filter({hasText:'Personal cloud restore'})).toBeVisible();
 const key=await readFile(path.join(dir,'cloud-backup.key'));db.prepare('INSERT INTO cloud_backup_accounts(user_id,provider,credentials,interval_days,next_run,generation) VALUES(?,?,?,?,?,?)').run(session.user.id,'google',vault(key).seal({access_token:'test',refresh_token:'test',expires_at:Date.now()+3600000}),7,Date.now()+7*86400000,'browser-test');
 await open();await expect(dialog.getByText('Connected',{exact:true})).toBeVisible();await dialog.getByRole('combobox',{name:'Google Drive: Back up every',exact:true}).selectOption('30');await dialog.getByRole('button',{name:'Save schedule',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('Backup schedule saved');assert.equal(db.prepare('SELECT interval_days FROM cloud_backup_accounts').get().interval_days,30);
 await dialog.getByRole('button',{name:'Disconnect',exact:true}).click();await expect(dialog.getByText('Not connected',{exact:true})).toHaveCount(2);db.close();assert.deepEqual(errors,[]);
});
