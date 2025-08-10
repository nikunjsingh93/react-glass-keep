Glass Keep (Vite + React + SQLite API)
A sleek, glass-morphism Google Keep–style notes app with Markdown, images, checklists, tags, drag & drop, import/export, and auth.
Frontend is Vite + React; backend is a small Express API backed by SQLite.

✨ What’s new / changed
Authentication: register, login, and sign out; users see only their own notes.

Redirect to Notes after login; “Hi, Name” greeting with proper theming.

Pin/unpin notes (pin button replaces the old X).

Drag & drop reordering (pinned and others kept separate).

Markdown notes with line-clamped previews and … truncation in the grid.

Checklists (add items, toggle done, inline editing).

Image attachments (thumbnail in grid; bigger in modal).

Tags as chips in grid and in the modal footer (comma input → chips).

Per-note Download .txt (from the modal’s ⋮ menu).

Export all notes to JSON, and Import JSON (merges; keeps existing).

Delete confirmation dialog.

Modal polish: blurred backdrop, light-mode readability boost, close (X) next to pin.

Responsive footers: composer and modal wrap on small screens, align nicely on large ones.

Dark/light theme toggle, with correct colors on buttons/menus.

🧱 Tech stack
Frontend: Vite, React

API: Node.js + Express

DB: SQLite (via better-sqlite3)

Auth: JWT (JSON Web Tokens)

Styling: Tailwind-style utility classes (no separate Tailwind build step required)

The React app talks to the API at /api (Vite dev uses a proxy; production serves both API + static files from the same Express server).

📁 Project structure (typical)
bash
Copy
Edit
.
├─ src/
│  ├─ App.jsx
│  └─ main.jsx
├─ server/
│  ├─ index.js           # Express app (serves /api, and /dist in production)
│  ├─ db.js              # SQLite setup via better-sqlite3
│  └─ auth.js            # JWT + bcrypt helpers
├─ public/
├─ dist/                 # built frontend (created by `npm run build`)
├─ package.json
├─ vite.config.js
├─ .env                  # API env (JWT secret, ports, DB path)
└─ README.md
✅ Prerequisites
Node.js 18+ and npm

(Optional) Docker & Docker Compose

⚙️ Environment
Create a .env file in the project root (used by the API):

ini
Copy
Edit
# API
API_PORT=8080
JWT_SECRET=replace-with-a-long-random-string
DB_FILE=./data/notes.db

# When building for production, Express can also serve the built frontend
# FRONTEND_DIR=./dist
The DB file is created automatically on first run.

🛠 Installation
From the project root:

bash
Copy
Edit
# install all deps (frontend + server)
npm install

# If you ever see "concurrently: command not found", ensure these dev deps exist:
npm install -D concurrently nodemon

# Ensure API deps are present:
npm install express better-sqlite3 cors jsonwebtoken bcryptjs
▶️ Run (development)
We run both Vite and the API together. The Vite dev server proxies /api to the API.

vite.config.js should include a proxy like:

js
Copy
Edit
// vite.config.js
export default {
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
};
Then:

bash
Copy
Edit
# start Vite and API together
npm run dev
Common scripts (your package.json should have something like):

json
Copy
Edit
{
  "scripts": {
    "dev": "concurrently -k -n WEB,API -c auto \"vite\" \"npm:api\"",
    "api": "nodemon server/index.js",
    "build": "vite build",
    "preview": "vite preview",
    "start": "node server/index.js"
  }
}
Vite dev server: http://localhost:5173

API server: http://localhost:8080 (proxied behind /api in dev)

🏗 Production build (single Node server)
Build the frontend and let Express serve both the API and static files:

bash
Copy
Edit
# 1) build the frontend
npm run build

# 2) start the server (it will serve /api + ./dist)
NODE_ENV=production npm start
Now hit your server on the API port (e.g., http://localhost:8080).
Express will serve the React app from dist/ and the API at /api.

🐳 Docker
Option A: Single image (API + built frontend)
Dockerfile (example):

dockerfile
Copy
Edit
# --- Build stage
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY vite.config.js ./
COPY src ./src
COPY public ./public
COPY server ./server
RUN npm ci
RUN npm run build

# --- Runtime
FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
# copy only needed files
COPY package*.json ./
COPY server ./server
COPY --from=builder /app/dist ./dist
RUN npm ci --omit=dev
# create data dir for sqlite
RUN mkdir -p /app/data
ENV API_PORT=8080
ENV DB_FILE=/app/data/notes.db
ENV JWT_SECRET=change-me
EXPOSE 8080
CMD ["node", "server/index.js"]
Build & run:

bash
Copy
Edit
docker build -t glass-keep .
docker run --name glass-keep -p 8080:8080 -e JWT_SECRET="change-me" -v $(pwd)/data:/app/data glass-keep
Visit: http://localhost:8080

Option B: docker-compose (dev-friendly)
docker-compose.yml:

yaml
Copy
Edit
version: "3.8"
services:
  app:
    build: .
    container_name: glass-keep
    environment:
      - NODE_ENV=production
      - API_PORT=8080
      - DB_FILE=/app/data/notes.db
      - JWT_SECRET=change-me
    ports:
      - "8080:8080"
    volumes:
      - ./data:/app/data
bash
Copy
Edit
docker compose up --build
🔐 Accounts
Hit “Create one” on the login page to register.

After registering/logging in you’ll be redirected to #/notes.

“Sign out” is in the header ⋮ menu.

📝 Notes features
Add Note / Checklist: switch type in the composer toggle.

Tags: type comma-separated → becomes chips (both composer & modal).

Images: add from the image icon; client-side compressed (Base64).

Pin/Unpin: pin icon in cards & modal.

Reorder: drag a note; you can reorder within either Pinned or Others.

Search: title, content, tags, checklist items, and image names.

Download .txt (single): modal ⋮ → “Download .txt”.

Export/Import (all): header ⋮ → Export JSON / Import JSON (merge; keeps existing).

Delete: asks for confirmation.

🧪 API quick reference
All routes are prefixed with /api:

POST /api/register {name,email,password} → {token,user}

POST /api/login {email,password} → {token,user}

GET /api/notes → Note[]

POST /api/notes Note → created Note

PUT /api/notes/:id Note → updated Note

PATCH /api/notes/:id { pinned?: boolean } → updated Note

DELETE /api/notes/:id → 204

POST /api/notes/reorder { pinnedIds:string[], otherIds:string[] }

GET /api/notes/export → { notes: Note[] }

POST /api/notes/import { notes: Note[] } → { imported: number }

Auth: send Authorization: Bearer <token> for all notes endpoints.

🩹 Troubleshooting
White screen / console says “Rendered fewer hooks than expected”
Usually caused by accidental edits (extra tokens or early returns). Revert local changes in App.jsx around the component that the error references.

concurrently: command not found
Run: npm i -D concurrently (and ensure your dev script uses it).

CORS errors in dev
Confirm vite.config.js proxy for /api points to your API port.

JWT errors
Set JWT_SECRET in .env (and in Docker env) to a long random string.