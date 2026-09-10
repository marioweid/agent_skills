# Recall search + directory overview (session-tree)

status: **partially superseded 2026-09-10.** Only the directory overview shipped. `/recall`
(D1–D8, `src/recall.ts`, `recall.test.ts`) was built and deleted the same day — measurement
showed it reached 2 of 25 session files, 6% of bytes, because child transcripts are excluded
and tool calls are dropped. See `.agent/JOURNAL.md` 2026-09-10T06:40Z.

**Do not copy D7.** It prescribes `pi.sendMessage(..., { deliverAs: "nextTurn" })` as the
house pattern. That renders nothing when invoked from an idle prompt: the `nextTurn` branch
is checked before any streaming check and parks the message until the user's next turn. Use
`{ triggerTurn: false }`. The same bug was copied from `/plan` into this plan and out again;
see `.agent/JOURNAL.md` 2026-09-10T06:40Z.

gate: no

**Summary.** Add `/recall <query>` to the session-tree extension: an in-process scan of the
transcripts it already reads and caches, printed to the transcript as a capped, formatted list.
Replace the static directory guidance in the detail pane with a real overview: totals, a day-per-
column activity strip built from data already in `SessionRow`, and the newest `.agent/JOURNAL.md`
entries read straight from disk with an mtime cache. No new dependencies, no coupling to
project-memory.

---

## 1. Decisions

Do not relitigate these.

**D1 — `/recall` lives in `pi/extensions/session-tree/index.ts`.** It needs `listSessions()`
(already there) and `readConversation()` (already cached there). A sibling extension would
duplicate both and warm a second cache.

**D2 — Search in node, not `rg`.** Measured on the real corpus (20 sessions, 2.37 MB):
`SessionManager.listAll()` = 16 ms, opening and parsing every branch = 8 ms. 24 ms total, once,
warm-cached afterwards. `rg` would need `file-search/src/binaries.ts`, which pulls Effect and a
download path into an extension that has zero dependencies today — and a raw grep over JSONL
matches tool output, thinking blocks and JSON escaping, so the results would need parsing anyway.

**D3 — Corpus is `Turn[]` from `readConversation()`.** User and assistant text only; tool calls,
tool results and thinking are already dropped there. Malformed or half-written transcripts already
degrade to `[]` inside that function, so a broken file cannot fail the command.

**D4 — Matching is a case-insensitive literal substring of the whole query.** One rule, no regex
surface, no word-splitting semantics to explain. Upgrade path if it chafes: AND over whitespace-
separated terms.

**D5 — Scope: `ctx.cwd`, exact string match against `SessionRow.cwd`.** `--all` as the **first
token only** widens to every directory: `/recall --all detail pane`. `/recall foo --all` searches
for the literal `foo --all`. Exact-match (no subdirectory walk) is the same grouping the tree uses.

**D6 — Child sessions (`subagent: …` / `btw: …`) are excluded**, reusing `isChildSession()`.
They are not rows in the tree, so a hit in one is a result the user cannot navigate to.

**D7 — Output goes to the transcript via `pi.sendMessage({customType: "session-recall", content,
display: true}, {deliverAs: "nextTurn"})`** — the exact pattern `project-memory`'s `/plan` uses.
Caps: **3 matches per session, 20 total, 160-char snippet** centred on the hit with newlines
collapsed. Sessions newest-first; matches in message order.

Real output:

```
5 matches in 3 sessions · ~/sources/agent_skills · /recall --all searches every directory

design the recall command · ~/sources/agent_skills · 3h 12m ago
  › …replace the static guidance in the **detail pane** with a real repo overview…
  ‹ …the detail pane renders markdown through pi's own Markdown component, so…
  2026-09-10T05-49-07_01a089dc.jsonl

why is the parser slow · ~/sources/agent_skills · 2d 4h ago
  › …paging the detail pane through a 336-message session takes 54ms…
  2026-09-09T20-40-47_01a087e6.jsonl

… 7 more matches; narrow the query.
2 sessions yielded no readable text (empty or unparsable).
```

**D8 — Error policy.** No query → one usage line, nothing else. Per-session read failure is
tolerable and **counted, never silent**: a session with `messageCount > 0` that yields zero turns
is reported in the trailing line shown above. Nothing in `/recall` is fatal.

**D9 — Activity data comes from `SessionRow`, not from re-parsing transcripts.** Each session's
`messageCount` is bucketed into the local day of its `modified` timestamp. Pure arithmetic over
rows already in memory, ~20 operations, so the 1 s render tick needs no cache for it.
*Ceiling (mark with a `ponytail:` comment):* a session spanning midnight lands entirely on its
last day. Upgrade path: carry a timestamp on `Turn` — `readConversation` already parses entries
that have one.

**D10 — Strip: 56 columns, one per day, glyphs `·░▒▓█`, fixed thresholds** 0 / 1–9 / 10–49 /
50–199 / 200+ messages. Fixed rather than relative so the picture does not re-scale every time a
session is appended to. 56 + an 11-char label gutter = 67 columns, inside the 73 the detail pane
has at a 120-col terminal. Narrower pane → trim from the **left** (keep today).

