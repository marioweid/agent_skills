import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import type { FleetAgent, FleetWindow } from "./src/fleet/store.ts";
import {
  deleteSessionFiles,
  FleetStore,
  isProcessAlive,
  parseWindow,
} from "./src/fleet/store.ts";
import type { SessionSummary } from "./src/fleet/tree.ts";
import {
  buildTree,
  flatten,
  isLive,
  navigate,
  prune,
  selected,
  sessionLabel,
} from "./src/fleet/tree.ts";
import {
  detailLines,
  enterActionFor,
  formatAge,
  nodeLabel,
  openFleetView,
  removeActionFor,
} from "./src/ui/fleet.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tempDir = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

function agent(id: string, over: Partial<FleetAgent> = {}): FleetAgent {
  return {
    id,
    title: id,
    backend: "pi",
    model: "opus-5",
    cwd: "/repo/a",
    status: "running",
    createdAt: 1000,
    ...over,
  };
}

function window(over: Partial<FleetWindow> = {}): FleetWindow {
  return {
    pid: 1,
    owner: "mine",
    cwd: "/repo/a",
    sessionFile: "/sessions/a.jsonl",
    startedAt: 0,
    updatedAt: 0,
    agents: [],
    ...over,
  };
}

function session(over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    path: "/sessions/a.jsonl",
    id: "a",
    cwd: "/repo/a",
    firstMessage: "do the thing",
    modified: 5000,
    messageCount: 12,
    ...over,
  };
}

const isOwn = (w: FleetWindow) => w.owner === "mine";

// --- store -----------------------------------------------------------------

test("publish then read round-trips a window with its session file", () => {
  const store = new FleetStore(tempDir("fleet-"), 111, () => true);
  store.publish("/repo/a", [agent("sa-1", { role: "critic" })], "/sessions/a.jsonl");
  const [read] = store.read();
  assert.equal(read?.pid, 111);
  assert.equal(read?.sessionFile, "/sessions/a.jsonl");
  assert.equal(read?.agents[0]?.role, "critic");
  assert.equal(store.isOwn(read!), true);
});

test("publishing twice replaces rather than appends", () => {
  const dir = tempDir("fleet-");
  const store = new FleetStore(dir, 111, () => true);
  store.publish("/repo/a", [agent("sa-1"), agent("sa-2")]);
  store.publish("/repo/a", [agent("sa-1", { status: "done" })]);
  const windows = store.read();
  assert.equal(windows.length, 1);
  assert.deepEqual(
    windows[0]?.agents.map((a) => [a.id, a.status]),
    [["sa-1", "done"]],
  );
  assert.equal(fs.readdirSync(dir).length, 1, "no temp files left behind");
});

test("a dead window's file is unlinked on read", () => {
  const dir = tempDir("fleet-");
  new FleetStore(dir, 999, () => true).publish("/repo/gone", [agent("sa-1")]);
  const live = new FleetStore(dir, 111, (pid) => pid !== 999);
  assert.deepEqual(live.read(), []);
  assert.deepEqual(fs.readdirSync(dir), [], "the stale file is removed");
});

test("a recycled pid does not make another window's agents look like ours", () => {
  const dir = tempDir("fleet-");
  new FleetStore(dir, 111, () => true, "ghost").publish("/repo/old", [agent("sa-1")]);
  const mine = new FleetStore(dir, 111, () => true, "my-owner");
  const [ghost] = mine.read();
  assert.equal(ghost?.owner, "ghost");
  assert.equal(mine.isOwn(ghost!), false, "pid alone must not imply ownership");
});

test("close removes only this window's file", () => {
  const dir = tempDir("fleet-");
  const a = new FleetStore(dir, 111, () => true);
  const b = new FleetStore(dir, 222, () => true);
  a.publish("/repo/a", []);
  b.publish("/repo/b", []);
  a.close();
  assert.deepEqual(b.read().map((w) => w.pid), [222]);
});

test("a corrupt file is discarded, not fatal", () => {
  const dir = tempDir("fleet-");
  fs.writeFileSync(path.join(dir, "555.json"), "{not json");
  const store = new FleetStore(dir, 111, () => true);
  store.publish("/repo/a", []);
  assert.deepEqual(store.read().map((w) => w.pid), [111]);
});

test("parseWindow rejects structurally wrong payloads", () => {
  assert.equal(parseWindow("null"), undefined);
  assert.equal(parseWindow("[]"), undefined);
  assert.equal(parseWindow('{"pid":1}'), undefined, "missing owner/cwd/agents");
  assert.equal(parseWindow('{"pid":1,"owner":"o","cwd":"/a","agents":"nope"}'), undefined);
  assert.ok(parseWindow('{"pid":1,"owner":"o","cwd":"/a","agents":[]}'));
});

