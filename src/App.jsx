import React, { useEffect, useMemo, useRef, useState } from "react";
import { marked as markedParser } from "marked";

// Ensure we can call marked.parse(...)
const marked = typeof markedParser === "function" ? { parse: markedParser } : markedParser;

/** ---------- API Helpers ---------- */
const API_BASE = "/api";
const AUTH_KEY = "glass-keep-auth";

const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch {
    return null;
  }
};
const setAuth = (obj) => {
  if (obj) localStorage.setItem(AUTH_KEY, JSON.stringify(obj));
  else localStorage.removeItem(AUTH_KEY);
};
async function api(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** ---------- Colors ---------- */
const LIGHT_COLORS = {
  default: "rgba(255, 255, 255, 0.6)",
  red: "rgba(252, 165, 165, 0.6)",
  yellow: "rgba(253, 224, 71, 0.6)",
  green: "rgba(134, 239, 172, 0.6)",
  blue: "rgba(147, 197, 253, 0.6)",
  purple: "rgba(196, 181, 253, 0.6)",
};
const DARK_COLORS = {
  default: "rgba(40, 40, 40, 0.6)",
  red: "rgba(153, 27, 27, 0.6)",
  yellow: "rgba(154, 117, 21, 0.6)",
  green: "rgba(22, 101, 52, 0.6)",
  blue: "rgba(30, 64, 175, 0.6)",
  purple: "rgba(76, 29, 149, 0.6)",
};
const solid = (rgba) => (typeof rgba === "string" ? rgba.replace("0.6", "1") : rgba);
const bgFor = (colorKey, dark) =>
  (dark ? DARK_COLORS : LIGHT_COLORS)[colorKey] ||
  (dark ? DARK_COLORS.default : LIGHT_COLORS.default);

/** ---------- Modal light boost ---------- */
const parseRGBA = (str) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/.exec(str || "");
  if (!m) return { r: 255, g: 255, b: 255, a: 0.85 };
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? +m[4] : 1 };
};
const mixWithWhite = (rgbaStr, whiteRatio = 0.8, outAlpha = 0.92) => {
  const { r, g, b } = parseRGBA(rgbaStr);
  const rr = Math.round(255 * whiteRatio + r * (1 - whiteRatio));
  const gg = Math.round(255 * whiteRatio + g * (1 - whiteRatio));
  const bb = Math.round(255 * whiteRatio + b * (1 - whiteRatio));
  return `rgba(${rr}, ${gg}, ${bb}, ${outAlpha})`;
};
const modalBgFor = (colorKey, dark) => {
  const base = bgFor(colorKey, dark);
  if (dark) return base;
  return mixWithWhite(solid(base), 0.8, 0.92);
};

/** ---------- Icons ---------- */
const PinOutline = () => (
  <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
  </svg>
);
const PinFilled = () => (
  <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
       fill="currentColor">
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
  </svg>
);
const Trash = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.109 1.02.17M4.772 5.79c.338-.061.678-.118 1.02-.17m12.456 0L18.16 19.24A2.25 2.25 0 0 1 15.916 21.5H8.084A2.25 2.25 0 0 1 5.84 19.24L4.772 5.79m12.456 0a48.108 48.108 0 0 0-12.456 0M10 5V4a2 2 0 1 1 4 0v1" />
  </svg>
);
const Sun = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
  </svg>
);
const Moon = () => (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9 9 0 008.354-5.646z"/>
  </svg>
);
const ImageIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    <path d="M8 11l2.5 3 3.5-4 4 5" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
);
const CloseIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12"/>
  </svg>
);
const Kebab = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);

/** ---------- Utils ---------- */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const mdToPlain = (md) => {
  try {
    const html = marked.parse(md || "");
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const text = tmp.textContent || tmp.innerText || "";
    return text.replace(/\n{3,}/g, "\n\n");
  } catch {
    return md || "";
  }
};
const mdToPlainForDownload = (n) => {
  if (n.type === "text") return mdToPlain(n.content || "");
  const items = (n.items || []).map((it) => `${it.done ? "[x]" : "[ ]"} ${it.text || ""}`);
  return items.join("\n");
};
const sanitizeFilename = (name, fallback = "note") =>
  (name || fallback).toString().trim().replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 64);

