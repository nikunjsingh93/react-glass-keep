import {appFetch,storageKey} from './platform';
import {getLanguage} from './i18n';

// Poll snapshots of streamed text through web fetch and native Rust IPC, regardless of Nginx buffering.
export async function askAI(question,{onUpdate,signal=new AbortController().signal}={}) {
  let auth;try{auth=JSON.parse(localStorage.getItem(storageKey('glass-keep-auth'))||'null');}catch{}
  if(!auth?.token)throw new Error('You must be logged in to use the AI Assistant.');
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${auth.token}`};
  let id;
  async function request(route,{requestSignal=signal,timeout=20000,...options}={}){
    // Older macOS WebViews do not implement AbortSignal.any/timeout.
    const controller=new AbortController(),abort=()=>controller.abort();
    if(requestSignal?.aborted)abort();else requestSignal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(abort,timeout);
    try{
      const response=await appFetch('/api/ai/'+route,{...options,headers,signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'The AI request failed.');return data;
    }finally{clearTimeout(timer);requestSignal?.removeEventListener('abort',abort);}
  }
  try {
    let data=await request('ask',{method:'POST',body:JSON.stringify({question,language:getLanguage(),async:true})});id=data.id;
    if(!id){onUpdate?.({...data,status:'done'});return data;}
    const deadline=Date.now()+12*60*1000;
    while(true){
      if(signal.aborted)throw new DOMException('Request aborted','AbortError');onUpdate?.(data);
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
    if(id)await request('requests/'+encodeURIComponent(id),{method:'DELETE',requestSignal:null,timeout:5000}).catch(()=>{});
  }
}
