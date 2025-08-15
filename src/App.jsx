import React, { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { marked as markedParser } from "marked";

// Ensure we can call marked.parse(...)
const marked =
  typeof markedParser === "function" ? { parse: markedParser } : markedParser;

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
/* Added 6 pastel boho colors + two-line picker layout via grid-cols-6 */
const LIGHT_COLORS = {
  default: "rgba(255, 255, 255, 0.6)",
  red: "rgba(252, 165, 165, 0.6)",
  yellow: "rgba(253, 224, 71, 0.6)",
  green: "rgba(134, 239, 172, 0.6)",
  blue: "rgba(147, 197, 253, 0.6)",
  purple: "rgba(196, 181, 253, 0.6)",

  peach: "rgba(255, 183, 178, 0.6)",
  sage: "rgba(197, 219, 199, 0.6)",
  mint: "rgba(183, 234, 211, 0.6)",
  sky: "rgba(189, 224, 254, 0.6)",
  sand: "rgba(240, 219, 182, 0.6)",
  mauve: "rgba(220, 198, 224, 0.6)",
};
const DARK_COLORS = {
  default: "rgba(40, 40, 40, 0.6)",
  red: "rgba(153, 27, 27, 0.6)",
  yellow: "rgba(154, 117, 21, 0.6)",
  green: "rgba(22, 101, 52, 0.6)",
  blue: "rgba(30, 64, 175, 0.6)",
  purple: "rgba(76, 29, 149, 0.6)",

  peach: "rgba(191, 90, 71, 0.6)",
  sage: "rgba(54, 83, 64, 0.6)",
  mint: "rgba(32, 102, 77, 0.6)",
  sky: "rgba(30, 91, 150, 0.6)",
  sand: "rgba(140, 108, 66, 0.6)",
  mauve: "rgba(98, 74, 112, 0.6)",
};
const COLOR_ORDER = [
  "default",
  "red",
  "yellow",
  "green",
  "blue",
  "purple",
  "peach",
  "sage",
  "mint",
  "sky",
  "sand",
  "mauve",
];
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

/** ---------- Special tag filters ---------- */
const ALL_IMAGES = "__ALL_IMAGES__";

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
    <line x1="12" y1="2" x2="12" y2="4" strokeWidth="2" strokeLinecap="round" />
    <line x1="12" y1="20" x2="12" y2="22" strokeWidth="2" strokeLinecap="round" />
    <line x1="20" y1="12" x2="22" y2="12" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="12" x2="4" y2="12" strokeWidth="2" strokeLinecap="round" />
    <line x1="17.657" y1="6.343" x2="18.364" y2="5.636" strokeWidth="2" strokeLinecap="round" />
    <line x1="5.636" y1="18.364" x2="6.343" y2="17.657" strokeWidth="2" strokeLinecap="round" />
    <line x1="17.657" y1="17.657" x2="18.364" y2="18.364" strokeWidth="2" strokeLinecap="round" />
    <line x1="5.636" y1="5.636" x2="6.343" y2="6.343" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="12" r="4" strokeWidth="2" />
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
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12"/>
  </svg>
);
const DownloadIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5 5m0 0l5-5m-5 5V3" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 21h14" />
  </svg>
);
const ArrowLeft = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
);
const ArrowRight = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
);
const Kebab = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="5" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="19" r="1.5" />
  </svg>
);
const Hamburger = () => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
// Formatting "Aa" icon
const FormatIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path strokeLinecap="round" d="M3 19h18M10 17V7l-3 8m10 2V7l-3 8" />
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
// Build MARKDOWN content for download
const mdForDownload = (n) => {
  const lines = [];
  if (n.title) lines.push(`# ${n.title}`, "");
  if (Array.isArray(n.tags) && n.tags.length) {
    lines.push(`**Tags:** ${n.tags.map((t) => `\`${t}\``).join(", ")}`, "");
  }
  if (n.type === "text") {
    lines.push(String(n.content || ""));
  } else {
    const items = Array.isArray(n.items) ? n.items : [];
    for (const it of items) {
      lines.push(`- [${it.done ? "x" : " "}] ${it.text || ""}`);
    }
  }
  if (n.images?.length) {
    lines.push(
      "",
      `> _${n.images.length} image(s) attached)_ ${n.images
        .map((im) => im.name || "image")
        .join(", ")}`
    );
  }
  lines.push("");
  return lines.join("\n");
};

const sanitizeFilename = (name, fallback = "note") =>
  (name || fallback).toString().trim().replace(/[\/\\?%*:|"<>]/g, "-").slice(0, 64);
const downloadText = (filename, content) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
};
const downloadDataUrl = async (filename, dataUrl) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};

// Download arbitrary blob
const triggerBlobDownload = (filename, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); a.remove(); URL.revokeObjectURL(url);
};

// Lazy-load JSZip for generating ZIP files client-side
async function ensureJSZip() {
  if (window.JSZip) return window.JSZip;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load JSZip."));
    document.head.appendChild(s);
  });
  if (!window.JSZip) throw new Error("JSZip not available");
  return window.JSZip;
}

// --- Image filename helpers (fix double extensions) ---
const imageExtFromDataURL = (dataUrl) => {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl || "");
  const mime = (m?.[1] || "image/jpeg").toLowerCase();
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
};
const normalizeImageFilename = (name, dataUrl, index = 1) => {
  const base = sanitizeFilename(name && name.trim() ? name : `image-${index}`);
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const ext = imageExtFromDataURL(dataUrl);
  return `${withoutExt}.${ext}`;
};

/** Format "Edited" text */
function formatEditedStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();

  const sameYMD = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeStr = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (sameYMD(d, now)) return `Today, ${timeStr}`;
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameYMD(d, yest)) return `Yesterday, ${timeStr}`;

  const month = d.toLocaleString([], { month: "short" });
  const day = d.getDate();
  if (d.getFullYear() === now.getFullYear()) return `${month} ${day}`;
  const yy = String(d.getFullYear()).slice(-2);
  return `${month} ${day}, '${yy}`;
}

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
.note-content h1, .note-content h2, .note-content h3 { margin-bottom: 0.75rem; font-weight: 600; }
.note-content h1 { font-size: 1.5rem; line-height: 1.3; }
.note-content h2 { font-size: 1.25rem; line-height: 1.35; }
.note-content h3 { font-size: 1.125rem; line-height: 1.4; }

/* NEW: Prevent long headings/URLs from overflowing, allow tables/code to scroll */
.note-content,
.note-content * { overflow-wrap: anywhere; word-break: break-word; }
.note-content pre { overflow: auto; }

/* Make pre relative so copy button can be positioned */
.note-content pre { position: relative; }

/* Wrapper for code blocks to anchor copy button outside scroll area */
.code-block-wrapper { position: relative; }
.code-block-wrapper .code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
}

.note-content table { display: block; max-width: 100%; overflow-x: auto; }

/* Default lists (subtle spacing for inline previews) */
.note-content ul, .note-content ol { margin: 0.25rem 0 0.25rem 1.25rem; padding-left: 0.75rem; }
.note-content ul { list-style: disc; }
.note-content ol { list-style: decimal; }
.note-content li { margin: 0.15rem 0; line-height: 1.35; }

/* View-mode dense lists in modal: NO extra space between items */
.note-content--dense ul, .note-content--dense ol { margin: 0; padding-left: 1.1rem; }
.note-content--dense li { margin: 0; padding: 0; line-height: 1.15; }
.note-content--dense li > p { margin: 0; }
.note-content--dense li ul, .note-content--dense li ol { margin: 0.1rem 0 0 1.1rem; padding-left: 1.1rem; }

/* Hyperlinks in view mode */
.note-content a {
  color: #2563eb;
  text-decoration: underline;
}

/* Inline code and fenced code styling */
.note-content code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  background: rgba(0,0,0,0.06);
  padding: .12rem .35rem;
  border-radius: .35rem;
  border: 1px solid var(--border-light);
  font-size: .9em;
}

/* Fenced code block container (pre) */
.note-content pre {
  background: rgba(0,0,0,0.06);
  border: 1px solid var(--border-light);
  border-radius: .6rem;
  padding: .75rem .9rem;
}
/* Remove inner background on code inside pre */
.note-content pre code {
  border: none !important;
  background: transparent !important;
  padding: 0;
  display: block;
}

/* Copy buttons */
.note-content pre .code-copy-btn,
.code-block-wrapper .code-copy-btn {
  font-size: .75rem;
  padding: .2rem .45rem;
  border-radius: .35rem;
  background: #111;
  color: #fff;
  border: 1px solid rgba(255,255,255,0.15);
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
  opacity: 1;
  z-index: 2;
}
html:not(.dark) .note-content pre .code-copy-btn {
  background: #fff;
  color: #111;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 2px 10px rgba(0,0,0,0.12);
}
  
.inline-code-copy-btn {
  margin-left: 6px;
  font-size: .7rem;
  padding: .05rem .35rem;
  border-radius: .35rem;
  border: 1px solid var(--border-light);
  background: rgba(0,0,0,0.06);
}

.dragging { opacity: 0.5; transform: scale(1.05); }
.drag-over { outline: 2px dashed rgba(99,102,241,.6); outline-offset: 6px; }
.masonry-grid { column-gap: 1.5rem; column-count: 1; }
@media (min-width: 640px) { .masonry-grid { column-count: 2; } }
@media (min-width: 768px) { .masonry-grid { column-count: 3; } }
@media (min-width: 1024px) { .masonry-grid { column-count: 4; } }
@media (min-width: 1280px) { .masonry-grid { column-count: 5; } }

/* New grid layout to place notes row-wise (left-to-right, top-to-bottom) */
/* Keep-like masonry using CSS Grid with JS-calculated row spans (preserves horizontal order) */
 
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

