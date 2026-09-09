import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { LiveWindow } from "./src/store.ts";
import { isProcessAlive, parseWindow, WindowStore } from "./src/store.ts";
import type { SessionRow } from "./src/tree.ts";
import { buildTree, compactTitle, flatten, navigate, selected } from "./src/tree.ts";
import {
  detailLines,
  enterActionFor,
  formatAge,
  formatCwd,
  nodeLabel,
  treeKeyFor,
} from "./src/view.ts";

const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function window(over: Partial<LiveWindow> = {}): LiveWindow {
  return {
    pid: 1,
    owner: "owner-1",
    cwd: "/repo/a",
    startedAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function session(over: Partial<SessionRow> = {}): SessionRow {
  return {
    path: "/sessions/a/1.jsonl",
    cwd: "/repo/a",
    firstMessage: "fix the parser",
    modified: 1000,
    messageCount: 4,
    ...over,
  };
}

const isMine = (w: LiveWindow) => w.owner === "mine";
const never = () => false;

// --- store -----------------------------------------------------------------

test("publish then read round-trips a window", () => {
  const store = new WindowStore(tempDir("stree-"), 111, () => true);
  store.publish("/repo/a", { title: "the big refactor", sessionFile: "/s/1.jsonl" });
  const [read] = store.read();
  assert.equal(read?.pid, 111);
  assert.equal(read?.cwd, "/repo/a");
  assert.equal(read?.title, "the big refactor");
  assert.equal(read?.sessionFile, "/s/1.jsonl");
  assert.equal(store.isOwn(read!), true);
});

test("publishing twice replaces rather than appends", () => {
  const dir = tempDir("stree-");
  const store = new WindowStore(dir, 111, () => true);
  store.publish("/repo/a", { title: "first" });
  store.publish("/repo/a", { title: "second" });
  const windows = store.read();
  assert.equal(windows.length, 1);
  assert.equal(windows[0]?.title, "second");
  assert.equal(fs.readdirSync(dir).length, 1, "no temp files left behind");
});

test("a dead window's file is unlinked on read", () => {
  const dir = tempDir("stree-");
  new WindowStore(dir, 999, () => true).publish("/repo/gone");
  const live = new WindowStore(dir, 111, (pid) => pid !== 999);
  assert.deepEqual(live.read(), []);
  assert.deepEqual(fs.readdirSync(dir), [], "the stale file is removed");
});

test("a recycled pid does not make another window's session look like ours", () => {
  const dir = tempDir("stree-");
  new WindowStore(dir, 111, () => true, "ghost").publish("/repo/old");
  const mine = new WindowStore(dir, 111, () => true, "mine");
  const [ghost] = mine.read();
  assert.equal(ghost?.owner, "ghost");
  assert.equal(mine.isOwn(ghost!), false, "pid alone must not imply ownership");
});

test("close removes only this window's file", () => {
  const dir = tempDir("stree-");
  const a = new WindowStore(dir, 111, () => true);
  const b = new WindowStore(dir, 222, () => true);
  a.publish("/repo/a");
  b.publish("/repo/b");
  a.close();
  assert.deepEqual(
    b.read().map((w) => w.pid),
    [222],
  );
});

test("a corrupt file is discarded, not fatal", () => {
  const dir = tempDir("stree-");
  fs.writeFileSync(path.join(dir, "555.json"), "{not json");
  const store = new WindowStore(dir, 111, () => true);
  store.publish("/repo/a");
  assert.deepEqual(
    store.read().map((w) => w.pid),
    [111],
  );
});

test("parseWindow rejects structurally wrong payloads", () => {
  assert.equal(parseWindow("null"), undefined);
  assert.equal(parseWindow("[]"), undefined);
  assert.equal(parseWindow('{"pid":1}'), undefined, "missing owner/cwd");
  assert.equal(parseWindow('{"pid":"x","owner":"o","cwd":"/a"}'), undefined);
  assert.ok(parseWindow('{"pid":1,"owner":"o","cwd":"/a"}'));
});

test("isProcessAlive tracks the real process table", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(0x7ffffff), false);
});

// --- tree ------------------------------------------------------------------

test("a live window binds to the session row for the transcript it writes", () => {
  const roots = buildTree(
    [session(), session({ path: "/sessions/a/2.jsonl", modified: 900 })],
    [window({ sessionFile: "/sessions/a/1.jsonl" })],
  );
  assert.equal(roots.length, 1, "the same cwd must not appear twice");
  const [open, idle] = roots[0]!.children;
  assert.equal(open?.window?.pid, 1);
  assert.equal(idle?.window, undefined);
});

