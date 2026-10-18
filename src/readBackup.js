import {unzip} from 'fflate';

const MAX_BYTES=200*1024*1024;
export async function readBackup(file) {
  if(file.size>MAX_BYTES)throw new Error('Backup exceeds the 200 MB import limit.');
  let text;
  if(/\.zip$/i.test(file.name)) {
    let count=0,invalid=false;
    const bytes=new Uint8Array(await file.arrayBuffer());
    const entries=await new Promise((resolve,reject)=>unzip(bytes,{filter:entry=>{
      count++;
      if(entry.name!=='backup.json' || entry.originalSize>MAX_BYTES || count>1){invalid=true;return false;}
      return true;
    }},(error,result)=>error?reject(error):resolve(result)));
    if(invalid || count!==1 || !entries['backup.json'] || entries['backup.json'].length>MAX_BYTES)throw new Error('Choose a Glass Keep backup ZIP containing backup.json (maximum 200 MB uncompressed).');
    text=new TextDecoder('utf-8',{fatal:true}).decode(entries['backup.json']);
  } else text=await file.text();
  const parsed=JSON.parse(text);
  const notes=Array.isArray(parsed)?parsed:parsed?.notes;
  if(!Array.isArray(notes) || notes.some(n=>!n || typeof n!=='object' || Array.isArray(n)))throw new Error('This is not a valid Glass Keep notes backup.');
  return notes;
}
