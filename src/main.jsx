// src/main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.jsx';

// Register the PWA Service Worker (vite-plugin-pwa)
registerSW({
  immediate: true, // install/update SW ASAP
  // Optional callbacks:
  // onNeedRefresh() {},
  // onOfflineReady() {},
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