/** ---------- Global CSS injection ---------- */
const globalCSS = `
:root {
  --bg-light: #f0f2f5;
  --bg-dark: #1a1a1a;
  --card-bg-light: rgba(255, 255, 255, 0.6);
  --card-bg-dark: rgba(40, 40, 40, 0.6);
  --text-light: #1f2937;
  --text-dark: #e5e7eb;
  --border-light: rgba(209, 213, 219, 0.3);
  --border-dark: rgba(75, 85, 99, 0.3);
}
html.dark {
  --bg-light: var(--bg-dark);
  --card-bg-light: var(--card-bg-dark);
  --text-light: var(--text-dark);
  --border-light: var(--border-dark);
}
body {
  background-color: var(--bg-light);
  color: var(--text-light);
  transition: background-color 0.3s ease, color 0.3s ease;
}
.glass-card {
  background-color: var(--card-bg-light);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-light);
  transition: all 0.3s ease;
  break-inside: avoid;
}
.note-content p { margin-bottom: 0.5rem; }
.note-content h1, .note-content h2, .note-content h3 {
  margin-bottom: 0.75rem; font-weight: 600;
}
.dragging { opacity: 0.5; transform: scale(1.05); }
.drag-over { outline: 2px dashed rgba(99,102,241,.6); outline-offset: 6px; }
.masonry-grid { column-gap: 1.5rem; column-count: 1; }
@media (min-width: 640px) { .masonry-grid { column-count: 2; } }
@media (min-width: 768px) { .masonry-grid { column-count: 3; } }
@media (min-width: 1024px) { .masonry-grid { column-count: 4; } }
@media (min-width: 1280px) { .masonry-grid { column-count: 5; } }
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.5); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.7); }

/* clamp for text preview */
.line-clamp-6 {
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* scrim blur */
.modal-scrim {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
`;

/** ---------- Image compression (client) ---------- */
async function fileToCompressedDataURL(file, maxDim = 1600, quality = 0.85) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", quality);
}

