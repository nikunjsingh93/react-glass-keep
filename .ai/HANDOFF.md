# Development handoff

## Last updated

- **Date:** 2026-10-22 (America/New_York).
- **Agent:** Codex, using this conversation plus source and read-only GitHub checks.
- **Branch / baseline commit:** `main` / `77c218e779bb8c26b8b5eaa57cac13770d5ef349`.
- **Version:** web/server and all native clients are **1.0.18**.
- This is the initial shared handoff. It does not imply access to conversations
  outside this chat or to the owner's current production deployment.

## Current task and working tree

The owner requested persistent cross-agent Markdown memory from an attached guide.
Created these four files only:

- `AGENTS.md`: shared startup, working, verification and checkpoint instructions.
- `CLAUDE.md`: points to the same instructions and project/handoff files.
- `.ai/PROJECT.md`: durable architecture, decisions, pitfalls and release workflow.
- `.ai/HANDOFF.md`: this checkpoint.

There were no existing instruction/memory files to overwrite, and the working tree
was clean before this task. The owner subsequently requested that these files be
pushed. All four files are committed together and pushed to `origin/main` in the
documentation commit containing this checkpoint; use Git history for its hash.
They are not ignored and travel with the repository. No application code,
dependencies, versions, runtime data or deployment settings were changed. No new
app release is needed for this documentation setup.

## Last completed application work

| Version / commit | Completed behavior |
| --- | --- |
| 1.0.18 / `77c218e` | German integration using all 338 strings contributed by piwanowitsch in PR #35; corrected locale registration, picker, startup/loading screens, docs and tests. |
| 1.0.17 / `621a536` | Compact neutral Ask AI button beside search at every tested width, preserved busy/keyboard behavior and prevented logo overlap. |
| 1.0.16 / `82c67ab` | Russian support, including newer AI strings and startup text; contributor Neko1800 credited. |
| 1.0.15 / `30c5b75` | Android Settings/tags safe areas and Back handling; consistent responsive selection toolbar. |
| 1.0.14 / `21616f7`, `5e62741`, `0703a47` | Unified release versions, account-wide AI preference sync and protection against stale reads/mutations. |

Older relevant work is in `CHANGELOG.md`: on-demand Qwen/llama.cpp replaced the old
ONNX generator; local automatic JSON exports replaced Google Drive/OneDrive OAuth
backups; Android icon/safe-area/Back fixes and native connection/offline handling
were implemented. Preserve these decisions as described in `PROJECT.md`.

## Verified external state (2026-10-22)

- [v1.0.18](https://github.com/nikunjsingh93/react-glass-keep/releases/tag/v1.0.18)
  is the latest public, non-prerelease GitHub release with eight assets: seven
  Windows/Android/macOS binaries plus SHA-256 checksums.
- [Native workflow run 39658747867](https://github.com/nikunjsingh93/react-glass-keep/actions/runs/39658747867)
  succeeded for the baseline release commit during the preceding implementation task.
- Docker `nikunjsingh/glass-keep:1.0.18` and `:latest` were published and verified
  during that task, with AMD64/ARM64 index digest
  `sha256:57ba92eec602e7fb56b5bda2c22b1cbecea74fab2e7f9a13000c9cb4127d493f`.
  Registry tags are mutable; the Docker registry was not rechecked for this
  documentation-only checkpoint.
- PR #35 is now **closed, unmerged**. Its translation was incorporated directly
  and credited. Do not merge/reopen it as unfinished work.
- The open GitHub issues/PRs query returned `[]`. This is a dated snapshot, not a
  permanent statement that the project has no future work.
- The owner deploys through Portainer and installs clients themselves. Current
  production/server/device versions were not inspected and must not be inferred.

## Verification and its limits

### Performed for this documentation task

- Read the supplied guide, existing source/configuration, current docs/changelog,
  recent Git history and relevant test definitions.
- Checked `git status --short`, branch and HEAD; baseline was clean.
- Ran `node scripts/version.mjs --check`: all release metadata matches **1.0.18**.
- Queried GitHub's latest release, PR #35 and open issues/PRs as recorded above.
- Checked the new files' local references, Git visibility, whitespace and final
  changed-file scope after writing them.
- Committed the four-file setup and pushed it to `origin/main`; verified the remote
  branch matches the local commit and the working tree is clean.

No application tests, builds, Docker rebuilds or physical-device checks were run
for this Markdown-only task. Do not report historical release checks as rerun today.

### Historical checks actually run for release 1.0.18

- `npm run native:build` and `npm run build`: passed.
- `node --test tests/i18n.test.js tests/native.browser.mjs tests/web-features.browser.mjs tests/startup.browser.mjs tests/ai.browser.mjs`:
  all five test entries passed. Includes locale coverage/placeholders, German
  selection/reload/settings/export, first-paint startup, existing Android drawer
  Back/safe-area behavior, and AI layout in all five languages.
- `./tests/docker-smoke.ps1 -Image nikunjsingh/glass-keep:1.0.18`: passed on both
  architectures, including packaged frontend and llama.cpp executable.
- All five native CI jobs passed. Compiled Windows x64 and ARM64 clients were
  additionally tested with isolated profiles, including German persistence,
  connection, note writing and AI button availability. Those extended local
  helpers were ignored machine-local files, not a portable test dependency.
- Android APK metadata was checked: `versionName=1.0.18`, `versionCode=1000018`.
  No new physical Android test or interactive Mac session was performed for this release.

## Unfinished work, limits and next steps

There is no partially implemented application feature or known release blocker
remaining from the latest task. The memory setup is documentation only. No new
feature request has been assigned; do not invent one or repeat German integration.

1. When resuming, read `AGENTS.md` and `PROJECT.md`, inspect `git status`/HEAD and
   refresh any GitHub state relevant to the next user request.
2. The memory setup is checked in; there is no remaining documentation publishing
   task or application release to create for it.
3. Implement the owner's next requested task, using the focused verification and
   release process in `PROJECT.md`, then update this handoff immediately after
   substantial progress and before ending the session when possible.

Known product/platform limits (not unfinished fixes assigned here) include Linux
native packaging, widgets, Google Play distribution, Mac notarization and Windows
commercial signing. See `PROJECT.md` and the native guide before proposing work.
Keep the approved Android signing identity; do not generate a replacement.
