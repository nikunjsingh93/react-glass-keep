# Glass Keep

A sleek, Keep-style notes app with Markdown, checklists, images, tag chips, color themes, dark mode, drag-and-drop reordering, import/export, auth, and a glassy UI — built with Vite + React and a tiny Express + SQLite API.

---
**Web App Screenshots**

<img width="1218" height="677" alt="Screenshot 2026-01-12 at 10 48 22 PM" src="https://github.com/user-attachments/assets/1cbe8035-8a3e-4ac4-aea3-596d8144d2c2" />

<img width="1164" height="724" alt="Screenshot 2026-01-14 at 10 07 13 AM" src="https://github.com/user-attachments/assets/d18b6f22-f01c-4e89-9a95-36310c7e25ce" />

<img width="1213" height="832" alt="Screenshot 2026-01-12 at 10 50 34 PM" src="https://github.com/user-attachments/assets/b6a88a77-e39c-4d24-b277-74d4d9ad3870" />

<img width="1221" height="829" alt="Screenshot 2026-01-12 at 10 51 07 PM" src="https://github.com/user-attachments/assets/d4d35251-31cb-4045-b12e-c55cbcaaf987" />

<img width="1203" height="863" alt="Screenshot 2025-08-13 at 5 55 29 PM" src="https://github.com/user-attachments/assets/a15110b8-0bb4-4387-be3a-3ac4eaeae121" />

**Mobile Screenshots**

<img width="381" height="718" alt="Screenshot 2025-08-13 at 5 56 17 PM" src="https://github.com/user-attachments/assets/288c8a25-c787-4fc3-aa7d-ee49f8811669" />

<img width="380" height="719" alt="Screenshot 2025-08-13 at 6 31 54 PM" src="https://github.com/user-attachments/assets/908b1902-d6e6-4d71-9958-1421273eb9d4" />


## ✨ Features

* **Auth & Multi-user**
  * Register, Login (username + password), Sign out
  * **Default Admin Account:** `admin` / `admin` (if no users exist) ✅ NEW
  * **Secret recovery key** download + **Sign in with Secret Key**
  * Each user sees **only their notes**

* **Private AI Assistant (Llama 3.2)** ✅ NEW
  * **100% Local & Private** — Runs entirely on your own server. No data ever leaves your hardware.
  * **Note-Aware (RAG)** — The AI reads your own notes to answer questions factually.
  * **Smart Search** — Ask questions like "What are my AWS commands?" or "How old am I?" and get direct answers based on your private data.
  * **Privacy First** — Uses an optimized Llama 3.2 (1B) model running inside your Docker container.

* **Collaboration (real-time)** ✅ NEW

  * Real-time collaboration for checklists — multiple people can add/tick items together and see updates instantly.
  * Collaboration on notes — co-edit Markdown notes and watch changes sync across collaborators.
  * **Add and remove collaborators** — invite users by username/email to collaborate on your notes.
  * View-only mode for collaborators — open notes in view mode without overwriting edits from others.
  * Automatic conflict resolution — prevents stale data from overwriting recent edits.  
* **Admin Panel**

  * New Admin Panel Sidebar in 3 dots Dropdown with many features like Add new uesr, Toggle new account creation (**off by default**) ✅ NEW
  * View **all users** with: Name, Email/Username, **Is Admin**, **Notes count**, **Storage used**, Created at
  * **Delete user** (also deletes their notes; protected against deleting the last admin)
* **Notes**

  * **Text notes** with Markdown (H1/H2/H3, bold, italic, strike, links, blockquote, inline/fenced code)
  * **Checklists** (add items, toggle done, inline edit)
    * **Drag to reorder** checklist items within the modal ✅ NEW
    * **Control checklist items** directly from the notes grid — toggle items without opening the modal ✅ NEW
  * **Drawing/Handwritten notes** — create freehand drawings with customizable brush sizes and colors ✅ NEW
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
  * Click edit button in body to switch to edit mode
  * Dense list rendering in view mode (minimal spacing)
* **PWA**

  * Installable on desktop & mobile

* **Bulk actions (multi-select)** ✅ NEW

  * Select multiple notes at once to Download, Pin/Unpin, Delete, or Change Color.
* **Data**

  * **Export all** notes (JSON) and **Import** (merges; keeps existing notes)
  * Per-note **Download .md**
  * Import from Google Keep (Google Takeout) — pick multiple .json files in one go to bring your Keep notes over. ✅ NEW
  * Backend: **Express API + SQLite** (`better-sqlite3`)
