import React from 'react';

export default function LoadingScreen() {
  return <main className="startup-screen" role="status" aria-live="polite">
    <img src="/pwa-192.png" alt="" width="80" height="80"/>
    <span className="startup-spinner" aria-hidden="true"/>
    <p><span className="startup-en">Loading Glass Keep…</span><span className="startup-de">Glass Keep wird geladen…</span><span className="startup-hi">Glass Keep लोड हो रहा है…</span><span className="startup-fr">Chargement de Glass Keep…</span><span className="startup-ru">Загрузка Glass Keep…</span></p>
  </main>;
}
