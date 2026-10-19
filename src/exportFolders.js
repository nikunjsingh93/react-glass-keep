function database() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('glass-keep-export-folders',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('folders');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
export async function exportFolder(key,value) {
  const db=await database();
  try {return await new Promise((resolve,reject)=>{
    const transaction=db.transaction('folders',value===undefined?'readonly':'readwrite');
    const store=transaction.objectStore('folders');
    const request=value===undefined?store.get(key):value===null?store.delete(key):store.put(value,key);
    let result;request.onsuccess=()=>result=request.result;
    transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error || Error('Could not remember the export folder.'));
  });}finally{db.close();}
}
export async function writeExportFolder(key,filename,json,canSave) {
  const folder=await exportFolder(key);
  if(!folder)throw Error('Choose the export folder again before downloading.');
  if(await folder.queryPermission({mode:'readwrite'})!=='granted')throw Error('Folder access needs permission. Choose the export folder again.');
  if(!canSave())return false;
  const file=await folder.getFileHandle(filename,{create:true});
  const stream=await file.createWritable();
  try {if(!canSave()){await stream.abort();return false;}await stream.write(json);await stream.close();return true;}
  catch(error){await stream.abort().catch(()=>{});throw error;}
}
