# Project agent instructions

These instructions and the `.ai/` notes are shared project context for Codex,
Claude Code, OpenCode, Pi Agent, and other coding tools. They contain project
knowledge, not a complete conversation history.

## Start a session

1. Read [project knowledge](.ai/PROJECT.md) and the [latest handoff](.ai/HANDOFF.md).
2. Check `git status --short`, the current branch/commit, and relevant source files.
3. Treat source, tests, and freshly checked external state as authoritative when
   the notes are stale. Recheck GitHub before relying on recorded issue/release status.
4. Continue from the confirmed state. Preserve unrelated user changes and existing
   instructions; do not reset the checkout or recreate completed features.

If your tool does not load this file automatically, read it explicitly. `CLAUDE.md`
points to the same instructions; do not maintain a separate copy of project memory
for each agent.

## Work on the project

- Follow the existing React/Express/Tauri design and prefer focused changes over
  rewrites. Root JavaScript is ESM; `server/` is CommonJS. Use Node 24 as specified
  in `package.json`.
- The native apps are clients of a separately hosted server. Preserve the shared
  interface and platform adapter instead of implementing separate app features.
- Protect existing accounts, notes, attachments, sessions, and pending offline
  edits. Keep migrations compatible and scope cached state to its account/server.
- Never put credentials, tokens, signing keys, personal server details, user notes,
  or private test recordings into these files, commits, logs, or release downloads.
- Use temporary databases, accounts, export destinations, and native app profiles
  for verification. Do not test by changing production notes or the normal profile.
- Keep new interface strings translated in every supported locale. Update startup
  language handling and loading screens when adding a language.
- Record lasting decisions and relevant failed approaches in `.ai/PROJECT.md`.
  Correct obsolete entries after verification instead of silently erasing useful history.
- Follow the user's current scope and existing authorization for GitHub, releases,
  and deployment. The owner updates the production server through Portainer;
  publishing an image does not establish that their server has been updated.
- Documentation-only tasks do not require an application version bump or release.

## Verify changes

- Run checks appropriate to the change; see `.ai/PROJECT.md` for commands and test
  boundaries. Browser `.mjs` tests are separate from `npm test`.
- Check native and web builds when changing shared interface code. For Android
  overlays/header changes, exercise safe areas, scrolling, and Back handling.
- Do not claim a test, device check, deployment, or published artifact was verified
  unless it actually was. Distinguish current checks from historical results.
- Keep web/server and all native release versions aligned using
  `npm run release:version -- X.Y.Z`; also update the Docker smoke-test expectation
  and changelog. Never globally replace Rust dependency versions.
- For an authorized full release, publish the matching Docker image and verified
  client binaries. The final GitHub release should be public and Latest, with all
  expected downloads and checksums; explain any genuine blocker accurately.

## Checkpoint and hand off

Update `.ai/HANDOFF.md` after each substantial completed task, before switching
agents, when asked to hand off, and before ending a development session when possible.
Do not rely solely on a session-ending update: crashes and interrupted sessions
cannot reliably write one.

Keep the handoff concise and include:

- Date, agent, branch, baseline commit, current version, and actual working-tree state.
- Completed work and important files changed.
- Unfinished work, confirmed bugs/blockers, and relevant uncertainties.
- Commands/checks actually run and their results, including anything not verified.
- A specific next action; say when there is no assigned feature left to implement.
- Whether changes were committed, pushed, released, or only created locally.

Keep durable architecture in `.ai/PROJECT.md`, recent progress in `.ai/HANDOFF.md`,
and user-facing release history in `CHANGELOG.md`. Avoid copying long logs or whole
conversations into memory files.
