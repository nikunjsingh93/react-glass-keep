import {appFetch,storageKey} from './platform';
import {getLanguage} from './i18n';

// Poll snapshots of streamed text through web fetch and native Rust IPC, regardless of Nginx buffering.
export async function askAI(question,{onUpdate,signal=new AbortController().signal}={}) {
  let auth;try{auth=JSON.parse(localStorage.getItem(storageKey('glass-keep-auth'))||'null');}catch{}
  if(!auth?.token)throw new Error('You must be logged in to use the AI Assistant.');
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`};
  let id;
  async function request(route,options={}){
    const response=await appFetch('/api/ai/'+route,{...options,headers,signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'The AI request failed.');return data;
  }
  try {
    let data=await request('ask',{method:'POST',body:JSON.stringify({question,language:getLanguage(),async:true})});id=data.id;
    if(!id){onUpdate?.({...data,status:'done'});return data;}
    const deadline=Date.now()+12*60*1000;
    while(true){
      signal.throwIfAborted();onUpdate?.(data);
      if(data.status==='done')return data;
      if(['error','cancelled'].includes(data.status))throw new Error(data.error||'The AI request failed.');
      if(Date.now()>deadline)throw new Error('The AI request timed out. Please retry.');
      await new Promise((resolve,reject)=>{
        const abort=()=>{clearTimeout(timer);reject(new DOMException('Request aborted','AbortError'));};
        const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},400);
        if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
      });
      data=await request('requests/'+encodeURIComponent(id));
    }
  } finally {
    if(id)await appFetch('/api/ai/requests/'+encodeURIComponent(id),{method:'DELETE',headers,signal:AbortSignal.timeout(5000)}).catch(()=>{});
  }
}
