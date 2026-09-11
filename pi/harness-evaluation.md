# Harness audit and evaluation

Audited 2026-09-11 against `7674f50` (remote fetched; checkout matched `origin/main`).
No subagents or paid model evaluations were run during the audit.

## Findings and changes

| Evidence in the old harness | Consequence | Current behavior |
|---|---|---|
| `standards/AGENTS.md` required scouts for reading more than five files and a full pipeline for multi-file work. `/build` prohibited the parent from coding. | A normal build required 6–8 children: 2–4 scouts plus architect, implementer, reviewer, and scribe. That is five dependent child stages before repairs, in addition to parent turns. | The current agent owns implementation, tests, self-review, and notes. Ordinary work requires no children. Independent review is selected for concrete risks or a user request. |
| `/build` copied briefs verbatim and sent rejects to fresh implementers. | Repeated handoffs and repository discovery, with the implementation owner losing context across repairs. | Handoffs reference files and carry only relevant facts. The implementation owner keeps responsibility for fixes. |
| `reviewer.md` requested a broad adversarial hunt, standards review, nits, and seven classes of callouts, without a scope or stopping rule. | A reviewer was encouraged to expand into another investigation. This is a mechanism for waste, not a measured attribution of past tokens. | Review starts from an exact diff and risk list, follows affected callers, and reports supported blockers and coverage gaps. One pass plus at most one focused recheck. Missing scope is `incomplete`. |
| `scout.md` said thoroughness was free. | It optimized only the parent's context while ignoring the child's consumption. | Scouts answer bounded questions and stop when answered. |
| The Pi backend loads normal global/project resources for children, but removes their delegation and question tools. | The old global orchestration policy also reached workers that could not execute it. | Standards and role prompts explicitly scope children to their assigned work. Repository instructions and skills are retained. |
| `finalOutput` scanned backward for any assistant text in the full session. | Regression tests returned an old `status: pass` after a follow-up had no output, and promoted interim commentary when the final answer was empty. Truncated text could also be labeled completed. | Output is tracked per run from SDK events. Empty, truncated, failed, or unfinished output cannot become a completed result. Compaction cannot invalidate an index into history because none is used. |
| The lockfile combined Effect/platform `4.0.0-beta.99` with shared-platform `4.0.0-rc.112`; `npm ls` reported invalid peers. | A clean install had an inconsistent dependency graph despite direct version pins. | An exact compatible transitive override and regenerated lock resolve all three to beta.99. The snapshot gate checks this relationship. |
| The 186-test baseline had three Windows failures. | Two binary fixtures used Unix separators; `formatCwd` failed to shorten Windows home paths. | Platform-correct fixtures and normalized display paths pass those checks. |
| `prek run` did not discover `prek.yaml`. | The documented default hook command had no configuration. | `.pre-commit-config.yaml` is discoverable; snapshot, lint, and usage-accounting hooks are installed and checked. |

The footer's existing token display is **context occupancy**, not all requests' cumulative
consumption. It is correct for its purpose; it is not evidence of how much a reviewer cost.
The session-usage report below measures recorded consumption instead.

Oxlint and oxfmt are pinned development dependencies. Lint covers the Pi source and tests;
formatting was applied to changed code. Enabling lint found redundant terminal sanitization
in the footer, which now uses the existing tested shared sanitizer. The explicit terminal
control-regex exceptions and stable listener snapshot are documented inline.

## What is and is not measured

The available Windows history contained 32 Pi JSONL files, 1,800 assistant entries, and
zero `subagent_spawn` calls or recognized role preambles. There was one direct Sol session
with 30 assistant entries, but no matched pipeline task. These files cannot establish
whether Sol is better, how much review consumed on another machine, or a savings percentage.
No task contents or private transcript files are checked into this repository.

The workflow removes **mandatory** child stages; that follows directly from its instructions.
Prompt size and child count are not substitutes for measured cost, latency, or correctness.
The selected/default models and reasoning settings have not changed. The reviewer still
uses Sol/high when deliberately invoked. This avoids confounding workflow changes with a
model or reasoning downgrade before representative measurements exist.

Review scope and stopping rules are instructions, not enforced token caps. A pass is not
a correctness guarantee, and Bash-equipped inspection roles are not filesystem sandboxes.
The runtime does enforce empty/truncated-result failure. Existing tool timeouts remain;
no arbitrary whole-task timeout was added that could discard a useful review.

## Repeatable local usage report

Run from the repo root on the machine holding the sessions:

```sh
node pi/session-usage.mjs /path/to/selected/session-directory
node pi/session-usage.mjs /path/to/parent.jsonl /path/to/child.jsonl
```

