/**
 * The fleet tree: directory → session → agent.
 *
 * A session is one pi transcript. It is "live" when a running window has that
 * file open, in which case its subagents hang below it; otherwise it is
 * history you can switch back into.
 *
 * Pure data. Everything here is a function of the published window snapshots
 * plus pi's session list, so navigation can be tested without a terminal.
 */

import type { FleetAgent, FleetWindow } from "./store.ts";

/** The subset of pi's `SessionInfo` the tree needs. */
export interface SessionSummary {
  readonly path: string;
  readonly id: string;
  readonly cwd: string;
  readonly name?: string;
  readonly firstMessage: string;
  readonly modified: number;
  readonly messageCount: number;
}

export type FleetNodeKind = "directory" | "session" | "agent";

export interface FleetNode {
  /** Stable across refreshes; selection is tracked by this, never by row index. */
  readonly id: string;
  readonly kind: FleetNodeKind;
  readonly label: string;
  readonly depth: number;
  readonly children: readonly FleetNode[];
  /** Running descendants, used for the badge and for sorting. */
  readonly running: number;
  readonly cwd: string;
  /** Set on a session node when a live window has this transcript open. */
  readonly window?: FleetWindow;
  readonly agent?: FleetAgent;
  readonly session?: SessionSummary;
}

export interface TreeState {
  readonly expanded: ReadonlySet<string>;
  readonly selectedId?: string;
}

/** A session node is live exactly when a running window has it open. */
export const isLive = (node: FleetNode) =>
  node.kind === "session" && node.window !== undefined;

function agentNode(window: FleetWindow, agent: FleetAgent): FleetNode {
  return {
    id: `agent:${window.owner}:${agent.id}`,
    kind: "agent",
    label: agent.title,
    depth: 2,
    children: [],
    running: agent.status === "running" ? 1 : 0,
    cwd: agent.cwd,
    window,
    agent,
  };
}

/** Short human label for a session: its name, else its opening message. */
export function sessionLabel(
  session: SessionSummary | undefined,
  window: FleetWindow | undefined,
): string {
  const named = session?.name?.trim();
  if (named) return named;
  const first = session?.firstMessage?.trim().replace(/\s+/g, " ");
  if (first) return first.length > 60 ? `${first.slice(0, 59)}…` : first;
  return window ? `pi ${window.pid}` : "(empty session)";
}

function sessionNode(
  session: SessionSummary | undefined,
  window: FleetWindow | undefined,
  cwd: string,
): FleetNode {
  const children = window
    ? window.agents.map((agent) => agentNode(window, agent))
    : [];
  return {
    // Keyed by transcript path so the id survives a window opening or closing
    // it; a window with no transcript yet falls back to its owner id.
    id: `session:${session?.path ?? window?.sessionFile ?? `owner-${window?.owner}`}`,
    kind: "session",
    label: sessionLabel(session, window),
    depth: 1,
    children,
    running: children.reduce((sum, child) => sum + child.running, 0),
    cwd,
    window,
    session,
  };
}

/**
 * Builds the tree from live windows and pi's session list. A directory appears
 * if pi is running there now or has ever run there, so you can browse to an
 * idle project and start work in it.
 */
