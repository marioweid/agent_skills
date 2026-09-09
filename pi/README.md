# Direct Codex Pi snapshot

This snapshot retires the `localhost:8787`/Headroom proxy. It pins Pi CLI
`@earendil-works/pi-coding-agent@0.85.1`, ponytail 4.9.0, and pi-subagents
0.66.0. The lock intentionally retains `@earendil-works/pi-server@0.85.0`:
it is pi-subagents' resolved dependency, not a CLI version mismatch to repair.

`settings.json` is a non-secret preference snapshot; it has no `models.json`.
Pi 0.85.1's built-in OpenAI Codex catalog contains the selected Luna, Sol,
Terra, and Astra IDs and routes direct Codex through
`https://chatgpt.com/backend-api` (installed Pi sources:
`docs/models.md`, “Overriding Built-in Providers”, and
`node_modules/@earendil-works/pi-ai/dist/providers/openai-codex.js`). This
proves catalog/transport support, not account entitlement. Do not remap models
until an authenticated owner observes they are unavailable.

## Before changing a destination

Stop Pi on that machine. Make a unique private backup of each conflicting
settings file, npm directory, or link; inspect dangling links too. Never copy
auth, credentials, history, caches, downloaded binaries, or `node_modules`.
Never symlink writable settings into Git or the Nix store, install a
`models.json`, run `pi update`/`npm update`, or run `npm ci` over an existing
mixed `~/.pi/agent/npm` directory.

If settings is absent, copy it as a mode-0600 ordinary file. If it exists,
manually merge only the reviewed preferences and package entries, preserving
unrelated keys and registrations; do not replace arrays wholesale. For an
absent npm directory, copy this `npm/package.json` and `npm/package-lock.json`
to a new sibling, run an audit (review any advisory before proceeding) and
`npm ci --ignore-scripts`, validate it, then move it into the absent final path.
Existing npm content needs explicit graph merge/review. The lock was preserved
from the reviewed live graph minus Headroom; run `node pi/check.mjs` before use.

After cloning the reviewed repository and setting `REPO` as shown below, copy
`"$REPO/pi/settings.json"` to `"$HOME/.pi/agent/settings.json"` on either system.
This first-install step refuses existing files and dangling links; use the
manual merge instructions above for an existing setup:

```sh
set -euo pipefail
mkdir -p "$HOME/.pi/agent"
if [ -e "$HOME/.pi/agent/settings.json" ] || [ -L "$HOME/.pi/agent/settings.json" ]; then
  printf 'Settings already exist; back up and merge them manually.\n' >&2
  exit 1
fi
install -m 600 "$REPO/pi/settings.json" "$HOME/.pi/agent/settings.json"
```

## macOS: native Node/npm, not Nix

Install Git normally. Download the official Node v22.23.2 archive for the
matching `uname -m`, verify SHA-256, then extract it to an absent,
user-owned `~/.local/node/` directory. The published hashes are
`61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6` for
Darwin arm64 and
`58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026` for
Darwin x64. Add its `bin` to PATH and report its bundled npm version rather
than upgrading it silently. Node must be at least 22.19.0.

```sh
set -euo pipefail
export npm_config_prefix="$HOME/.local"
export npm_config_ignore_scripts=true
export PATH="$npm_config_prefix/bin:$PATH"
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.85.1
```

Persist this user-writable prefix/PATH in the owner's shell setup; no `sudo`
and no global system install. The CLI release has publisher shrinkwrap
metadata, but target-machine tarball/native optional dependency validation is
still required.

Clone into an absent destination and use the published reviewed snapshot commit
provided by the owner (not this pre-publication HEAD):

```sh
REPO="$HOME/src/agent_skills"
REV='<published-reviewed-snapshot-commit>'
test ! -e "$REPO"
git clone https://github.com/marioweid/agent_skills.git "$REPO"
git -C "$REPO" checkout --detach "$REV"
```

Use one skills route. Inspect `~/.agents/skills` and package registrations for
duplicate repository discovery first; do not delete shared skills. Link only
when absent (remove an old repository package registration only after the
replacement is verified):

```sh
set -euo pipefail
mkdir -p "$HOME/.pi/agent/skills"
link_if_absent() {
  if [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; then return; fi
  if [ -e "$2" ] || [ -L "$2" ]; then
    printf 'Conflict: %s; inspect and back it up before proceeding\n' "$2" >&2
    return 1
  fi
  ln -s "$1" "$2"
}
link_if_absent "$REPO/skills" "$HOME/.pi/agent/skills/agent-skills"
link_if_absent "$REPO/standards/AGENTS.md" "$HOME/.pi/agent/AGENTS.md"
link_if_absent "$REPO/pi/agents" "$HOME/.pi/agent/agents"
link_if_absent "$REPO/pi/prompts" "$HOME/.pi/agent/prompts"
```

`pi/agents/*.md` are the five build-loop roles and `pi/prompts/build.md` is the
command that runs them; both pin `anthropic-vertex` model ids, so a machine on a
different provider must edit the `model:` line in each role file.

## NixOS / Home Manager

Use relevant declarations in their existing separate locations, not as one
module or a host/hardware transplant:

```nix
# flake.nix input
agentSkills = { url = "github:marioweid/agent_skills/main"; flake = false; };
# NixOS Home Manager integration
home-manager.extraSpecialArgs = { inherit inputs; };
# Home Manager module
{ pkgs, inputs, ... }: {
  home.packages = with pkgs; [ pi-coding-agent nodejs_22 fd ripgrep ];
  home.file.".pi/agent/skills/agent-skills".source = "${inputs.agentSkills}/skills";
  home.file.".pi/agent/AGENTS.md".source = "${inputs.agentSkills}/standards/AGENTS.md";
}
```

Retain the current nixpkgs lock and verify installed Pi is 0.85.1. Existing
correct Home Manager links replace the macOS helper. Copy the snapshot's
settings/npm pair from a checkout at the same locked `agentSkills` revision
using the shared writable flow. After publication, update only that input:
`nix flake update agentSkills --flake "$HOME/nixos-config"`, review the lock
diff, then use the host's normal activation flow. A rebuild neither advances
the input nor includes dirty local changes; inspect fixed `hm-backup` name
conflicts first. No task-time rebuild is implied.

## Login, verification, updates

On a new machine, use `/login` and select OpenAI ChatGPT Plus/Pro; never copy
auth. Check `command -v pi`, `pi --version`, Node/npm versions,
`npm ls --prefix "$HOME/.pi/agent/npm" --depth=0`, and `pi list`. Fresh verbose
startup should show AGENTS, all 26 repository skills, and the two extensions
without duplicate warnings (package skills may add more). Use `/model`,
`/thinking`, `/subagents-models`, `/subagents-doctor`, and ponytail commands
interactively. A harmless task and subagent run are owner/native-runtime
checks, not `pi -p`; model availability requires authenticated evidence.

For updates, review Git diffs, merge settings manually, and stage a changed
npm pair in a new sibling directory with scripts ignored before swapping it
while Pi is stopped. Retain the old directory privately. Do not automatically
restore the retired proxy. Existing processes may retain retired loopback
variables or loaded extensions until a fresh Pi runtime and login shell; Nix
activation/rebuild is an owner follow-up, not part of copying this snapshot.
macOS runtime, native optional dependencies, and authenticated provider
behavior remain unverified until tested on macOS.

Official references reviewed: installed Pi 0.85.1 `README.md`,
`docs/{quickstart,settings,packages,providers,models,skills,environment-variables}.md`;
pi-subagents 0.66.0 `README.md` and `docs/models.md`.
