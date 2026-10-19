import React,{useEffect,useState} from 'react';
import {Dialog} from './FeaturePanels';
import {t} from './i18n';
import {appFetch,isNative,serverLink,openExternal,saveBlob,confirmAction} from './platform';

export default function CloudBackupDialog({api,token,onClose,onImport}) {
  const [connections,setConnections]=useState(null),[days,setDays]=useState({}),[error,setError]=useState(()=>new URLSearchParams(window.location.hash.split('?')[1] || '').has('cloudBackupError') ? t('Cloud connection could not be completed. Try again or ask the server owner to check the cloud setup.') : ''),[message,setMessage]=useState(''),[busy,setBusy]=useState('');
  const refresh=async()=>{
    const result=await api('/cloud-backup',{token});setConnections(result.connections);
    setDays(previous=>Object.fromEntries(result.connections.map(c=>[c.provider,previous[c.provider] ?? c.days])));
  };
  useEffect(()=>{if(/cloudBackup(?:Error)?=/.test(window.location.hash))window.history.replaceState(null,'',`${location.pathname}${location.search}#/notes`);let alive=true;
    const update=()=>{if(alive)refresh().catch(e=>setError(e.message));};update();
    const timer=setInterval(update,10000);return()=>{alive=false;clearInterval(timer);};
  },[token]);
  const action=async(key,fn)=>{setBusy(key);setError('');setMessage('');try{await fn();await refresh();}catch(e){setError(e.message);}finally{setBusy('');}};
  const date=value=>value?new Date(value).toLocaleString():t('Not yet');
  return <Dialog title={t('Cloud backup')} onClose={onClose}>
    <p>{t('Back up your own notes and attachments to your cloud account. Download a ZIP from your cloud folder and import it into Glass Keep whenever needed.')}</p>
    <p className="text-sm my-3">{t('The latest three successful versions are kept for each connected provider. Unchanged notes do not create another copy. Backups contain readable notes; keep the cloud folder private.')}</p>
    {!connections && !error && <p>{t('Loading…')}</p>}
    {connections?.map(connection=><section key={connection.provider} className="border border-[var(--border-light)] rounded-lg p-4 my-4">
      <h3 className="font-semibold">{connection.name}</h3>
      <p className="text-sm my-2">{t(connection.connected?'Connected':'Not connected')}</p>
      <label className="flex items-center gap-3">{t('Back up every')}
        <select aria-label={`${connection.name}: ${t('Back up every')}`} value={days[connection.provider] || 7} onChange={e=>setDays(previous=>({...previous,[connection.provider]:Number(e.target.value)}))} className="themed-select rounded-lg p-2">
          {[1,7,30].map(value=><option key={value} value={value}>{t(value===1?'1 day':value===7?'7 days':'30 days')}</option>)}
        </select>
      </label>
      {!connection.available && <p className="text-sm my-3">{t('This provider has not been enabled on this server. Ask the server owner to complete cloud connection setup.')}</p>}
      {connection.connected && <div className="text-sm my-3 space-y-1">
        <p>{t('Last successful backup')}: {date(connection.lastSuccess)}</p>
        <p>{t('Last check')}: {date(connection.lastChecked)}</p>
        <p>{t('Next check')}: {date(connection.nextRun)}</p>
        {connection.running && <p role="status">{t('Backup running…')}</p>}
        {connection.unchanged && !connection.running && <p>{t('No changes since the last saved version.')}</p>}
        {connection.error && <p role="alert" className="text-red-600">{connection.error}</p>}
      </div>}
      <div className="flex flex-wrap gap-3 mt-3">
        <button className="border border-[var(--border-light)] rounded px-3 py-2 disabled:opacity-50" disabled={!connection.available || !!busy || connection.running} onClick={()=>action(connection.provider,async()=>{
          if(isNative){await openExternal(serverLink('#/notes?cloudBackup=manage'));setMessage('Sign in to the same account in your browser to connect your cloud provider, then return here.');return;}
          const result=await api(`/cloud-backup/connect/${connection.provider}`,{method:'POST',token,body:{days:days[connection.provider] || 7}});
          window.location.assign(result.url);
        })}>{t(connection.connected?'Reconnect':'Connect')}</button>
        {connection.connected && <>
          <button className="border border-[var(--border-light)] rounded px-3 py-2 disabled:opacity-50" disabled={!!busy || connection.running} onClick={()=>action(connection.provider,async()=>{await api(`/cloud-backup/${connection.provider}`,{method:'PUT',token,body:{days:days[connection.provider]}});setMessage(t('Backup schedule saved.'));})}>{t('Save schedule')}</button>
          <button className="bg-indigo-600 text-white rounded px-3 py-2 disabled:opacity-50" disabled={!connection.available || !!busy || connection.running} onClick={()=>action(connection.provider,async()=>{await api(`/cloud-backup/${connection.provider}/run`,{method:'POST',token});setMessage(t('Backup started. Status updates automatically.'));})}>{t(busy===connection.provider?'Working…':'Back up now')}</button>
          <button className="underline disabled:opacity-50" disabled={!!busy} onClick={()=>action(connection.provider,async()=>{if(!await confirmAction(t('Disconnect this cloud account? Existing cloud backups will be kept.')))return;await api(`/cloud-backup/${connection.provider}`,{method:'DELETE',token});})}>{t('Disconnect')}</button>
        </>}
      </div>
    </section>)}
    <div className="flex flex-wrap gap-3 my-4">
      <button className="border border-[var(--border-light)] rounded px-3 py-2 disabled:opacity-50" disabled={!!busy} onClick={()=>action('download',async()=>{
        const response=await appFetch('/api/cloud-backup/download',{headers:{Authorization:`Bearer ${token}`}});
        if(!response.ok){const result=await response.json();throw new Error(result.error || t('Backup download failed.'));}
        await saveBlob(await response.blob(),`glass-keep-notes-${new Date().toISOString().slice(0,10)}.zip`);
      })}>{t('Download backup ZIP')}</button>
      <button className="border border-[var(--border-light)] rounded px-3 py-2" onClick={()=>{onClose();onImport();}}>{t('Import backup')}</button>
    </div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-600">{error}</p>}
  </Dialog>;
}