test("isProcessAlive tracks the real process table", () => {
  assert.equal(isProcessAlive(process.pid), true);
  assert.equal(isProcessAlive(0x7ffffff), false);
});

test("four real processes publish concurrently without corrupting each other", () => {
  const dir = tempDir("fleet-mp-");
  const file = path.join(dir, "worker.mjs");
  fs.writeFileSync(
    file,
    `import { FleetStore } from ${JSON.stringify(path.join(here, "src/fleet/store.ts"))};
     const store = new FleetStore(${JSON.stringify(dir)});
     for (let i = 0; i < 200; i++) {
       store.publish("/repo/" + process.argv[2], [
         { id: "sa-1", title: "t", backend: "pi", cwd: "/w", status: "running", createdAt: 0 },
       ]);
       store.read();
     }
     process.stdout.write("ok");`,
  );
  const results = ["a", "b", "c", "d"].map((name) =>
    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "--no-warnings", file, name],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(results, ["ok", "ok", "ok", "ok"]);
  assert.deepEqual(new FleetStore(dir, process.pid).read(), [], "all pids exited");
});

test("deleting a session removes the transcript and its artifact directory", () => {
  const dir = tempDir("sess-");
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
  assert.equal(deleteSessionFiles(path.join(tempDir("sess-"), "gone.jsonl")), true);
});

// --- tree ------------------------------------------------------------------

test("a window and its session collapse into one live node", () => {
  const roots = buildTree([window({ agents: [agent("sa-1")] })], [session()]);
  assert.equal(roots.length, 1);
  assert.equal(roots[0]?.children.length, 1, "no duplicate row for the window");
  const node = roots[0]!.children[0]!;
  assert.equal(isLive(node), true);
  assert.equal(node.children.length, 1, "its subagents hang below it");
  assert.equal(roots[0]?.running, 1);
});

test("sessions with no live window still appear, so you can switch back", () => {
  const roots = buildTree([], [session({ path: "/s/old.jsonl", firstMessage: "old work" })]);
  assert.equal(roots[0]?.children.length, 1);
  assert.equal(isLive(roots[0]!.children[0]!), false);
});

test("a window whose transcript pi has not listed yet is not dropped", () => {
  const roots = buildTree([window({ sessionFile: "/sessions/brand-new.jsonl" })], []);
  assert.equal(roots[0]?.children.length, 1);
  assert.equal(isLive(roots[0]!.children[0]!), true);
});

test("live sessions sort above history within a directory", () => {
  const roots = buildTree(
    [window({ sessionFile: "/s/live.jsonl" })],
    [
      session({ path: "/s/recent.jsonl", modified: 9000 }),
      session({ path: "/s/live.jsonl", modified: 1 }),
    ],
  );
  assert.deepEqual(
    roots[0]?.children.map((c) => c.session?.path),
    ["/s/live.jsonl", "/s/recent.jsonl"],
  );
});

test("busy directories sort above idle ones", () => {
  const roots = buildTree(
    [
      window({ owner: "w1", cwd: "/repo/quiet", sessionFile: "/s/q.jsonl" }),
      window({ owner: "w2", cwd: "/repo/busy", sessionFile: "/s/b.jsonl", agents: [agent("sa-1")] }),
    ],
    [session({ path: "/s/old.jsonl", cwd: "/repo/old", modified: 100 })],
  );
  assert.deepEqual(roots.map((r) => r.cwd), ["/repo/busy", "/repo/quiet", "/repo/old"]);
});

test("sessionLabel prefers a name, then the opening message", () => {
  assert.equal(sessionLabel(session({ name: "refactor" }), undefined), "refactor");
  assert.equal(sessionLabel(session({ firstMessage: "  fix   the bug " }), undefined), "fix the bug");
  assert.equal(sessionLabel(session({ firstMessage: "x".repeat(80) }), undefined).length, 60);
  assert.equal(sessionLabel(undefined, window({ pid: 42 })), "pi 42");
  assert.equal(sessionLabel(undefined, undefined), "(empty session)");
});

// --- navigation ------------------------------------------------------------

const navRoots = () =>
  buildTree(
    [
      window({ owner: "w1", cwd: "/repo/a", sessionFile: "/s/a.jsonl", agents: [agent("sa-1"), agent("sa-2")] }),
      window({ owner: "w2", cwd: "/repo/b", sessionFile: "/s/b.jsonl", agents: [agent("sa-3")] }),
    ],
    [session({ path: "/s/a.jsonl", cwd: "/repo/a" }), session({ path: "/s/b.jsonl", cwd: "/repo/b" })],
  );

