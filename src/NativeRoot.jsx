import React, {useState, useEffect, Suspense, lazy} from 'react';
import {appFetch, normalizeServer, SERVER_KEY, serverOrigin} from './platform';
import LoadingScreen from './LoadingScreen';
import LanguagePicker from './LanguagePicker';
import {getLanguage,t} from './i18n';
import {version as appVersion} from '../package.json';

const App = lazy(() => import('./App.jsx'));
export default function NativeRoot() {
  const [server] = useState(serverOrigin), [editing, setEditing] = useState(!server), [value, setValue] = useState(server);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [,setLanguageVersion]=useState(getLanguage);
  useEffect(()=>{const changed=()=>setLanguageVersion(getLanguage());window.addEventListener('language-changed',changed);return()=>window.removeEventListener('language-changed',changed);},[]);
  useEffect(()=>{const change=()=>{setValue(server);setError('');setEditing(true);};window.addEventListener('change-server',change);return()=>window.removeEventListener('change-server',change);},[server]);
  const connect = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const previous = localStorage.getItem(SERVER_KEY);
    try {
      const next = normalizeServer(value);
      const response = await appFetch('/api/health', {server:next});
      const health = await response.json();
      if (!response.ok || health.ok !== true || typeof health.version !== 'string') throw new Error(t('This address did not return a Glass Keep server.'));
      // Reload creates a fresh network client and an isolated offline database for this server.
      localStorage.setItem(SERVER_KEY, next); location.reload();
    } catch (e) {
      if (previous) localStorage.setItem(SERVER_KEY, previous); else localStorage.removeItem(SERVER_KEY);
      setError(e.message || String(e)); setBusy(false);
    }
  };
  if (editing) return <main className="native-connect">
    <form onSubmit={connect}><LanguagePicker/><img src="/pwa-192.png" alt="" width="72" height="72"/><h1>Glass Keep</h1>
      <p>{t('Connect to your Glass Keep server. Your notes stay on your server and sync across your devices.')}</p>
      <label htmlFor="server-address">{t('Server address')}</label>
      <input id="server-address" type="url" required placeholder="https://keep.example.com" value={value} onChange={e => setValue(e.target.value)} autoCapitalize="none" autoCorrect="off"/>
      <p className="native-hint">{t('Use HTTPS with a publicly trusted certificate. HTTP is available for trusted local networks; traffic is unencrypted. Certificate verification stays enabled.')}</p>
      {server && <p className="native-hint">{t("Switching servers keeps each server's login and offline edits separate. Return to the same address to sync pending changes.")}</p>}
      {error && <p role="alert">{t(error)}</p>}<button disabled={busy}>{t(busy ? 'Connecting…' : 'Connect')}</button>
      {server && <button type="button" onClick={() => setEditing(false)}>{t('Cancel')}</button>}
      <small>{t('Glass Keep app')} · {appVersion} · {t('Requires your existing Glass Keep server')}</small>
    </form>
  </main>;
  return <div className="native-app"><Suspense fallback={<LoadingScreen/>}><App/></Suspense></div>;
}
