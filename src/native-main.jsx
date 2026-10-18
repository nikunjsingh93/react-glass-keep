import React from 'react';
import {createRoot} from 'react-dom/client';
import NativeRoot from './NativeRoot';
import {openExternal} from './platform';
import './index.css';
import './native.css';
window.alert = text => {void import('@tauri-apps/plugin-dialog').then(({message}) => message(String(text), {title:'Glass Keep'}));};

// Keep all remote documents outside the privileged application webview.
document.addEventListener('click', event => {
  const anchor = event.target.closest?.('a[href]');
  if (anchor && /^(https?:|mailto:)/i.test(anchor.getAttribute('href'))) {
    event.preventDefault(); void openExternal(anchor.href).catch(e => window.alert(String(e)));
  }
});
createRoot(document.getElementById('root')).render(<NativeRoot/>);
