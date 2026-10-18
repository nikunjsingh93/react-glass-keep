const DB_NAME='glass-keep-offline-v1';
let opened;
const empty=()=>({notes:[],ops:[],conflicts:{}});
function database(){if(!opened)opened=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore('accounts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return opened;}
export async function accountState(userId,change) {
  const db=await database();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('accounts',change?'readwrite':'readonly'),store=tx.objectStore('accounts');const req=store.get(String(userId));let result;
    req.onsuccess=()=>{const state=req.result || empty();try{result=change?change(state):state;if(change)store.put(state,String(userId));}catch(e){tx.abort();reject(e);}};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || new Error('Offline storage transaction failed'));
  });
}
const emit=()=>{if(typeof window!=='undefined')window.dispatchEvent(new Event('outbox-changed'));};
const networkFailure=e=>e.isNetworkError || e.name==='AbortError' || (e instanceof TypeError && /fetch|network/i.test(e.message));
const offlineError=()=>Object.assign(new Error('This action needs an internet connection.'),{isNetworkError:true});
function operationKind(path,method) {
  if(path==='/notes' && method==='POST')return 'create';
  if(path==='/notes/reorder' && method==='POST')return 'reorder';
  if(/^\/notes\/[^/]+\/archive$/.test(path) && method==='POST')return 'archive';
  if(/^\/notes\/[^/]+$/.test(path) && ['PUT','PATCH','DELETE'].includes(method))return method==='DELETE'?'delete':'update';
  return null;
}

