# Development handoff

## Current task — follow-up import/refresh/draft regressions (#37)

- Date: **2026-11-08**, America/New_York; agent Codex; branch main.
- Baseline: `6ef5032cee7b7032028e762664855384e4f210ca`.
- Versions now **1.0.22**. Changes local/uncommitted; nothing published for 1.0.22 yet.
- Read AGENTS.md and PROJECT.md; preserve the 1.0.21 bounded chunk import protocol.

## Implemented

- App note refreshes are latest-request/account/view scoped and cancellable;
  import start invalidates pending reads; closing import refreshes. Errors keep
  displayed notes and show Retry. Empty offline cache/invalid API data no longer
  masquerades as an empty account. Removed fresh-list localStorage cache writes.
- Offline client returns accepted server results even when optional IndexedDB
  caching fails, preserving pending drafts and durable queued edits. Notices are
  account-scoped and clear after successful list cache writes; stale replies are
  rejected and newer local revisions are retained in merges.
- Dirty checks/autosaves compare raw title text to the raw opening baseline.
  Untouched imported padded titles no longer trigger a save or close guard.
  Remote revisions advance only when there is no local draft.
- Cryptographic UUID helper falls back to getRandomValues on LAN HTTP origins;
  shared imports, outbox and checklist code no longer require randomUUID.
  Invalid JSON and preparation failures now have distinct localized warnings.
- Main header shows bundled version with a GitHub updating.md link. New guide
  explains Docker/Portainer + separate client updates. New strings translated.
- Header color-only transition fixes geometry jitter caught by AI layout checks.

## Checks so far

- `npm test`: **39 passed**.
- Web/native builds passed with final 1.0.22 metadata (latest CSS change built too).
- Existing recovery/web/native browser suite: **3 passed**; initial new browser
  test failed due to JSON module import syntax, then fixture DNS route.fetch;
  both test-only problems fixed.
- Actual insecure-HTTP browser test now passes import/close with a delayed empty
  reply, storage quota, failed/malformed reads, version visibility at 320px,
  untouched padded-title notes, and preservation of a real conflicting draft.
- New unit tests pass UUID fallback, preparation error classification, cache quota,
  durable pending drafts, out-of-order reads and previous-account replies.
- AI layout check initially caught animated header geometry during resizing; CSS
  override applied. Final AI + HTTP browser suite: **2 passed**, including all languages/themes and 320/390/768/1280px web/native layouts.
- No physical-device or newly packaged client verification yet. Actual reporter
  archive unavailable; do not claim all possible malformed metadata is fixed.

## Next steps

1. Finish final AI/header browser check; inspect diff and commit/push source.
2. Dispatch all native builds; build/push Docker 1.0.22, smoke both architectures,
   promote verified image to latest. Collect and verify actual client binaries.
3. Publish public Latest 1.0.22 with seven binaries + checksums. Update this handoff
   with actual commit/run/digest/checks and commit completion docs afterward.

## Context

- Fresh GitHub check confirms reporter's comment in issue #37, still open; Latest
  remains 1.0.21. No issue comment or closure sent by us.
- Owner deploys through Portainer. Do not claim their running server was updated.
  Preserve existing data, signing identity and unrelated containers.