test("a window whose transcript is not in the list yet still gets a row", () => {
  const roots = buildTree(
    [],
    [window({ cwd: "/repo/new", sessionFile: "/s/new.jsonl", title: "just opened" })],
  );
  assert.equal(roots[0]?.cwd, "/repo/new");
  assert.equal(roots[0]?.children[0]?.label, "just opened");
});

test("directories with a window open sort above idle ones", () => {
  const roots = buildTree(
    [
      session({ cwd: "/repo/old", path: "/s/o", modified: 9_000 }),
      session({ cwd: "/repo/open", path: "/s/n", modified: 1 }),
    ],
    [window({ cwd: "/repo/open", sessionFile: "/s/n" })],
  );
  assert.deepEqual(
    roots.map((r) => r.cwd),
    ["/repo/open", "/repo/old"],
  );
});

test("a session is named by /name, else its first message", () => {
  const roots = buildTree(
    [
      session({ path: "/s/1", name: "the big refactor" }),
      session({ path: "/s/2", firstMessage: "why is the parser slow\nsecond line" }),
      session({ path: "/s/3", firstMessage: "(no messages)" }),
    ],
    [],
  );
  assert.deepEqual(
    roots[0]?.children.map((c) => c.label),
    ["the big refactor", "why is the parser slow", "(empty session)"],
  );
});

test("delegated child transcripts are not offered as sessions", () => {
  const roots = buildTree(
    [
      session({ path: "/s/1", name: "subagent: review-fleet" }),
      session({ path: "/s/2", name: "btw: check the weather" }),
      session({ path: "/s/3", name: "my work" }),
    ],
    [],
  );
  assert.deepEqual(
    roots[0]?.children.map((c) => c.label),
    ["my work"],
  );
});

test("hidden rows and their directories disappear", () => {
  const sessions = [session({ path: "/s/1" }), session({ path: "/s/2", cwd: "/repo/b" })];
  const hidden = new Set(["session:/s/2"]);
  const roots = buildTree(sessions, [], hidden);
  assert.deepEqual(
    roots.map((r) => r.cwd),
    ["/repo/a"],
    "a directory with nothing left in it is gone too",
  );
});

test("compactTitle takes one line and caps its length", () => {
  assert.equal(compactTitle("  hello   world \nignored"), "hello world");
  assert.equal(Array.from(compactTitle("x".repeat(200))).length, 60);
});

// --- navigation ------------------------------------------------------------

const navRoots = () =>
  buildTree(
    [
      session({ cwd: "/repo/a", path: "/s/a1" }),
      session({ cwd: "/repo/a", path: "/s/a2", modified: 500 }),
      session({ cwd: "/repo/b", path: "/s/b1" }),
    ],
    [window({ cwd: "/repo/a", sessionFile: "/s/a1" })],
  );

test("collapsed by default: only directories are visible", () => {
  const roots = navRoots();
  assert.deepEqual(
    flatten(roots, new Set()).map((n) => n.kind),
    ["directory", "directory"],
  );
});

test("right expands, right again steps into the first session", () => {
  const roots = navRoots();
  let state = { expanded: new Set<string>(), selectedId: roots[0]?.id };
  state = navigate(roots, state, "right");
  assert.equal(state.selectedId, roots[0]?.id, "expanding keeps the cursor put");
  assert.equal(flatten(roots, state.expanded).length, 4);
  state = navigate(roots, state, "right");
  assert.equal(state.selectedId, roots[0]?.children[0]?.id);
  assert.deepEqual(navigate(roots, state, "right"), state, "a session has no children");
});

test("left leaves a session, then collapses its directory", () => {
  const roots = navRoots();
  let state: TreeStateLike = {
    expanded: new Set([roots[0]!.id]),
    selectedId: roots[0]!.children[0]!.id,
  };
  state = navigate(roots, state, "left") as TreeStateLike;
  assert.equal(state.selectedId, roots[0]?.id, "left goes to the directory");
  state = navigate(roots, state, "left") as TreeStateLike;
  assert.equal(flatten(roots, state.expanded).length, 2, "directory collapsed");
  assert.deepEqual(navigate(roots, state, "left"), state, "nothing above a root");
});
type TreeStateLike = { expanded: Set<string>; selectedId?: string };

