import React,{useState,useEffect} from 'react';
import {createPortal} from 'react-dom';
import {readKeepFiles,parseKeepEntries} from './keepImport';
import {importNoteBatches} from './importBackup';
import {renderMarkdown} from './markdown';
import {getLanguage,setLanguage,t} from './i18n';
import DrawingCanvas from './DrawingCanvas';
import {copyText,serverLink,confirmAction,isNative,serverOrigin} from './platform';

function SharedDrawing({content}) {
  let data;try{data=JSON.parse(content);}catch{return <p>{t('Drawing unavailable')}</p>;}
  return <DrawingCanvas data={data} readOnly hideModeToggle/>;
}

export function LanguagePicker() {return <label className="settings-card flex items-center justify-between gap-3 mb-4">{t('Language')}<select aria-label={t('Language')} value={getLanguage()} onChange={e=>setLanguage(e.target.value)} className="themed-select rounded-lg p-2"><option value="en">English</option><option value="hi">हिन्दी</option></select></label>;}
export function ConnectedServer() {
  if(!isNative)return null;
  return <section className="settings-card mb-4" aria-label={t('Server connection')}>
    <h4 className="font-medium mb-2">{t('Connected server')}</h4>
    <a className="block text-sm text-indigo-600 dark:text-indigo-300 underline break-all mb-3" href={serverOrigin()} target="_blank" rel="noreferrer">{serverOrigin()}</a>
    <button className="settings-action rounded-lg px-3 py-2 text-sm" onClick={()=>window.dispatchEvent(new Event('change-server'))}>{t('Change server')}</button>
  </section>;
}
export function Dialog({title,onClose,children}) {return createPortal(<div className="fixed inset-0 z-[10002] bg-black/50 p-4 flex items-center justify-center"><section role="dialog" aria-modal="true" aria-label={title} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-xl shadow-xl p-5 max-w-xl w-full max-h-[90vh] overflow-auto"><div className="flex justify-between gap-4 mb-4"><h2 className="text-xl font-bold">{title}</h2><button aria-label={t('Close')} onClick={onClose}>×</button></div>{children}</section></div>,document.body);}
export function KeepImportDialog({api,token,onClose,onImported}) {
  const [entries,setEntries]=useState(null),[onlyOwned,setOnlyOwned]=useState(true),[restoreSharing,setRestoreSharing]=useState(false),[deduplicate,setDeduplicate]=useState(true),[accountEmail,setAccountEmail]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[report,setReport]=useState(null);
  const preview=entries?parseKeepEntries(entries,{onlyOwned,accountEmail}):null;
  const choose=async files=>{try{setError('');setEntries(await readKeepFiles(files));setReport(null);}catch(e){setError(e.message);}};
  const run=async()=>{setBusy(true);setError('');try{
    const totals={imported:0,skipped:preview.skipped,sharingWarnings:[]};
    await importNoteBatches(preview.notes,async body=>{const result=await api('/notes/import',{method:'POST',token,body:{...body,deduplicate,restoreSharing}});totals.imported+=result.imported;totals.skipped+=result.skipped;totals.sharingWarnings.push(...(result.sharingWarnings || []));});
    setReport(totals);await onImported();
  }catch(e){setError(e.message);}finally{setBusy(false);}};
  return <Dialog title={t('Import Google Keep')} onClose={onClose}>
    <p>{t('Choose a Takeout ZIP or a folder containing JSON files and attachments.')}</p>
    <label className="block mt-3">{t('ZIP or JSON files')}<input aria-label={t('ZIP or JSON files')} type="file" accept=".zip,.json" multiple onChange={e=>choose(e.target.files)}/></label>
    <label className="block mt-3">{t('Takeout folder')}<input aria-label={t('Takeout folder')} type="file" webkitdirectory="" multiple onChange={e=>choose(e.target.files)}/></label>
    <label className="block my-3">{t('Google Keep account email')}<input value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} className="border border-[var(--border-light)] rounded p-2 bg-transparent w-full"/></label>
    <label className="block my-2"><input type="checkbox" checked={onlyOwned} onChange={e=>setOnlyOwned(e.target.checked)}/> {t('Import only notes I own')}</label>
    <label className="block my-2"><input type="checkbox" checked={deduplicate} onChange={e=>setDeduplicate(e.target.checked)}/> {t('Skip duplicate notes')}</label>
    <label className="block my-2"><input type="checkbox" checked={restoreSharing} onChange={e=>setRestoreSharing(e.target.checked)}/> {t('Recreate sharing with matching usernames or emails')}</label>
    {restoreSharing && <p className="text-sm">{t('This grants edit access to existing accounts whose username exactly matches a sharee email. Unmatched users are reported.')}</p>}
    {preview && <div className="my-3"><p>{t('Notes ready')}: {preview.notes.length} · {t('Skipped')}: {preview.skipped}</p><ul className="text-sm max-h-36 overflow-auto">{preview.notes.map(n=><li key={n.id}>{n.title || t('Untitled')} · {n.images.length} {t('images')}{restoreSharing && n.collaborators.length>0?` · ${n.collaborators.map(c=>c.email).join(', ')}`:''}</li>)}</ul>{preview.warnings.map((w,i)=><p key={i} className="text-amber-700">{w}</p>)}</div>}
    {report && <p role="status">{t('Imported')}: {report.imported} · {t('Skipped')}: {report.skipped}{report.sharingWarnings.length>0?` · ${t('Unmatched users')}: ${[...new Set(report.sharingWarnings)].join(', ')}`:''}</p>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
    <button className="bg-indigo-600 text-white rounded px-4 py-2 mt-4 disabled:opacity-50" disabled={busy || !preview?.notes.length || !!report} onClick={run}>{t(busy?'Importing…':'Import')}</button>
  </Dialog>;
}

export function DuplicateDialog({api,token,onClose,onChanged}) {
  const [groups,setGroups]=useState([]),[error,setError]=useState(''),[selected,setSelected]=useState([]);
  const load=()=>api('/notes/duplicates',{token}).then(setGroups).catch(e=>setError(e.message));
  useEffect(()=>{load();},[]);
  return <Dialog title={t('Find duplicates')} onClose={onClose}><p>{t('Review duplicate groups before deleting copies. The first note in each group is kept by Select extra copies.')}</p><button className="underline my-3" onClick={()=>setSelected(groups.flatMap(group=>group.slice(1).map(n=>n.id)))}>{t('Select extra copies')}</button>
    {groups.length===0 && <p>{t('No duplicate notes found.')}</p>}
    {groups.map((group,index)=><fieldset key={index} className="border border-[var(--border-light)] rounded p-3 my-3"><legend>{t('Duplicate group')} {index+1}</legend>{group.map(n=><label key={n.id} className="block"><input type="checkbox" checked={selected.includes(n.id)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,n.id]:prev.filter(id=>id!==n.id))}/> {n.title || t('Untitled')} {n.archived?`(${t('Archived')})`:''}</label>)}</fieldset>)}
    {error && <p role="alert">{error}</p>}<button disabled={!selected.length} className="bg-red-700 text-white p-2 rounded disabled:opacity-50" onClick={async()=>{if(!await confirmAction(t('Delete selected duplicate copies? This cannot be undone.')))return;try{for(const id of selected)await api(`/notes/${id}`,{method:'DELETE',token});setSelected([]);await load();await onChanged();}catch(e){setError(e.message);}}}>{t('Delete selected copies')}</button>
  </Dialog>;
}

