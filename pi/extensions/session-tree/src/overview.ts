/**
 * What a directory row in the tree shows: how busy it has been, and what the
 * project's own journal says happened recently.
 *
 * Activity is pure arithmetic over `SessionRow`s already held in memory — no
 * new I/O, so the 1s render tick pays nothing for it. The journal is read
 * straight off disk with an mtime cache, exactly like `transcript.ts` caches
 * transcripts, so a cursor resting on a directory does not re-read the file
 * every tick.
 */

import fs from "node:fs";
import path from "node:path";
import type { SessionRow } from "./tree.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const GLYPHS = ["\u00b7", "\u2591", "\u2592", "\u2593", "\u2588"] as const;

/** The local midnight a timestamp falls on, as a day count since the epoch. */
function localDayNumber(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / DAY_MS);
}

/**
 * Message counts bucketed by local day, oldest first, `now`'s day last.
 *
 * ponytail: a session spanning midnight lands entirely on the day it was last
 * touched (`modified`), not spread across the days it ran. Upgrade path: carry
 * a timestamp per `Turn` — `readConversation` already parses one when present —
 * and bucket messages instead of whole sessions.
 */
export function activityCounts(rows: readonly SessionRow[], now: number, days: number): number[] {
  // oxlint-disable-next-line unicorn/no-new-array -- days deliberately sets the array length.
  const counts = new Array<number>(days).fill(0);
  const today = localDayNumber(now);
  for (const row of rows) {
    const age = today - localDayNumber(row.modified);
    const index = days - 1 - age;
    if (index >= 0 && index < days) counts[index] += row.messageCount;
  }
  return counts;
}

/** The fixed message-count thresholds a glyph steps at: 0 / 1-9 / 10-49 / 50-199 / 200+. */
function glyphFor(count: number): string {
  if (count === 0) return GLYPHS[0];
  if (count < 10) return GLYPHS[1];
  if (count < 50) return GLYPHS[2];
  if (count < 200) return GLYPHS[3];
  return GLYPHS[4];
}

/**
 * One glyph per day, oldest to newest. A pane too narrow for the whole strip
 * loses the oldest days, never today — today is what you came to see.
 */
export function activityStrip(counts: readonly number[], width: number): string {
  const visible = counts.length > width ? counts.slice(counts.length - width) : counts;
  return visible.map(glyphFor).join("");
}

/** One `## ` entry from a journal: its heading split into a date and a brief. */
export interface JournalEntry {
  readonly date: string;
  readonly brief: string;
}

const HEADING_RE = /^## (.+)$/;
const BRIEF_MAX = 200;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}\u2026`;
}

/**
 * A heading's date and brief, split on whichever of `—` or ` - ` comes first.
 * No separator at all means no brief from the heading — the caller falls
 * back to the entry's body.
 */
function splitHeading(heading: string): { date: string; brief: string } {
  const emIndex = heading.indexOf("\u2014");
  const hyphenIndex = heading.indexOf(" - ");
  const useEm = emIndex >= 0 && (hyphenIndex < 0 || emIndex < hyphenIndex);
  const cut = useEm ? emIndex : hyphenIndex;
  const sepLen = useEm ? 1 : 3;
  if (cut < 0) return { date: heading.trim(), brief: "" };
  return { date: heading.slice(0, cut).trim(), brief: heading.slice(cut + sepLen).trim() };
}

function entryFrom(heading: string, body: readonly string[]): JournalEntry {
  const { date, brief } = splitHeading(heading);
  if (brief) return { date, brief: truncate(brief, BRIEF_MAX) };
  const fallback = body.find((line) => line.trim())?.trim() ?? "";
  return { date, brief: truncate(fallback, BRIEF_MAX) };
}

/**
 * Every `## ` entry in a journal, in file order (oldest first, matching the
 * append-only convention). No import from project-memory: this reads the
 * same convention it uses, without depending on it existing.
 */
export function parseJournal(text: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  let heading: string | undefined;
  let body: string[] = [];
  const flush = () => {
    if (heading !== undefined) entries.push(entryFrom(heading, body));
  };
  // Split on \r?\n so a CRLF journal's trailing \r never reaches HEADING_RE
  // — `.` in JS regex excludes \r, so `(.+)$` would otherwise never match.
  for (const line of text.split(/\r?\n/)) {
    const match = HEADING_RE.exec(line);
    if (match) {
      flush();
      heading = match[1]!.trim();
      body = [];
    } else if (heading !== undefined) {
      body.push(line);
    }
  }
  flush();
  return entries;
}

/**
 * Journals already read, keyed by path. Mirrors the transcript cache in
 * `transcript.ts`: the mtime is part of the entry, so an edit on disk is
 * picked up, and a cursor resting on a directory does not re-read the file
 * every render.
 */
const cache = new Map<string, { mtimeMs: number; entries: JournalEntry[] }>();

/**
 * Every entry in `<cwd>/.agent/JOURNAL.md`, oldest first — or an empty list
 * when the file is missing, unreadable, or has no `## ` heading. That is the
 * normal case for most directories, not an error, so nothing is reported.
 */
export function readJournal(cwd: string): JournalEntry[] {
  // A stale window snapshot (store.ts) can hand back an empty cwd; without
  // this guard that resolves `.agent/JOURNAL.md` against process.cwd() and
  // shows this repo's journal under a blank row.
  if (!cwd) return [];
  const journalPath = path.join(cwd, ".agent", "JOURNAL.md");
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(journalPath).mtimeMs;
  } catch {
    cache.delete(journalPath);
    return [];
  }
  const hit = cache.get(journalPath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.entries;
  let entries: JournalEntry[];
  try {
    entries = parseJournal(fs.readFileSync(journalPath, "utf8"));
  } catch {
    entries = [];
  }
  cache.set(journalPath, { mtimeMs, entries });
  return entries;
}
