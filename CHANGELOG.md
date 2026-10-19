# Changelog

## [1.0.14] - 2026-10-19
### Changed
- Saves AI enablement per account on the server and syncs it across devices. Fresh accounts stay off by default; the warning explains that the model is downloaded once on the server. Devices keep an account-specific offline cache and refresh on focus, reconnection and every ten seconds while visible.
- Aligns the web/server, Windows, macOS and Android release versions to **1.0.14**, including embedded app metadata and the connection-screen version.
- Adds a shared release-version command and a native build check to prevent version drift in future releases. Includes all improvements from 1.0.13.

## [1.0.13] / Native clients 1.0.9 - 2026-10-19
### Fixed
- Replaces the icon-only AI action with a visible **Ask AI** button whenever AI is enabled, beside search on wide screens and below it on smaller screens.
- Shows **Asking AI…** while a request is running, disables repeat submissions, and keeps Enter available to send a question. Empty or fewer-than-three-character queries cannot be submitted.
- Adds English/Hindi/French busy labels and verifies button, keyboard, phone/tablet layout, progressive answers and cancellation across web and native clients.

## [1.0.12] / Native clients 1.0.8 - 2026-10-19
### Changed
- Replaces the old Llama/Transformers.js/ONNX generator with pinned llama.cpp and Qwen3.5 0.8B Q4_K_M (533 MB verified download).
- Starts the CPU inference worker only for AI questions and stops it after 60 idle seconds. The model remains cached in the data volume.
- Uses one model for query expansion and answering over a Unicode-aware SQLite FTS5 index. The server retrieves authorized own/shared notes, including archived notes, instead of trusting client-provided note bodies.
### Added
- Progressive answers and downloading/loading/searching/writing states across web and native clients, plus numbered source-note links and cancellation.
- Bounded context and concurrency, private expiring requests, source-access rechecks, and English/Hindi/French AI controls.
- Local AI deployment and cache migration guide; no new mandatory Docker settings or separate AI container.
### Validation
- Tests cover existing-note indexing, edit/delete updates, Unicode retrieval, user isolation, ignored forged notes, incremental responses, cancellation, errors and legacy JSON clients. Release checks also exercise the actual model and worker lifecycle.

## [1.0.11] / Native clients 1.0.7 - 2026-10-19
### Added
- French (Français) alongside English and Hindi, with 327 translated interface strings, remembered on this device. Existing note titles and content remain unchanged.
- French startup loading text and a language selector on the native server-connection screen, with translated connection guidance.
### Validation
- Checks cover French locale coverage and placeholders, persistence after reload, login and settings, JSON export controls, public sharing, offline editing and native startup language.

## [1.0.10] / Native clients 1.0.6 - 2026-10-18
### Fixed
- Android's home-page search/menu header stays below the status bar while scrolling, with an opaque safe-area background that prevents notes from showing through behind the system bar.
- Web, Windows, macOS and Android now show a centered, branded startup screen using the saved light/dark theme, or the system theme when no preference exists. The loading screen appears before React loads as well as during native lazy loading.
- Startup loading respects reduced-motion preferences and English/Hindi language selection.
### Validation
- Browser checks cover saved/system startup themes, centered content, reduced motion and the native header position after scrolling with simulated safe-area insets.
- Physical Android 16 testing with client 1.0.6 confirms the search/menu header remains below the status bar after repeated long swipes through temporary notes. The compiled Windows client also passes startup, connection and JSON-save checks.

## [1.0.9] / Native clients 1.0.5 - 2026-10-18
### Changed
- Replaced Google Drive/OneDrive cloud connections and the server cloud scheduler with per-account, per-device automatic JSON exports every 1/7/30 days. No provider setup is needed.
- Choose and remember an export folder in native apps and supported browsers, including persistent Android folder access. Downloads remains available as a default. Overdue exports run when the app is reopened, with no background export while closed.
- Existing notes and JSON/ZIP imports are preserved. Exports include owned archived notes and attachments, and protect unsaved drafts by exporting only synced server data.
### Fixed
- Android adaptive launcher artwork now has an 18% inset and a matching purple background to avoid excessive zoom/cropping.
- Retains Android safe-area and Back-button fixes from client 1.0.4.
### Validation
- Server/schedule tests, browser folder persistence and overdue-export tests, both Docker architectures, and all five native build jobs pass.
- Android 16 device checks verified chosen-folder JSON exports across an app restart, note spacing, Back navigation and icon padding. A compiled Windows ARM64 client also saved valid JSON through its native file command.


