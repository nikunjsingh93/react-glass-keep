const CHUNK_BYTES=256*1024,MAX_NOTE_BYTES=128*1024*1024;
export const delay=(ms,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
});
export async function retryImportRequest(send,{signal,onRetry,wait=delay,retries=5}={}) {
  for(let attempt=0;;attempt++){
    signal?.throwIfAborted();
    try{return await send();}catch(error){
      signal?.throwIfAborted();
      if(attempt>=retries||!(error.isNetworkError||[0,408,425,429,502,503,504].includes(error.status)))throw error;
      onRetry?.(attempt+1,retries);await wait(Math.min(1000*2**attempt,16000),signal);
    }
  }
}
export function createImportTransport(api,token,{signal,onRetry,deduplicate=true,restoreSharing=false,wait,state={operations:new Map(),uploads:new Map()}}={}) {
  state.identities ||= new WeakMap();
  const identity=note=>{
    if(note.id!==undefined&&note.id!==null)return String(note.id);
    if(!state.identities.has(note))state.identities.set(note,crypto.randomUUID());
    return state.identities.get(note);
  };
  const request=(path,method,body)=>{
    const key=method+path+JSON.stringify(body?.notes?.map(identity)||[]);
    if(!state.operations.has(key))state.operations.set(key,crypto.randomUUID());
    const operationId=method==='PUT'?undefined:state.operations.get(key);
    return retryImportRequest(()=>api(path,{method,token,body,operationId,signal}),{signal,onRetry,wait});
  };
  return {
    send:body=>request('/notes/import','POST',{...body,deduplicate,restoreSharing}),
    async sendLarge(note){
      const bytes=new TextEncoder().encode(JSON.stringify(note));
      if(bytes.length>MAX_NOTE_BYTES)throw new Error('This note exceeds the 128 MiB import limit.');
      const key=identity(note);
      if(!state.uploads.has(key))state.uploads.set(key,crypto.randomUUID());
      const path='/notes/import/uploads/'+state.uploads.get(key);let complete=false;
      try{
        await request(path,'PUT',{bytes:bytes.length,chunks:Math.ceil(bytes.length/CHUNK_BYTES),deduplicate,restoreSharing});
        for(let start=0,part=0;start<bytes.length;start+=CHUNK_BYTES,part++){
          signal?.throwIfAborted();const chunk=bytes.subarray(start,start+CHUNK_BYTES);let binary='';
          for(let i=0;i<chunk.length;i+=32768)binary+=String.fromCharCode(...chunk.subarray(i,i+32768));
          await request(path+'/chunks/'+part,'PUT',{data:btoa(binary)});
        }
        const result=await request(path+'/commit','POST',{});complete=true;return result;
      }finally{
        // Best effort only; expired unfinished uploads are removed server-side.
        if(!complete)void api(path,{method:'DELETE',token}).catch(()=>{});
      }
    },
  };
}