* **UI/Theme** ✅ IMPROVED

  * Tailwind (v4) look & feel with glassmorphism
  * Dark/Light mode with persistence
  * Responsive header: hamburger + logo; "Glass Keep" title hidden on small screens
  * **Improved color picker** — circular color indicator showing selected color ✅ NEW
  * **Colorful emoji icons** — enhanced icons for checklist (✅), drawing (🖌️), and images (🖼️) ✅ NEW
  * **Better visual feedback** — cleaner UI elements with improved spacing and colors ✅ NEW

---

## 🐛 Recent Bug Fixes ✅

* **Collaboration fixes**
  * Fixed issue where opening notes in view mode would overwrite edits made in edit mode
  * Improved conflict resolution — only saves when user actually makes edits, not just opening/closing notes
  * Fixed token expiration handling — automatic logout and redirect when session expires
  * Added connection timeout handling for better reliability after long idle periods

* **UI/UX improvements**
  * Fixed metadata changes (color, tags, images) not saving for collaborative notes
  * Improved auto-save for collaborative notes — metadata changes save immediately
  * Better error handling for network failures and expired sessions

---

## 🧰 Requirements

* **Node.js 18+** and npm
* (Optional) **Docker** & **Docker Compose**
* SQLite is embedded (no external DB needed)

---

## 📦 Project Structure

```
.
├─ public/                # PWA icons, manifest generated by Vite plugin
├─ src/                   # React app (App.jsx, etc.)
├─ server/                # Express + SQLite API (index.js, data.sqlite on runtime)
├─ index.html
├─ vite.config.js
├─ package.json
└─ README.md
```

---

## 🛠 Setup (Development)

### 1) Install dependencies

```bash
npm install
# (Optional) only If you don't have these dev/runtime deps yet:
npm install -D concurrently nodemon
npm install express better-sqlite3 cors jsonwebtoken bcryptjs
```

### 2) Run (web + API)

**POSIX/mac/Linux:**
```bash
ADMIN_EMAILS="your-admin-username" npm run dev
```

**Windows (PowerShell):**
```powershell
setx ADMIN_EMAILS "your-admin-username"
npm run dev
```

- Frontend (Vite): http://localhost:5173
- Docker: http://localhost:8080  
  *(Vite dev server proxies `/api` → `http://localhost:8080`.)*

**Promote an existing user to admin (optional):**
```sql
-- Run against server/data.sqlite
UPDATE users SET is_admin=1 WHERE email='your-admin-username';
```

### 3) Docker (Local Development)

**Quick Local Docker Script:**
```bash
./local_docker_run.sh
```

**Or manually:**
```bash
docker build -t glass-keep:local .

docker rm -f glass-keep 2>/dev/null || true

docker run -d \
  --name glass-keep \
  --restart unless-stopped \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e API_PORT=8080 \
  -e JWT_SECRET=dev-please-change \
  -e DB_FILE=/app/data/notes.db \
  -e ADMIN_EMAILS=admin \
  -e ALLOW_REGISTRATION=false \
  -v "$HOME/.glass-keep:/app/data" \ # Change path according to OS (e.g., %USERPROFILE%\.glass-keep on Windows)
  glass-keep:local
```

---

> [!IMPORTANT]
> **Default Admin Credentials** (for fresh installations):
> - **Username:** `admin`
> - **Password:** `admin`

## 🐳 Docker Deploy to Server(single image: API + built frontend)

### Dockerfile

Your Dockerfile builds the frontend, bundles the API, and runs the Express server that serves both the API and the built UI.

### Build & Run

```bash
# Get the latest image from Docker Hub
docker pull nikunjsingh/glass-keep:latest

# Create data dir
mkdir -p ~/.glass-keep

# (optional) stop/remove any old container
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
  -e ALLOW_REGISTRATION=false \
  -v ~/.glass-keep:/app/data \
  nikunjsingh/glass-keep:latest

```

- App & API: http://localhost:8080  
- **Admin Panel (Docker/prod):** http://localhost:8080/#/admin  
  *(Make sure `ADMIN_EMAILS` matches the username exactly when creating the admin account)*

### docker-compose.yml

```yaml
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
      ADMIN_EMAILS: your-admin-username  # <— change this to your admin user
      ALLOW_REGISTRATION: "false"        # <— set to "true" to allow new account creation
    ports:
      - "8080:8080"
    volumes:
      - /home/YOURUSER/.glass-keep:/app/data   # <— change this to your actual home path username
```

