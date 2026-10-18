// Remove authenticated responses stored by older Glass Keep service workers.
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all(['notes-cache', 'api-cache'].map(name => caches.delete(name))));
});
