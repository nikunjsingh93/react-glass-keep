import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect} from '@playwright/test';
import {zipSync,strToU8} from 'fflate';
import {largeTakeoutImage} from './large-takeout-fixture.mjs';

// Works with both the shared web UI and the bundled native UI using fixture accounts.
export async function checkKeepImportPickers(page,directory,readNotes) {
  const open=async()=>{
    await page.getByRole('button',{name:'Menu',exact:true}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByRole('button',{name:'Import Google Keep (ZIP / folder / JSON)',exact:false}).click();
  };
  const dialog=page.getByRole('dialog',{name:'Import Google Keep',exact:true});
  const pick=async(button,files)=>{
    const picker=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:button,exact:true}).click();
    const chooser=await picker;await chooser.setFiles(files);
  };
  const finish=async count=>{
    await dialog.getByRole('button',{name:'Import',exact:true}).click();await expect(dialog).toContainText(`Imported: ${count}`);
    await dialog.getByRole('button',{name:'Close',exact:true}).click();
  };
  const note=(title,filePath)=>JSON.stringify({title,textContent:'Keep picture fixture',attachments:[{filePath}]});
  await open();
  const viewport=page.viewportSize();
  for(const width of [320,1280]){
    await page.setViewportSize({width,height:844});
    for(const name of ['Choose Takeout ZIP','Choose Takeout folder','Add JSON files and images']){
      const button=dialog.getByRole('button',{name,exact:true});await expect(button).toBeVisible();
      const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);
    }
  }
  if(viewport)await page.setViewportSize(viewport);
  await expect(dialog.getByLabel('JSON files and images',{exact:true})).toHaveAttribute('accept',/\.png/);
  await pick('Add JSON files and images',[
    {name:'one.json',mimeType:'application/json',buffer:Buffer.from(note('Loose picture one','attachments/one.png'))},
    {name:'two.json',mimeType:'application/json',buffer:Buffer.from(note('Loose picture two','two.png'))},
  ]);
  await expect(dialog).toContainText('Notes ready: 2');await expect(dialog.getByRole('alert')).toHaveText('Missing images: 2');
  await expect(dialog.getByRole('button',{name:'Import',exact:true})).toBeDisabled();
  await pick('Add JSON files and images',['one.png','two.png'].map(name=>({name,mimeType:'image/png',buffer:largeTakeoutImage})));
  await expect(dialog).toContainText('Notes ready: 2');await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog).toContainText('Loose picture one · 1 images');await finish(2);
  for(const title of ['Loose picture one','Loose picture two']){
    const saved=(await readNotes()).find(n=>n.title===title);assert.equal(saved.images[0].src,'data:image/png;base64,'+largeTakeoutImage.toString('base64'));
    await expect.poll(()=>page.locator('.note-card').filter({hasText:title}).locator('img').first().evaluate(image=>image.naturalWidth)).toBe(32);
  }
  const folder=path.join(directory,'Keep'),images=path.join(folder,'attachments');await mkdir(images,{recursive:true});
  await writeFile(path.join(folder,'folder.json'),note('Folder picture','attachments/folder.png'));await writeFile(path.join(images,'folder.png'),largeTakeoutImage);
  await open();await pick('Choose Takeout folder',folder);await expect(dialog).toContainText('Notes ready: 1');await expect(dialog).toContainText('Folder picture · 1 images');await finish(1);
  assert.equal((await readNotes()).find(n=>n.title==='Folder picture').images.length,1);
  await open();await pick('Add JSON files and images',{name:'missing.json',mimeType:'application/json',buffer:Buffer.from(note('Intentionally missing','missing.png'))});
  await expect(dialog.getByRole('button',{name:'Import',exact:true})).toBeDisabled();
  await dialog.getByRole('checkbox',{name:'Import anyway without missing images',exact:true}).check();await expect(dialog.getByRole('button',{name:'Import',exact:true})).toBeEnabled();
  const zipped=zipSync({'Takeout/Keep/zip.json':strToU8(note('ZIP picker picture','zip.png')),'Takeout/Keep/zip.png':largeTakeoutImage});
  await pick('Choose Takeout ZIP',{name:'takeout.zip',mimeType:'application/zip',buffer:Buffer.from(zipped)});
  await expect(dialog).toContainText('Notes ready: 1');await expect(dialog).not.toContainText('Intentionally missing');await expect(dialog.getByRole('alert')).toHaveCount(0);await finish(1);
  assert.equal((await readNotes()).find(n=>n.title==='ZIP picker picture').images[0].src,'data:image/png;base64,'+largeTakeoutImage.toString('base64'));
}
