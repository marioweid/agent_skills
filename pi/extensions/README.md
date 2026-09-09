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
| `subagents` | `subagent_spawn` / `_wait` / `_check` / `_cancel` / `_list` on three harnesses (pi in-process, Claude Code, Codex CLI). Max 4 concurrent. `/subagents` for this window's live view and takeover, `/fleet` for every window's, `/btw` to message a running child. |
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

### `/fleet` — cross-window session browser (`subagents/src/fleet/`)

`/subagents` only knows this process's children. `/fleet` is a tree of every pi
session on the machine:

```
  Fleet  2 running · 3 live sessions · 9 directories
 ──────────────────────────────────────────────────────────────
  ▾ ~/src/api (2)                │ rewrite the auth middleware
    ▾ rewrite the auth middlew…  │
      ● implementer              │ state     this window
      ● migrate                  │ directory /Users/me/src/api
    · fix the flaky test         │ messages  128
    · add rate limiting          │ modified  3m 12s ago
  ▾ …/work/frontend              │ file      ~/.pi/agent/sessions/…/a.jsonl
    ▸ port the design system     │ agents    2
    · (empty session)            │ uptime    1h 4m
 ──────────────────────────────────────────────────────────────
  ↑↓ move · →← nest · ⏎ open · n new · ^x remove · esc close
```

Three levels: **directory → session → agent**. `→` expands a node or steps into
it, `←` collapses or steps back out. `▸`/`▾` mark a live session, `·` marks
history, and `←` in the sidebar marks the session you are sitting in.

Sessions come from `SessionManager.listAll()`, labelled by their name or
opening message. A live window and its transcript collapse into one row rather
than appearing twice.

**`⏎`** depends on the row:

| row | ⏎ |
|---|---|
| own agent | opens the takeover view |
| session, nothing has it open | switches this window into it |
| session, open in another window | refused — two pi processes writing one transcript would corrupt it |
| session you are already in | says so |
| directory | expands it |

**`^x`** removes the selected row:

| row | ^x |
|---|---|
| own agent, settled | forgotten for real — gone from `/fleet` and `/subagents` |
| own agent, running | confirm, then abort and forget |
| session, nothing has it open | confirm, then delete the transcript and its artifacts from disk |
| session that is live or is yours | hidden only; never deletable while a pi is writing to it |
| another window's row, or a directory | hidden locally; its owner would republish it within the second |

Hidden rows are session-scoped: `^r` restores them, and so does restarting pi.
Hiding a busy row also clears the running badge its parents showed for it.

**`n`** starts a new subagent in the selected directory — role picker, then a
task prompt. The child belongs to this window wherever it works.

**Storage** is one JSON file per process, `~/.pi/agent/fleet/<pid>.json`,
written by atomic rename. Every file has exactly one writer, so there is
nothing to lock — a reader sees either the previous complete file or the next
one. A window deletes its file on shutdown; one that is killed leaves a file
behind, and the next reader unlinks it after checking the pid. A random
`owner` id per process, not the pid, decides "is this mine", because the OS
recycles pids.

Writes are coalesced onto a 1s trailing timer: the manager notifies on every
streamed token, and synchronous disk I/O in that hot path would stutter the UI.
Publishing is best-effort — a failure removes this window from the fleet and
notifies, rather than taking subagents down.

Tests: `node --test --experimental-strip-types --no-warnings subagents/fleet.test.ts`
(includes a four-process concurrent publish/read test).

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
