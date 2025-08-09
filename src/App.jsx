import React, { useEffect, useMemo, useRef, useState } from "react";
import { marked as markedNamed } from "marked"; // modern marked
const marked = markedNamed?.parse ? markedNamed : (window.marked || { parse: (t) => t });

/** ---- Color maps (light & dark) ---- */
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

/** --- Light-mode modal color boost for readability --- */
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
  if (dark) return base; // unchanged in dark mode
  return mixWithWhite(solid(base), 0.8, 0.92);
};

/** ---- Icons ---- */
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
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none"
       xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 6h18M8 6V4h8v2m-1 0v13a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6h8Z"/>
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
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
  </svg>
);
const ImageIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
    <path d="M8 11l2.5 3 3.5-4 4 5" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
);

/** ---- Markdown → plain text (for grid preview) ---- */
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

/** ---- Styles injection (CSS + clamp + modal blur) ---- */
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

/** ---- Small utils ---- */
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Image compression to keep localStorage happy */
async function fileToCompressedDataURL(file, maxDim = 1600, quality = 0.85) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });

  // Create image element
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });

  // Downscale if needed
  const { width, height } = img;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Use jpeg for better compression
  return canvas.toDataURL("image/jpeg", quality);
}

/** ---- Checklist item row (shared) ---- */
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

