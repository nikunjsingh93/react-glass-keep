# Development handoff

## Current task — resilient large Keep imports (#37)

- Date: **2026-11-02**, America/New_York; agent: Codex; branch main.
- Baseline: `594eb273a7fbb01599329e3d7c12a6bc14cf0837`; versions now **1.0.21**.
- Local changes are not committed or published yet. Read AGENTS.md/PROJECT.md.

## Implemented

- Server `noteImport.js`: authenticated SQLite chunk staging, 256 KiB decoded chunks,
  128 MiB encoded-note cap, per-account/global quotas, one-hour expiry with minute
  cleanup/startup cleanup, atomic whole-note commit and replayable results.
- Duplicate fingerprint cache with SQL content/ownership invalidation. Backfills
  only missing IDs then hashes one note at a time; never rehashes every image on
  each batch. SELECT iterator + cache writes initially failed in better-sqlite3;
  fixed using a small ID list before per-note reads/writes.
- `importTransport.js`: <=512 KiB batches, five transient retries/backoff, stable
  operation/upload IDs across resume, small chunk requests and best-effort cleanup.
  Import-specific 120-second request timeout and real parent cancellation.
- Offline wrapper preserves explicit operation IDs/network errors and does not
  rewrite all cached notes for import/chunk acknowledgments.
- Keep UI pauses/resumes unconfirmed notes, continues past individual bad notes,
  shows titles/reasons and downloadable failure report, retries failed notes only.
  Notes/pictures are not split, resized, dropped or saved partially after failure.
- Import-time full-library refreshes deferred, server events batched per affected
  user, full note content logging removed. Generic backup restores use transport too.
- All supported locales, guide, changelog, versions and Docker smoke expectation updated.

## Checks run

- `npm test`: **36 passed** (before final small identity/Resume-label refinements).
- Final web and native frontend builds passed with 1.0.21 metadata.
- Final focused suite (import transport + locales + recovery/web/native browser):
  **8 passed**. Earlier export/browser suite **4 passed**.
- New real-browser recovery test: 1,300 small notes plus a >20 MiB note with two
  original images; exhausts five retries by losing six replies after successful
  batch commit, then explicitly resumes; loses a large-note commit reply too.
  Duplicate skipping OFF, no duplicate saves. One oversized image note is reported,
  later notes import, only failed note is retried; full-library refreshes bounded.
- API tests cover chunk integrity/incomplete commits, account isolation, staged
  cleanup, >20 MiB intact note, lost replies, duplicate-cache invalidation, legacy
  sessions/data and existing sharing behavior.
- Syntax, version and diff whitespace checks passed. Reporter archive unavailable.
- No compiled client or physical-device verification for 1.0.21 yet.

## Next steps

1. Commit/push source; dispatch all native builds. Docker Desktop is stopped:
   start it, build/push 1.0.21, smoke both architectures, promote exact image to latest.
2. Wait for all native jobs, collect actual binaries, check compiled Windows and
   APK version/signing. Publish public Latest 1.0.21 with seven binaries/checksums.
3. Update this handoff with actual source hash, run, image digest and final results;
   commit/push completion docs afterward.

## Constraints

- 12 MiB per image remains for Takeout; notes >128 MiB encoded are reported and
  skipped, not partially stored. Requests still globally capped at 20 MiB.
- Update server AND native clients. Resume state is in the open dialog; a new file
  selection or reopened app starts a new import. Keep duplicate skipping on for
  restarts. A reachable server and storage/memory for final dataset remain required.
- Last published release is 1.0.20. Issue #37 open; no comments/closure sent by us.
- Owner deploys via Portainer; do not claim publishing updates their running server.
  Preserve approved signing identity and unrelated Docker containers/data.