export function NoteActions({note,api,token,onCopied,children}) {
  const [share,setShare]=useState(null),[error,setError]=useState(''),[privateLink,setPrivateLink]=useState('');
  const makeCopy=async()=>{
    try {
      const {id,user_id,revision,collaborators,updated_at,lastEditedAt,lastEditedBy,...copy}=note;
      const result=await api('/notes',{method:'POST',token,body:{...copy,title:`${copy.title || t('Untitled')} (${t('copy')})`,pinned:false}});
      onCopied(result);
    } catch(e){setError(e.message);}
  };
  const copyLink=async()=>{
    const url=serverLink(`#/notes/${encodeURIComponent(note.id)}`);
    try {await copyText(url);}catch{setPrivateLink(url);}
  };
  if(!note)return null;
  return <>
    {children({makeCopy,copyLink,openSharing:()=>{setError('');setShare({url:'',days:'7'});}})}
    {privateLink && <Dialog title={t('Copy note link')} onClose={()=>setPrivateLink('')}><p>{t('Only signed-in users who already have access can open this note link.')}</p><input aria-label={t('Note link')} className="border border-[var(--border-light)] rounded bg-transparent w-full p-2" readOnly value={privateLink} onFocus={e=>e.target.select()}/></Dialog>}
    {share && <Dialog title={t('Public read-only link')} onClose={()=>setShare(null)}>
      <p>{t('Anyone with this link can read this note and its attachments without signing in. Only the owner can create or revoke a link.')}</p>
      <label className="flex items-center gap-3 my-3">{t('Link expires')}
        <select aria-label={t('Link expires')} value={share.days} onChange={e=>setShare({...share,days:e.target.value})} className="border border-[var(--border-light)] rounded bg-transparent p-2">
          {[['1','1 day'],['7','7 days'],['30','30 days'],['90','90 days'],['365','1 year'],['never','Never']].map(([value,label])=><option key={value} value={value}>{t(label)}</option>)}
        </select>
      </label>
      {share.days==='never' && <p className="text-sm">{t('This link stays active until you revoke or replace it.')}</p>}
      <button className="block my-3 border rounded p-2" onClick={async()=>{try{const result=await api(`/notes/${note.id}/share-link`,{method:'POST',token,body:{days:share.days==='never'?null:Number(share.days)}});setShare({...share,url:serverLink(`#/share/${result.token}`)});setError('');}catch(e){setError(e.message);}}}>{t('Create or replace public link')}</button>
      {share.url && <input aria-label={t('Public link')} className="border border-[var(--border-light)] rounded bg-transparent w-full p-2" readOnly value={share.url} onFocus={e=>e.target.select()}/>}
      <button className="underline my-3" onClick={async()=>{try{await api(`/notes/${note.id}/share-link`,{method:'DELETE',token});setShare(null);setError('');}catch(e){setError(e.message);}}}>{t('Revoke public link')}</button>
      {error && <p role="alert">{error}</p>}
    </Dialog>}
    {error && !share && <Dialog title={t('More options')} onClose={()=>setError('')}><p role="alert">{error}</p></Dialog>}
  </>;
}
export function PublicNote({token,api}) {
  const [note,setNote]=useState(null),[error,setError]=useState('');
  useEffect(()=>{api(`/public-notes/${token}`).then(setNote).catch(e=>setError(e.message));},[token]);
  return <main className="max-w-3xl mx-auto p-6"><LanguagePicker/><p>{t('Shared read-only note')}</p>{error?<p role="alert">{error}</p>:note?<><h1 className="text-3xl font-bold my-4">{note.title}</h1>{note.type==='text'?<div className="note-content" dangerouslySetInnerHTML={{__html:renderMarkdown(note.content)}}/>:note.type==='checklist'?<ul>{note.items.map(i=><li key={i.id}>{i.done?'☑':'☐'} {i.text}</li>)}</ul>:<SharedDrawing content={note.content}/>}<div className="flex flex-wrap gap-2 my-4">{note.images.map(im=><img key={im.id} src={im.src} alt={im.name} className="max-w-full rounded"/>)}</div></>:<p>{t('Loading…')}</p>}</main>;
}
