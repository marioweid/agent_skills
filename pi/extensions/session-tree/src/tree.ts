/**
 * The session tree: directory → session.
 *
 * Pure data. Everything here is a function of pi's session list plus the
 * published window snapshots, so navigation can be tested without a terminal.
 */

import type { LiveWindow } from "./store.ts";

export type TreeNodeKind = "directory" | "session";

/** One session transcript on disk, as reported by pi's session list. */
export interface SessionRow {
  readonly path: string;
  readonly cwd: string;
  /** Display name from `/name`, when the session has one. */
  readonly name?: string;
  /** First user message, or pi's "(no messages)" placeholder. */
  readonly firstMessage: string;
  /** Last thing the user asked, which is what the session is about now. */
  readonly lastMessage?: string;
  readonly modified: number;
  readonly messageCount: number;
}

export interface TreeNode {
  /** Stable across refreshes; selection is tracked by this, never by row index. */
  readonly id: string;
  readonly kind: TreeNodeKind;
  readonly label: string;
  readonly children: readonly TreeNode[];
  readonly cwd: string;
  /** The live window holding this session open, if any. */
  readonly window?: LiveWindow;
  readonly session?: SessionRow;
}

export interface TreeState {
  readonly expanded: ReadonlySet<string>;
  readonly selectedId?: string;
}

const TITLE_MAX_LENGTH = 60;

/** A one-line title from the first non-empty line of a message. */
export function compactTitle(text: string): string {
  const firstLine = text.split("\n").find((line) => line.trim())?.trim() ?? "";
  const title = firstLine.replace(/\s+/g, " ");
  const codePoints = Array.from(title);
  if (codePoints.length <= TITLE_MAX_LENGTH) return title;
  return `${codePoints.slice(0, TITLE_MAX_LENGTH - 1).join("")}…`;
}

/**
 * Transcripts written by delegated child agents, which extensions name
 * `subagent: …` / `btw: …` by convention. Switching a window into one is
 * meaningless: the child's parent owns that conversation.
 */
export function isChildSession(session: SessionRow): boolean {
  return /^(subagent|btw): /.test(session.name ?? "");
}

/**
 * What to call a session in the sidebar.
 *
 * A name you set yourself wins. Otherwise it is the last thing you asked,
 * not the first: a session you left an hour ago is easiest to recognise by
 * where it ended up, not by how it started.
 */
export function sessionLabel(
  session: SessionRow | undefined,
  window: LiveWindow | undefined,
): string {
  const named = session?.name?.trim();
  if (named) return named;
  const last = session?.lastMessage?.trim();
  if (last) return compactTitle(last);
  const title = window?.title?.trim();
  if (title) return title;
  const first = session?.firstMessage.trim();
  if (first && first !== "(no messages)") return compactTitle(first);
  return window ? `pi ${window.pid}` : "(empty session)";
}

function sessionNode(
  session: SessionRow | undefined,
  window: LiveWindow | undefined,
  key: string,
): TreeNode {
  return {
    id: `session:${key}`,
    kind: "session",
    label: sessionLabel(session, window),
    children: [],
    cwd: window?.cwd ?? session?.cwd ?? "",
    ...(window ? { window } : {}),
    ...(session ? { session } : {}),
  };
}

/** Newest activity first; a window that is open now always outranks a file. */
function sessionOrder(node: TreeNode): [number, number] {
  return [
    node.window ? 1 : 0,
    node.session?.modified ?? node.window?.updatedAt ?? 0,
  ];
}

/**
 * Builds the tree from pi's session list and the live windows.
 *
 * A window whose transcript is not in the list yet (it was created after the
 * list was read) still gets a row, so a pi you just opened shows up without
 * waiting for a rescan.
 */
export function buildTree(
  sessions: readonly SessionRow[],
  windows: readonly LiveWindow[],
): TreeNode[] {
  const windowsByFile = new Map<string, LiveWindow>();
  const unplaced: LiveWindow[] = [];
  for (const window of windows) {
    if (window.sessionFile) windowsByFile.set(window.sessionFile, window);
    else unplaced.push(window);
  }

  const nodes: TreeNode[] = [];
  for (const session of sessions) {
    if (isChildSession(session)) continue;
    nodes.push(sessionNode(session, windowsByFile.get(session.path), session.path));
    windowsByFile.delete(session.path);
  }
  for (const [file, window] of windowsByFile) {
    nodes.push(sessionNode(undefined, window, file));
  }
  for (const window of unplaced) {
    nodes.push(sessionNode(undefined, window, `window:${window.owner}`));
  }

  const byCwd = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    const list = byCwd.get(node.cwd);
    if (list) list.push(node);
    else byCwd.set(node.cwd, [node]);
  }

  const directories: TreeNode[] = [];
  for (const [cwd, list] of byCwd) {
    const children = list.sort((a, b) => {
      const [liveA, timeA] = sessionOrder(a);
      const [liveB, timeB] = sessionOrder(b);
      return liveA !== liveB ? liveB - liveA : timeB - timeA;
    });
    directories.push({
      id: `dir:${cwd}`,
      kind: "directory",
      label: cwd,
      children,
      cwd,
    });
  }

  // Directories with a window open first, then by recency. The thing you need
  // to look at should never be below the fold.
  return directories
    .sort((a, b) => {
      const liveA = a.children.filter((child) => child.window).length;
      const liveB = b.children.filter((child) => child.window).length;
      if (liveA !== liveB) return liveB - liveA;
      return lastActive(b) - lastActive(a);
    });
}

function lastActive(directory: TreeNode): number {
  let newest = 0;
  for (const child of directory.children) {
    newest = Math.max(newest, sessionOrder(child)[1]);
  }
  return newest;
}

/** The nodes currently visible, in display order, honouring collapsed parents. */
export function flatten(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: readonly TreeNode[]) => {
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
  visible: readonly TreeNode[],
  state: TreeState,
): TreeNode | undefined {
  return visible.find((node) => node.id === state.selectedId) ?? visible[0];
}

function move(visible: readonly TreeNode[], state: TreeState, delta: number): TreeState {
  if (visible.length === 0) return state;
  const current = visible.findIndex((node) => node.id === state.selectedId);
  const from = current >= 0 ? current : 0;
  const next = (from + delta + visible.length) % visible.length;
  return { ...state, selectedId: visible[next]?.id };
}

function parentOf(
  nodes: readonly TreeNode[],
  id: string,
): TreeNode | undefined {
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
 * right: expand a collapsed directory, or step into its first session.
 * left:  collapse an expanded directory, or step out to the one above.
 */
export function navigate(
  roots: readonly TreeNode[],
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

  if (expanded.has(node.id) && node.children.length > 0) {
    expanded.delete(node.id);
    return { expanded, selectedId: node.id };
  }
  const parent = parentOf(roots, node.id);
  return parent ? { expanded, selectedId: parent.id } : state;
}
