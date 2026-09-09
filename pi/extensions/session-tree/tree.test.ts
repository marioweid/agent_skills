import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { LiveWindow } from "./src/store.ts";
import { deleteSessionFiles, isProcessAlive, parseWindow, WindowStore } from "./src/store.ts";
import type { SessionRow, TreeState } from "./src/tree.ts";
import { buildTree, compactTitle, flatten, navigate, selected, sessionLabel } from "./src/tree.ts";
import { conversationFrom, lastUserText } from "./src/transcript.ts";
import {
  conversationLines,
  detailLines,
  nodeParts,
  enterActionFor,
  formatAge,
  formatCwd,
  nodeLabel,
  removeActionFor,
  openSessionTree,
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
    /This is the session you are in — ⏎ to go back to it/,
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

// --- ctrl+x -----------------------------------------------------------------

test("d deletes a session nothing has open", () => {
  const roots = buildTree([session({ path: "/s/old", cwd: "/repo/a" })], []);
  assert.equal(removeActionFor(roots[0]!.children[0]!), "delete-session");
});

test("d refuses, rather than deletes, a session with a live writer", () => {
  const roots = buildTree(
    [session({ path: "/s/live", cwd: "/repo/a" })],
    [window({ owner: "mine", sessionFile: "/s/live" })],
  );
  assert.equal(
    removeActionFor(roots[0]!.children[0]!),
    "blocked-open",
    "deleting a transcript being written to would corrupt it",
  );
  assert.equal(removeActionFor(roots[0]!), "none", "directories are never deleted");
});

// --- session deletion -------------------------------------------------------

test("deleting a session removes the transcript and its artifact directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sess-"));
  const transcript = path.join(dir, "s.jsonl");
  const artifacts = path.join(dir, "s");
  fs.writeFileSync(transcript, "{}\n");
  fs.mkdirSync(artifacts);
  fs.writeFileSync(path.join(artifacts, "blob.txt"), "x");

  assert.equal(deleteSessionFiles(transcript), true);
  assert.equal(fs.existsSync(transcript), false);
  assert.equal(fs.existsSync(artifacts), false, "artifacts must not be orphaned");
});

test("deleting an already-missing session is not an error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sess-"));
  assert.equal(deleteSessionFiles(path.join(dir, "gone.jsonl")), true);
});

// --- keyboard ---------------------------------------------------------------

/**
 * Drives the real component through `handleInput`. Unit-testing the action
 * functions alone is not enough: the first version of this feature had every
 * branch tested and still did nothing, because the key never reached the view.
 */
function harness(
  sessions: SessionRow[],
  windows: LiveWindow[],
  reload?: () => Promise<readonly SessionRow[]>,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-probe-"));
  const store = new WindowStore(dir, process.pid, () => true, "mine");
  const theme = new Proxy({}, { get: () => (...a: unknown[]) => String(a.at(-1) ?? "") });
  const tui = { terminal: { rows: 30 }, requestRender() {} };
  const keys = {
    matches: (d: string, n: string) =>
      (n === "tui.select.cancel" && d === "\x1b") ||
      (n === "tui.select.confirm" && d === "\r"),
  };

  let component: { handleInput(d: string): void; render(w: number): string[] };
  let outcome: unknown = "open";
  const ctx = {
    ui: {
      custom: (f: (t: unknown, th: unknown, k: unknown, done: (v: unknown) => void) => unknown) => {
        component = f(tui, theme, keys, (v) => {
          outcome = v;
        }) as typeof component;
        return new Promise<never>(() => {});
      },
    },
  };
  // The view reads live windows from the store, so publish them as files.
  for (const w of windows) {
    fs.writeFileSync(path.join(dir, `${w.pid}.json`), JSON.stringify(w));
  }
  void openSessionTree(ctx as never, store, sessions, reload);

  return {
    press: (d: string) => component.handleInput(d),
    footer: () => component.render(100).at(-1)?.trim() ?? "",
    screen: () => component.render(100).join("\n"),
    rows: () =>
      component.render(100).slice(2, 14).map((l) => l.split("│")[0]?.trimEnd() ?? "").filter(Boolean),
    outcome: () => outcome,
  };
}

