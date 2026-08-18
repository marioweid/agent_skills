---
name: skill-maintainer
description: "Use when creating, editing, updating, relocating, auditing, or publishing agent skills. Covers skill structure, trigger descriptions, source-vs-runtime locations, symlink-aware edits, private/custom skill repos, dotfiles lockfiles, and quality checks for durable skill instructions."
---

# Skill Maintainer

Maintain agent skills as source-controlled, portable instruction packages.

Use this skill when the user asks to create, edit, update, rename, move, audit, publish, install, or debug a skill.

## Core Principle

Skills are reusable behavior packages. Keep them clear, focused, portable, and source-controlled.

Do not treat the installed runtime skill directory as the source of truth until you have checked whether it is a symlink or generated install location.

## Source Location Rules

When editing skills, resolve the canonical source before changing files.

Preferred conventions:

- Runtime/install location: `~/.agents/skills/<skill-name>/`
- Published/global/user-managed skills: `~/dotfiles`
- Custom/private skills created by the user: `~/Sources/agent_skills` or `~/sources/agent_skills`

Rules:

1. Never hardcode OS-specific absolute paths in skill instructions.
2. Prefer `~`, repo-relative paths, or discovered symlink targets.
3. Treat `~/.agents/skills` as runtime/install location, not necessarily source.
4. Before editing an installed skill, check whether the skill directory is a symlink.
5. If symlinked, edit the symlink target/source repository.
6. If ownership is unclear, ask the user before editing.
7. For custom skills created by this user, prefer the `agent_skills` source repo.
8. When a custom skill belongs to the `agent_skills` repo, ensure the dotfiles lockfile/install metadata is updated or explicitly note that it still needs updating.

## Skill Creation Checklist

When creating a new skill:

1. Clarify the skill purpose and trigger conditions.
2. Choose a short kebab-case name, e.g. `skill-maintainer`.
3. Create a folder containing `SKILL.md`. In **this** repo (`agent_skills`), custom skills live under `skills/<name>/` per the repo's "move skills under skills/" restructure, so a new skill lands at `skills/<name>/SKILL.md`.
4. Add frontmatter with:
   - `name`: exact skill name
   - `description`: clear trigger-oriented description
5. Write practical instructions, not vague principles only.
6. Include source-location, safety, and verification rules if relevant.
7. Add examples only when they reduce ambiguity.
8. Keep instructions portable across Windows, macOS, and Linux.
9. Avoid machine-specific paths, usernames, drive letters, and secrets.
10. Update install/symlink metadata or lockfiles when required by the user's setup.

## Skill Editing Checklist

When editing an existing skill:

1. Locate the installed skill.
2. Resolve symlinks to find the canonical source.
3. Read the current `SKILL.md` before editing.
4. Preserve useful existing behavior.
5. Make the smallest change that fixes the issue.
6. Keep trigger descriptions accurate and specific.
7. Avoid broadening a skill so much that it triggers on unrelated tasks.
8. If adding local workflow conventions, keep them portable and avoid absolute paths.
9. If the edit affects installation or publishing, update the relevant repo metadata or lockfile.
10. Summarize what changed and what still needs manual verification.

## Frontmatter Rules

Every skill should start with YAML frontmatter:

```yaml
---
name: skill-name
description: "Use when ..."
---
```

Name rules:

- Use lowercase kebab-case.
- Match the directory name unless there is a strong reason not to.
- Keep it stable; renaming can break references.

Description rules:

- Describe when the skill must be used.
- Include likely user phrases and task categories.
- Be specific enough to avoid false positives.
- Do not describe implementation details better suited for the body.

## Body Structure

A good `SKILL.md` usually includes:

- Purpose and scope
- When to use
- When not to use
- Step-by-step workflow
- Quality checklist
- Project/user-specific conventions, if any
- Verification steps

Prefer direct commands and decision rules over abstract advice.

## Portability Rules

Skills may be used across multiple machines and operating systems.

Avoid:

- Drive-letter paths like `C:\...` or `D:\...`
- User-specific absolute paths
- Shell-specific assumptions unless explicitly required
- Hidden dependency on one local checkout layout

Prefer:

- `~/<repo>` conventions
- Repo-relative paths
- Symlink target discovery
- Asking the user when multiple canonical sources exist

## Quality Rules

A skill should be:

- Focused: one clear domain of behavior
- Triggerable: description makes activation obvious
- Actionable: tells the agent what to do, not just what to value
- Safe: avoids destructive changes without confirmation
- Portable: usable on the user's Windows and macOS machines
- Maintainable: easy to update without reading unrelated context

Avoid:

- Overly broad descriptions
- Duplicating large unrelated instructions
- Embedding secrets, tokens, or private machine paths
- Assuming the runtime install folder is canonical
- Creating nested abstractions without need

## Verification

After creating or editing a skill:

1. Confirm `SKILL.md` exists in the canonical source location.
2. Confirm frontmatter parses visually.
3. Confirm the description matches the intended trigger phrases.
4. Confirm no OS-specific hardcoded paths were introduced.
5. Confirm runtime install/symlink/lockfile updates are done or clearly listed as pending.
6. If possible, inspect the installed skill path and ensure it points to the updated source.

## User-Specific Workflow

For this user's custom skills:

1. Create/edit custom skills in the `agent_skills` repo, normally under `~/Sources/agent_skills` or `~/sources/agent_skills`.
2. The dotfiles repo consumes that repo via its lockfile/install process.
3. When adding a new custom skill, add it to the relevant lockfile/install metadata so dotfiles can pull or pin it.
4. Do not edit the dotfiles-installed runtime copy unless it is the canonical source or the user explicitly asks for a temporary runtime-only change.
