# Global Development Standards

Global instructions for all projects. Project files override these.

## How I work

**Triage every request first.** Say which lane you are in, in one line, then go.

| Lane | When | What you do |
|---|---|---|
| **Direct** | Answering, reading, one obvious edit, anything reversible in seconds | Just do it. No agents, no plan, no ceremony. |
| **Recon** | "How does X work", "where is Y", "what would Z touch", or you need to read >5 files to answer | Spawn 2-4 `scout` subagents in parallel, one question each. Their briefs come back; the grep noise does not. |
| **Build** | A feature, a refactor, a bug with unclear cause, anything spanning several files | The loop below. |

### The build loop

1. **Recon** — parallel `scout`s. Skip only if you already know the code cold.
2. **Clarify** — turn the scouts' `unknowns` plus your own into **1-3 `ask_user` questions** and ask me. Subagents cannot ask; you are the only channel to the human, so never delegate this. Skip only when there is genuinely nothing to decide.
3. **Plan** — one `architect`, given the goal, my answers, and the scout briefs. It writes `.agent/plans/<date>-<slug>.md`.
4. **Gate** — stop and show me the plan **only if** its `gate: yes`, or it touches schemas, public APIs, architecture, security, data migrations, deletions of shared code, or anything destructive/external. Otherwise proceed and tell me you did.
5. **Build** — one `implementer`, one at a time, ever. Parallel writers corrupt each other. You relay; you do not write the code yourself.
6. **Verify** — the implementer runs the project's checks. Then one `reviewer` on the diff. `reject` → back to the implementer with the blockers. Two rounds maximum, then bring it to me with the open blockers.
7. **Record** — one `scribe` updates `.agent/PLAN.md` and appends to `.agent/JOURNAL.md`.

### Rules of the loop

- **Reads parallelise, writes never.** Any number of scouts; exactly one implementer.
- **Escalate, don't pre-route.** Start cheap. A failed cheap attempt is cheaper than a wrong expensive plan.
- **Every child prompt is self-contained.** Children cannot see this conversation. Give paths, constraints, and the acceptance check — not "as discussed".
- **Never fabricate a child's report.** If a subagent fails or returns nothing, say so.
- **Keep `.agent/PLAN.md` current.** It is injected into every session. If work stops mid-flight, `## Now` must still describe reality.

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

## Toolchain

Look up the current stable version when adding a dependency, action, or tool version — never recall it from memory.

| Stack | Tools | Skill to load |
|---|---|---|
| Python 3.13 | `uv`, `ruff check`/`format`, `ty check`, `pytest -q` — never pip/poetry/black/mypy | `python-pro`, `modern-python`, `python-design-patterns`, `fastapi` |
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

## Documentation lookups

Use Context7 MCP for any library, framework, SDK, or CLI question — React, FastAPI, Prisma, Tailwind, anything — even when you think you know the answer; your training data lags. `resolve-library-id` first, then `query-docs` with the full question. Not for refactoring, debugging business logic, or general programming concepts. Prefer Exa (`mcp__exa__web_search_exa`) over generic web search.

Never add `Co-Authored-By` trailers to commits.
