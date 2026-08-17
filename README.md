# agent_skills

Single source for my portable agent tooling — **skills**, **coding standards**,
and the **review pipeline** — shared across Claude Code, Codex, and opencode.

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
opencode/
  opencode.json           # global OpenCode configuration
  rules/*.md              # OpenCode-specific instructions
  agents/*.md             # OpenCode-native agent definitions
  commands/*.md           # OpenCode-native commands
```

## What links where

| Repo path | Claude Code | Codex | opencode |
|-----------|-------------|-------|----------|
| `skills/` | `~/.claude/skills` | `~/.agents/skills` | `~/.agents/skills` (auto-loaded) |
| `standards/AGENTS.md` | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | `~/.config/opencode/AGENTS.md` |
| `pipeline/pipeline.md` | `~/.claude/commands/pipeline.md` | *(not installed)* | *(not installed)* |
| `pipeline/agents/` | `~/.claude/agents` | *(not installed)* | *(not installed)* |
| `opencode/opencode.json` | *(not installed)* | *(not installed)* | `~/.config/opencode/opencode.json` |
| `opencode/rules/` | *(not installed)* | *(not installed)* | `~/.config/opencode/rules` |
| `opencode/agents/` | *(not installed)* | *(not installed)* | `~/.config/opencode/agents` |
| `opencode/commands/` | *(not installed)* | *(not installed)* | `~/.config/opencode/commands` |

The commands below link whole folders — correct on a **clean machine** where those
dirs hold nothing else. Two cases need care:

- **Shared dirs (agents/commands).** If `~/.claude/agents`, `~/.config/opencode/agents`,
  or `~/.claude/commands` already hold other files, link the corresponding files
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
ln -sfn "$REPO/skills" "$HOME/.agents/skills"

# standards
ln -sf "$REPO/standards/AGENTS.md" "$HOME/.claude/CLAUDE.md"
ln -sf "$REPO/standards/AGENTS.md" "$HOME/.codex/AGENTS.md"

# opencode
mkdir -p "$HOME/.config/opencode"
ln -sf "$REPO/standards/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"
ln -sf "$REPO/opencode/opencode.json" "$HOME/.config/opencode/opencode.json"
ln -sfn "$REPO/opencode/rules" "$HOME/.config/opencode/rules"
ln -sfn "$REPO/opencode/agents" "$HOME/.config/opencode/agents"
ln -sfn "$REPO/opencode/commands" "$HOME/.config/opencode/commands"

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
# opencode dirs shared with other agents or commands
mkdir -p "$HOME/.config/opencode/agents" "$HOME/.config/opencode/commands"
for f in "$REPO"/opencode/agents/*.md; do
  ln -sf "$f" "$HOME/.config/opencode/agents/$(basename "$f")"
done
ln -sf "$REPO/opencode/commands/pipeline.md" "$HOME/.config/opencode/commands/pipeline.md"
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

File and directory symlinks need an **elevated (Administrator) PowerShell** or
Developer Mode enabled.

```powershell
$repo = "$HOME\sources\agent_skills"
git clone git@github.com:marioweid/agent_skills.git $repo

function Link($path, $target) {
  if (Test-Path $path) { (Get-Item $path).Delete() }   # remove existing link/file only, never -Recurse
  New-Item -ItemType SymbolicLink -Path $path -Target $target | Out-Null
}

Link "$HOME\.claude\skills"                  "$repo\skills"
Link "$HOME\.agents\skills"                  "$repo\skills"
Link "$HOME\.claude\CLAUDE.md"               "$repo\standards\AGENTS.md"
Link "$HOME\.codex\AGENTS.md"                "$repo\standards\AGENTS.md"
New-Item -ItemType Directory -Force "$HOME\.config\opencode" | Out-Null
Link "$HOME\.config\opencode\AGENTS.md"      "$repo\standards\AGENTS.md"
Link "$HOME\.config\opencode\opencode.json"  "$repo\opencode\opencode.json"
Link "$HOME\.config\opencode\rules"          "$repo\opencode\rules"
Link "$HOME\.config\opencode\agents"         "$repo\opencode\agents"
Link "$HOME\.config\opencode\commands"       "$repo\opencode\commands"
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
  home.file.".agents/skills".source             = "${repo}/skills";
  home.file.".claude/CLAUDE.md".source         = "${repo}/standards/AGENTS.md";
  home.file.".codex/AGENTS.md".source           = "${repo}/standards/AGENTS.md";
  home.file.".config/opencode/AGENTS.md".source = "${repo}/standards/AGENTS.md";
  home.file.".config/opencode/opencode.json".source = "${repo}/opencode/opencode.json";
  home.file.".config/opencode/rules".source     = "${repo}/opencode/rules";
  home.file.".config/opencode/agents".source    = "${repo}/opencode/agents";
  home.file.".config/opencode/commands".source  = "${repo}/opencode/commands";
  home.file.".claude/commands/pipeline.md".source = "${repo}/pipeline/pipeline.md";
  home.file.".claude/agents".source            = "${repo}/pipeline/agents";
}
```

Pin updates with `nix flake update agentSkills`.

## Notes

- **Codex skills** — use the shared `~/.agents/skills` path. Keep
  `~/.codex/skills` intact because Codex stores its built-in system skills there.
- **opencode pipeline** — use the native definitions under `opencode/`; the
  files under `pipeline/` target Claude Code's dispatch and model syntax.
- On the work machine, keep company-only bits (Vertex/Artifactory settings) in a
  local file that is **not** linked from here.
