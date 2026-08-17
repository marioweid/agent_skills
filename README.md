# agent_skills

Single source for my portable agent tooling — **skills**, **coding standards**,
and the **review pipeline** — shared across Claude Code and opencode.

There is no install CLI and no lockfile: this repo *is* the source of truth.
Clone it once (or let nix materialize it) and symlink the folders into each
tool's config directory. Company-specific config (Vertex, Artifactory, internal
RAG) is intentionally **not** here — that stays on the work machine.

## Layout

```
skills/<skill>/SKILL.md   # one dir per skill (+ optional references/)
standards/AGENTS.md       # portable coding standards (company-free)
pipeline/
  pipeline.md             # the review command (architect → … → docs)
  agents/*.md             # the 6 pipeline subagents
```

## What links where

| Repo path | Claude Code | opencode |
|-----------|-------------|----------|
| `skills/` | `~/.claude/skills` | `~/.config/opencode/skills` |
| `standards/AGENTS.md` | `~/.claude/CLAUDE.md` | `~/.config/opencode/AGENTS.md` |
| `pipeline/pipeline.md` | `~/.claude/commands/pipeline.md` | *(needs an opencode-native rewrite — see Notes)* |
| `pipeline/agents/` | `~/.claude/agents` | `~/.config/opencode/agents` |

The commands below link whole folders — correct on a **clean machine** where those
dirs hold nothing else. Two cases need care:

- **Shared dirs (agents/commands).** If `~/.claude/agents`, `~/.config/opencode/agents`,
  or `~/.claude/commands` already hold other files, link the pipeline files
  **individually** instead of the folder, so you don't clobber them (see the
  "Shared dir" snippet).
- **Machine-local extra skills (overlay).** If a machine needs skills that aren't
  in this repo (e.g. work-only ones), make the skills dir a **real folder** and
  symlink `skills/*` in, plus the extra skills from their own location (see the
  "Overlay" snippet). A whole-folder link can't mix two sources.

## Setup

Clone anywhere; set `REPO` to that path.

### macOS / Linux

```sh
REPO="$HOME/sources/agent_skills"
git clone git@github.com:marioweid/agent_skills.git "$REPO"

# skills
ln -sfn "$REPO/skills" "$HOME/.claude/skills"
ln -sfn "$REPO/skills" "$HOME/.config/opencode/skills"

# standards
ln -sf "$REPO/standards/AGENTS.md" "$HOME/.claude/CLAUDE.md"
ln -sf "$REPO/standards/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"

# pipeline (Claude Code)
mkdir -p "$HOME/.claude/commands" "$HOME/.claude/agents"
ln -sf  "$REPO/pipeline/pipeline.md" "$HOME/.claude/commands/pipeline.md"
ln -sfn "$REPO/pipeline/agents"      "$HOME/.claude/agents"
```

`ln -sfn` on a directory replaces the link atomically; it does **not** recurse,
so re-running is safe.

#### Shared dir (link pipeline files individually)

When an agents/commands dir already holds other files:

```sh
# Claude agents dir shared with other agents
for a in architect critic docs-writer implementer qa-engineer quality-checker; do
  ln -sf "$REPO/pipeline/agents/$a.md" "$HOME/.claude/agents/$a.md"
done
# opencode agents dir (keeps your own agents in place)
for a in architect critic docs-writer implementer qa-engineer quality-checker; do
  ln -sf "$REPO/pipeline/agents/$a.md" "$HOME/.config/opencode/agents/$a.md"
done
```

#### Overlay (repo skills + machine-local extras)

When a machine also needs skills not in this repo (e.g. work-only), point the
skills dir at both sources with per-skill links:

```sh
EXTRA="$HOME/path/to/local/skills"          # where the extra skills live
mkdir -p "$HOME/.claude/skills"
for d in "$REPO"/skills/*/;   do ln -sfn "$d" "$HOME/.claude/skills/$(basename "$d")"; done
for d in "$EXTRA"/my-extra-skill; do ln -sfn "$d" "$HOME/.claude/skills/$(basename "$d")"; done
```

### Windows

Directory symlinks need an **elevated (Administrator) PowerShell** or Developer
Mode enabled.

```powershell
$repo = "$HOME\sources\agent_skills"
git clone git@github.com:marioweid/agent_skills.git $repo

function Link($path, $target) {
  if (Test-Path $path) { (Get-Item $path).Delete() }   # remove existing link/file only, never -Recurse
  New-Item -ItemType SymbolicLink -Path $path -Target $target | Out-Null
}

Link "$HOME\.claude\skills"                  "$repo\skills"
Link "$HOME\.config\opencode\skills"         "$repo\skills"
Link "$HOME\.claude\CLAUDE.md"               "$repo\standards\AGENTS.md"
Link "$HOME\.config\opencode\AGENTS.md"      "$repo\standards\AGENTS.md"
Link "$HOME\.claude\commands\pipeline.md"    "$repo\pipeline\pipeline.md"
Link "$HOME\.claude\agents"                  "$repo\pipeline\agents"
```

### nix (home-manager)

Add the repo as a flake input and link the folders declaratively:

```nix
# flake.nix
inputs.agentSkills = {
  url = "github:marioweid/agent_skills";
  flake = false;
};

# home.nix  (args include `inputs`)
{ inputs, ... }:
let repo = inputs.agentSkills;
in {
  home.file.".claude/skills".source            = "${repo}/skills";
  home.file.".config/opencode/skills".source   = "${repo}/skills";
  home.file.".claude/CLAUDE.md".source         = "${repo}/standards/AGENTS.md";
  home.file.".config/opencode/AGENTS.md".source = "${repo}/standards/AGENTS.md";
  home.file.".claude/commands/pipeline.md".source = "${repo}/pipeline/pipeline.md";
  home.file.".claude/agents".source            = "${repo}/pipeline/agents";
}
```

Pin updates with `nix flake update agentSkills`.

## Notes

- **opencode pipeline** — the agents port directly, but `pipeline.md` drives
  Claude Code's `Task` / `subagent_type` dispatch. It needs an opencode-native
  rewrite of the orchestration step before `/pipeline` runs under opencode.
- On the work machine, keep company-only bits (Vertex/Artifactory settings) in a
  local file that is **not** linked from here.
