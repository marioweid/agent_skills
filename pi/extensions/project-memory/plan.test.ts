import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMemoryBlock, extractNow, NOW_CHAR_CAP, truncateNow } from "./plan.ts";

const PLAN = `# Plan — demo

## Now

Shipping the parser.

- [ ] write tests

## Next

- something later

## Done

- 2024-01-01 nothing yet
`;

test("extracts the Now body without its heading or the next section", () => {
  assert.equal(extractNow(PLAN), "Shipping the parser.\n\n- [ ] write tests");
});

test("returns undefined when there is no Now section", () => {
  assert.equal(extractNow("# Plan\n\n## Next\n\n- later\n"), undefined);
});

test("returns undefined when the Now section is empty", () => {
  assert.equal(extractNow("## Now\n\n## Next\n\n- later\n"), undefined);
});

test("reads a Now section that is the last section in the file", () => {
  assert.equal(extractNow("# Plan\n\n## Now\n\n- only step\n"), "- only step");
});

test("handles CRLF line endings", () => {
  assert.equal(extractNow("# Plan\r\n\r\n## Now\r\n\r\n- step\r\n\r\n## Next\r\n"), "- step");
});

test("truncates at a line boundary and marks it", () => {
  const long = Array.from({ length: 200 }, (_, i) => `- item ${i}`).join("\n");
  assert.ok(long.length > NOW_CHAR_CAP);
  const cut = truncateNow(long);
  assert.ok(cut.length < NOW_CHAR_CAP + 60);
  assert.ok(cut.endsWith("\n… (truncated, read .agent/PLAN.md)"));
  const kept = cut.split("\n").slice(0, -1);
  for (const line of kept) assert.match(line, /^- item \d+$/);
  assert.ok(long.startsWith(kept.join("\n")));
});

test("leaves content at or below the cap untouched", () => {
  const short = "- one\n- two";
  assert.equal(truncateNow(short), short);
  assert.equal(truncateNow("abcdef", 6), "abcdef");
});

test("truncates a single overlong line with no boundary", () => {
  assert.equal(truncateNow("abcdefgh", 4), "abcd\n… (truncated, read .agent/PLAN.md)");
});

test("memory block is stable and carries the upkeep instruction", () => {
  const block = buildMemoryBlock("- step");
  assert.equal(block, buildMemoryBlock("- step"));
  assert.ok(block.startsWith("## Project memory (.agent/PLAN.md)\n\n- step\n\n"));
  assert.match(block, /append outcomes to \.agent\/JOURNAL\.md\.$/);
});
