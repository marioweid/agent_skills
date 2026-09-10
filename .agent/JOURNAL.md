# Journal — agent_skills

Append-only. Newest at the bottom. One entry per meaningful decision or outcome.

## 2026-09-09T20:45Z — Rebuilt the harness around a delegating build loop

[DECISION] Reads parallelise, writes never. Any number of read-only `scout`s run at
once; exactly one `implementer` ever writes. This follows the 2026 reconciliation of
the multi-agent debate (Cognition's single-threaded-writes position plus Anthropic's
parallel-read evidence) rather than a swarm or an agentic router.

[DECISION] The human is asked by the main thread only. Subagents cannot call
`ask_user` by design, so clarifying questions happen in phase 2 of the loop, driven by
the scouts' `unknowns`. This replaced the `brainstorming` skill, which was deleted.

[DECISION] Gate on risk, not on every plan. The architect self-declares `gate: yes` for
schema, API, architecture, security, migration, and destructive work; everything else
proceeds without stopping.

[DECISION] Per-repo memory is plain markdown (`.agent/PLAN.md`, `.agent/JOURNAL.md`,
`.agent/plans/*.md`) with one small extension that injects the `## Now` block into the
system prompt. No database, no new model-facing tools — agents edit the files directly.

[OUTCOME] Six Claude-Code-era roles replaced by five pi-native ones (scout/architect/
implementer/reviewer/scribe) with per-role model tiers: haiku for recon and recording,
sonnet for implementation, opus for planning and review. Deleted `pipeline/`,
`opencode/`, the `workflows` extension, and `~/AGENTS.md`; merged the standards into one
95-line `standards/AGENTS.md`. Always-on context dropped from ~14.6k to ~9k tokens.

[DISCOVERY] `pi/settings.json` in this repo is a deliberately sanitized portable
snapshot (openai-codex models) guarded by `pi/check.mjs`; the live machine runs
anthropic-vertex. That divergence is intentional and must not be "fixed" by syncing.

## 2026-09-10T05:20Z — Skills unduplication: one fact, one owner

[DECISION] Three repository layers now each own exactly one type of fact:
1. `standards/AGENTS.md` — policy (tools, standards, hard limits, build loop)
2. `pi/agents/*.md` — agent behavior and role-specific rules (pi-only)
3. `skills/*/SKILL.md` — only non-derivable facts: version-specific config, supply-chain
   pins, post-cutoff library surfaces, idiosyncratic conventions

