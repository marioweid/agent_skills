# OpenCode Configuration Migration

## Goal

Make `agent_skills` the source of truth for all portable OpenCode configuration so that
OpenCode no longer depends on `dotfiles`.

## Repository Layout

Add an `opencode/` directory containing:

- `opencode.json` with automatic approval and explicit safety denials
- `rules/` with OpenCode-specific instructions
- `agents/` with all OpenCode agent definitions
- `commands/` with the native pipeline command

Keep shared standards in `standards/AGENTS.md`. Do not commit generated OpenCode runtime
files such as `node_modules`, `package.json`, or lockfiles.

## Global Installation

Replace the current `~/.config/opencode` directory symlink with a real directory. Create
individual links from its managed entries to `agent_skills`:

- `AGENTS.md` -> `standards/AGENTS.md`
- `opencode.json` -> `opencode/opencode.json`
- `rules` -> `opencode/rules`
- `agents` -> `opencode/agents`
- `commands` -> `opencode/commands`

This keeps generated runtime files outside the repository while preserving one source of
truth for configuration.

## Migration Rules

- Preserve the current uncommitted OpenCode-native agent and pipeline changes.
- Preserve automatic approval for normal operations.
- Preserve explicit denials for sensitive paths and destructive shell commands.
- Preserve unrelated user changes already present in either repository.
- Do not delete the `dotfiles` repository as part of this migration.

## Documentation

Update `README.md` to include the OpenCode directory in the repository layout and document
the individual-link installation for macOS/Linux, Windows, and Nix.

## Verification

- Parse `opencode/opencode.json` as JSON.
- Run `opencode debug config` after switching the global links.
- Verify the expected OpenCode agents and command are discovered.
- Confirm the active OpenCode configuration contains no path into `dotfiles`.
- Check the final diff without modifying unrelated worktree changes.