test("collapsed by default: only directories are visible", () => {
  assert.deepEqual(
    flatten(navRoots(), new Set()).map((n) => n.kind),
    ["directory", "directory"],
  );
});

test("right expands, right again steps into the first child", () => {
  const roots = navRoots();
  let state = { expanded: new Set<string>(), selectedId: roots[0]?.id };
  state = navigate(roots, state, "right");
  assert.equal(state.selectedId, roots[0]?.id, "expanding keeps the cursor put");
  assert.equal(flatten(roots, state.expanded).length, 3, "session row appeared");

  state = navigate(roots, state, "right");
  assert.equal(state.selectedId, roots[0]?.children[0]?.id, "stepped into the session");

  state = navigate(roots, state, "right");
  state = navigate(roots, state, "right");
  assert.equal(selected(flatten(roots, state.expanded), state)?.kind, "agent");
});

test("left collapses, then walks back up the hierarchy", () => {
  const roots = navRoots();
  let state: { expanded: Set<string>; selectedId?: string } = {
    expanded: new Set<string>(),
    selectedId: roots[0]?.id,
  };
  for (let i = 0; i < 4; i++) state = navigate(roots, state, "right") as typeof state;
  assert.equal(selected(flatten(roots, state.expanded), state)?.kind, "agent");

  state = navigate(roots, state, "left") as typeof state;
  assert.equal(
    selected(flatten(roots, state.expanded), state)?.kind,
    "session",
    "a leaf has nothing to collapse, so left goes to the parent",
  );
  state = navigate(roots, state, "left") as typeof state;
  assert.equal(flatten(roots, state.expanded).length, 3, "session collapsed");
  state = navigate(roots, state, "left") as typeof state;
  assert.equal(selected(flatten(roots, state.expanded), state)?.kind, "directory");
});

test("right on a childless node does nothing", () => {
  const roots = buildTree([], [session({ path: "/s/idle.jsonl", cwd: "/repo/idle" })]);
  const state = { expanded: new Set([roots[0]!.id]), selectedId: roots[0]!.children[0]!.id };
  assert.deepEqual(navigate(roots, state, "right"), state);
});

test("up and down wrap around the visible rows", () => {
  const roots = navRoots();
  let state = { expanded: new Set<string>(), selectedId: roots[0]?.id };
  state = navigate(roots, state, "up");
  assert.equal(state.selectedId, roots[1]?.id, "up from the top wraps to the bottom");
  state = navigate(roots, state, "down");
  assert.equal(state.selectedId, roots[0]?.id);
});

test("session ids are keyed by transcript, so the cursor survives a rebuild", () => {
  const before = navRoots();
  const selectedId = before[0]!.children[0]!.id;
  // The window closes: same session, now history rather than live.
  const after = buildTree([], [session({ path: "/s/a.jsonl", cwd: "/repo/a" })]);
  assert.equal(
    selected(flatten(after, new Set([after[0]!.id])), { expanded: new Set([after[0]!.id]), selectedId })?.id,
    selectedId,
    "closing a window must not move the cursor",
  );
});

// --- enter -----------------------------------------------------------------

test("enter takes over own agents and ignores other windows'", () => {
  const roots = buildTree(
    [
      window({ owner: "mine", sessionFile: "/s/a.jsonl", agents: [agent("sa-1")] }),
      window({ owner: "theirs", cwd: "/repo/b", sessionFile: "/s/b.jsonl", agents: [agent("sa-2")] }),
    ],
    [],
  );
  const [mine, theirs] = roots.map((r) => r.children[0]!);
  assert.equal(enterActionFor(mine!.children[0]!, isOwn, undefined), "takeover");
  assert.equal(enterActionFor(theirs!.children[0]!, isOwn, undefined), "none");
});

test("enter switches into a session that nothing has open", () => {
  const roots = buildTree([], [session({ path: "/s/old.jsonl" })]);
  assert.equal(enterActionFor(roots[0]!.children[0]!, isOwn, undefined), "switch");
});

test("enter refuses a session another pi window is writing to", () => {
  const roots = buildTree([window({ owner: "theirs", sessionFile: "/s/a.jsonl" })], [session()]);
  assert.equal(
    enterActionFor(roots[0]!.children[0]!, isOwn, undefined),
    "busy-elsewhere",
    "two windows sharing one transcript would corrupt it",
  );
});