export function createOfflineClient({request,session,isOnline=()=>navigator.onLine}) {
  const syncing=new Map();
  async function flush() {
    const auth=session();if(!auth?.user?.id || !isOnline())return;
    const userId=auth.user.id;if(syncing.has(userId))return syncing.get(userId);
    const task=(async()=>{
      const blocked=new Set();
      while(isOnline() && session()?.user?.id===userId) {
        const state=await accountState(userId);const op=state.ops.find(o=>!state.conflicts[o.noteId] && !blocked.has(o.noteId));if(!op)break;
        try {
          const saved=await request(op.path,{method:op.method,body:op.body,token:session().token,operationId:op.id});
          await accountState(userId,s=>{
            s.ops=s.ops.filter(o=>o.id!==op.id);
            const revision=saved?.revision ?? (op.body?.revision!==undefined?op.body.revision+1:null);
            const delta=revision!==null && op.localRevision!==null?revision-op.localRevision:0;
            for(const next of s.ops.filter(o=>o.noteId===op.noteId)) {
              if(next.body?.revision!==undefined)next.body.revision+=delta;
              if(next.localRevision!==null)next.localRevision+=delta;
            }
            const pending=s.ops.some(o=>o.noteId===op.noteId);
            if(!pending && saved?.id && saved.revision)s.notes=s.notes.map(n=>n.id===op.noteId?saved:n);
            else s.notes=s.notes.map(n=>n.id===op.noteId?{...n,revision:n.revision+delta,pending}:n);
          });
          emit();
        }catch(error){
          if(networkFailure(error) || error.status===401)break;
          const latest=error.note || (await request(`/notes/${op.noteId}`,{token:session().token}).catch(()=>null));
          await accountState(userId,s=>{s.conflicts[op.noteId]={message:error.message,serverNote:latest,localNote:s.notes.find(n=>n.id===op.noteId) || op.localNote,operation:op};});
          blocked.add(op.noteId);emit();
        }
      }
    })();
    syncing.set(userId,task);try{await task;}finally{syncing.delete(userId);emit();}
  }
  async function queue(path,options,id) {
    const auth=session(),method=options.method || 'GET',kind=operationKind(path,method);
    if(!auth?.user?.id || !kind)throw offlineError();
    const result=await accountState(auth.user.id,s=>{
      const body={...(options.body || {})};const noteId=kind==='create'?String(body.id || crypto.randomUUID()):path.split('/')[2];
      const previous=s.notes.find(n=>String(n.id)===noteId);let local;
      if(kind==='create') {body.id=noteId;local={...body,id:noteId,user_id:auth.user.id,revision:1,archived:false,items:body.items || [],tags:body.tags || [],images:body.images || [],type:body.type || 'text',pinned:!!body.pinned,timestamp:body.timestamp || new Date().toISOString(),pending:true};s.notes.push(local);}
      else if(kind==='reorder') {const now=Date.now();for(const [key,pinned] of [['pinnedIds',true],['otherIds',false]])(body[key] || []).forEach((id,index)=>{s.notes=s.notes.map(n=>n.id===id?{...n,pinned,position:now-index}:n);});}
      else {
        if(!previous)throw new Error('Open this note online once before editing it offline.');
        if(body.revision!==undefined && body.revision!==previous.revision)throw Object.assign(new Error('Another local edit changed this note. Reload before retrying.'),{status:409});
        body.revision=previous.revision;
        if(kind==='delete'){s.notes=s.notes.filter(n=>n.id!==noteId);local=previous;}
        else {local={...previous,...body,revision:previous.revision+1,updated_at:new Date().toISOString(),pending:true};s.notes=s.notes.map(n=>n.id===noteId?local:n);}
      }
      s.ops.push({id,noteId,kind,path,method,body,localNote:local || null,localRevision:kind==='delete' || kind==='reorder'?null:local.revision});
      return kind==='delete' || kind==='reorder'?{ok:true,pending:true}:local;
    });emit();return result;
  }
  async function cached(path,options) {
    const auth=session();if(!auth?.user?.id)throw offlineError();
    const state=await accountState(auth.user.id);
    if(path==='/notes')return state.notes.filter(n=>!n.archived);
    if(path==='/notes/archived')return state.notes.filter(n=>n.archived);
    if(/^\/notes\/[^/]+$/.test(path)){const found=state.notes.find(n=>n.id===path.split('/')[2]);if(found)return found;}
    throw offlineError();
  }
  async function api(path,options={}) {
    const auth=session(),method=options.method || 'GET',kind=operationKind(path,method),operationId=kind?crypto.randomUUID():undefined;
    const isAccountRequest=auth?.token && options.token===auth.token;
    if(isAccountRequest && kind) {
      const state=await accountState(auth.user.id);
      if(!isOnline() || state.ops.length){const result=await queue(path,options,operationId);if(isOnline())void flush();return result;}
    }
    if(isAccountRequest && !isOnline())return method==='GET'?cached(path,options):queue(path,options,operationId);
    try {
      const result=await request(path,{...options,operationId});
      if(isAccountRequest && path.startsWith('/notes')) {
        return await accountState(auth.user.id,s=>{
          const pending=new Set(s.ops.map(o=>o.noteId));
          if(method==='GET' && ['/notes','/notes/archived'].includes(path) && Array.isArray(result)) {
            const archived=path.endsWith('/archived');
            s.notes=[...s.notes.filter(n=>n.archived!==archived || pending.has(n.id)),...result.filter(n=>!pending.has(n.id))];
            return s.notes.filter(n=>!!n.archived===archived);
          }
          if(result?.id && result.revision && !pending.has(result.id)){s.notes=s.notes.filter(n=>n.id!==result.id);s.notes.push(result);}
          if(kind==='delete')s.notes=s.notes.filter(n=>n.id!==path.split('/')[2]);
          if(kind==='archive')s.notes=s.notes.map(n=>n.id===path.split('/')[2]?{...n,archived:!!options.body.archived,revision:n.revision+1}:n);
          return result;
        });
      }
      return result;
    }catch(error){if(isAccountRequest && networkFailure(error)){return method==='GET'?cached(path,options):queue(path,options,operationId);}throw error;}
  }
  async function resolveConflict(noteId,choice) {
    const auth=session();if(!isOnline())throw offlineError();
    const latest=await request(`/notes/${noteId}`,{token:auth.token}).catch(e=>{if(e.status===404)return null;throw e;});
    await accountState(auth.user.id,s=>{
      const conflict=s.conflicts[noteId];if(!conflict)return;
      const local=s.notes.find(n=>n.id===noteId) || conflict.localNote;
      const deletion=s.ops.filter(o=>o.noteId===noteId).at(-1)?.kind==='delete';
      s.ops=s.ops.filter(o=>o.noteId!==noteId);delete s.conflicts[noteId];s.notes=s.notes.filter(n=>n.id!==noteId);
      if(choice==='server'){if(latest)s.notes.push(latest);return;}
      if(deletion && !latest)return;
      const method=deletion?'DELETE':latest?'PATCH':'POST',id=crypto.randomUUID();
      const body=deletion?{revision:latest.revision}:{...local,revision:latest?.revision,id:latest?.id || crypto.randomUUID()};
      const target=latest?.id || body.id;
      if(!deletion)s.notes.push({...body,pending:true,revision:latest?latest.revision+1:1});
      s.ops.push({id,noteId:target,path:latest?`/notes/${target}`:'/notes',method,body,localNote:local,localRevision:deletion?null:latest?latest.revision+1:1});
    });emit();await flush();
  }
  if(typeof window!=='undefined')window.addEventListener('online',()=>{void flush();});
  return {api,flush,resolveConflict,state:()=>session()?.user?.id?accountState(session().user.id):Promise.resolve(empty())};
}
