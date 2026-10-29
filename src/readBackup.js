import {openZipArchive,isTakeoutArchive} from './zipArchive.js';

const MAX_BYTES=200*1024*1024;
export async function readBackup(file) {
  let text;
  if(/\.zip$/i.test(file.name)) {
    const entries=await openZipArchive(file);
    if(isTakeoutArchive(entries))throw Object.assign(new Error('Use Import Google Keep for Takeout ZIPs; Import backup is for Glass Keep JSON or ZIP backups.'),{code:'GOOGLE_KEEP_TAKEOUT'});
    if(file.size>MAX_BYTES)throw new Error('Backup exceeds the 200 MB import limit.');
    if(entries.size!==1||!entries.has('backup.json')||entries.get('backup.json').size>MAX_BYTES)throw new Error('Choose a Glass Keep backup ZIP containing backup.json (maximum 200 MB uncompressed).');
    text=new TextDecoder('utf-8',{fatal:true}).decode(await entries.get('backup.json').read({maxBytes:MAX_BYTES}));
  } else {
    if(file.size>MAX_BYTES)throw new Error('Backup exceeds the 200 MB import limit.');
    text=await file.text();
  }
  const parsed=JSON.parse(text);
  const notes=Array.isArray(parsed)?parsed:parsed?.notes;
  if(!Array.isArray(notes) || notes.some(n=>!n || typeof n!=='object' || Array.isArray(n)))throw new Error('This is not a valid Glass Keep notes backup.');
  return notes;
}
