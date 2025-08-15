// server/index.js
// Express + SQLite (better-sqlite3) + JWT auth API for Glass Keep

const path = require("path");
const fs = require("fs");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";
const NODE_ENV = process.env.NODE_ENV || "development";

// ---------- Body parsing ----------
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// ---------- CORS (dev only) ----------
if (NODE_ENV !== "production") {
  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: false,
    })
  );
}

// ---------- SQLite ----------
const dbFile =
  process.env.DB_FILE ||
  process.env.SQLITE_FILE ||
  path.join(__dirname, "data.sqlite");

// Ensure the directory for the DB exists (helps on Windows/macOS + Docker bind mounts)
try {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
} catch (e) {
  console.error("Failed to ensure DB directory:", e);
}

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Fresh tables (safe if already exist)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  secret_key_hash TEXT,
  secret_key_created_at TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,          -- "text" | "checklist"
  title TEXT NOT NULL,
  content TEXT NOT NULL,       -- for text notes
  items_json TEXT NOT NULL,    -- JSON array for checklist items
  tags_json TEXT NOT NULL,     -- JSON string array
  images_json TEXT NOT NULL,   -- JSON image objects {id,src,name}
  color TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  position REAL NOT NULL DEFAULT 0, -- for ordering (higher first)
  timestamp TEXT NOT NULL,
  updated_at TEXT,             -- for tracking last edit time
  last_edited_by TEXT,         -- email/name of last editor
  last_edited_at TEXT,         -- timestamp of last edit
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_collaborators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  added_by INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  FOREIGN KEY(note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(added_by) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(note_id, user_id)
);
`);

// Tiny migrations (safe to run repeatedly)
(function ensureColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(users)`).all();
    const names = new Set(cols.map((c) => c.name));
    const tx = db.transaction(() => {
      if (!names.has("is_admin")) {
        db.exec(`ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`);
      }
      if (!names.has("secret_key_hash")) {
        db.exec(`ALTER TABLE users ADD COLUMN secret_key_hash TEXT`);
      }
      if (!names.has("secret_key_created_at")) {
        db.exec(`ALTER TABLE users ADD COLUMN secret_key_created_at TEXT`);
      }
    });
    tx();
  } catch {
    // ignore if ALTER not supported or already applied
  }
})();

