import React, {useState, useEffect, Suspense, lazy} from 'react';
import {appFetch, normalizeServer, SERVER_KEY, serverOrigin} from './platform';

const App = lazy(() => import('./App.jsx'));
export default function NativeRoot() {
  const [server] = useState(serverOrigin), [editing, setEditing] = useState(!server), [value, setValue] = useState(server);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(()=>{const change=()=>{setValue(server);setError('');setEditing(true);};window.addEventListener('change-server',change);return()=>window.removeEventListener('change-server',change);},[server]);
  const connect = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const previous = localStorage.getItem(SERVER_KEY);
    try {
      const next = normalizeServer(value);
      const response = await appFetch('/api/health', {server:next});
      const health = await response.json();
      if (!response.ok || health.ok !== true || typeof health.version !== 'string') throw new Error('This address did not return a Glass Keep server.');
      // Reload creates a fresh network client and an isolated offline database for this server.
      localStorage.setItem(SERVER_KEY, next); location.reload();
    } catch (e) {
      if (previous) localStorage.setItem(SERVER_KEY, previous); else localStorage.removeItem(SERVER_KEY);
      setError(e.message || String(e)); setBusy(false);
    }
  };
  if (editing) return <main className="native-connect">
    <form onSubmit={connect}><img src="/pwa-192.png" alt="" width="72" height="72"/><h1>Glass Keep</h1>
      <p>Connect to your Glass Keep server. Your notes stay on your server and sync across your devices.</p>
      <label htmlFor="server-address">Server address</label>
      <input id="server-address" type="url" required placeholder="https://keep.example.com" value={value} onChange={e => setValue(e.target.value)} autoCapitalize="none" autoCorrect="off"/>
      <p className="native-hint">Use HTTPS with a publicly trusted certificate. HTTP is available for trusted local networks; traffic is unencrypted. Certificate verification stays enabled.</p>
      {server && <p className="native-hint">Switching servers keeps each server's login and offline edits separate. Return to the same address to sync pending changes.</p>}
      {error && <p role="alert">{error}</p>}<button disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
      {server && <button type="button" onClick={() => setEditing(false)}>Cancel</button>}
      <small>Glass Keep app · 1.0.2 · Requires your existing Glass Keep server</small>
    </form>
  </main>;
  return <div className="native-app"><Suspense fallback={<p className="p-6">Loading Glass Keep…</p>}><App/></Suspense></div>;
}