export function buildTree(
  windows: readonly FleetWindow[],
  sessions: readonly SessionSummary[],
): FleetNode[] {
  const windowByFile = new Map<string, FleetWindow>();
  const orphanWindows: FleetWindow[] = [];
  for (const window of windows) {
    if (window.sessionFile) windowByFile.set(window.sessionFile, window);
    else orphanWindows.push(window);
  }

  const byCwd = new Map<string, FleetNode[]>();
  const push = (cwd: string, node: FleetNode) => {
    const list = byCwd.get(cwd);
    if (list) list.push(node);
    else byCwd.set(cwd, [node]);
  };

  const claimed = new Set<string>();
  for (const session of sessions) {
    const window = windowByFile.get(session.path);
    if (window) claimed.add(session.path);
    push(session.cwd, sessionNode(session, window, session.cwd));
  }
  // A window whose transcript pi has not listed yet still belongs on the tree.
  for (const window of windows) {
    if (window.sessionFile && claimed.has(window.sessionFile)) continue;
    if (window.sessionFile || orphanWindows.includes(window)) {
      push(window.cwd, sessionNode(undefined, window, window.cwd));
    }
  }

  const directories: FleetNode[] = [];
  for (const [cwd, children] of byCwd) {
    const sorted = [...children].sort((a, b) => {
      const liveDelta = Number(isLive(b)) - Number(isLive(a));
      if (liveDelta !== 0) return liveDelta;
      return (b.session?.modified ?? 0) - (a.session?.modified ?? 0);
    });
    directories.push({
      id: `dir:${cwd}`,
      kind: "directory",
      label: cwd,
      depth: 0,
      children: sorted,
      running: sorted.reduce((sum, child) => sum + child.running, 0),
      cwd,
    });
  }

  // Busy directories first, then live ones, then by recency. The thing you
  // need to look at should never be below the fold.
  return directories.sort((a, b) => {
    if (a.running !== b.running) return b.running - a.running;
    const liveA = a.children.filter(isLive).length;
    const liveB = b.children.filter(isLive).length;
    if (liveA !== liveB) return liveB - liveA;
    return newest(b) - newest(a);
  });
}

function newest(node: FleetNode): number {
  return node.children.reduce(
    (max, child) => Math.max(max, child.session?.modified ?? 0),
    0,
  );
}

/**
 * Drops hidden nodes and recomputes the running roll-up, so hiding a busy row
 * also clears the badge its parents were showing for it.
 */
export function prune(
  nodes: readonly FleetNode[],
  hidden: ReadonlySet<string>,
): FleetNode[] {
  const out: FleetNode[] = [];
  for (const node of nodes) {
    if (hidden.has(node.id)) continue;
    const children = prune(node.children, hidden);
    out.push({
      ...node,
      children,
      running:
        node.kind === "agent"
          ? node.running
          : children.reduce((sum, child) => sum + child.running, 0),
    });
  }
  return out;
}

/** The nodes currently visible, in display order, honouring collapsed parents. */
export function flatten(
  nodes: readonly FleetNode[],
  expanded: ReadonlySet<string>,
): FleetNode[] {
  const out: FleetNode[] = [];
  const walk = (list: readonly FleetNode[]) => {
    for (const node of list) {
      out.push(node);
      if (expanded.has(node.id) && node.children.length > 0) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** The node a state points at, falling back to the first row. */
export function selected(
  visible: readonly FleetNode[],
  state: TreeState,
): FleetNode | undefined {
  return visible.find((node) => node.id === state.selectedId) ?? visible[0];
}

function move(visible: readonly FleetNode[], state: TreeState, delta: number): TreeState {
  if (visible.length === 0) return state;
  const current = visible.findIndex((node) => node.id === state.selectedId);
  const from = current >= 0 ? current : 0;
  const next = (from + delta + visible.length) % visible.length;
  return { ...state, selectedId: visible[next]?.id };
}

function parentOf(
  nodes: readonly FleetNode[],
  id: string,
): FleetNode | undefined {
  for (const node of nodes) {
    if (node.children.some((child) => child.id === id)) return node;
    const deeper = parentOf(node.children, id);
    if (deeper) return deeper;
  }
  return undefined;
}

export type TreeKey = "up" | "down" | "left" | "right";

/**
 * Arrow-key navigation over the tree.
 *
 * right: expand a collapsed node, or step into its first child.
 * left:  collapse an expanded node, or step out to its parent.
 */
export function navigate(
  roots: readonly FleetNode[],
  state: TreeState,
  key: TreeKey,
): TreeState {
  const visible = flatten(roots, state.expanded);
  if (key === "up") return move(visible, state, -1);
  if (key === "down") return move(visible, state, 1);

  const node = selected(visible, state);
  if (!node) return state;
  const expanded = new Set(state.expanded);

  if (key === "right") {
    if (node.children.length === 0) return state;
    if (!expanded.has(node.id)) {
      expanded.add(node.id);
      return { expanded, selectedId: node.id };
    }
    return { expanded, selectedId: node.children[0]?.id ?? node.id };
  }

  if (expanded.has(node.id)) {
    expanded.delete(node.id);
    return { expanded, selectedId: node.id };
  }
  const parent = parentOf(roots, node.id);
  return parent ? { expanded, selectedId: parent.id } : state;
}