## Android client 1.0.4 - 2026-10-18
### Fixed
- Opened notes respect Android status-bar and navigation-bar safe areas.
- Android Back closes an opened note and returns to the notes list, with unsaved edits protected by the existing save guard.
- Save warnings can be dismissed without discarding the draft, keeping Save accessible on small screens.

## Android client 1.0.3 - 2026-10-18
### Fixed
- Android builds now install the Glass Keep standard, round and adaptive launcher icons after project initialization, replacing Tauri's generated default icon.
- README and release notes explicitly identify the installable apps as clients that require a running Glass Keep server.

## [1.0.8] / Native clients 1.0.2 - 2026-10-18
### Fixed
- Cloud backup and other feature dialogs now use the same neutral charcoal background as Settings in dark mode, with a shared surface style in both themes.
- Cloud setup messages now explain that the server owner registers each provider once; ordinary users then connect their own accounts without administrator access.
### Distribution
- Windows x64/ARM64 installers and portable clients, signed Android ARM64 APK, and Apple Silicon/Intel macOS DMGs accompany the release.
### Validation
- Physical Android 16 testing covers login, notes, unsynced work surviving an APK update, synchronization and native ZIP download/import using a temporary account.

## [1.0.7] - 2026-10-18
### Fixed
- Consistent theme-aware borders for language, local backup and cloud backup controls.
- Readable language dropdown text and option backgrounds in light and dark themes across web, Windows and Android.

## Native clients 1.0.1 preview - 2026-10-18
### Added
- macOS disk images for Apple Silicon and Intel, built on matching Mac runners, with local signatures and package/startup checks. Requires macOS 13 or newer; Apple Developer ID signing and notarization are not configured.
### Changed
- Removed the persistent server bar. Settings now contains the connected server link and Change server action.
- Added Connection settings to the login screen so users can switch servers before signing in.
- Includes the settings theme fixes from web release 1.0.7 and retains the existing Android signing identity.

## Native clients 1.0.0 preview - 2026-10-18
### Added
- Tauri 2 clients for Windows x64/ARM64 and Android ARM64 with a bundled interface and a server connection screen.
- Separate login, caches and offline queues for each server; switching servers preserves pending work without replaying it to another instance.
- Native save dialogs, clipboard integration and external browser links. Copied note/public links use the configured server origin.
- Native HTTPS API transport with certificate verification, API path validation and redirect rejection; no server CORS changes are required.
- Ten-second foreground collaboration refresh and browser-based cloud-provider authorization.
- Reproducible Rust dependencies, platform build workflows and a native installation/build guide.
### Validation and distribution
- Automated coverage includes address validation, browser/IPC login, offline editing, server isolation, logout and portable ZIP saving, plus existing web/server regressions.
- Windows executables currently have no publisher signing certificate. Android release installation requires a persistent signing key configured in encrypted build secrets; without it the build produces an unsigned APK.
- Physical Android testing and home-screen widgets are outside this first build. Server/Docker release numbering remains separate from native client versions.

