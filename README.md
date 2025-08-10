A sleek, Keep–style notes app with Markdown, checklists, images, tag chips, color themes, dark mode, drag-and-drop reordering, import/export, auth, and a glassy UI—built with Vite + React and a tiny Express + SQLite API.

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


## 🛠 Setup (development)

Install deps:

```bash
npm install
# If needed:
npm install -D concurrently nodemon
npm install express better-sqlite3 cors jsonwebtoken bcryptjs
```


Run dev:
```bash
npm run dev
```


## 🐳 Docker (single image: API + built frontend)

**Dockerfile**

```dockerfile
# --- Build stage
FROM node:18-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY ["package.json", "package-lock.json", "./"]
RUN npm ci

COPY ["index.html", "vite.config.js", "./"]
COPY ["src", "src"]
COPY ["public", "public"]
COPY ["server", "server"]

# Safety: ensure no nested node_modules from host
RUN rm -rf server/node_modules

RUN npm run build
RUN npm prune --omit=dev

# --- Runtime
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY ["server", "server"]
COPY --from=builder /app/dist ./dist
COPY ["package.json", "package-lock.json", "./"]

RUN mkdir -p /app/data

ENV API_PORT=8080
ENV DB_FILE=/app/data/notes.db
EXPOSE 8080
CMD ["node", "server/index.js"]

```

Build & run:

```bash
docker build --no-cache -t glass-keep .
docker rm -f glass-keep 2>/dev/null || true
docker run --name glass-keep \
  -p 8080:8080 \
  -e API_PORT=8080 \
  -e JWT_SECRET="replace-with-a-long-random-string" \
  -v "$(pwd)/data:/app/data" \
  -d glass-keep
```
# Visit: http://localhost:8080

docker-compose.yml
```bash
version: "3.8"
services:
  app:
    container_name: glass-keep
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - NODE_ENV=production
      - API_PORT=8080
      - DB_FILE=/app/data/notes.db
      - JWT_SECRET=replace-with-a-long-random-string
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

Run it from your project root (where the Dockerfile is):
```bash
docker compose up --build -d
docker compose logs -f
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
