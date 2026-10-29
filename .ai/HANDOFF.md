# Development handoff

## Last updated

- Date: **2026-10-28**, America/New_York; agent: Codex.
- Branch: `main`; baseline before this task: `1a62f2b450c3d9e6f182584121759bbeb5cefa85`.
- App/server/native metadata: **1.0.19**.
- Read `AGENTS.md` and `PROJECT.md` before continuing. Source/tests and fresh
  GitHub state take precedence over this snapshot.

## Current task: large Google Keep import, issue #37

The reporter selected a 400+ MB Google Takeout ZIP and saw the 200 MB error.
Inspection found two separate paths: Glass Keep backup import had a 200 MiB cap,
and the dedicated Keep importer eagerly loaded/unzipped everything with a 100 MiB
cap. Choosing the correct menu alone was therefore not enough.

Implemented and locally verified:

- `src/zipArchive.js`: bounded ZIP directory indexing with Blob slices, lazy
  chunked reads, CRC/local-header/path/declared-size checks. Standard stored and
  DEFLATE entries; unsupported ZIP64/encrypted/multidisk formats use folder fallback.
- `src/keepImport.js`: bounded note JSON preview and lazy attachments; async note
  generation checks the note upload budget before accumulating many attachments.
- `src/importBackup.js`: accepts async iterables and preserves partial-progress
  errors; retains existing request-size limits.
- `src/readBackup.js`, `src/App.jsx`: detect a Takeout ZIP before applying the
  unrelated backup limit and open the correct importer with the selected file.
- `src/FeaturePanels.jsx`: reading/import progress, bounded previews, stable parsed
  previews, close/unmount cancellation between batches and disabled import options
  while submitting. Existing duplicate/ownership/sharing controls remain.
- All four locale JSON files include the new messages. `docs/google-keep-import.md`,
  README, changelog, version metadata and Docker smoke expectations are updated.
- New ZIP/large-import tests and a synthetic 450 MiB fixture are tracked. No
  reporter archive or production notes were accessed.

## Verification actually run in this task

- `npm test`: **30 passed** (run before the metadata-only version bump).
- `npm run build` and `npm run native:build`: passed, including final 1.0.19 builds.
- `node --test tests/i18n.test.js tests/web-features.browser.mjs tests/auto-export.browser.mjs tests/native.browser.mjs`:
  **4 passed**. Includes the actual browser file picker with a 450 MiB synthetic
  Takeout selected through Import backup, preserved image content, legacy JSON/ZIP
  restore, native/offline behavior and matching locale placeholders.
- `node --test tests/keep-import.test.js tests/web-features.browser.mjs` after
  improving the fixture image: **7 passed**, including visible image decoding.
- ZIP tests cover lazy reads, cancellation, CRC corruption, unsafe paths, oversize
  content, streamed data descriptors, Unicode paths and declared-size overruns.
- `git diff --check` and syntax checks for ZIP/Keep modules passed.
- Additional ignored local helper passed with 81 notes / 405 MiB of synthetic
  attachments: preview read zero attachments, each attachment was read once, and
  the largest request was 6,990,916 bytes (below the 10 MiB batch target).
- No new physical Android or interactive Mac test has been run.

## Publication checkpoint

This checkpoint accompanies the source fix before its release build/push finishes.
The last previously published app version is 1.0.18. Publication of 1.0.19, native
build artifacts, Docker promotion and final GitHub release are still to be verified.
Do not report them as complete based on this checkpoint alone. No issue comment
was posted and issue #37 has not been automatically closed.

## Important limits and recovery

- ZIP: 2 GiB; total unpacked content: 4 GiB; 50,000 entries; directory: 16 MiB.
- JSON: 2 MiB per note file and 64 MiB combined metadata. Images: 12 MiB each;
  encoded note must fit the existing 19 MiB API import guard.
- Glass Keep JSON/backup.json ZIP imports retain the 200 MiB backup limit.
- Closing the dialog prevents future preparation/batches; a server request already
  accepted can finish. Earlier successful batches remain saved. Retry with
  duplicate skipping enabled.
- The large fixture includes unused stored HTML; the test proves bounded archive
  reads/routing and note/image preservation. It is not the reporter's private ZIP.
- Full app display/cache memory still depends on the final note/image dataset.
  See `docs/google-keep-import.md`; do not promise arbitrary archive sizes or
  low-memory-device success just because the eager ZIP allocation was removed.

## Previous completed state and preferences

- German shipped in 1.0.18 from piwanowitsch's PR #35 translation, with correct
  imports/startup/tests. PR #35 was closed unmerged after direct incorporation.
- Shared cross-agent memory files were committed/pushed in `1a62f2b` on 2026-10-22.
- The owner declined paid-hosting promotion when reviewing PR #36. Keep README
  focused on self-hosting; no new hosted deployment integration is assigned.
- The owner deploys through Portainer and installs clients themselves. Publishing
  an image does not verify their running deployment. Preserve existing data and
  the approved Android signing identity.

## Exact next steps

1. Commit/push the verified source fix and this checkpoint without closing or
   commenting on issue #37.
2. Build all matching 1.0.19 clients through the native workflow; build/test/push
   AMD64/ARM64 Docker and promote the verified image to latest.
3. Verify compiled Windows clients and APK metadata; collect seven binaries plus
   checksums. Publish a public Latest GitHub release and update this handoff with
   actual source commit, run, image digest, results and any remaining blockers.
