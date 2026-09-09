# pi-session-tree

Every pi session on this machine as a directory → session tree, with enter to
switch this window into the one you pick.

```
▾ ~/sources/agent_skills (1)          Sessions
  ◆ fix the fleet view                ─────────────────────────
  · why is the parser slow            fix the fleet view
▾ ~/sources/ragstudio/raggy
  · investigate raggy api             directory  ~/sources/agent_skills
▸ ~/sources/bencho                    messages   184
                                      last used  2m 14s ago
                                      open in    pi 63186
```

`◆` a session a pi window has open right now · `·` a session on disk.

## Keys

| key | action |
|---|---|
| `↑` `↓` / `j` `k` | move |
| `→` / `l` | expand a directory, then enter the session under the cursor |
| `←` / `h` | leave a session, then collapse its directory |
| `⏎` | same as `→` on a session |
| `^x` / `^r` | hide a row / restore hidden rows (this session only) |
| `esc` | close |

Once you are in a session, `←` on an empty prompt brings the tree back, so the
two arrows are a round trip: `→` in, `←` out. Anything typed in the prompt takes
`←` back for cursor movement.

## Startup view

With no flags, the tree opens when pi starts, so a window begins as a session
picker instead of an empty prompt. `esc` drops you into the editor; `ctrl+g` or
`/sessions` brings it back.

Start pi with `--no-session-tree` to keep the normal empty prompt. The tree only
auto-opens on a real startup (`reason: "startup"`), never after a switch, `/new`
or a fork, so picking a session never bounces you back into the picker.

## What it will not do

- **Enter a session another pi window has open.** A transcript has exactly one
  writer. Those rows show which pid holds them; close that window or switch
  there instead.
- **Show delegated child transcripts.** Sessions named `subagent: …` / `btw: …`
  belong to the window that spawned them.
- **Show pre-cwd sessions.** Sessions written before pi recorded a `cwd` have no
  directory to file them under.

## How it knows what is open

Each window publishes `{pid, owner, cwd, title, sessionFile}` to
`~/.pi/agent/session-tree/<pid>.json` — one writer per file, atomic rename,
unlinked when the window exits or the next reader finds the pid dead. The
session list itself comes from pi's own `SessionManager.listAll()`.

Switching sessions is only possible from a slash-command context, so the
startup view and `ctrl+g` both run `/sessions` rather than opening the view
with a context that could not act on it.