test("enter on the session you are already in says so", () => {
  const roots = buildTree([window({ sessionFile: "/s/a.jsonl" })], [session()]);
  assert.equal(enterActionFor(roots[0]!.children[0]!, isOwn, "/sessions/a.jsonl"), "already-here");
});

test("enter on a directory just expands it", () => {
  assert.equal(enterActionFor(navRoots()[0]!, isOwn, undefined), "expand");
});

// --- ctrl+x ----------------------------------------------------------------

test("ctrl+x forgets settled own agents and confirms before aborting running ones", () => {
  const roots = buildTree(
    [window({ agents: [agent("sa-1", { status: "done" }), agent("sa-2")] })],
    [session()],
  );
  const node = roots[0]!.children[0]!;
  assert.equal(removeActionFor(node.children[0]!, isOwn, undefined), "forget");
  assert.equal(removeActionFor(node.children[1]!, isOwn, undefined), "abort");
});

test("ctrl+x only hides another window's agent, which it would republish", () => {
  const roots = buildTree(
    [window({ owner: "theirs", sessionFile: "/s/b.jsonl", agents: [agent("sa-1")] })],
    [],
  );
  assert.equal(removeActionFor(roots[0]!.children[0]!.children[0]!, isOwn, undefined), "hide");
});

test("ctrl+x deletes a session nothing has open", () => {
  const roots = buildTree([], [session({ path: "/s/old.jsonl" })]);
  assert.equal(removeActionFor(roots[0]!.children[0]!, isOwn, undefined), "delete");
});

test("ctrl+x refuses, rather than silently hiding, a transcript pi is writing to", () => {
  const live = buildTree([window({ owner: "theirs", sessionFile: "/sessions/a.jsonl" })], [session()]);
  assert.equal(removeActionFor(live[0]!.children[0]!, isOwn, undefined), "blocked-live");

  const current = buildTree([], [session({ path: "/s/here.jsonl" })]);
  assert.equal(
    removeActionFor(current[0]!.children[0]!, isOwn, "/s/here.jsonl"),
    "blocked-current",
    "the session this window is in must never be deletable",
  );
});

test("directories can only be hidden", () => {
  assert.equal(removeActionFor(navRoots()[0]!, isOwn, undefined), "hide");
});

test("hiding a node removes it and its subtree from the view", () => {
  const roots = navRoots();
  const pruned = prune(roots, new Set([roots[0]!.children[0]!.id]));
  assert.equal(pruned[0]?.children.length, 0);
  assert.equal(pruned.length, 2, "the directory itself stays");
});

test("hiding a running agent clears the badge its parents showed for it", () => {
  const roots = navRoots();
  assert.equal(roots[0]?.running, 2);
  const pruned = prune(roots, new Set([roots[0]!.children[0]!.children[0]!.id]));
  assert.equal(pruned[0]?.running, 1, "roll-up must follow what is visible");
  assert.equal(pruned[0]?.children[0]?.running, 1);
});

test("hiding everything leaves an empty tree, not a crash", () => {
  const roots = navRoots();
  assert.deepEqual(prune(roots, new Set(roots.map((r) => r.id))), []);
});

// --- rendering -------------------------------------------------------------

test("sidebar labels indent by depth and mark live vs history", () => {
  const roots = buildTree(
    [window({ agents: [agent("sa-1")] })],
    [session(), session({ path: "/s/old.jsonl", firstMessage: "old" })],
  );
  assert.match(nodeLabel(roots[0]!, false), /^▸ /);
  assert.match(nodeLabel(roots[0]!, true), /^▾ /);
  assert.match(nodeLabel(roots[0]!.children[0]!, false), /^ {2}▸ do the thing/);
  assert.match(nodeLabel(roots[0]!.children[1]!, false), /^ {2}· old$/, "history has no expander");
  assert.equal(nodeLabel(roots[0]!.children[0]!.children[0]!, false), "    ● sa-1");
});

