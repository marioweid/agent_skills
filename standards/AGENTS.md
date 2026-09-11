# Global Development Standards

Global instructions for all projects. Project files override these.

## How I work

**Own the task in the current session**, including multi-file features and unclear bugs.
Keep the user's selected model. Read, implement, verify, and update docs yourself by default.
File count is not a reason to delegate.

1. Inspect the requested behavior and relevant code. Ask only about consequential decisions
   the repository cannot resolve. Honor existing authorization.
2. State a short plan and acceptance checks for substantial work. Write a design file only
   for a durable decision or an explicit request.
3. Implement, run relevant checks, fix failures, and inspect the final diff.
4. Use independent review when requested, or for changed trust boundaries, migrations,
   destructive behavior, public contracts, concurrency, or unresolved correctness risks.
   Ordinary tested edits need self-review, not a compulsory reviewer.
5. Report behavior, checks, and limitations. Update relevant docs and existing memory
   yourself; no routine scribe. Preserve unfinished work.

### Delegation and review

- A user request for no subagents overrides every workflow. A child does only its assigned
  task, never parent orchestration or unrelated `.agent/PLAN.md` backlog.
- Delegate only a bounded assignment whose benefit exceeds context and handoff cost.
  Explain the benefit briefly. No automatic scout/architect chain.
- Keep one implementation owner through repairs. Do not spawn a fresh implementer for
  each finding or duplicate a child's investigation while it works.
- Handoffs include goal, constraints, relevant paths, acceptance checks, and needed facts.
  Reference files instead of pasting entire reports. Summaries are leads, not proof.
- For review, supply the diff base/patch, changed and untracked paths, intended behavior,
  check results, and risks. Capture starting worktree status to distinguish pre-existing
  user edits. Stop edits during review.
- One review pass, then at most one focused recheck of fixes and affected callers. The
  owner repairs supported blockers. No taste-driven repair loops or unrelated scope.
  Remaining blockers or essential missing evidence go to the user; never call them a pass.
- Role model/effort is an explicit delegation choice. Compare whole-task consumption,
  including parent, retries, and review; a cheaper model is not automatically cheaper work.
- Never invent a child's report or treat an empty/error result as approval.
- Keep `## Now` current when work stops. Avoid per-step memory churn.

## Philosophy

- **No speculative features.** No flags, config, or extension points until something needs them.
- **No premature abstraction.** Write it three times before extracting it.
- **Reuse what exists** — in this repo, then the stdlib, then a native platform feature, then an installed dependency. A new dependency is the last resort and needs a justification.
- **Replace, don't deprecate.** New implementation lands, old one dies. No shims, no dual config formats. Flag dead code you find.
- **Clarity over cleverness.** The reader is tired and it is 3am.
- **Verify at every level.** Linters, type checkers, tests, hooks — set up the guardrail before the code, not after. Prefer structure-aware tools (`ast-grep`, compilers, LSPs) over text matching.
- **Bias toward action.** Decide and move on anything reversible; state the assumption out loud. Ask before committing to interfaces, data models, architecture, or destructive/external writes.
- **Finish the job.** Handle the edge cases you can see, clean up what you touched, flag what is broken nearby. That is not the same as inventing scope.
- **Agent-native.** Anything a user can achieve through the UI, an agent should be able to achieve too. Prefer file-based state — transparent, portable, greppable.

## Code quality

**Hard limits:** ≤100 lines per function · cyclomatic complexity ≤8 · ≤5 positional params · 100-char lines · absolute imports only · Google-style docstrings on non-trivial public APIs.

**Shape:** cohesive state + behavior in a class; stateless transforms stay functions. A static method that touches no instance state is a function with extra ceremony. Inject dependencies through the constructor, hand-wired — no DI framework. Bundle app/request-scoped singletons into one typed context object. Entry points (routes, CLI commands, consumers) resolve a service and delegate; orchestration lives in the service.

**Zero warnings.** Every warning from every tool gets fixed, or gets an inline ignore with a justification comment.

**Comments** explain *why*. If a comment is needed to explain *what*, rewrite the code. Delete commented-out code.

