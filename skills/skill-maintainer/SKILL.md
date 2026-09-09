---
name: skill-maintainer
description: "Use when creating, editing, updating, relocating, auditing, publishing, or installing agent skills. Covers skill structure, trigger descriptions, source-vs-runtime locations, Pi package metadata, and quality checks for durable skill instructions."
---

# Skill Maintainer

Maintain agent skills as portable, source-controlled instruction packages.

Use this skill when the user asks to create, edit, update, rename, move, audit,
publish, install, or debug a skill.

## Core Principle

Skills are reusable behavior packages. Keep them clear, focused, portable, and
source-controlled. The `agent_skills` repository is the canonical source for
its skills and its `package.json` is the Pi package manifest for local/package
installs. On NixOS, Home Manager links the skills from a pinned GitHub flake input.

Do not treat an installed runtime skill directory as the source of truth until
you have checked whether it is a local package path, symlink, or generated copy.

## Source Location Rules

When editing skills, resolve the canonical source before changing files.

- Custom skills in this repository live at `skills/<skill-name>/SKILL.md`.
- Local Pi package installs load `./skills` recursively via the manifest.
- On NixOS, `~/.pi/agent/skills/agent-skills` points to the pinned repository's
  `skills/` directory in the read-only Nix store. Edit the source checkout, not
  the store target; publish changes before updating the input and rebuilding.
- A runtime path such as `~/.agents/skills/<skill-name>/` may be managed by
  another tool and is not automatically canonical.

Rules:

1. Never hardcode OS-specific absolute paths in skill instructions.
2. Prefer repo-relative paths or discovered package/source paths.
3. Before editing an installed skill, determine whether it resolves to this
   repository or another source.
4. Edit the canonical source, not a generated runtime copy.
5. Keep skill content here. For NixOS deployment, update the `agentSkills`
   input in the system configuration's `flake.lock` and rebuild after publishing
   the changes. No per-skill install list or separate content repository is needed.

## Skill Creation Checklist

1. Clarify the skill purpose and trigger conditions.
2. Choose a short kebab-case name, e.g. `skill-maintainer`.
3. Create `skills/<name>/SKILL.md`.
4. Add frontmatter with the exact skill name and a clear trigger-oriented
   description.
5. Write practical instructions, not vague principles only.
6. Include source-location, safety, and verification rules if relevant.
7. Keep instructions portable across Windows, macOS, and Linux.
8. Avoid machine-specific paths, usernames, drive letters, and secrets.
9. No manifest edit is needed for a normal new skill: `package.json` loads the
   whole `skills/` directory.

## Skill Editing Checklist

1. Locate the installed skill, if relevant.
2. Resolve its source before editing.
3. Read the current `SKILL.md` before changing it.
4. Preserve useful existing behavior and make the smallest necessary change.
5. Keep trigger descriptions accurate and specific.
6. Avoid broadening a skill so it triggers on unrelated tasks.
7. Keep local workflow conventions portable and free of absolute paths.
8. If the repository package structure changes, update `package.json` and the
   README installation instructions.

## Frontmatter Rules

Every skill starts with YAML frontmatter:

```yaml
---
name: skill-name
description: "Use when ..."
---
```

- Names use lowercase kebab-case and normally match their directory names.
- Descriptions state when the skill must be used and include likely task
  categories or user phrases.
- Keep names stable: renaming can break references.

## Quality Rules

A skill should be focused, triggerable, actionable, safe, portable, and easy to
maintain. Avoid overly broad descriptions, unrelated instruction dumps, secrets,
and assumptions that a runtime directory is canonical.

## Verification

After creating or editing a skill:

1. Confirm `skills/<name>/SKILL.md` exists in the canonical source.
2. Confirm its YAML frontmatter parses and its name matches the directory.
3. Confirm the description matches the intended trigger phrases.
4. Confirm no OS-specific hardcoded paths or secrets were introduced.
5. For local package installs, use `pi list` to confirm the source registration.
   For NixOS, evaluate/build the Home Manager configuration and verify the active
   skill symlink resolves to the locked source after rebuilding. Nix-discovered
   skills do not appear in `pi list`.
6. Reload or restart Pi to discover changed skills.