test("a badge counts running agents; a settled agent shows a hollow glyph", () => {
  assert.match(nodeLabel(navRoots()[0]!, false), /\(2\)$/);
  const idle = buildTree([window({ agents: [agent("sa-1", { status: "done" })] })], [session()]);
  assert.doesNotMatch(nodeLabel(idle[0]!, false), /\(/);
  assert.equal(nodeLabel(idle[0]!.children[0]!.children[0]!, false), "    ○ sa-1");
});

test("the detail pane describes each kind of selection", () => {
  const roots = navRoots();
  const now = 100_000;
  assert.match(detailLines(roots[0], now).join("\n"), /sessions {2}1/);

  const live = detailLines(roots[0]!.children[0], now).join("\n");
  assert.match(live, /state {5}open in pi 1/);
  assert.match(live, /messages {2}12/);

  const agentDetail = detailLines(roots[0]!.children[0]!.children[0], now).join("\n");
  assert.match(agentDetail, /status {4}running/);
  assert.match(agentDetail, /model {5}opus-5/);

  assert.deepEqual(detailLines(undefined, now), ["Nothing selected."]);
});

test("the detail pane says 'You are here' for the current session", () => {
  const roots = buildTree([window({ sessionFile: "/sessions/a.jsonl" })], [session()]);
  const body = detailLines(roots[0]!.children[0], 100_000, "/sessions/a.jsonl").join("\n");
  assert.match(body, /state {5}this window/);
  assert.match(body, /You are here/);
});

test("formatAge reads naturally at each scale", () => {
  assert.equal(formatAge(0, 5_000), "5s");
  assert.equal(formatAge(0, 90_000), "1m 30s");
  assert.equal(formatAge(0, 3_930_000), "1h 5m");
  assert.equal(formatAge(0, 200_000_000), "2d 7h");
});

// --- keyboard ---------------------------------------------------------------

/**
 * Drives the real component through `handleInput`. The first version of ctrl+x
 * passed every unit test and still did nothing useful, because the view opens
 * with the one row it refuses to delete already selected.
 */
function harness(currentSessionPath: string | undefined, sessions: SessionSummary[]) {
  const store = new FleetStore(tempDir("probe-"), process.pid, () => true);
  store.publish("/repo/a", [], currentSessionPath);

  const theme = new Proxy({}, { get: () => (...a: unknown[]) => String(a.at(-1) ?? "") });
  const tui = { terminal: { rows: 30 }, requestRender() {} };
  const keys = {
    matches: (d: string, n: string) =>
      (n === "tui.select.cancel" && d === "\x1b") ||
      (n === "tui.select.confirm" && d === "\r") ||
      (n === "tui.select.down" && d === "\x1b[B"),
  };

  let component: { handleInput(d: string): void; render(w: number): string[] };
  let outcome: unknown = "open";
  const ctx = {
    ui: {
      custom: (factory: (t: unknown, th: unknown, k: unknown, done: (v: unknown) => void) => unknown) => {
        component = factory(tui, theme, keys, (v) => {
          outcome = v;
        }) as typeof component;
        return new Promise<never>(() => {});
      },
    },
  };
  void openFleetView(ctx as never, store, sessions, {
    forget: () => false,
    currentSessionPath: () => currentSessionPath,
  }, new Set());

  return {
    press: (data: string) => component.handleInput(data),
    footer: () => component.render(100).at(-1)?.trim() ?? "",
    rows: () =>
      component
        .render(100)
        .slice(2, 14)
        .map((line) => line.split("│")[0]?.trimEnd() ?? "")
        .filter(Boolean),
    outcome: () => outcome,
  };
}

const HERE = "/sessions/here.jsonl";
const twoSessions = (): SessionSummary[] => [
  session({ path: HERE, firstMessage: "current session", modified: 9 }),
  session({ path: "/sessions/old.jsonl", firstMessage: "old session", modified: 5 }),
];

test("the view opens on the session this window is in", () => {
  const view = harness(HERE, twoSessions());
  assert.match(view.rows().join("\n"), /current session {2}←/);
});

test("ctrl+x on the current session explains itself instead of hiding it", () => {
  const view = harness(HERE, twoSessions());
  const before = view.rows();
  view.press("\x18");
  assert.match(view.footer(), /You are in this session/);
  assert.deepEqual(view.rows(), before, "the row must not vanish");
  assert.equal(view.outcome(), "open", "and nothing is handed to the caller");
});

test("ctrl+x on another session asks the caller to delete it", () => {
  const view = harness(HERE, twoSessions());
  view.press("\x1b[B");
  view.press("\x18");
  assert.deepEqual(view.outcome(), {
    action: "delete",
    sessionPath: "/sessions/old.jsonl",
    label: "old session",
  });
});

test("ctrl+x on a directory hides it and says so", () => {
  const view = harness(undefined, twoSessions());
  assert.match(view.rows().join("\n"), /repo\/a/);
  view.press("\x18");
  assert.match(view.footer(), /Directories are not deleted/);
  assert.match(
    view.rows().join("\n"),
    /No pi sessions found/,
    "the directory and its sessions are hidden",
  );
});

test("escape closes with no action", () => {
  const view = harness(HERE, twoSessions());
  view.press("\x1b");
  assert.deepEqual(view.outcome(), { action: "none" });
});