export default function App() {
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);

  // Composer (new note)
  const [composerType, setComposerType] = useState("text"); // 'text' | 'checklist'
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [composerColor, setComposerColor] = useState("default");
  const [composerImages, setComposerImages] = useState([]); // [{id, src, name}]
  const contentRef = useRef(null);
  const composerFileRef = useRef(null);

  // Checklist composer state
  const [clItems, setClItems] = useState([]); // [{id,text,done}]
  const [clInput, setClInput] = useState("");

  // Modal (existing note)
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [mType, setMType] = useState("text"); // 'text' | 'checklist'
  const [mTitle, setMTitle] = useState("");
  const [mBody, setMBody] = useState("");
  const [mTagList, setMTagList] = useState([]); // chips array
  const [tagInput, setTagInput] = useState("");
  const [mColor, setMColor] = useState("default");
  const [viewMode, setViewMode] = useState(true); // only for text notes
  const [mImages, setMImages] = useState([]); // [{id, src, name}]
  const mBodyRef = useRef(null);
  const modalFileRef = useRef(null);

  // Checklist modal
  const [mItems, setMItems] = useState([]); // [{id,text,done}]
  const [mInput, setMInput] = useState("");

  // Drag
  const dragId = useRef(null);

  /** ---- Effects ---- */
  useEffect(() => {
    const style = document.createElement("style");
    style.innerHTML = globalCSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("glass-keep-notes");
    if (saved) setNotes(JSON.parse(saved));
    const savedDark =
      localStorage.getItem("glass-keep-dark-mode") === "true" ||
      (!("glass-keep-dark-mode" in localStorage) &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    setDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
  }, []);

  // Lock body scroll while modal open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Auto-resize composer textarea
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.style.height = "auto";
    contentRef.current.style.height = contentRef.current.scrollHeight + "px";
  }, [content, composerType]);

  // Auto-resize modal textarea (no inner scrollbar)
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

  /** ---- Helpers ---- */
  const saveNotes = (arr) => {
    setNotes(arr);
    try {
      localStorage.setItem("glass-keep-notes", JSON.stringify(arr));
    } catch (e) {
      console.error("localStorage save failed (too much data?)", e);
    }
  };
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("glass-keep-dark-mode", String(next));
  };

  // Tag helpers (modal)
  const addTags = (raw) => {
    const parts = String(raw)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setMTagList((prev) => {
      const set = new Set(prev.map((x) => x.toLowerCase()));
      const merged = [...prev];
      for (const p of parts) {
        if (!set.has(p.toLowerCase())) {
          merged.push(p);
          set.add(p.toLowerCase());
        }
      }
      return merged;
    });
  };
  const handleTagKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (tagInput.trim()) {
        addTags(tagInput);
        setTagInput("");
      }
    } else if (e.key === "Backspace" && !tagInput) {
      setMTagList((prev) => prev.slice(0, -1));
    }
  };
  const handleTagBlur = () => {
    if (tagInput.trim()) {
      addTags(tagInput);
      setTagInput("");
    }
  };
  const handleTagPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (text && text.includes(",")) {
      e.preventDefault();
      addTags(text);
    }
  };
  const removeTag = (tag) => {
    setMTagList((prev) => prev.filter((t) => t !== tag));
  };

  /** ---- Image helpers ---- */
  const addImagesToState = async (fileList, setter) => {
    const files = Array.from(fileList || []);
    const results = [];
    for (const f of files) {
      try {
        const src = await fileToCompressedDataURL(f);
        results.push({ id: uid(), src, name: f.name });
      } catch (e) {
        console.error("Image load failed", e);
      }
    }
    if (results.length) setter((prev) => [...prev, ...results]);
  };

  /** ---- Checklist helpers ---- */
  const addComposerItem = () => {
    const t = clInput.trim();
    if (!t) return;
    setClItems((prev) => [...prev, { id: uid(), text: t, done: false }]);
    setClInput("");
  };
  const addModalItem = () => {
    const t = mInput.trim();
    if (!t) return;
    setMItems((prev) => [...prev, { id: uid(), text: t, done: false }]);
    setMInput("");
  };

  /** ---- CRUD ---- */
  const addNote = () => {
    if (composerType === "text") {
      if (!title.trim() && !content.trim() && composerImages.length === 0) return;
      const n = {
        id: Date.now(),
        type: "text",
        title: title.trim(),
        content,
        items: [],
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        images: composerImages,
        color: composerColor,
        pinned: false,
        timestamp: new Date().toISOString(),
      };
      const next = [n, ...notes];
      saveNotes(next);
      setTitle(""); setContent(""); setTags(""); setComposerColor("default");
      setComposerImages([]);
    } else {
      // checklist
      if (!title.trim() && clItems.length === 0 && composerImages.length === 0) return;
      const n = {
        id: Date.now(),
        type: "checklist",
        title: title.trim(),
        content: "",
        items: clItems,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        images: composerImages,
        color: composerColor,
        pinned: false,
        timestamp: new Date().toISOString(),
      };
      const next = [n, ...notes];
      saveNotes(next);
      setTitle(""); setTags(""); setComposerColor("default");
      setClItems([]); setClInput("");
      setComposerImages([]);
    }
  };

  const openModal = (id) => {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    setActiveId(id);
    setMType(n.type || "text");
    setMTitle(n.title || "");
    setMBody(n.content || "");
    setMItems(Array.isArray(n.items) ? n.items : []);
    setMTagList(Array.isArray(n.tags) ? n.tags : []);
    setMImages(Array.isArray(n.images) ? n.images : []);
    setTagInput("");
    setMColor(n.color || "default");
    setViewMode(true);
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setActiveId(null);
    setViewMode(true);
  };

  const saveModal = () => {
    if (activeId == null) return;
    const next = notes.map((n) =>
      n.id === activeId
        ? {
            ...n,
            type: mType,
            title: mTitle.trim(),
            content: mType === "text" ? mBody : "",
            items: mType === "checklist" ? mItems : [],
            tags: mTagList,
            images: mImages,
            color: mColor,
          }
        : n
    );
    saveNotes(next);
    closeModal();
  };

  const deleteModal = () => {
    if (activeId == null) return;
    const next = notes.filter((n) => n.id !== activeId);
    saveNotes(next);
    closeModal();
  };

  const togglePin = (id) => {
    const next = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    saveNotes(next);
  };

  /** ---- Drag within section (note cards) ---- */
  const onDragStart = (id, ev) => {
    dragId.current = id;
    ev.currentTarget.classList.add("dragging");
  };
  const onDragOver = (overId, ev) => {
    ev.preventDefault();
    if (!dragId.current || dragId.current === overId) return;
    ev.currentTarget.classList.add("drag-over");
  };
  const onDragLeave = (ev) => {
    ev.currentTarget.classList.remove("drag-over");
  };
  const onDrop = (overId, ev) => {
    ev.preventDefault();
    ev.currentTarget.classList.remove("drag-over");
    const from = notes.find((n) => n.id === dragId.current);
    const to = notes.find((n) => n.id === overId);
    if (!from || !to || from.pinned !== to.pinned) return;
    const arr = [...notes];
    const fromIdx = arr.findIndex((n) => n.id === from.id);
    const toIdx = arr.findIndex((n) => n.id === to.id);
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    saveNotes(arr);
  };
  const onDragEnd = (ev) => {
    ev.currentTarget.classList.remove("dragging");
    dragId.current = null;
  };

  /** ---- Derived ---- */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const t = (n.title || "").toLowerCase();
      const c = (n.content || "").toLowerCase();
      const tags = (n.tags || []).join(" ").toLowerCase();
      const items = (n.items || []).map((i) => i.text).join(" ").toLowerCase();
      const images = (n.images || []).map((im) => im.name).join(" ").toLowerCase();
      return t.includes(q) || c.includes(q) || tags.includes(q) || items.includes(q) || images.includes(q);
    });
  }, [notes, search]);

  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);

  /** ---- UI bits ---- */
  const ColorDot = ({ name, selected, onClick, darkMode }) => (
    <button
      type="button"
      onClick={onClick}
      title={name}
      className={`w-6 h-6 rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800 ${name === "default" ? "flex items-center justify-center" : ""} ${selected ? "ring-2 ring-indigo-500" : ""}`}
      style={{
        backgroundColor:
          name === "default" ? "transparent" : solid(bgFor(name, darkMode)),
        borderColor: name === "default" ? "#d1d5db" : "transparent",
      }}
    >
      {name === "default" && (
        <div className="w-4 h-4 rounded-full"
             style={{ backgroundColor: dark ? "#1f2937" : "#fff" }} />
      )}
    </button>
  );

  const NoteCard = ({ n }) => {
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

    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(n.id, e)}
        onDragOver={(e) => onDragOver(n.id, e)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(n.id, e)}
        onDragEnd={onDragEnd}
        onClick={() => openModal(n.id)}
        className="glass-card rounded-xl p-4 mb-6 cursor-pointer transform hover:scale-[1.02] transition-transform duration-200 relative"
        style={{ backgroundColor: bgFor(n.color, dark) }}
      >
        {/* Pin */}
        <button
          aria-label={n.pinned ? "Unpin note" : "Pin note"}
          onClick={(e) => {
            e.stopPropagation();
            togglePin(n.id);
          }}
          className="absolute top-3 right-3 rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          title={n.pinned ? "Unpin" : "Pin"}
        >
          {n.pinned ? <PinFilled /> : <PinOutline />}
        </button>

        {n.title && (
          <h3 className="font-bold text-lg mb-2 pr-10 break-words">{n.title}</h3>
        )}

        {/* Image preview */}
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
              <ChecklistRow key={it.id} item={it} readOnly />
            ))}
            {extraCount > 0 && (
              <div className="text-xs text-gray-600 dark:text-gray-300">+{extraCount} more…</div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-300">{done}/{total} completed</div>
          </div>
        )}

        {!!(n.tags && n.tags.length) && (
          <div className="mt-4 text-xs">
            {n.tags.map((tag) => (
              <span
                key={tag}
                className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

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

        <div className="flex items-center space-x-4">
          <button
            onClick={toggleDark}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
            title="Toggle dark mode"
          >
            {dark ? <Moon /> : <Sun />}
          </button>
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
                    <ChecklistRow
                      key={it.id}
                      item={it}
                      onToggle={(checked) => setClItems((prev) => prev.map(p => p.id === it.id ? { ...p, done: checked } : p))}
                      onChange={(txt) => setClItems((prev) => prev.map(p => p.id === it.id ? { ...p, text: txt } : p))}
                      onRemove={() => setClItems((prev) => prev.filter(p => p.id !== it.id))}
                    />
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

          <div className="flex items-center justify-between mt-3">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              type="text"
              placeholder="Add tags (comma-separated)"
              className="w-1/2 bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2"
            />
            <div className="flex items-center space-x-3">
              <div className="flex space-x-1">
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
                onChange={(e) => {
                  addImagesToState(e.target.files, setComposerImages);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => composerFileRef.current?.click()}
                className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                title="Add images"
              >
                <ImageIcon />
              </button>

              {/* Add Note */}
              <button
                onClick={addNote}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800 transition-colors"
              >
                Add Note
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <main className="px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
        {pinned.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3 ml-1">
              Pinned
            </h2>
            <div className="masonry-grid">
              {pinned.map((n) => (
                <NoteCard key={n.id} n={n} />
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
                <NoteCard key={n.id} n={n} />
              ))}
            </div>
          </section>
        )}

        {filtered.length === 0 && notes.length > 0 && search && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            No matching notes found.
          </p>
        )}
        {notes.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 mt-10">
            No notes yet. Add one to get started!
          </p>
        )}
      </main>

      {/* Modal */}
      {open && (
        <div
          className="modal-scrim fixed inset-0 bg-black/40 backdrop-blur-md z-40 flex items-center justify-center transition-opacity duration-300 overscroll-contain"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            className="glass-card rounded-xl shadow-2xl w-11/12 max-w-2xl h-[80vh] flex flex-col"
            style={{ backgroundColor: modalBgFor(mColor, dark) }}
          >
            {/* Content (single scroll area) */}
            <div className="p-6 relative flex-1 min-h-0 overflow-y-auto">
              {/* Pin */}
              <button
                className="absolute top-3 right-3 rounded-full p-2 opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                title="Pin/unpin"
                onClick={() => activeId != null && togglePin(activeId)}
              >
                {(notes.find((n) => n.id === activeId)?.pinned) ? (
                  <PinFilled />
                ) : (
                  <PinOutline />
                )}
              </button>

              {/* Title */}
              <input
                className="w-full bg-transparent text-2xl font-bold placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none mb-4 pr-10"
                value={mTitle}
                onChange={(e) => setMTitle(e.target.value)}
                placeholder="Title"
              />

              {/* Image strip in modal */}
              {mImages.length > 0 && (
                <div className="mb-4 flex gap-2 overflow-x-auto">
                  {mImages.map((im) => (
                    <div key={im.id} className="relative">
                      <img src={im.src} alt={im.name} className="h-24 w-36 object-cover rounded-md border border-[var(--border-light)]" />
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

              {/* Body (text OR checklist) */}
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
                    onChange={(e) => {
                      setMBody(e.target.value);
                      requestAnimationFrame(resizeModalTextarea);
                    }}
                    placeholder="Write your note…"
                  />
                )
              ) : (
                <div className="space-y-3">
                  {/* add row */}
                  <div className="flex gap-2">
                    <input
                      value={mInput}
                      onChange={(e) => setMInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addModalItem(); } }}
                      placeholder="List item… (press Enter to add)"
                      className="flex-1 bg-transparent placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none p-2 border-b border-[var(--border-light)]"
                    />
                    <button
                      onClick={addModalItem}
                      className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      Add
                    </button>
                  </div>

                  {/* items */}
                  {mItems.length > 0 ? (
                    <div className="space-y-2">
                      {mItems.map((it) => (
                        <ChecklistRow
                          key={it.id}
                          item={it}
                          onToggle={(checked) =>
                            setMItems((prev) => prev.map(p => p.id === it.id ? { ...p, done: checked } : p))
                          }
                          onChange={(txt) =>
                            setMItems((prev) => prev.map(p => p.id === it.id ? { ...p, text: txt } : p))
                          }
                          onRemove={() =>
                            setMItems((prev) => prev.filter(p => p.id !== it.id))
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No items yet.</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer: single-line (no wrap) + horizontal scroll for tags */}
            <div className="border-t border-[var(--border-light)] p-4 flex items-center justify-between gap-3 flex-nowrap">
              {/* Tag chips editor (single line, scroll if overflow) */}
              <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto whitespace-nowrap">
                {mTagList.map((tag) => (
                  <span
                    key={tag}
                    className="bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 text-xs font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                  >
                    {tag}
                    <button
                      className="ml-1 opacity-70 hover:opacity-100 focus:outline-none"
                      title="Remove tag"
                      onClick={() => removeTag(tag)}
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
                  className="bg-transparent text-sm placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none min-w-[8ch]"
                />
              </div>

              {/* Right: palette + add image + actions (no wrap) */}
              <div className="flex items-center gap-3 shrink-0">
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

                {/* Add Image (modal) */}
                <input
                  ref={modalFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    await addImagesToState(e.target.files, setMImages);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => modalFileRef.current?.click()}
                  className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                  title="Add images"
                >
                  <ImageIcon />
                </button>

                <button
                  onClick={deleteModal}
                  className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:focus:ring-offset-gray-800 flex items-center gap-2"
                  title="Delete"
                >
                  <Trash /> Delete
                </button>
                <button
                  onClick={saveModal}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
