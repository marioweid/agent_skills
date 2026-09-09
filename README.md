# agent_skills

Single source for my agent tooling — **skills**, **coding standards**, and the **pi
harness** (roles, prompts, extensions). Skills and standards are portable across
Claude Code and Codex; the harness is pi-native.

Company-specific config (Vertex, Artifactory, internal RAG) is intentionally **not**
here — that stays on the work machine. `pi/check.mjs` is the guard.

## Layout

```
skills/<skill>/SKILL.md   # one dir per skill (+ optional references/)
standards/AGENTS.md       # the always-on instructions, incl. the build loop
pi/
  agents/*.md             # the five subagent roles
  prompts/*.md            # slash commands (/build)
  extensions/             # pi extensions (vendored + local)
  settings.json           # portable snapshot — NOT the work machine's config
  check.mjs               # asserts the snapshot stays portable and complete
.agent/                   # this repo's own agent memory (PLAN.md, JOURNAL.md)
```

## The build loop

The main thread triages every request into one of three lanes (see
`standards/AGENTS.md`):

- **Direct** — answer, read, one obvious edit. No agents.
- **Recon** — 2-4 read-only `scout`s in parallel; only their briefs come back.
- **Build** — recon → clarifying questions → `architect` writes a plan → risk gate →
  one `implementer` → `reviewer` on the diff → `scribe` records it.

Reads parallelise; exactly one agent ever writes. `/build <task>` runs the loop
explicitly; otherwise the main thread enters it on its own for anything non-trivial.

| Role | Model tier | Tools | Returns |
|---|---|---|---|
| `scout` | haiku | read-only | `## BRIEF` — answer, file map, unknowns |
| `architect` | opus | read + write plan | `## DESIGN BRIEF` — plan file, risk, gate |
| `implementer` | sonnet | read + edit/write | `## CHANGE SUMMARY` — files, checks, deviations |
| `reviewer` | opus | read-only | `## VERDICT` — blockers, should-fix, verified |
| `scribe` | haiku | read + edit/write | `## RECORD` — plan, journal, docs |

Subagents cannot call `ask_user`: the main thread is the only channel to the human.

## Per-repo memory

Each repo keeps its own `.agent/`:

| File | What |
|---|---|
| `.agent/PLAN.md` | `## Now` (injected into every system prompt), `## Next`, `## Done` |
| `.agent/JOURNAL.md` | append-only decisions and outcomes, timestamped |
| `.agent/plans/<date>-<slug>.md` | full design docs from the architect |

`/plan` shows the current focus; `/plan new <title>` bootstraps the files. The
`project-memory` extension only injects and displays — agents edit the markdown with
their normal tools.

## What links where

| Repo path | pi | Claude Code | Codex |
|---|---|---|---|
| `skills/` | `~/.agents/skills` | `~/.claude/skills` | `~/.agents/skills` |
| `standards/AGENTS.md` | `~/.pi/agent/AGENTS.md` | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` |
| `pi/agents/` | `~/.pi/agent/agents` | — | — |
| `pi/prompts/` | `~/.pi/agent/prompts` | — | — |
| `pi/extensions/` | `~/.pi/agent/extensions` | — | — |

Link whole folders only on a clean machine. If a target dir already holds other
files, link the individual entries instead.

## Setup

Clone anywhere; set `REPO` to that path.

### macOS / Linux

```sh
REPO="$HOME/sources/agent_skills"
git clone git@github.com:marioweid/agent_skills.git "$REPO"

mkdir -p ~/.pi/agent ~/.agents
ln -sfn "$REPO/skills"              ~/.agents/skills
ln -sfn "$REPO/standards/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -sfn "$REPO/pi/agents"           ~/.pi/agent/agents
ln -sfn "$REPO/pi/prompts"          ~/.pi/agent/prompts
ln -sfn "$REPO/pi/extensions"       ~/.pi/agent/extensions
( cd "$REPO/pi/extensions" && npm install --ignore-scripts )
```

The extensions directory must be linked as a whole: pi resolves each extension's
imports and `node_modules` from the real path.

Other harnesses, if installed:

```sh
ln -sfn "$REPO/skills"              ~/.claude/skills
ln -sfn "$REPO/standards/AGENTS.md" ~/.claude/CLAUDE.md
ln -sfn "$REPO/standards/AGENTS.md" ~/.codex/AGENTS.md
```

### Windows

Symlinks need an elevated PowerShell or Developer Mode.

```powershell
$repo = "$HOME\sources\agent_skills"
git clone git@github.com:marioweid/agent_skills.git $repo

function Link($path, $target) {
  if (Test-Path $path) { (Get-Item $path).Delete() }   # link/file only, never -Recurse
  New-Item -ItemType SymbolicLink -Path $path -Target $target | Out-Null
}

Link "$HOME\.agents\skills"          "$repo\skills"
Link "$HOME\.pi\agent\AGENTS.md"     "$repo\standards\AGENTS.md"
Link "$HOME\.pi\agent\agents"        "$repo\pi\agents"
Link "$HOME\.pi\agent\prompts"       "$repo\pi\prompts"
Link "$HOME\.pi\agent\extensions"    "$repo\pi\extensions"
Link "$HOME\.claude\skills"          "$repo\skills"
Link "$HOME\.claude\CLAUDE.md"       "$repo\standards\AGENTS.md"
```

### nix (home-manager)

```nix
# flake.nix
inputs.agentSkills = { url = "github:marioweid/agent_skills/main"; flake = false; };

# home.nix (args include `inputs`)
{ inputs, ... }:
let repo = inputs.agentSkills;
in {
  home.file.".pi/agent/skills/agent-skills".source = "${repo}/skills";
  home.file.".pi/agent/AGENTS.md".source           = "${repo}/standards/AGENTS.md";
  home.file.".pi/agent/agents".source              = "${repo}/pi/agents";
  home.file.".pi/agent/prompts".source             = "${repo}/pi/prompts";
  home.file.".agents/skills".source                = "${repo}/skills";
  home.file.".claude/CLAUDE.md".source             = "${repo}/standards/AGENTS.md";
}
```

Update with `nix flake update agentSkills --flake "$HOME/nixos-config"`, then rebuild.
The Nix store is read-only: edit the checkout, push, update the input. Extensions are
not installed this way — they need a writable `node_modules`, so link the checkout.

## Notes

- **Codex skills** live at the shared `~/.agents/skills`. Leave `~/.codex/skills`
  alone; Codex keeps its built-in system skills there.
- **`pi/settings.json` is not the work machine's config.** It is a portable snapshot
  pinned to `@earendil-works/pi-coding-agent@0.85.1`; the work machine runs its own
  provider and keeps company-only settings in files that are never linked from here.
  Run `node pi/check.mjs` before committing.
- Extension details: [pi/extensions/README.md](pi/extensions/README.md).
