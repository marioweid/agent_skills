# agent_skills

Single source for my portable agent tooling — skills, coding standards, and the
review pipeline — consumable by Claude Code and opencode (and via nix at home).
Company-specific config (Vertex, Artifactory, internal RAG) is intentionally
**not** here; that stays on the work machine.

## Layout

```
<skill>/SKILL.md          # one dir per skill (+ optional references/)
standards/AGENTS.md       # portable coding standards (company-free)
pipeline/
  pipeline.md             # the review command (architect → … → docs)
  agents/*.md             # the 6 pipeline subagents
```

## Skills

Install with the Agent Skills CLI (pin the source to this repo):

```bash
npx skills add marioweid/agent_skills            # all skills
npx skills add marioweid/agent_skills --list     # list available
```

The CLI installs skills for every supported runtime (Claude Code, opencode,
Gemini CLI, Copilot, Zed, …). Skill names come from each `SKILL.md` frontmatter.

## Coding standards

`standards/AGENTS.md` is the portable version of my global standards. Wire it per
tool:

- **opencode** — symlink to `~/.config/opencode/AGENTS.md` (opencode reads it
  natively).
- **Claude Code** — symlink to `~/.claude/CLAUDE.md`, or `@`-include it from a
  machine-local `CLAUDE.md` that adds work-only bits.

## Pipeline

`pipeline/pipeline.md` drives the architect → implementer → QA → quality →
critic → docs loop; `pipeline/agents/` holds the six subagents.

- **Claude Code** — symlink `pipeline/pipeline.md` into `~/.claude/commands/` and
  `pipeline/agents/*.md` into `~/.claude/agents/`.
- **opencode** — the agents port to `~/.config/opencode/agents/`, but the command
  drives Claude Code's `Task`/`subagent_type` dispatch, so the orchestration step
  needs an opencode-native rewrite before it runs there.

## nix

Point home-manager at this repo (a flake input / fetchGit) and symlink the three
pieces into each tool's config dir. Skills can also be materialized by running the
Skills CLI, but the checked-in tree is the source of truth.
