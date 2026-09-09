/**
 * Parsing and templates for `.agent/PLAN.md`. Kept apart from the extension
 * wiring so the `## Now` extraction is directly testable.
 */

/** Injected Now blocks are capped so a sprawling plan cannot eat the prompt. */
export const NOW_CHAR_CAP = 1500;

const TRUNCATION_MARKER = "… (truncated, read .agent/PLAN.md)";

const UPKEEP =
  "Keep this current: edit .agent/PLAN.md when the plan changes, " +
  "and append outcomes to .agent/JOURNAL.md.";

/**
 * The body of the `## Now` section, without its heading, or undefined when the
 * document has no Now section or the section is empty.
 */
export function extractNow(markdown: string): string | undefined {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^##[ \t]+Now[ \t]*$/.test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,6}[ \t]/.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  return body === "" ? undefined : body;
}

/** Cuts at the last line boundary inside the cap, so a bullet is never halved. */
export function truncateNow(now: string, cap: number = NOW_CHAR_CAP): string {
  if (now.length <= cap) return now;
  const head = now.slice(0, cap);
  const boundary = head.lastIndexOf("\n");
  const kept = (boundary === -1 ? head : head.slice(0, boundary)).trimEnd();
  return `${kept}\n${TRUNCATION_MARKER}`;
}

/** The exact text appended to the system prompt. */
export function buildMemoryBlock(now: string): string {
  return [
    "## Project memory (.agent/PLAN.md)",
    "",
    truncateNow(now),
    "",
    UPKEEP,
  ].join("\n");
}

export function planTemplate(title: string): string {
  return `# Plan — ${title}

## Now

<one to five lines: what we are doing right now and why>

- [ ] first step

## Next

- backlog item, one line each

## Done

- YYYY-MM-DD short outcome → .agent/plans/<slug>.md
`;
}

export function journalTemplate(title: string): string {
  return `# Journal — ${title}

Append-only. Newest at the bottom. One entry per meaningful decision or outcome.

## YYYY-MM-DDTHH:MMZ — ${title}

[DECISION] why this approach over the alternative
[OUTCOME] what shipped, what is still open
`;
}
