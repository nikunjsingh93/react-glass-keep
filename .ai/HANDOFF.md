# Development handoff

## Last updated

- Date: **2026-10-29**, America/New_York; agent: Codex. Task began 2026-10-28.
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

## Publication completed and verified

- Source fix committed and pushed to `main` as
  `2f1253e15f83d737a85eef08ca5dfd15cc677307`.
- [Native workflow run 40814065789](https://github.com/nikunjsingh93/react-glass-keep/actions/runs/40814065789)
  succeeded for that exact commit; all five platform jobs passed.
- [v1.0.19](https://github.com/nikunjsingh93/react-glass-keep/releases/tag/v1.0.19)
  is public, non-prerelease and Latest, with seven verified binaries and
  `SHA256SUMS.txt`. All web/server/native metadata matches 1.0.19.
- Docker `nikunjsingh/glass-keep:1.0.19` and `:latest` were published for AMD64/ARM64;
  verified index digest:
  `sha256:15becc253c9f4d31de762165a78af38d218e0e3ccfb3409bc69ee7c6adc2adac`.
  Docker Desktop was stopped at first and was started through its CLI for the build.
- `./tests/docker-smoke.ps1 -Image nikunjsingh/glass-keep:1.0.19` passed on both
  architectures, including version, proxy, SQLite, archived export, frontend hash
  and bundled llama.cpp executable checks.
- Compiled Windows x64 and ARM64 basic checks passed with temporary profiles.
  ARM64 additionally imported the synthetic 450 MiB ZIP via the backup entry point
  and rendered its image. An initial attempt hit Playwright's 50 MB remote-transfer
  cap; using CDP's local-file input command resolved that test-harness limitation.
- APK metadata is `versionName=1.0.19`, `versionCode=1000019`, with the existing
  signing identity. No new physical Android or interactive Mac test was performed.
- Issue #37 is still **open** for reporter confirmation. No issue comment was
  posted and no automatic closure was requested.
- This completion checkpoint is committed/pushed in a documentation-only follow-up;
  use Git history for its hash. The working tree was verified clean after pushing.

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

1. The owner can update through Portainer and install the new clients. Their
   production deployment has not been inspected or changed by this task.
2. Have the reporter confirm their actual archive on 1.0.19; it was not available
   to this agent. Check ZIP format and per-note/per-file limits if a new failure
   is reported. Do not simply remove safety limits or return to eager extraction.
3. No implementation, build or publishing work remains from this task. Leave
   issue comments/closure to the owner unless they explicitly request an action.
   Refresh GitHub/local state before beginning the next assigned task.