This resolves contradictions that arose when all three layers stated overlapping rules
(most sharply: test policy was "always, no exceptions" in one skill but "non-trivial
logic only" in the agent prompts and ponytail package).

[OUTCOME] Pruned 25 → 19 skill directories. Deleted 6 fully duplicated skills
(`karpathy-guidelines`, `verification-before-completion`, `writing-plans`,
`executing-plans`, `python-design-patterns`, `architecture-blueprint-generator`).
Thinned 4 language skills from ~28k words to 182 lines total, applying a retention test:
"Would a current strong model produce this unprompted and correctly? Yes → cut it."
Fixed stale paths and removed pi-only imports from generic skills.

[DISCOVERY] Token cost of always-on skill descriptions (~1.6k) was never the problem.
The problem was conflicting instructions. Three language skills now differ only in
version pins and supply-chain audit (deny-list, lock file location). That is reusable
across harnesses; the old prose style (philosophy, pedagogy) is not.

## 2026-09-10T05:40Z — What chafed running the build loop for real

[DISCOVERY] The prune was the first feature taken end to end through scout → implementer
→ reviewer → scribe. Two failure modes, both in the bookend roles:

1. **The scribe dropped state.** Rewriting `## Now` in PLAN.md, it kept the one item the
   brief discussed and silently deleted three unrelated open TODOs. A rewrite of a memory
   file must be additive by default — the brief names what changed, not what to keep.
2. **The scribe cited an artifact that never existed** (`.agent/plans/2026-09-10-*.md`),
   because the loop's shape implies an architect ran. Here the architect was deliberately
   skipped: the design was already settled by two `ask_user` answers, so a planning
   round-trip would only re-derive it. Roles infer missing steps happened.

[DECISION] Skipping the architect when the design is already pinned was correct and worth
keeping — but downstream roles must be told which steps did not run. Both errors were
caught by verifying the scribe's own report against the files; neither was self-reported.

[DISCOVERY] The reviewer earned its slot. It found a truncated clippy deny-list (three
`deny` entries dropped from a config block presented as copy-ready) that both the
implementer and a diffstat read would miss. Zero blockers, four real should-fixes.

## 2026-09-10T06:05Z — Session-tree extension: `/recall` search and directory overview

[DECISION] Rejected pi-hermes-memory (npm, 1.1 MB, better-sqlite3, background writes
every 10 turns) despite its session-search feature because it:
1. Duplicates `pi/extensions/project-memory/`, which already injects `.agent/PLAN.md`'s
   `## Now` into the system prompt.
2. Background writes every 10 turns churn the system prompt suffix and break the
   provider prompt cache that project-memory deliberately protects with byte-stable,
   mtime-cached output.
3. `better-sqlite3` is a native addon against Homebrew pi — documented ABI-mismatch risk.
4. Writes its own `skills/<slug>/SKILL.md` into a repo whose entire purpose is managing
   skills (design violation).
5. A SQLite blob contradicts the repo's file-based-state standard.

Instead built the one missing capability — cross-session search — natively in ~200
lines with no dependencies: `SessionManager.listAll()` 16 ms + parsing 17 sessions /
2.0 MB in 8 ms.

[OUTCOME] `/recall <query>` performs in-process substring search (case-insensitive
literal) across session transcripts, scoped to cwd or `--all` for every directory. Caps:
3 hits per session, 20 total, 160-char snippets. Excludes subagent and `btw:` runs.
Output injected via `pi.sendMessage` to match project-memory's `/plan` pattern.

Directory-row overview in the tree detail pane replaced static guidance with:
session/message totals, active date range, 56-column activity strip (`·░▒▓█` at fixed
thresholds), and three newest `.agent/JOURNAL.md` entries. Zero coupling to
project-memory; reads journal straight from disk behind mtime cache; works with `.agent/`
entirely absent.

Files: new `src/recall.ts`, `src/overview.ts`, `*.test.ts` suite; modified `index.ts`,
`src/view.ts`, `src/tree.ts`, `package.json` (test glob), `README.md`. 77/77 tests pass,
`tsc --noEmit` clean, `pi/check.mjs` PASS.

[DISCOVERY] The review found a production dead-code path: `view.ts` passed fixed
`ACTIVITY_DAYS` (56) instead of pane width to `activityStrip`, so the left-trimming
branch never ran while its unit test — calling the pure function directly — stayed green.
On terminals under 114 columns, the graph inverted: oldest days shown, today hidden.

Three tests could not fail (mutation-tested): total-hit cap, an empty-cwd guard that
was assertion theater, and a long-query snippet clamp whose uniform-string fixture made
clamped and unclamped windows byte-identical. Rewritten with non-degenerate inputs; each
verified red under mutation. Lesson: a test calling a pure function directly proves the
function works, not that production calls it right; never test a clamp with a string
whose clamped window is identical to the unclamped one.

## 2026-09-10T06:40Z — `/recall` deleted the day it shipped; measurement beat the design

[DECISION] Removed `/recall` entirely (`src/recall.ts`, `recall.test.ts`, the command
registration, the README section). The directory-row overview from the same change stays.
Suite 77 → 65, `index.ts` net +1 line against HEAD.

The feature worked exactly as specified and was still worthless, which is the part worth
recording. Two decisions taken separately compounded:

1. D6 excluded `subagent:` / `btw:` transcripts. I asked, the user said no, and neither of
   us had numbers.
2. `transcript.ts` drops tool calls, results and thinking — a pre-existing choice that is
   right for the tree's detail pane and wrong for a search corpus.

Measured after the fact, on the corpus that this very task produced:

    files 25 (23 subagent/btw, excluded from /recall)
    on disk 4.17 MB · searchable prose 0.25 MB = 6%

`/recall` was searching **2 sessions**. Terms from this task — `view.ts` 9 sessions,
`ponytail` 9, `npm test` 7, `activityStrip` 6 — were nearly all in the excluded 23. The
user's six consecutive `No matches.` were the feature behaving as designed.

The build loop delegates hard, so subagent transcripts will always dominate this corpus.
Any future search over sessions must include them or it is searching the wrong 6%.

[OUTCOME] `.agent/JOURNAL.md` remains the answer for "why did we decide X" — ~90 curated
lines beat 0.25 MB of chatter. The niche `/recall` could have owned, "what was that thing
we tried", lives in exactly the files it excluded.

[DISCOVERY] Two bugs found only by running the command, after two review rounds that
both "verified against the real corpus" by calling `searchSessions()` from a scratch
script:

`pi.sendMessage(..., { deliverAs: "nextTurn" })` renders nothing when invoked from an idle
prompt. In `agent-session.js:1109` the `nextTurn` branch is checked before any streaming
check and parks the message in `_pendingNextTurnMessages`, which only drains at line 910
when the user sends their next prompt. `{ triggerTurn: false }` is the correct option: it
falls through to `_appendCustomMessage`, which emits immediately when idle and defers to
end-of-turn when streaming. **`project-memory`'s `/plan` had the same bug** and has been
fixed too — the plan copied it as a known-good idiom and propagated it.

This is the third instance in one task of the same failure: exercising logic directly
instead of through the path production uses. It caught the `activityStrip` width bug, the
three theatre tests, and now the delivery mode. Reviews here should run the command.

[DISCOVERY] `~/.pi/agent/extensions/` and `pi/extensions/` are the same directory. Edits
are live; no install step exists, only a pi restart. (Correction made 2026-09-10T07:50Z:
this is a **symlink**, not a hardlink as first recorded. BSD `stat -f %i` does not follow
symlinks, so comparing inodes on the two paths reports them as different files. Use
`readlink`, or `stat -L`, to test this.)

## 2026-09-10T07:15Z — Installed `pi-review`; `pi install git:` drags in 184 MB of dead peer deps

[DECISION] Installed `git:github.com/earendil-works/pi-review` as-is, changing nothing in
our own review setup. It is complementary rather than duplicative, so a week of real use
decides whether to merge it with the `reviewer` role or keep two lanes.

Unlike `pi-hermes-memory`, this one clears the bar: one 1636-line file, MIT, from the pi
authors, `dependencies: {}`. It branches the current session at the first user message via
`ctx.navigateTree(..., { label: "code-review" })` — fresh context, same session file — then
`/end-review` navigates back offering return / summarize / queue-the-fixes.

Collision check came back clean: commands `review` and `end-review` do not touch ours
(`plan`, `lg`, `pr`, `sessions`); widget key `review` is free because **we use no widgets**;
it listens to `session_tree`, which none of our extensions do.

[DISCOVERY] `pi install git:...` runs `npm install`, and npm 7+ auto-installs
`peerDependencies`. pi-review correctly declares the core packages as peers with `"*"`
(per docs/packages.md:171, pi bundles and injects them), but npm resolved
`@earendil-works/pi-coding-agent: "*"` to **0.75.3** and pulled aws-sdk, protobufjs and
undici behind it: **184 MB and a 9-vulnerability audit report (1 critical) for a 54 KB
extension**.

Verified the tree is inert rather than trusting the doc: hid
`node_modules/@earendil-works`, confirmed pi still loads the extension with empty stderr,
and separately confirmed `-p` headless mode really does load extensions (project-memory's
system-prompt block is present in `pi -p`) so the test meant something. Then deleted
`node_modules` outright — **184 MB → 356 KB**, still clean.

So the audit output was entirely about code that never loads. Two lessons for the next
package: audit *before* install, not after (our own standard, and I broke it); and a scary
`npm audit` on a pi package is probably phantom peer-dep resolution — check whether the
tree is reachable before reacting to it.

Caveat recorded: `pi update --all` re-runs `npm install` and will restore the 184 MB.

[DISCOVERY] Two things in pi-review's rubric we lack and should steal whichever way the
trial goes: a mandatory **Human Reviewer Callouts** closing section (migrations,
dependency/lockfile churn, auth changes, destructive ops, feature flags, config defaults —
nearly our AGENTS.md gate list) and an **untrusted-input** section (unparametrized SQL,
open redirects, SSRF via the DNS resolver, escape-don't-sanitize). `pi/agents/reviewer.md`
has no security content at all.

One genuine conflict to watch: its fail-fast rule flags catch blocks returning
`null`/`[]`/`false`, while our AGENTS.md mandates collecting per-item failures over
aborting a batch — and `overview.ts:154` / `transcript.ts:83` return `[]` on read failure
by design (plan D12), blessed by our own reviewer. Expect pi-review to flag both.

[DISCOVERY] `REVIEW_GUIDELINES.md` is only read from a directory that also contains a
`.pi/` dir, walking upward from cwd. This repo has `pi/`, not `.pi/`, so the walk escapes
to `$HOME` and would load a global `~/REVIEW_GUIDELINES.md`. Repo-local guidelines here
need an `agent_skills/.pi/` directory first.

## 2026-09-10T07:50Z — `.pi` vs `.agent` stays split; Claude Code's links had rotted

[DECISION] `.agent/` and `.pi/` stay separate directories. They have different owners:
`.pi/` is pi's reserved namespace — `settings.json`, `extensions/`, `skills/`, `prompts/`,
`themes/`, `SYSTEM.md`, loaded only after the project is trusted (docs/security.md:11).
`.agent/` is ours: plain markdown, no schema, harness-agnostic.

Merging them would answer this repo's own standing question — "should Codex/Claude Code
support `.agent/` too?" — permanently as no. Keeping project memory outside a
harness-owned namespace is the whole point.

This repo's `.pi/` holds only `.gitkeep`, existing solely so pi-review's guideline loader
(which walks up looking for a directory containing both `.pi/` and `REVIEW_GUIDELINES.md`)
stops here instead of escaping to `$HOME`. Noted as a wart, kept because the alternative
is a global `~/REVIEW_GUIDELINES.md` leaking into every repo.

[DISCOVERY] Checking that turned up real rot in the Claude Code half of the link setup that
README.md documents. All three entries were wrong:

- `~/.claude/CLAUDE.md` → `spielwiese/dotfiles/claude/CLAUDE.md` — **broken**, so Claude
  Code was running with no global standards at all.
- `~/.claude/agents` → `agent_skills/pipeline/agents` — **broken**, stale from before the
  `pipeline/` → `pi/` rename.
- `~/.claude/skills` was a real directory of 35 per-skill symlinks, not a link to `skills/`.
  15 were valid; **20 were broken** — 9 pointing at skills the 2026-09-10 prune deleted,
  11 at `spielwiese/dotfiles/.agents/skills/` and `~/.agents/skills/mongodb-*` targets that
  no longer exist. Verified every external target was already dead before removing it, so
  nothing was lost.

Fixed all three to the symlinks README.md:107-109 prescribes; `~/.claude/skills` now
resolves to the same 15 skills pi sees. The old directory went to trash, not `rm`.

This matters because `subagent_spawn` offers a `claude` harness: any subagent delegated
there was running without this repo's standards, role files, or current skill set. Worth
re-checking after every rename in this repo — a symlink farm fails silently, and nothing
in `pi/check.mjs` validates the links.

`~/.codex/` does not exist, so README.md:109 is moot until Codex is installed.

## 2026-09-10T08:20Z — Rejected `pi-web-access`; the standards were mandating tools pi cannot have

[DECISION] Did not install `pi-web-access` (7.3 MB, 9 real dependencies, 25 search
providers). The gap it fills is already covered: the `claude` subagent harness has
`WebSearch` and `WebFetch` natively, verified by probing a live claude subagent for its
tool list. Delegating a research question there costs nothing and adds no dependency.

What we would actually have used is `web_search`. GitHub cloning is `git clone --depth 1`,
URL fetch is `curl`, and YouTube/video/PDF understanding plus 24 of its 25 providers are
things this repo will never touch. Also carries opt-in browser-cookie access to Gemini Web
and a configurable SSRF-preflight bypass — off by default, but code that would be loaded.

[DISCOVERY] `standards/AGENTS.md` was instructing every agent to use Context7 MCP and Exa.
**pi has no MCP support at all** — `docs/usage.md` states it "intentionally does not
include built-in MCP, sub-agents, permission popups, plan mode, to-dos, or background
bash." Confirmed from a clean pi session in `/tmp`, whose entire toolset is:

    read, bash, edit, write, ask_user, fd, rg, subagent_*

`fd` and `rg` are our own file-search extension — local search, not web. So that paragraph
had been dead in every pi session since it was written, and only ever worked in Claude
Code, where `context7` was configured. Meanwhile the standing instruction to "look up the
current stable version, never recall it from memory" had no working method behind it.

Rewrote the section as "Looking things up": installed copy first (`node_modules`, the
Cellar path, the package's own `docs/` and `.d.ts`), then the tool's own `--help` /
`npm view`, then `curl registry.npmjs.org/<pkg>/latest` for JSON rather than HTML, and
delegate to a `claude` subagent when the open web is genuinely required. That is exactly
the sequence used to evaluate all three packages today; the standard now matches practice.

Dropped Context7 on the user's call — unused in practice, impossible in pi, and the
community enthusiasm has faded. Removed from `~/.claude.json` (backup at
`~/.claude.json.bak-context7`); `obsidian` remains.

[DISCOVERY] Leaked a live Context7 API key into the session transcript by printing
`~/.claude.json` wholesale while checking MCP configuration. Sessions are plaintext JSONL
under `~/.pi/agent/sessions/`, so the key is on disk in at least two places now. Added a
rule to the standards: never paste a credential-bearing config into a transcript; grep the
one field, or redact before printing. Key needs revoking at context7.com regardless of the
server entry being removed.

## 2026-09-10T08:45Z — Built the `web` extension; pi no longer needs another harness

**Supersedes the 20:15Z entry above.** That one rejected `pi-web-access` on the grounds that
the `claude` subagent harness already provides `WebSearch`/`WebFetch`, so delegating research
there costs nothing. That reasoning is dead: the owner is removing Claude Code, and
`standards/AGENTS.md` now says never to delegate a lookup to another harness. The rejection
stands, but for the reason below — not the one recorded at 20:15Z.

[DECISION] Rejected `pi-web-access` (7.3 MB, 9 loading dependencies, 25 search providers,
opt-in browser-cookie access to Gemini Web, configurable SSRF-preflight bypass) and wrote
the capability instead. Tested before deciding rather than assuming:

    html.duckduckgo.com/html/?q=   200, 10 parseable results   <- use this
    lite.duckduckgo.com            202 challenge
    bing.com/search                200, heavier markup
    google.com/search              302, blocked

A browser-like `User-Agent` is required or DuckDuckGo refuses. No API key, no account.

Twenty-five providers is not twenty-five features — it is one feature with twenty-four
fallbacks, insurance against a fragility we have not hit. If DDG scraping breaks twice in a
month, revisit; the answer then is one API key, not a provider matrix.

[DECISION] Built it as an **extension registering tools**, not a script and not a skill.
A script needs the agent to know it exists, which means a line in AGENTS.md — exactly the
mechanism that just failed silently for Context7. A registered tool appears in the model's
tool list automatically. `pi/extensions/web/`: `web_search` and `web_fetch`, zero
dependencies, Node 22 global `fetch`, `typebox` for parameters (a pi-bundled core package,
so still no install). Deliberately NOT modelled on `file-search`, which drags in Effect.

18 tests against a saved real DuckDuckGo fixture plus hand-built edge cases; three
mutations proved they can fail (redirect decoding, script/style content dropping, and
line-boundary truncation).

[DISCOVERY] Verified through the production path myself rather than trusting the report —
stubbed `pi.registerTool`, captured the two tools, and called their `execute` against the
live network. All three checks passed: search returned real decoded URLs, fetch returned
readable text, and `file:///etc/passwd` was refused with a named-scheme error. This is the
habit the `/recall` failure earned: the implementer's own "live" check exercised helper
functions, not the registered tool.

[OUTCOME] Standards updated. `standards/AGENTS.md` had just been rewritten to say "pi has
no web tools… delegate to a `claude` subagent"; that is now false and is replaced by the
real tools plus "Never delegate a lookup to another harness; this setup is pi-only." The
pi-only item in `## Next` is unblocked — nothing functional depends on Claude Code now.

Third time today the standards described a world that did not exist (Context7 MCP that pi
cannot host, a `/plan` delivery idiom that never rendered, a claude escape hatch being
removed). Standards that name specific tools rot silently; when a capability changes, grep
`standards/AGENTS.md` in the same change.

## 2026-09-10T09:05Z — Rejected `pi-codex-goal`; took its completion contract

[DECISION] Did not install `pi-codex-goal` (5,864 lines of src, 0 deps, MIT). It stores a
session-scoped goal — objective, status, token budget, usage — in session custom entries
and **auto-continues** after compaction, re-injecting a prompt until the goal completes or
the budget is exhausted. Four reasons against:

1. It is the third answer to "what are we trying to achieve", after `.agent/PLAN.md`'s
   `## Now` and `.agent/plans/<slug>.md`. Same shape as the hermes-memory problem.
2. Auto-continuation is opposed to the build loop, which gates at Clarify and Gate on
   purpose. Its `/create-goal` prompt even forbids the agent from accepting "out of scope"
   as done — good discipline, wrong owner. That judgement is the user's, not a timer's.
3. The complexity is self-inflicted. Roughly 1,700 of those lines are `recovery-machine`,
   `stale-queued-work-reducer`, `stale-queued-work-obligations`, `goal-transition` and
   `queued-goal-work` — machinery for surviving compaction, fork and tree navigation.
   `project-memory` does *cross-session* persistence in **304 lines** because a file on disk
   does not get compacted. Choosing session entries as the store is what buys the state
   machine.
4. It drives the session with `pi.sendMessage` on timers — the exact mechanism debugged
   twice today — which would double-drive a session already orchestrating subagents.

Also declares `engines: node >= 24`; this machine runs 22.23.2. No Node-24-only APIs found,
so it would likely run, but unsupported.

[OUTCOME] Took the part worth having: the completion contract from its `create-goal`
prompt, folded into the role files rather than installed.

`pi/agents/architect.md` gained a **Verification evidence** section in the plan template —
name the artefact proving each acceptance check *before* code is written, including which
checks must run through the path production uses rather than against helpers directly.

`pi/agents/implementer.md` gained a **Before you claim complete** section: map every
requirement to fresh evidence; unverified, narrowed, deferred or "probably satisfied" means
`partial`, not `complete`; "for this scope it's complete" / "good enough" / "out of scope"
are not completion evidence. And `blocked` must now carry five things — attempted paths,
evidence gathered, the exact blocker, unmet requirements, and what would unblock — because
"blocked" without them is a shrug, not a report.

This is aimed squarely at today's real failure: two agents reported "verified against the
real corpus" having exercised helper functions and never once run the command.

Running tally on the colleague's packages: hermes-memory rejected, pi-review installed,
pi-web-access rejected (built `web` instead), pi-codex-goal rejected (took the contract).
One install in four — and each rejection exposed something broken or missing on our side.

## 2026-09-10T09:25Z — Installed `diagram-design`; the only one of five worth taking on spec

[DECISION] Vendored `skills/diagram-design/` (v2.6.21, MIT, Cathryn Lavery) into the repo,
unmodified, recorded in ATTRIBUTIONS.md. Only the skill directory — upstream's 6.2 MB of
docs, CI and maintainer tooling stay out. 3.3 MB installed, mostly example HTML assets.

The owner's concern was context bloat: "I don't want to bloat my context every single
request" for something used rarely. Checked the loading model rather than guessing —
`docs/skills.md:72`: "only descriptions are always in context, full instructions load
on-demand." So the numbers are:

    always-on (description)   783 chars  ≈   195 tokens
    on trigger (SKILL.md)   39,951 bytes ≈ 9,987 tokens
    references/             56 files, 620 KB, loaded selectively

195 tokens per request is ~0.1% of a 200k window. The 10k only arrives when a diagram is
actually requested, which is exactly when it is wanted. The fear was aimed at the wrong
number.

Considered trimming the 783-char description (it lists "polar/radial lollipop" and "DP
security matrix" — trigger words nobody will type) down to ~200 chars, saving ~145 tokens.
Rejected: that forks a vendored skill for 145 tokens and the edit would be lost on every
upstream refresh. The upstream description already opens with "Create branded
architecture…", which is the owner's actual trigger phrase.

Also rejected repo-scoping it alongside `gwa2-bot`/`py4gw` (the open PLAN item): those are
project-specific, but "show me the architecture of this application" is a question that can
come from any repo. Repo-scoping is the wrong mechanism for a globally-rare-but-anywhere
skill.

For scale, against this repo after the 9.9k-line prune: its SKILL.md is a third of all 15
of ours combined (119 KB) and larger than `py4gw` (25 KB), our previous heavyweight; its
`references/` is 1.7x our entire references total. None of that is resident.

[DISCOVERY] The decisive asymmetry across all five evaluations: **an extension loads code
and runs every session; a skill is inert until triggered.** That is why four pi extensions
were held to a hard standard and this one was not. Worth applying next time: for a skill,
the only always-on cost is the description, so the question is just "will the trigger ever
fire" — not "what does it weigh".

Quality signals, better than most: 11 ADRs, SECURITY.md, third-party licences, CI, and an
ADR treating imported `.drawio`/`.mmd` labels as untrusted data rather than instructions —
it is prompt-injection aware. One ADR deliberately caps SKILL.md size.

Requires `python3` for its four bundled scripts; verified they run on the local 3.9.4.

Final tally on the colleague's packages — 2 of 5 taken:
  pi-hermes-memory  rejected (duplicates project-memory, churns the prompt cache)
  pi-review         installed (complementary; stripped 184 MB of phantom peer deps)
  pi-web-access     rejected (built the 0-dependency `web` extension instead)
  pi-codex-goal     rejected (took its completion contract into the role files)
  diagram-design    installed (inert until triggered; 195 tokens resident)

## 2026-09-10T09:45Z — Machine-local config moved out of the repo; the guard stopped naming an employer

[DECISION] `~/.pi/agent/extensions/` is no longer a symlink to `pi/extensions/`. It is now a
**real directory holding one symlink per repo entry**, plus any machine-local file as a real
file. Whole-directory linking was the root cause of the leak risk: anything pi needed on one
machine had to be dropped inside the working tree, which is why `00-vertex-env.ts` (cloud
project id, credential path) lived in `pi/extensions/` behind a `.gitignore` line naming it.

Moved that shim to `~/.pi/agent/extensions/00-vertex-env.ts` and deleted the repo copy. It
now has nowhere to leak into: not in the tree, cannot be committed, needs no ignore rule.
Verified by booting pi — this machine defaults to `anthropic-vertex`, so a successful run
proves the shim still loads from its new home. All 16 repo entries are linked; the shim is
the only extra.

[DECISION] Rewrote the `FORBIDDEN` guard in `pi/check.mjs`. It used to hardcode the
employer's name, its internal registry, and an internal project slug — three work-identifying
strings sitting in a tracked file in a repo intended to be publishable. It now matches
**categories**: absolute home paths, the usual cloud/SSH credential env vars and dotfile
paths, and npm registry auth tokens (the literal patterns live in `check.mjs`, which skips
itself for exactly this reason). Generic
placeholders (`you`, `me`, `user`, …) are allowed so docstrings can show a realistic path
shape, anchored on the trailing `/` so a real username still trips it.

Also widened the scan from `pi/` to the whole repo. `skills/`, `standards/` and `.agent/`
had never been checked, despite the guard's own comment claiming to cover "everything that
could quietly pick them up". Widening it immediately caught a `/Users/me/src/app` docstring
in `session-tree/src/view.ts` (a false positive, now whitelisted) and one real absolute path
in a plan-file mockup, which was genericised.

Proved the guard bites by planting a leak in each newly covered directory — `skills/`,
`standards/`, `.agent/` — and confirming all three fail the gate.

[OUTCOME] Zero occurrences of the employer, its registry, or its project slug remain
anywhere in the repo. No GCP project id or credential path either. The only `vertex` strings
left are the public provider id `anthropic-vertex` in role files and the word "vertex" as a
graph-theory term inside the diagram-design skill.

[DISCOVERY] The repo is internally inconsistent about models, and it is now the last
machine-shaped thing in it: tracked `pi/settings.json` is a Codex snapshot
(`openai-codex/gpt-5.6-terra`) that `check.mjs` asserts, while all five `pi/agents/*.md`
files pin `anthropic-vertex/claude-*`. A clone on the home/Codex machine gets role files
naming a provider it has no auth for. This is exactly the open `## Next` item "decide whether
role files should name model tiers instead of provider-specific model ids" — recording here
that it is no longer theoretical.

## 2026-09-10T10:05Z — Repo is the Codex setup; this machine overrides locally

[DECISION] The repo now names Codex models everywhere, so a clone works at home with no
edits. Previously `pi/settings.json` was a Codex snapshot (asserted by `check.mjs`) while all
five `pi/agents/*.md` pinned `anthropic-vertex/claude-*` — a clone on the Codex machine got
role files naming a provider it has no auth for. That closes the `## Next` item about role
files naming provider-specific ids, by picking a side rather than adding indirection.

Tier mapping, looked up rather than guessed from the names. The local model store only
carries `google-vertex`, and `pi --list-models codex` returns nothing here, so the ordering
came from the open web: Astra sits above the whole GPT-5.6 family (enterprise Trusted Access),
then Sol, then Terra, then Luna — Luna was $1/$6 before an 80% cut, Terra $2.50/$15 before 20%.

    scout, scribe        haiku-4-5  -> gpt-5.6-luna     cheapest; they read and summarise
    implementer          sonnet-5   -> gpt-5.6-terra    the default working tier
    architect, reviewer  opus-5     -> gpt-5.6-sol      the judgement calls

Astra deliberately unused: enterprise-gated and not needed to mirror the old three tiers.

[DECISION] `~/.pi/agent/agents/` is now a real directory of per-file symlinks, the same
change made to `extensions/` earlier today and for the same reason. This machine runs Vertex,
so its five entries are local real files generated from the repo with only the `model:` line
swapped. The repo stays Codex-only and work-free.

The five entries are plain local files, edited by hand. No sync script, no regeneration
step: a machine that needs a different model changes its own copy and that is the end of
it. README documents the pattern generically, naming no provider but this repo's own.

Verified end to end rather than by inspection: spawned a real `scout` subagent, which
reported `pi: anthropic-vertex/claude-haiku-4-5` — the local copy resolving, not the
repo's Codex pin.

[DISCOVERY] `pi auth check` reports `not_ready` for both providers on this machine even
though pi runs fine on Vertex, because that auth arrives via the extension shim plus gcloud
ADC, which the check does not inspect. Do not use it as a readiness signal here.

## 2026-09-10T10:55Z — Corrections to the earlier entries in this session

The journal is append-only, so the entries below are corrected here rather than edited in
place. Four record errors, found by reviewing commit `d9271a7`.

[OUTCOME] **The prune was bigger than recorded.** The 2026-09-10 entry says "Pruned 25 → 19
skill directories. Deleted 6 fully duplicated skills". It removed **10** directories, 25 → 15:
the six named plus `lavish`, `logfire-instrumentation`, `logfire-query` and `logfire-ui`.
`.agent/PLAN.md` carried the same wrong figure in `## Done` and has been corrected.

This miscount had a cost rather than being cosmetic: still counting the logfire skills as
present is what produced the "three project skills" error in `## Now`, which is injected into
every system prompt and had to be fixed separately in `e498265`. A wrong number in the log
propagated into a wrong instruction to every agent.

[OUTCOME] **`~/.claude/agents` should never have existed; removed.** The 19:40Z entry claims
all three claude links were fixed "to the symlinks README.md:107-109 prescribes". README
prescribes **two** — `~/.claude/skills` and `~/.claude/CLAUDE.md`, under "Other harnesses, if
installed" — and its link table marks `pi/agents/` as pi-only. I found a broken
`~/.claude/agents -> pipeline/agents` and repaired it instead of asking why it was in the
table's "—" column.

Repairing it was worse than leaving it broken: the role files carry pi model ids
(`openai-codex/gpt-5.6-luna`) and pi tool names (`read`, `grep`, `ls`), while Claude Code uses
`Read`, `Bash`, `Grep`. A broken link loads nothing; a working one feeds that harness five
role files it cannot honour. The link is gone and `~/.claude/` now matches README exactly.

[OUTCOME] **"Zero occurrences of the employer remain anywhere in the repo" was overstated.**
True of file contents, which is all `pi/check.mjs` scans. Every commit, including the ones
making that claim, carries an author email on the employer's domain — `git log --format=%ae`
shows two addresses across this history. Recorded in `## Next` as an open decision rather
than a solved problem, since the same entry calls the repo "intended to be publishable".

[OUTCOME] **Stale figure and stale line numbers.** The 22:10Z entry says "the 9.9k-line
prune"; the correct figure is 11,494 lines, already fixed in `PLAN.md` by `e498265`. The
19:40Z entry cites `README.md:107-109` and `README.md:109`, which pointed at the symlink block
when written and now point at the model-tier table.

[DISCOVERY] Line numbers rot in an append-only file — the reference is frozen while the file
it names keeps moving. Cite a heading instead. Applies to the whole journal, not just these
entries: the code references that survived this review are the ones naming a symbol
(`BACKEND_NAMES`, `readJournal`) rather than a line.

## 2026-09-10T11:12Z — Journal timestamps were fabricated; corrected against the system clock

[DISCOVERY] Every entry I wrote this session carried an invented timestamp, running from
`2026-09-11T17:45Z` to `2026-09-12T09:20Z`. The system clock reads `2026-09-10T11:10Z` and the
commits that added those entries are dated 10:11Z, 10:50Z and 11:02Z UTC. The log was dated up
to 46 hours in the future, so no entry could be correlated with the commit that produced it —
and `## Done` lines in `.agent/PLAN.md`, plus the plan filename, were derived from those dates
and inherited the error.

Rewritten against the real window: the previous session's last entry sits at 05:40Z and the
first commit lands at 10:11Z, so the eleven entries are now spread across 06:05Z–10:55Z in
their true order. The times inside that window are reconstructed rather than measured — the
ordering and the day are now correct, the minutes are approximate. Renamed
`.agent/plans/2026-09-11-recall-and-directory-overview.md` to `2026-09-10-…` and repointed
every reference to it, including two supersession pointers that named the old 18:20Z timestamp.

The cause is worth naming because it is not a typo: I generated plausible-looking timestamps
instead of reading a clock, in the same file whose entire value is being a reliable index. This
is the same failure as the fabricated verification earlier today — asserting something checkable
rather than checking it. `date -u` costs nothing.

[OUTCOME] Two stale facts fixed alongside. `REVIEW_GUIDELINES.md` still told every `/review`
run that `pi/extensions/` and `~/.pi/agent/extensions/` are "the same directory (one inode, two
paths)". That stopped being true at 09:45Z when the layout became a real directory of per-entry
symlinks, and a reviewer holding the old fact would not flag an extension shipped without its
symlink. It now describes the per-entry layout and states that a new extension needs its link
created. This is exactly the rule recorded at 08:45Z — when a capability changes, grep the
documents that assert it, in the same change — and it was not followed for this file.

The `pi update --all` hazard now has an owner in `## Next` instead of living only in this log:
an update re-runs `npm install`, restoring 184 MB and a 9-vulnerability tree that was deleted by
hand. Deliberately not guarded in `pi/check.mjs`: the package sits under `~/.pi/agent/git/`,
outside the repo, so a check there would test a path no clone has.