// Notes table migrations
(function ensureNoteColumns() {
  try {
    const cols = db.prepare(`PRAGMA table_info(notes)`).all();
    const names = new Set(cols.map((c) => c.name));
    const tx = db.transaction(() => {
      if (!names.has("updated_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN updated_at TEXT`);
      }
      if (!names.has("last_edited_by")) {
        db.exec(`ALTER TABLE notes ADD COLUMN last_edited_by TEXT`);
      }
      if (!names.has("last_edited_at")) {
        db.exec(`ALTER TABLE notes ADD COLUMN last_edited_at TEXT`);
      }
      if (!names.has("archived")) {
        db.exec(`ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
      }
    });
    tx();
  } catch {
    // ignore if ALTER not supported or already applied
  }
})();

// Optionally promote admins from env (comma-separated)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// Function to promote user to admin if they're in the admin list
function promoteToAdminIfNeeded(email) {
  if (ADMIN_EMAILS.length && ADMIN_EMAILS.includes(email.toLowerCase())) {
    const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
    mkAdmin.run(email.toLowerCase());
    console.log(`Promoted user ${email} to admin`);
    return true;
  }
  return false;
}

// Promote existing users to admin on startup
if (ADMIN_EMAILS.length) {
  console.log(`Admin emails configured: ${ADMIN_EMAILS.join(', ')}`);
  const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
  for (const e of ADMIN_EMAILS) {
    const result = mkAdmin.run(e);
    if (result.changes > 0) {
      console.log(`Promoted existing user ${e} to admin`);
    }
  }
}

// ---------- Helpers ----------
const nowISO = () => new Date().toISOString();
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function signToken(user) {
  return jwt.sign(
    {
      uid: user.id,
      email: user.email,
      name: user.name,
      is_admin: !!user.is_admin,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.uid,
      email: payload.email,
      name: payload.name,
      is_admin: !!payload.is_admin,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Auth that also supports token in query string for EventSource
function authFromQueryOrHeader(req, res, next) {
  const h = req.headers.authorization || "";
  const headerToken = h.startsWith("Bearer ") ? h.slice(7) : null;
  const queryToken = req.query && typeof req.query.token === "string" ? req.query.token : null;
  const token = headerToken || queryToken;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.uid,
      email: payload.email,
      name: payload.name,
      is_admin: !!payload.is_admin,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

const insertUser = db.prepare(
  "INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)"
);
const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const getNoteById = db.prepare("SELECT * FROM notes WHERE id = ?");

// Notes statements
const listNotes = db.prepare(
  `SELECT * FROM notes WHERE user_id = ? AND archived = 0 ORDER BY pinned DESC, position DESC, timestamp DESC`
);
const listArchivedNotes = db.prepare(
  `SELECT * FROM notes WHERE user_id = ? AND archived = 1 ORDER BY timestamp DESC`
);
const listNotesPage = db.prepare(
  `SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, position DESC, timestamp DESC LIMIT ? OFFSET ?`
);
const getNote = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?");
const getNoteWithCollaboration = db.prepare(`
  SELECT n.* FROM notes n
  LEFT JOIN note_collaborators nc ON n.id = nc.note_id AND nc.user_id = ?
  WHERE n.id = ? AND (n.user_id = ? OR nc.user_id IS NOT NULL)
`);
const insertNote = db.prepare(`
  INSERT INTO notes (id,user_id,type,title,content,items_json,tags_json,images_json,color,pinned,position,timestamp,archived)
  VALUES (@id,@user_id,@type,@title,@content,@items_json,@tags_json,@images_json,@color,@pinned,@position,@timestamp,0)
`);
const updateNote = db.prepare(`
  UPDATE notes SET
    type=@type, title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
    images_json=@images_json, color=@color, pinned=@pinned, position=@position, timestamp=@timestamp
  WHERE id=@id AND user_id=@user_id
`);
const updateNoteWithCollaboration = db.prepare(`
  UPDATE notes SET
    type=@type, title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
    images_json=@images_json, color=@color, pinned=@pinned, position=@position, timestamp=@timestamp
  WHERE id=@id AND (user_id=@user_id OR EXISTS(
    SELECT 1 FROM note_collaborators nc 
    WHERE nc.note_id=@id AND nc.user_id=@user_id
  ))
`);
const patchPartial = db.prepare(`
  UPDATE notes SET title=COALESCE(@title,title),
                   content=COALESCE(@content,content),
                   items_json=COALESCE(@items_json,items_json),
                   tags_json=COALESCE(@tags_json,tags_json),
                   images_json=COALESCE(@images_json,images_json),
                   color=COALESCE(@color,color),
                   pinned=COALESCE(@pinned,pinned),
                   timestamp=COALESCE(@timestamp,timestamp)
  WHERE id=@id AND user_id=@user_id
`);
const patchPartialWithCollaboration = db.prepare(`
  UPDATE notes SET title=COALESCE(@title,title),
                   content=COALESCE(@content,content),
                   items_json=COALESCE(@items_json,items_json),
                   tags_json=COALESCE(@tags_json,tags_json),
                   images_json=COALESCE(@images_json,images_json),
                   color=COALESCE(@color,color),
                   pinned=COALESCE(@pinned,pinned),
                   timestamp=COALESCE(@timestamp,timestamp)
  WHERE id=@id AND (user_id=@user_id OR EXISTS(
    SELECT 1 FROM note_collaborators nc 
    WHERE nc.note_id=@id AND nc.user_id=@user_id
  ))
`);
const patchPosition = db.prepare(`
  UPDATE notes SET position=@position, pinned=@pinned WHERE id=@id AND user_id=@user_id
`);
const deleteNote = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?");

// Collaboration statements
const getUserByEmail = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)");
const getUserByName = db.prepare("SELECT * FROM users WHERE lower(name)=lower(?)");
const addCollaborator = db.prepare(`
  INSERT INTO note_collaborators (note_id, user_id, added_by, added_at)
  VALUES (?, ?, ?, ?)
`);
const getNoteCollaborators = db.prepare(`
  SELECT u.id, u.name, u.email, nc.added_at, nc.added_by
  FROM note_collaborators nc
  JOIN users u ON nc.user_id = u.id
  WHERE nc.note_id = ?
`);
const getCollaboratedNotes = db.prepare(`
  SELECT n.* FROM notes n
  JOIN note_collaborators nc ON n.id = nc.note_id
  WHERE nc.user_id = ?
  ORDER BY n.pinned DESC, n.position DESC, n.timestamp DESC
`);
const updateNoteWithEditor = db.prepare(`
  UPDATE notes SET 
    updated_at = ?, 
    last_edited_by = ?, 
    last_edited_at = ?
  WHERE id = ?
`);

// ---------- Realtime (SSE) ----------
// Map of userId -> Set of response streams
const sseClients = new Map();

function addSseClient(userId, res) {
  let set = sseClients.get(userId);
  if (!set) {
    set = new Set();
    sseClients.set(userId, set);
  }
  set.add(res);
}

function removeSseClient(userId, res) {
  const set = sseClients.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) sseClients.delete(userId);
}

function sendEventToUser(userId, event) {
  const set = sseClients.get(userId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  const toRemove = [];
  for (const res of set) {
    try {
      res.write(payload);
    } catch (error) {
      // Remove dead connections
      toRemove.push(res);
    }
  }
  // Clean up dead connections
  for (const res of toRemove) {
    removeSseClient(userId, res);
  }
}

function getCollaboratorUserIdsForNote(noteId) {
  try {
    const rows = getNoteCollaborators.all(noteId) || [];
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

function broadcastNoteUpdated(noteId) {
  try {
    const note = getNoteById.get(noteId);
    if (!note) return;
    const recipientIds = new Set([note.user_id, ...getCollaboratorUserIdsForNote(noteId)]);
    const evt = { type: "note_updated", noteId };
    for (const uid of recipientIds) sendEventToUser(uid, evt);
  } catch {}
}

app.get("/api/events", authFromQueryOrHeader, (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Help Nginx/Proxies not to buffer SSE
  try { res.setHeader("X-Accel-Buffering", "no"); } catch {}
  // If served cross-origin (e.g. static site + separate API host), allow EventSource
  if (req.headers.origin) {
    try { res.setHeader("Access-Control-Allow-Origin", req.headers.origin); } catch {}
  }
  res.flushHeaders?.();

  // Initial hello
  res.write(`event: hello\n`);
  res.write(`data: {"ok":true}\n\n`);

  addSseClient(req.user.id, res);

  // Keepalive ping
  const ping = setInterval(() => {
    try { 
      res.write("event: ping\ndata: {}\n\n"); 
    } catch (error) {
      clearInterval(ping);
      removeSseClient(req.user.id, res);
      try { res.end(); } catch {}
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(ping);
    removeSseClient(req.user.id, res);
    try { res.end(); } catch {}
  });
});

// ---------- Auth ----------
app.post("/api/register", (req, res) => {
  // Check if new account creation is allowed
  if (!adminSettings.allowNewAccounts) {
    return res.status(403).json({ error: "New account creation is currently disabled." });
  }
  
  const { name, email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });
  if (getUserByEmail.get(email))
    return res.status(409).json({ error: "Email already registered." });

  const hash = bcrypt.hashSync(password, 10);
  const info = insertUser.run(name?.trim() || "User", email.trim(), hash, nowISO());
  
  // Check if this user should be promoted to admin
  const promoted = promoteToAdminIfNeeded(email.trim());
  
  const user = getUserById.get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
  });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? getUserByEmail.get(email) : null;
  if (!user) return res.status(401).json({ error: "No account found for that email." });
  if (!bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin },
  });
});

// ---------- Secret Key (Recovery) ----------
function generateSecretKey(bytes = 32) {
  const buf = crypto.randomBytes(bytes);
  try {
    return buf.toString("base64url");
  } catch {
    return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
}

const updateSecretForUser = db.prepare(
  "UPDATE users SET secret_key_hash = ?, secret_key_created_at = ? WHERE id = ?"
);
const getUsersWithSecret = db.prepare(
  "SELECT id, name, email, is_admin, secret_key_hash FROM users WHERE secret_key_hash IS NOT NULL"
);

// Create/rotate a user's secret key
app.post("/api/secret-key", auth, (req, res) => {
  const key = generateSecretKey(32);
  const hash = bcrypt.hashSync(key, 10);
  updateSecretForUser.run(hash, nowISO(), req.user.id);
  res.json({ key });
});

// Login with secret key
app.post("/api/login/secret", (req, res) => {
  const { key } = req.body || {};
  if (!key || typeof key !== "string" || key.length < 16) {
    return res.status(400).json({ error: "Invalid key." });
  }
  const rows = getUsersWithSecret.all();
  for (const u of rows) {
    if (u.secret_key_hash && bcrypt.compareSync(key, u.secret_key_hash)) {
      const token = signToken(u);
      return res.json({
        token,
        user: { id: u.id, name: u.name, email: u.email, is_admin: !!u.is_admin },
      });
    }
  }
  return res.status(401).json({ error: "Secret key not recognized." });
});

// ---------- Notes ----------
app.get("/api/notes", auth, (req, res) => {
  const off = Number(req.query.offset ?? 0);
  const lim = Number(req.query.limit ?? 0);
  const usePaging = Number.isFinite(lim) && lim > 0 && Number.isFinite(off) && off >= 0;
  
  // Get all notes (own + collaborated) in a single query to avoid duplicates
  const allNotesQuery = db.prepare(`
    SELECT DISTINCT n.* FROM notes n
    WHERE (n.user_id = ? OR EXISTS(
      SELECT 1 FROM note_collaborators nc 
      WHERE nc.note_id = n.id AND nc.user_id = ?
    )) AND n.archived = 0
    ORDER BY n.pinned DESC, n.position DESC, n.timestamp DESC
  `);
  
  const allNotesWithPagingQuery = db.prepare(`
    SELECT DISTINCT n.* FROM notes n
    WHERE (n.user_id = ? OR EXISTS(
      SELECT 1 FROM note_collaborators nc 
      WHERE nc.note_id = n.id AND nc.user_id = ?
    )) AND n.archived = 0
    ORDER BY n.pinned DESC, n.position DESC, n.timestamp DESC
    LIMIT ? OFFSET ?
  `);
  
  const rows = usePaging 
    ? allNotesWithPagingQuery.all(req.user.id, req.user.id, lim, off)
    : allNotesQuery.all(req.user.id, req.user.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(r.tags_json || "[]"),
      images: JSON.parse(r.images_json || "[]"),
      color: r.color,
      pinned: !!r.pinned,
      position: r.position,
      timestamp: r.timestamp,
      updated_at: r.updated_at,
      lastEditedBy: r.last_edited_by,
      lastEditedAt: r.last_edited_at,
      archived: !!r.archived,
    }))
  );
});

app.post("/api/notes", auth, (req, res) => {
  const body = req.body || {};
  const n = {
    id: body.id || uid(),
    user_id: req.user.id,
    type: body.type === "checklist" ? "checklist" : "text",
    title: String(body.title || ""),
    content: body.type === "checklist" ? "" : String(body.content || ""),
    items_json: JSON.stringify(Array.isArray(body.items) ? body.items : []),
    tags_json: JSON.stringify(Array.isArray(body.tags) ? body.tags : []),
    images_json: JSON.stringify(Array.isArray(body.images) ? body.images : []),
    color: body.color && typeof body.color === "string" ? body.color : "default",
    pinned: body.pinned ? 1 : 0,
    position: typeof body.position === "number" ? body.position : Date.now(),
    timestamp: body.timestamp || nowISO(),
  };
  insertNote.run(n);
  res.status(201).json({
    id: n.id,
    type: n.type,
    title: n.title,
    content: n.content,
    items: JSON.parse(n.items_json),
    tags: JSON.parse(n.tags_json),
    images: JSON.parse(n.images_json),
    color: n.color,
    pinned: !!n.pinned,
    position: n.position,
    timestamp: n.timestamp,
  });
});

app.put("/api/notes/:id", auth, (req, res) => {
  const id = req.params.id;
  const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Note not found" });

  const b = req.body || {};
  const updated = {
    id,
    user_id: req.user.id,
    type: b.type === "checklist" ? "checklist" : "text",
    title: String(b.title || ""),
    content: b.type === "checklist" ? "" : String(b.content || ""),
    items_json: JSON.stringify(Array.isArray(b.items) ? b.items : []),
    tags_json: JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
    images_json: JSON.stringify(Array.isArray(b.images) ? b.images : []),
    color: b.color && typeof b.color === "string" ? b.color : "default",
    pinned: b.pinned ? 1 : 0,
    position: typeof b.position === "number" ? b.position : existing.position,
    timestamp: b.timestamp || existing.timestamp,
  };
  // Use collaboration-aware update
  const result = updateNoteWithCollaboration.run(updated);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }
  
  // Update editor tracking (store display name)
  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  res.json({ ok: true });
});

app.patch("/api/notes/:id", auth, (req, res) => {
  const id = req.params.id;
  const existing = getNoteWithCollaboration.get(req.user.id, id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Note not found" });
  const p = {
    id,
    user_id: req.user.id,
    title: typeof req.body.title === "string" ? String(req.body.title) : null,
    content: typeof req.body.content === "string" ? String(req.body.content) : null,
    items_json: Array.isArray(req.body.items) ? JSON.stringify(req.body.items) : null,
    tags_json: Array.isArray(req.body.tags) ? JSON.stringify(req.body.tags) : null,
    images_json: Array.isArray(req.body.images) ? JSON.stringify(req.body.images) : null,
    color: typeof req.body.color === "string" ? req.body.color : null,
    pinned: typeof req.body.pinned === "boolean" ? (req.body.pinned ? 1 : 0) : null,
    timestamp: req.body.timestamp || null,
  };
  // Use collaboration-aware patch
  const result = patchPartialWithCollaboration.run(p);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }
  
  // Update editor tracking (store display name)
  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  
  res.json({ ok: true });
});

app.delete("/api/notes/:id", auth, (req, res) => {
  deleteNote.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Reorder within sections
app.post("/api/notes/reorder", auth, (req, res) => {
  const { pinnedIds = [], otherIds = [] } = req.body || {};
  const base = Date.now();
  const step = 1;
  const reorder = db.transaction(() => {
    for (let i = 0; i < pinnedIds.length; i++) {
      patchPosition.run({
        id: pinnedIds[i],
        user_id: req.user.id,
        position: base + step * (pinnedIds.length - i),
        pinned: 1,
      });
    }
    for (let i = 0; i < otherIds.length; i++) {
      patchPosition.run({
        id: otherIds[i],
        user_id: req.user.id,
        position: base - step * (i + 1),
        pinned: 0,
      });
    }
  });
  reorder();
  res.json({ ok: true });
});

// ---------- Collaboration ----------
app.post("/api/notes/:id/collaborate", auth, (req, res) => {
  const noteId = req.params.id;
  const { username } = req.body || {};
  
  if (!username || typeof username !== "string") {
    return res.status(400).json({ error: "Username is required" });
  }
  
  // Check if note exists and user owns it
  const note = getNote.get(noteId, req.user.id);
  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }
  
  // Find user to collaborate with (by email or name)
  const collaborator = getUserByEmail.get(username) || getUserByName.get(username);
  if (!collaborator) {
    return res.status(404).json({ error: "User not found" });
  }
  
  // Don't allow self-collaboration
  if (collaborator.id === req.user.id) {
    return res.status(400).json({ error: "Cannot collaborate with yourself" });
  }
  
  try {
    // Add collaborator
    addCollaborator.run(noteId, collaborator.id, req.user.id, nowISO());
    
    // Update note with editor info
    updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), noteId);
    broadcastNoteUpdated(noteId);
    
    res.json({ 
      ok: true, 
      message: `Added ${collaborator.name} as collaborator`,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        email: collaborator.email
      }
    });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: "User is already a collaborator" });
    }
    return res.status(500).json({ error: "Failed to add collaborator" });
  }
});

app.get("/api/notes/:id/collaborators", auth, (req, res) => {
  const noteId = req.params.id;
  
  // Check if note exists and user owns it or is a collaborator
  const note = getNoteWithCollaboration.get(req.user.id, noteId, req.user.id);
  if (!note) {
    return res.status(404).json({ error: "Note not found" });
  }
  
  const collaborators = getNoteCollaborators.all(noteId);
  res.json(collaborators.map(c => ({
    id: c.id,
    name: c.name,
    email: c.email,
    added_at: c.added_at,
    added_by: c.added_by
  })));
});

app.get("/api/notes/collaborated", auth, (req, res) => {
  const rows = getCollaboratedNotes.all(req.user.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(r.tags_json || "[]"),
      images: JSON.parse(r.images_json || "[]"),
      color: r.color,
      pinned: !!r.pinned,
      position: r.position,
      timestamp: r.timestamp,
      updated_at: r.updated_at,
      lastEditedBy: r.last_edited_by,
      lastEditedAt: r.last_edited_at,
    }))
  );
});

// Archive/Unarchive notes
app.post("/api/notes/:id/archive", auth, (req, res) => {
  const id = req.params.id;
  const { archived } = req.body || {};
  
  // Check if note exists and user owns it
  const existing = getNote.get(id, req.user.id);
  if (!existing) {
    return res.status(404).json({ error: "Note not found" });
  }
  
  // Update archived status
  const updateArchived = db.prepare(`
    UPDATE notes SET archived = ? WHERE id = ? AND user_id = ?
  `);
  
  const result = updateArchived.run(archived ? 1 : 0, id, req.user.id);
  
  if (result.changes === 0) {
    return res.status(404).json({ error: "Note not found or access denied" });
  }
  
  // Update editor tracking
  updateNoteWithEditor.run(nowISO(), req.user.name || req.user.email, nowISO(), id);
  broadcastNoteUpdated(id);
  
  res.json({ ok: true });
});

// Get archived notes
app.get("/api/notes/archived", auth, (req, res) => {
  const rows = listArchivedNotes.all(req.user.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(r.tags_json || "[]"),
      images: JSON.parse(r.images_json || "[]"),
      color: r.color,
      pinned: !!r.pinned,
      position: r.position,
      timestamp: r.timestamp,
      updated_at: r.updated_at,
      lastEditedBy: r.last_edited_by,
      lastEditedAt: r.last_edited_at,
      archived: !!r.archived,
    }))
  );
});

// Export/Import
app.get("/api/notes/export", auth, (req, res) => {
  const rows = listNotes.all(req.user.id);
  res.json({
    app: "glass-keep",
    version: 1,
    user: req.user.email,
    exportedAt: nowISO(),
    notes: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content: r.content,
      items: JSON.parse(r.items_json || "[]"),
      tags: JSON.parse(r.tags_json || "[]"),
      images: JSON.parse(r.images_json || "[]"),
      color: r.color,
      pinned: !!r.pinned,
      position: r.position,
      timestamp: r.timestamp,
    })),
  });
});

app.post("/api/notes/import", auth, (req, res) => {
  const payload = req.body || {};
  const src = Array.isArray(payload.notes)
    ? payload.notes
    : Array.isArray(payload)
    ? payload
    : [];
  if (!src.length) return res.status(400).json({ error: "No notes to import." });

  const rows = listNotes.all(req.user.id);
  const existing = new Set(rows.map((r) => r.id));

  const tx = db.transaction((arr) => {
    for (const n of arr) {
      const id = existing.has(String(n.id)) ? uid() : String(n.id);
      existing.add(id);
      insertNote.run({
        id,
        user_id: req.user.id,
        type: n.type === "checklist" ? "checklist" : "text",
        title: String(n.title || ""),
        content: n.type === "checklist" ? "" : String(n.content || ""),
        items_json: JSON.stringify(Array.isArray(n.items) ? n.items : []),
        tags_json: JSON.stringify(Array.isArray(n.tags) ? n.tags : []),
        images_json: JSON.stringify(Array.isArray(n.images) ? n.images : []),
        color: typeof n.color === "string" ? n.color : "default",
        pinned: n.pinned ? 1 : 0,
        position: typeof n.position === "number" ? n.position : Date.now(),
        timestamp: n.timestamp || nowISO(),
      });
    }
  });
  tx(src);
  res.json({ ok: true, imported: src.length });
});

// ---------- Admin ----------
function adminOnly(req, res, next) {
  const row = getUserById.get(req.user.id);
  if (!row || !row.is_admin) return res.status(403).json({ error: "Admin only" });
  next();
}

// Admin settings storage (in-memory for now, could be moved to DB)
let adminSettings = {
  allowNewAccounts: true
};

// Get admin settings
app.get("/api/admin/settings", auth, adminOnly, (_req, res) => {
  res.json(adminSettings);
});

// Update admin settings
app.patch("/api/admin/settings", auth, adminOnly, (req, res) => {
  const { allowNewAccounts } = req.body || {};
  
  if (typeof allowNewAccounts === 'boolean') {
    adminSettings.allowNewAccounts = allowNewAccounts;
  }
  
  res.json(adminSettings);
});

// Check if new account creation is allowed (public endpoint)
app.get("/api/admin/allow-registration", (_req, res) => {
  res.json({ allowNewAccounts: adminSettings.allowNewAccounts });
});

// Include a rough storage usage estimate (bytes) for each user
// This sums the LENGTH() of relevant TEXT columns across a user's notes.
// It’s an approximation (UTF-8 chars ≈ bytes, and data-URL images are strings).
const listAllUsers = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.created_at,
    u.is_admin,
    COUNT(n.id) AS notes,
    COALESCE(SUM(
      COALESCE(LENGTH(n.title),0) +
      COALESCE(LENGTH(n.content),0) +
      COALESCE(LENGTH(n.items_json),0) +
      COALESCE(LENGTH(n.tags_json),0) +
      COALESCE(LENGTH(n.images_json),0)
    ), 0) AS storage_bytes
  FROM users u
  LEFT JOIN notes n ON n.user_id = u.id
  GROUP BY u.id
  ORDER BY u.created_at DESC
`);

app.get("/api/admin/users", auth, adminOnly, (_req, res) => {
  const rows = listAllUsers.all();
  res.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      is_admin: !!r.is_admin,
      notes: Number(r.notes || 0),
      storage_bytes: Number(r.storage_bytes || 0),
      created_at: r.created_at,
    }))
  );
});

const deleteUserStmt = db.prepare("DELETE FROM users WHERE id = ?");
app.delete("/api/admin/users/:id", auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) {
    return res.status(400).json({ error: "You cannot delete yourself." });
  }
  const target = getUserById.get(id);
  if (!target) return res.status(404).json({ error: "User not found" });

  const adminCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE is_admin=1").get().c;
  if (target.is_admin && adminCount <= 1) {
    return res.status(400).json({ error: "Cannot delete the last admin." });
  }

  deleteUserStmt.run(id);
  res.json({ ok: true });
});

// Create user from admin panel
app.post("/api/admin/users", auth, adminOnly, (req, res) => {
  const { name, email, password, is_admin } = req.body || {};
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }
  
  if (getUserByEmail.get(email)) {
    return res.status(409).json({ error: "Email already registered." });
  }
  
  const hash = bcrypt.hashSync(password, 10);
  const info = insertUser.run(name.trim(), email.trim(), hash, nowISO());
  
  // Set admin status if specified
  if (is_admin) {
    const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE id=?");
    mkAdmin.run(info.lastInsertRowid);
  }
  
  const user = getUserById.get(info.lastInsertRowid);
  res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email,
    is_admin: !!user.is_admin,
    created_at: user.created_at,
  });
});

// ---------- Health ----------
app.get("/api/health", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

// ---------- Static (production) ----------
if (NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

// ---------- Listen ----------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}  (env=${NODE_ENV})`);
});