/* modal header blur */
.modal-header-blur {
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

/* formatting popover base */
.fmt-pop {
  border: 1px solid var(--border-light);
  border-radius: 0.75rem;
  box-shadow: 0 10px 30px rgba(0,0,0,.2);
  padding: .5rem;
}
.fmt-btn {
  padding: .35rem .5rem;
  border-radius: .5rem;
  font-size: .85rem;
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
function ChecklistRow({
  item,
  onToggle,
  onChange,
  onRemove,
  readOnly,
  disableToggle = false,
  showRemove = false,
  size = "md", // "sm" | "md" | "lg"
}) {
  const boxSize =
    size === "lg"
      ? "h-7 w-7 md:h-6 md:w-6"
      : size === "sm"
      ? "h-4 w-4 md:h-3.5 md:w-3.5"
      : "h-5 w-5 md:h-4 md:w-4";

  const removeSize =
    size === "lg"
      ? "w-7 h-7 text-base md:w-6 md:h-6"
      : size === "sm"
      ? "w-5 h-5 text-xs md:w-4 md:h-4"
      : "w-6 h-6 text-sm md:w-5 md:h-5";

  const removeVisibility = showRemove
    ? "opacity-80 hover:opacity-100"
    : "opacity-0 group-hover:opacity-100";

  return (
    <div className="flex items-start gap-3 md:gap-2 group">
      <input
        type="checkbox"
        className={`mt-0.5 ${boxSize} cursor-pointer`}
        checked={!!item.done}
        onChange={(e) => onToggle?.(e.target.checked)}
        disabled={!!disableToggle}
      />
      {readOnly ? (
        <span
          className={`text-sm ${item.done ? "line-through text-gray-500 dark:text-gray-400" : ""}`}
        >
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

      {(showRemove || !readOnly) && (
        <button
          className={`${removeVisibility} transition-opacity text-gray-500 hover:text-red-600 rounded-full border border-[var(--border-light)] flex items-center justify-center ${removeSize}`}
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

/** ---------- Formatting helpers ---------- */
function wrapSelection(value, start, end, before, after, placeholder = "text") {
  const hasSel = start !== end;
  const sel = hasSel ? value.slice(start, end) : placeholder;
  const newText = value.slice(0, start) + before + sel + after + value.slice(end);
  const s = start + before.length;
  const e = s + sel.length;
  return { text: newText, range: [s, e] };
}
function fencedBlock(value, start, end) {
  const hasSel = start !== end;
  const sel = hasSel ? value.slice(start, end) : "code";
  const block = "```\n" + sel + "\n```";
  const newText = value.slice(0, start) + block + value.slice(end);
  const s = start + 4;
  const e = s + sel.length;
  return { text: newText, range: [s, e] };
}
function selectionBounds(value, start, end) {
  const from = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  let to = value.indexOf("\n", end);
  if (to === -1) to = value.length;
  return { from, to };
}
function toggleList(value, start, end, kind /* 'ul' | 'ol' */) {
  const { from, to } = selectionBounds(value, start, end);
  const segment = value.slice(from, to);
  const lines = segment.split("\n");

  const isUL = (ln) => /^\s*[-*+]\s+/.test(ln);
  const isOL = (ln) => /^\s*\d+\.\s+/.test(ln);
  const nonEmpty = (ln) => ln.trim().length > 0;

  const allUL = lines.filter(nonEmpty).every(isUL);
  const allOL = lines.filter(nonEmpty).every(isOL);

  let newLines;
  if (kind === "ul") {
    if (allUL) newLines = lines.map((ln) => ln.replace(/^\s*[-*+]\s+/, ""));
    else newLines = lines.map((ln) => (nonEmpty(ln) ? `- ${ln.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "")}` : ln));
  } else {
    if (allOL) {
      newLines = lines.map((ln) => ln.replace(/^\s*\d+\.\s+/, ""));
    } else {
      let i = 1;
      newLines = lines.map((ln) =>
        nonEmpty(ln)
          ? `${i++}. ${ln.replace(/^\s*[-*+]\s+/, "").replace(/^\s*\d+\.\s+/, "")}`
          : ln
      );
    }
  }

  const replaced = newLines.join("\n");
  const newText = value.slice(0, from) + replaced + value.slice(to);
  const delta = replaced.length - segment.length;
  const newStart = start + (kind === "ol" && !allOL ? 3 : kind === "ul" && !allUL ? 2 : 0);
  const newEnd = end + delta;
  return { text: newText, range: [newStart, newEnd] };
}
function prefixLines(value, start, end, prefix) {
  const { from, to } = selectionBounds(value, start, end);
  const segment = value.slice(from, to);
  const lines = segment.split("\n").map((ln) => `${prefix}${ln}`);
  const replaced = lines.join("\n");
  const newText = value.slice(0, from) + replaced + value.slice(to);
  const delta = replaced.length - segment.length;
  return { text: newText, range: [start + prefix.length, end + delta] };
}

/** Smart Enter: continue lists/quotes, or exit on empty */
function handleSmartEnter(value, start, end) {
  if (start !== end) return null; // only handle caret
  const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const line = value.slice(lineStart, start);
  const before = value.slice(0, start);
  const after = value.slice(end);

  // Ordered list?
  let m = /^(\s*)(\d+)\.\s(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const num = parseInt(m[2], 10) || 1;
    const text = m[3] || "";
    if (text.trim() === "") {
      // exit list
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}${num + 1}. `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  // Unordered list?
  m = /^(\s*)([-*+])\s(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const text = m[3] || "";
    if (text.trim() === "") {
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}- `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  // Blockquote?
  m = /^(\s*)>\s?(.*)$/.exec(line);
  if (m) {
    const indent = m[1] || "";
    const text = m[2] || "";
    if (text.trim() === "") {
      const newBefore = value.slice(0, lineStart);
      const newText = newBefore + "\n" + after;
      const caret = newBefore.length + 1;
      return { text: newText, range: [caret, caret] };
    } else {
      const prefix = `${indent}> `;
      const newText = before + "\n" + prefix + after;
      const caret = start + 1 + prefix.length;
      return { text: newText, range: [caret, caret] };
    }
  }

  return null;
}

/** Small toolbar UI */
function FormatToolbar({ dark, onAction }) {
  const base = `fmt-btn ${dark ? "hover:bg-white/10" : "hover:bg-black/5"}`;
  return (
    <div className={`fmt-pop ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}>
      <div className="flex flex-wrap gap-1">
        <button className={base} onClick={() => onAction("h1")}>H1</button>
        <button className={base} onClick={() => onAction("h2")}>H2</button>
        <button className={base} onClick={() => onAction("h3")}>H3</button>
        <span className="mx-1 opacity-40">|</span>
        <button className={base} onClick={() => onAction("bold")}><strong>B</strong></button>
        <button className={base} onClick={() => onAction("italic")}><em>I</em></button>
        <button className={base} onClick={() => onAction("strike")}><span className="line-through">S</span></button>
        <button className={base} onClick={() => onAction("code")}>`code`</button>
        <button className={base} onClick={() => onAction("codeblock")}>&lt;/&gt;</button>
        <span className="mx-1 opacity-40">|</span>
        <button className={base} onClick={() => onAction("quote")}>&gt;</button>
        <button className={base} onClick={() => onAction("ul")}>• list</button>
        <button className={base} onClick={() => onAction("ol")}>1. list</button>
        <button className={base} onClick={() => onAction("link")}>🔗</button>
      </div>
    </div>
  );
}

/** ---------- Portal Popover ---------- */
function Popover({ anchorRef, open, onClose, children, offset = 8 }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boxRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      let top = r.bottom + offset;
      let left = r.left;
      setPos({ top, left });
      requestAnimationFrame(() => {
        const el = boxRef.current;
        if (!el) return;
        const bw = el.offsetWidth;
        const bh = el.offsetHeight;
        let t = top;
        let l = left;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (l + bw + 8 > vw) l = Math.max(8, vw - bw - 8);
        if (t + bh + 8 > vh) {
          t = Math.max(8, r.top - bh - offset);
        }
        setPos({ top: t, left: l });
      });
    };
    place();
    const onWin = () => place();
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open, anchorRef, offset]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const el = boxRef.current;
      const a = anchorRef?.current;
      if (el && el.contains(e.target)) return;
      if (a && a.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={boxRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {children}
    </div>,
    document.body
  );
}

/** ---------- Note Card ---------- */
function NoteCard({
  n, dark,
  openModal, togglePin,
  // multi-select
  multiMode = false,
  selected = false,
  onToggleSelect = () => {},
  disablePin = false,
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
      draggable={!multiMode}
      onDragStart={(e) => { if (!multiMode) onDragStart(n.id, e); }}
      onDragOver={(e) => { if (!multiMode) onDragOver(n.id, group, e); }}
      onDragLeave={(e) => { if (!multiMode) onDragLeave(e); }}
      onDrop={(e) => { if (!multiMode) onDrop(n.id, group, e); }}
      onDragEnd={(e) => { if (!multiMode) onDragEnd(e); }}
      onClick={() => { if (!multiMode) openModal(n.id); }}
      className="note-card glass-card rounded-xl p-4 mb-6 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative min-h-[54px] group"
      style={{ backgroundColor: bgFor(n.color, dark) }}
      data-id={n.id}
      data-group={group}
    >
      {multiMode && (
        <label className="absolute top-3 right-3 bg-white/70 dark:bg-black/40 rounded-md px-2 py-1 flex items-center gap-2 select-none" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={selected}
            onChange={(e) => onToggleSelect(n.id, e.target.checked)}
          />
          <span className="text-xs">Select</span>
        </label>
      )}
      {!multiMode && (
        <div className="absolute top-3 right-3 h-8 opacity-0 group-hover:opacity-100 transition-opacity">
          <div
            className="absolute inset-0 rounded-full"
            style={{ backgroundColor: bgFor(n.color, dark) }}
          />
          <button
            aria-label={n.pinned ? "Unpin note" : "Pin note"}
            onClick={(e) => { if (disablePin) return; e.stopPropagation(); togglePin(n.id, !n.pinned); }}
            className="relative rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title={n.pinned ? "Unpin" : "Pin"}
            disabled={!!disablePin}
          >
            {n.pinned ? <PinFilled /> : <PinOutline />}
          </button>
        </div>
      )}

      {n.title && <h3 className="font-bold text-lg mb-2 break-words">{n.title}</h3>}

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
          {visibleItems.map((it) => (
            <ChecklistRow key={it.id} item={it} readOnly disableToggle size="sm" />
          ))}
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

/** ---------- Login / Register / Secret Login ---------- */
function LoginView({ dark, onToggleDark, onLogin, goRegister, goSecret }) {
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
          type="text"
          autoComplete="username"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
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

      <div className="mt-4 text-sm flex justify-between items-center">
        <button className="text-indigo-600 hover:underline" onClick={goRegister}>
          Create account
        </button>
        <button className="text-indigo-600 hover:underline" onClick={goSecret}>
          Forgot username/password?
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
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          autoComplete="username"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Password (min 6 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
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

function SecretLoginView({ dark, onToggleDark, onLoginWithKey, goLogin }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await onLoginWithKey(key.trim());
      if (!res.ok) setErr(res.error || "Login failed");
    } catch (er) {
      setErr(er.message || "Login failed");
    }
  };

  return (
    <AuthShell title="Sign in with Secret Key" dark={dark} onToggleDark={onToggleDark}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          className="w-full bg-transparent border border-[var(--border-light)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[100px] text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
          placeholder="Paste your secret key here"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          required
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button type="submit" className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Sign In with Secret Key
        </button>
      </form>
      <div className="mt-4 text-sm text-center">
        Remember your credentials?{" "}
        <button className="text-indigo-600 hover:underline" onClick={goLogin}>
          Sign in with email & password
        </button>
      </div>
    </AuthShell>
  );
}

/** ---------- Tag Sidebar / Drawer ---------- */
function TagSidebar({ open, onClose, tagsWithCounts, activeTag, onSelect, dark }) {
  const isAllNotes = activeTag === null;
  const isAllImages = activeTag === ALL_IMAGES;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-40 h-full w-72 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}
        style={{ backgroundColor: dark ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.95)", borderRight: "1px solid var(--border-light)" }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tags</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <nav className="p-2 overflow-y-auto h-[calc(100%-56px)]">
          {/* Notes (All) */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-1 ${isAllNotes ? (dark ? "bg-white/10" : "bg-black/5") : (dark ? "hover:bg-white/10" : "hover:bg-black/5")}`}
            onClick={() => { onSelect(null); onClose(); }}
          >
            Notes (All)
          </button>

          {/* All Images */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 ${isAllImages ? (dark ? "bg-white/10" : "bg-black/5") : (dark ? "hover:bg-white/10" : "hover:bg-black/5")}`}
            onClick={() => { onSelect(ALL_IMAGES); onClose(); }}
          >
            All Images
          </button>

          {/* Archived Notes */}
          <button
            className={`w-full text-left px-3 py-2 rounded-md mb-2 ${activeTag === 'ARCHIVED' ? (dark ? "bg-white/10" : "bg-black/5") : (dark ? "hover:bg-white/10" : "hover:bg-black/5")}`}
            onClick={() => { onSelect('ARCHIVED'); onClose(); }}
          >
            Archived Notes
          </button>

          {/* User tags */}
          {tagsWithCounts.map(({ tag, count }) => {
            const active = typeof activeTag === "string" && activeTag !== ALL_IMAGES &&
              activeTag.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                className={`w-full text-left px-3 py-2 rounded-md mb-1 flex items-center justify-between ${active ? (dark ? "bg-white/10" : "bg-black/5") : (dark ? "hover:bg-white/10" : "hover:bg-black/5")}`}
                onClick={() => { onSelect(tag); onClose(); }}
                title={tag}
              >
                <span className="truncate">{tag}</span>
                <span className="text-xs opacity-70">{count}</span>
              </button>
            );
          })}
          {tagsWithCounts.length === 0 && (
            <p className="text-sm text-gray-500 mt-2">No tags yet. Add tags to your notes!</p>
          )}
        </nav>
      </aside>
    </>
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
    onExportAll, onImportAll, onImportGKeep, onImportMd, onDownloadSecretKey, importFileRef, gkeepFileRef, mdFileRef, signOut,
  filteredEmptyWithSearch, allEmpty,
  headerMenuOpen, setHeaderMenuOpen,
  headerMenuRef, headerBtnRef,
  // new for sidebar
  openSidebar,
  activeTagFilter,
  // formatting
  formatComposer,
  showComposerFmt, setShowComposerFmt,
  composerFmtBtnRef,
  onComposerKeyDown,
  // collapsed composer
  composerCollapsed, setComposerCollapsed,
  titleRef,
  // color popover
  colorBtnRef, showColorPop, setShowColorPop,
  // loading state
    notesLoading,
    // multi-select
    multiMode,
    selectedIds,
    onStartMulti,
    onExitMulti,
    onToggleSelect,
    onSelectAllPinned,
    onSelectAllOthers,
    onBulkDelete,
    onBulkPin,
    onBulkColor,
    onBulkDownloadZip,
  // view mode
  listView,
  onToggleViewMode,
  // SSE connection status
  sseConnected,
  loadNotes,
  loadArchivedNotes,
}) {
    // Multi-select color popover (local UI state)
    const multiColorBtnRef = useRef(null);
    const [showMultiColorPop, setShowMultiColorPop] = useState(false);
  const tagLabel =
    activeTagFilter === ALL_IMAGES ? "All Images" : 
    activeTagFilter === 'ARCHIVED' ? "Archived Notes" : 
    activeTagFilter;

  return (
    <div className="min-h-screen">
      {/* Multi-select toolbar (floats above header when active) */}
      {multiMode && (
        <div className="p-3 sm:p-4 flex items-center justify-between sticky top-0 z-[25] glass-card mb-2" style={{ position: "sticky" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <button className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm" onClick={onBulkDownloadZip}>
              Download (.zip)
            </button>
            <button className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm" onClick={onBulkDelete}>
              Delete
            </button>
            <button
              ref={multiColorBtnRef}
              type="button"
              onClick={() => setShowMultiColorPop((v) => !v)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
              title="Color"
            >
              🎨 Color
            </button>
            <Popover anchorRef={multiColorBtnRef} open={showMultiColorPop} onClose={() => setShowMultiColorPop(false)}>
              <div className={`fmt-pop ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}>
                <div className="grid grid-cols-6 gap-2">
                  {COLOR_ORDER.filter((name) => LIGHT_COLORS[name]).map((name) => (
                    <ColorDot
                      key={name}
                      name={name}
                      darkMode={dark}
                      selected={false}
                      onClick={(e) => {
                        e.stopPropagation();
                        onBulkColor(name);
                        setShowMultiColorPop(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            </Popover>
            <button className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm" onClick={() => onBulkPin(true)}>Pin</button>
            <span className="text-xs opacity-70 ml-2">Selected: {selectedIds.length}</span>
          </div>
          <button
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            title="Exit multi-select"
            onClick={onExitMulti}
          >
            <CloseIcon />
          </button>
        </div>
      )}

      {/* Header */}
      <header className="p-4 sm:p-6 flex justify-between items-center sticky top-0 z-20 glass-card mb-6">
        <div className="flex items-center gap-3">
          {/* Hamburger */}
          <button
            onClick={openSidebar}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            title="Open tags"
            aria-label="Open tags"
          >
            <Hamburger />
          </button>

          {/* App logo */}
          <img
            src="/favicon-32x32.png"
            srcSet="/pwa-192.png 2x, /pwa-512.png 3x"
            alt="Glass Keep logo"
            className="h-7 w-7 rounded-xl shadow-sm select-none pointer-events-none"
            draggable="false"
          />

          <h1 className="hidden sm:block text-2xl sm:text-3xl font-bold">Glass Keep</h1>
          {activeTagFilter && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border border-indigo-600/20">
              {tagLabel === "All Images" || tagLabel === "Archived Notes" ? tagLabel : `Tag: ${tagLabel}`}
            </span>
          )}
        </div>

        <div className="flex-grow flex justify-center px-4 sm:px-8">
          <div className="relative w-full max-w-lg">
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-transparent border border-[var(--border-light)] rounded-lg pl-4 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white"
                onClick={() => setSearch("")}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-3">
          <span className={`text-sm hidden sm:inline ${dark ? "text-gray-100" : "text-gray-900"}`}>
            {currentUser?.name ? `Hi, ${currentUser.name}` : currentUser?.email}
          </span>

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
              className={`absolute top-12 right-0 min-w-[220px] z-[1100] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}
              onClick={(e) => e.stopPropagation()}
            >

              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { onExportAll?.(); }}
              >
                Export ALL notes (.json)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { importFileRef.current?.click(); }}
              >
                Import ALL notes (.json)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { gkeepFileRef.current?.click(); }}
              >
                Import G. Keep notes (.json)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { mdFileRef.current?.click(); }}
              >
                Import Notes (.md)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { onDownloadSecretKey?.(); }}
              >
                Download secret key (.txt)
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); onToggleViewMode?.(); }}
              >
                {listView ? "Grid View" : "List View"}
              </button>
              {/* Theme toggle text item */}
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); toggleDark?.(); }}
              >
                {dark ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); onStartMulti?.(); }}
              >
                Multi select
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
          {/* Hidden Google Keep import input (multiple) */}
          <input
            ref={gkeepFileRef}
            type="file"
            accept="application/json"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportGKeep?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
          {/* Hidden Markdown import input (multiple) */}
          <input
            ref={mdFileRef}
            type="file"
            accept=".md,text/markdown"
            multiple
            className="hidden"
            onChange={async (e) => {
              if (e.target.files && e.target.files.length) {
                await onImportMd?.(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      </header>

      {/* Composer */}
      <div className="px-4 sm:px-6 md:px-8 lg:px-12">
        <div className="max-w-2xl mx-auto">
        <div
          className="glass-card rounded-xl shadow-lg p-4 mb-8 relative"
          style={{ backgroundColor: bgFor(composerColor, dark) }}
        >
          {/* Collapsed single input */}
          {composerCollapsed ? (
            <input
              value={content}
              onChange={(e) => {}}
              onFocus={() => {
                // expand and focus title
                setComposerCollapsed(false);
                setTimeout(() => titleRef.current?.focus(), 10);
              }}
              placeholder="Write a note..."
              className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
            />
          ) : (
            <>
              {/* Title */}
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-transparent text-lg font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-2 p-2"
              />

              {/* Body or Checklist */}
              {composerType === "text" ? (
                <textarea
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Write a note..."
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
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap"
                    >
                      Add
                    </button>
                  </div>
                  {clItems.length > 0 && (
                    <div className="space-y-2">
                      {clItems.map((it) => (
                        <ChecklistRow key={it.id} item={it} readOnly disableToggle />
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
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-3 relative">
                <input
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  type="text"
                  placeholder="Add tags (comma-separated)"
                  className="w-full sm:flex-1 bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
                />

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:flex-none relative">
                  {/* Formatting button (composer) */}
                  {composerType === "text" && (
                    <>
                      <button
                        ref={composerFmtBtnRef}
                        type="button"
                        onClick={() => setShowComposerFmt((v) => !v)}
                        className="px-2 py-1 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-2 text-sm"
                        title="Formatting"
                      >
                        <FormatIcon /> Formatting
                      </button>
                      <Popover
                        anchorRef={composerFmtBtnRef}
                        open={showComposerFmt}
                        onClose={() => setShowComposerFmt(false)}
                      >
                        <FormatToolbar dark={dark} onAction={(t) => { setShowComposerFmt(false); formatComposer(t); }} />
                      </Popover>
                    </>
                  )}

                  {/* Checklist toggle button (footer-left) */}
                  <button
                    type="button"
                    onClick={() => setComposerType((t) => (t === "text" ? "checklist" : "text"))}
                    className="px-2 py-1 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                    title="Toggle checklist"
                  >
                    ☑
                  </button>

                  {/* Color dropdown (composer) */}
                  <button
                    ref={colorBtnRef}
                    type="button"
                    onClick={() => setShowColorPop((v) => !v)}
                    className="px-2 py-1 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                    title="Color"
                  >
                    🎨 Color
                  </button>
                  <Popover
                    anchorRef={colorBtnRef}
                    open={showColorPop}
                    onClose={() => setShowColorPop(false)}
                  >
                    <div className={`fmt-pop ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}>
                      <div className="grid grid-cols-6 gap-2">
                        {COLOR_ORDER.filter((name) => LIGHT_COLORS[name]).map((name) => (
                          <ColorDot
                            key={name}
                            name={name}
                            darkMode={dark}
                            selected={composerColor === name}
                            onClick={(e) => {
                              e.stopPropagation();
                              setComposerColor(name);
                              setShowColorPop(false);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </Popover>

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
                    className="p-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 flex-shrink-0"
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
            </>
          )}
        </div>
      </div>
      </div>

      {/* Notes lists */}
      <main className="px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
        {pinned.length > 0 && (
          <section className="mb-10">
            {listView ? (
              <div className="max-w-2xl mx-auto">
                <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                  Pinned
                </h2>
              </div>
            ) : (
              <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                Pinned
              </h2>
            )}
            <div className={listView ? "max-w-2xl mx-auto space-y-6" : "masonry-grid"}>
              {pinned.map((n) => (
                <NoteCard
                  key={n.id}
                  n={n}
                  dark={dark}
                  openModal={openModal}
                  togglePin={togglePin}
              multiMode={multiMode}
              selected={selectedIds.includes(String(n.id))}
              onToggleSelect={onToggleSelect}
                  disablePin={('ontouchstart' in window) || (navigator.maxTouchPoints > 0)}
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
              listView ? (
                <div className="max-w-2xl mx-auto">
                  <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                    Others
                  </h2>
                </div>
              ) : (
                <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
                  Others
                </h2>
              )
            )}
            <div className={listView ? "max-w-2xl mx-auto space-y-6" : "masonry-grid"}>
              {others.map((n) => (
                <NoteCard
                  key={n.id}
                  n={n}
                  dark={dark}
                  openModal={openModal}
                  togglePin={togglePin}
              multiMode={multiMode}
              selected={selectedIds.includes(String(n.id))}
              onToggleSelect={onToggleSelect}
                  disablePin={('ontouchstart' in window) || (navigator.maxTouchPoints > 0)}
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

        {notesLoading && (pinned.length + others.length === 0) && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            Loading Notes…
          </p>
        )}
        {!notesLoading && filteredEmptyWithSearch && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            No matching notes found.
          </p>
        )}
        {!notesLoading && allEmpty && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            No notes yet. Add one to get started!
          </p>
        )}
      </main>
    </div>
  );
}

/** ---------- AdminView ---------- */
function AdminView({ dark }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const sess = getAuth();
  const token = sess?.token;

  const formatBytes = (n = 0) => {
    if (!Number.isFinite(n) || n <= 0) return "0 B";
    const units = ["B","KB","MB","GB","TB"];
    const e = Math.min(Math.floor(Math.log10(n) / 3), units.length - 1);
    const v = n / Math.pow(1024, e);
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[e]}`;
  };

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (e) {
      alert(e.message || "Failed to load admin data");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }

  async function removeUser(id) {
    if (!confirm("Delete this user and ALL their notes? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Delete failed");
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  }

  useEffect(() => { load(); }, []); // load once

  return (
    <div className="min-h-screen px-4 sm:px-6 md:px-8 lg:px-12 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold mb-4">Admin</h1>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          Manage registered users. You can remove users (this also deletes their notes).
        </p>

        <div className="glass-card rounded-xl p-4 shadow-lg overflow-x-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-lg">Users</h2>
            <button
              onClick={load}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-[var(--border-light)]">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email / Username</th>
                <th className="py-2 pr-3">Notes</th>
                <th className="py-2 pr-3">Storage</th>
                <th className="py-2 pr-3">Admin</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-gray-500 dark:text-gray-400">
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border-light)] last:border-0">
                  <td className="py-2 pr-3">{u.name}</td>
                  <td className="py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">{u.notes ?? 0}</td>
                  <td className="py-2 pr-3">{formatBytes(u.storage_bytes ?? 0)}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.is_admin
                          ? "bg-green-500/15 text-green-700 dark:text-green-300 border border-green-500/30"
                          : "bg-gray-500/10 text-gray-700 dark:text-gray-300 border border-gray-500/20"
                      }`}
                    >
                      {u.is_admin ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {new Date(u.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="px-2.5 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
                      onClick={() => removeUser(u.id)}
                      title="Delete user"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {loading && (
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading…</div>
          )}
        </div>
      </div>
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

  // Tag filter & sidebar
  const [tagFilter, setTagFilter] = useState(null); // null = all, ALL_IMAGES = only notes with images
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Composer
  const [composerType, setComposerType] = useState("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [composerColor, setComposerColor] = useState("default");
  const [composerImages, setComposerImages] = useState([]);
  const contentRef = useRef(null);
  const composerFileRef = useRef(null);

  // Formatting (composer)
  const [showComposerFmt, setShowComposerFmt] = useState(false);
  const composerFmtBtnRef = useRef(null);

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
  const [savingModal, setSavingModal] = useState(false);
  const mBodyRef = useRef(null);
  const modalFileRef = useRef(null);
  const [modalMenuOpen, setModalMenuOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [mItems, setMItems] = useState([]);
  const skipNextItemsAutosave = useRef(false);
  const prevItemsRef = useRef([]);
  const [mInput, setMInput] = useState("");

  // Collaboration modal
  const [collaborationModalOpen, setCollaborationModalOpen] = useState(false);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");

  // Modal formatting
  const [showModalFmt, setShowModalFmt] = useState(false);
  const modalFmtBtnRef = useRef(null);

  // Modal color popover
  const modalColorBtnRef = useRef(null);
  const [showModalColorPop, setShowModalColorPop] = useState(false);

  // Image Viewer state (fullscreen)
  const [imgViewOpen, setImgViewOpen] = useState(false);
  const [imgViewIndex, setImgViewIndex] = useState(0);

  // Drag
  const dragId = useRef(null);
  const dragGroup = useRef(null);

  // Header menu refs + state
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const headerMenuRef = useRef(null);
  const headerBtnRef = useRef(null);
  const importFileRef = useRef(null);
  const gkeepFileRef = useRef(null);
  const mdFileRef = useRef(null);

  // Modal kebab anchor
  const modalMenuBtnRef = useRef(null);

  // Composer collapse + refs
  const [composerCollapsed, setComposerCollapsed] = useState(true);
  const titleRef = useRef(null);

  // Color dropdown (composer)
  const colorBtnRef = useRef(null);
  const [showColorPop, setShowColorPop] = useState(false);

  // Scrim click tracking to avoid closing when drag starts inside modal
  const scrimClickStartRef = useRef(false);

  // For code copy buttons in view mode
  const noteViewRef = useRef(null);

  // Loading state for notes
  const [notesLoading, setNotesLoading] = useState(false);
  // Remove lazy loading state

  // -------- Multi-select state --------
  const [multiMode, setMultiMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // array of string ids
  const isSelected = (id) => selectedIds.includes(String(id));
  const onStartMulti = () => { setMultiMode(true); setSelectedIds([]); };
  const onExitMulti = () => { setMultiMode(false); setSelectedIds([]); };
  const onToggleSelect = (id, checked) => {
    const sid = String(id);
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, sid])) : prev.filter((x) => x !== sid)));
  };
  const onSelectAllPinned = () => {
    const ids = notes.filter((n) => n.pinned).map((n) => String(n.id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };
  const onSelectAllOthers = () => {
    const ids = notes.filter((n) => !n.pinned).map((n) => String(n.id));
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  // -------- View mode: Grid vs List --------
  const [listView, setListView] = useState(() => {
    try { return localStorage.getItem("viewMode") === "list"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("viewMode", listView ? "list" : "grid"); } catch {}
  }, [listView]);
  const onToggleViewMode = () => setListView((v) => !v);

  const onBulkDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Delete ${selectedIds.length} selected note(s)? This cannot be undone.`)) return;
    try {
      // Fire deletes sequentially to keep API simple
      for (const id of selectedIds) {
        await api(`/notes/${id}`, { method: "DELETE", token });
      }
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
      onExitMulti();
    } catch (e) {
      alert(e.message || "Bulk delete failed");
    }
  };

  const onBulkPin = async (pinnedVal) => {
    if (!selectedIds.length) return;
    try {
      // Optimistic update
      setNotes((prev) => prev.map((n) => (selectedIds.includes(String(n.id)) ? { ...n, pinned: !!pinnedVal } : n)));
      // Persist in background (best-effort)
      for (const id of selectedIds) {
        await api(`/notes/${id}`, { method: "PATCH", token, body: { pinned: !!pinnedVal } });
      }
    } catch (e) {
      console.error("Bulk pin failed", e);
      loadNotes().catch(() => {});
    }
  };

  const onBulkColor = async (colorName) => {
    if (!selectedIds.length) return;
    try {
      setNotes((prev) => prev.map((n) => (selectedIds.includes(String(n.id)) ? { ...n, color: colorName } : n)));
      for (const id of selectedIds) {
        await api(`/notes/${id}`, { method: "PATCH", token, body: { color: colorName } });
      }
    } catch (e) {
      console.error("Bulk color failed", e);
      loadNotes().catch(() => {});
    }
  };

  const onBulkDownloadZip = async () => {
    try {
      const ids = new Set(selectedIds);
      const chosen = notes.filter((n) => ids.has(String(n.id)));
      if (!chosen.length) return;
      const JSZip = await ensureJSZip();
      const zip = new JSZip();
      chosen.forEach((n, idx) => {
        const md = mdForDownload(n);
        const base = sanitizeFilename(n.title || `note-${String(n.id).slice(-6)}`);
        zip.file(`${base || `note-${idx+1}`}.md`, md);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      triggerBlobDownload(`glass-keep-selected-${ts}.zip`, blob);
    } catch (e) {
      alert(e.message || "ZIP download failed");
    }
  };

  // NEW: modal scroll container ref + state to place Edited at bottom when not scrollable
  const modalScrollRef = useRef(null);
  const [modalScrollable, setModalScrollable] = useState(false);
  
  // SSE connection status
  const [sseConnected, setSseConnected] = useState(false);

  // Derived: Active note + edited text
  const activeNoteObj = useMemo(
    () => notes.find((x) => String(x.id) === String(activeId)),
    [notes, activeId]
  );
  const editedStamp = useMemo(() => {
    const ts = activeNoteObj?.updated_at || activeNoteObj?.timestamp;
    const baseStamp = ts ? formatEditedStamp(ts) : "";
    
    // Add collaborator info if available
    if (activeNoteObj?.lastEditedBy && activeNoteObj?.lastEditedAt) {
      const editorName = activeNoteObj.lastEditedBy;
      const editTime = formatEditedStamp(activeNoteObj.lastEditedAt);
      return `${editorName}, ${editTime}`;
    }
    
    return baseStamp;
  }, [activeNoteObj]);

  const modalHasChanges = useMemo(() => {
    if (!activeNoteObj) return false;
    if ((mTitle || "") !== (activeNoteObj.title || "")) return true;
    if ((mColor || "default") !== (activeNoteObj.color || "default")) return true;
    const tagsA = JSON.stringify(mTagList || []);
    const tagsB = JSON.stringify(activeNoteObj.tags || []);
    if (tagsA !== tagsB) return true;
    const imagesA = JSON.stringify(mImages || []);
    const imagesB = JSON.stringify(activeNoteObj.images || []);
    if (imagesA !== imagesB) return true;
    if ((mType || "text") !== (activeNoteObj.type || "text")) return true;
    if ((mType || "text") === "text") {
      if ((mBody || "") !== (activeNoteObj.content || "")) return true;
    } else {
      const itemsA = JSON.stringify(mItems || []);
      const itemsB = JSON.stringify(activeNoteObj.items || []);
      if (itemsA !== itemsB) return true;
    }
    return false;
  }, [activeNoteObj, mTitle, mColor, mTagList, mImages, mType, mBody, mItems]);

  useEffect(() => {
    // Only close header and modal kebab on outside click
    function onDocClick(e) {
      if (headerMenuOpen) {
        const m = headerMenuRef.current;
        const b = headerBtnRef.current;
        if (m && m.contains(e.target)) return;
        if (b && b.contains(e.target)) return;
        setHeaderMenuOpen(false);
      }
      if (modalMenuOpen) {
        const b = modalMenuBtnRef.current;
        if (b && b.contains(e.target)) return;
        setModalMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [headerMenuOpen, modalMenuOpen]);

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

  // Close sidebar with Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // Load notes (single request or paginated fallback)
  const loadNotes = async () => {
    if (!token) return;
    setNotesLoading(true);
    setNotes([]);
    try {
      const data = await api("/notes", { token });
      console.log("Regular notes loaded:", data);
      setNotes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading regular notes:", error);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };

  // Load archived notes
  const loadArchivedNotes = async () => {
    if (!token) return;
    setNotesLoading(true);
    setNotes([]);
    try {
      const data = await api("/notes/archived", { token });
      console.log("Archived notes loaded:", data);
      setNotes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading archived notes:", error);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  };
  useEffect(() => {
    if (!token) return;
    
    console.log("Tag filter changed to:", tagFilter);
    
    // Load appropriate notes based on tag filter
    if (tagFilter === 'ARCHIVED') {
      console.log("Loading archived notes...");
      loadArchivedNotes().catch(() => {});
    } else {
      console.log("Loading regular notes...");
      loadNotes().catch(() => {});
    }
  }, [token, tagFilter]);
  
  useEffect(() => {
    if (token) loadNotes().catch(() => {});
    if (!token) return;
    
    let es;
    let reconnectTimeout;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const baseReconnectDelay = 1000;
    
    const connectSSE = () => {
      try {
        const url = new URL(`${window.location.origin}/api/events`);
        url.searchParams.set("token", token);
        url.searchParams.set("_t", Date.now()); // Cache buster for PWA
        es = new EventSource(url.toString());
        
        es.onopen = () => {
          console.log("SSE connected");
          setSseConnected(true);
          reconnectAttempts = 0;
        };
        
        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data || '{}');
            if (msg && msg.type === 'note_updated') {
              // Refresh notes list on any note update relevant to this user
              if (tagFilter === 'ARCHIVED') {
                loadArchivedNotes().catch(() => {});
              } else {
                loadNotes().catch(() => {});
              }
            }
          } catch {}
        };
        
        es.addEventListener('note_updated', (e) => {
          try {
            const msg = JSON.parse(e.data || '{}');
            if (msg && msg.noteId) {
              if (tagFilter === 'ARCHIVED') {
                loadArchivedNotes().catch(() => {});
              } else {
                loadNotes().catch(() => {});
              }
            }
          } catch {}
        });
        
        es.onerror = (error) => {
          console.log("SSE error, attempting reconnect...", error);
          setSseConnected(false);
          es.close();
          
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              connectSSE();
            }, delay);
          }
        };
        
      } catch (error) {
        console.error("Failed to create EventSource:", error);
      }
    };
    
    connectSSE();
    
    // Fallback polling mechanism in case SSE fails
    let pollInterval;
    const startPolling = () => {
      pollInterval = setInterval(() => {
        // Only poll if SSE is not connected
        if (!es || es.readyState === EventSource.CLOSED) {
          if (tagFilter === 'ARCHIVED') {
            loadArchivedNotes().catch(() => {});
          } else {
            loadNotes().catch(() => {});
          }
        }
      }, 30000); // Poll every 30 seconds as fallback
    };
    
    // Start polling after a delay
    const pollTimeout = setTimeout(startPolling, 10000);
    
    // Handle page visibility changes (PWA background/foreground)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Page became visible, reconnect if needed
        if (es && es.readyState === EventSource.CLOSED) {
          connectSSE();
        }
        // Also refresh notes when page becomes visible
        if (tagFilter === 'ARCHIVED') {
          loadArchivedNotes().catch(() => {});
        } else {
          loadNotes().catch(() => {});
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Handle online/offline events
    const handleOnline = () => {
      if (es && es.readyState === EventSource.CLOSED) {
        connectSSE();
      }
    };
    
    window.addEventListener('online', handleOnline);
    
    return () => {
      setSseConnected(false);
      try { 
        if (es) es.close(); 
      } catch {}
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [token]);

  // Live-sync checklist items in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n) return;
    if ((mType || n.type) !== "checklist") return;
    const serverItems = Array.isArray(n.items) ? n.items : [];
    const prevJson = JSON.stringify(prevItemsRef.current || []);
    const serverJson = JSON.stringify(serverItems);
    if (serverJson !== prevJson) {
      setMItems(serverItems);
      prevItemsRef.current = serverItems;
    }
  }, [notes, open, activeId, mType]);

  // No infinite scroll

  // Lock body scroll on modal & image viewer
  useEffect(() => {
    if (!open && !imgViewOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open, imgViewOpen]);

  // Close image viewer if modal closes
  useEffect(() => {
    if (!open) setImgViewOpen(false);
  }, [open]);

  // Keyboard nav for image viewer
  useEffect(() => {
    if (!imgViewOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setImgViewOpen(false);
      if (e.key.toLowerCase() === "d") {
        const im = mImages[imgViewIndex];
        if (im) {
          const fname = normalizeImageFilename(im.name, im.src, imgViewIndex + 1);
          downloadDataUrl(fname, im.src);
        }
      }
      if (e.key === "ArrowRight" && mImages.length > 1) {
        setImgViewIndex((i) => (i + 1) % mImages.length);
      }
      if (e.key === "ArrowLeft" && mImages.length > 1) {
        setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [imgViewOpen, mImages, imgViewIndex]);

  // Auto-resize composer textarea
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";
  }, [content, composerType]);

  // Auto-resize modal textarea with debouncing
  const resizeModalTextarea = useMemo(() => {
    let timeoutId = null;
    return () => {
      const el = mBodyRef.current;
      if (!el) return;
      
      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Debounce the resize to prevent excessive updates
      timeoutId = setTimeout(() => {
        const modalScrollEl = modalScrollRef.current;
        const scrollTop = modalScrollEl?.scrollTop || 0;
        
        // Set a minimum height to prevent layout shifts
        const MIN = 160;
        el.style.height = MIN + "px";
        el.style.height = Math.max(el.scrollHeight, MIN) + "px";
        
        // Restore scroll position
        if (modalScrollEl) {
          modalScrollEl.scrollTop = scrollTop;
        }
      }, 10); // Small delay to batch rapid changes
    };
  }, []);
  useEffect(() => {
    if (!open || mType !== "text") return;
    if (!viewMode) resizeModalTextarea();
  }, [open, viewMode, mBody, mType]);

  // Ensure modal formatting menu hides when switching to view mode or non-text
  useEffect(() => {
    if (viewMode || mType !== "text") setShowModalFmt(false);
  }, [viewMode, mType]);

  // Detect if modal body is scrollable to decide Edited stamp placement
  useEffect(() => {
    if (!open) return;
    const el = modalScrollRef.current;
    if (!el) return;

    const check = () => {
      // +1 fudge factor to avoid off-by-one on some browsers
      setModalScrollable(el.scrollHeight > el.clientHeight + 1);
    };
    check();

    // React to container size changes and window resizes
    let ro;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    window.addEventListener("resize", check);

    // Also recheck shortly after (images rendering, fonts, etc.)
    const t1 = setTimeout(check, 50);
    const t2 = setTimeout(check, 200);

    return () => {
      window.removeEventListener("resize", check);
      clearTimeout(t1);
      clearTimeout(t2);
      ro?.disconnect();
    };
  }, [open, mBody, mTitle, mItems.length, mImages.length, viewMode, mType]);

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
  const signInWithSecret = async (key) => {
    const res = await api("/login/secret", { method: "POST", body: { key } });
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
    const isText = composerType === "text";
    if (isText) {
      if (!title.trim() && !content.trim() && !tags.trim() && composerImages.length === 0) return;
    } else {
      if (!title.trim() && clItems.length === 0) return;
    }
    const nowIso = new Date().toISOString();
    const newNote = {
      id: uid(),
      type: composerType,
      title: title.trim(),
      content: isText ? content : "",
      items: isText ? [] : clItems,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      images: composerImages,
      color: composerColor,
      pinned: false,
      position: Date.now(),
      timestamp: nowIso,
      updated_at: nowIso,
    };
    try {
      const created = await api("/notes", { method: "POST", body: newNote, token });
      setNotes((prev) => [created, ...prev]);
      // reset composer (also collapse back to single input)
      setTitle("");
      setContent("");
      setTags("");
      setComposerImages([]);
      setComposerColor("default");
      setClItems([]);
      setClInput("");
      setComposerType("text");
      setComposerCollapsed(true);
      if (contentRef.current) contentRef.current.style.height = "auto";
    } catch (e) {
      alert(e.message || "Failed to add note");
    }
  };

  /** -------- Download single note .md -------- */
  const handleDownloadNote = (note) => {
    const md = mdForDownload(note);
    const fname = sanitizeFilename(note.title || `note-${note.id}`) + ".md";
    downloadText(fname, md);
  };

  /** -------- Archive/Unarchive note -------- */
  const handleArchiveNote = async (noteId, archived) => {
    try {
      await api(`/notes/${noteId}/archive`, { method: "POST", token, body: { archived } });
      
      // Reload appropriate notes based on current view
      if (tagFilter === 'ARCHIVED') {
        await loadArchivedNotes();
      } else {
        await loadNotes();
      }
      
      if (archived) {
        closeModal();
      }
    } catch (e) {
      alert(e.message || "Failed to archive note");
    }
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

  /** -------- Import Google Keep single-note JSON files (multiple) -------- */
  const importGKeep = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const texts = await Promise.all(files.map((f) => f.text().catch(() => null)));
      const notesArr = [];
      for (const t of texts) {
        if (!t) continue;
        try {
          const obj = JSON.parse(t);
          if (!obj || typeof obj !== "object") continue;
          const title = String(obj.title || "");
          const hasChecklist = Array.isArray(obj.listContent) && obj.listContent.length > 0;
          const items = hasChecklist
            ? obj.listContent.map((it) => ({ id: uid(), text: String(it?.text || ""), done: !!it?.isChecked }))
            : [];
          const content = hasChecklist ? "" : String(obj.textContent || "");
          const usec = Number(obj.userEditedTimestampUsec || obj.createdTimestampUsec || 0);
          const ms = Number.isFinite(usec) && usec > 0 ? Math.floor(usec / 1000) : Date.now();
          const timestamp = new Date(ms).toISOString();
          // Extract labels to tags
          const tags = Array.isArray(obj.labels)
            ? obj.labels.map((l) => (typeof l?.name === 'string' ? l.name.trim() : '')).filter(Boolean)
            : [];
          notesArr.push({
            id: uid(),
            type: hasChecklist ? "checklist" : "text",
            title,
            content,
            items,
            tags,
            images: [],
            color: "default",
            pinned: !!obj.isPinned,
            position: ms,
            timestamp,
          });
        } catch {}
      }
      if (!notesArr.length) { alert("No valid Google Keep notes found."); return; }
      await api("/notes/import", { method: "POST", token, body: { notes: notesArr } });
      await loadNotes();
      alert(`Imported ${notesArr.length} Google Keep note(s).`);
    } catch (e) {
      alert(e.message || "Google Keep import failed");
    }
  };

  /** -------- Import Markdown files (multiple) -------- */
  const importMd = async (fileList) => {
    try {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      const notesArr = [];
      
      for (const file of files) {
        try {
          const text = await file.text();
          const lines = text.split('\n');
          
          // Extract title from first line if it starts with #
          let title = "";
          let contentStartIndex = 0;
          
          if (lines[0] && lines[0].trim().startsWith('#')) {
            // Remove # symbols and trim
            title = lines[0].replace(/^#+\s*/, '').trim();
            contentStartIndex = 1;
          } else {
            // Use filename as title (without .md extension)
            title = file.name.replace(/\.md$/i, '');
          }
          
          // Join remaining lines as content
          const content = lines.slice(contentStartIndex).join('\n').trim();
          
          if (title || content) {
            notesArr.push({
              id: uid(),
              type: "text",
              title,
              content,
              items: [],
              tags: [],
              images: [],
              color: "default",
              pinned: false,
              timestamp: new Date().toISOString(),
            });
          }
        } catch (e) {
          console.error(`Failed to process file ${file.name}:`, e);
        }
      }
      
      if (!notesArr.length) { 
        alert("No valid markdown files found."); 
        return; 
      }
      
      await api("/notes/import", { method: "POST", token, body: { notes: notesArr } });
      await loadNotes();
      alert(`Imported ${notesArr.length} markdown file(s) successfully.`);
    } catch (e) {
      alert(e.message || "Markdown import failed");
    }
  };

  /** -------- Collaboration actions -------- */
  const addCollaborator = async (username) => {
    try {
      if (!activeId) return;
      
      // Add collaborator to the note
      await api(`/notes/${activeId}/collaborate`, { 
        method: "POST", 
        token, 
        body: { username } 
      });
      
      // Update local note with collaborator info
      setNotes((prev) => prev.map((n) => 
        String(n.id) === String(activeId) 
          ? { 
              ...n, 
              collaborators: [...(n.collaborators || []), username],
              lastEditedBy: currentUser?.email || currentUser?.name,
              lastEditedAt: new Date().toISOString()
            }
          : n
      ));
      
      alert(`Added ${username} as collaborator successfully!`);
    } catch (e) {
      alert(e.message || "Failed to add collaborator");
    }
  };

  /** -------- Secret Key actions -------- */
  const downloadSecretKey = async () => {
    try {
      const data = await api("/secret-key", { method: "POST", token });
      if (!data?.key) throw new Error("Secret key not returned by server.");
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const fname = `glass-keep-secret-key-${ts}.txt`;
      const content =
        `Glass Keep — Secret Recovery Key\n\n` +
        `Keep this key safe. Anyone with this key can sign in as you.\n\n` +
        `Secret Key:\n${data.key}\n\n` +
        `Instructions:\n` +
        `1) Go to the login page.\n` +
        `2) Click "Forgot username/password?".\n` +
        `3) Choose "Sign in with Secret Key" and paste this key.\n`;
      downloadText(fname, content);
      alert("Secret key downloaded. Store it in a safe place.");
    } catch (e) {
      alert(e.message || "Could not generate secret key.");
    }
  };

  /** -------- Modal tag helpers -------- */
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
    setSidebarOpen(false);
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    setMBody(n.content || "");
    skipNextItemsAutosave.current = true;
    setMItems(Array.isArray(n.items) ? n.items : []);
    prevItemsRef.current = Array.isArray(n.items) ? n.items : [];
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
    setShowModalFmt(false);
  };
  const saveModal = async () => {
    if (activeId == null) return;
    const base = {
      id: activeId,
      title: mTitle.trim(),
      tags: mTagList,
      images: mImages,
      color: mColor,
      pinned: !!notes.find(n=>String(n.id)===String(activeId))?.pinned,
    };
    const payload =
      mType === "text"
        ? { ...base, type: "text", content: mBody, items: [] }
        : { ...base, type: "checklist", content: "", items: mItems };

    try {
      setSavingModal(true);
      await api(`/notes/${activeId}`, { method: "PUT", token, body: payload });
      prevItemsRef.current = mType === "checklist" ? (Array.isArray(mItems) ? mItems : []) : [];
      // Also update updated_at locally so the Edited stamp updates immediately
      const nowIso = new Date().toISOString();
      setNotes((prev) => prev.map((n) =>
        (String(n.id) === String(activeId) ? { 
          ...n, 
          ...payload, 
          updated_at: nowIso,
          lastEditedBy: currentUser?.email || currentUser?.name,
          lastEditedAt: nowIso
        } : n)
      ));
      closeModal();
    } catch (e) {
      alert(e.message || "Failed to save note");
    } finally {
      setSavingModal(false);
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

  /** -------- Drag & Drop reorder (cards) -------- */
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

  /** -------- Tags list (unique + counts) -------- */
  const tagsWithCounts = useMemo(() => {
    const map = new Map();
    for (const n of notes) {
      for (const t of (n.tags || [])) {
        const key = String(t).trim();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.toLowerCase().localeCompare(b.tag.toLowerCase()));
  }, [notes]);

  /** -------- Derived lists (search + tag filter) -------- */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const tag = tagFilter === ALL_IMAGES ? null : (tagFilter === 'ARCHIVED' ? null : (tagFilter?.toLowerCase() || null));

    return notes.filter((n) => {
      if (tagFilter === ALL_IMAGES) {
        if (!(n.images && n.images.length)) return false;
      } else if (tagFilter === 'ARCHIVED') {
        // In archived view, show all notes (they're already filtered by the backend)
        // Just apply search filter
      } else if (tag && !(n.tags || []).some((t) => String(t).toLowerCase() === tag)) {
        return false;
      }
      if (!q) return true;
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();
      const tagsStr = (n.tags || []).join(" ").toLowerCase();
      const items = (n.items || []).map((i) => i.text).join(" ").toLowerCase();
      const images = (n.images || []).map((im) => im.name).join(" ").toLowerCase();
      return t.includes(q) || c.includes(q) || tagsStr.includes(q) || items.includes(q) || images.includes(q);
    });
  }, [notes, search, tagFilter]);
  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);
  const filteredEmptyWithSearch = filtered.length === 0 && notes.length > 0 && !!(search || (tagFilter && tagFilter !== 'ARCHIVED'));
  const allEmpty = notes.length === 0;

  /** -------- Modal link handler: open links in new tab (no auto-enter edit) -------- */
  const onModalBodyClick = (e) => {
    if (!(viewMode && mType === "text")) return;

    const a = e.target.closest("a");
    if (a) {
      const href = a.getAttribute("href") || "";
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
    }
    // NO automatic edit-mode toggle
  };

  /** -------- Image viewer helpers -------- */
  const openImageViewer = (index) => {
    setImgViewIndex(index);
    setImgViewOpen(true);
  };
  const closeImageViewer = () => setImgViewOpen(false);
  const nextImage = () => setImgViewIndex((i) => (i + 1) % mImages.length);
  const prevImage = () => setImgViewIndex((i) => (i - 1 + mImages.length) % mImages.length);

  /** -------- Formatting actions (composer & modal) -------- */
  const runFormat = (getter, setter, ref, type) => {
    const el = ref.current;
    if (!el) return;
    const value = getter();
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;

    // Insert defaults when editor is empty for quote / ul / ol
    if ((type === "ul" || type === "ol" || type === "quote") && value.trim().length === 0) {
      const snippet = type === "ul" ? "- " : type === "ol" ? "1. " : "> ";
      setter(snippet);
      requestAnimationFrame(() => {
        el.focus();
        try { el.setSelectionRange(snippet.length, snippet.length); } catch {}
      });
      return;
    }

    let result;
    switch (type) {
      case "h1": result = prefixLines(value, start, end, "# "); break;
      case "h2": result = prefixLines(value, start, end, "## "); break;
      case "h3": result = prefixLines(value, start, end, "### "); break;
      case "bold": result = wrapSelection(value, start, end, "**", "**"); break;
      case "italic": result = wrapSelection(value, start, end, "_", "_"); break;
      case "strike": result = wrapSelection(value, start, end, "~~", "~~"); break;
      case "code": result = wrapSelection(value, start, end, "`", "`"); break;
      case "codeblock": result = fencedBlock(value, start, end); break;
      case "quote": result = prefixLines(value, start, end, "> "); break;
      case "ul": result = toggleList(value, start, end, "ul"); break;
      case "ol": result = toggleList(value, start, end, "ol"); break;
      case "link": result = wrapSelection(value, start, end, "[", "](https://)"); break;
      default: return;
    }
    setter(result.text);
    requestAnimationFrame(() => {
      el.focus();
      try {
        el.setSelectionRange(result.range[0], result.range[1]);
      } catch {}
    });
  };
  const formatComposer = (type) => runFormat(() => content, setContent, contentRef, type);
  const formatModal = (type) => runFormat(() => mBody, setMBody, mBodyRef, type);

  /** Composer smart-enter handler */
  const onComposerKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = contentRef.current;
    if (!el) return;
    const value = content;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const res = handleSmartEnter(value, start, end);
    if (res) {
      e.preventDefault();
      setContent(res.text);
      requestAnimationFrame(() => {
        try { el.setSelectionRange(res.range[0], res.range[1]); } catch {}
        el.style.height = "auto";
        el.style.height = el.scrollHeight + "px";
      });
    }
  };

  /** Add copy buttons to code (view mode, text notes) */
  useEffect(() => {
    if (!(open && viewMode && mType === "text")) return;
    const root = noteViewRef.current;
    if (!root) return;

    const attach = () => {
      // Wrap code blocks so the copy button can stay fixed even on horizontal scroll
      root.querySelectorAll("pre").forEach((pre) => {
        // Ensure wrapper
        let wrapper = pre.closest('.code-block-wrapper');
        if (!wrapper) {
          wrapper = document.createElement('div');
          wrapper.className = 'code-block-wrapper';
          pre.parentNode?.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        }
        if (wrapper.querySelector('.code-copy-btn')) return;
        const btn = document.createElement("button");
        btn.className = "code-copy-btn";
        btn.textContent = "Copy";
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const codeEl = pre.querySelector("code");
          const text = codeEl ? codeEl.textContent : pre.textContent;
          navigator.clipboard?.writeText(text || "");
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        });
        wrapper.appendChild(btn);
      });

      // Inline code
      root.querySelectorAll("code").forEach((code) => {
        if (code.closest("pre")) return; // skip fenced
        if (
          code.nextSibling &&
          code.nextSibling.nodeType === 1 &&
          code.nextSibling.classList?.contains("inline-code-copy-btn")
        )
          return;
        const btn = document.createElement("button");
        btn.className = "inline-code-copy-btn";
        btn.textContent = "Copy";
        btn.setAttribute("data-copy-btn", "1");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard?.writeText(code.textContent || "");
          btn.textContent = "Copied";
          setTimeout(() => (btn.textContent = "Copy"), 1200);
        });
        code.insertAdjacentElement("afterend", btn);
      });
    };

    attach();
    // Ensure buttons after layout/async renders
    requestAnimationFrame(attach);
    const t1 = setTimeout(attach, 50);
    const t2 = setTimeout(attach, 200);

    // Observe DOM changes while in view mode
    const mo = new MutationObserver(() => attach());
    try {
      mo.observe(root, { childList: true, subtree: true });
    } catch {}

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      mo.disconnect();
    };
  }, [open, viewMode, mType, mBody, activeId]);

  /** -------- Modal JSX -------- */
  const modal = open && (
    <>
      <div
        className="modal-scrim fixed inset-0 bg-black/40 backdrop-blur-md z-40 flex items-center justify-center transition-opacity duration-300 overscroll-contain"
        onMouseDown={(e) => {
          // Only consider closing if the press STARTS on the scrim
          scrimClickStartRef.current = (e.target === e.currentTarget);
        }}
        onClick={(e) => {
          // Close only if press started AND ended on scrim (prevents drag-outside-close)
          if (scrimClickStartRef.current && e.target === e.currentTarget) {
            closeModal();
          }
          scrimClickStartRef.current = false;
        }}
      >
        <div
          className="glass-card rounded-xl shadow-2xl w-11/12 max-w-2xl h-[80vh] flex flex-col relative overflow-hidden"
          style={{ backgroundColor: modalBgFor(mColor, dark) }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scroll container */}
          <div
            ref={modalScrollRef}
            className="relative flex-1 min-h-0 overflow-y-auto overflow-x-auto"
          >
            {/* Sticky header (kept single line on desktop, wraps on mobile) */}
            <div
              className="sticky top-0 z-20 px-4 sm:px-6 pt-4 pb-3 modal-header-blur rounded-t-xl"
              style={{ backgroundColor: modalBgFor(mColor, dark) }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="flex-[1_0_50%] min-w-[240px] shrink-0 bg-transparent text-2xl font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none pr-2"
                  value={mTitle}
                  onChange={(e) => setMTitle(e.target.value)}
                  placeholder="Title"
                />
                <div className="flex items-center gap-2 flex-none ml-auto">
                  {/* Collaboration button */}
                  <button
                    className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 relative"
                    title="Collaborate"
                    onClick={() => setCollaborationModalOpen(true)}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                    </svg>
                    <svg className="w-3 h-3 absolute -top-1 -right-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
                    </svg>
                  </button>

                  {/* View/Edit toggle only for TEXT notes */}
                  {mType === "text" && (
                    <button
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                      onClick={() => { setViewMode((v) => !v); setShowModalFmt(false); }}
                      title={viewMode ? "Switch to Edit mode" : "Switch to View mode"}
                    >
                      {viewMode ? "Edit mode" : "View mode"}
                    </button>
                  )}

                  {mType === "text" && !viewMode && (
                    <>
                      <button
                        ref={modalFmtBtnRef}
                        className="rounded-full p-2.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        title="Formatting"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowModalFmt((v) => !v);
                        }}
                      >
                        <FormatIcon />
                      </button>
                      <Popover
                        anchorRef={modalFmtBtnRef}
                        open={showModalFmt}
                        onClose={() => setShowModalFmt(false)}
                      >
                        <FormatToolbar dark={dark} onAction={(t) => { setShowModalFmt(false); formatModal(t); }} />
                      </Popover>
                    </>
                  )}

                  <button
                    ref={modalMenuBtnRef}
                    className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="More options"
                    onClick={(e) => { e.stopPropagation(); setModalMenuOpen((v) => !v); }}
                  >
                    <Kebab />
                  </button>
                  <Popover
                    anchorRef={modalMenuBtnRef}
                    open={modalMenuOpen}
                    onClose={() => setModalMenuOpen(false)}
                  >
                    <div
                      className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                        onClick={() => { const n = notes.find(nn => String(nn.id) === String(activeId)); if (n) handleDownloadNote(n); setModalMenuOpen(false); }}
                      >
                        Download .md
                      </button>
                      <button
                        className={`block w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                        onClick={() => { 
                          const note = notes.find(nn => String(nn.id) === String(activeId));
                          if (note) {
                            handleArchiveNote(activeId, !note.archived);
                            setModalMenuOpen(false);
                          }
                        }}
                      >
                        {activeNoteObj?.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        className={`block w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                        onClick={() => { setConfirmDeleteOpen(true); setModalMenuOpen(false); }}
                      >
                        Delete
                      </button>
                    </div>
                  </Popover>

                  <button
                    className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Pin/unpin"
                    onClick={() => activeId != null && togglePin(activeId, !(notes.find((n) => String(n.id) === String(activeId))?.pinned))}
                  >
                    {(notes.find((n) => String(n.id) === String(activeId))?.pinned) ? <PinFilled /> : <PinOutline />}
                  </button>

                  <button
                    className="rounded-full p-2.5 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    title="Close"
                    onClick={closeModal}
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
            </div>

            {/* Content area */}
            <div className="p-6" onClick={onModalBodyClick}>
              {/* Images */}
              {mImages.length > 0 && (
                <div className="mb-5 flex gap-3 overflow-x-auto">
                  {mImages.map((im, idx) => (
                    <div key={im.id} className="relative inline-block">
                      <img
                        src={im.src}
                        alt={im.name}
                        className="h-40 md:h-56 w-auto object-cover rounded-md border border-[var(--border-light)] cursor-zoom-in"
                        onClick={(e) => { e.stopPropagation(); openImageViewer(idx); }}
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
                    ref={noteViewRef}
                    className="note-content note-content--dense whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: marked.parse(mBody || "") }}
                  />
                ) : (
                  <div className="relative min-h-[160px]">
                    <textarea
                      ref={mBodyRef}
                      className="w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[160px]"
                      value={mBody}
                      onChange={(e) => { setMBody(e.target.value); resizeModalTextarea(); }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                          const el = mBodyRef.current;
                          const value = mBody;
                          const start = el.selectionStart ?? value.length;
                          const end = el.selectionEnd ?? value.length;
                          const res = handleSmartEnter(value, start, end);
                          if (res) {
                            e.preventDefault();
                            setMBody(res.text);
                            requestAnimationFrame(() => {
                              try { el.setSelectionRange(res.range[0], res.range[1]); } catch {}
                              resizeModalTextarea();
                            });
                          }
                        }
                      }}
                      placeholder="Write your note…"
                    />
                  </div>
                )
              ) : (
                <div className="space-y-4 md:space-y-2">
                  {/* Add new item row (both modes keep it visible for quick add) */}
                  <div className="flex gap-2">
                    <input
                      value={mInput}
                      onChange={(e) => setMInput(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const t = mInput.trim();
                          if (t) {
                            const newItems = [...mItems, { id: uid(), text: t, done: false }];
                            setMItems(newItems);
                            setMInput("");
                            try {
                              if (activeId) {
                                await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                prevItemsRef.current = newItems;
                              }
                            } catch {}
                          }
                        }
                      }}
                      placeholder="List item… (press Enter to add)"
                      className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                    />
                    <button
                      onClick={async () => { 
                        const t = mInput.trim();
                        if (t) { 
                          const newItems = [...mItems, { id: uid(), text: t, done: false }];
                          setMItems(newItems);
                          setMInput("");
                          try {
                            if (activeId) {
                              await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                              prevItemsRef.current = newItems;
                            }
                          } catch {}
                        } 
                      }}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Add
                    </button>
                  </div>

                  {mItems.length > 0 ? (
                    <div className="space-y-4 md:space-y-2">
                      {/* Unchecked items */}
                      {mItems.filter(it => !it.done).map((it) => (
                        <ChecklistRow
                          key={it.id}
                          item={it}
                          readOnly={viewMode}
                          disableToggle={false}      /* allow toggle in view mode */
                          showRemove={true}          /* show delete X in view mode */
                          size="lg"                  /* bigger checkboxes and X in modal */
                          onToggle={async (checked) => {
                            const newItems = mItems.map(p => p.id === it.id ? { ...p, done: checked } : p);
                            setMItems(newItems);
                            try {
                              if (activeId) {
                                await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                prevItemsRef.current = newItems;
                              }
                            } catch {}
                          }}
                          onChange={async (txt) => {
                            const newItems = mItems.map(p => p.id === it.id ? { ...p, text: txt } : p);
                            setMItems(newItems);
                            try {
                              if (activeId) {
                                await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                prevItemsRef.current = newItems;
                              }
                            } catch {}
                          }}
                          onRemove={async () => {
                            const newItems = mItems.filter(p => p.id !== it.id);
                            setMItems(newItems);
                            try {
                              if (activeId) {
                                await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                prevItemsRef.current = newItems;
                              }
                            } catch {}
                          }}
                        />
                      ))}
                      
                      {/* Done section */}
                      {mItems.filter(it => it.done).length > 0 && (
                        <>
                          <div className="border-t border-[var(--border-light)] pt-4 mt-4">
                            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">Done</h4>
                            {mItems.filter(it => it.done).map((it) => (
                              <ChecklistRow
                                key={it.id}
                                item={it}
                                readOnly={viewMode}
                                disableToggle={false}      /* allow toggle in view mode */
                                showRemove={true}          /* show delete X in view mode */
                                size="lg"                  /* bigger checkboxes and X in modal */
                                onToggle={async (checked) => {
                                  const newItems = mItems.map(p => p.id === it.id ? { ...p, done: checked } : p);
                                  setMItems(newItems);
                                  try {
                                    if (activeId) {
                                      await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                      prevItemsRef.current = newItems;
                                    }
                                  } catch {}
                                }}
                                onChange={async (txt) => {
                                  const newItems = mItems.map(p => p.id === it.id ? { ...p, text: txt } : p);
                                  setMItems(newItems);
                                  try {
                                    if (activeId) {
                                      await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                      prevItemsRef.current = newItems;
                                    }
                                  } catch {}
                                }}
                                onRemove={async () => {
                                  const newItems = mItems.filter(p => p.id !== it.id);
                                  setMItems(newItems);
                                  try {
                                    if (activeId) {
                                      await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                      prevItemsRef.current = newItems;
                                    }
                                  } catch {}
                                }}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : <p className="text-sm text-gray-500">No items yet.</p>}
                </div>
              )}

              {/* Inline Edited stamp: only when scrollable (appears at very end) */}
              {editedStamp && modalScrollable && (
                <div className="mt-6 text-xs text-gray-600 dark:text-gray-300 text-right">
                  Edited: {editedStamp}
                </div>
              )}
            </div>

            {/* Absolute Edited stamp: only when NOT scrollable (sits just above footer) */}
            {editedStamp && !modalScrollable && (
              <div className="absolute bottom-3 right-4 text-xs text-gray-600 dark:text-gray-300 pointer-events-none">
                Edited: {editedStamp}
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
              {/* Color dropdown (modal) */}
              <button
                ref={modalColorBtnRef}
                type="button"
                onClick={() => setShowModalColorPop((v) => !v)}
                className="px-2 py-1 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                title="Color"
              >
                🎨 Color
              </button>
              <Popover
                anchorRef={modalColorBtnRef}
                open={showModalColorPop}
                onClose={() => setShowModalColorPop(false)}
              >
                <div className={`fmt-pop ${dark ? "bg-gray-800 text-gray-100" : "bg-white text-gray-800"}`}>
                  <div className="grid grid-cols-6 gap-2">
                    {COLOR_ORDER.filter((name) => LIGHT_COLORS[name]).map((name) => (
                      <ColorDot
                        key={name}
                        name={name}
                        darkMode={dark}
                        selected={mColor === name}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMColor(name);
                          setShowModalColorPop(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              </Popover>

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
                className="p-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                title="Add images"
              >
                <ImageIcon />
              </button>

              {modalHasChanges && (
                <button
                  onClick={saveModal}
                  disabled={savingModal}
                  className={`px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 whitespace-nowrap ${savingModal ? "bg-indigo-400 text-white cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500"}`}
                >
                  {savingModal ? "Saving..." : "Save"}
                </button>
              )}
              {/* Delete button moved to modal 3-dot menu */}
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

          {/* Collaboration Modal */}
          {collaborationModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setCollaborationModalOpen(false)}
              />
              <div
                className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative"
                style={{ backgroundColor: dark ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.95)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold mb-4">Add Collaborator</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  Enter the username of the person you want to collaborate with on this note.
                </p>
                <input
                  type="text"
                  value={collaboratorUsername}
                  onChange={(e) => setCollaboratorUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent"
                />
                <div className="mt-5 flex justify-end gap-3">
                  <button
                    className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={() => setCollaborationModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    onClick={async () => {
                      if (collaboratorUsername.trim()) {
                        await addCollaborator(collaboratorUsername.trim());
                        setCollaboratorUsername("");
                        setCollaborationModalOpen(false);
                      }
                    }}
                  >
                    Add Collaborator
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Image Viewer */}
      {imgViewOpen && mImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeImageViewer(); }}
        >
          {/* Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              className="px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20"
              title="Download (D)"
              onClick={async (e) => {
                e.stopPropagation();
                const im = mImages[imgViewIndex];
                if (im) {
                  const fname = normalizeImageFilename(im.name, im.src, imgViewIndex + 1);
                  await downloadDataUrl(fname, im.src);
                }
              }}
            >
              <DownloadIcon />
            </button>
            <button
              className="px-3 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20"
              title="Close (Esc)"
              onClick={(e) => { e.stopPropagation(); closeImageViewer(); }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Prev / Next */}
          {mImages.length > 1 && (
            <>
              <button
                className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 p-3 bg-white/10 text-white rounded-full hover:bg-white/20"
                title="Previous (←)"
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
              >
                <ArrowLeft />
              </button>
              <button
                className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 p-3 bg-white/10 text-white rounded-full hover:bg-white/20"
                title="Next (→)"
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
              >
                <ArrowRight />
              </button>
            </>
          )}

          {/* Image */}
          <img
            src={mImages[imgViewIndex].src}
            alt={mImages[imgViewIndex].name || `image-${imgViewIndex+1}`}
            className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Caption */}
          <div className="absolute bottom-6 px-3 py-1 rounded bg-black/50 text-white text-xs">
            {mImages[imgViewIndex].name || `image-${imgViewIndex+1}`}
            {mImages.length > 1 ? `  (${imgViewIndex+1}/${mImages.length})` : ""}
          </div>
        </div>
      )}
    </>
  );

  // Redirect if already logged in
  useEffect(() => {
    if (currentUser?.email && route !== "#/notes" && route !== "#/admin") navigate("#/notes");
  }, [currentUser]); // eslint-disable-line

  // Close sidebar when navigating away or opening modal
  useEffect(() => {
    if (open) setSidebarOpen(false);
  }, [open]);

  // ---- Routing ----
  if (route === "#/admin") {
    if (!currentUser?.email) {
      return (
        <AuthShell title="Admin Panel" dark={dark} onToggleDark={toggleDark}>
          <p className="text-sm mb-4">
            You must sign in as an admin to view this page.
          </p>
          <button
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            onClick={() => (window.location.hash = "#/login")}
          >
            Go to Sign In
          </button>
        </AuthShell>
      );
    }
    if (!currentUser?.is_admin) {
      return (
        <AuthShell title="Admin Panel" dark={dark} onToggleDark={toggleDark}>
          <p className="text-sm">Not authorized. Your account is not an admin.</p>
          <button
            className="mt-4 px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => (window.location.hash = "#/notes")}
          >
            Back to Notes
          </button>
        </AuthShell>
      );
    }
    return (
      <AdminView
        token={token}
        currentUser={currentUser}
        dark={dark}
        onToggleDark={toggleDark}
        onBackToNotes={() => (window.location.hash = "#/notes")}
      />
    );
  }

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
    if (route === "#/login-secret") {
      return (
        <SecretLoginView
          dark={dark}
          onToggleDark={toggleDark}
          onLoginWithKey={signInWithSecret}
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
        goSecret={() => navigate("#/login-secret")}
      />
    );
  }

  return (
    <>
      {/* Tag Sidebar / Drawer */}
      <TagSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        tagsWithCounts={tagsWithCounts}
        activeTag={tagFilter}
        onSelect={(tag) => setTagFilter(tag)}
        dark={dark}
      />

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
        onImportGKeep={importGKeep}
        onImportMd={importMd}
        onDownloadSecretKey={downloadSecretKey}
        importFileRef={importFileRef}
        gkeepFileRef={gkeepFileRef}
        mdFileRef={mdFileRef}
        headerMenuOpen={headerMenuOpen}
        setHeaderMenuOpen={setHeaderMenuOpen}
        headerMenuRef={headerMenuRef}
        headerBtnRef={headerBtnRef}
        openSidebar={() => setSidebarOpen(true)}
        activeTagFilter={tagFilter}
        // formatting props
        formatComposer={formatComposer}
        showComposerFmt={showComposerFmt}
        setShowComposerFmt={setShowComposerFmt}
        composerFmtBtnRef={composerFmtBtnRef}
        onComposerKeyDown={onComposerKeyDown}
        // collapsed composer
        composerCollapsed={composerCollapsed}
        setComposerCollapsed={setComposerCollapsed}
        titleRef={titleRef}
        // color popover
        colorBtnRef={colorBtnRef}
        showColorPop={showColorPop}
        setShowColorPop={setShowColorPop}
        // loading
        notesLoading={notesLoading}
        // multi-select
        multiMode={multiMode}
        selectedIds={selectedIds}
        onStartMulti={onStartMulti}
        onExitMulti={onExitMulti}
        onToggleSelect={onToggleSelect}
        onSelectAllPinned={onSelectAllPinned}
        onSelectAllOthers={onSelectAllOthers}
        onBulkDelete={onBulkDelete}
        onBulkPin={onBulkPin}
        onBulkColor={onBulkColor}
        onBulkDownloadZip={onBulkDownloadZip}
        // view mode
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        // SSE connection status
        sseConnected={sseConnected}
        loadNotes={loadNotes}
        loadArchivedNotes={loadArchivedNotes}
      />
      {modal}
    </>
  );
}
