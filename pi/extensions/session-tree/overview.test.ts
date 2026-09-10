import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { activityCounts, activityStrip, parseJournal, readJournal } from "./src/overview.ts";
import { buildTree } from "./src/tree.ts";
import type { SessionRow } from "./src/tree.ts";
import { detailLines } from "./src/view.ts";

const never = () => false;

const DAY_MS = 24 * 60 * 60 * 1000;

function row(over: Partial<SessionRow> = {}): SessionRow {
  return {
    path: "/sessions/a/1.jsonl",
    cwd: "/repo/a",
    firstMessage: "fix the parser",
    modified: 0,
    created: 0,
    messageCount: 1,
    ...over,
  };
}

// --- activity ----------------------------------------------------------------

test("a quiet day is a dot and a busy day is a block", () => {
  const now = Date.UTC(2026, 0, 10, 12);
  const counts = activityCounts(
    [row({ modified: now, messageCount: 0 }), row({ modified: now - DAY_MS, messageCount: 300 })],
    now,
    2,
  );
  assert.deepEqual(activityStrip(counts, 2).split(""), ["\u2588", "\u00b7"]);
});

test("the glyph steps with message volume", () => {
  const now = Date.UTC(2026, 0, 10, 12);
  const volumes = [0, 5, 25, 120, 400];
  const counts = volumes.map((messageCount) => {
    const [c] = activityCounts([row({ modified: now, messageCount })], now, 1);
    return c!;
  });
  const glyphs = counts.map((c) => activityStrip([c], 1));
  assert.deepEqual(glyphs, ["\u00b7", "\u2591", "\u2592", "\u2593", "\u2588"]);
});

test("a session's messages land on the day it was last touched", () => {
  // Local midnight of "now" plus a few hours, and a session touched the
  // previous local day: they must land on different, adjacent buckets
  // regardless of what UTC offset the machine running the test is in.
  const now = new Date();
  now.setHours(23, 0, 0, 0);
  const yesterday = new Date(now.getTime() - DAY_MS);
  yesterday.setHours(1, 0, 0, 0);
  const counts = activityCounts(
    [row({ modified: now.getTime(), messageCount: 7 }), row({ modified: yesterday.getTime(), messageCount: 3 })],
    now.getTime(),
    2,
  );
  assert.deepEqual(counts, [3, 7], "oldest bucket first, today last");
});

test("a narrow pane trims the oldest days, never today", () => {
  const counts = [0, 0, 0, 300]; // oldest .. today
  assert.equal(activityStrip(counts, 4), "\u00b7\u00b7\u00b7\u2588");
  assert.equal(activityStrip(counts, 1), "\u2588", "today survives the trim");
  assert.equal(activityStrip(counts, 2), "\u00b7\u2588");
});

test("a narrow detail pane trims the rendered activity strip from the left, keeping today", () => {
  // Regression for the strip being wired to a fixed ACTIVITY_DAYS width
  // instead of the real pane width: at full width both this 56-days-ago row
  // and the today row would render; at a narrow width only today may survive.
  const now = Date.UTC(2026, 2, 1);
  const oldRow = row({ modified: now - 55 * DAY_MS, messageCount: 300 });
  const todayRow = row({ modified: now, messageCount: 300 });
  const [dirNode] = buildTree([oldRow, todayRow], []);
  const labelGutter = 11; // matches view.ts's LABEL_WIDTH; not exported, so pinned here
  const width = labelGutter + 10;
  const lines = detailLines(dirNode, now, never, [], width);
  const stripLine = lines.find((l) => /^ {11}[\u00b7\u2591\u2592\u2593\u2588]+$/.test(l));
  assert.ok(stripLine, "an activity strip line is rendered");
  const strip = stripLine!.slice(labelGutter);
  assert.equal(
    strip,
    `${"\u00b7".repeat(9)}\u2588`,
    "only today's block survives; the 56-day-old one is trimmed away, not today's",
  );
});

test("a pane wider than the strip caps it at 56 days and keeps the axis aligned", () => {
  // Regression for the upper clamp in stripWidthFor: without it a wide pane asks
  // for more columns than activityCounts produced, and `today` floats past the
  // strip's right edge under an axis label claiming more days than are drawn.
  const now = Date.UTC(2026, 2, 1);
  const [dirNode] = buildTree([row({ modified: now, messageCount: 300 })], []);
  const labelGutter = 11; // matches view.ts's LABEL_WIDTH; not exported, so pinned here
  const lines = detailLines(dirNode, now, never, [], labelGutter + 200);
  const stripLine = lines.find((l) => /^ {11}[\u00b7\u2591\u2592\u2593\u2588]+$/.test(l));
  const axisLine = lines.find((l) => l.includes("d ago"));
  assert.ok(stripLine && axisLine, "a strip and its axis are rendered");
  const strip = stripLine!.slice(labelGutter);
  assert.equal(strip.length, 56, "the strip never exceeds the 56 days of counts");
  assert.equal(
    axisLine!.slice(labelGutter).length,
    strip.length,
    "the axis spans exactly the strip, so `today` sits under today's column",
  );
});