## [1.0.6] - 2026-10-18
### Added
- Personal Google Drive and OneDrive connections in Settings, with independent 1/7/30-day schedules and manual backup runs.
- Compressed portable ZIP snapshots of owned notes, including archives, checklists and images; direct ZIP download and import alongside existing JSON imports.
- Three-version cloud retention, unchanged-content skipping, verified uploads, persistent schedules, retries and connection status.
- Encrypted provider tokens, browser-bound OAuth with PKCE, per-user isolation and a persistent credential key independent of JWT settings.
- English/Hindi backup controls and a deployment/setup/restore guide in docs/cloud-backups.md.
### Upgrade notes
- Existing accounts and notes remain compatible; keep the database volume and existing environment settings.
- Cloud connections require one-time Google/Microsoft OAuth client configuration by the instance owner. Local ZIP download/import works without provider credentials.
- Preserve the automatically generated cloud-backup.key beside the database. Cloud ZIPs contain readable personal notes; keep their folders private.
### Validation
- API/archive/provider simulation tests, browser download/restore with images, and regression coverage for existing note workflows. Live provider authorization requires deployment-specific credentials.

## [1.0.5] - 2026-10-18
### Changed
- Move Copy note link, Make a copy and Public sharing into the note editor's three-dot menu.
- Add public link expiry choices: 1, 7, 30 or 90 days, 1 year, or Never. Non-expiring links remain replaceable and revocable by the owner.
- Pack mixed-height notes into the shortest available column, preserving left-to-right initial order without the large blank spaces between grid rows. Layout updates when cards or the viewport resize.
### Validation
- API checks for timed/non-expiring links, permissions and revocation; browser checks for menu actions, sharing and compact packing at desktop, tablet and phone sizes.

## [1.0.4] - 2026-10-18
### Added
- Configurable TRUST_PROXY for Nginx Proxy Manager and other trusted proxies.
- English and Hindi interface options, existing-tag suggestions and multiple-tag AND filtering.
- Persistent per-account offline editing with idempotent replay and explicit conflict resolution.
- Checklist branch reordering, nested items, parent toggles and completed-item visibility.
- Google Keep ZIP/folder import with images, owner filtering, optional sharing restoration and duplicate skipping.
- Duplicate review, select all filtered notes, note copies and private deep links.
- Owner-controlled public read-only links with expiry, replacement and revocation.
- Running version in /api/health and API/browser regression tests.
### Fixed
- Grid ordering now fills horizontally instead of down columns.
### Upgrade notes
- For one Nginx Proxy Manager, set TRUST_PROXY=1 and restrict access to the app port to the proxy.
- Keep the database mount and JWT secret; existing accounts remain compatible.
- Reload browser/PWA windows after recreating the container.

## [1.0.3] - 2026-10-18
### Fixed
- Remove the blocking JWT secret startup check introduced in 1.0.2.
- Preserve existing configured secrets and the original fallback, allowing existing deployments and sessions to work without environment changes.
- Make JWT_SECRET optional again in deployment examples and the local Docker script.

## [1.0.2] - 2026-10-18
### Security
- Sanitize note and AI Markdown through a shared renderer.
- Stop caching authenticated API responses and remove legacy shared caches.
- Require an operator-supplied initial administrator and strong production JWT secret.
- Add authentication throttling, server-side password validation, and revocable sessions.
- Index new recovery-key digests; migrate existing recovery keys after successful use.
- Update dependencies and move Docker/development to Node 24 LTS.

### Fixed
- Include archived notes and archive state in JSON backups and restoration.
- Return ownership and revisions consistently when creating and loading notes.
- Reject stale note writes and preserve unsaved editor drafts on conflict/failure.
- Serialize writes from one client and save shared-note metadata independently of content.
- Refresh the correct view when realtime updates arrive while viewing the archive.

### Upgrade notes
- Back up the SQLite database, retain the data mount, and reload all open PWA/browser windows.
- Existing accounts are retained. Empty databases require INITIAL_ADMIN_USERNAME and INITIAL_ADMIN_PASSWORD.
- The JWT_SECRET startup requirement introduced here was removed in 1.0.3 for upgrade compatibility.

## [1.0.1] - 2025-08-15
### Added
- **New Sidebar Admin Panel** (initial release):
  - Create new users directly from the panel.
  - Toggle whether new account sign-ups are allowed.
- **Archiving notes**: move notes to an Archive without deleting them.

### Fixed
- Resolved an issue where typing could unexpectedly scroll the page/editor (“scroll typing”).
