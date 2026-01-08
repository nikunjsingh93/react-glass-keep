import React, { useEffect, useMemo, useRef, useState, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { marked as markedParser } from "marked";
import DrawingCanvas from "./DrawingCanvas";

// Ensure we can call marked.parse(...)
const marked =
  typeof markedParser === "function" ? { parse: markedParser } : markedParser;

/** ---------- API Helpers ---------- */
const API_BASE = "/api";
const AUTH_KEY = "glass-keep-auth";

const getAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(AUTH_KEY) || "null");
  } catch (e) {
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
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (res.status === 204) return null;
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    
    // Handle token expiration (401 Unauthorized)
    if (res.status === 401) {
      // Clear auth from localStorage
      try {
        localStorage.removeItem(AUTH_KEY);
      } catch (e) {
        console.error("Error clearing auth:", e);
      }
      
      // Dispatch a custom event so the app can handle it
      window.dispatchEvent(new CustomEvent('auth-expired'));
      
      const err = new Error(data?.error || "Session expired. Please log in again.");
      err.status = res.status;
      err.isAuthError = true;
      throw err;
    }
    
    if (!res.ok) {
      const err = new Error(data?.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  } catch (error) {
    // Handle network errors, timeouts, etc.
    if (error.name === 'AbortError') {
      const err = new Error("Request timeout. Please check your connection.");
      err.status = 408;
      err.isNetworkError = true;
      throw err;
    }
    
    // Re-throw auth errors as-is
    if (error.isAuthError) {
      throw error;
    }
    
    // Handle fetch failures (network errors, CORS, etc.)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      const err = new Error("Network error. Please check your connection.");
      err.status = 0;
      err.isNetworkError = true;
      throw err;
    }
    
    // Re-throw other errors
    throw error;
  }
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

// Settings icon
const SettingsIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

// Grid view icon
const GridIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);

// List view icon
const ListIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
  </svg>
);

// Sun icon (light mode)
const SunIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

// Moon icon (dark mode)
const MoonIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9 9 0 008.354-5.646z"/>
  </svg>
);

// Multi-select icon (checkbox)
const CheckSquareIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4"/>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
  </svg>
);

// Admin/Shield icon
const ShieldIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
  </svg>
);

// Sign out/Logout icon
const LogOutIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
  </svg>
);

// Archive icon
const ArchiveIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>
  </svg>
);