Run:

```bash
mkdir -p /home/YOURUSER/.glass-keep
docker compose up -d
```

> **Persistent data:** notes DB lives in the mounted `./data` folder on your host.


---

## 🧭 Using the Admin Panel

- **Where**
  - Dev: http://localhost:5173/#/admin
  - Docker/Prod: http://localhost:8080/#/admin
- **Who can access**: Users with `is_admin = 1`.
  - Auto-promote by setting `ADMIN_EMAILS="your-admin-username"` before starting the server/container, **or**
  - Run a one-off SQL update:
    ```sql
    UPDATE users SET is_admin=1 WHERE email='your-admin-username';
    ```
> **Note:** If registration is disabled (default), you can use the default admin account to log in for the first time:
> - **Username:** `admin`
> - **Password:** `admin`
> 
> After logging in, you can create new users or change the admin password in the Admin Panel.
- **What you can do**
  - View all users with: **Is Admin**, **Notes count**, **Storage used**, **Created at**
  - **Delete** a user (also removes their notes; cannot delete the last admin)

> The admin view is intentionally not in the main header menu. Navigate to the route directly.

---

## 🧭 Usage Guide

* **Create a note**

  * Choose **Text / Checklist / Drawing** in the composer toggle. ✅ NEW
  * For text notes: Enter a *Title* and content.
  * For checklists: Add checklist items and toggle them as needed.
  * For drawings: Draw freehand with customizable brush sizes and colors. ✅ NEW
  * Add **tags** (comma-separated) — they become chips.
  * Choose a **color**, attach **images**, then click **Add Note**.

* **Markdown editing**

  * Use the **Formatting** button (Aa) in the composer or modal edit mode:

    * H1/H2/H3, **bold**, *italic*, ~~strike~~, `inline code`, `fenced code`, quote, lists, link
  * **Smart Enter** continues lists or exits on empty line.

* **Open / Edit**

  * Click a card to open the modal.
  * Modal header has **View / Edit** toggle, **Pin**, **⋮ (Download .md)**, and **Close**.
  * Click edit button in the body to switch to edit mode.

* **Images**

  * Click a modal image to open **Fullscreen Viewer** (download, next/prev).
  * Images are compressed client-side on upload.

* **Pin & Reorder**

  * Use the pin icon on a card or modal header.
  * Drag cards to reorder within **Pinned** or **Others**.
  * **Drag checklist items** to reorder them within a checklist note. ✅ NEW
  * **Toggle checklist items** directly from the notes grid without opening the modal. ✅ NEW

* **Tags & Filters**

  * Open the **hamburger menu** → sidebar lists all tags + counts.
  * Quick filters: **Notes (All)**, **All Images**.

* **Search & AI Assistance** ✅ NEW
  * **Deep Search**: Searches across title, Markdown text, tags, checklist items, and image names.
  * **AI Assistant**: Press **Enter** in the search bar to ask questions about your notes.
  * **Smart Grounding**: The AI analyzes your relevant notes to give you accurate, private answers.
  * **One-Click Clear**: Closing the AI response box automatically clears your search query.

* **Export / Import**

  * Header **⋮** → **Export** to JSON (backup/sharing).
  * **Import** JSON merges with existing notes (keeps existing).

* **Secret Key**

  * Header **⋮** → **Download secret key (.txt)**.
  * On login screen, choose **Forgot username/password? → Sign in with Secret Key**.

* **Collaboration**

  * Open a note and click the **collaboration icon** (👥) in the modal header.
  * Add collaborators by username or email — they can view and edit the note.
  * View current collaborators and remove them if needed. ✅ NEW
  * Changes sync in real-time across all collaborators.

---

## 🔐 Security Notes

* Treat your **Secret Key** like a password. Anyone with it can sign in as you.
* Change `JWT_SECRET` in production to a long, random string.
* Serve over HTTPS in production for PWA and security best practices.

---

## 🧪 Troubleshooting

* **Dev proxy error (`ECONNREFUSED` to `/api`)**

  * Ensure the API is running on `:8080` (`npm run dev` starts both).
* **Docker runs but CSS looks wrong**

  * Rebuild after Tailwind config changes: `docker compose build --no-cache`.
  * Ensure the app is built (`npm run build`) before running the Node server image.
* **PWA “Install” doesn’t appear**

  * Use the built preview (`npm run preview`) or serve production build over HTTPS.
  * Check DevTools → Application → Manifest & Service Worker for errors.

---


## 📝 License

MIT
