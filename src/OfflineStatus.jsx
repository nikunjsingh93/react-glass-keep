import React,{useEffect,useState} from 'react';
import {t} from './i18n';
import {saveBlob} from './platform';
export default function OfflineStatus({client,onSynced}) {
  const [state,setState]=useState({ops:[],conflicts:{}}),[error,setError]=useState('');
  useEffect(()=>{const update=()=>client.state().then(setState).catch(e=>setError(e.message));update();window.addEventListener('outbox-changed',update);return()=>window.removeEventListener('outbox-changed',update);},[client]);
  if(!state.ops.length && !error)return null;
  return <aside className="fixed bottom-2 left-2 right-2 z-[10000] rounded-lg bg-amber-100 text-gray-900 shadow-xl p-3 max-h-64 overflow-auto" aria-label={t('Offline synchronization')}>
    <p>{t('Changes waiting to sync')}: {state.ops.length} <button className="underline ml-2" onClick={async()=>{try{await client.flush();await onSynced();}catch(e){setError(e.message);}}}>{t('Sync now')}</button></p>
    {Object.entries(state.conflicts).map(([id,c])=><div key={id} className="border-t pt-2 mt-2"><p>{c.localNote?.title || t('Untitled')}: {t('This note also changed on the server. Choose which version to keep.')}</p>
      <button className="underline mr-3" onClick={()=>{void saveBlob(new Blob([JSON.stringify({notes:[c.localNote]},null,2)],{type:'application/json'}),'unsynced-note.json').catch(e=>setError(e.message));}}>{t('Download my draft')}</button>
      {['server','local'].map(choice=><button key={choice} className="underline mr-3" onClick={async()=>{try{await client.resolveConflict(id,choice);await onSynced();}catch(e){setError(e.message);}}}>{t(choice==='server'?'Use server version':'Keep my changes')}</button>)}
    </div>)}{error && <p role="alert">{error}</p>}
  </aside>;
}
