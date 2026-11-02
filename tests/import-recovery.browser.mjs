import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {zipSync,strToU8} from 'fflate';
import {largeTakeoutImage} from './large-takeout-fixture.mjs';

test('1300-note Keep import survives lost responses, preserves a >20 MiB note, and reports only the bad note',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'glass-import-recovery-')),base='http://127.0.0.1:18097';
  const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,NODE_ENV:'production',API_PORT:'18097',DB_FILE:path.join(dir,'notes.db'),JWT_SECRET:'isolated-import-recovery-test',INITIAL_ADMIN_USERNAME:'operator',INITIAL_ADMIN_PASSWORD:'import-recovery-password-123'},stdio:'ignore'});
  let browser;t.after(async()=>{await browser?.close();if(child.exitCode===null){child.kill();await once(child,'exit');}await rm(dir,{recursive:true,force:true});});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.getByPlaceholder('Username',{exact:true}).fill('operator');await page.getByPlaceholder('Password',{exact:true}).fill('import-recovery-password-123');await page.getByRole('button',{name:'Sign In',exact:true}).click();
  await expect(page.getByPlaceholder('Write a note...')).toBeVisible();
  const auth=await page.evaluate(()=>JSON.parse(localStorage.getItem('glass-keep-auth')));
  const notes=async()=>{const response=await fetch(base+'/api/notes',{headers:{Authorization:'Bearer '+auth.token}});assert.equal(response.status,200);return response.json();};
  const entries={};for(let i=0;i<1300;i++)entries[`Takeout/Keep/${String(i).padStart(4,'0')}.json`]=strToU8(JSON.stringify({title:'Recovery note '+i,textContent:'Keep fixture '+i}));
  entries['Takeout/Keep/0953-large.json']=strToU8(JSON.stringify({title:'Large intact note',textContent:'Both original pictures',attachments:[{filePath:'one.png'},{filePath:'two.png'}]}));
  entries['Takeout/Keep/1278-bad.json']=strToU8(JSON.stringify({title:'Too large image',textContent:'Do not partially import',attachments:[{filePath:'oversize.png'}]}));
  const picture=Buffer.alloc(8*1024*1024);largeTakeoutImage.copy(picture);
  entries['Takeout/Keep/one.png']=picture;entries['Takeout/Keep/two.png']=picture;entries['Takeout/Keep/oversize.png']=new Uint8Array(13*1024*1024);
  const zip=zipSync(entries);
  let lostBatches=0,lostCommit=false,refreshes=0;const payloads=[],operationIds=[];
  await page.route('**/api/notes/import',async route=>{
    payloads.push(Buffer.byteLength(route.request().postData()||''));
    operationIds.push(route.request().headers()['x-operation-id']);
    if(lostBatches<6){lostBatches++;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await page.route('**/api/notes/import/uploads/*/commit',async route=>{
    if(!lostCommit){lostCommit=true;await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Import Google Keep (ZIP / folder / JSON)',exact:false}).click();
  const dialog=page.getByRole('dialog',{name:'Import Google Keep',exact:true});
  await dialog.getByLabel('Takeout ZIP',{exact:true}).setInputFiles({name:'recovery.zip',mimeType:'application/zip',buffer:Buffer.from(zip)});
  await expect(dialog).toContainText('Notes ready: 1302');await dialog.getByRole('checkbox',{name:'Skip duplicate notes',exact:true}).uncheck();
  page.on('request',request=>{if(request.method()==='GET'&&new URL(request.url()).pathname==='/api/notes')refreshes++;});
  await dialog.getByRole('button',{name:'Import',exact:true}).click();
  await expect(dialog).toContainText('Import paused after 0 notes. Resume to continue.',{timeout:60000});
  await expect(dialog.getByRole('checkbox',{name:'Skip duplicate notes',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Resume import',exact:true}).click();
  await expect(dialog).toContainText('Imported: 1301',{timeout:120000});await expect(dialog).toContainText('Notes needing attention: 1. Other notes were imported.');
  await expect(dialog).toContainText('Too large image: An image exceeds the 12 MiB import limit.');assert.ok(lostBatches===6&&lostCommit);assert.ok(payloads.every(size=>size<600*1024));assert.equal(new Set(operationIds.slice(0,7)).size,1);
  const saved=await notes();assert.equal(saved.length,1301);assert.ok(saved.find(n=>n.title==='Recovery note 1299'));assert.ok(!saved.find(n=>n.title==='Too large image'));
  const large=saved.find(n=>n.title==='Large intact note');assert.equal(large.images.length,2);assert.equal(large.images[0].src,'data:image/png;base64,'+picture.toString('base64'));assert.equal(large.content,'Both original pictures');
  await expect.poll(()=>page.locator('.note-card').filter({hasText:'Large intact note'}).locator('img').first().evaluate(image=>image.naturalWidth)).toBe(32);
  assert.ok(refreshes<=3,`Import must not repeatedly refresh all images (${refreshes} refreshes)`);
  await dialog.getByRole('button',{name:'Retry failed notes',exact:true}).click();await expect(dialog).toContainText('Notes needing attention: 1. Other notes were imported.');assert.equal((await notes()).length,1301);
  await page.screenshot({path:'artifacts/import-recovery.png',animations:'disabled'});assert.deepEqual(errors,[]);
});
