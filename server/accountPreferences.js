function installAccountPreferences(app, db, auth) {
  db.exec(`CREATE TABLE IF NOT EXISTS account_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ai_enabled INTEGER NOT NULL DEFAULT 0 CHECK(ai_enabled IN (0,1))
  )`);
  const read = id => {
    const row = db.prepare('SELECT ai_enabled FROM account_preferences WHERE user_id=?').get(id);
    return {aiEnabled: row ? !!row.ai_enabled : null};
  };
  app.get('/api/account/preferences', auth, (req, res) => res.json(read(req.user.id)));
  app.patch('/api/account/preferences', auth, (req, res) => {
    if (typeof req.body?.aiEnabled !== 'boolean' || (req.body.initializeOnly !== undefined && typeof req.body.initializeOnly !== 'boolean')) {
      return res.status(400).json({error: 'Invalid AI preference'});
    }
    const conflict = req.body.initializeOnly ? 'DO NOTHING' : 'DO UPDATE SET ai_enabled=excluded.ai_enabled';
    db.prepare(`INSERT INTO account_preferences(user_id,ai_enabled) VALUES(?,?) ON CONFLICT(user_id) ${conflict}`).run(req.user.id, Number(req.body.aiEnabled));
    res.json(read(req.user.id));
  });
}
module.exports = {installAccountPreferences};