test("up and down wrap around the visible rows", () => {
  const roots = navRoots();
  let state = { expanded: new Set<string>(), selectedId: roots[0]?.id };
  state = navigate(roots, state, "up");
  assert.equal(state.selectedId, roots[1]?.id, "up from the top wraps to the bottom");
  state = navigate(roots, state, "down");
  assert.equal(state.selectedId, roots[0]?.id);
});

test("selection survives a rebuild and falls back when its row vanishes", () => {
  const roots = navRoots();
  const state = { expanded: new Set([roots[0]!.id]), selectedId: roots[0]!.children[0]!.id };
  assert.equal(selected(flatten(navRoots(), state.expanded), state)?.id, state.selectedId);
  const gone = { expanded: new Set<string>(), selectedId: "session:/s/nope" };
  assert.equal(selected(flatten(roots, gone.expanded), gone)?.id, roots[0]?.id);
});

// --- keys, labels, detail --------------------------------------------------

test("arrow keys navigate regardless of terminal cursor mode", () => {
  const keys = { matches: () => false };
  // Application cursor mode (\x1bO…) is what a real terminal sends inside an
  // alternate screen; the CSI form (\x1b[…) is the other half of the pair.
  assert.equal(treeKeyFor("\x1b[C", keys), "right");
  assert.equal(treeKeyFor("\x1bOC", keys), "right");
  assert.equal(treeKeyFor("\x1b[D", keys), "left");
  assert.equal(treeKeyFor("\x1bOD", keys), "left");
  assert.equal(treeKeyFor("l", keys), "right");
  assert.equal(treeKeyFor("h", keys), "left");
  assert.equal(treeKeyFor("x", keys), undefined);
  assert.equal(
    treeKeyFor("\x1b[A", { matches: (_d, id) => id === "tui.select.up" }),
    "up",
  );
});

test("enter switches into a free session and refuses one already open", () => {
  const roots = buildTree(
    [session({ path: "/s/mine" }), session({ path: "/s/theirs" }), session({ path: "/s/free" })],
    [
      window({ owner: "mine", sessionFile: "/s/mine" }),
      window({ owner: "theirs", pid: 2, sessionFile: "/s/theirs" }),
    ],
  );
  const byPath = (p: string) => roots[0]!.children.find((c) => c.session?.path === p);
  assert.equal(enterActionFor(byPath("/s/free"), isMine), "switch");
  assert.equal(enterActionFor(byPath("/s/theirs"), isMine), "busy");
  assert.equal(enterActionFor(byPath("/s/mine"), isMine), "current");
  assert.equal(enterActionFor(roots[0], isMine), "none", "a directory opens nothing");
  assert.equal(enterActionFor(undefined, isMine), "none");
});

test("sidebar rows show the tree glyph, open marker, and open count", () => {
  const roots = navRoots();
  assert.match(nodeLabel(roots[0]!, false), /^▸ /);
  assert.match(nodeLabel(roots[0]!, true), /^▾ .*\(1\)$/);
  assert.match(nodeLabel(roots[0]!.children[0]!, false), /^ {2}◆ /);
  assert.match(nodeLabel(roots[0]!.children[1]!, false), /^ {2}· /);
});

test("the detail pane says what enter will do", () => {
  const roots = navRoots();
  const now = 100_000;
  assert.match(detailLines(roots[0], now, never).join("\n"), /sessions {2}2 \(1 open now\)/);
  const busy = detailLines(roots[0]!.children[0], now, never).join("\n");
  assert.match(busy, /Open in pi 1/);
  const free = detailLines(roots[0]!.children[1], now, never).join("\n");
  assert.match(free, /⏎ to switch this window into this session/);
  assert.match(free, /messages {3}4/);
  assert.match(
    detailLines(roots[0]!.children[0], now, () => true).join("\n"),
    /This is the session you are in/,
  );
  assert.deepEqual(detailLines(undefined, now, never), ["Nothing selected."]);
});

test("formatCwd shortens home and elides long paths from the left", () => {
  assert.equal(formatCwd(os.homedir()), "~");
  assert.equal(formatCwd(path.join(os.homedir(), "src/app")), "~/src/app");
  assert.equal(formatCwd(`/very/long/${"x".repeat(60)}/tail`, 12), "…xxxxxx/tail");
});

test("formatAge reads naturally at each scale", () => {
  assert.equal(formatAge(0, 5_000), "5s");
  assert.equal(formatAge(0, 90_000), "1m 30s");
  assert.equal(formatAge(0, 3_930_000), "1h 5m");
  assert.equal(formatAge(0, 200_000_000), "2d 7h");
});
