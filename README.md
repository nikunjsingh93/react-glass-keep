# Glass Keep — Keep-style notes (Vite + React)

A lightweight, offline-first notes app with Markdown preview, pinning, tags (chip editor), color themes, dark mode, drag-and-drop reordering, and a glassy UI.

## ✨ Features
- Markdown viewing (click note body to edit)
- Pin/unpin notes, separate “Pinned / Others” sections
- Tag chips with quick add/remove
- Color palettes per note
- Dark mode with persistence
- Drag to reorder within each section
- Search across title, content, and tags
- LocalStorage persistence (no backend)

---

## 🧰 Prerequisites
- **Node.js 18+** (LTS recommended)
- **npm** (bundled with Node)

> Check your versions:
>
> ```bash
> node -v
> npm -v
> ```

---

## 🚀 Quick Start

```bash
# 1) Install dependencies
npm install

# 2) Start the dev server
npm run dev
# Vite will print a URL like http://localhost:5173 – open it in your browser

# 3) (optional) Production build
npm run build

# 4) (optional) Preview the production build locally
npm run preview
