# Plan — agent_skills

## Now

Project-specific skills still load everywhere. Move `gwa2-bot` and `py4gw` into a
repo-scoped load set (e.g. `~/.pi/agent/repos.json`) so they only activate when working in
their respective directories. Design question: should Codex/Claude Code support this too,
or is it pi-only?

- [ ] Proof-of-concept: repo-scoped loader for the two project skills
- [ ] Wire a post-edit quality gate (lint/format on changed files via an extension event)
- [ ] Collect triage misfires (build work done inline, or agents spawned for trivia) and sharpen the lane table from the real examples
- [ ] A/B the thinned skills on a real task — confirm output quality held after the 11.5k-line cut

## Next

- Revoke the leaked Context7 API key at context7.com. It was printed into a session
  transcript on 2026-09-11 and `~/.pi/agent/sessions/` is plaintext, so removing the server
  entry from `~/.claude.json` did not invalidate it.
- Decide what "publishable" means for git metadata. File contents carry no employer string,
  but every commit's author email does (`git log --format=%ae`). `pi/check.mjs` scans files
  only, so it cannot see this. Either set a per-repo `user.email` going forward and accept the
  mixed history, or rewrite authorship before the repo goes anywhere public.

- **Go pi-only: drop Claude Code entirely.** Remove the `claude` subagent backend
  (`pi/extensions/subagents/src/backends/claude.ts`, `BACKEND_NAMES` in `src/domain.ts:13`,
  the `backends` array in `src/runtime.ts:17`, `claude.test.ts` and the claude cases in
  `manager.test.ts`), the `~/.claude` symlinks, and the Claude Code column from README.md's
  link table. Decided 2026-09-11; deliberately deferred, not urgent.
  Unblocked 2026-09-11: the `web` extension now gives pi its own `web_search`/`web_fetch`,
  so nothing functional depends on the claude harness any more.
  Unaffected: `anthropic-vertex/claude-*` models in `pi/agents/*.md` — that is the model
  provider, not a harness.
- Cross-family reviewer once a non-Anthropic provider is configured (only vertex has auth today)
- Decide whether role files should name model tiers instead of provider-specific model ids
- `.agent/` bootstrap for other repos (`/plan new <title>`)

## Done

- 2026-09-11 Directory-row overview (activity strip + journal) in the session-tree detail pane
  → .agent/plans/2026-09-11-recall-and-directory-overview.md
- 2026-09-11 Evaluated and rejected `pi-hermes-memory`; built then deleted `/recall` — it reached
  2 of 25 session files (6% of bytes), because the build loop's work lives in excluded subagent
  transcripts. Fixed the same `deliverAs: "nextTurn"` bug in `project-memory`'s `/plan`.
- 2026-09-10 Pruned generic skills duplicate to AGENTS.md and role prompts (25 → 15 directories)
- 2026-09-10 Ran a real feature through the build loop end to end (the prune itself)
- 2026-09-09 Dropped the subagent UI (`/subagents`, `/btw`, takeover) — the session tree covers it
- 2026-09-09 Folded the `/fleet` browser into the session tree