The report streams JSONL locally, makes no network/model calls, and emits counters rather
than prompts, tool arguments, results, or source paths. It includes transcript basenames,
session IDs, and model IDs; inspect even aggregate reports before sharing them externally.
Directories are recursive, with no child-session exclusions and no symlink traversal.

- `input`, `cacheRead`, `cacheWrite`, `output`: sum of recorded per-request counters.
- `reasoning`: an informational subset of output; it is **not added again** to totals.
- `totalTokens`: those four disjoint buckets combined, not peak context occupancy.
- `estimatedCostUsd`: recorded provider/catalog estimate, **not** subscription quota or
  an invoice. Missing cost makes it `null`; zero estimates are not proof of free execution.
- `messagesWithoutUsage`, `malformedLines`: coverage failures. Treat affected totals as
  partial; a missing counter is not proof of zero consumption.
- `duplicateMessages`: matching entry IDs/timestamps from copied or forked transcripts
  counted once. Entries without IDs are retained per source file and line.
- `groups`: role/model totals, including model switches and failed/aborted attempts.
  Role inference recognizes only the first user message's known role preamble.
  `unclassified` does not establish that a session is a parent.
- `spanSeconds`: first to last recorded timestamp, including idle time. Do not sum
  overlapping children to claim wall-clock task latency.

Select the complete parent/child set for a task. The report does not guess task membership
from coincident timestamps. Counting only the parent makes delegation appear artificially cheap.
Do not export credentials or copy work transcripts into this repository for benchmarking.

## Controlled comparison before tuning models

Use representative past tasks whose acceptance criteria can be checked independently:
a small fix, a multi-file feature, a difficult bug, and a contract/concurrency change.
Use disposable checkouts at the same starting revision, with identical instructions,
tools, task text, test commands, and clear starting worktree status.

1. First compare the old pipeline with this workflow using the **same model assignments**.
   Record all parent and child sessions, check outcomes, human corrections, and actual
   start/finish times. Repeat tasks in varied order to reduce cache/order effects.
2. Separately compare single-session Terra and single-session Sol on the same tasks.
   Do not change effort, task scope, skills, and model all at once and attribute the result
   to the model. Record model IDs and thinking settings explicitly.
3. Evaluate quality using acceptance checks and human inspection of the resulting diff.
   Count escaped bugs, regressions, incomplete requirements, and false reviewer blockers.
   An agent's own `complete` or `pass` string is not an independent quality label.
4. Prefer lower whole-task consumption/latency only when acceptance and regression results
   hold. Report individual results and medians over repetitions, not a winner from one run.

Policy walkthroughs, not live-model benchmark results:

| Task | Expected routing |
|---|---|
| Read eight relevant files to explain a function | Current session; file count does not trigger scouts |
| Implement a tested feature in three files | Current session owns changes/checks/notes |
| Change token validation or a migration | Owner implements; focused independent review unless the user forbids subagents |
| User says to work alone on a difficult bug | Current session throughout; disclose self-review coverage |
| Reviewer lacks the intended base or sees no relevant diff | `incomplete`; obtain missing scope rather than pass |
| Reviewer returns one supported correctness blocker | Owner fixes; one focused recheck, no fresh implementation pipeline |
| Reviewer returns style preferences only | No blocking repair loop |

## Verification and activation

Final local results: **201 tests pass** (8 usage-accounting + 193 extension tests),
source type-check passes, lint passes, portability gate passes, all installed hooks pass,
and the dependency audit reports zero vulnerabilities. No tests were skipped.

From this checkout after installing the pinned extension dependencies without scripts:

```sh
npm test
npm run check
npm run lint
prek run --all-files
```

`npm test` runs usage-accounting checks and the extension suite. Pi backend regression
tests exercise production spawn/send/event/settle wiring with the **SDK boundary mocked**;
they do not launch agents or contact providers. They cover failed restarts, empty final
answers, and context compaction. Separate cases cover truncated/unfinished responses.
The existing source type-check also passes; the new TypeScript test files were checked
separately because the repository's source tsconfig excludes test files.

A clean `npm ci --ignore-scripts` resolves valid Effect peers. It still reports two
upstream `node-domexception` deprecation notices; these are transitive SDK dependencies,
not lint/type/test failures. They were not hidden or removed with an untested SDK upgrade.

This audit changes the **source checkout**. Reload/restart Pi only after confirming its
standards, prompt, roles, and extension links point to this revision. On a machine with
local role copies, merge the revised behavior while preserving its provider/model choices.
For a pinned Nix install, publish/review the change, update the input, and rebuild through
the existing deployment process. No work-machine settings or credentials were overwritten.
