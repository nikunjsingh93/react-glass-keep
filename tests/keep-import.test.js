import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8,Zip,ZipDeflate} from 'fflate';
import {openZipArchive} from '../src/zipArchive.js';
import {readKeepFiles,parseKeepEntries,keepNotesWithAttachments} from '../src/keepImport.js';
import {readBackup} from '../src/readBackup.js';
import {importNoteBatches} from '../src/importBackup.js';
import {largeTakeoutFixture,largeTakeoutImage} from './large-takeout-fixture.mjs';
const zipFile=entries=>new File([zipSync(entries)],'export.zip');

test('450 MiB Takeout is routed correctly and imported without reading the whole ZIP or unused HTML',async()=>{
  const file=largeTakeoutFixture();
  await assert.rejects(()=>readBackup(file),error=>error.code==='GOOGLE_KEEP_TAKEOUT');
  const entries=await readKeepFiles([file]),preview=parseKeepEntries(entries);
  assert.equal(preview.notes.length,1);assert.equal(preview.notes[0].images[0].src,null);
  const sent=[];await importNoteBatches(keepNotesWithAttachments(preview.notes,entries),async body=>sent.push(body));
  assert.equal(sent[0].notes[0].title,'Large Takeout fixture');
  assert.equal(sent[0].notes[0].images[0].src,'data:image/png;base64,'+largeTakeoutImage.toString('base64'));
  assert.equal('entryName' in sent[0].notes[0].images[0],false);
  assert.ok(file.reads.every(([start,end])=>end-start<=65557));
  assert.ok(file.reads.reduce((sum,[start,end])=>sum+end-start,0)<200000);
});

test('attachments remain lazy, folder inputs work, and cancellation stops further preparation',async()=>{
  let imageReads=0;
  const image={name:'image.png',size:4,webkitRelativePath:'Keep/image.png',async arrayBuffer(){imageReads++;return new Uint8Array([137,80,78,71]).buffer;}};
  const note=new File([JSON.stringify({title:'Folder note',textContent:'Keep data',attachments:[{filePath:'image.png'}]})],'note.json');
  Object.defineProperty(note,'webkitRelativePath',{value:'Keep/note.json'});
  const entries=await readKeepFiles([note,image]),preview=parseKeepEntries(entries);assert.equal(imageReads,0);
  const controller=new AbortController();controller.abort();
  await assert.rejects(async()=>{for await(const unused of keepNotesWithAttachments(preview.notes,entries,{signal:controller.signal}))void unused;},{name:'AbortError'});
  assert.equal(imageReads,0);
  for await(const result of keepNotesWithAttachments(preview.notes,entries))assert.ok(result.images[0].src);assert.equal(imageReads,1);
});

test('ZIP reader rejects unsafe paths, bad CRC/lengths, oversize files, and excessive expanded metadata',async()=>{
  for(const name of ['../note.json','/note.json','C:/note.json','Keep/../note.json'])await assert.rejects(()=>openZipArchive(zipFile({[name]:strToU8('{}')})),/invalid paths/);
  const file=zipFile({'note.json':[strToU8('abc'),{level:0}]}),raw=new Uint8Array(await file.arrayBuffer());
  const altered=raw.slice();altered[30+'note.json'.length]^=1;
  const indexed=await openZipArchive(new File([altered],'bad.zip'));await assert.rejects(()=>indexed.get('note.json').read(),/damaged/);
  const small=await openZipArchive(file);await assert.rejects(()=>small.get('note.json').read({maxBytes:2}),/per-file limit/);
  const bytes=raw.slice(),view=new DataView(bytes.buffer),directory=view.getUint32(bytes.length-6,true);
  view.setUint32(directory+24,0xfffffffe,true);await assert.rejects(()=>openZipArchive(new File([bytes],'oversize.zip')),/safe import limits|damaged/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>openZipArchive(file,{signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(()=>openZipArchive({size:3*1024**3}),/2 GB/);
});

test('Glass Keep ZIP/JSON backup compatibility and Takeout metadata validation are preserved',async()=>{
  const notes=[{title:'Backup note',content:'Saved'}];
  assert.deepEqual(await readBackup(zipFile({'backup.json':strToU8(JSON.stringify({notes}))})),notes);
  assert.deepEqual(await readBackup(new File([JSON.stringify(notes)],'notes.json')),notes);
  const entries=await readKeepFiles([zipFile({'Takeout/Keep/valid.json':strToU8(JSON.stringify({title:'Actual note',textContent:'x'})),
    'Takeout/Keep/metadata.json':strToU8(JSON.stringify({notes:[{}]})),
    'Takeout/Keep/bad.json':strToU8(JSON.stringify({title:'Bad date',textContent:'x',createdTimestampUsec:1e300})),
    'Takeout/Other/unrelated.json':strToU8('{}')})]);
  const result=parseKeepEntries(entries);assert.deepEqual(result.notes.map(note=>note.title),['Actual note']);assert.equal(result.warnings.length,1);
});

test('per-note upload budget is checked before accumulating large attachments',async()=>{
  let reads=0;
  const entries=new Map([['a',{size:12*1024*1024,async read(){reads++;return new Uint8Array(12*1024*1024);}}],['b',{size:12*1024*1024,async read(){reads++;return new Uint8Array(12*1024*1024);}}]]);
  const notes=[{title:'Big note',images:[{id:'a',name:'a.png',entryName:'a'},{id:'b',name:'b.png',entryName:'b'}]}];
  await assert.rejects(()=>importNoteBatches(keepNotesWithAttachments(notes,entries),async()=>assert.fail('Oversized note must not be sent')),/API upload limit/);assert.equal(reads,1);
});

test('streamed ZIP descriptors/Unicode names work and dishonest expanded lengths are rejected',async()=>{
  const chunks=[];let complete=false;
  const zip=new Zip((error,data,final)=>{if(error)throw error;chunks.push(data);complete=final;});
  const note=new ZipDeflate('Takeout/Keep/été.json');zip.add(note);note.push(strToU8(JSON.stringify({title:'été',textContent:'A streamed entry'})),true);zip.end();assert.ok(complete);
  const result=parseKeepEntries(await readKeepFiles([new File(chunks,'streamed.zip')]));assert.equal(result.notes[0].title,'été');
  const bytes=zipSync({'bomb.json':strToU8('a'.repeat(100000))}),view=new DataView(bytes.buffer),directory=view.getUint32(bytes.length-6,true);view.setUint32(directory+24,2,true);
  const indexed=await openZipArchive(new File([bytes],'dishonest.zip'));await assert.rejects(()=>indexed.get('bomb.json').read(),/damaged/);
  await assert.rejects(()=>readKeepFiles([{name:'huge.json',size:65*1024*1024,arrayBuffer(){throw Error('Must reject before reading');}}]),/too much note metadata/);
});
