import {useEffect, useRef, useState, useCallback} from 'react';
import {storageKey} from './platform';

export default function useAccountAI({api, token, userId}) {
  const key = storageKey('account-ai-' + (userId ?? 'signed-out'));
  const [state, setState] = useState({key, enabled: false});
  const active = useRef({token, key, revision: 0});
  if (active.current.token !== token || active.current.key !== key) active.current = {token, key, revision: 0};
  const enabled = !!token && state.key === key && state.enabled;
  useEffect(() => {
    if (!token) return;
    const identity = active.current;
    let stopped = false, running = false;
    const accept = value => {
      if (stopped || active.current !== identity) return;
      setState({key, enabled: value});
      try { localStorage.setItem(key, String(value)); } catch {}
    };
    try { accept(localStorage.getItem(key) === 'true'); } catch {}
    const refresh = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      const revision = identity.revision;
      try {
        let result = await api('/account/preferences', {token});
        if (stopped || active.current !== identity || revision !== identity.revision) return;
        if (result.aiEnabled === null) {
          // Claim the old device preference once; never copy it into another account/server.
          let legacy = false;
          try {
            const owner = localStorage.getItem('legacy-ai-owner');
            if (!owner) localStorage.setItem('legacy-ai-owner', key);
            legacy = (!owner || owner === key) && localStorage.getItem('localAiEnabled') === 'true';
          } catch {}
          result = await api('/account/preferences', {method: 'PATCH', token, body: {aiEnabled: legacy, initializeOnly: true}});
        }
        if (revision === identity.revision && typeof result.aiEnabled === 'boolean') accept(result.aiEnabled);
      } catch { /* Keep the account cache while offline; retry on reconnect/focus. */ }
      finally { running = false; }
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    for (const event of ['focus', 'online']) window.addEventListener(event, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      stopped = true; clearInterval(timer);
      for (const event of ['focus', 'online']) window.removeEventListener(event, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [api, token, key]);
  const update = useCallback(async value => {
    if (!token) throw new Error('Please sign in');
    const identity = active.current;
    const revision = ++identity.revision;
    const result = await api('/account/preferences', {method: 'PATCH', token, body: {aiEnabled: value}});
    if (active.current === identity && identity.revision === revision) {
      setState({key, enabled: result.aiEnabled});
      try { localStorage.setItem(key, String(result.aiEnabled)); } catch {}
    }
  }, [api, token, key]);
  return [enabled, update];
}
