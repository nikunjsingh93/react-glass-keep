import React from 'react';
import {Dialog} from './FeaturePanels';
import {t} from './i18n';
import {isNative} from './platform';

export default function AutoExportDialog({backup,onClose,onImport}) {
  const {settings,busy,configure,download}=backup;
  const date=value=>value?new Date(value).toLocaleString():t('Not yet');
  return <Dialog title={t('Automatic JSON export')} onClose={onClose}>
    <p>{t('Download your own notes and attachments as a portable JSON file. Sync the download folder yourself with Syncthing or another service.')}</p>
    <label className="flex items-center gap-3 my-4">{t('Export every')}
      <select aria-label={t('Export every')} className="themed-select rounded-lg p-2" value={settings.days} disabled={busy} onChange={event=>configure(Number(event.target.value))}>
        {[0,1,7,30].map(days=><option key={days} value={days}>{t(days===0?'Off':days===1?'1 day':days===7?'7 days':'30 days')}</option>)}
      </select>
    </label>
    <p className="text-sm my-3">{t('Exports run while Glass Keep is open and signed in. An overdue export runs when you return. This schedule is saved separately for each account on this device.')}</p>
    <p className="text-sm my-3">{t(isNative?'Files are saved in Downloads / Glass Keep. Automatic saving on Android requires Android 10 or newer.':'Files use your browser download location. Allow automatic downloads for this site. Your browser may ask where to save; check its downloads list to confirm the file was saved.')}</p>
    <p>{t(isNative?'Last saved export':'Last export requested')}: {date(settings.lastRun)}</p>
    {!!settings.days&&<p>{t('Next export')}: {date(settings.nextRun)}</p>}
    {settings.error&&<p role="alert" className="text-red-600 my-3">{settings.error}</p>}
    <div className="flex flex-wrap gap-3 my-4">
      <button disabled={busy} className="bg-indigo-600 text-white rounded px-3 py-2 disabled:opacity-50" onClick={download}>{t(busy?'Working…':'Download JSON now')}</button>
      <button className="border border-[var(--border-light)] rounded px-3 py-2" onClick={()=>{onClose();onImport();}}>{t('Import backup')}</button>
    </div>
    <p className="text-sm">{t('Exports include synced notes, archived notes and attachments. Save and sync drafts first. Files are not encrypted; keep your backup folder private. Existing exports are kept until you remove them.')}</p>
  </Dialog>;
}
