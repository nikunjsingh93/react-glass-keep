# Development handoff

## Current task — Google Keep picker and missing pictures, issue #37

- Date: **2026-10-29**, America/New_York; agent: Codex.
- Branch: `main`; baseline: `bdeac2b744065ef9b5474aa29b0c24b76c808db9`.
- Web/server/native versions now **1.0.20**. Changes are local and uncommitted;
  no 1.0.20 image or binaries are published yet.
- Read `AGENTS.md` and `PROJECT.md`; preserve the large/lazy importer from 1.0.19.

## Implemented

- `FeaturePanels.jsx` has clear ZIP, folder and JSON-plus-images picker buttons.
  JSON/image selections accumulate; choosing a ZIP or folder replaces the selection.
  Missing images are listed and import requires supplying them or explicitly
  acknowledging the incomplete import. Input resets permit reselecting a file.
- `keepImport.js` merges selected File handles without loading their contents,
  resolves exact attachment paths first and unique basenames as fallback, and
  reports ambiguous/missing images. Attachments remain lazy and bounded.
- Removed the dormant App.jsx legacy text-only importer and its hidden JSON input.
  New UI messages translated in German/French/Hindi/Russian. The guide explains
  file access, missing-picture recovery and non-destructive reimport behavior.
- Added unit coverage and shared web/native browser checks for actual ZIP, folder,
  JSON/image file choosers, missing-picture recovery and rendered image content.
- Updated version metadata, Docker smoke expectation, changelog and PROJECT notes.

## Checks so far

- Web and native frontend builds passed with final 1.0.20 metadata.
- `node --test tests/keep-import.test.js`: **7 passed**.
- `node --test tests/web-features.browser.mjs tests/native.browser.mjs`: **2 passed**,
  including all three picker types and 450 MiB ZIP routing/rendering.
- `npm test`: **31 passed** on the authorized unrestricted rerun. The restricted
  attempt had 9 loopback EACCES failures (22 passed), caused by sandbox networking.
- No physical Android or interactive Mac verification this task.

## Next actions

1. Finish unrestricted tests; rebuild final 1.0.20 frontends and inspect diff.
2. Commit/push source, dispatch all native builds, publish multi-architecture Docker,
   smoke-test it, verify all binaries and publish a public Latest 1.0.20 release.
3. Update this checkpoint with actual results and publication state.

## External state and constraints

- Fresh GitHub check: v1.0.19 remains public Latest. Issue #37 is open with the
  reporter's new comment matching this request. No comment or closure sent by us.
- Previous v1.0.19 source: `2f1253e15f83d737a85eef08ca5dfd15cc677307`; native run
  40814065789 succeeded. Docker 1.0.19/latest digest before this task:
  `sha256:15becc253c9f4d31de762165a78af38d218e0e3ccfb3409bc69ee7c6adc2adac`.
- Owner updates the server through Portainer; publishing does not update production.
  Preserve Android signing identity, existing data and unrelated Docker containers.
- The reporter's actual export is unavailable. Synthetic fixtures demonstrate the
  tested paths; they do not prove success for every private export or device.