// Pin icon (using the same icon as individual notes)
const PinIcon = () => (
  <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.5V22H12.5V16H18V14L16,12Z" />
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
  } catch (e) {
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
        onChange={(e) => {
          e.stopPropagation();
          onToggle?.(e.target.checked, e);
        }}
        onClick={(e) => e.stopPropagation()}
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
    document.addEventListener("mousedown", onDown, true); // useCapture: true
    return () => document.removeEventListener("mousedown", onDown, true);
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

/** ---------- Drawing Preview ---------- */
function DrawingPreview({ data, width, height, darkMode = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Parse drawing data
    let paths = [];
    let originalWidth = 800; // Default canvas width
    let originalHeight = 600; // Default canvas height
    let firstPageHeight = 600; // Height of first page for filtering
    try {
      let parsedData;
      if (typeof data === 'string') {
        parsedData = JSON.parse(data) || [];
      } else {
        parsedData = data;
      }

      // Handle both old format (array) and new format (object with paths and dimensions)
      if (Array.isArray(parsedData)) {
        // Old format: just an array of paths
        paths = parsedData;
      } else if (parsedData && typeof parsedData === 'object' && Array.isArray(parsedData.paths)) {
        // New format: object with paths and dimensions
        paths = parsedData.paths;
        if (parsedData.dimensions && parsedData.dimensions.width && parsedData.dimensions.height) {
          originalWidth = parsedData.dimensions.width;
          originalHeight = parsedData.dimensions.height;
          // First page height: use originalHeight if stored, otherwise estimate
          // If originalHeight is stored, use it; otherwise, if height > 1000, assume it was doubled
          if (parsedData.dimensions.originalHeight) {
            firstPageHeight = parsedData.dimensions.originalHeight;
          } else if (originalHeight > 1000) {
            // Likely doubled, estimate first page as half (common sizes: 450->900, 850->1700)
            firstPageHeight = originalHeight / 2;
          } else {
            // No pages added yet, use current height
            firstPageHeight = originalHeight;
          }
        }
      } else {
        paths = [];
      }
    } catch (e) {
      // Invalid data, show empty preview
      return;
    }

    // Filter paths to only show those in the first page (y coordinate < firstPageHeight)
    // For preview, we only want to show the first page
    paths = paths.filter(path => {
      if (!path.points || path.points.length === 0) return false;
      // Check if any point in the path is within the first page
      return path.points.some(point => point.y < firstPageHeight);
    });

    // Convert black/white strokes based on current theme for optimal contrast
    paths = paths.map(path => {
      // Only convert black/white strokes for better contrast, keep other colors as-is
      if (darkMode) {
        // In dark mode, ensure black strokes are white for visibility
        if (path.color === '#000000') {
          return { ...path, color: '#FFFFFF' };
        }
      } else {
        // In light mode, ensure white strokes are black for visibility
        if (path.color === '#FFFFFF') {
          return { ...path, color: '#000000' };
        }
      }
      return path;
    });

    // Scale factor to fit drawing in preview - use firstPageHeight to avoid blank space
    const scaleX = width / originalWidth;
    const scaleY = height / firstPageHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate preview dimensions (only first page, no blank space)
    const previewWidth = width;
    const previewHeight = firstPageHeight * scale;
    
    // Set canvas dimensions to match preview size (no blank space below)
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    
    // Clear canvas with calculated dimensions
    ctx.clearRect(0, 0, previewWidth, previewHeight);

    if (paths.length === 0) {
      // Draw a subtle placeholder
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(10, 10, previewWidth - 20, previewHeight - 20);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Empty', previewWidth / 2, previewHeight / 2 + 3);
      return;
    }

    // Draw paths at scaled size
    paths.forEach(path => {
      if (path.points && path.points.length > 0) {
        ctx.strokeStyle = path.color;
        ctx.lineWidth = Math.max(1, path.size * scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (path.tool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
        } else {
          ctx.globalCompositeOperation = 'source-over';
        }

        ctx.beginPath();
        ctx.moveTo(path.points[0].x * scale, path.points[0].y * scale);

        for (let i = 1; i < path.points.length; i++) {
          ctx.lineTo(path.points[i].x * scale, path.points[i].y * scale);
        }

        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
    });
  }, [data, width, height, darkMode]);

  return (
    <div className="flex items-center justify-center h-32 rounded overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      />
    </div>
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
  // online status
  isOnline = true,
  // checklist update callback
  onUpdateChecklistItem,
  currentUser,
}) {
  
  const isChecklist = n.type === "checklist";
  const isDraw = n.type === "draw";
  const previewText = useMemo(() => mdToPlain(n.content || ""), [n.content]);
  const MAX_CHARS = 600;
  const isLong = previewText.length > MAX_CHARS;
  const displayText = isLong ? previewText.slice(0, MAX_CHARS).trimEnd() + "…" : previewText;

  const total = (n.items || []).length;
  const done = (n.items || []).filter((i) => i.done).length;
  // Sort items with unchecked items first, just like in the modal
  const sortedItems = (n.items || []).sort((a, b) => {
    if (a.done === b.done) return 0; // Same status, maintain order
    return a.done ? 1 : -1; // Unchecked (false) comes before checked (true)
  });
  const visibleItems = sortedItems.slice(0, 8);
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
      onClick={(e) => {
        if (multiMode) {
          // In multi-select mode, clicking anywhere toggles selection
          e.stopPropagation();
          onToggleSelect?.(n.id, !selected);
        } else {
          // In normal mode, open the modal
          openModal(n.id);
        }
      }}
      className={`note-card glass-card rounded-xl p-4 mb-6 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative min-h-[54px] group ${
        multiMode && selected ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-transparent' : ''
      }`}
      style={{ backgroundColor: bgFor(n.color, dark) }}
      data-id={n.id}
      data-group={group}
    >
      {multiMode && (
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {/* Modern checkbox */}
          <div
            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${
              selected
                ? 'bg-indigo-500 border-indigo-500 text-white'
                : 'border-gray-300 dark:border-gray-500 bg-white/80 dark:bg-gray-700/80 hover:border-indigo-400'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(n.id, !selected);
            }}
          >
            {selected && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      )}
      {/* Collaboration icon - bottom right - show if note has collaborators (empty array means has collaborators) or if user is viewing a note they don't own */}
      {/* Show icon if note has collaborators (empty array) or if user is viewing someone else's note */}
      {((n.collaborators !== undefined && n.collaborators !== null) || (n.user_id && currentUser && n.user_id !== currentUser.id)) && (
        <div className="absolute bottom-3 right-3 z-10">
          <div
            className="relative"
            title="Collaborated note"
          >
            <svg className="w-5 h-5 text-black dark:text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
            </svg>
            <svg className="w-3 h-3 absolute -top-1 -right-1 text-black dark:text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
            </svg>
          </div>
        </div>
      )}
      {!multiMode && !disablePin && (
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

      {!isChecklist && !isDraw ? (
        <div className="text-sm break-words whitespace-pre-wrap line-clamp-6">
          {displayText}
        </div>
      ) : isDraw ? (
        <DrawingPreview data={n.content} width={100} height={150} darkMode={dark} />
      ) : (
        <div className="space-y-2">
          {visibleItems.map((it) => (
            <ChecklistRow
              key={it.id}
              item={it}
              size="md"
              readOnly={true}
              showRemove={false}
              onToggle={async (checked, e) => {
                e?.stopPropagation(); // Prevent opening the note modal
                await onUpdateChecklistItem?.(n.id, it.id, checked);
              }}
            />
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
function LoginView({ dark, onToggleDark, onLogin, goRegister, goSecret, allowRegistration }) {
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
        {allowRegistration && (
        <button className="text-indigo-600 hover:underline" onClick={goRegister}>
          Create account
        </button>
        )}
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
function TagSidebar({ open, onClose, tagsWithCounts, activeTag, onSelect, dark, permanent = false, width = 288, onResize }) {
  const isAllNotes = activeTag === null;
  const isAllImages = activeTag === ALL_IMAGES;

  return (
    <>
      {open && !permanent && (
        <div
          className="fixed inset-0 z-30 bg-black/30"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        />
      )}
      <aside
        className={`fixed top-0 left-0 z-40 h-full shadow-2xl transition-transform duration-200 ${permanent || open ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          width: permanent ? `${width}px` : '288px',
          backgroundColor: dark ? "#222222" : "rgba(255,255,255,0.95)",
          borderRight: "1px solid var(--border-light)"
        }}
        aria-hidden={!(permanent || open)}
      >
        <div className="p-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Tags</h3>
          {!permanent && (
            <button
              className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
              onClick={onClose}
              title="Close"
            >
              <CloseIcon />
            </button>
          )}
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

        {/* Resize handle - only show when permanent */}
        {permanent && (
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-indigo-500/50 active:bg-indigo-500 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              const startX = e.clientX;
              const startWidth = width;

              const handleMouseMove = (moveEvent) => {
                const newWidth = Math.max(200, Math.min(500, startWidth + (moveEvent.clientX - startX)));
                onResize(newWidth);
              };

              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
              };

              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
              document.body.style.cursor = 'ew-resize';
              document.body.style.userSelect = 'none';
            }}
          />
        )}
      </aside>
    </>
  );
}

/** ---------- Settings Panel ---------- */
function SettingsPanel({ open, onClose, dark, onExportAll, onImportAll, onImportGKeep, onImportMd, onDownloadSecretKey, alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide }) {
  // Prevent body scroll when settings panel is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        />
      )}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ backgroundColor: dark ? "#222222" : "rgba(255,255,255,0.95)", borderLeft: "1px solid var(--border-light)" }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <SettingsIcon />
            Settings
          </h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Data Management Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">Data Management</h4>
            <div className="space-y-3">
              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => { onClose(); onExportAll?.(); }}
              >
                <div className="font-medium">Export ALL notes (.json)</div>
                <div className="text-sm text-gray-500">Download all notes as JSON file</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => { onClose(); onImportAll?.(); }}
              >
                <div className="font-medium">Import notes (.json)</div>
                <div className="text-sm text-gray-500">Import notes from JSON file</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => { onClose(); onImportGKeep?.(); }}
              >
                <div className="font-medium">Import Google Keep notes (.json)</div>
                <div className="text-sm text-gray-500">Import notes from Google Keep JSON export</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => { onClose(); onImportMd?.(); }}
              >
                <div className="font-medium">Import Markdown files (.md)</div>
                <div className="text-sm text-gray-500">Import notes from Markdown files</div>
              </button>

              <button
                className={`block w-full text-left px-4 py-3 border border-[var(--border-light)] rounded-lg ${dark ? "hover:bg-white/10" : "hover:bg-gray-50"} transition-colors`}
                onClick={() => { onClose(); onDownloadSecretKey?.(); }}
              >
                <div className="font-medium">Download secret key (.txt)</div>
                <div className="text-sm text-gray-500">Download your encryption key for backup</div>
              </button>
            </div>
          </div>

          {/* UI Preferences Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">UI Preferences</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Always show sidebar on wide screens</div>
                  <div className="text-sm text-gray-500">Keep tags panel visible on screens wider than 700px</div>
                </div>
                <button
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    alwaysShowSidebarOnWide
                      ? 'bg-indigo-600'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  onClick={() => setAlwaysShowSidebarOnWide(!alwaysShowSidebarOnWide)}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      alwaysShowSidebarOnWide ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** ---------- Admin Panel ---------- */
function AdminPanel({ open, onClose, dark, adminSettings, allUsers, newUserForm, setNewUserForm, updateAdminSettings, createUser, deleteUser, updateUser, currentUser, showGenericConfirm, showToast }) {
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ name: '', email: '', password: '', is_admin: false });
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);

  console.log("AdminPanel render:", { open, adminSettings, allUsers: allUsers?.length });

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.email || !newUserForm.password) {
      showToast("Please fill in all required fields", "error");
      return;
    }
    
    setIsCreatingUser(true);
    try {
      await createUser(newUserForm);
      showToast("User created successfully!", "success");
    } catch (e) {
      // Error already handled in createUser function
    } finally {
      setIsCreatingUser(false);
    }
  };

  const openEditUserModal = (user) => {
    setEditingUser(user);
    setEditUserForm({
      name: user.name,
      email: user.email,
      password: '',
      is_admin: user.is_admin
    });
    setEditUserModalOpen(true);
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editUserForm.name || !editUserForm.email) {
      showToast("Name and email are required", "error");
      return;
    }

    setIsUpdatingUser(true);
    try {
      // Only include password if it's not empty
      const updateData = {
        name: editUserForm.name,
        email: editUserForm.email,
        is_admin: editUserForm.is_admin
      };
      if (editUserForm.password) {
        updateData.password = editUserForm.password;
      }

      await updateUser(editingUser.id, updateData);
      showToast("User updated successfully!", "success");
      setEditUserModalOpen(false);
      setEditingUser(null);
    } catch (e) {
      showToast(e.message || "Failed to update user", "error");
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Prevent body scroll when admin panel is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        />
      )}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        style={{ backgroundColor: dark ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.95)", borderLeft: "1px solid var(--border-light)" }}
        aria-hidden={!open}
      >
        <div className="p-4 flex items-center justify-between border-b border-[var(--border-light)]">
          <h3 className="text-lg font-semibold">Admin Panel</h3>
          <button
            className="p-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
          {/* Settings Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">Settings</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Allow New Account Creation</span>
                <button
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    adminSettings.allowNewAccounts 
                      ? 'bg-indigo-600' 
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                  onClick={() => updateAdminSettings({ allowNewAccounts: !adminSettings.allowNewAccounts })}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      adminSettings.allowNewAccounts ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Create User Section */}
          <div className="mb-8">
            <h4 className="text-md font-semibold mb-4">Create New User</h4>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <input
                type="text"
                placeholder="Name"
                value={newUserForm.name}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <input
                type="text"
                placeholder="Username"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <input
                type="password"
                placeholder="Password"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm(prev => ({ ...prev, password: e.target.value }))}
                className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
              />
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={newUserForm.is_admin}
                  onChange={(e) => setNewUserForm(prev => ({ ...prev, is_admin: e.target.checked }))}
                  className="mr-2"
                />
                <label htmlFor="is_admin" className="text-sm">Make admin</label>
              </div>
              <button
                type="submit"
                disabled={isCreatingUser}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isCreatingUser ? "Creating..." : "Create User"}
              </button>
            </form>
          </div>

          {/* Users List Section */}
          <div>
            <h4 className="text-md font-semibold mb-4">All Users ({allUsers.length})</h4>
            <div className="space-y-3">
              {allUsers.map((user) => (
                <div key={user.id} className="p-3 border border-[var(--border-light)] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user.is_admin && (
                        <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 rounded">
                          Admin
                        </span>
                      )}
                      <button
                        onClick={() => openEditUserModal(user)}
                        className="px-2 py-1 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                      >
                        Edit
                      </button>
                      {user.id !== currentUser?.id && (
                        <button
                          onClick={() => {
                            showGenericConfirm({
                              title: "Delete User",
                              message: `Are you sure you want to delete ${user.name}?`,
                              confirmText: "Delete",
                              danger: true,
                              onConfirm: () => deleteUser(user.id)
                            });
                          }}
                          className="px-2 py-1 text-xs bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded hover:bg-red-200 dark:hover:bg-red-800"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div>Notes: {user.notes}</div>
                    <div>Storage: {formatBytes(user.storage_bytes ?? 0)}</div>
                    <div>Joined: {new Date(user.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {editUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Edit User</h3>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editUserForm.name}
                  onChange={(e) => setEditUserForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password (leave empty to keep current)</label>
                <input
                  type="password"
                  value={editUserForm.password}
                  onChange={(e) => setEditUserForm(prev => ({ ...prev, password: e.target.value }))}
                  className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg bg-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Leave empty to keep current password"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="edit_is_admin"
                  checked={editUserForm.is_admin}
                  onChange={(e) => setEditUserForm(prev => ({ ...prev, is_admin: e.target.checked }))}
                  className="mr-2"
                />
                <label htmlFor="edit_is_admin" className="text-sm">Make admin</label>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditUserModalOpen(false)}
                  className="px-4 py-2 border border-[var(--border-light)] rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingUser}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isUpdatingUser ? "Updating..." : "Update User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
  composerDrawingData, setComposerDrawingData,
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
  sidebarPermanent,
  sidebarWidth,
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
    onBulkArchive,
    onBulkColor,
    onBulkDownloadZip,
  // view mode
  listView,
  onToggleViewMode,
  // SSE connection status
  sseConnected,
  isOnline,
  loadNotes,
  loadArchivedNotes,
  // checklist update
  onUpdateChecklistItem,
  // Admin panel
  openAdminPanel,
  // Settings panel
  openSettingsPanel,
}) {
    // Multi-select color popover (local UI state)
    const multiColorBtnRef = useRef(null);
    const [showMultiColorPop, setShowMultiColorPop] = useState(false);
  const tagLabel =
    activeTagFilter === ALL_IMAGES ? "All Images" :
    activeTagFilter === 'ARCHIVED' ? "Archived Notes" :
    activeTagFilter;

  // Close header menu when scrolling
  React.useEffect(() => {
    if (!headerMenuOpen) return;

    const handleScroll = () => {
      setHeaderMenuOpen(false);
    };

    const scrollContainer = document.querySelector('.min-h-screen');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [headerMenuOpen, setHeaderMenuOpen]);

  return (
    <div
      className="min-h-screen"
      style={{ marginLeft: sidebarPermanent ? `${sidebarWidth}px` : '0px' }}
    >
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
            {activeTagFilter !== 'ARCHIVED' && (
              <button className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1" onClick={() => onBulkPin(true)}>
                <PinIcon />
                Pin
              </button>
            )}
            <button className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm flex items-center gap-1" onClick={onBulkArchive}>
              <ArchiveIcon />
              {activeTagFilter === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
            </button>
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
          {/* Hamburger - only show when sidebar is not permanent */}
          {!sidebarPermanent && (
            <button
              onClick={openSidebar}
              className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Open tags"
              aria-label="Open tags"
            >
              <Hamburger />
            </button>
          )}

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
          
          {/* Offline indicator */}
          {!isOnline && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-orange-600/10 text-orange-700 dark:text-orange-300 border border-orange-600/20">
              Offline
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
            <>
              {/* Backdrop to close menu when clicking outside */}
              <div
                className="fixed inset-0 z-[1099]"
                onClick={() => setHeaderMenuOpen(false)}
              />
              <div
                ref={headerMenuRef}
                className={`absolute top-12 right-0 min-w-[220px] z-[1100] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                style={{ backgroundColor: dark ? "#222222" : undefined }}
                onClick={(e) => e.stopPropagation()}
              >

              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); openSettingsPanel?.(); }}
              >
                <SettingsIcon />
                Settings
              </button>
              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); onToggleViewMode?.(); }}
              >
                {listView ? <GridIcon /> : <ListIcon />}
                {listView ? "Grid View" : "List View"}
              </button>
              {/* Theme toggle text item */}
              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); toggleDark?.(); }}
              >
                {dark ? <SunIcon /> : <MoonIcon />}
                {dark ? "Light Mode" : "Dark Mode"}
              </button>
              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); onStartMulti?.(); }}
              >
                <CheckSquareIcon />
                Multi select
              </button>
              {currentUser?.is_admin && (
                <button
                  className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                  onClick={() => { setHeaderMenuOpen(false); openAdminPanel?.(); }}
                >
                  <ShieldIcon />
                  Admin Panel
                </button>
              )}
              <button
                className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "text-red-400 hover:bg-white/10" : "text-red-600 hover:bg-gray-100"}`}
                onClick={() => { setHeaderMenuOpen(false); signOut?.(); }}
              >
                <LogOutIcon />
                Sign out
              </button>
              </div>
            </>
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
        {!isOnline ? (
          <div className="glass-card rounded-xl shadow-lg p-6 mb-8 text-center">
            <div className="text-orange-600 dark:text-orange-400 mb-2">
              <svg className="w-8 h-8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">You're offline</h3>
            <p className="text-gray-600 dark:text-gray-400">Please go back online to add notes.</p>
          </div>
        ) : (
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
                disabled={!isOnline}
                className={`w-full bg-transparent text-lg font-semibold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-2 p-2 ${
                  !isOnline ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />

              {/* Body, Checklist, or Drawing */}
              {composerType === "text" ? (
                <textarea
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={onComposerKeyDown}
                  placeholder="Write a note..."
                  disabled={!isOnline}
                  className={`w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none p-2 ${
                    !isOnline ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  rows={1}
                />
              ) : composerType === "checklist" ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={clInput}
                      onChange={(e) => setClInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComposerItem(); } }}
                      placeholder="List item…"
                      disabled={!isOnline}
                      className={`flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)] ${
                        !isOnline ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    />
                    <button
                      onClick={addComposerItem}
                      disabled={!isOnline}
                      className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
                        isOnline
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                      }`}
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
              ) : (
                <DrawingCanvas
                  data={composerDrawingData}
                  onChange={setComposerDrawingData}
                  width={650}
                  height={450}
                  readOnly={!isOnline}
                  darkMode={dark}
                  hideModeToggle={true}
                />
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
                  disabled={!isOnline}
                  className={`w-full sm:flex-1 bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 ${
                    !isOnline ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                />

                <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:flex-none relative">
                  {/* Formatting button (composer) - only for text mode */}
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

                  {/* Type selection buttons */}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setComposerType("text")}
                      className={`px-2 py-1 rounded-lg border text-sm ${
                        composerType === "text"
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                      title="Text note"
                    >
                      📝
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerType("checklist")}
                      className={`px-2 py-1 rounded-lg border text-sm ${
                        composerType === "checklist"
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                      title="Checklist"
                    >
                      ☑
                    </button>
                    <button
                      type="button"
                      onClick={() => setComposerType("draw")}
                      className={`px-2 py-1 rounded-lg border text-sm ${
                        composerType === "draw"
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10'
                      }`}
                      title="Drawing"
                    >
                      🖌️
                    </button>
                  </div>

                  {/* Color dropdown (composer) */}
                  <button
                    ref={colorBtnRef}
                    type="button"
                    onClick={() => setShowColorPop((v) => !v)}
                    className="w-8 h-8 rounded-full border-2 border-[var(--border-light)] hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 flex items-center justify-center"
                    title="Color"
                    style={{
                      backgroundColor: composerColor === "default" ? "transparent" : solid(bgFor(composerColor, dark)),
                      borderColor: composerColor === "default" ? "#d1d5db" : solid(bgFor(composerColor, dark)),
                    }}
                  >
                    {composerColor === "default" && (
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: dark ? "#1f2937" : "#fff" }} />
                    )}
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
                        } catch (e) {}
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
                    disabled={!isOnline}
                    className={`px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors whitespace-nowrap flex-shrink-0 ${
                      isOnline 
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                        : 'bg-gray-400 text-gray-200 cursor-not-allowed'
                    }`}
                  >
                    Add Note
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        )}
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
                  disablePin={('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || activeTagFilter === 'ARCHIVED'}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                  isOnline={isOnline}
                  onUpdateChecklistItem={onUpdateChecklistItem}
                  currentUser={currentUser}
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
                  disablePin={('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || activeTagFilter === 'ARCHIVED'}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                  isOnline={isOnline}
                  onUpdateChecklistItem={onUpdateChecklistItem}
                  currentUser={currentUser}
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
                      onClick={() => {
                        showGenericConfirm({
                          title: "Delete User",
                          message: "Delete this user and ALL their notes? This cannot be undone.",
                          confirmText: "Delete",
                          danger: true,
                          onConfirm: () => removeUser(u.id)
                        });
                      }}
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

  // Screen width for responsive behavior
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Notes & search
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");

  // Tag filter & sidebar
  const [tagFilter, setTagFilter] = useState(null); // null = all, ALL_IMAGES = only notes with images
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alwaysShowSidebarOnWide, setAlwaysShowSidebarOnWide] = useState(() => {
    try { return localStorage.getItem("sidebarAlwaysVisible") === "true"; } catch (e) { return false; }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return parseInt(localStorage.getItem("sidebarWidth")) || 288; } catch (e) { return 288; }
  });

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

  // Drawing composer
  const [composerDrawingData, setComposerDrawingData] = useState({ paths: [], dimensions: null });

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
  const [genericConfirmOpen, setGenericConfirmOpen] = useState(false);
  const [genericConfirmConfig, setGenericConfirmConfig] = useState({});

  // Toast notification system
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'success', duration = 3000) => {
    const id = Date.now();
    const toast = { id, message, type };
    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  };

  // Generic confirmation dialog helper
  const showGenericConfirm = (config) => {
    setGenericConfirmConfig(config);
    setGenericConfirmOpen(true);
  };
  const [mItems, setMItems] = useState([]);
  const skipNextItemsAutosave = useRef(false);
  const prevItemsRef = useRef([]);
  const [mInput, setMInput] = useState("");

  // Drawing modal
  const [mDrawingData, setMDrawingData] = useState({ paths: [], dimensions: null });
  const skipNextDrawingAutosave = useRef(false);
  const prevDrawingRef = useRef({ paths: [], dimensions: null });

  // Clear data when switching composer types
  useEffect(() => {
    if (composerType === "text") {
      setClItems([]);
      setClInput("");
      setComposerDrawingData({ paths: [], dimensions: null });
    } else if (composerType === "checklist") {
      setComposerDrawingData({ paths: [], dimensions: null });
    } else if (composerType === "draw") {
      setClItems([]);
      setClInput("");
    }
  }, [composerType]);

  // Collaboration modal
  const [collaborationModalOpen, setCollaborationModalOpen] = useState(false);
  const [collaboratorUsername, setCollaboratorUsername] = useState("");
  const [addModalCollaborators, setAddModalCollaborators] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const collaboratorInputRef = useRef(null);

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

  // Checklist item drag (for modal reordering)
  const checklistDragId = useRef(null);

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
    try { return localStorage.getItem("viewMode") === "list"; } catch (e) { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("viewMode", listView ? "list" : "grid"); } catch (e) {}
  }, [listView]);
  const onToggleViewMode = () => setListView((v) => !v);

  // Save sidebar settings
  useEffect(() => {
    try { localStorage.setItem("sidebarAlwaysVisible", String(alwaysShowSidebarOnWide)); } catch (e) {}
  }, [alwaysShowSidebarOnWide]);

  useEffect(() => {
    try { localStorage.setItem("sidebarWidth", String(sidebarWidth)); } catch (e) {}
  }, [sidebarWidth]);

  // Window resize listener for responsive sidebar behavior
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const onBulkDelete = async () => {
    if (!selectedIds.length) return;
    showGenericConfirm({
      title: "Delete Notes",
      message: `Delete ${selectedIds.length} selected note(s)? This cannot be undone.`,
      confirmText: "Delete",
      danger: true,
      onConfirm: async () => {
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
      }
    });
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
      // Invalidate caches
      invalidateNotesCache();
      invalidateArchivedNotesCache();
      // Reload fresh data since we invalidated caches
      if (tagFilter === 'ARCHIVED') {
        loadArchivedNotes().catch(() => {});
      } else {
        loadNotes().catch(() => {});
      }
    } catch (e) {
      console.error("Bulk pin failed", e);
      // Reload appropriate notes based on current view
      if (tagFilter === 'ARCHIVED') {
        loadArchivedNotes().catch(() => {});
      } else {
        loadNotes().catch(() => {});
      }
    }
  };

  const onBulkArchive = async () => {
    if (!selectedIds.length) return;

    // Determine if we're archiving or unarchiving based on current view
    const isArchiving = tagFilter !== 'ARCHIVED';
    const archivedValue = isArchiving;

    try {
      // Optimistic update - remove from current view
      setNotes((prev) => prev.filter((n) => !selectedIds.includes(String(n.id))));
      // Persist in background (best-effort)
      for (const id of selectedIds) {
        await api(`/notes/${id}/archive`, { method: "POST", token, body: { archived: archivedValue } });
      }
      // Invalidate caches
      invalidateNotesCache();
      invalidateArchivedNotesCache();

      // If we just unarchived notes from archived view, switch to regular notes view
      if (!isArchiving && tagFilter === 'ARCHIVED') {
        setTagFilter(null);
        await loadNotes();
      }

      // Exit multi-select mode
      onExitMulti();
    } catch (e) {
      console.error(`Bulk ${isArchiving ? 'archive' : 'unarchive'} failed`, e);
      // Reload notes on failure
      if (tagFilter === 'ARCHIVED') {
        loadArchivedNotes().catch(() => {});
      } else {
        loadNotes().catch(() => {});
      }
    }
  };

  const onUpdateChecklistItem = async (noteId, itemId, checked) => {
    // Find the note
    const note = notes.find(n => String(n.id) === String(noteId));
    if (!note) return;

    // Optimistically update the note
    const updatedItems = (note.items || []).map(item =>
      item.id === itemId ? { ...item, done: checked } : item
    );
    const updatedNote = { ...note, items: updatedItems };

    // Update local state optimistically
    setNotes(prev => prev.map(n =>
      String(n.id) === String(noteId) ? updatedNote : n
    ));

    try {
      // Update on server
      await api(`/notes/${noteId}`, {
        method: "PATCH",
        token,
        body: { items: updatedItems, type: "checklist", content: "" }
      });

      // Invalidate caches since we modified the note
      invalidateNotesCache();
      invalidateArchivedNotesCache();
    } catch (error) {
      console.error("Failed to update checklist item:", error);
      // Revert the optimistic update on error
      setNotes(prev => prev.map(n =>
        String(n.id) === String(noteId) ? note : n
      ));
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
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Admin panel state
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [adminSettings, setAdminSettings] = useState({ allowNewAccounts: true });
  const [allUsers, setAllUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', is_admin: false });
  const [allowRegistration, setAllowRegistration] = useState(true);

  // Settings panel state
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);

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
    // Only close header kebab on outside click (modal kebab is handled by Popover)
    function onDocClick(e) {
      if (headerMenuOpen) {
        const m = headerMenuRef.current;
        const b = headerBtnRef.current;
        if (m && m.contains(e.target)) return;
        if (b && b.contains(e.target)) return;
        setHeaderMenuOpen(false);
      }
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

  // Close sidebar with Escape
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  // Cache keys for localStorage
  const NOTES_CACHE_KEY = `glass-keep-notes-${currentUser?.id || 'anonymous'}`;
  const ARCHIVED_NOTES_CACHE_KEY = `glass-keep-archived-${currentUser?.id || 'anonymous'}`;
  const CACHE_TIMESTAMP_KEY = `glass-keep-cache-timestamp-${currentUser?.id || 'anonymous'}`;

  // Cache invalidation functions
  const invalidateNotesCache = () => {
    try {
      localStorage.removeItem(NOTES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Error invalidating notes cache:", error);
    }
  };

  const invalidateArchivedNotesCache = () => {
    try {
      localStorage.removeItem(ARCHIVED_NOTES_CACHE_KEY);
      localStorage.removeItem(CACHE_TIMESTAMP_KEY);
    } catch (error) {
      console.error("Error invalidating archived notes cache:", error);
    }
  };

  const uniqueById = (arr) => {
    const m = new Map();
    for (const n of Array.isArray(arr) ? arr : []) {
      if (!n) continue;
      m.set(String(n.id), n);
    }
    return Array.from(m.values());
  };
  const persistNotesCache = (notes) => {
    try {
      localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(Array.isArray(notes) ? notes : []));
      localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
    } catch (e) {
      console.error('Error caching notes:', e);
    }
  };
  // Consistent ordering: pinned first, then by position (server-persisted DnD),
  // fallback to updated_at/timestamp when position is missing
  const sortNotesByRecency = (arr) => {
    try {
      const list = Array.isArray(arr) ? arr.slice() : [];
      return list.sort((a, b) => {
        const ap = a?.pinned ? 1 : 0;
        const bp = b?.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap; // pinned first
        const apos = Number.isFinite(+a?.position) ? +a.position : null;
        const bpos = Number.isFinite(+b?.position) ? +b.position : null;
        if (apos != null && bpos != null && !Number.isNaN(apos) && !Number.isNaN(bpos)) {
          return bpos - apos; // higher position first (most recent/top)
        }
        const at = new Date(a?.updated_at || a?.timestamp || 0).getTime();
        const bt = new Date(b?.updated_at || b?.timestamp || 0).getTime();
        return bt - at; // fallback newest first
      });
    } catch {
      return Array.isArray(arr) ? arr : [];
    }
  };




  // Load notes
  const loadNotes = async () => {
    if (!token) return;
    setNotesLoading(true);
    
    try {
      const data = await api("/notes", { token });
      console.log("Notes loaded from server:", data);
      const notesArray = Array.isArray(data) ? data : [];
      setNotes(sortNotesByRecency(notesArray));
      persistNotesCache(notesArray);
    } catch (error) {
      console.error("Error loading notes from server:", error);
      // Try to load from cache as fallback
      try {
        const cachedData = localStorage.getItem(NOTES_CACHE_KEY);
        if (cachedData) {
          const cachedNotes = JSON.parse(cachedData);
          setNotes(sortNotesByRecency(cachedNotes));
        } else {
          setNotes([]);
        }
      } catch (cacheError) {
        console.error("Error loading from cache:", cacheError);
        setNotes([]);
      }
    } finally {
      setNotesLoading(false);
    }
  };

  // Load archived notes
  const loadArchivedNotes = async () => {
    if (!token) return;
    setNotesLoading(true);

    console.log("Loading archived notes, checking cache...");
    // First, try to load from cache immediately for better UX
    let hasCachedData = false;
    try {
      const cachedData = localStorage.getItem(ARCHIVED_NOTES_CACHE_KEY);
      if (cachedData) {
        const cachedNotes = JSON.parse(cachedData);
        console.log("Found cached archived notes:", cachedNotes.length);
        setNotes(sortNotesByRecency(cachedNotes));
        hasCachedData = true;
      } else {
        console.log("No cached archived notes found");
      }
    } catch (cacheError) {
      console.error("Error loading archived notes from cache:", cacheError);
    }

    try {
      const data = await api("/notes/archived", { token });
      console.log("Archived notes loaded from server:", data);
      const notesArray = Array.isArray(data) ? data : [];
      setNotes(sortNotesByRecency(notesArray));

      // Cache the data
      try {
        localStorage.setItem(ARCHIVED_NOTES_CACHE_KEY, JSON.stringify(notesArray));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
        console.log("Cached", notesArray.length, "archived notes");
      } catch (error) {
        console.error("Error caching archived notes:", error);
      }
    } catch (error) {
      console.error("Error loading archived notes from server:", error);
      // If we don't have cached data, set empty array
      if (!hasCachedData) {
        console.log("No cached data and server error, setting empty array");
        setNotes([]);
      }
    } finally {
      setNotesLoading(false);
    }
  };
  useEffect(() => {
    if (!token) return;

    console.log("Tag filter changed to:", tagFilter, "from previous value");

    // Load appropriate notes based on tag filter
    if (tagFilter === 'ARCHIVED') {
      console.log("Loading archived notes...");
      loadArchivedNotes().catch((error) => {
        console.error("Failed to load archived notes:", error);
      });
    } else {
      console.log("Loading regular notes...");
      loadNotes().catch((error) => {
        console.error("Failed to load regular notes:", error);
      });
    }
  }, [token, tagFilter]);

  // Check registration setting on app load
  useEffect(() => {
    checkRegistrationSetting();
  }, []);
  
  // Handle token expiration globally - must be after signOut is defined
  // This will be added after signOut is defined below
  
  useEffect(() => {
    if (token) {
      loadNotes().catch(() => {});
    }
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
          } catch (e) {}
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
          } catch (e) {}
        });
        
        es.onerror = (error) => {
          console.log("SSE error, attempting reconnect...", error);
          setSseConnected(false);
          
          // Check if SSE is in a failed state (readyState 2 = CLOSED, usually means 401/auth error)
          if (es.readyState === EventSource.CLOSED) {
            // If it's closed due to auth error, check if token is still valid
            // The event source might have been closed due to 401
            const currentAuth = getAuth();
            if (!currentAuth || !currentAuth.token) {
              // Token is missing, don't try to reconnect
              console.log("SSE closed - no valid token, stopping reconnection");
              return;
            }
          }
          
          es.close();
          
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts);
            reconnectTimeout = setTimeout(() => {
              reconnectAttempts++;
              // Check token before reconnecting
              const currentAuth = getAuth();
              if (!currentAuth || !currentAuth.token) {
                console.log("SSE reconnection cancelled - no valid token");
                return;
              }
              connectSSE();
            }, delay);
          } else {
            console.log("SSE reconnection attempts exhausted");
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
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Page became visible, validate token first
        try {
          // Quick health check - this will fail with 401 if token is expired
          await api("/health", { token });
          
          // Token is valid, reconnect if needed
          if (es && es.readyState === EventSource.CLOSED) {
            connectSSE();
          }
          
          // Also refresh notes when page becomes visible
          if (tagFilter === 'ARCHIVED') {
            loadArchivedNotes().catch(() => {});
          } else {
            loadNotes().catch(() => {});
          }
        } catch (error) {
          // If health check fails with 401, the api function will handle auth expiration
          // Otherwise, just log and try to reconnect anyway
          if (error.status !== 401) {
            console.error("Error checking connection:", error);
            // Still try to reconnect SSE and refresh notes on other errors
            if (es && es.readyState === EventSource.CLOSED) {
              connectSSE();
            }
            if (tagFilter === 'ARCHIVED') {
              loadArchivedNotes().catch(() => {});
            } else {
              loadNotes().catch(() => {});
            }
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Handle online/offline events
    const handleOnline = () => {
      console.log("App went online");
      setIsOnline(true);
    };
    
    const handleOffline = () => {
      console.log("App went offline");
      setIsOnline(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      setSseConnected(false);
      try { 
        if (es) es.close(); 
      } catch (e) {}
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
      window.removeEventListener('offline', handleOffline);
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

  // Auto-save drawing changes
  useEffect(() => {
    if (!open || !activeId || mType !== "draw") return;
    if (skipNextDrawingAutosave.current) {
      skipNextDrawingAutosave.current = false;
      return;
    }

    const prevJson = JSON.stringify(prevDrawingRef.current || { paths: [], dimensions: null });
    const currentJson = JSON.stringify(mDrawingData || { paths: [], dimensions: null });
    if (prevJson === currentJson) return;

    // Debounce auto-save by 500ms
    const timeoutId = setTimeout(async () => {
      try {
        await api(`/notes/${activeId}`, {
          method: "PATCH",
          token,
          body: { content: JSON.stringify(mDrawingData), type: "draw" }
        });
        prevDrawingRef.current = mDrawingData;
        invalidateNotesCache();
      } catch (e) {
        console.error("Failed to auto-save drawing:", e);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [mDrawingData, open, activeId, mType, token]);

  // Live-sync drawing data in open modal when remote updates arrive
  useEffect(() => {
    if (!open || !activeId) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type !== "draw") return;

    try {
      const serverDrawingData = JSON.parse(n.content || "[]");
      // Handle backward compatibility: if it's an array, convert to new format
      const normalizedData = Array.isArray(serverDrawingData) 
        ? { paths: serverDrawingData, dimensions: null }
        : serverDrawingData;
      const prevJson = JSON.stringify(prevDrawingRef.current || []);
      const serverJson = JSON.stringify(normalizedData);
      if (serverJson !== prevJson) {
        setMDrawingData(normalizedData);
        prevDrawingRef.current = normalizedData;
      }
    } catch (e) {
      // Invalid JSON, ignore
    }
  }, [notes, open, activeId]);
  
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

        // Prevent browser auto-scroll by restoring scroll position after DOM update
        requestAnimationFrame(() => {
          if (modalScrollEl) {
            modalScrollEl.scrollTop = scrollTop;
          }
        });
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
    // Clear all cached data for this user
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.includes('glass-keep-')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error("Error clearing cache on sign out:", error);
    }
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
  
  // Handle token expiration globally
  useEffect(() => {
    const handleAuthExpired = () => {
      console.log("Auth expired, signing out...");
      // Clear auth and redirect to login
      setAuth(null);
      setSession(null);
      setNotes([]);
      // Clear all cached data
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.includes('glass-keep-')) {
            localStorage.removeItem(key);
          }
        });
      } catch (error) {
        console.error("Error clearing cache on auth expiration:", error);
      }
      navigate("#/login");
    };
    
    window.addEventListener('auth-expired', handleAuthExpired);
    
    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, [navigate]);

  /** -------- Composer helpers -------- */
  const addComposerItem = () => {
    const t = clInput.trim();
    if (!t) return;
    setClItems((prev) => [...prev, { id: uid(), text: t, done: false }]);
    setClInput("");
  };

  const addNote = async () => {
    const isText = composerType === "text";
    const isChecklist = composerType === "checklist";
    const isDraw = composerType === "draw";

    if (isText) {
      if (!title.trim() && !content.trim() && !tags.trim() && composerImages.length === 0) return;
    } else if (isChecklist) {
      if (!title.trim() && clItems.length === 0) return;
    } else if (isDraw) {
      const drawPaths = Array.isArray(composerDrawingData) ? composerDrawingData : (composerDrawingData?.paths || []);
      if (!title.trim() && drawPaths.length === 0) return;
    }

    const nowIso = new Date().toISOString();
    const newNote = {
      id: uid(),
      type: composerType,
      title: title.trim(),
      content: isText ? content : isDraw ? JSON.stringify(composerDrawingData) : "",
      items: isChecklist ? clItems : [],
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
      setNotes((prev) => sortNotesByRecency([created, ...(Array.isArray(prev)?prev:[])]));
      invalidateNotesCache();
      
      // Reset composer after successful add
      setTitle("");
      setContent("");
      setTags("");
      setComposerImages([]);
      setComposerColor("default");
      setClItems([]);
      setClInput("");
      setComposerDrawingData({ paths: [], dimensions: null });
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
      
      // Invalidate both caches since archiving affects both regular and archived notes
      invalidateNotesCache();
      invalidateArchivedNotesCache();
      
      // Reload appropriate notes based on current view
      if (tagFilter === 'ARCHIVED') {
        if (!archived) {
          // If unarchiving from archived view, switch back to regular view
          setTagFilter(null);
          await loadNotes();
        } else {
          await loadArchivedNotes();
        }
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

  /** -------- Admin Panel Functions -------- */
  const loadAdminSettings = async () => {
    try {
      console.log("Loading admin settings...");
      const settings = await api("/admin/settings", { token });
      console.log("Admin settings loaded:", settings);
      setAdminSettings(settings);
    } catch (e) {
      console.error("Failed to load admin settings:", e);
    }
  };

  const updateAdminSettings = async (newSettings) => {
    try {
      const settings = await api("/admin/settings", { method: "PATCH", token, body: newSettings });
      setAdminSettings(settings);
    } catch (e) {
      alert(e.message || "Failed to update admin settings");
    }
  };

  const loadAllUsers = async () => {
    try {
      console.log("Loading all users...");
      const users = await api("/admin/users", { token });
      console.log("Users loaded:", users);
      setAllUsers(users);
    } catch (e) {
      console.error("Failed to load users:", e);
    }
  };

  const createUser = async (userData) => {
    try {
      const newUser = await api("/admin/users", { method: "POST", token, body: userData });
      setAllUsers(prev => [newUser, ...prev]);
      setNewUserForm({ name: '', email: '', password: '', is_admin: false });
      return newUser;
    } catch (e) {
      alert(e.message || "Failed to create user");
      throw e;
    }
  };

  const deleteUser = async (userId) => {
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE", token });
      setAllUsers(prev => prev.filter(u => u.id !== userId));
    } catch (e) {
      alert(e.message || "Failed to delete user");
    }
  };

  const updateUser = async (userId, userData) => {
    const updatedUser = await api(`/admin/users/${userId}`, { method: "PATCH", token, body: userData });
    setAllUsers(prev => prev.map(u => u.id === userId ? updatedUser : u));
    return updatedUser;
  };

  const openAdminPanel = async () => {
    console.log("Opening admin panel...");
    setAdminPanelOpen(true);
    try {
      await Promise.all([
        loadAdminSettings(),
        loadAllUsers()
      ]);
      console.log("Admin panel data loaded successfully");
    } catch (error) {
      console.error("Error loading admin panel data:", error);
    }
  };

  const openSettingsPanel = () => {
    setSettingsPanelOpen(true);
  };

  // Check if registration is allowed
  const checkRegistrationSetting = async () => {
    try {
      const response = await api("/admin/allow-registration");
      setAllowRegistration(response.allowNewAccounts);
    } catch (e) {
      console.error("Failed to check registration setting:", e);
      setAllowRegistration(true); // Default to true if check fails
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
        } catch (e) {}
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
  const [collaborationDialogOpen, setCollaborationDialogOpen] = useState(false);
  const [collaborationDialogNoteId, setCollaborationDialogNoteId] = useState(null);
  const [noteCollaborators, setNoteCollaborators] = useState([]);
  const [isNoteOwner, setIsNoteOwner] = useState(false);

  const loadNoteCollaborators = useCallback(async (noteId) => {
    try {
      const collaborators = await api(`/notes/${noteId}/collaborators`, { token });
      setNoteCollaborators(collaborators || []);
      
      // Check if current user is the owner
      // Try to get note from current notes list
      const note = notes.find(n => String(n.id) === String(noteId));
      // If note has user_id, use it; otherwise check if user is in collaborators list
      if (note?.user_id) {
        setIsNoteOwner(note.user_id === currentUser?.id);
      } else {
        // If note doesn't have user_id, check if current user is NOT in collaborators
        // (if they're not a collaborator and can see the note, they're likely the owner)
        const isCollaborator = collaborators.some(c => c.id === currentUser?.id);
        setIsNoteOwner(!isCollaborator);
      }
    } catch (e) {
      console.error("Failed to load collaborators:", e);
      setNoteCollaborators([]);
      setIsNoteOwner(false);
    }
  }, [token, notes, currentUser]);

  const showCollaborationDialog = useCallback((noteId) => {
    setCollaborationDialogNoteId(noteId);
    setCollaborationDialogOpen(true);
    loadNoteCollaborators(noteId);
  }, [loadNoteCollaborators]);

  const removeCollaborator = async (collaboratorId, noteId = null) => {
    try {
      const targetNoteId = noteId || collaborationDialogNoteId || activeId;
      if (!targetNoteId) return;
      await api(`/notes/${targetNoteId}/collaborate/${collaboratorId}`, {
        method: "DELETE",
        token
      });
      showToast("Collaborator removed successfully", "success");
      if (collaborationDialogNoteId) {
        loadNoteCollaborators(collaborationDialogNoteId);
      }
      if (activeId) {
        await loadCollaboratorsForAddModal(activeId);
      }
      invalidateNotesCache();
    } catch (e) {
      showToast(e.message || "Failed to remove collaborator", "error");
    }
  };

  const loadCollaboratorsForAddModal = useCallback(async (noteId) => {
    try {
      const collaborators = await api(`/notes/${noteId}/collaborators`, { token });
      setAddModalCollaborators(collaborators || []);
    } catch (e) {
      console.error("Failed to load collaborators:", e);
      setAddModalCollaborators([]);
    }
  }, [token]);

  // Search users for collaboration dropdown
  const searchUsers = useCallback(async (query) => {
    setLoadingUsers(true);
    try {
      const searchQuery = query && query.trim().length > 0 ? query.trim() : "";
      const users = await api(`/users/search?q=${encodeURIComponent(searchQuery)}`, { token });
      // Filter out current user and existing collaborators
      const existingCollaboratorIds = new Set(addModalCollaborators.map(c => c.id));
      const filtered = users.filter(u => 
        u.id !== currentUser?.id && !existingCollaboratorIds.has(u.id)
      );
      setFilteredUsers(filtered);
      setShowUserDropdown(filtered.length > 0);
    } catch (e) {
      console.error("Failed to search users:", e);
      setFilteredUsers([]);
      setShowUserDropdown(false);
    } finally {
      setLoadingUsers(false);
    }
  }, [token, addModalCollaborators, currentUser]);

  // Update dropdown position based on input field
  const updateDropdownPosition = useCallback(() => {
    if (collaboratorInputRef.current) {
      const rect = collaboratorInputRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4, // fixed positioning is relative to viewport
        left: rect.left,
        width: rect.width
      });
    }
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        collaboratorInputRef.current &&
        !collaboratorInputRef.current.contains(event.target) &&
        !event.target.closest('[data-user-dropdown]')
      ) {
        setShowUserDropdown(false);
      }
    };

    if (showUserDropdown) {
      updateDropdownPosition();
      // Use setTimeout to ensure the portal is rendered
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        window.removeEventListener('scroll', updateDropdownPosition, true);
        window.removeEventListener('resize', updateDropdownPosition);
      };
    }
  }, [showUserDropdown, updateDropdownPosition]);

  // Load collaborators when Add Collaborator modal opens
  useEffect(() => {
    if (collaborationModalOpen && activeId) {
      loadCollaboratorsForAddModal(activeId);
    }
  }, [collaborationModalOpen, activeId, loadCollaboratorsForAddModal]);

  const addCollaborator = async (username) => {
    try {
      if (!activeId) return;
      
      // Add collaborator to the note
      const result = await api(`/notes/${activeId}/collaborate`, { 
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
      
      showToast(`Added ${username} as collaborator successfully!`, "success");
      setCollaboratorUsername("");
      setShowUserDropdown(false);
      setFilteredUsers([]);
      // Reload collaborators for both dialogs
      await loadCollaboratorsForAddModal(activeId);
      if (collaborationDialogNoteId === activeId) {
        loadNoteCollaborators(activeId);
      }
    } catch (e) {
      showToast(e.message || "Failed to add collaborator", "error");
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

  // Track initial state when opening modal to detect if user actually edited
  // Must be defined before openModal
  const initialModalStateRef = useRef(null);

  const openModal = (id) => {
    const n = notes.find((x) => String(x.id) === String(id)); if (!n) return;
    setSidebarOpen(false);
    setActiveId(String(id));
    setMType(n.type || "text");
    setMTitle(n.title || "");
    if (n.type === "draw") {
      try {
        const drawingData = JSON.parse(n.content || "[]");
        // Handle backward compatibility: if it's an array, convert to new format
        const normalizedData = Array.isArray(drawingData)
          ? { paths: drawingData, dimensions: null }
          : drawingData;
        setMDrawingData(normalizedData);
        prevDrawingRef.current = normalizedData;
      } catch (e) {
        setMDrawingData({ paths: [], dimensions: null });
        prevDrawingRef.current = { paths: [], dimensions: null };
      }
      setMBody("");
      skipNextDrawingAutosave.current = true;
    } else {
      setMBody(n.content || "");
      setMDrawingData({ paths: [], dimensions: null });
      prevDrawingRef.current = { paths: [], dimensions: null };
    }
    skipNextItemsAutosave.current = true;
    setMItems(Array.isArray(n.items) ? n.items : []);
    prevItemsRef.current = Array.isArray(n.items) ? n.items : [];
    setMTagList(Array.isArray(n.tags) ? n.tags : []);
    setMImages(Array.isArray(n.images) ? n.images : []);
    setTagInput("");
    setMColor(n.color || "default");
    
    // Store initial state to detect if user actually edited
    initialModalStateRef.current = {
      title: n.title || "",
      content: n.type === "draw" ? "" : (n.content || ""),
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };
    
    setViewMode(true);
    setModalMenuOpen(false);
    setOpen(true);
  };
  
  // Check if note is collaborative (has collaborators or is owned by someone else)
  const isCollaborativeNote = useCallback((noteId) => {
    if (!noteId) return false;
    const note = notes.find(n => String(n.id) === String(noteId));
    if (!note) return false;
    const hasCollaborators = note.collaborators !== undefined && note.collaborators !== null;
    const isOwnedByOther = note.user_id && currentUser && note.user_id !== currentUser.id;
    return hasCollaborators || isOwnedByOther;
  }, [notes, currentUser]);
  
  // Auto-save timeout ref - must be defined before closeModal
  const autoSaveTimeoutRef = useRef(null);
  
  // Check if the note has been modified from initial state
  const hasNoteBeenModified = useCallback(() => {
    if (!initialModalStateRef.current || !activeId) return false;
    const initial = initialModalStateRef.current;
    const current = {
      title: mTitle.trim(),
      content: mBody,
      tags: mTagList,
      images: mImages,
      color: mColor,
    };
    // Compare all fields
    return (
      initial.title !== current.title ||
      initial.content !== current.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(current.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(current.images) ||
      initial.color !== current.color
    );
  }, [activeId, mTitle, mBody, mTagList, mImages, mColor]);
  
  // Auto-save for collaborative text notes - must be defined before useEffect that uses it
  const autoSaveCollaborativeNote = useCallback(async () => {
    if (activeId == null || mType !== "text" || !isCollaborativeNote(activeId) || viewMode || !hasNoteBeenModified()) return;
    
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    // Set new timeout for debounced save
    autoSaveTimeoutRef.current = setTimeout(async () => {
      const base = {
        id: activeId,
        title: mTitle.trim(),
        tags: mTagList,
        images: mImages,
        color: mColor,
        pinned: !!notes.find(n=>String(n.id)===String(activeId))?.pinned,
      };
      const payload = { ...base, type: "text", content: mBody, items: [] };

      try {
        await api(`/notes/${activeId}`, { method: "PUT", token, body: payload });
        invalidateNotesCache();
        
        // Update local state
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
      } catch (e) {
        console.error("Auto-save failed:", e);
        // Don't show error toast for auto-save failures to avoid interrupting user
      }
    }, 1000); // 1 second debounce
  }, [activeId, mType, mTitle, mTagList, mImages, mColor, mBody, notes, token, currentUser, isCollaborativeNote, viewMode, hasNoteBeenModified]);

  // Auto-save for collaborative text notes when content changes
  useEffect(() => {
    if (activeId && mType === "text" && isCollaborativeNote(activeId) && isOnline && !viewMode && hasNoteBeenModified()) {
      autoSaveCollaborativeNote();
    }
    
    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [mBody, mTitle, mTagList, mColor, mImages, activeId, mType, isCollaborativeNote, isOnline, viewMode, hasNoteBeenModified, autoSaveCollaborativeNote]);
  
  // Update initial state reference when note is updated from server (for collaborative notes)
  // This prevents overwriting server changes when user hasn't edited locally
  // Must be after hasNoteBeenModified is defined
  useEffect(() => {
    if (!open || !activeId || !initialModalStateRef.current) return;
    const n = notes.find((x) => String(x.id) === String(activeId));
    if (!n || n.type === "draw") return;
    
    // Check if server version is different from our initial state
    const serverState = {
      title: n.title || "",
      content: n.type === "draw" ? "" : (n.content || ""),
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      color: n.color || "default",
    };
    
    const initial = initialModalStateRef.current;
    const serverChanged = (
      initial.title !== serverState.title ||
      initial.content !== serverState.content ||
      JSON.stringify(initial.tags) !== JSON.stringify(serverState.tags) ||
      JSON.stringify(initial.images) !== JSON.stringify(serverState.images) ||
      initial.color !== serverState.color
    );
    
    // If server changed and user hasn't edited locally, update initial state to server state
    // This prevents overwriting server changes when user closes without editing
    if (serverChanged && !hasNoteBeenModified()) {
      initialModalStateRef.current = serverState;
      // Update local modal state to match server (user hasn't edited, so safe to update)
      setMTitle(serverState.title);
      setMBody(serverState.content);
      setMTagList(serverState.tags);
      setMImages(serverState.images);
      setMColor(serverState.color);
    }
  }, [notes, open, activeId, hasNoteBeenModified]);
  
  const closeModal = () => {
    // Save any pending changes for collaborative text notes before closing
    // Only save if NOT in view mode AND user has actually edited - don't overwrite with stale data
    if (activeId && mType === "text" && isCollaborativeNote(activeId) && !viewMode && hasNoteBeenModified()) {
      // Clear the timeout and save immediately
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      // Trigger immediate save
      const base = {
        id: activeId,
        title: mTitle.trim(),
        tags: mTagList,
        images: mImages,
        color: mColor,
        pinned: !!notes.find(n=>String(n.id)===String(activeId))?.pinned,
      };
      const payload = { ...base, type: "text", content: mBody, items: [] };
      
      api(`/notes/${activeId}`, { method: "PUT", token, body: payload })
        .then(() => {
          invalidateNotesCache();
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
        })
        .catch((e) => console.error("Final save on close failed:", e));
    }
    
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
        : mType === "checklist"
        ? { ...base, type: "checklist", content: "", items: mItems }
        : { ...base, type: "draw", content: JSON.stringify(mDrawingData), items: [] };

    try {
      setSavingModal(true);
      
      await api(`/notes/${activeId}`, { method: "PUT", token, body: payload });
      invalidateNotesCache();
      
      prevItemsRef.current = mType === "checklist" ? (Array.isArray(mItems) ? mItems : []) : [];
      prevDrawingRef.current = mType === "draw" ? (mDrawingData || { paths: [], dimensions: null }) : { paths: [], dimensions: null };
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
      // Check if user owns the note
      const note = notes.find(n => String(n.id) === String(activeId));
      if (note && note.user_id !== currentUser?.id) {
        showToast("You can't delete this note as you don't own it", "error");
        return;
      }
      
      await api(`/notes/${activeId}`, { method: "DELETE", token });
      invalidateNotesCache();
      
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(activeId)));
      closeModal();
      showToast("Note deleted successfully", "success");
    } catch (e) {
      if (e.status === 404 || e.message?.includes("not found")) {
        showToast("You can't delete this note as you don't own it", "error");
      } else {
        showToast(e.message || "Delete failed", "error");
      }
    }
  };
  const togglePin = async (id, toPinned) => {
    try {
      await api(`/notes/${id}`, { method: "PATCH", token, body: { pinned: !!toPinned } });
      invalidateNotesCache();
      
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

  // Checklist item drag handlers (for modal reordering)
  const onChecklistDragStart = (itemId, ev) => {
    checklistDragId.current = String(itemId);
    ev.currentTarget.classList.add("dragging");
  };
  const onChecklistDragOver = (overItemId, ev) => {
    ev.preventDefault();
    if (!checklistDragId.current) return;
    if (String(checklistDragId.current) === String(overItemId)) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onChecklistDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onChecklistDrop = async (overItemId, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const dragged = checklistDragId.current;
    checklistDragId.current = null;

    if (!dragged || String(dragged) === String(overItemId)) return;

    // Only allow reordering unchecked items
    const draggedItem = mItems.find(it => String(it.id) === String(dragged));
    const overItem = mItems.find(it => String(it.id) === String(overItemId));

    if (!draggedItem || !overItem || draggedItem.done || overItem.done) return;

    // Reorder the unchecked items
    const uncheckedItems = mItems.filter(it => !it.done);
    const checkedItems = mItems.filter(it => it.done);

    const draggedIndex = uncheckedItems.findIndex(it => String(it.id) === String(dragged));
    const overIndex = uncheckedItems.findIndex(it => String(it.id) === String(overItemId));

    if (draggedIndex === -1 || overIndex === -1) return;

    // Remove dragged item and insert at new position
    const [removed] = uncheckedItems.splice(draggedIndex, 1);
    uncheckedItems.splice(overIndex, 0, removed);

    // Combine back with checked items
    const newItems = [...uncheckedItems, ...checkedItems];

    setMItems(newItems);
    prevItemsRef.current = newItems;

    // Save to server
    try {
      if (activeId) {
        await api(`/notes/${activeId}`, {
          method: "PATCH",
          token,
          body: { items: newItems, type: "checklist", content: "" }
        });
      }
    } catch (error) {
      console.error("Failed to reorder checklist items:", error);
    }
  };
  const onChecklistDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
    // Clean up any remaining drag-over states
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  };

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
        try { el.setSelectionRange(snippet.length, snippet.length); } catch (e) {}
      });
      return;
    }

    // Handle list formatting when no text is selected
    if ((type === "ul" || type === "ol") && start === end) {
      const snippet = type === "ul" ? "- " : "1. ";
      const newValue = value.slice(0, start) + snippet + value.slice(end);
      setter(newValue);
      requestAnimationFrame(() => {
        el.focus();
        try { el.setSelectionRange(start + snippet.length, start + snippet.length); } catch (e) {}
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
      } catch (e) {}
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
        try { el.setSelectionRange(res.range[0], res.range[1]); } catch (e) {}
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
    } catch (e) {}

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
          className="glass-card rounded-xl shadow-2xl w-full h-full max-w-none rounded-none sm:w-11/12 sm:max-w-2xl sm:h-[95vh] sm:rounded-xl flex flex-col relative overflow-hidden"
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
              className="sticky top-0 z-20 px-4 sm:px-6 pt-4 pb-3 modal-header-blur rounded-t-none sm:rounded-t-xl"
              style={{ backgroundColor: modalBgFor(mColor, dark) }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className={`flex-[1_0_50%] min-w-[240px] shrink-0 bg-transparent text-2xl font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none pr-2 ${
                    !isOnline ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  value={mTitle}
                  onChange={(e) => { if (isOnline) setMTitle(e.target.value) }}
                  placeholder="Title"
                  disabled={!isOnline}
                />
                <div className="flex items-center gap-2 flex-none ml-auto">
                  {/* Collaboration button - always visible */}
                  <button
                    className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 relative"
                    title="Collaborate"
                    onClick={async () => {
                      setCollaborationModalOpen(true);
                      if (activeId) {
                        await loadCollaboratorsForAddModal(activeId);
                      }
                    }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z"/>
                    </svg>
                    <svg className="w-3 h-3 absolute -top-1 -right-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
                    </svg>
                  </button>


                  {/* View/Edit toggle only for TEXT notes - hidden when offline */}
                  {isOnline && mType === "text" && (
                    <button
                      className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10 text-sm"
                      onClick={() => { setViewMode((v) => !v); setShowModalFmt(false); }}
                      title={viewMode ? "Switch to Edit mode" : "Switch to View mode"}
                    >
                      {viewMode ? "Edit mode" : "View mode"}
                    </button>
                  )}

                  {isOnline && mType === "text" && !viewMode && (
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

                  {/* 3-dots menu - hidden when offline */}
                  {isOnline && (
                    <>
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
                          className={`min-w-[180px] border border-[var(--border-light)] rounded-lg shadow-lg overflow-hidden ${dark ? "text-gray-100" : "bg-white text-gray-800"}`}
                          style={{ backgroundColor: dark ? "#222222" : undefined }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                            onClick={() => { const n = notes.find(nn => String(nn.id) === String(activeId)); if (n) handleDownloadNote(n); setModalMenuOpen(false); }}
                          >
                            <DownloadIcon />
                            Download .md
                          </button>
                          <button
                            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              const note = notes.find(nn => String(nn.id) === String(activeId));
                              if (note) {
                                handleArchiveNote(activeId, !note.archived);
                                setModalMenuOpen(false);
                              }
                            }}
                          >
                            <ArchiveIcon />
                            {activeNoteObj?.archived ? "Unarchive" : "Archive"}
                          </button>
                          <button
                            className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-red-600 ${dark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}
                            onClick={() => { setConfirmDeleteOpen(true); setModalMenuOpen(false); }}
                          >
                            <Trash />
                            Delete
                          </button>
                        </div>
                      </Popover>
                    </>
                  )}

                  {/* Pin button - hidden when offline or in archived view */}
                  {isOnline && tagFilter !== 'ARCHIVED' && (
                    <button
                      className="rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="Pin/unpin"
                      onClick={() => activeId != null && togglePin(activeId, !(notes.find((n) => String(n.id) === String(activeId))?.pinned))}
                    >
                      {(notes.find((n) => String(n.id) === String(activeId))?.pinned) ? <PinFilled /> : <PinOutline />}
                    </button>
                  )}

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
            <div className={mType === "draw" ? "p-2 pb-6" : "p-6 pb-12"} onClick={onModalBodyClick}>
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
                      {isOnline && (
                        <button
                          title="Remove image"
                          className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full w-5 h-5 text-xs"
                          onClick={() => setMImages((prev) => prev.filter((x) => x.id !== im.id))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Text, Checklist, or Drawing */}
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
                      className={`w-full bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none resize-none overflow-hidden min-h-[160px] ${
                        !isOnline ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{ scrollBehavior: 'unset' }}
                      value={mBody}
                      onChange={(e) => { if (isOnline) { setMBody(e.target.value); resizeModalTextarea(); } }}
                      onKeyDown={(e) => {
                        if (!isOnline) return;
                        if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
                          const el = mBodyRef.current;
                          const value = mBody;
                          const start = el.selectionStart ?? value.length;
                          const end = el.selectionEnd ?? value.length;

                          // Check if cursor is on the last line before Enter
                          const lastNewlineIndex = value.lastIndexOf('\n');
                          const isOnLastLine = start > lastNewlineIndex;

                          const res = handleSmartEnter(value, start, end);
                          if (res) {
                            e.preventDefault();
                            setMBody(res.text);
                            requestAnimationFrame(() => {
                              try { el.setSelectionRange(res.range[0], res.range[1]); } catch (e) {}
                              resizeModalTextarea();

                              // If we were on the last line, scroll down a bit to ensure cursor visibility
                              if (isOnLastLine) {
                                const modalScrollEl = modalScrollRef.current;
                                if (modalScrollEl) {
                                  setTimeout(() => {
                                    modalScrollEl.scrollTop += 30; // Scroll down by 30px
                                  }, 50);
                                }
                              }
                            });
                          } else if (isOnLastLine) {
                            // If not handled by smart enter but on last line, allow normal Enter but scroll down
                            setTimeout(() => {
                              const modalScrollEl = modalScrollRef.current;
                              if (modalScrollEl) {
                                modalScrollEl.scrollTop += 30; // Scroll down by 30px
                              }
                            }, 10);
                          }
                        }
                      }}
                      placeholder="Write your note…"
                      disabled={!isOnline}
                    />
                  </div>
                )
              ) : mType === "checklist" ? (
                <div className="space-y-4 md:space-y-2">
                  {/* Add new item row - hidden when offline */}
                  {isOnline && (
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
                                  } catch (e) {
                                    // Handle error silently
                                  }
                            }
                          }
                        }}
                        placeholder="List item…"
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
                            } catch (e) {}
                          } 
                        }}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  {mItems.length > 0 ? (
                    <div className="space-y-4 md:space-y-2">
                      {/* Unchecked items */}
                      {mItems.filter(it => !it.done).map((it) => (
                        <div
                          key={it.id}
                          data-checklist-item={it.id}
                          onDragOver={(e) => onChecklistDragOver(it.id, e)}
                          onDragLeave={onChecklistDragLeave}
                          onDrop={(e) => onChecklistDrop(it.id, e)}
                          className="group flex items-start gap-2"
                        >
                          {/* Drag handle */}
                          <div
                            draggable={isOnline}
                            onDragStart={(e) => onChecklistDragStart(it.id, e)}
                            onDragEnd={onChecklistDragEnd}
                            onTouchStart={(e) => {
                              // Handle touch drag start - only when touching the handle
                              if (!isOnline) return;
                              const target = e.currentTarget.closest('[data-checklist-item]');
                              if (target) {
                                checklistDragId.current = String(it.id);
                                target.classList.add("dragging");
                              }
                            }}
                            onTouchMove={(e) => {
                              if (!checklistDragId.current) return;

                              const touch = e.touches[0];
                              const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
                              if (elementAtPoint) {
                                // Find the checklist item container
                                const checklistItem = elementAtPoint.closest('[data-checklist-item]');
                                if (checklistItem && checklistItem !== e.currentTarget.closest('[data-checklist-item]')) {
                                  const dragOverEvent = new Event('dragover', { bubbles: true });
                                  checklistItem.dispatchEvent(dragOverEvent);
                                }
                              }
                            }}
                            onTouchEnd={(e) => {
                              if (!checklistDragId.current) return;
                              const touch = e.changedTouches[0];
                              const elementAtPoint = document.elementFromPoint(touch.clientX, touch.clientY);
                              const target = e.currentTarget.closest('[data-checklist-item]');

                              if (elementAtPoint) {
                                const checklistItem = elementAtPoint.closest('[data-checklist-item]');
                                if (checklistItem && checklistItem !== target) {
                                  const dropEvent = new Event('drop', { bubbles: true });
                                  checklistItem.dispatchEvent(dropEvent);
                                }
                              }

                              if (target) {
                                target.classList.remove("dragging");
                              }
                              checklistDragId.current = null;

                              // Clean up any remaining drag-over states
                              document.querySelectorAll('.drag-over').forEach(el => {
                                el.classList.remove('drag-over');
                              });
                            }}
                            className="flex items-center justify-center py-1 px-1 mt-0.5 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-70 transition-opacity"
                            style={{ touchAction: 'none' }}
                          >
                            <div className="grid grid-cols-2 gap-0.5">
                              <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                              <div className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                            </div>
                          </div>

                          <div className="flex-1">
                          <ChecklistRow
                            item={it}
                            readOnly={!isOnline}
                            disableToggle={!isOnline}      /* disable toggle when offline */
                            showRemove={isOnline && true}  /* show delete X only when online */
                            size="lg"                  /* bigger checkboxes and X in modal */
                            onToggle={async (checked, e) => {
                              e?.stopPropagation(); // Prevent any unwanted event bubbling
                              if (!isOnline) return;
                              const newItems = mItems.map(p => p.id === it.id ? { ...p, done: checked } : p);
                              setMItems(newItems);
                                                        try {
                              if (activeId) {
                                await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                prevItemsRef.current = newItems;
                              }
                            } catch (e) {
                              // Handle error silently
                            }
                            }}
                            onChange={async (txt) => {
                              if (!isOnline) return;
                              const newItems = mItems.map(p => p.id === it.id ? { ...p, text: txt } : p);
                              setMItems(newItems);
                              try {
                                if (activeId) {
                                  await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                  prevItemsRef.current = newItems;
                                }
                              } catch (e) {}
                            }}
                            onRemove={async () => {
                              if (!isOnline) return;
                              const newItems = mItems.filter(p => p.id !== it.id);
                              setMItems(newItems);
                              try {
                                if (activeId) {
                                  await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                  prevItemsRef.current = newItems;
                                }
                              } catch (e) {}
                            }}
                          />
                          </div>
                        </div>
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
                                readOnly={!isOnline}
                                disableToggle={!isOnline}      /* disable toggle when offline */
                                showRemove={isOnline && true}  /* show delete X only when online */
                                size="lg"                  /* bigger checkboxes and X in modal */
                                onToggle={async (checked, e) => {
                                  e?.stopPropagation(); // Prevent any unwanted event bubbling
                                  if (!isOnline) return;
                                  const newItems = mItems.map(p => p.id === it.id ? { ...p, done: checked } : p);
                                  setMItems(newItems);
                                  try {
                                    if (activeId) {
                                      await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                      prevItemsRef.current = newItems;
                                    }
                                  } catch (e) {}
                                }}
                                onChange={async (txt) => {
                                  if (!isOnline) return;
                                  const newItems = mItems.map(p => p.id === it.id ? { ...p, text: txt } : p);
                                  setMItems(newItems);
                                  try {
                                    if (activeId) {
                                      await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                      prevItemsRef.current = newItems;
                                    }
                                  } catch (e) {}
                                }}
                                onRemove={async () => {
                                  if (!isOnline) return;
                                  const newItems = mItems.filter(p => p.id !== it.id);
                                  setMItems(newItems);
                                  try {
                                    if (activeId) {
                                      await api(`/notes/${activeId}`, { method: "PATCH", token, body: { items: newItems, type: "checklist", content: "" } });
                                      prevItemsRef.current = newItems;
                                    }
                                  } catch (e) {}
                                }}
                        />
                      ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : <p className="text-sm text-gray-500">No items yet.</p>}
                </div>
              ) : (
                <DrawingCanvas
                  data={mDrawingData}
                  onChange={setMDrawingData}
                  width={750}
                  height={850}
                  readOnly={!isOnline}
                  darkMode={dark}
                  initialMode="view"
                />
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
                  {/* Tag removal button - hidden when offline */}
                  {isOnline && (
                    <button
                      className="ml-1 opacity-70 hover:opacity-100 focus:outline-none"
                      title="Remove tag"
                      onClick={() => setMTagList((prev) => prev.filter((t) => t !== tag))}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {/* Tag input - hidden when offline */}
              {isOnline && (
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={handleTagBlur}
                  onPaste={handleTagPaste}
                  placeholder={mTagList.length ? "Add tag" : "Add tags"}
                  className="bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none min-w-[8ch] flex-1"
                />
              )}
            </div>

            {/* Right controls */}
            <div className="w-full sm:w-auto flex items-center gap-3 flex-wrap justify-end">
              {/* Color dropdown (modal) - hidden when offline */}
              {isOnline && (
                <>
                  <button
                    ref={modalColorBtnRef}
                    type="button"
                    onClick={() => setShowModalColorPop((v) => !v)}
                    className="w-8 h-8 rounded-full border-2 border-[var(--border-light)] hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 flex items-center justify-center"
                    title="Color"
                    style={{
                      backgroundColor: mColor === "default" ? "transparent" : solid(bgFor(mColor, dark)),
                      borderColor: mColor === "default" ? "#d1d5db" : solid(bgFor(mColor, dark)),
                    }}
                  >
                    {mColor === "default" && (
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: dark ? "#1f2937" : "#fff" }} />
                    )}
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
                </>
              )}

              {/* Add images - hidden when offline */}
              {isOnline && (
                <>
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
                </>
              )}

              {/* Save button - hidden when offline or for collaborative text notes (they auto-save) */}
              {isOnline && modalHasChanges && !(mType === "text" && isCollaborativeNote(activeId)) && (
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
                onClick={() => {
                  setCollaborationModalOpen(false);
                  setCollaboratorUsername("");
                  setShowUserDropdown(false);
                  setFilteredUsers([]);
                }}
              />
              <div
                className="glass-card rounded-xl shadow-2xl w-[90%] max-w-md p-6 relative max-h-[90vh] overflow-y-auto"
                style={{ backgroundColor: dark ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.95)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {(() => {
                  // Check if user owns the note (or if it's a new note)
                  const note = activeId ? notes.find(n => String(n.id) === String(activeId)) : null;
                  const isOwner = !activeId || note?.user_id === currentUser?.id;
                  
                  return (
                    <>
                      <h3 className="text-lg font-semibold mb-4">
                        {isOwner ? "Add Collaborator" : "Collaborators"}
                      </h3>
                      
                      {/* Show existing collaborators with remove option */}
                      {addModalCollaborators.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Current Collaborators:</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {addModalCollaborators.map((collab) => {
                              const canRemove = isOwner || collab.id === currentUser?.id;
                              
                              return (
                                <div
                                  key={collab.id}
                                  className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                                >
                                  <div>
                                    <p className="font-medium text-sm">{collab.name || collab.email}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{collab.email}</p>
                                  </div>
                                  {canRemove && (
                                    <button
                                      onClick={async () => {
                                        await removeCollaborator(collab.id, activeId);
                                      }}
                                      className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                      title={collab.id === currentUser?.id ? "Remove yourself" : "Remove collaborator"}
                                    >
                                      {collab.id === currentUser?.id ? "Leave" : "Remove"}
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Only show add collaborator input/button if user owns the note */}
                      {isOwner && (
                        <>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            Enter the username of the person you want to collaborate with on this note.
                          </p>
                          <div ref={collaboratorInputRef} className="relative">
                            <input
                              type="text"
                              value={collaboratorUsername}
                              onChange={(e) => {
                                const value = e.target.value;
                                setCollaboratorUsername(value);
                                updateDropdownPosition();
                                searchUsers(value);
                              }}
                              onFocus={() => {
                                updateDropdownPosition();
                                searchUsers(collaboratorUsername || "");
                              }}
                              placeholder="Search by username or email"
                              className="w-full px-3 py-2 border border-[var(--border-light)] rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-transparent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && collaboratorUsername.trim()) {
                                  // If dropdown is open and there's a filtered user, select the first one
                                  if (showUserDropdown && filteredUsers.length > 0) {
                                    const firstUser = filteredUsers[0];
                                    setCollaboratorUsername(firstUser.name || firstUser.email);
                                    setShowUserDropdown(false);
                                  } else {
                                    addCollaborator(collaboratorUsername.trim());
                                  }
                                } else if (e.key === 'Escape') {
                                  setShowUserDropdown(false);
                                }
                              }}
                            />
                          </div>
                          <div className="mt-5 flex justify-end gap-3">
                            <button
                              className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                              onClick={() => {
                                setCollaborationModalOpen(false);
                                setCollaboratorUsername("");
                                setShowUserDropdown(false);
                                setFilteredUsers([]);
                              }}
                            >
                              Cancel
                            </button>
                            <button
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                              onClick={async () => {
                                if (collaboratorUsername.trim()) {
                                  await addCollaborator(collaboratorUsername.trim());
                                }
                              }}
                            >
                              Add Collaborator
                            </button>
                          </div>
                        </>
                      )}
                      
                      {/* If user doesn't own the note, show only cancel button */}
                      {!isOwner && (
                        <div className="mt-5 flex justify-end gap-3">
                          <button
                            className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                            onClick={() => {
                              setCollaborationModalOpen(false);
                              setCollaboratorUsername("");
                              setShowUserDropdown(false);
                              setFilteredUsers([]);
                            }}
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* User dropdown portal - rendered outside modal */}
          {showUserDropdown && filteredUsers.length > 0 && createPortal(
            <div
              data-user-dropdown
              className="fixed z-[60] bg-white dark:bg-[#272727] border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`
              }}
            >
              {loadingUsers ? (
                <div className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                  Searching...
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                    onClick={() => {
                      setCollaboratorUsername(user.name || user.email);
                      setShowUserDropdown(false);
                    }}
                  >
                    <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {user.name || user.email}
                    </div>
                    {user.name && (
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {user.email}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>,
            document.body
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
        allowRegistration={allowRegistration}
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
        permanent={alwaysShowSidebarOnWide && windowWidth >= 700}
        width={sidebarWidth}
        onResize={setSidebarWidth}
      />

      {/* Settings Panel */}
      <SettingsPanel
        open={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        dark={dark}
        onExportAll={exportAll}
        onImportAll={() => importFileRef.current?.click()}
        onImportGKeep={() => gkeepFileRef.current?.click()}
        onImportMd={() => mdFileRef.current?.click()}
        onDownloadSecretKey={downloadSecretKey}
        alwaysShowSidebarOnWide={alwaysShowSidebarOnWide}
        setAlwaysShowSidebarOnWide={setAlwaysShowSidebarOnWide}
      />

      {/* Admin Panel */}
      {console.log("Rendering AdminPanel with:", { adminPanelOpen, adminSettings, allUsers: allUsers?.length })}
      <AdminPanel
        open={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        dark={dark}
        adminSettings={adminSettings}
        allUsers={allUsers}
        newUserForm={newUserForm}
        setNewUserForm={setNewUserForm}
        updateAdminSettings={updateAdminSettings}
        createUser={createUser}
        deleteUser={deleteUser}
        updateUser={updateUser}
        currentUser={currentUser}
        showGenericConfirm={showGenericConfirm}
        showToast={showToast}
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
        composerDrawingData={composerDrawingData}
        setComposerDrawingData={setComposerDrawingData}
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
        sidebarPermanent={alwaysShowSidebarOnWide && windowWidth >= 700}
        sidebarWidth={sidebarWidth}
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
        onBulkArchive={onBulkArchive}
        onBulkColor={onBulkColor}
        onBulkDownloadZip={onBulkDownloadZip}
        // view mode
        listView={listView}
        onToggleViewMode={onToggleViewMode}
        // SSE connection status
        sseConnected={sseConnected}
        isOnline={isOnline}
        loadNotes={loadNotes}
        loadArchivedNotes={loadArchivedNotes}
        // checklist update
        onUpdateChecklistItem={onUpdateChecklistItem}
        // Admin panel
        openAdminPanel={openAdminPanel}
        // Settings panel
        openSettingsPanel={openSettingsPanel}
      />
      {modal}

      {/* Generic Confirmation Dialog */}
      {genericConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setGenericConfirmOpen(false)}
          />
          <div
            className="glass-card rounded-xl shadow-2xl w-[90%] max-w-sm p-6 relative"
            style={{ backgroundColor: dark ? "rgba(40,40,40,0.95)" : "rgba(255,255,255,0.95)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">{genericConfirmConfig.title || "Confirm Action"}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {genericConfirmConfig.message}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="px-4 py-2 rounded-lg border border-[var(--border-light)] hover:bg-black/5 dark:hover:bg-white/10"
                onClick={() => setGenericConfirmOpen(false)}
              >
                {genericConfirmConfig.cancelText || "Cancel"}
              </button>
              <button
                className={`px-4 py-2 rounded-lg ${genericConfirmConfig.danger ? "bg-red-600 text-white hover:bg-red-700" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
                onClick={async () => {
                  setGenericConfirmOpen(false);
                  if (genericConfirmConfig.onConfirm) {
                    await genericConfirmConfig.onConfirm();
                  }
                }}
              >
                {genericConfirmConfig.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-right-2 ${
                toast.type === 'success'
                  ? 'bg-green-600 text-white'
                  : toast.type === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-blue-600 text-white'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}