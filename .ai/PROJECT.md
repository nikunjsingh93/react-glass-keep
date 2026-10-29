# Glass Keep project knowledge

Last reconciled with source: **2026-10-29**, version **1.0.19**. This file records
lasting architecture and decisions. Read [HANDOFF.md](HANDOFF.md) for recent state
and [../AGENTS.md](../AGENTS.md) for working instructions.

## Product and stack

Glass Keep is a self-hosted, multi-user Google Keep-style notes app with Markdown,
checklists, drawings, attachments, tags, sharing, offline editing, and optional
server-local AI. Repository: [react-glass-keep](https://github.com/nikunjsingh93/react-glass-keep).

- Shared frontend: React 19, Vite 7, Tailwind CSS 4; `marked` plus DOMPurify for Markdown.
- API: Node 24, Express 4, `better-sqlite3`/SQLite, bcrypt and JWT authentication.
- Web: installable PWA with static assets cached by the service worker.
- Native: Tauri 2/Rust clients bundling the same interface. Android builds also
  require Java 17 and the Android SDK/NDK; see the [native guide](../docs/native-apps.md).
- AI: pinned llama.cpp CPU worker with Qwen3.5 0.8B Q4_K_M GGUF.
- Verification: Node test runner, Playwright/Edge browser checks, Rust tests,
  packaged Windows tests, platform CI checks, and Docker smoke tests.

Use `package.json`, lockfiles, and the workflow for exact dependency versions.

## Architecture and source map

| Area | Important files and responsibilities |
| --- | --- |
| Main interface | `src/App.jsx`: auth views, notes/editor, search, drawers, sharing, admin, bulk actions and theme. Existing focused modules should be reused. |
| Rendering/editing | `DrawingCanvas.jsx`, `ChecklistEditor.jsx`, `checklist.js`, `markdown.js`, `NoteLayout.jsx`; the layout packs variable-height cards without grid-row gaps. |
| Feature dialogs | `FeaturePanels.jsx`, `AutoExportDialog.jsx`, `LanguagePicker.jsx`. |
| Web entry/build | `src/main.jsx`, `index.html`, `vite.config.js` -> `dist/`; development `/api` proxy goes to port 8080. |
| Native entry/build | `NativeRoot.jsx`, `native-main.jsx`, `native.html`, `native.css`, `vite.native.config.js` -> `dist-native/`; connection screen precedes the shared app. |
| Platform boundary | `src/platform.js`: browser fetch vs Rust IPC, server origins/storage keys, file saving, folder choice, clipboard and external links. `src-tauri/src/lib.rs` enforces native API/file boundaries. |
| Offline state | `offline.js`, `OfflineStatus.jsx`, `noteWriter.js`, `privateCache.js`; IndexedDB account state, persisted operation queue, revisions/conflicts and private-cache cleanup. |
| API and data | `server/index.js`: Express routes, auth, SQLite initialization/migrations, note ownership/collaboration, admin and web event stream. `server/package.json` selects CommonJS. |
| Extra note behavior | `server/noteFeatures.js`: deep/public links, duplicates, copy-related behavior and operation replay support. Check both server modules when editing note routes. |
| Account AI preference | `server/accountPreferences.js`, `src/useAccountAI.js`: persisted per-user setting with account/server-scoped device cache and stale-response protection. |
| AI service | `server/ai.js` manages private requests; `ai-search.js` retrieves authorized notes; `ai-runtime.js` downloads/verifies weights and manages the worker; `ai-model.json` pins the model. `src/ai.js` consumes request snapshots. |
| Imports/exports | `keepImport.js`, `zipArchive.js`, `readBackup.js`, `importBackup.js`, `autoExport.js`, `useAutoExport.js`, `exportFolders.js`. |
| Startup/languages | `src/i18n.js`, `src/locales/*.json`, `LanguagePicker.jsx`; `public/startup-theme.js`, `startup.css`, both HTML files and `LoadingScreen.jsx` handle first paint. |
| Packaging | `Dockerfile`, `src-tauri/` configs/icons, `scripts/prepare-android*.mjs`, platform verification scripts, `.github/workflows/native-apps.yml`. |

### Server, storage and privacy boundaries

The production Docker image runs the API and serves the built web frontend from
one container. It includes llama.cpp but does not include model weights. Native
clients connect to a separately deployed server; they do not host the API/database
or run a local AI model.

SQLite uses WAL and foreign keys. Preserve user/owner checks, collaborator access,
note revisions and operation replay protection. Password/session changes can
revoke tokens through the stored token version. Markdown is sanitized; do not
remove that boundary. An ordinary copied note link requires an authorized login;
a public share link permits anonymous read-only access until expiry/revocation.
Public links support never-expiring links as well as timed expiry.

The PWA treats authenticated API requests as **NetworkOnly**. Offline notes live
in the explicit account cache, not a generic service-worker API cache. Pending
edits survive restarts, replay on reconnect, and retain drafts on revision conflict.
Native server switching keeps accounts and outboxes separate per server. Web
collaboration uses events; native refreshes periodically while visible and on focus.

Fresh databases require operator-supplied `INITIAL_ADMIN_USERNAME` and
`INITIAL_ADMIN_PASSWORD`. Existing deployments must retain compatible startup and
session behavior; tests explicitly protect short/unset/placeholder legacy secrets.
Never restore the earlier mandatory-secret startup check that broke existing installs.

### AI decisions to preserve

- AI starts off for fresh accounts and shows a resource warning before enabling.
  The choice is saved on the server per account and synchronizes across devices,
  refreshing on focus/reconnect and every ten seconds while visible. Cached old
  reads must not override a newly saved setting or a different account's state.
- There is one shared server model download, not one model per account/device.
  The pinned GGUF is 532,517,120 bytes (about 533 MB); its revision and SHA-256 are
  defined in `server/ai-model.json`. CPU/RAM usage while answering is larger than
  the download size and depends on context/hardware.
- SQLite FTS5/BM25 ranks the user's own and currently shared notes, including
  archived notes. The model expands/translates the query only when direct retrieval
  finds no matches, then writes an answer from selected note excerpts. There is
  no separate embedding model or vector database.
- The server retrieves source content itself, ignores client-supplied note bodies,
  rechecks access, and exposes private expiring request snapshots. Preserve
  cancellation and account isolation. One question runs at a time server-wide.
- The worker starts for questions, stays on loopback, and exits after 60 idle
  seconds by default. Weights remain cached beside the database. The Docker
  data mount must persist both SQLite and the model cache.
- The small model can omit facts or mistranslate names; retrieved source links
  are candidates for checking answers, not proof of every generated claim.
- The old Llama/Transformers.js/ONNX approach was replaced because of resource
  costs. Do not reintroduce it or automatically delete the obsolete cache.
  See [local AI](../docs/local-ai.md) and `AI_CHANGES.md` for the current design.

### Export decisions to preserve

Google Drive/OneDrive OAuth backup integration was removed at the owner's request.
Use user-level automatic **JSON** export every 1/7/30 days, with folder selection
where supported. It runs only while open, signed in and connected, and catches up
once after returning. This is not a closed-app background job or full server backup.
Exports contain synced owned notes/attachments, including archived notes, and
exclude other users' data and account credentials. JSON/ZIP imports remain supported.
Users can sync the chosen folder themselves (for example with Syncthing). Existing
exports are kept until manually removed; do not add silent pruning or cloud setup.
See [automatic exports](../docs/automatic-exports.md); `cloud-backups.md` points there.

### Google Keep import (1.0.19)

`zipArchive.js` indexes standard ZIP central-directory metadata with Blob slices,
then reads/validates requested entries in chunks. `keepImport.js` loads bounded
note JSON for preview, retains lazy attachment handles and produces notes through
an async generator for `importNoteBatches`. Do not return to reading/expanding an
entire large Takeout into memory or creating all image data URLs during preview.
The 200 MiB Glass Keep backup limit is a different path: Takeout ZIPs selected there
are detected first and routed to the Google Keep dialog. A synthetic 450 MiB ZIP
is covered by unit and actual browser file-picker tests, not a private user export.
Keep CRC/path/size checks, cancellation between batches and the per-note upload
budget. ZIP64/encrypted/multidisk archives need the extracted-folder fallback.
Current limits and recovery steps are in [the Takeout guide](../docs/google-keep-import.md).

## UI conventions and regression traps

- Preserve Android safe-area offsets for sticky headers, note modals, Settings and
  tags drawers, including scrolling and bottom/side insets. Padding the outer app
  alone does not fix fixed/sticky children. Drawer content scrolls below its title.
- `useAndroidNoteBack.js` handles active notes/drawers through Tauri Back handling.
  Close nested confirmations first, then the active panel; retain unsaved-note guards.
  Permanent desktop/tablet sidebars are different from dismissible drawers.
- Use themed border/background variables. Earlier plain borders and browser-native
  select colours produced bright white controls in dark mode.
- Ask AI stays beside search, with a compact neutral 32 px button, accessible
  idle/busy names and Enter support. Keep logo/search separation and layout tests
  at 320/390/768/1280 px. The local `Sparkles` component does not accept size/class
  props; size/hide it through its wrapper unless deliberately refactoring it.
- English is the fallback/source text. Current locales: German, Hindi, French and
  Russian. Language choice is device-local and note content is not translated.
  Adding a locale requires registration, picker option, all translation keys and
  placeholders, startup HTML/React/CSS/theme handling, tests and docs. A duplicate
  imported binding broke the proposed German PR; use the correct locale identifier.
- Android generated projects can restore Tauri's default icon. Keep the checked-in
  standard/round/adaptive assets and preparation/verification scripts. Preserve
  the launcher inset that fixed the zoomed/cropped icon.

## Development and verification commands

Run from the repository root:

```sh
npm ci
npm run dev
npm run build
npm run native:build
npm test
node --test tests/i18n.test.js tests/ai.test.js tests/account-preferences.test.js
node --test tests/ai.browser.mjs tests/native.browser.mjs tests/web-features.browser.mjs tests/startup.browser.mjs
node scripts/version.mjs --check
```

`npm run dev` starts Vite and the API; provide first-run credentials for a fresh
development database. `npm run api` starts just the API. `npm test` selects
`tests/*.test.js`; it does **not** run the browser `.mjs` tests. Browser tests build
on `dist/`/`dist-native/`, use temporary fixture databases/ports and currently launch
Edge. Read each test before running it, check required browser/runtime availability,
and do not run duplicate fixtures on the same ports concurrently.

For an actual Windows executable, set `GLASS_KEEP_WINDOWS_EXE` and run
`node --test tests/native-windows.browser.mjs`. It uses a temporary WebView2 profile.
For large file-picker fixtures in a CDP-connected WebView2, Playwright's normal
file transfer can refuse files over 50 MB because it treats the browser as remote.
This is a test-tool limit, not an app import cap. The 450 MiB compiled-client check
used CDP `DOM.setFileInputFiles` with the isolated fixture's local path instead.
The CI native-only install uses `npm ci --ignore-scripts`; backend tests require a
working `better-sqlite3` native module. Mac/Android builds require their toolchains;
use the tracked native guide and workflow rather than inventing a cross-build.

For Docker, build both web assets and the image before running:

```powershell
./tests/docker-smoke.ps1 -Image nikunjsingh/glass-keep:X.Y.Z
```

The script checks AMD64/ARM64 health/version, proxy handling, SQLite, archived JSON
export, the built frontend hash and the llama.cpp executable. Check its expected
version before a release. Real-model tests are additional checks, not implied by
passing mocked AI/browser tests; see `tests/docker-ai.mjs` before using them.

## Release and deployment conventions

The owner deploys through **Portainer** and uses **one Nginx Proxy Manager hop**.
The owner prefers a self-hosting-focused README without paid-hosting promotion
(decision made when reviewing PR #36).
`TRUST_PROXY=1` fixes forwarded-IP rate-limit warnings for that topology. Do not
set blanket `trust proxy=true`; re-evaluate trust if the proxy topology changes.

1. Keep web/server, Windows, macOS and Android versions identical. Run
   `npm run release:version -- X.Y.Z`, update `tests/docker-smoke.ps1` and changelog,
   then check metadata. The version command updates only Glass Keep's Rust package,
   not dependency versions. Native builds enforce the version invariant.
2. Do not add a general web `prebuild` check that reads Tauri files: the Docker
   build deliberately copies only the web/server source and does not include
   `src-tauri/` or `scripts/`. The check belongs in `prenative:build`.
3. For an authorized code/release push, start the **Native apps** workflow on the
   intended commit, selecting all platforms. It builds Windows x64/ARM64 installers
   and portable executables, Android ARM64 APK, and Apple Silicon/Intel Mac DMGs.
   Wait for checks and verify the run's commit. Do not rename old binaries as new ones.
4. Build/push `nikunjsingh/glass-keep:X.Y.Z` for `linux/amd64,linux/arm64`; verify both
   architectures, then promote that exact image to `latest`. The Dockerfile uses
   native cross-compilation for llama.cpp; reverting to full QEMU compilation made
   builds unnecessarily slow. Base-image/cache changes can trigger a longer rebuild.
5. Attach the seven verified binaries and `SHA256SUMS.txt` to the GitHub release.
   Finish with a public, non-prerelease **Latest** release. State that apps are
   clients requiring a server, and credit incorporated community translations.
6. Preserve the Android package/signing identity for install-over updates. The
   approved key is private/ignored and CI uses encrypted secrets; never regenerate
   it as a routine build fix. Windows currently lacks commercial publisher signing;
   Mac DMGs use ad-hoc signing and are not Apple-notarized. Linux native packaging,
   widgets and Google Play distribution are not configured.

`artifacts/`, `.native-tools/`, `.native-secrets/`, generated native projects and
build output are ignored. Machine-local helpers are not portable dependencies;
future agents should use tracked scripts/workflows and available authenticated
GitHub/Docker tooling. Never publish temporary ZIPs, test recordings, private profiles
or signing material as release assets. Docker Hub once rejected an upload after
the local login disappeared; restoring the owner's Docker Desktop login fixed it.
An authentication failure is not a reason to request credentials in chat or silently
claim the image was pushed.

## Known limits and sources of truth

The native interface can open offline after online setup, but AI, administration,
sharing changes, imports and scheduled full exports need the server. Native
collaboration refresh is polling rather than the web event stream. Source images
and drawings are not analyzed by AI. Mac package checks are not equivalent to
interactive device testing. Do not infer that a user's installed apps/server were
updated just because a release was published.

Use the [README](../README.md), [changelog](../CHANGELOG.md),
[native guide](../docs/native-apps.md), [AI guide](../docs/local-ai.md),
[export guide](../docs/automatic-exports.md), and [security policy](../SECURITY.md)
with the source. Historical feature claims, language counts, releases and GitHub
issues can become stale; verify before changing behavior or reporting status.
