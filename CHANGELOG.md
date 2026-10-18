# Changelog

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
