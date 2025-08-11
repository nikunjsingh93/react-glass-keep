# Glass Keep

A sleek, Keep-style notes app with Markdown, checklists, images, tag chips, color themes, dark mode, drag-and-drop reordering, import/export, auth, and a glassy UI — built with Vite + React and a tiny Express + SQLite API. PWA-ready with offline caching.

---

**Web App Screenshots**

<img width="1470" height="956" alt="Screenshot 2025-08-10 at 11 31 40 PM" src="https://github.com/user-attachments/assets/19c743ad-ef3e-4d7f-ab03-32929c99f524" />

<img width="1204" height="867" alt="Screenshot 2025-08-10 at 11 32 37 PM" src="https://github.com/user-attachments/assets/77a49683-60d6-4e1e-8efd-5bcaa46c6620" />

**Mobile Screenshots**

<img width="346" height="743" alt="Screenshot 2025-08-10 at 11 41 14 PM" src="https://github.com/user-attachments/assets/fc321b77-fea1-48ca-a0f3-de773b3c9989" />

<img width="344" height="747" alt="Screenshot 2025-08-10 at 11 41 38 PM" src="https://github.com/user-attachments/assets/a9af158e-df93-4ecd-b0ac-362e9ce792db" />

---

## ✨ Features

* **Auth & Multi-user**
  * Register, Login (username + password), Sign out
  * **Secret recovery key** download + **Sign in with Secret Key**
  * Each user sees **only their notes**
* **Admin Panel**
  * **Visit:** `http://localhost:5173/#/admin` (dev) or `http://localhost:8080/#/admin` (Docker/prod)
  * Lists **all users** with: Name, Email/Username, **Is Admin**, **Notes count**, **Storage used**, Created at
  * **Delete user** (also deletes their notes; protected against deleting the last admin)
* **Notes**
  * **Text notes** with Markdown (H1/H2/H3, bold, italic, strike, links, blockquote, inline/fenced code)
  * **Checklists** (add items, toggle done, inline edit)
  * **Smart Enter** continues lists / exits on empty line
  * **Formatting toolbar** in editor (composer + modal edit mode)
  * **Links open in new tab** from view mode
* **Images**
  * Attach multiple images (client-side compression)
  * Thumbs in grid, larger in modal
  * **Fullscreen viewer** with next/prev + **download image**
* **Organization & Layout**
  * **Pin / Unpin**; “Pinned / Others” sections
  * **Tags as chips** (comma input → chips; quick add/remove)
  * **Tag sidebar/drawer** with list of all tags + counts
  * Quick filters: **Notes (All)** and **All Images**
  * Per-note **color themes**
  * **Search** across title, Markdown text, tags, checklist items, image names
  * **Drag to reorder** within each section
  * Grid cards show truncated body with **…** and tag chips with **…** when overflowing
* **Modal**
  * Glassy blurred backdrop; **sticky header**
  * **View / Edit** toggle button
  * Pin, more (⋮) menu (**Download .md**), Close
  * Footer: tags chip editor, color palette, image add, **Delete (confirm dialog)**, **Save**
  * Click anywhere in body (view mode) to switch to edit
  * Dense list rendering in view mode (minimal spacing)
* **PWA**
  * Installable on desktop & mobile
  * Offline caching of the built app shell
* **Data**
  * **Export all** notes (JSON) and **Import** (merges; keeps existing notes)
  * Per-note **Download .md**
  * Backend: **Express API + SQLite** (`better-sqlite3`)
* **UI/Theme**
  * Tailwind (v4) look & feel with glassmorphism
  * Dark/Light mode with persistence
  * Responsive header: hamburger + logo; “Glass Keep” title hidden on small screens

---

## 🧰 Requirements

* **Node.js 18+** and npm
* (Optional) **Docker** & **Docker Compose**
* SQLite is embedded (no external DB needed)

---

## 📦 Project Structure

.
├─ public/                # PWA icons, manifest (via Vite PWA plugin)
├─ src/                   # React app (App.jsx, etc.)
├─ server/                # Express + SQLite API (index.js, data.sqlite on runtime)
├─ index.html
├─ vite.config.js
├─ package.json
└─ README.md

---

## 🛠 Setup (Development)

### 1) Install dependencies

