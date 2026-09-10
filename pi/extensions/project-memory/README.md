# project-memory

Keeps the current focus of a repo in the system prompt.

## Files

Plain markdown under `<cwd>/.agent/`, edited with the agent's normal tools:

- `PLAN.md` — `## Now` (current focus + checkbox next steps), `## Next`, `## Done`
- `JOURNAL.md` — append-only log, newest at the bottom
- `plans/<slug>.md` — full design docs

## Injection

On every turn, if `.agent/PLAN.md` has a `## Now` section, its body is appended
to the system prompt under a `## Project memory (.agent/PLAN.md)` heading, plus
a one-line reminder to keep the files current. The text is cached and re-read
only when the file's mtime changes, so an unchanged plan does not invalidate the
provider's prompt cache. Blocks longer than 1500 characters are truncated at a
line boundary. No plan file, no `## Now` section: nothing is injected.

## Command

- `/plan` — print the Now block and the resolved path
- `/plan new <title>` — create `.agent/PLAN.md` and `.agent/JOURNAL.md` from
  templates; refuses if either already exists

## Development

    npm test && npm run check