**D11 — `SessionRow` gains `created: number`** from `SessionInfo.created`, for the "active" line.
One line in `index.ts`, one in the `session()` test helper.

**D12 — Journal extraction.** Read `<node.cwd>/.agent/JOURNAL.md` directly. Entries are `^## `
headings only. The file is append-only newest-at-the-bottom, so take the **last 3 headings in file
order and display them reversed**. Split the heading on the first `—` or ` - `: left is the date,
right is the brief. No dash → brief is the first non-empty, non-heading line of the body,
truncated. No file, unreadable file, or no `##` heading → the journal block is simply absent; no
apology line, nothing else changes. No import from project-memory, ever.

**D13 — Cache keys.** Journal: module-level `Map<path, {mtimeMs, entries}>`, exactly mirroring
`src/transcript.ts:63-67`. Transcript cache unchanged. Activity: uncached (D9). The `rendered`
markdown cache in `view.ts` is untouched — directory rows never reach it.

**D14 — `detailLines()` stays pure and testable**: it takes a 4th parameter
`journal: readonly JournalEntry[] = []`. `view.ts` calls `readJournal(node.cwd)` (cached) for
directory rows and passes the result in. The affordance hints stay at the bottom of the pane.

Rendered directory pane, 120 columns (44 sidebar · `│` · 73 detail):

```
▾ ~/sources/agent_skills (2)                 │ /Users/you/sources/agent_skills      
  ◆ design the recall command                │
  ◆ thin the skills                          │ sessions   17 (2 open now)
  · why is the parser slow                   │ messages   1284
▸ ~/sources/ragstudio/raggy                  │ active     2026-07-19 → 2026-09-11
▸ ~/sources/bencho                           │ last used  3h 12m ago
                                             │
                                             │ activity   one column per day, last 8 weeks
                                             │            ·····▒░··▓·······░······█▓·░········▒▒█··░······▓██▓··▓▓
                                             │            56d ago                                            today
                                             │
                                             │ journal    3 most recent of 14
                                             │            2026-09-10T05:40Z  What chafed running the build loop
                                             │            2026-09-10T05:20Z  Skills unduplication: one fact, one
                                             │            2026-09-09T20:45Z  Rebuilt the harness around a delega
                                             │
                                             │ → to list them.
                                             │ n  to start a new session here.
```

Label gutter is 11 columns, matching the existing session pane (`directory  `, `messages   `).

## 2. Files touched

| Path | New/Mod | What |
|---|---|---|
| `pi/extensions/session-tree/src/recall.ts` | new | Pure `searchSessions(rows, turnsOf, query, opts)` → results + counts, and `formatRecall(results, scope)` → string. ~90 lines, no I/O. |
| `pi/extensions/session-tree/src/overview.ts` | new | `activityCounts()`, `activityStrip()`, `parseJournal()` (pure) and `readJournal()` (mtime-cached read). ~110 lines. |
| `pi/extensions/session-tree/src/view.ts` | mod | `detailLines()` directory branch (198-220) replaced by a call into `overview.ts`; new 4th param (D14); `detailBody()` passes `readJournal(node.cwd)` for directory rows. |
| `pi/extensions/session-tree/src/tree.ts` | mod | `SessionRow.created: number`. |
| `pi/extensions/session-tree/index.ts` | mod | Map `created` in `listSessions()`; register `/recall`; `show()` helper around `pi.sendMessage`. |
| `pi/extensions/session-tree/tree.test.ts` | mod | Update the directory-pane assertion (line 308) and the `session()` helper (line 37). |
| `pi/extensions/session-tree/overview.test.ts` | new | Activity + journal tests. |
| `pi/extensions/session-tree/recall.test.ts` | new | Search + format tests. |
| `pi/extensions/session-tree/package.json` | mod | `test` script → `node --test --experimental-strip-types *.test.ts`. |
| `pi/extensions/session-tree/README.md` | mod | Document `/recall` and the directory pane. |

## 3. Implementation order

Each step leaves the repo green. Commands run from `pi/extensions/session-tree`.

1. **`created` on `SessionRow`** — add the field, map it from `SessionInfo.created.getTime()` in
   `listSessions()`, add it to the test helper. *Verify:* `npm run check && npm test`.
2. **Test script glob** — `package.json` test script runs `*.test.ts`. *Verify:* `npm test` still
   reports the existing tree tests.
3. **`overview.ts` — activity half** — `activityCounts(rows, now, days)` and
   `activityStrip(counts, width)`, plus `overview.test.ts` for them. *Verify:* `npm test`.
4. **`overview.ts` — journal half** — `parseJournal(text)` and mtime-cached `readJournal(cwd)`;
   tests use a temp dir. *Verify:* `npm test`.