**Errors** fail fast with what operation, what input, and what to do. Never swallow an exception. In batch operations, collect per-item failures and report them — never abort the batch on one item, never drop one silently.

## Testing

- **Test behavior, not implementation.** If a refactor breaks the test but not the code, the test was wrong.
- **Test the edges**: empty input, boundaries, malformed data, missing files, network failure. Every handled error path gets a test that triggers it.
- **Mock only** what is slow, non-deterministic, or an external service you do not control. Never mock the logic under test.
- **Prove the test can fail** — break the code, watch it go red, fix it. `cargo-mutants` / `mutmut` for systematic proof; `proptest` / `hypothesis` for parsers, serialisation, and algorithms.
- **Non-trivial logic ships one runnable check** (a branch, a loop, a parser, a money/security path); trivial one-liners don't need one.

## Toolchain

Look up the current stable version when adding a dependency, action, or tool version — never recall it from memory.

| Stack | Tools | Skill to load |
|---|---|---|
| Python 3.13 | `uv`, `ruff check`/`format`, `ty check`, `pytest -q` — never pip/poetry/black/mypy | `python-pro`, `modern-python`, `fastapi` |
| Node 22, ESM | `oxlint`, `oxfmt`, `vitest`, `tsc --noEmit` — never eslint/prettier | `typescript-pro` |
| Rust stable | `cargo clippy --all-targets --all-features -- -D warnings`, `cargo fmt`, `cargo test`, `cargo deny check` | `rust-engineer` |
| Go | standard toolchain, table-driven tests | `golang-pro` |
| Bash | `set -euo pipefail`, `shellcheck`, `shfmt -i 2` | — |
| GitHub Actions | pin to SHA + version comment, `persist-credentials: false`, `zizmor` before commit | — |

Pin exact versions (`==`, no `^`). Audit before installing (`pip-audit`, `pnpm audit --audit-level=moderate`).

**CLI:** `rg` over grep · `fd` over find · `ast-grep` for code structure · `prek run` for hooks · `wt switch` for worktrees · `trash` over `rm` — **never `rm -rf`**.

## Workflow

Before committing: re-read the diff for complexity and unclear naming; run the relevant tests (not the whole suite); run linters and the type checker; fix everything.

Commits: imperative mood, ≤72-char subject, one logical change. Conventional Commits prefixes (`feat:`, `fix:`, `docs:`, `refactor:`) when the repo already uses them. Never amend or rebase what is already pushed to a shared branch. Never push to main — branch and PR. Never commit secrets.

PRs describe what the code does now — not discarded approaches or prior iterations. Plain language: a bug fix is a bug fix, not a "critical stability improvement".

Parallel agents that write need separate worktrees (`wt switch <branch>`). Never share a working directory between writers.

## Looking things up

Your training data lags. Never recall a version, a flag, or an API shape from memory — check it. Cheapest source first:

1. **The installed copy.** `node_modules/<pkg>`, the Homebrew Cellar path, site-packages, the package's own `docs/`, `README`, and `.d.ts`. This is the version you actually have, which beats any web page about a version you don't.
2. **The tool itself.** `--help`, `--version`, `npm view <pkg> version`, `uv pip show`, `cargo info`.
3. **A registry over `curl`.** `curl -s registry.npmjs.org/<pkg>/latest` returns version, license and the real dependency list as JSON — no HTML to fight.

pi has no MCP, and that is deliberate (`docs/usage.md`). The three steps above still answer almost every real lookup faster than a search does — reach for them first.

When a question genuinely needs the open web, `web_search` and `web_fetch` (the `web` extension) are yours: DuckDuckGo's HTML endpoint and an HTML-to-text reader, no API key, no account. Use `web_search` for discovery — "is there a lighter alternative to X", "what is current practice for Y" — and `web_fetch` when you already know the URL. Never delegate a lookup to another harness; this setup is pi-only.

Never paste a config file containing credentials into a transcript. Sessions are stored in plaintext under `~/.pi/agent/sessions/`. Read the keys you need with `rg`, or redact before printing.

Never add `Co-Authored-By` trailers to commits.
