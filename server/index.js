// server/index.js
// Express + SQLite (better-sqlite3) + JWT auth API for Glass Keep

const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-please-change";
const NODE_ENV = process.env.NODE_ENV || "development";

// JSON limits for image data URLs
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// In dev, allow Vite origin
if (NODE_ENV !== "production") {
  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: false,
    })
  );
}

// ---- SQLite ----
const dbFile =
  process.env.DB_FILE ||
  process.env.SQLITE_FILE ||
  path.join(__dirname, "data.sqlite");

const db = new Database(dbFile);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Create tables (fresh DB)
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
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// --- tiny migrations (safe on existing DBs) ---
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
  } catch (_) {
    // ignore if ALTER not supported or already applied
  }
})();

// Optionally promote admins from env
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
if (ADMIN_EMAILS.length) {
  const mkAdmin = db.prepare("UPDATE users SET is_admin=1 WHERE lower(email)=?");
  for (const e of ADMIN_EMAILS) mkAdmin.run(e);
}

// ---- Helpers ----
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

const getUserByEmail = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)");
const insertUser = db.prepare(
  "INSERT INTO users (name,email,password_hash,created_at) VALUES (?,?,?,?)"
);
const getUserById = db.prepare("SELECT * FROM users WHERE id = ?");

// Notes statements
const listNotes = db.prepare(
  `SELECT * FROM notes WHERE user_id = ? ORDER BY pinned DESC, position DESC, timestamp DESC`
);
const getNote = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?");
const insertNote = db.prepare(`
  INSERT INTO notes (id,user_id,type,title,content,items_json,tags_json,images_json,color,pinned,position,timestamp)
  VALUES (@id,@user_id,@type,@title,@content,@items_json,@tags_json,@images_json,@color,@pinned,@position,@timestamp)
`);
const updateNote = db.prepare(`
  UPDATE notes SET
    type=@type, title=@title, content=@content, items_json=@items_json, tags_json=@tags_json,
    images_json=@images_json, color=@color, pinned=@pinned, position=@position, timestamp=@timestamp
  WHERE id=@id AND user_id=@user_id
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
const patchPosition = db.prepare(`
  UPDATE notes SET position=@position, pinned=@pinned WHERE id=@id AND user_id=@user_id
`);
const deleteNote = db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?");

// ---- Auth routes ----
app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });
  if (getUserByEmail.get(email))
    return res.status(409).json({ error: "Email already registered." });

  const hash = bcrypt.hashSync(password, 10);
  const info = insertUser.run(name?.trim() || "User", email.trim(), hash, nowISO());
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

// ---- Secret Key Feature ----

// helper: generate a URL-safe random key (plaintext returned to user)
function generateSecretKey(bytes = 32) {
  const buf = crypto.randomBytes(bytes);
  try {
    return buf.toString("base64url");
  } catch {
    return buf
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }
}

const updateSecretForUser = db.prepare(
  "UPDATE users SET secret_key_hash = ?, secret_key_created_at = ? WHERE id = ?"
);

const getUsersWithSecret = db.prepare(
  "SELECT id, name, email, is_admin, secret_key_hash FROM users WHERE secret_key_hash IS NOT NULL"
);

// Auth required: create/rotate a new secret key for the current user
app.post("/api/secret-key", auth, (req, res) => {
  const key = generateSecretKey(32);
  const hash = bcrypt.hashSync(key, 10);
  updateSecretForUser.run(hash, nowISO(), req.user.id);
  res.json({ key });
});

// Login with secret key (no email/password)
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

// ---- Notes routes ----
app.get("/api/notes", auth, (req, res) => {
  const rows = listNotes.all(req.user.id);
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
  const existing = getNote.get(id, req.user.id);
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
  updateNote.run(updated);
  res.json({ ok: true });
});

app.patch("/api/notes/:id", auth, (req, res) => {
  const id = req.params.id;
  const existing = getNote.get(id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Note not found" });
  const p = {
    id,
    user_id: req.user.id,
    title: typeof req.body.title === "string" ? String(req.body.title) : null,
    content:
      typeof req.body.content === "string" ? String(req.body.content) : null,
    items_json: Array.isArray(req.body.items)
      ? JSON.stringify(req.body.items)
      : null,
    tags_json: Array.isArray(req.body.tags)
      ? JSON.stringify(req.body.tags)
      : null,
    images_json: Array.isArray(req.body.images)
      ? JSON.stringify(req.body.images)
      : null,
    color: typeof req.body.color === "string" ? req.body.color : null,
    pinned:
      typeof req.body.pinned === "boolean" ? (req.body.pinned ? 1 : 0) : null,
    timestamp: req.body.timestamp || null,
  };
  patchPartial.run(p);
  res.json({ ok: true });
});

app.delete("/api/notes/:id", auth, (req, res) => {
  deleteNote.run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// Reorder: pinnedIds, otherIds arrays define order (top to bottom)
app.post("/api/notes/reorder", auth, (req, res) => {
  const { pinnedIds = [], otherIds = [] } = req.body || {};
  const base = Date.now();
  const step = 1; // simple monotonically changing positions
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

// ---- Admin routes ----
function adminOnly(req, res, next) {
  // Optional: verify current admin bit in DB to avoid stale tokens
  const row = getUserById.get(req.user.id);
  if (!row || !row.is_admin) return res.status(403).json({ error: "Admin only" });
  next();
}

// Aggregates note size in bytes (roughly) per user
const listAllUsers = db.prepare(`
  SELECT
    u.id,
    u.name,
    u.email,
    u.created_at,
    u.is_admin,
    COUNT(n.id) AS notes,
    COALESCE(SUM(
      LENGTH(COALESCE(n.title, '')) +
      LENGTH(COALESCE(n.content, '')) +
      LENGTH(COALESCE(n.items_json, '')) +
      LENGTH(COALESCE(n.tags_json, '')) +
      LENGTH(COALESCE(n.images_json, ''))
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
      notes: r.notes,
      created_at: r.created_at,
      storage_bytes: r.storage_bytes || 0,
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

// Health (for diagnostics / compose)
app.get("/api/health", (_req, res) => res.json({ ok: true, env: NODE_ENV }));

// ---- Static (production) ----
if (NODE_ENV === "production") {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}  (env=${NODE_ENV})`);
});