const LEGACY_CACHES = ['notes-cache', 'api-cache'];

export async function clearLegacyApiCaches() {
  if (!globalThis.caches) return;
  await Promise.all(LEGACY_CACHES.map(name => caches.delete(name)));
}