test("dd deletes the session in place, without leaving the view", () => {
  const dir = tempDir("st-del-");
  const transcript = path.join(dir, "old.jsonl");
  fs.writeFileSync(transcript, "{}\n");
  const view = harness([session({ path: transcript, cwd: "/repo/a" })], []);
  view.press("l");
  view.press("l");

  view.press("d");
  assert.match(view.screen(), /Delete this session\?/, "the first d only asks");
  assert.equal(fs.existsSync(transcript), true);

  view.press("d");
  assert.equal(fs.existsSync(transcript), false);
  assert.deepEqual(view.rows(), [" No pi sessions found."], "the row and its empty directory go");
  assert.equal(view.outcome(), "open", "deleting must not close or reroute the window");
});

test("esc cancels the confirm popup instead of closing the view", () => {
  const dir = tempDir("st-keep-");
  const transcript = path.join(dir, "old.jsonl");
  fs.writeFileSync(transcript, "{}\n");
  const view = harness([session({ path: transcript, cwd: "/repo/a" })], []);
  view.press("l");
  view.press("l");
  view.press("d");
  view.press("\x1b");
  assert.equal(fs.existsSync(transcript), true);
  assert.doesNotMatch(view.screen(), /Delete this session\?/);
  assert.equal(view.outcome(), "open");
});

test("after a delete the cursor holds its place on the row above", () => {
  const dir = tempDir("st-place-");
  const paths = ["a", "b", "c"].map((name) => path.join(dir, `${name}.jsonl`));
  for (const file of paths) fs.writeFileSync(file, "{}\n");
  const view = harness(
    paths.map((file, i) => session({ path: file, lastMessage: `row ${i}`, modified: 3000 - i })),
    [],
  );
  view.press("l");
  view.press("l");
  view.press("j");
  assert.match(view.screen(), /│ row 1\s*$/m, "the middle row is selected");

  view.press("d");
  view.press("d");
  assert.equal(fs.existsSync(paths[1]!), false);
  assert.match(
    view.screen(),
    /│ row 0\s*$/m,
    "the row above takes the cursor, not the top of the tree",
  );
});

test("deleting a directory's last session lands on the directory above it", () => {
  const dir = tempDir("st-last-");
  const files = ["a", "b", "c"].map((name) => path.join(dir, `${name}.jsonl`));
  for (const file of files) fs.writeFileSync(file, "{}\n");
  const view = harness(
    files.map((file, i) => session({ path: file, cwd: `/repo/${i}`, modified: 3000 - i })),
    [],
  );
  // Down to the last directory, then into its only session.
  view.press("j");
  view.press("j");
  view.press("l");
  view.press("l");
  view.press("d");
  view.press("d");

  assert.doesNotMatch(view.rows().join("\n"), /repo\/2/, "the emptied directory goes too");
  assert.match(
    view.screen(),
    /│ \/repo\/1\s*$/m,
    "the cursor walks up past the vanished directory, not back to the top",
  );
});

test("n cancels the popup, and no other key deletes by accident", () => {
  const dir = tempDir("st-cancel-");
  const transcript = path.join(dir, "old.jsonl");
  fs.writeFileSync(transcript, "{}\n");
  const view = harness([session({ path: transcript, cwd: "/repo/a" })], []);
  view.press("l");
  view.press("l");
  view.press("d");
  view.press("n");
  assert.equal(fs.existsSync(transcript), true);
  assert.doesNotMatch(view.screen(), /Delete this session\?/);

  view.press("d");
  view.press("j");
  assert.equal(fs.existsSync(transcript), true, "only d or ⏎ may delete");
  assert.doesNotMatch(view.screen(), /Delete this session\?/);
});

