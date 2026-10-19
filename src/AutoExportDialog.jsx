import React,{useState} from 'react';
import {Dialog} from './FeaturePanels';
import {t} from './i18n';
import {isNative} from './platform';

export default function AutoExportDialog({backup,onClose,onImport}) {
  const {settings,busy,configure,download}=backup;
  const [folderError,setFolderError]=useState(''),[choosing,setChoosing]=useState(false);
  const date=value=>value?new Date(value).toLocaleString():t('Not yet');
  return <Dialog title={t('Automatic JSON export')} onClose={onClose}>
    <p>{t('Download your own notes and attachments as a portable JSON file. Sync the download folder yourself with Syncthing or another service.')}</p>
    <section className="border border-[var(--border-light)] rounded-lg p-3 my-4">
      <p className="font-medium">{t('Export folder')}</p>
      <p className="text-sm break-all my-2">{settings.folder?.name || t(isNative?'Downloads / Glass Keep':'Browser download location')}</p>
      {backup.canChooseFolder&&<button disabled={busy||choosing} className="border border-[var(--border-light)] rounded px-3 py-2 disabled:opacity-50" onClick={async()=>{setFolderError('');setChoosing(true);try{await backup.chooseFolder();}catch(error){setFolderError(error.message);}finally{setChoosing(false);}}}>{t('Choose export folder')}</button>}
      {settings.folder&&<button disabled={busy||choosing} className="underline mx-3" onClick={()=>backup.useDownloads().catch(error=>setFolderError(error.message))}>{t('Use Downloads')}</button>}
      {!backup.canChooseFolder&&<p className="text-sm">{t('This browser does not support folder selection. Change its download location in browser settings, or use a native app.')}</p>}
      {folderError&&<p role="alert" className="text-red-600">{folderError}</p>}
    </section>
    <label className="flex items-center gap-3 my-4">{t('Export every')}
      <select aria-label={t('Export every')} className="themed-select rounded-lg p-2" value={settings.days} disabled={busy||choosing} onChange={event=>configure(Number(event.target.value))}>
        {[0,1,7,30].map(days=><option key={days} value={days}>{t(days===0?'Off':days===1?'1 day':days===7?'7 days':'30 days')}</option>)}
      </select>
    </label>
    <p className="text-sm my-3">{t('Exports run while Glass Keep is open and signed in. An overdue export runs when you return. This schedule is saved separately for each account on this device.')}</p>
    <p className="text-sm my-3">{t(isNative?'Files save to your chosen folder, or Downloads / Glass Keep by default. On Android 7–9, choose a folder for automatic exports.':'Choose a folder in a supported browser for direct saves. Otherwise allow automatic downloads for this site and check the browser downloads list to confirm each file was saved.')}</p>
    <p>{t(isNative||settings.folder?'Last saved export':'Last export requested')}: {date(settings.lastRun)}</p>
    {!!settings.days&&<p>{t('Next export')}: {date(settings.nextRun)}</p>}
    {settings.error&&<p role="alert" className="text-red-600 my-3">{settings.error}</p>}
    <div className="flex flex-wrap gap-3 my-4">
      <button disabled={busy||choosing} className="bg-indigo-600 text-white rounded px-3 py-2 disabled:opacity-50" onClick={download}>{t(busy?'Working…':'Download JSON now')}</button>
      <button className="border border-[var(--border-light)] rounded px-3 py-2" onClick={()=>{onClose();onImport();}}>{t('Import backup')}</button>
    </div>
    <p className="text-sm">{t('Exports include synced notes, archived notes and attachments. Save and sync drafts first. Files are not encrypted; keep your backup folder private. Existing exports are kept until you remove them.')}</p>
  </Dialog>;
}
