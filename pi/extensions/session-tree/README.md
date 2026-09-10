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
The `◆` is coloured by what that window is doing — see below.

## Keys

| key | action |
|---|---|
| `↑` `↓` / `j` `k` | move |
| `→` / `l` | expand a directory, then enter the session under the cursor |
| `←` / `h` | leave a session, then collapse its directory |
| `⏎` | same as `→` on a session |
| `⇞` `⇟` | page the detail pane through the conversation |
| `n` | start a new session in the selected directory |
| `d` `d` | first `d` asks in a popup, second `d` deletes the session (`n`/`esc` cancels) |
| `esc` | close |

Once you are in a session, `←` on an empty prompt brings the tree back, so the
two arrows are a round trip: `→` in, `←` out. Anything typed in the prompt takes
`←` back for cursor movement.

## Live rows

Both halves refresh on a one-second tick: the live windows from their published
snapshots, and the session list itself from a rescan, so a row's title, message
count and age follow a transcript that is still being written. Opening the tree
does not pause anything — this window keeps answering behind the overlay, and
every other window is its own process.

## Startup view

With no flags, the tree opens when pi starts, so a window begins as a session
picker instead of an empty prompt. `esc` drops you into the editor; `/sessions`
or left on an empty prompt brings it back.

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

Each window publishes `{pid, owner, cwd, title, sessionFile, state}` to
`~/.pi/agent/session-tree/<pid>.json` — one writer per file, atomic rename,
unlinked when the window exits or the next reader finds the pid dead. The
session list itself comes from pi's own `SessionManager.listAll()`.

Switching sessions is only possible from a slash-command context, so the
startup view and the editor's left-arrow both run `/sessions` rather than
opening the view with a context that could not act on it.

## New sessions

`n` on a row starts a session in that row's directory. In the directory this
window is already in that is pi's own `/new`. Anywhere else it takes two steps —
pi only starts sessions in the directory it is running in, so the tree switches
into a session that lives there first, then runs `/new`. A session another
window holds open is no use as that stepping stone, and when every session in
the directory is held, `n` says so rather than doing something surprising.

## What a row says

The `◆` in front of a live session is that window's state, published with its
snapshot: **yellow** when it has a question on screen and is waiting for an
answer, **accented** while it is working, **green** once it has finished. A
session with no window open keeps a muted `·`. The detail pane spells the same
thing out as `state  input needed`.


A session row is the last thing you asked in it, not the first — a session you
left an hour ago is easiest to recognise by where it ended up. A name set with
`/name` wins over both.

The detail pane shows that session's conversation underneath its metadata:
user prompts and assistant replies only, with tool calls, tool results and
thinking dropped. Page through it with `⇞`/`⇟`. Answers go through pi's own
`Markdown` component and `getMarkdownTheme()`, so they look like they do in the
transcript — headings, lists, and highlighted code blocks, following whatever
theme is active. Prompts stay literal, since markdown would eat the leading
`#` or `-` of a prompt that starts with one. Transcripts are read on demand
for the row under the cursor and cached by mtime, so a session being written to
right now still refreshes.

## Directory rows

Selecting a directory shows a real overview instead of a hint: totals over
its sessions, an activity strip, and — when the directory has one — the
newest entries from its `.agent/JOURNAL.md`.

```
sessions   17 (2 open now)
messages   1284
active     2026-07-19 → 2026-09-11
last used  3h 12m ago

activity   one column per day, last 8 weeks
           ·····▒░··▓·······░······█▓·░········▒▒█··░······▓██▓··▓▓
           56d ago                                            today

journal    3 most recent of 14
           2026-09-10T05:40Z  What chafed running the build loop
           2026-09-10T05:20Z  Skills unduplication: one fact, one
           2026-09-09T20:45Z  Rebuilt the harness around a delega
```

The activity strip is one glyph per day (`·░▒▓█` for 0 / 1-9 / 10-49 / 50-199
/ 200+ messages that day), built from the session rows already in memory —
no extra file reads on the render tick. The journal block reads
`.agent/JOURNAL.md` straight off disk (no dependency on `project-memory`
being installed), taking the last three `## ` headings and showing them
newest first; a directory with no `.agent/JOURNAL.md` simply has no journal
block.

