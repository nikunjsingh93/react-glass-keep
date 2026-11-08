# Development handoff

## Last updated

- Date: **2026-11-08**, America/New_York; agent Codex; branch `main`.
- Baseline: `6ef5032cee7b7032028e762664855384e4f210ca`; all versions **1.0.22**.
- Main fix: `976a5facf795cde1c45d63736cc58b99d444e559`.
- Final app source: `515b74e5828c2cbb390b910699fbb326f75f2575` (partial-cache guard).
- This completion handoff/PROJECT clarification is a documentation-only follow-up.
  Use Git history for its hash; working tree is checked clean after pushing.
- Read AGENTS.md and PROJECT.md; source/tests and fresh external state prevail.

## Completed task — reviewer follow-up in issue #37

Reporter saw empty notes after import/occasional refreshes, false dirty warnings
on untouched notes, Invalid JSON when importing on an ARM64-hosted server, and
requested a visible version/update link.

- App refreshes are cancellable and scoped to latest request/account/view. Import
  start invalidates pending reads; close refreshes the current view. Failed/invalid
  reads retain visible notes and show Retry. Empty/partial offline caches cannot
  replace an already visible same-view list or claim the account has no notes.
- Offline cache writes are best effort after successful server reads/writes; quota
  failures preserve returned data and durable queued edits. Actual failures show an
  account-scoped notice, cleared on successful list caching. Stale replies are
  rejected and newer/pending local revisions retained. Removed fresh-list writes
  to the redundant localStorage cache; existing invalidation helpers remain.
- Dirty checks/autosaves compare raw title text with the raw opening baseline.
  Padded imported titles no longer trigger a save/close guard simply on opening.
  Remote revisions advance only with no local draft; real conflicts preserve drafts.
- `uuid.js` uses randomUUID where available and cryptographic getRandomValues on
  LAN HTTP. Shared imports, checklist editing and outbox/transport IDs use it.
  JSON syntax errors are distinct from localized preparation/attachment warnings.
- Main header shows bundled version below logo, linked to docs/updating.md on
  GitHub. Guide explains Portainer and separate native client updates. New text
  translated in all locales. Header transitions animate colors rather than geometry,
  preserving responsive search/AI alignment and safe-area behavior.

## Checks actually run

- `npm test`: **39 passed** (before final small same-view partial-cache refinement).
- Final web and native builds passed with 1.0.22 metadata. Version check passed.
- New real insecure-HTTP browser fixture passes: randomUUID genuinely unavailable,
  valid Keep ZIP import, importer close around a delayed empty reply, cache quota,
  connection/failed/malformed refreshes, version visibility at 320px, untouched padded
  titles with no patch, and real conflicting drafts kept open. Reran after final
  same-view partial-cache guard; passed.
- Unit coverage passes UUID fallback/uniqueness, syntax versus preparation errors,
  quota failures with durable pending drafts, request ordering and account isolation.
- Existing 1,300-note recovery/web/native browser suite: **3 passed**. Final
  AI/header + HTTP browser suite: **2 passed**; AI layouts cover five languages,
  light/dark themes, web/native and 320/390/768/1280px.
- Initial new fixture hit test-only JSON module import and DNS route.fetch errors;
  corrected. Host resolver maps the browser only; fixture API calls use loopback.
- AI layout check caught animated glass-card header geometry; fixed with color-only
  header transition. Phone version screenshot inspected.
- Compiled Windows x64 and ARM64 both pass with randomUUID disabled, untouched
  padded title, main version link, all pickers and >20 MiB intact-note/image checks.
  ARM64 also passes 450 MiB Takeout. An initial 5-second big-image render wait timed
  out after byte preservation passed; 20-second render wait passed, no source fix.
- APK versionName **1.0.22**, versionCode **1000022**, signature verified locally;
  public signing certificate matches previous releases. CI signing/icons pass.
- Both Mac jobs pass origin/architecture/signature/DMG/startup checks. No physical
  Android or interactive Mac verification in this task; private reporter ZIP absent.
- Final Docker smoke passes AMD64/ARM64 including version/proxy/SQLite/ownership,
  archived export, exact final frontend hash and bundled llama executable.
- Diff whitespace and syntax checks passed.

## Publication completed and verified

- Final native workflow **42520883231** succeeded for source 515b74e:
  https://github.com/nikunjsingh93/react-glass-keep/actions/runs/42520883231
- Initial own run 42520519642 was superseded/cancelled when the final partial-cache
  safeguard was added. None of its binaries were published.
- Public, non-prerelease **Latest v1.0.22**, eight verified assets (seven binaries
  and SHA256SUMS.txt), targeting final source 515b74e:
  https://github.com/nikunjsingh93/react-glass-keep/releases/tag/v1.0.22
- Local downloads: artifacts/native/1.0.22. Do not publish collector ZIPs/test data.
- Docker `nikunjsingh/glass-keep:1.0.22` and `:latest`, both architectures; verified
  FINAL index digest:
  `sha256:10839423d8edf1a96335cc3baf7703464dae13dbdaeb38b1e39475babd4a4683`.
- Base images changed, requiring runtime rebuild. An intermediate Docker build for
  976a5fa was superseded by final 515b74e BEFORE smoke/promotion. Do not use the
  intermediate digest 8e0053f1... as the released image.
- Issue #37 rechecked **open** for reporter confirmation. No comment/closure sent.
- Owner deploys through Portainer; production was not inspected or updated.

## Limits and next action

- HTTP compatibility was reproduced independently of CPU type. The actual reporter
  ZIP was unavailable; genuinely malformed files may still need correction and now
  show distinct errors rather than falsely labeling every preparation failure JSON.
- Keep 12 MiB/image, 128 MiB/encoded note, bounded chunks, staging quotas/expiry,
  idempotent resume and all prior ownership/offline safeguards. No model changes.
- Version below logo is bundled interface/client version; server/client updates
  remain separate. Refresh browser after server update; native clients need install.
- No assigned implementation/build/publication work remains. Await reporter
  confirmation; refresh repo/GitHub state before another task.