5. **Wire the directory pane** — `detailLines()` directory branch calls into `overview.ts`;
   `detailBody()` supplies the journal; update the tree.test.ts assertion. *Verify:* `npm run check
   && npm test`, then open pi, `/sessions`, put the cursor on a directory row: strip, totals and
   (in this repo) three journal lines appear; a directory with no `.agent/` shows the same pane
   minus the journal block.
6. **`recall.ts`** — pure search + format with `recall.test.ts`. *Verify:* `npm test`.
7. **Register `/recall`** — wire in `index.ts`. *Verify:* in pi, `/recall detail pane` prints hits
   for this repo; `/recall --all detail pane` prints more; `/recall` prints the usage line;
   `/recall zzzznope` prints "no matches".
8. **README + journal entry**, then the repo gate. *Verify:* `node pi/check.mjs` from the repo root
   and `npm run check` from `pi/extensions`.

## 4. Tests

`overview.test.ts`
- *"a quiet day is a dot and a busy day is a block"* — catches inverted or off-by-one glyph
  thresholds.
- *"the glyph steps with message volume"* — 0/5/25/120/400 → `·░▒▓█`; catches threshold drift.
- *"a session's messages land on the day it was last touched"* — catches UTC/local bucket errors
  and off-by-one day indexing.
- *"a narrow pane trims the oldest days, never today"* — catches trimming from the wrong end.
- *"a directory with no sessions renders without a strip and without throwing"* — the empty case.
- *"the three newest journal entries come back newest first"* — catches reading the file top-down
  when the convention is append-at-the-bottom.
- *"a heading with no summary falls back to the first body line"* — catches a blank second column.
- *"a missing, unreadable, or heading-less JOURNAL.md yields no entries"* — the degrade path.
- *"a journal edited on disk is re-read"* (write, read, rewrite with a bumped mtime, read again) —
  catches a cache that never invalidates.

`recall.test.ts`
- *"a hit reports title, directory, age and transcript"* — the four things needed to find the row.
- *"matching is case-insensitive and literal"* — a query containing `.` and `*` must not behave as
  a regex.
- *"tool output and thinking never match"* — feed entries through `conversationFrom` and assert a
  tool-result string is not findable.
- *"matches are capped per session and overall, and the overflow is counted"* — catches an
  unbounded dump into the transcript.
- *"sessions that yield no readable text are reported, not dropped"* — the D8 error policy.
- *"`--all` widens scope only as the first token"* — `/recall foo --all` is a literal search.
- *"child sessions are never searched"* — D6.

`tree.test.ts` — the existing directory-pane assertion is updated to the new lines; everything else
must pass untouched, which is the regression check for the tree itself.

## 5. Risks

- **The 1 s render tick.** The only new I/O on that path is one `statSync` per directory row under
  the cursor, guarded by the journal mtime cache — same discipline as transcripts. Find out early:
  step 5's manual check with the cursor parked on a directory for a minute; if the pane stutters,
  the cache key is wrong.
- **Large sessions.** `/recall` scans cached `Turn[]`; the cold pass over the whole corpus measured
  24 ms. A 10× corpus is ~250 ms in a command handler, still fine. If it ever is not, the cap is
  already in the formatter, not the scan.
- **A session being written right now.** `readConversation` catches parse failures and returns
  `[]`, so a torn final line degrades to "no hits in that session" — and D8 counts it. Pre-existing
  behavior, not a new regression.
- **`SessionRow.created` is a required field.** `tsc --noEmit` finds every construction site; if a
  site is missed the build fails loudly rather than shipping `NaN` dates.
- **Glyph width.** `·░▒▓█` are all single-width; the strip is still built with the pane width in
  hand and passed through the existing `truncateToWidth`, so a wide-glyph font cannot break layout
  beyond truncation.
- **Recall output enters the LLM context** (`sendMessage` with `display: true`). The caps keep it
  to roughly 40 lines. See the open question.

## 6. Out of scope

- Any in-tree search UI or `/` filter — explicitly rejected by the user.
- Any index, SQLite, FTS, or persisted search cache. 24 ms does not earn one.
- `rg`/`fd` binary resolution inside session-tree (D2).
- Per-message-timestamp activity, multi-day session spans, streaks, per-author or per-model
  breakdowns (D9 ceiling).
- Reading `.agent/PLAN.md`, TODOs, or git history into the pane. Journal only.
- Any dependency on project-memory being installed, and any change to it.
- Result ranking, fuzzy matching, regex queries, date filters, `--limit`.
- Making the activity window, glyph set, or entry count configurable.

## 7. Resolved by the user (do not relitigate)

- **`/recall` output goes into the LLM context.** Confirmed: `sendMessage` as in D7. The point is
  that the agent can act on the hits, so the token cost is the feature. Keep the 3-per-session /
  20-total caps that make it affordable.
- **Subagent/`btw:` transcripts are NOT searchable.** Confirmed: D6 stands. Results match what the
  tree shows; no flag, no exception.
