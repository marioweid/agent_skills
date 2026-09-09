# pi extensions

Vendored from [davis7dotsh/my-pi-setup](https://github.com/davis7dotsh/my-pi-setup)
(MIT), plus local changes. `~/.pi/agent/extensions` is a symlink to this
directory — pi resolves imports and `node_modules` from the real path, so the
whole directory must be symlinked, not the individual extensions.

```sh
cd ~/Sources/agent_skills/pi/extensions && npm install --ignore-scripts
ln -s "$PWD" ~/.pi/agent/extensions
```

| extension | what it does |
|---|---|
| `subagents` | `subagent_spawn` / `_wait` / `_check` / `_cancel` / `_list` on three harnesses (pi in-process, Claude Code, Codex CLI). Max 4 concurrent. `/subagents` for this window's live view and takeover, `/btw` to message a running child. |
| `session-tree` | `/sessions` (left on an empty prompt, and the startup picker): every pi session on the machine, each live one dotted yellow/accent/green for waiting-on-you, working, done. |
| `ask-user` | `ask_user` — 2–5 option multiple-choice popup, with a free-text escape hatch. |
| `file-search` | `fd` and `rg` as model tools. |
| `workflows` | `workflow` — sandboxed JS orchestration scripts. `/workflows`. |
| `model-info` | Publishes model + token usage to the footer channel. |
| `git-info` | Publishes branch / changed files / PR to the footer channel. `/lg`, `/pr`. |
| `ui-customization` | Renders the header and footer from the two channels above. |
| `notify` | Desktop notification + chime when a run settles. |
| `shared` | Library code for the above; not an extension. |
| `00-vertex-env.ts` | Machine-specific Vertex credentials. Gitignored. |

## Local changes

### Agent roles (`subagents/src/agents.ts`)

`subagent_spawn` takes an optional `agent` naming a role file in
`~/.pi/agent/agents/*.md`:

```yaml
---
name: critic
description: Adversarial final reviewer. Writes no code.
tools: read, grep, find, ls, bash
model: anthropic-vertex/claude-opus-5
thinking: high
---

You are an adversarial critic. ...
```

Both YAML list forms work for `tools` (inline `read, grep` or a `- read` block).
The body becomes the child's prompt preamble; `model`, `thinking`, and `tools`
become its defaults. An explicit `model` or `reasoning_effort` on the call wins.

`tools` is a hard allowlist that only the pi harness can enforce, so spawning a
tools-restricted role on `claude` or `codex` is refused with an error rather
than run unrestricted. A `tools:` key that parses to nothing is a load error,
never "all tools" — a permission control must not fail open. Files that fail to
load are reported on session start instead of silently vanishing from the
roster.

pi's `createAgentSession` has no `systemPrompt` option, so the role arrives as
the head of the child's first user message rather than as a system prompt. For
a headless one-shot child that is equivalent.

Tests: `node --test --experimental-strip-types subagents/agents.test.ts`

### Working directory in the views (`subagents/src/ui/takeover.ts`)

`subagent_spawn` takes a `working_dir`, so children routinely run in different
directories, but neither the `/subagents` dashboard nor the takeover header
showed it. Both now render a shortened cwd (`~/src`, `…/parent/dir`).

Scope: one pi process. Use `/fleet` for the cross-window view.

### Session tree (`session-tree/`)

`session-tree` owns the cross-window view: `/sessions`, or left on an empty
prompt, or the picker pi opens at startup. It manages sessions and nothing
else — directory → session, with each live window's state on its glyph:

```
  ▾ ~/src/api (2)                │ rewrite the auth middleware
    ◆ rewrite the auth middlew…  │
    · fix the flaky test         │ directory  ~/src/api
  ▾ …/work/frontend              │ messages   84
    ◆ port the design system     │ state      input needed
 ──────────────────────────────────────────────────────────────
  ↑↓ move · →/⏎ enter · ← back · ⇟⇞ read · n new session · dd delete · esc close
```

A row is the last thing you asked in that session, so you recognise it by
where it ended up. The `◆` of a live window is **yellow** while it waits for an
answer, accented while it works, **green** when it is done. The detail pane
shows that session's conversation — prompts and replies only, answers rendered
with pi's own markdown and code highlighting.

| key | what it does |
|---|---|
| `⏎` on a session | switches this window into it; refused if another window has it open |
| `n` | starts a new session in the selected directory |
| `⇞` `⇟` | pages the detail pane through that session's conversation |
| `dd` | deletes the selected session (see below) |

`n` in the directory you are already in is pi's own `/new`. Elsewhere it is two
steps: switch into a session that lives there — pi can only start a session in
the directory it is running in — then `/new`. If every session there is held by
another window, it says so instead.

`dd` removes, vim-style: the first `d` raises a confirm popup inside the tree,
the second `d` (or `⏎`) deletes. `n` or `esc` cancels, and every other key just
dismisses the popup, so a stray `d` never deletes. The row disappears in place;
the view never closes and the window is never rerouted.

| row | `dd` |
|---|---|
| session with no live writer | confirm popup, then delete the transcript and its artifacts from disk |
| session a pi window has open | refused with a reason — never delete a transcript being written to |
| a directory | refused with `Nothing to remove on this row.` |

Every outcome writes a line to the footer. The view opens on the session you
are in, which is the row that refuses deletion, so a silent no-op there is
indistinguishable from a broken key.

**Not ctrl+x.** pi binds ctrl+x to `app.message.copy` and handles it before a
focused overlay sees it, so it silently copies a chat message instead of
reaching the view. There is a regression test asserting ctrl+x changes nothing
here.

Storage is one JSON file per process at `~/.pi/agent/session-tree/<pid>.json`,
written by atomic rename, so there is nothing to lock. A window deletes its
file on shutdown; one that is killed leaves a file behind and the next reader
unlinks it after checking the pid. A random `owner` id per process, not the
pid, decides "is this mine", because the OS recycles pids.

Tests: `node --test --experimental-strip-types --no-warnings session-tree/tree.test.ts`
(46 tests, including a harness that presses real key bytes at the component).

### TUI guards (`model-info`, `git-info`)

Both captured an `ExtensionContext` and read it from a refresh listener. Every
headless subagent loads them too, and their ctx goes stale on child teardown,
which surfaced as `This extension ctx is stale after session replacement`. Both
now bail when `ctx.mode !== "tui"`, matching what `ui-customization` already did.

### notify

Pi's bundled `examples/extensions/notify.ts` plus a chime, a 20s minimum
duration, and one rule: the bell waits for the *whole* turn. A settled main
thread is not enough, because delivering a subagent result wakes the agent for
another run — so ringing on every settle fires mid-fan-out. `subagents`
publishes its running count on the `subagents:activity` event channel, and the
bell rings only when the main thread is idle *and* no child is still working.
Adjust `MIN_RUN_MS` in `notify/index.ts`.

## Not vendored

`background-terminals`, `copy-all`, `firecrawl-search`, `summaries`,
`spark-strict-tools`.
