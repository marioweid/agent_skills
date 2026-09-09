# Journal — agent_skills

Append-only. Newest at the bottom. One entry per meaningful decision or outcome.

## 2026-09-09T20:45Z — Rebuilt the harness around a delegating build loop

[DECISION] Reads parallelise, writes never. Any number of read-only `scout`s run at
once; exactly one `implementer` ever writes. This follows the 2026 reconciliation of
the multi-agent debate (Cognition's single-threaded-writes position plus Anthropic's
parallel-read evidence) rather than a swarm or an agentic router.

[DECISION] The human is asked by the main thread only. Subagents cannot call
`ask_user` by design, so clarifying questions happen in phase 2 of the loop, driven by
the scouts' `unknowns`. This replaced the `brainstorming` skill, which was deleted.

[DECISION] Gate on risk, not on every plan. The architect self-declares `gate: yes` for
schema, API, architecture, security, migration, and destructive work; everything else
proceeds without stopping.

[DECISION] Per-repo memory is plain markdown (`.agent/PLAN.md`, `.agent/JOURNAL.md`,
`.agent/plans/*.md`) with one small extension that injects the `## Now` block into the
system prompt. No database, no new model-facing tools — agents edit the files directly.

[OUTCOME] Six Claude-Code-era roles replaced by five pi-native ones (scout/architect/
implementer/reviewer/scribe) with per-role model tiers: haiku for recon and recording,
sonnet for implementation, opus for planning and review. Deleted `pipeline/`,
`opencode/`, the `workflows` extension, and `~/AGENTS.md`; merged the standards into one
95-line `standards/AGENTS.md`. Always-on context dropped from ~14.6k to ~9k tokens.

[DISCOVERY] `pi/settings.json` in this repo is a deliberately sanitized portable
snapshot (openai-codex models) guarded by `pi/check.mjs`; the live machine runs
anthropic-vertex. That divergence is intentional and must not be "fixed" by syncing.