/** ---------- Shared UI pieces ---------- */
function ChecklistRow({ item, onToggle, onChange, onRemove, readOnly }) {
  return (
    <div className="flex items-start gap-2 group">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 cursor-pointer"
        checked={!!item.done}
        onChange={(e) => onToggle?.(e.target.checked)}
        disabled={!!readOnly}
      />
      {readOnly ? (
        <span className={`text-sm ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}>
          {item.text}
        </span>
      ) : (
        <input
          className={`flex-1 bg-transparent text-sm focus:outline-none border-b border-transparent focus:border-[var(--border-light)] pb-0.5 ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
          value={item.text}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder="List item"
        />
      )}
      {!readOnly && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-600"
          title="Remove item"
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}
const ColorDot = ({ name, selected, onClick, darkMode }) => (
  <button
    type="button"
    onClick={onClick}
    title={name}
    className={`w-6 h-6 rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${name === "default" ? "flex items-center justify-center" : ""} ${selected ? "ring-2 ring-indigo-500" : ""}`}
    style={{
      backgroundColor: name === "default" ? "transparent" : solid(bgFor(name, darkMode)),
      borderColor: name === "default" ? "#d1d5db" : "transparent",
    }}
  >
    {name === "default" && (
      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: darkMode ? "#1f2937" : "#fff" }} />
    )}
  </button>
);

/** ---------- Note Card ---------- */
function NoteCard({
  n, dark,
  openModal, togglePin,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}) {
  const isChecklist = n.type === "checklist";
  const previewText = useMemo(() => mdToPlain(n.content || ""), [n.content]);
  const MAX_CHARS = 600;
  const isLong = previewText.length > MAX_CHARS;
  const displayText = isLong ? previewText.slice(0, MAX_CHARS).trimEnd() + "…" : previewText;

  const total = (n.items || []).length;
  const done = (n.items || []).filter((i) => i.done).length;
  const visibleItems = (n.items || []).slice(0, 8);
  const extraCount = total > visibleItems.length ? total - visibleItems.length : 0;

  const imgs = n.images || [];
  const mainImg = imgs[0];

  const MAX_TAG_CHIPS = 4;
  const allTags = Array.isArray(n.tags) ? n.tags : [];
  const showEllipsisChip = allTags.length > MAX_TAG_CHIPS;
  const displayTags = allTags.slice(0, MAX_TAG_CHIPS);

  const group = n.pinned ? "pinned" : "others";

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(n.id, e)}
      onDragOver={(e) => onDragOver(n.id, group, e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(n.id, group, e)}
      onDragEnd={onDragEnd}
      onClick={() => openModal(n.id)}
      className="note-card glass-card rounded-xl p-4 mb-6 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative"
      style={{ backgroundColor: bgFor(n.color, dark) }}
      data-id={n.id}
      data-group={group}
    >
      <button
        aria-label={n.pinned ? "Unpin note" : "Pin note"}
        onClick={(e) => { e.stopPropagation(); togglePin(n.id, !n.pinned); }}
        className="absolute top-3 right-3 rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        title={n.pinned ? "Unpin" : "Pin"}
      >
        {n.pinned ? <PinFilled /> : <PinOutline />}
      </button>

      {n.title && <h3 className="font-bold text-lg mb-2 pr-10 break-words">{n.title}</h3>}

      {mainImg && (
        <div className="mb-3 relative overflow-hidden rounded-lg border border-[var(--border-light)]">
          <img src={mainImg.src} alt={mainImg.name || "note image"} className="w-full h-40 object-cover" />
          {imgs.length > 1 && (
            <span className="absolute bottom-2 right-2 text-xs bg-black/60 text-white px-2 py-0.5 rounded-full">
              +{imgs.length - 1} more
            </span>
          )}
        </div>
      )}

      {!isChecklist ? (
        <div className="text-sm break-words whitespace-pre-wrap line-clamp-6">
          {displayText}
        </div>
      ) : (
        <div className="space-y-2">
          {visibleItems.map((it) => <ChecklistRow key={it.id} item={it} readOnly />)}
          {extraCount > 0 && (
            <div className="text-xs text-gray-600 dark:text-gray-300">+{extraCount} more…</div>
          )}
          <div className="text-xs text-gray-600 dark:text-gray-300">{done}/{total} completed</div>
        </div>
      )}

      {!!displayTags.length && (
        <div className="mt-4 text-xs flex flex-wrap gap-2">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
          {showEllipsisChip && (
            <span className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
              …
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** ---------- Auth Shell ---------- */
function AuthShell({ title, dark, onToggleDark, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold">Glass Keep</h1>
          <p className="text-gray-500 dark:text-gray-400">{title}</p>
        </div>
        <div className="glass-card rounded-xl p-6 shadow-lg">{children}</div>
        <div className="mt-6 text-center">
          <button
            onClick={onToggleDark}
            className={`inline-flex items-center gap-2 text-sm ${dark ? "text-gray-300" : "text-gray-700"} hover:underline`}
            title="Toggle dark mode"
          >
            {dark ? <Moon /> : <Sun />} Toggle theme
          </button>
        </div>
      </div>
    </div>
  );
}

/** ---------- Login / Register ---------- */
function LoginView({ dark, onToggleDark, onLogin, goRegister }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await onLogin(email.trim(), pw);
      if (!res.ok) setErr(res.error || "Login failed");
    } catch (er) {
      setErr(er.message || "Login failed");
    }
  };

  return (
    <AuthShell title="Sign in to your account" dark={dark} onToggleDark={onToggleDark}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button type="submit" className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Sign In
        </button>
      </form>
      <div className="mt-4 text-sm text-center">
        Don’t have an account?{" "}
        <button className="text-indigo-600 hover:underline" onClick={goRegister}>
          Create one
        </button>
      </div>
    </AuthShell>
  );
}
function RegisterView({ dark, onToggleDark, onRegister, goLogin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    if (pw !== pw2) return setErr("Passwords do not match.");
    try {
      const res = await onRegister(name.trim() || "User", email.trim(), pw);
      if (!res.ok) setErr(res.error || "Registration failed");
    } catch (er) {
      setErr(er.message || "Registration failed");
    }
  };

  return (
    <AuthShell title="Create a new account" dark={dark} onToggleDark={onToggleDark}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="email"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Password (min 6 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Confirm password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button type="submit" className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Create Account
        </button>
      </form>
      <div className="mt-4 text-sm text-center">
        Already have an account?{" "}
        <button className="text-indigo-600 hover:underline" onClick={goLogin}>
          Sign in
        </button>
      </div>
    </AuthShell>
  );
}

/** ---------- NotesUI (presentational) ---------- */
function NotesUI({
  currentUser, dark, toggleDark,
  search, setSearch,
  composerType, setComposerType,
  title, setTitle,
  content, setContent, contentRef,
  clInput, setClInput, addComposerItem, clItems,
  composerImages, setComposerImages, composerFileRef,
  tags, setTags,
  composerColor, setComposerColor,
  addNote,
  pinned, others,
  openModal,
  onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
  togglePin,
  addImagesToState,
  onExportAll, onImportAll, importFileRef, signOut,
  filteredEmptyWithSearch, allEmpty,
  headerMenuOpen, setHeaderMenuOpen,
  headerMenuRef, headerBtnRef,
}) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="p-4 sm:p-6 flex justify-between items-center sticky top-0 z-20 glass-card mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Glass Keep</h1>

        <div className="flex-grow flex justify-center px-4 sm:px-8">
          <input
            type="text"
            placeholder="Search..."
            className="w-full max-w-lg bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="relative flex items-center gap-3">
          <span className={`text-sm hidden sm:inline ${dark ? "text-gray-100" : "text-gray-900"}`}>
            {currentUser?.name ? `Hi, ${currentUser.name}` : currentUser?.email}
          </span>
          <button
            onClick={toggleDark}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
            title="Toggle dark mode"
          >
            {dark ? <Moon /> : <Sun />}
          </button>

          {/* Header 3-dot menu */}
          <button
            ref={headerBtnRef}
            onClick={() => setHeaderMenuOpen((v) => !v)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
            title="Menu"
            aria-haspopup="menu"
            aria-expanded={headerMenuOpen}
          >
            <Kebab />
          </button>

          {headerMenuOpen && (
            <div
              ref={headerMenuRef}
              className={`absolute top-12 right-0 min-w-[200px] z-50 border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { onExportAll?.(); setHeaderMenuOpen(false); }}
              >
                Export notes (.json)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { importFileRef.current?.click(); setHeaderMenuOpen(false); }}
              >
                Import notes (.json)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "text-red-400 hover:bg-white/10" : "text-red-600 hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); signOut?.(); }}
              >
                Sign out
              </button>
            </div>
          )}

          {/* Hidden import input */}
          <input
            ref={importFileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportAll?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      </header>

      {/* Composer */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-12 max-w-2xl mx-auto">
        <div className="glass-card rounded-xl shadow-lg p-4 mb-8">
          {/* Type toggle */}
          <div className="mb-3 inline-flex rounded-lg border border-[var(--border-light)] overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm ${composerType === "text" ? "bg-indigo-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
              onClick={() => setComposerType("text")}
            >
              Note
            </button>
            <button
              className={`px-3 py-1.5 text-sm ${composerType === "checklist" ? "bg-indigo-600 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
              onClick={() => setComposerType("checklist")}
            >
              Checklist
            </button>
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-transparent text-lg font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-2 p-2"
          />

          {composerType === "text" ? (
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Take a note..."
              className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none p-2"
              rows={1}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={clInput}
                  onChange={(e) => setClInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComposerItem(); } }}
                  placeholder="List item… (press Enter to add)"
                  className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                />
                <button
                  onClick={addComposerItem}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>
              {clItems.length > 0 && (
                <div className="space-y-2">
                  {clItems.map((it) => (
                    <ChecklistRow key={it.id} item={it} readOnly />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Composer image thumbnails */}
          {composerImages.length > 0 && (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {composerImages.map((im) => (
                <div key={im.id} className="relative">
                  <img src={im.src} alt={im.name} className="h-16 w-24 object-cover rounded-md border border-[var(--border-light)]" />
                  <button
                    title="Remove image"
                    className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-5 h-5 text-xs"
                    onClick={() => setComposerImages((prev) => prev.filter((x) => x.id !== im.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Responsive composer footer */}
          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              type="text"
              placeholder="Add tags (comma-separated)"
              className="w-full sm:flex-1 bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
            />
            <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:flex-none">
              <div className="flex space-x-1 flex-shrink-0">
                {Object.keys(LIGHT_COLORS).map((name) => (
                  <ColorDot
                    key={name}
                    name={name}
                    darkMode={dark}
                    selected={composerColor === name}
                    onClick={() => setComposerColor(name)}
                  />
                ))}
              </div>

              {/* Add Image (composer) */}
              <input
                ref={composerFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  const results = [];
                  for (const f of files) {
                    try {
                      const src = await fileToCompressedDataURL(f);
                      results.push({ id: uid(), src, name: f.name });
                    } catch {}
                  }
                  if (results.length) setComposerImages((prev) => [...prev, ...results]);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => composerFileRef.current?.click()}
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 flex-shrink-0"
                title="Add images"
              >
                <ImageIcon />
              </button>

              {/* Add Note */}
              <button
                onClick={addNote}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors whitespace-nowrap flex-shrink-0"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notes lists */}
      <main className="px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
        {pinned.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
              Pinned
            </h2>
            <div className="masonry-grid">
              {pinned.map((n) => (
                <NoteCard
                  key={n.id}
                  n={n}
                  dark={dark}
                  openModal={openModal}
                  togglePin={togglePin}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section>
            {pinned.length > 0 && (
              <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                Others
              </h2>
            )}
            <div className="masonry-grid">
              {others.map((n) => (
                <NoteCard
                  key={n.id}
                  n={n}
                  dark={dark}
                  openModal={openModal}
                  togglePin={togglePin}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </section>
        )}

        {filteredEmptyWithSearch && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            No matching notes found.
          </p>
        )}
        {allEmpty && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            No notes yet. Add one to get started!
          </p>
        )}
      </main>
    </div>
  );
}

/** ---------- App ---------- */
export default function App() {
  const [route, setRoute] = useState(window.location.hash || "#/login");

  // auth session { token, user }
  const [session, setSession] = useState(getAuth());
  const token = session?.token;
  const currentUser = session?.user || null;

  // Theme
  const [dark, setDark] = useState(false);

  // Notes & search
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");

  // Composer
  const [composerType, setComposerType] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [composerColor, setComposerColor] = useState("default");
  const [composerImages, setComposerImages] = useState([]);
  const contentRef = useRef(null);
  const composerFileRef = useRef(null);

  // Checklist composer
  const [clItems, setClItems] = useState([]);
  const [clInput, setClInput] = useState("");

  // Modal state
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [mType, setMType] = useState("text");
  const [mTitle, setMTitle] = useState("");
  const [mBody, setMBody] = useState("");
  const [mTagList, setMTagList] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [mColor, setMColor] = useState("default");
  const [viewMode, setViewMode] = useState(true);
  const [mImages, setMImages] = useState([]);
  const mBodyRef = useRef(null);
  const modalFileRef = useRef(null);
  const [modalMenuOpen, setModalMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [mItems, setMItems] = useState([]);
  const [mInput, setMInput] = useState("");

  // Drag
  const dragId = useRef(null);
  const dragGroup = useRef(null);

  // Header menu refs + state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const headerBtnRef = useRef(null);
  const importFileRef = useRef(null); // hoisted ref

  useEffect(() => {
    function onDocClick(e) {
      if (!headerMenuOpen) return;
      const m = headerMenuRef.current;
      const b = headerBtnRef.current;
      if (m && m.contains(e.target)) return;
      if (b && b.contains(e.target)) return;
      setHeaderMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [headerMenuOpen]);

  // CSS inject
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = globalCSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Router
  useEffect(() => {
    const onHashChange = () => setRoute(window.location.hash || "#/login");
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const navigate = (to) => {
    if (window.location.hash !== to) window.location.hash = to;
    setRoute(to);
  };

  // Theme init/toggle
  useEffect(() => {
    const savedDark =
      localStorage.getItem("glass-keep-dark-mode") === "true" ||
      (!("glass-keep-dark-mode" in localStorage) &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
  }, []);
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("glass-keep-dark-mode", String(next));
  };

  // Load notes
  const loadNotes = async () => {
    if (!token) return;
    const data = await api("/notes", { token });
    setNotes(data);
  };
  useEffect(() => {
    if (token) loadNotes().catch(() => {});
  }, [token]);

  // Lock body scroll on modal
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Auto-resize composer textarea
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";
  }, [content, composerType]);

  // Auto-resize modal textarea
  const resizeModalTextarea = () => {
    const el = mBodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    const MIN = 160;
    el.style.height = Math.max(el.scrollHeight, MIN) + "px";
  };
  useEffect(() => {
    if (!open || mType !== "text") return;
    if (!viewMode) requestAnimationFrame(resizeModalTextarea);
  }, [open, viewMode, mBody, mType]);

  /** -------- Auth actions -------- */
  const signOut = () => {
    setAuth(null);
    setSession(null);
    setNotes([]);
    navigate("#/login");
  };
  const signIn = async (email, password) => {
    const res = await api("/login", { method: "POST", body: { email, password } });
    setSession(res);
    setAuth(res);
    navigate("#/notes");
    return { ok: true };
  };
  const register = async (name, email, password) => {
    const res = await api("/register", { method: "POST", body: { name, email, password } });
    setSession(res);
    setAuth(res);
    navigate("#/notes");
    return { ok: true };
  };

  /** -------- Composer helpers -------- */
  const addComposerItem = () => {
    const t = clInput.trim();
    if (!t) return;
    setClItems((prev) => [...prev, { id: uid(), text: t, done: false }]);
    setClInput("");
  };

  const addNote = async () => {
    if (composerType === "text") {
      if (!title.trim() && !content.trim() && !tags.trim() && composerImages.length === 0) return;
    } else {
      if (!title.trim() && clItems.length === 0) return;
    }
    const newNote = {
      id: uid(),
      type: composerType,
      title: title.trim(),
      content: composerType === "text" ? content : "",
      items: composerType === "checklist" ? clItems : [],
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      images: composerImages,
      color: composerColor,
      pinned: false,
      position: Date.now(),
      timestamp: new Date().toISOString(),
    };
    try {
      const created = await api("/notes", { method: "POST", body: newNote, token });
      setNotes((prev) => [created, ...prev]);
      // reset composer
      setTitle("");
      setContent("");
      setTags("");
      setComposerImages([]);
      setComposerColor("default");
      setClItems([]);
      setClInput("");
      if (contentRef.current) contentRef.current.style.height = "auto";
    } catch (e) {
      alert(e.message || "Failed to add note");
    }
  };

  /** -------- Download single note .txt -------- */
  const handleDownloadNote = (note) => {
    const title = note.title || "";
    const tags = (note.tags || []).join(", ");
    const body = mdToPlainForDownload(note);
    const imagesLine =
      (note.images && note.images.length)
        ? `\n\nImages attached: ${note.images.length}${note.images.some(i=>i.name) ? " (" + note.images.map(i=>i.name).join(", ") + ")" : ""}`
        : "";
    const header = title ? `${title}\n\n` : "";
    const tagsLine = tags ? `Tags: ${tags}\n\n` : "";
    const content = `${header}${tagsLine}${body}${imagesLine}\n`;
    const fname = sanitizeFilename(title || `note-${note.id}`) + ".txt";
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = fname; document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  /** -------- Export / Import All -------- */
  const triggerJSONDownload = (filename, jsonText) => {
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a);
    a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    try {
      const payload = await api("/notes/export", { token });
      const json = JSON.stringify(payload, null, 2);
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname = sanitizeFilename(`glass-keep-notes-${currentUser?.email || "user"}-${ts}`) + ".json";
      triggerJSONDownload(fname, json);
    } catch (e) {
      alert(e.message || "Export failed");
    }
  };

  const importAll = async (fileList) => {
    try {
      if (!fileList || !fileList.length) return;
      const file = fileList[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      const notesArr = Array.isArray(parsed?.notes) ? parsed.notes : (Array.isArray(parsed) ? parsed : []);
      if (!notesArr.length) { alert("No notes found in file."); return; }
      await api("/notes/import", { method: "POST", token, body: { notes: notesArr } });
      await loadNotes();
      alert(`Imported ${notesArr.length} note(s) successfully.`);
    } catch (e) {
      alert(e.message || "Import failed");
    }
  };

  /** -------- Modal helpers -------- */
  const addTags = (raw) => {
    const parts = String(raw).split(",").map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    setMTagList((prev) => {
      const set = new Set(prev.map((x) => x.toLowerCase()));
      const merged = [...prev];
      for (const p of parts) if (!set.has(p.toLowerCase())) { merged.push(p); set.add(p.toLowerCase()); }
      return merged;
    });
  };
  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (tagInput.trim()) { addTags(tagInput); setTagInput(""); }
    } else if (e.key === "Backspace" && !tagInput) {
      setMTagList((prev) => prev.slice(0, -1));
    }
  };
  const handleTagBlur = () => { if (tagInput.trim()) { addTags(tagInput); setTagInput(""); } };
  const handleTagPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (text && text.includes(",")) { e.preventDefault(); addTags(text); }
  };

  const addImagesToState = async (fileList, setter) => {
    const files = Array.from(fileList || []);
    const results = [];
    for (const f of files) {
      try { const src = await fileToCompressedDataURL(f); results.push({ id: uid(), src, name: f.name }); }
      catch (e) { console.error("Image load failed", e); }
    }
    if (results.length) setter((prev) => [...prev, ...results]);
  };

  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id)); if (!n) return;
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    setMBody(n.content || "");
    setMItems(Array.isArray(n.items) ? n.items : []);
    setMTagList(Array.isArray(n.tags) ? n.tags : []);
    setMImages(Array.isArray(n.images) ? n.images : []);
    setTagInput("");
    setMColor(n.color || "default");
    setViewMode(true);
    setModalMenuOpen(false);
    setOpen(true);
  };
  const closeModal = () => {
    setOpen(false);
    setActiveId(null);
    setViewMode(true);
    setModalMenuOpen(false);
    setConfirmDeleteOpen(false);
  };
  const saveModal = async () => {
    if (activeId == null) return;
    const payload =
      mType === "text"
        ? { id: activeId, type: "text", title: mTitle.trim(), content: mBody, items: [], tags: mTagList, images: mImages, color: mColor,
            pinned: !!notes.find(n=>String(n.id)===String(activeId))?.pinned }
        : { id: activeId, type: "checklist", title: mTitle.trim(), content: "", items: mItems, tags: mTagList, images: mImages, color: mColor,
            pinned: !!notes.find(n=>String(n.id)===String(activeId))?.pinned };
    try {
      await api(`/notes/${activeId}`, { method: "PUT", token, body: payload });
      setNotes((prev) => prev.map((n) => (String(n.id) === String(activeId) ? { ...n, ...payload } : n)));
      closeModal();
    } catch (e) {
      alert(e.message || "Failed to save note");
    }
  };
  const deleteModal = async () => {
    if (activeId == null) return;
    try {
      await api(`/notes/${activeId}`, { method: "DELETE", token });
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(activeId)));
      closeModal();
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  };
  const togglePin = async (id, toPinned) => {
    try {
      await api(`/notes/${id}`, { method: "PATCH", token, body: { pinned: !!toPinned } });
      setNotes((prev) => prev.map((n) => (String(n.id) === String(id) ? { ...n, pinned: !!toPinned } : n)));
    } catch (e) {
      alert(e.message || "Failed to toggle pin");
    }
  };

  /** -------- Drag & Drop reorder -------- */
  const moveWithin = (arr, itemId, targetId, placeAfter) => {
    const a = arr.slice();
    const from = a.indexOf(itemId);
    let to = a.indexOf(targetId);
    if (from === -1 || to === -1) return arr;
    a.splice(from, 1);
    to = a.indexOf(targetId);
    if (placeAfter) to += 1;
    a.splice(to, 0, itemId);
    return a;
  };
  const onDragStart = (id, ev) => {
    dragId.current = String(id);
    const isPinned = !!notes.find((n) => String(n.id) === String(id))?.pinned;
    dragGroup.current = isPinned ? "pinned" : "others";
    ev.currentTarget.classList.add("dragging");
  };
  const onDragOver = (overId, group, ev) => {
    ev.preventDefault();
    if (!dragId.current) return;
    if (dragGroup.current !== group) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onDragLeave = (ev) => { ev.currentTarget.classList.remove("drag-over"); };
  const onDrop = async (overId, group, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = dragId.current; dragId.current = null;
    if (!dragged || String(dragged) === String(overId)) return;
    if (dragGroup.current !== group) return;

    const rect = ev.currentTarget.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const placeAfter = ev.clientY > midpoint;

    const pinnedIds = notes.filter((n) => n.pinned).map((n) => String(n.id));
    const otherIds = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    let newPinned = pinnedIds, newOthers = otherIds;
    if (group === "pinned") newPinned = moveWithin(pinnedIds, String(dragged), String(overId), placeAfter);
    else newOthers = moveWithin(otherIds, String(dragged), String(overId), placeAfter);

    // Optimistic update
    const byId = new Map(notes.map((n) => [String(n.id), n]));
    const reordered = [...newPinned.map((id) => byId.get(id)), ...newOthers.map((id) => byId.get(id))];
    setNotes(reordered);

    // Persist order
    try {
      await api("/notes/reorder", { method: "POST", token, body: { pinnedIds: newPinned, otherIds: newOthers } });
    } catch (e) {
      console.error("Reorder failed:", e);
      loadNotes().catch(() => {});
    }
    dragGroup.current = null;
  };
  const onDragEnd = (ev) => { ev.currentTarget.classList.remove("dragging"); };

  /** -------- Derived lists -------- */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();
      const tagsStr = (n.tags || []).join(" ").toLowerCase();
      const items = (n.items || []).map((i) => i.text).join(" ").toLowerCase();
      const images = (n.images || []).map((im) => im.name).join(" ").toLowerCase();
      return t.includes(q) || c.includes(q) || tagsStr.includes(q) || items.includes(q) || images.includes(q);
    });
  }, [notes, search]);
  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);
  const filteredEmptyWithSearch = filtered.length === 0 && notes.length > 0 && !!search;
  const allEmpty = notes.length === 0;

  /** -------- Modal (built here, rendered after NotesUI) -------- */
  const modalMenuBtnRef = useRef(null);
  const modalMenuRef = useRef(null);
  useEffect(() => {
    function onDocClick(e) {
      if (!modalMenuOpen) return;
      const m = modalMenuRef.current;
      const b = modalMenuBtnRef.current;
      if (m && m.contains(e.target)) return;
      if (b && b.contains(e.target)) return;
      setModalMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [modalMenuOpen]);

  const modal = open && (
    <div
      className="modal-scrim fixed inset-0 bg-black/40 backdrop-blur-md z-40 flex items-center justify-center transition-opacity duration-300 overscroll-contain"
      onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
    >
      <div
        className="glass-card rounded-xl shadow-2xl w-11/12 max-w-2xl h-[80vh] flex flex-col relative"
        style={{ backgroundColor: modalBgFor(mColor, dark) }}
      >
        {/* Body */}
        <div className="p-6 relative flex-1 min-h-0 overflow-y-auto">
          {/* Kebab + Pin + Close */}
          <div className="absolute top-3 right-3 flex items-center gap-2">
            <button
              ref={modalMenuBtnRef}
              className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="More options"
              onClick={(e) => { e.stopPropagation(); setModalMenuOpen((v) => !v); }}
            >
              <Kebab />
            </button>
            {modalMenuOpen && (
              <div
                ref={modalMenuRef}
                onClick={(e) => e.stopPropagation()}
                className={`absolute top-10 right-[4.5rem] z-50 border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}
              >
                <button
                  className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                  onClick={() => { const n = notes.find(nn => String(nn.id) === String(activeId)); if (n) handleDownloadNote(n); setModalMenuOpen(false); }}
                >
                  Download .txt
                </button>
              </div>
            )}
            <button
              className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Pin/unpin"
              onClick={() => activeId != null && togglePin(activeId, !(notes.find((n) => String(n.id) === String(activeId))?.pinned))}
            >
              {(notes.find((n) => String(n.id) === String(activeId))?.pinned) ? <PinFilled /> : <PinOutline />}
            </button>
            <button
              className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Close"
              onClick={closeModal}
            >
              <CloseIcon />
            </button>
          </div>

          <input
            className="w-full bg-transparent text-2xl font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-4 pr-10"
            value={mTitle}
            onChange={(e) => setMTitle(e.target.value)}
            placeholder="Title"
          />

          {/* Images */}
          {mImages.length > 0 && (
            <div className="mb-5 flex gap-3 overflow-x-auto">
              {mImages.map((im) => (
                <div key={im.id} className="relative inline-block">
                  <img
                    src={im.src}
                    alt={im.name}
                    className="h-40 md:h-56 w-auto object-cover rounded-md border border-[var(--border-light)]"
                  />
                  <button
                    title="Remove image"
                    className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-5 h-5 text-xs"
                    onClick={() => setMImages((prev) => prev.filter((x) => x.id !== im.id))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Text or Checklist */}
          {mType === "text" ? (
            viewMode ? (
              <div
                className="note-content whitespace-pre-wrap"
                onClick={() => setViewMode(false)}
                dangerouslySetInnerHTML={{ __html: marked.parse(mBody || "") }}
              />
            ) : (
              <textarea
                ref={mBodyRef}
                className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden"
                value={mBody}
                onChange={(e) => { setMBody(e.target.value); requestAnimationFrame(resizeModalTextarea); }}
                placeholder="Write your note…"
              />
            )
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={mInput}
                  onChange={(e) => setMInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const t = mInput.trim(); if (t) { setMItems((p)=>[...p,{id:uid(),text:t,done:false}]); setMInput(""); } } }}
                  placeholder="List item… (press Enter to add)"
                  className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                />
                <button
                  onClick={() => { const t = mInput.trim(); if (t) { setMItems((p)=>[...p,{id:uid(),text:t,done:false}]); setMInput(""); } }}
                  className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>
              {mItems.length > 0 ? (
                <div className="space-y-2">
                  {mItems.map((it) => (
                    <ChecklistRow
                      key={it.id}
                      item={it}
                      onToggle={(checked) => setMItems((prev) => prev.map(p => p.id === it.id ? { ...p, done: checked } : p))}
                      onChange={(txt) => setMItems((prev) => prev.map(p => p.id === it.id ? { ...p, text: txt } : p))}
                      onRemove={() => setMItems((prev) => prev.filter(p => p.id !== it.id))}
                    />
                  ))}
                </div>
              ) : <p className="text-sm text-gray-500">No items yet.</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-light)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Tags chips editor */}
          <div className="flex items-center gap-2 flex-1 flex-wrap min-w-0">
            {mTagList.map((tag) => (
              <span
                key={tag}
                className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
              >
                {tag}
                <button
                  className="ml-1 opacity-70 hover:opacity-100 focus:outline-none"
                  title="Remove tag"
                  onClick={() => setMTagList((prev) => prev.filter((t) => t !== tag))}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={handleTagBlur}
              onPaste={handleTagPaste}
              placeholder={mTagList.length ? "Add tag" : "Add tags"}
              className="bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none min-w-[8ch] flex-1"
            />
          </div>

          {/* Right controls */}
          <div className="w-full sm:w-auto flex items-center gap-3 flex-wrap justify-end">
            <div className="flex space-x-1">
              {Object.keys(LIGHT_COLORS).map((name) => (
                <ColorDot
                  key={name}
                  name={name}
                  darkMode={dark}
                  selected={mColor === name}
                  onClick={() => setMColor(name)}
                />
              ))}
            </div>

            <input
              ref={modalFileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => { const f = e.target.files; if (f && f.length) { await addImagesToState(f, setMImages); } e.target.value = ""; }}
            />
            <button
              onClick={() => modalFileRef.current?.click()}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
              title="Add images"
            >
              <ImageIcon />
            </button>

            <button
              onClick={() => setConfirmDeleteOpen(true)}
              className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-800 flex items-center gap-2 whitespace-nowrap"
              title="Delete"
            >
              <Trash /> Delete
            </button>
            <button
              onClick={saveModal}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 whitespace-nowrap"
            >
              Save
            </button>
          </div>
        </div>

        {/* Confirm Delete Dialog */}
        {confirmDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setConfirmDeleteOpen(false)}
            />
            <div
              className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
              style={{ backgroundColor: dark ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.95)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">Delete this note?</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This action cannot be undone.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button
                  className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => setConfirmDeleteOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  onClick={async () => { setConfirmDeleteOpen(false); await deleteModal();}}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser?.email && route !== "#/notes") navigate("#/notes");
  }, [currentUser]); // eslint-disable-line

  if (!currentUser?.email) {
    if (route === "#/register") {
      return (
        <RegisterView
          dark={dark}
          onToggleDark={toggleDark}
          onRegister={register}
          goLogin={() => navigate("#/login")}
        />
      );
    }
    return (
      <LoginView
        dark={dark}
        onToggleDark={toggleDark}
        onLogin={signIn}
        goRegister={() => navigate("#/register")}
      />
    );
  }

  return (
    <>
      <NotesUI
        currentUser={currentUser}
        dark={dark}
        toggleDark={toggleDark}
        signOut={signOut}
        search={search}
        setSearch={setSearch}
        composerType={composerType}
        setComposerType={setComposerType}
        title={title}
        setTitle={setTitle}
        content={content}
        setContent={setContent}
        contentRef={contentRef}
        clInput={clInput}
        setClInput={setClInput}
        addComposerItem={addComposerItem}
        clItems={clItems}
        composerImages={composerImages}
        setComposerImages={setComposerImages}
        composerFileRef={composerFileRef}
        tags={tags}
        setTags={setTags}
        composerColor={composerColor}
        setComposerColor={setComposerColor}
        addNote={addNote}
        pinned={pinned}
        others={others}
        openModal={openModal}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        togglePin={togglePin}
        addImagesToState={addImagesToState}
        filteredEmptyWithSearch={filteredEmptyWithSearch}
        allEmpty={allEmpty}
        onExportAll={exportAll}
        onImportAll={importAll}
        importFileRef={importFileRef}
        headerMenuOpen={headerMenuOpen}
        setHeaderMenuOpen={setHeaderMenuOpen}
        headerMenuRef={headerMenuRef}
        headerBtnRef={headerBtnRef}
      />
      {modal}
    </>
  );
}
