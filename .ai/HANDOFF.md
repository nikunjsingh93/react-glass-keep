# Development handoff

## Last updated

- Date: **2026-11-02**, America/New_York; agent: Codex; branch: `main`.
- Baseline: `594eb273a7fbb01599329e3d7c12a6bc14cf0837`; all versions **1.0.21**.
- Source fix committed/pushed as `3ab0de1f081d79fa2275ae636d30ee0951fb86de`.
- This completion handoff is a documentation-only follow-up. Use Git history for
  its hash. Working-tree cleanliness is verified after pushing.
- Read AGENTS.md and PROJECT.md. Source/tests/fresh GitHub state are authoritative.

## Completed task — long/large Google Keep import recovery (#37)

Reporter confirmed the pickers worked, then hit a connection error after 953
notes and the per-note upload guard after 1,278 notes on a subsequent attempt.

- `server/noteImport.js`: authenticated account-scoped SQLite chunk staging,
  256 KiB decoded chunks, 128 MiB encoded-note cap, quotas, expiry/cleanup, atomic
  whole-note commit and replayable results. Images/notes are not split or resized.
- Duplicate fingerprint cache with content/ownership invalidation triggers.
  Backfill reads missing IDs then hashes one note at a time, avoiding repeated
  whole-library image scans. SELECT iterator + writes initially failed with a
  better-sqlite3 busy-query error; corrected and covered in integration tests.
- `src/importTransport.js`: <=512 KiB batches / max 50 notes, five transient
  retries/backoff, stable mutation/upload IDs across Resume and bounded chunks.
  Imports use a 120-second timeout and propagate caller cancellation.
- `offline.js`: preserves explicit operation IDs and underlying network errors;
  does not rewrite the cached library for import/chunk acknowledgments.
- Keep dialog tracks confirmed notes, pauses/resumes after exhausted retries,
  reports individual failed titles/reasons, continues to later notes, downloads a
  failure report and retries only unconfirmed notes. Options lock once uploading
  starts; selecting new files starts fresh state. New messages translated everywhere.
- Import-time full-library refreshes deferred; server notifications batched per
  affected user after commit. Removed full note-content console logging.
- Generic JSON/ZIP backup restores use bounded transport too, with unique IDs for
  missing/duplicate input IDs. Existing data, sharing and offline edits preserved.
- Guide, PROJECT notes, changelog, versions and Docker smoke expectation updated.

## Verification actually run

- `npm test`: **36 passed**, before final small identity/Resume-label refinements.
- Final web and native frontend builds passed with aligned 1.0.21 metadata.
- Final focused suite (transport + locales + recovery/web/native browser):
  **8 passed**. Earlier web/native/export browser suite: **4 passed**.
- Real-browser recovery fixture: 1,300 small notes + intact >20 MiB image-bearing
  note + one deliberately bad image note. Six batch replies lost after successful
  server saves exhaust retries; explicit Resume continues safely. A large-note
  commit reply is also lost. Duplicate skipping OFF: no duplicate saves. Original
  picture bytes and image decoding preserved; later notes import and failed-only
  retry does not resend confirmed notes. Full-library refresh count stays bounded.
- API integration covers chunk integrity, incomplete commits, account isolation,
  expiry/cleanup, atomic large-note saves, lost replies, fingerprint invalidation,
  sharing and legacy session/data compatibility. Transport tests cover cancellation
  and stable identifiers across retries/resume. Recovery screenshot inspected.
- Compiled Windows x64 and ARM64: real Rust transport, all picker workflows and
  intact >20 MiB note with original image equality/decoding passed. ARM64 additionally
  passed the synthetic 450 MiB Takeout ZIP through backup routing.
- APK versionName **1.0.21**, versionCode **1000021**; signature verified locally,
  public signing certificate matches previous releases. Android icon/signing CI passed.
- Both Mac jobs passed architecture/signature/DMG/startup checks. No physical
  Android or interactive Mac testing performed in this task.
- Standard Docker smoke passed AMD64/ARM64. Additional disposable-container checks
  on both architectures passed >20 MiB intact uploads, byte preservation and replay
  with duplicate skipping OFF. Only test containers were removed afterward.
- Syntax, version invariant and diff whitespace checks passed.

## Publication completed and verified

- All five native jobs succeeded for exact source 3ab0de1 in run **41474333082**:
  https://github.com/nikunjsingh93/react-glass-keep/actions/runs/41474333082
  Apple Silicon Mac initially waited for a hosted runner, then completed successfully.
- Public, non-prerelease **Latest v1.0.21**, eight verified assets (seven binaries
  and SHA256SUMS.txt), targeting the source commit above:
  https://github.com/nikunjsingh93/react-glass-keep/releases/tag/v1.0.21
- Downloads: `artifacts/native/1.0.21`. Do not publish collector ZIPs/test material.
- Docker `nikunjsingh/glass-keep:1.0.21` and `:latest`, AMD64/ARM64; verified digest:
  `sha256:fa7628ec531b67a8a6abd8a1a5bec660e801f4c3f8a84d6505efc51477fd5410`.
  Docker Desktop was initially stopped and started through its CLI.
- Issue #37 rechecked **open** for reporter confirmation. No comment/closure sent.
- Owner deploys through Portainer; production server was not inspected or updated.

## Limits and next action

- Update server AND native clients for the chunk protocol; refresh web after update.
  Imports need a reachable server and memory/storage for the final dataset.
- Keep images remain capped at 12 MiB each, full notes at 128 MiB encoded. Oversized
  or invalid notes are reported without partial saves; other notes continue.
- Global request cap stays 20 MiB. Staging reserves <=128 MiB per user / 512 MiB
  globally, expires after one hour without activity, cleans up every minute/startup.
- Resume state is in the open dialog. New files/reopening starts a new import:
  recommend Skip duplicate notes when restarting after earlier successful imports.
- Reporter archive unavailable; tests use synthetic fixtures, not private exports.
  Do not promise arbitrary-size imports or success on every low-memory device.
- No assigned implementation, build or publication work remains. Await reporter
  confirmation; refresh repository/external state before another task.