test("the view rescans the session list, so a session still being written keeps up", async () => {
  let rows: SessionRow[] = [session({ path: "/s/live", firstMessage: "hey", messageCount: 1 })];
  const view = harness(rows, [], async () => rows);
  view.press("l");
  view.press("l");
  assert.match(view.rows().join("\n"), /hey/);

  rows = [session({ path: "/s/live", lastMessage: "and now the answer", messageCount: 4 })];
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  assert.match(view.rows().join("\n"), /and now the answer/, "the row follows the transcript");
  assert.match(view.screen(), /messages   4/, "and so does the detail pane");
});

test("d on a directory says there is nothing to remove, rather than looking dead", () => {
  const view = harness([session({ path: "/s/old", cwd: "/repo/a" })], []);
  const before = view.rows();
  view.press("d");
  assert.match(view.footer(), /Nothing to remove/);
  assert.deepEqual(view.rows(), before, "no row may vanish");
  assert.equal(view.outcome(), "open");
});

test("ctrl+x is not bound: pi handles it before the view would see it", () => {
  const view = harness([session({ path: "/s/old", cwd: "/repo/a" })], []);
  const before = view.rows();
  view.press("\x18");
  assert.deepEqual(view.rows(), before, "no row may vanish");
  assert.equal(view.outcome(), "open");
});

test("escape closes with no action", () => {
  const view = harness([session({ path: "/s/old", cwd: "/repo/a" })], []);
  view.press("\x1b");
  assert.deepEqual(view.outcome(), { action: "none" });
});

// --- conversation preview ---------------------------------------------------

const messageEntry = (role: string, content: unknown) => ({ type: "message", message: { role, content } });

test("the conversation is user and assistant text, without the machinery", () => {
  const turns = conversationFrom([
    { type: "model_change" },
    messageEntry("user", [{ type: "text", text: "ls" }]),
    messageEntry("assistant", [{ type: "toolCall", name: "bash" }]),
    messageEntry("toolResult", [{ type: "text", text: "total 48" }]),
    messageEntry("assistant", [
      { type: "thinking", text: "hidden" },
      { type: "text", text: "31 directories." },
    ]),
  ]);
  assert.deepEqual(turns, [
    { role: "user", text: "ls" },
    { role: "assistant", text: "31 directories." },
  ]);
});

test("a message with no text at all is not a turn", () => {
  assert.deepEqual(conversationFrom([messageEntry("assistant", [{ type: "toolCall" }])]), []);
  assert.deepEqual(conversationFrom([messageEntry("user", "   ")]), []);
  assert.deepEqual(conversationFrom([messageEntry("user", "plain string")]), [
    { role: "user", text: "plain string" },
  ]);
});

test("the row shows the last thing asked, not the first", () => {
  const turns = conversationFrom([
    messageEntry("user", "first"),
    messageEntry("assistant", "answer"),
    messageEntry("user", "last"),
    messageEntry("assistant", "answer"),
  ]);
  assert.equal(lastUserText(turns), "last");
  assert.equal(lastUserText([]), undefined);
  assert.equal(lastUserText([{ role: "assistant", text: "only me" }]), undefined);
});

test("a name outranks the last message, which outranks the first", () => {
  const row = session({ firstMessage: "how it started", lastMessage: "how it is going" });
  assert.equal(sessionLabel(row, undefined), "how it is going");
  assert.equal(sessionLabel({ ...row, name: "the refactor" }, undefined), "the refactor");
  assert.equal(sessionLabel(session({ firstMessage: "how it started" }), undefined), "how it started");
});

