# agent_skills

Single source for my portable agent tooling — **skills**, **coding standards**,
and the **review pipeline** — shared across Claude Code, Codex, and opencode.

This repo is the source of truth and a Pi package: its manifest recursively
loads every `skills/*/SKILL.md`. Company-specific config (Vertex, Artifactory,
internal RAG) is intentionally **not** here — that stays on the work machine.

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

### Pi

On NixOS, prefer the declarative [Home Manager setup](#nix-home-manager) below.
For a live development checkout on other setups, install this checkout as a local package. Pi loads all 26 skills directly from
this repository, so later edits are available without a separate sync or
lockfile update:

```sh
pi install "$REPO"
pi list
```

To remove it later: `pi remove "$REPO"`.

### Claude Code, Codex, and OpenCode

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
  url = "github:marioweid/agent_skills/main";
  flake = false;
};

# In the NixOS module configuring Home Manager, pass the flake inputs through:
home-manager.extraSpecialArgs = { inherit inputs; };

# home.nix  (args include `inputs`)
{ inputs, ... }:
let repo = inputs.agentSkills;
in {
  # Pi discovers these directly; settings.json stays writable for login/model preferences.
  home.file.".pi/agent/skills/agent-skills".source = "${repo}/skills";
  home.file.".pi/agent/AGENTS.md".source = "${repo}/standards/AGENTS.md";

  # Optional: links for other tools.
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

The input is pinned in the NixOS configuration's `flake.lock`. To update all
inputs (including skills) and activate the links on this machine:

```sh
nix flake update --flake "$HOME/nixos-config"
sudo nixos-rebuild switch --flake "$HOME/nixos-config#nixos"
```

To update only the skills, use
`nix flake update agentSkills --flake "$HOME/nixos-config"`, then rebuild.
A rebuild alone keeps the locked revision; it does not fetch the latest branch tip.

After the first successful activation, remove any previous local Pi package
registration to avoid loading both the checkout and the Nix-managed skills:

```sh
pi remove "$HOME/sources/agent_skills"
```

Then use `/reload` in Pi or restart it. Nix-managed skills are auto-discovered,
so they won't appear in `pi list`. All skill directories and their bundled
references/scripts are linked; the Claude/OpenCode pipeline is not Pi-native
and is not installed into Pi. The Nix store is read-only: edit the source checkout,
publish changes to GitHub, then update the flake input and rebuild. Local uncommitted
changes are not included in the GitHub input.

## Notes

- **Codex skills** — use the shared `~/.agents/skills` path. Keep
  `~/.codex/skills` intact because Codex stores its built-in system skills there.
- **opencode pipeline** — use the native definitions under `opencode/`; the
  files under `pipeline/` target Claude Code's dispatch and model syntax.
- On the work machine, keep company-only bits (Vertex/Artifactory settings) in a
  local file that is **not** linked from here.

Portable Pi snapshot and native macOS/NixOS setup: [pi/README.md](pi/README.md).
