// Serialize writes per note and advance only revisions produced by our own writes.
// Remote revisions are never adopted automatically to retry a stale draft.
export function createNoteWriter(request) {
  const queues = new Map();
  const advances = new Map();
  return async function write(id, changes, revision) {
    const key = String(id);
    const previous = queues.get(key) || Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      const versions = advances.get(key) || new Map();
      let expected = revision;
      while (versions.has(expected)) expected = versions.get(expected);
      const saved = await request(key, { ...changes, revision: expected });
      versions.set(expected, saved.revision);
      advances.set(key, versions);
      return saved;
    });
    queues.set(key, pending);
    try { return await pending; }
    finally { if (queues.get(key) === pending) queues.delete(key); }
  };
}
