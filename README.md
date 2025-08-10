A sleek, Google Keep–style notes app with Markdown, checklists, images, tag chips, color themes, dark mode, drag-and-drop reordering, import/export, auth, and a glassy UI—built with Vite + React and a tiny Express + SQLite API.

## ✨ Features

* Authentication (register, login, sign out) — each user sees only **their** notes
* Markdown viewing (click note body to edit)
* Checklist notes (add items, toggle done, inline edit)
* Image attachments (thumb in grid, larger in modal)
* Pin/unpin notes; separate **Pinned / Others** sections
* Tag chips with quick add/remove (comma input → chips)
* Color palettes per note
* Dark/light mode with persistence
* Drag to reorder within each section
* Search across title, content, tags, checklist items, and image names
* Per-note **Download .txt** (modal ⋮ menu)
* **Export all** notes to JSON and **Import** (merges; keeps existing)
* Delete confirmation dialog
* Blurred modal backdrop; polished light/dark styling
* Mobile-responsive composer & modal footers
* Backend: Express API + SQLite (via `better-sqlite3`)
* Docker-ready

## 🧰 Requirements

* Node.js **18+** and npm
* (Optional) Docker & Docker Compose

## ⚙️ Environment

Create a `.env` in the project root:

```env
API_PORT=8080
JWT_SECRET=replace-with-a-long-random-string
DB_FILE=./data/notes.db
# FRONTEND_DIR=./dist   # used in production
```

## 🛠 Setup (development)

Install deps:

```bash
npm install
# If needed:
npm install -D concurrently nodemon
npm install express better-sqlite3 cors jsonwebtoken bcryptjs
```

Vite proxy (add to `vite.config.js`):

```js
export default {
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
};
```

Scripts (in `package.json`):

```json
{
  "scripts": {
    "dev": "concurrently -k -n WEB,API -c auto \"vite\" \"npm:api\"",
    "api": "nodemon server/index.js",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node server/index.js"
  }
}
```

Run dev:

```bash
npm run dev
# Web: http://localhost:5173
# API: http://localhost:8080 (proxied at /api)
```

## 🏗 Production

```bash
npm run build
NODE_ENV=production npm start
# Visit: http://localhost:8080
```

## 🐳 Docker (single image: API + built frontend)

**Dockerfile**

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY vite.config.js ./
COPY src ./src
COPY public ./public
COPY server ./server
RUN npm ci
RUN npm run build

FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server ./server
COPY --from=builder /app/dist ./dist
RUN npm ci --omit=dev
RUN mkdir -p /app/data
ENV API_PORT=8080
ENV DB_FILE=/app/data/notes.db
ENV JWT_SECRET=change-me
EXPOSE 8080
CMD ["node", "server/index.js"]
```

Build & run:

```bash
docker build -t glass-keep .
docker run --name glass-keep \
  -p 8080:8080 \
  -e JWT_SECRET="change-me" \
  -v $(pwd)/data:/app/data \
  glass-keep
# Visit: http://localhost:8080
```

## 👤 Accounts

* Click **Create one** on the login page to register
* After login/registration you’ll be redirected to `#/notes`
* **Sign out** is in the header ⋮ menu

## 📝 Notes quick tips

* Switch **Note / Checklist** in the composer toggle
* Add images via the image icon (client-side compressed)
* Add tags with commas; edit/remove chips inline
* Use the modal’s ⋮ to **Download .txt**
* Use the header ⋮ to **Export** or **Import** all notes (JSON)