test("conversation lines mark who spoke and wrap to the pane", () => {
  const lines = conversationLines(
    [
      { role: "user", text: "a question that is longer than the pane is wide" },
      { role: "assistant", text: "short answer" },
    ],
    20,
  );
  assert.equal(lines[0]?.role, "user");
  assert.match(lines[0]?.text ?? "", /^\u203a /);
  assert.ok(lines.every((line) => line.text.length <= 20), "no line may overflow the pane");
  assert.ok(
    lines.some((line) => line.role === "none" && line.text === ""),
    "turns are separated by a blank line",
  );
  assert.deepEqual(lines.at(-1), { role: "assistant", text: "  short answer", styled: true });
});

test("answers go through the renderer they are given, prompts stay literal", () => {
  const lines = conversationLines(
    [
      { role: "user", text: "# not a heading" },
      { role: "assistant", text: "answer" },
    ],
    40,
    (text, width) => [`[md ${width}] ${text}`],
  );
  assert.deepEqual(lines[0], { role: "user", text: "\u203a # not a heading" });
  assert.deepEqual(lines.at(-1), { role: "assistant", text: "  [md 38] answer", styled: true });
});

test("a word longer than the pane is broken rather than dropped", () => {
  const lines = conversationLines([{ role: "user", text: "x".repeat(50) }], 20);
  assert.equal(lines.map((l) => l.text.trim().replace("\u203a ", "")).join(""), "x".repeat(50));
});

// --- window state ------------------------------------------------------------

test("a window's glyph reports what that pi is doing", () => {
  const tone = (state?: "working" | "waiting" | "idle") =>
    nodeParts(
      buildTree(
        [session({ path: "/s/1", cwd: "/repo/a" })],
        [window({ owner: "mine", sessionFile: "/s/1", ...(state ? { state } : {}) })],
      )[0]!.children[0]!,
      false,
    ).tone;
  assert.equal(tone("waiting"), "warning", "a question on screen is the one to notice");
  assert.equal(tone("working"), "accent");
  assert.equal(tone("idle"), "success");
  assert.equal(tone(undefined), "success", "a snapshot from an older build is not working");
});

test("a session with no window keeps its muted dot", () => {
  const node = buildTree([session({ path: "/s/1", cwd: "/repo/a" })], [])[0]!.children[0]!;
  assert.deepEqual(nodeParts(node, false).glyph, "  \u00b7");
  assert.equal(nodeParts(node, false).tone, "muted");
});

test("state survives a publish/read round-trip and the detail pane names it", () => {
  const store = new WindowStore(tempDir("stree-state-"), 4242, () => true);
  store.publish("/repo/a", { sessionFile: "/s/1", state: "waiting" });
  const [read] = store.read();
  assert.equal(read?.state, "waiting");
  const node = buildTree([session({ path: "/s/1", cwd: "/repo/a" })], [read!])[0]!.children[0]!;
  assert.match(detailLines(node, 0, never).join("\n"), /state {6}input needed/);
});

test("an unknown state in a snapshot is dropped rather than shown", () => {
  const parsed = parseWindow(
    JSON.stringify({ pid: 1, owner: "o", cwd: "/repo/a", state: "on fire" }),
  );
  assert.equal(parsed?.state, undefined);
});

// --- new sessions -------------------------------------------------------------

test("n asks for a new session in the selected directory, with an anchor to get there", () => {
  const view = harness(
    [session({ path: "/s/old", cwd: "/repo/a" }), session({ path: "/s/newer", cwd: "/repo/a", modified: 2000 })],
    [],
  );
  view.press("n");
  assert.deepEqual(view.outcome(), {
    action: "newSession",
    cwd: "/repo/a",
    anchor: "/s/newer",
  });
});

test("no anchor is offered when every session there has a window on it", () => {
  const view = harness(
    [session({ path: "/s/live", cwd: "/repo/a" })],
    [window({ owner: "theirs", pid: 9, sessionFile: "/s/live" })],
  );
  view.press("n");
  assert.deepEqual(view.outcome(), { action: "newSession", cwd: "/repo/a" });
});
