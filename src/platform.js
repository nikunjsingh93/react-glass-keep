export const isNative = import.meta.env?.VITE_NATIVE === 'true';
export const SERVER_KEY = 'glass-keep-native-server';
export function normalizeServer(value) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Enter the server origin only, for example https://keep.example.com.');
  }
  return url.origin;
}
const selectedServer = isNative ? localStorage.getItem(SERVER_KEY) || '' : '';
export const serverOrigin = () => isNative ? selectedServer : location.origin;
export const storageKey = key => isNative ? `${key}@${encodeURIComponent(serverOrigin())}` : key;
export const ownsStorageKey = key => key.includes('glass-keep-') && (!isNative || key.endsWith(`@${encodeURIComponent(serverOrigin())}`));
export const serverLink = hash => `${serverOrigin()}/${hash}`;

export async function appFetch(input, options = {}) {
  if (!isNative || typeof input !== 'string' || !input.startsWith('/api/')) return fetch(input, options);
  const { invoke } = await import('@tauri-apps/api/core');
  const headers = Object.fromEntries(new Headers(options.headers).entries());
  const request = invoke('api_request', {server: options.server || serverOrigin(), path: input, method: options.method || 'GET', headers, body: options.body || null});
  let abort;
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new DOMException('Request aborted', 'AbortError'));
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, {once: true});
  });
  try {
    const result = await (options.signal ? Promise.race([request, cancelled]) : request);
    const bytes = Uint8Array.from(atob(result.body), c => c.charCodeAt(0));
    return new Response([204,205,304].includes(result.status) ? null : bytes, {status: result.status, headers: result.headers});
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw Object.assign(new TypeError(typeof error === 'string' ? error : 'Network request failed.'), {isNetworkError: true});
  } finally { options.signal?.removeEventListener('abort', abort); }
}

export async function openExternal(url) {
  const parsed = new URL(url);
  if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) throw new Error('This link type is not supported.');
  if (isNative) { const {openUrl} = await import('@tauri-apps/plugin-opener'); await openUrl(parsed.toString()); }
  else window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
}

export async function saveBlob(blob, filename) {
  if (isNative) {
    const [{save}, {writeFile}] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
    const path = await save({defaultPath: filename});
    if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text) {
  if (isNative) {const {writeText} = await import('@tauri-apps/plugin-clipboard-manager'); await writeText(text);}
  else await navigator.clipboard.writeText(text);
}

export async function confirmAction(message) {
  if (isNative) { const {ask} = await import('@tauri-apps/plugin-dialog'); return ask(message, {title:'Glass Keep', kind:'warning'}); }
  return window.confirm(message);
}