test("a directory with no sessions renders without a strip and without throwing", () => {
  assert.deepEqual(activityCounts([], Date.now(), 5), [0, 0, 0, 0, 0]);
  assert.equal(activityStrip([0, 0, 0, 0, 0], 5), "\u00b7\u00b7\u00b7\u00b7\u00b7");
});

// --- journal -------------------------------------------------------------------

test("all journal entries render, newest first, in the detail pane", () => {
  // Four entries, oldest to newest in file order (D12's append-only
  // convention) — the pane must show every one, newest first. The pane
  // scrolls, so nothing here is dropped. Asserting on `detailLines`' own
  // output, not on a second reimplementation in the test, is the point.
  const journal = parseJournal(
    [
      "## 2026-01-01 — first",
      "## 2026-01-02 — second",
      "## 2026-01-03 — third",
      "## 2026-01-04 — fourth",
    ].join("\n"),
  );
  const [dirNode] = buildTree([row()], []);
  const lines = detailLines(dirNode, Date.now(), never, journal);
  const text = lines.join("\n");
  const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
  const order = dates.map((date) => text.indexOf(date));
  assert.ok(
    order.every((index) => index >= 0),
    "every entry is present",
  );
  assert.deepEqual(
    [...order].sort((a, b) => b - a),
    order,
    "newest first: 04, then 03, 02, 01, top to bottom",
  );
});

test("a journal deeper than a plausible pane height still renders every entry", () => {
  // 12 entries against a pane height of, say, 12 lines: the overflow the
  // pane computes from this body is exactly what lets ⇞/⇟ page through it,
  // so every entry surviving into `detailLines` is what makes paging work.
  const heading = (n: number) => `## 2026-01-${String(n).padStart(2, "0")} — entry ${n}`;
  const journal = parseJournal(Array.from({ length: 12 }, (_, i) => heading(i + 1)).join("\n"));
  const [dirNode] = buildTree([row()], []);
  const lines = detailLines(dirNode, Date.now(), never, journal);
  const text = lines.join("\n");
  for (let n = 1; n <= 12; n++) {
    assert.ok(text.includes(`entry ${n}`), `entry ${n} is present`);
  }
});

test("a heading with no summary falls back to the first body line", () => {
  const entries = parseJournal(["## 2026-01-01", "", "the first real line", "second line"].join("\n"));
  assert.deepEqual(entries, [{ date: "2026-01-01", brief: "the first real line" }]);
});

test("a heading splits on the first em dash or ` - `, whichever comes first", () => {
  const em = parseJournal("## 2026-01-01 — the brief");
  assert.deepEqual(em, [{ date: "2026-01-01", brief: "the brief" }]);
  const hyphen = parseJournal("## 2026-01-01 - the brief");
  assert.deepEqual(hyphen, [{ date: "2026-01-01", brief: "the brief" }]);
});

test("a missing, unreadable, or heading-less JOURNAL.md yields no entries", () => {
  assert.deepEqual(parseJournal(""), []);
  assert.deepEqual(parseJournal("no headings here, just prose"), []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stree-journal-"));
  assert.deepEqual(readJournal(dir), [], "no .agent/JOURNAL.md at all");
  assert.deepEqual(readJournal(path.join(dir, "does", "not", "exist")), []);
});

test("an empty cwd yields no entries rather than falling back to process.cwd()", () => {
  // tree.ts builds `cwd: window?.cwd ?? session?.cwd ?? ""`, so "" is reachable.
  // The assertion only means anything from a directory that HAS a journal to leak.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stree-cwd-"));
  fs.mkdirSync(path.join(dir, ".agent"));
  fs.writeFileSync(path.join(dir, ".agent", "JOURNAL.md"), "## 2026-01-01 — leaked\n");
  const original = process.cwd();
  try {
    process.chdir(dir);
    assert.deepEqual(readJournal(dir), [{ date: "2026-01-01", brief: "leaked" }], "sanity");
    assert.deepEqual(readJournal(""), [], "an empty cwd must not fall back to process.cwd()");
  } finally {
    process.chdir(original);
  }
});

test("a CRLF journal parses the same as an LF one", () => {
  const entries = parseJournal("## 2026-01-01 — brief\r\n body\r\n");
  assert.deepEqual(entries, [{ date: "2026-01-01", brief: "brief" }]);
});

test("a journal edited on disk is re-read", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stree-journal-"));
  const agentDir = path.join(dir, ".agent");
  fs.mkdirSync(agentDir);
  const journalPath = path.join(agentDir, "JOURNAL.md");

  fs.writeFileSync(journalPath, "## 2026-01-01 — first");
  assert.deepEqual(readJournal(dir), [{ date: "2026-01-01", brief: "first" }]);

  // A mtime bump within the same millisecond as the first write would look
  // unchanged to the cache, so force it forward explicitly.
  fs.writeFileSync(journalPath, "## 2026-01-02 — second");
  const bumped = fs.statSync(journalPath).mtimeMs + 1000;
  fs.utimesSync(journalPath, bumped / 1000, bumped / 1000);

  assert.deepEqual(readJournal(dir), [{ date: "2026-01-02", brief: "second" }]);
});
