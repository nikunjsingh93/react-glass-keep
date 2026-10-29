# Development handoff

## Last updated

- Date: **2026-10-29**, America/New_York; agent: Codex.
- Branch: `main`; baseline: `bdeac2b744065ef9b5474aa29b0c24b76c808db9`.
- Web/server/native metadata: **1.0.20**.
- Source fix committed/pushed as `f392b7e1b09d6f982bec7702b6beee111768646f`.
- This completion checkpoint is a documentation-only follow-up. Use Git history
  for its hash; working-tree cleanliness is checked after pushing.
- Read `AGENTS.md` and `PROJECT.md`; source/tests and fresh external state prevail.

## Completed task — Google Keep picker and missing pictures, issue #37

The reporter could not find ZIP/folder options and imported JSON without images.
The shared importer had raw file inputs; the individual-file accept filter excluded
images. Browsers cannot read unselected neighboring files from JSON alone.

- `FeaturePanels.jsx`: visible Choose Takeout ZIP, Choose Takeout folder and Add
  JSON files and images buttons. JSON/image selections accumulate; ZIP/folder
  choices replace the selection. Missing pictures are listed; uploading requires
  supplying them or explicitly acknowledging an incomplete import. Reset inputs
  allow selecting the same files again. New guidance translated in every locale.
- `keepImport.js`: merges File handles without eager content reads. Exact paths
  take priority, with unique-basename fallback for flat individual selections;
  ambiguous names are reported instead of guessed. Missing-image records belong
  only to valid importable notes. Large/lazy ZIP and per-note limits are preserved.
- `App.jsx`: removed dormant legacy text-only Keep importer and hidden JSON input,
  leaving one shared implementation. Existing backup formats remain supported.
- `docs/google-keep-import.md` explains all three choices, missing-image recovery,
  browser file permissions and reimport behavior. Duplicate checks include images:
  importing complete notes adds copies with pictures without changing old copies.
- Added unit tests and a shared browser helper exercising actual ZIP, folder and
  multi-file pickers, adding pictures after JSON, saved bytes and rendered images.
- Versions, changelog, Docker smoke expectations and PROJECT notes are aligned.

## Verification actually run

- `npm test`: **31 passed** with authorized loopback access. The first restricted
  attempt had 9 loopback EACCES failures (22 passed); sandbox networking caused them.
- Final 1.0.20 `npm run build` and `npm run native:build`: passed.
- `node --test tests/keep-import.test.js tests/i18n.test.js tests/web-features.browser.mjs tests/native.browser.mjs`:
  **10 passed**, including all picker types, phone/desktop control bounds,
  missing-image guard/recovery and the synthetic 450 MiB ZIP route with image decode.
- Desktop import screenshot visually inspected; all picker buttons visible.
- Compiled Windows x64 and ARM64 clients passed basic transport checks and all
  three picker workflows with saved/rendered pictures using temporary profiles.
  ARM64 also passed the synthetic 450 MiB ZIP through the backup entry point.
- APK versionName **1.0.20**, versionCode **1000020**. Local apksigner verification
  passed and the public signing certificate matches the 1.0.19 release.
- All five native CI jobs succeeded, including Mac packaging/startup/architecture
  checks and Android signing/icon checks. No physical Android or interactive Mac
  testing was done in this task.
- Docker smoke passed on AMD64 and ARM64: health/version, proxy, login/SQLite,
  ownership, archived exports, final frontend hash and llama.cpp executable.
- Version invariant and `git diff --check` passed.

## Publication completed and verified

- Native run **40879428436** succeeded for exact source commit f392b7e:
  https://github.com/nikunjsingh93/react-glass-keep/actions/runs/40879428436
- Public, non-prerelease **Latest v1.0.20**, targeting that source commit:
  https://github.com/nikunjsingh93/react-glass-keep/releases/tag/v1.0.20
- All seven binaries and SHA256SUMS.txt uploaded and verified (eight assets).
  Local downloads: `artifacts/native/1.0.20`. Never publish collector ZIPs.
- Docker `nikunjsingh/glass-keep:1.0.20` and `:latest` published for AMD64/ARM64,
  verified index digest:
  `sha256:a4243d8608402189a6ecbd68f9c629b95abd4d0e1ef74c0708dca28ea9e59cda`.
  Docker Desktop was initially stopped and started through its CLI for the build.
- Issue #37 rechecked **open** for reporter confirmation. No comment or closure
  sent by us. Owner updates production through Portainer; production was not changed.

## Limits, recovery and next action

- Selecting JSON alone cannot read unselected neighboring pictures. Use the full
  ZIP/folder or select JSON and supported images together; images can be added later.
- Reimporting with pictures preserves old text-only copies. Review before manually
  deleting anything. Never silently overwrite/delete earlier imports.
- Preserve standard ZIP 2 GiB / expanded 4 GiB / 50,000-entry limits, bounded
  metadata/lazy attachments and the existing per-image/per-note upload guards.
  ZIP64/encrypted/multidisk archives need extracted-folder import. Details in guide.
- Reporter archive unavailable; tests use synthetic fixtures, not private exports.
  No promise of arbitrary-size imports or every low-memory device succeeding.
- Owner/reporter should update Docker/web and any native clients independently;
  native UI is bundled. Refresh the web app after updating.
- No assigned implementation, build or publication work remains. Await reporter
  confirmation; refresh repository/GitHub state before starting another task.
