const crypto = require('crypto');

function fingerprint(note) {
  const items = typeof note.items_json === 'string' ? JSON.parse(note.items_json) : (note.items || []);
  const images = typeof note.images_json === 'string' ? JSON.parse(note.images_json) : (note.images || []);
  const tags = typeof note.tags_json === 'string' ? JSON.parse(note.tags_json) : (note.tags || []);
  const ids = new Map(items.map((item, index) => [String(item.id), index]));
  return crypto.createHash('sha256').update(JSON.stringify({
    type: note.type || 'text', title: String(note.title || '').trim(), content: String(note.content || ''),
    items: items.map(i => ({ text: i.text || '', done: !!i.done, parent: ids.get(String(i.parentId)) ?? null })),
    tags: [...new Set(tags.map(t => String(t).toLowerCase().trim()))].sort(),
    images: images.map(i => i.src || ''),
  })).digest('hex');
}

function installNoteFeatures(app, { db, auth, serializeNote, broadcastNoteUpdated }) {
  db.exec(`CREATE TABLE IF NOT EXISTS note_share_links (
    note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, expires_at TEXT
  );
  CREATE TABLE IF NOT EXISTS note_mutations (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    operation_id TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL,
    status INTEGER NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
    PRIMARY KEY(user_id,operation_id)
  );`);
  // Outbox acknowledgments must remain replayable until a disconnected client returns.
  app.use('/api/notes', auth, (req, res, next) => {
    const operationId = req.headers['x-operation-id'];
    const operationPath = req.originalUrl.split('?')[0];
    if (!operationId || req.method === 'GET') return next();
    if (typeof operationId !== 'string' || !/^[\w-]{16,100}$/.test(operationId)) return res.status(400).json({error:'Invalid operation identifier'});
    const previous = db.prepare('SELECT * FROM note_mutations WHERE user_id=? AND operation_id=?').get(req.user.id,operationId);
    if (previous) {
      if (previous.method !== req.method || previous.path !== operationPath) return res.status(409).json({error:'Operation identifier already used'});
      return res.status(previous.status).json(JSON.parse(previous.response_json));
    }
    const originalJson = res.json.bind(res);
    // All note routes are synchronous; nested better-sqlite3 transactions use savepoints.
    db.exec('SAVEPOINT offline_operation');
    let finished = false;
    res.json = body => {
      if (!finished) {
        if (res.statusCode < 400) {
          db.prepare('INSERT INTO note_mutations VALUES(?,?,?,?,?,?,?)').run(req.user.id,operationId,req.method,operationPath,res.statusCode,JSON.stringify(body),new Date().toISOString());
          db.exec('RELEASE offline_operation');
        } else db.exec('ROLLBACK TO offline_operation; RELEASE offline_operation');
        finished = true;
      }
      return originalJson(body);
    };
    try { next(); } catch (error) {
      if (!finished) { db.exec('ROLLBACK TO offline_operation; RELEASE offline_operation'); finished = true; }
      next(error);
    }
  });
  app.get('/api/notes/duplicates', (req,res) => {
    const groups = new Map();
    for (const row of db.prepare('SELECT * FROM notes WHERE user_id=? ORDER BY timestamp,id').all(req.user.id)) {
      const hash = fingerprint(row); const group = groups.get(hash) || [];
      group.push({ id:row.id,title:row.title,archived:!!row.archived,timestamp:row.timestamp }); groups.set(hash,group);
    }
    res.json([...groups.values()].filter(group=>group.length>1));
  });
  app.get('/api/notes/:id', (req,res,next) => {
    if (['archived','export','collaborated','duplicates'].includes(req.params.id)) return next();
    const row=db.prepare('SELECT n.* FROM notes n WHERE n.id=? AND (n.user_id=? OR EXISTS(SELECT 1 FROM note_collaborators c WHERE c.note_id=n.id AND c.user_id=?))').get(req.params.id,req.user.id,req.user.id);
    return row ? res.json(serializeNote(row)) : res.status(404).json({error:'Note not found'});
  });
  app.post('/api/notes/:id/share-link', (req,res) => {
    const row=db.prepare('SELECT * FROM notes WHERE id=? AND user_id=?').get(req.params.id,req.user.id);
    if (!row) return res.status(404).json({error:'Note not found'});
    const token=crypto.randomBytes(32).toString('base64url');
    const never = req.body?.days === null;
    const days=Number(req.body?.days ?? 7);
    if (!never && (!Number.isInteger(days) || days<1 || days>365)) return res.status(400).json({error:'Choose an expiry between 1 and 365 days, or never'});
    const expiresAt=never ? null : new Date(Date.now()+days*86400000).toISOString();
    db.prepare('INSERT OR REPLACE INTO note_share_links VALUES(?,?,?,?)').run(row.id,crypto.createHash('sha256').update(token).digest('hex'),new Date().toISOString(),expiresAt);
    res.json({token,expiresAt});
  });
  app.delete('/api/notes/:id/share-link', (req,res) => {
    if (!db.prepare('SELECT id FROM notes WHERE id=? AND user_id=?').get(req.params.id,req.user.id)) return res.status(404).json({error:'Note not found'});
    db.prepare('DELETE FROM note_share_links WHERE note_id=?').run(req.params.id); res.json({ok:true});
  });
  app.get('/api/public-notes/:token', (req,res) => {
    if (!/^[\w-]{43}$/.test(req.params.token)) return res.status(404).json({error:'Link unavailable'});
    const row=db.prepare('SELECT n.* FROM notes n JOIN note_share_links s ON s.note_id=n.id WHERE s.token_hash=? AND (s.expires_at IS NULL OR s.expires_at>?)').get(crypto.createHash('sha256').update(req.params.token).digest('hex'),new Date().toISOString());
    if (!row) return res.status(404).json({error:'Link unavailable or expired'});
    const note=serializeNote(row);
    res.json({id:note.id,type:note.type,title:note.title,content:note.content,items:note.items,images:note.images,color:note.color});
  });
}
module.exports={fingerprint,installNoteFeatures};
