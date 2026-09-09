# Plan — agent_skills

## Now

Rebuilt the pi harness around a delegating build loop: scouts read in parallel, one
architect plans, one implementer writes, one reviewer gates, one scribe records.
Config lives here and is symlinked into `~/.pi/agent`.

- [ ] Wire a post-edit quality gate (lint/format on changed files via an extension event)
- [ ] Prune project-specific skills (`gwa2-bot`, `py4gw`, `logfire-*`) out of the always-on set
- [ ] Run one real feature through `/build` end to end and fix what chafes

## Next

- Cross-family reviewer once a non-Anthropic provider is configured (only vertex has auth today)
- Decide whether role files should name model tiers instead of provider-specific model ids
- `.agent/` bootstrap for other repos (`/plan new <title>`)

## Done

- 2026-09-09 Dropped the subagent UI (`/subagents`, `/btw`, takeover) — the session tree covers it
- 2026-09-09 Folded the `/fleet` browser into the session tree
