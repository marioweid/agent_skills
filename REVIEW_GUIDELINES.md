# Review guidelines

Project overrides for `/review`. The full standards live in `standards/AGENTS.md`;
this file only records the places where a generic reviewer guesses wrong here.

## Verdict vocabulary

Use these words, so a `/review` finding and a `reviewer`-subagent finding mean the
same thing and can be handed to the same implementer:

- `blocker` — wrong behavior, data loss, security, or a break in a caller. Equivalent
  to P0/P1. A blocker means the change does not ship.
- `should-fix` — real but survivable. Equivalent to P2.
- `nit` — taste. At most three, never blocking. Equivalent to P3.

End with `status: pass` or `status: reject`, then the Human Reviewer Callouts section.

## Error handling: fail fast, except in batches

Fail-fast is right for a single operation. It is wrong for a batch, and this repo
says so deliberately:

> In batch operations, collect per-item failures and report them — never abort the
> batch on one item, never drop one silently.

So do **not** flag these as swallowed errors:

- A per-item `catch` in a loop that records the failure and continues, provided the
  failures are surfaced in the result — a count, a list, a log line the caller sees.
- A reader that returns `[]` or `undefined` for **absent or unreadable optional
  input**, where absence is a normal state rather than an error. `overview.ts`
  (`readJournal`: most repos have no `.agent/JOURNAL.md`) and `transcript.ts`
  (`readConversation`: a session may be half-written right now) are the reference
  cases, and both are intentional.

Do flag, as the standard intends:

- A `catch` that returns a fallback and reports nothing anywhere.
- A batch that aborts on the first bad item.
- A `catch` that hides a programming error — a missing key, a type confusion, a
  contract the caller was supposed to guarantee.

The test is whether a human ever finds out. Degrading quietly on optional input is
fine; degrading quietly on a real failure is the bug.

## What this repo is

A personal pi harness: extensions under `pi/extensions/`, agent role prompts under
`pi/agents/`, skills under `skills/`, standards under `standards/`.

- `pi/extensions/` and `~/.pi/agent/extensions/` are **the same directory** (one
  inode, two paths). There is no build, no install step, no bundling. Edits are live
  on the next pi restart. Do not suggest a sync or copy step.
- Extensions are TypeScript ESM, run directly by pi with no transpile. Relative
  imports carry the `.ts` extension on purpose — that is required, not a mistake.
- Core pi packages (`@earendil-works/pi-coding-agent`, `pi-ai`, `pi-tui`) are
  `peerDependencies` with `"*"` because pi injects them at runtime. A missing entry
  in `dependencies` is correct, not an omission.
- Checks: `npm test` and `npm run check` inside the extension, then `node pi/check.mjs`
  at the repo root. Tests are `node --test` with `--experimental-strip-types`, no
  framework. Do not suggest vitest, jest, or a bundler.

## House priorities

1. **Deletion beats addition.** Flag speculative abstractions, one-off helpers, config
   for a value that never changes, and any interface with one implementation.
2. **Tests that cannot fail are worse than no test.** A test asserting on its own
   reimplementation of the logic, or a fixture where two code paths produce identical
   output, is a finding. Say which mutation would leave it green.
3. **Verify through the path production uses.** A test calling a pure function directly
   proves the function works, not that anything calls it correctly. Dead code behind a
   green test has bitten this repo three times.
4. Pre-existing violations are out of scope unless the change touches that line.