```bash
npm install
# If you don't have these dev/runtime deps yet:
npm install -D concurrently nodemon
npm install express better-sqlite3 cors jsonwebtoken bcryptjs

2) Run (web + API)

# POSIX/mac/Linux:
ADMIN_EMAILS="your-admin-username" npm run dev

# Windows (PowerShell):
setx ADMIN_EMAILS "your-admin-username"
npm run dev

	•	Frontend (Vite): http://localhost:5173
	•	Admin Panel (dev): http://localhost:5173/#/admin
	•	API (Express): http://localhost:8080
(Vite dev server proxies /api → http://localhost:8080.)

If you already created your account and want to promote it to admin in dev, you can also use SQLite directly:
sqlite3 server/data.sqlite "UPDATE users SET is_admin=1 WHERE email='your-admin-username';"

⸻

🐳 Docker (single image: API + built frontend)

Run from Docker Hub

# Get the latest image
docker pull nikunjsingh/glass-keep:latest

# Create persistent data dir
mkdir -p ~/.glass-keep

# Stop/remove old container (if any)
docker rm -f glass-keep 2>/dev/null || true

# Run
docker run -d \
  --name glass-keep \
  --restart unless-stopped \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e API_PORT=8080 \
  -e JWT_SECRET="replace-with-a-long-random-string" \
  -e DB_FILE="/app/data/notes.db" \
  -e ADMIN_EMAILS="your-admin-username" \
  -v ~/.glass-keep:/app/data \
  nikunjsingh/glass-keep:latest

	•	App & API: http://localhost:8080
	•	Admin Panel (Docker/prod): http://localhost:8080/#/admin
(Make sure ADMIN_EMAILS contains the username/email of your admin account exactly as stored in the DB.)

docker-compose.yml

version: "3.8"
services:
  app:
    image: nikunjsingh/glass-keep:latest
    container_name: glass-keep
    restart: unless-stopped
    environment:
      NODE_ENV: production
      API_PORT: "8080"
      JWT_SECRET: replace-with-a-long-random-string
      DB_FILE: /app/data/notes.db
      ADMIN_EMAILS: your-admin-username  # must match a user in the DB
    ports:
      - "8080:8080"
    volumes:
      - /home/YOURUSER/.glass-keep:/app/data

Run:

mkdir -p /home/YOURUSER/.glass-keep
docker compose up -d

Persistent data: the SQLite DB lives in the mounted host directory (~/.glass-keep).

⸻

🧭 Using the Admin Panel
	•	Where:
	•	Dev: http://localhost:5173/#/admin
	•	Docker/Prod: http://localhost:8080/#/admin
	•	Who can access: Users with is_admin = 1.
Promote by either:
	•	Setting ADMIN_EMAILS="your-admin-username" before starting the server/container (auto-promotes on boot), or
	•	Running a one-off SQL update in the DB:

UPDATE users SET is_admin=1 WHERE email='your-admin-username';


	•	What you can do:
	•	View all users with: Is Admin, Notes count, Storage used, Created at
	•	Delete a user (also removes their notes; cannot delete the last admin)

The admin view is intentionally not in the main header menu. Navigate to the route directly.

⸻

🧭 Usage Guide (Notes)
	•	Create a note
	•	Choose Note / Checklist in the composer
	•	Title + content, tags (comma-separated → chips), color, images → Add Note
	•	Markdown
	•	Formatting toolbar (H1/H2/H3, bold, italic, strike, code, lists, quote, link)
	•	Smart Enter for lists (continue or exit on empty)
	•	Open / Edit
	•	Click a card to open modal → View / Edit toggle
	•	Modal ⋮ → Download .md
	•	Click body (view mode) to switch to edit
	•	Images
	•	Thumbs in grid; click in modal to open Fullscreen Viewer (download, next/prev)
	•	Organize
	•	Pin/Unpin, drag to reorder within section
	•	Tag sidebar from the hamburger; Notes (All) / All Images quick filters
	•	Search
	•	Title, Markdown text, tags, checklist items, image names
	•	Backup
	•	Header ⋮ → Export/Import JSON (import merges; keeps existing)

⸻

🔐 Security Notes
	•	Treat the Secret Key like a password. Anyone with it can sign in as you.
	•	Set a strong JWT_SECRET in production.
	•	Serve over HTTPS for PWA installability and security best practices.

⸻

🧪 Troubleshooting
	•	Dev /api proxy error (ECONNREFUSED)
Ensure the API is running on port 8080 (npm run dev starts both web & API).
	•	Admin page shows “Unauthorized”
Verify your account is admin (is_admin=1) or that ADMIN_EMAILS includes your username/email exactly.
	•	Docker CSS looks wrong
Rebuild after Tailwind config changes: docker compose build --no-cache.
Make sure you pulled the latest image and hard-refresh (clear PWA cache if installed).
	•	Data disappeared after re-deploy
Confirm the host volume is mounted to /app/data and points at a persistent host path (~/.glass-keep).

⸻

📝 License

MIT

