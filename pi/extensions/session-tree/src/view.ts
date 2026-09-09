/**
 * The `/sessions` overlay: every pi session on the machine as a browsable
 * tree, with enter switching this window into the selected one.
 *
 * A transcript has exactly one writer, so a session another window holds open
 * is shown but cannot be entered from here.
 */

import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, TUI } from "@earendil-works/pi-tui";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import type { LiveWindow, WindowStore } from "./store.ts";
import type { SessionRow, TreeKey, TreeNode, TreeState } from "./tree.ts";
import { buildTree, flatten, navigate, selected } from "./tree.ts";

const REFRESH_MS = 1000;
const SIDEBAR_WIDTH = 44;
const MIN_DETAIL_WIDTH = 30;
/** Ctrl+X. Not in the keybindings manager, so it is matched literally. */
const KEY_CTRL_X = "\x18";
const KEY_CTRL_R = "\x12";

/** What the user asked the session view to do on close. */
export type ViewOutcome =
  | { readonly action: "switch"; readonly sessionPath: string }
  | { readonly action: "none" };

/** `/Users/me/src/app` → `~/src/app`, with long paths elided from the left. */
export function formatCwd(cwd: string, max = 34): string {
  const home = homedir();
  const short = cwd === home ? "~" : cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
  if (short.length <= max) return short;
  return `…${short.slice(short.length - max + 1)}`;
}

export function formatAge(from: number, to: number): string {
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

/**
 * Which tree move a keypress means, or undefined for anything else.
 *
 * Arrows go through matchesKey rather than literal escape sequences: a real
 * terminal sends `\x1bOC` in application cursor mode and a CSI-u encoding
 * under the Kitty protocol, so comparing against `\x1b[C` misses most of them.
 */
export function treeKeyFor(
  data: string,
  keys: Pick<KeybindingsManager, "matches">,
): TreeKey | undefined {
  if (keys.matches(data, "tui.select.up") || data === "k") return "up";
  if (keys.matches(data, "tui.select.down") || data === "j") return "down";
  if (matchesKey(data, "right") || data === "l") return "right";
  if (matchesKey(data, "left") || data === "h") return "left";
  return undefined;
}

/**
 * What enter does on a row. Only one process may append to a transcript, so a
 * session another window holds open is not switchable from here.
 */
export type EnterAction = "switch" | "current" | "busy" | "none";

export function enterActionFor(
  node: TreeNode | undefined,
  isOwn: (window: LiveWindow) => boolean,
): EnterAction {
  if (node?.kind !== "session") return "none";
  if (node.window) return isOwn(node.window) ? "current" : "busy";
  return node.session ? "switch" : "none";
}

/** Sidebar text for one node, without theming, so it can be asserted in tests. */
export function nodeLabel(node: TreeNode, expanded: boolean): string {
  if (node.kind === "directory") {
    const glyph = node.children.length === 0 ? " " : expanded ? "▾" : "▸";
    const open = node.children.filter((child) => child.window).length;
    return `${glyph} ${formatCwd(node.label)}${open > 0 ? ` (${open})` : ""}`;
  }
  return `  ${node.window ? "◆" : "·"} ${node.label}`;
}

/** The detail pane body for a selection, as plain lines. */
export function detailLines(
  node: TreeNode | undefined,
  now: number,
  isOwn: (window: LiveWindow) => boolean,
): string[] {
  if (!node) return ["Nothing selected."];

  if (node.kind === "directory") {
    const open = node.children.filter((child) => child.window).length;
    return [
      node.cwd,
      "",
      `sessions  ${node.children.length} (${open} open now)`,
      "",
      "→ to list them.",
    ];
  }

  const window = node.window;
  const session = node.session;
  const hint = !window
    ? "⏎ to switch this window into this session."
    : isOwn(window)
      ? "This is the session you are in."
      : `Open in pi ${window.pid} — switch there, or close it first.`;
  return [
    node.label,
    "",
    `directory  ${node.cwd}`,
    ...(session ? [`messages   ${session.messageCount}`] : []),
    ...(session ? [`last used  ${formatAge(session.modified, now)} ago`] : []),
    ...(window
      ? [`open in    pi ${window.pid}`, `uptime     ${formatAge(window.startedAt, now)}`]
      : []),
    ...(session ? ["", `transcript ${session.path}`] : []),
    "",
    hint,
  ];
}

class SessionTreeView implements Component, Focusable {
  focused = false;

  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly keybindings: KeybindingsManager;
  private readonly store: WindowStore;
  private readonly sessions: readonly SessionRow[];
  private readonly hidden: Set<string>;
  private readonly done: (value: ViewOutcome) => void;

  private readonly ticker: ReturnType<typeof setInterval>;
  private roots: TreeNode[] = [];
  private state: TreeState = { expanded: new Set<string>() };
  private closed = false;

  constructor(
    tui: TUI,
    theme: Theme,
    keybindings: KeybindingsManager,
    store: WindowStore,
    sessions: readonly SessionRow[],
    hidden: Set<string>,
    done: (value: ViewOutcome) => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.store = store;
    this.sessions = sessions;
    this.hidden = hidden;
    this.done = done;
    this.refresh();
    // Expand every directory with a window open and land on your own session,
    // so the common case needs no keys.
    const expanded = new Set<string>();
    let selectedId: string | undefined;
    for (const directory of this.roots) {
      const live = directory.children.filter((child) => child.window);
      if (live.length === 0) continue;
      expanded.add(directory.id);
      for (const child of live) {
        if (child.window && store.isOwn(child.window)) selectedId = child.id;
      }
    }
    this.state = selectedId ? { expanded, selectedId } : { expanded };
    this.ticker = setInterval(() => this.tick(), REFRESH_MS);
    this.ticker.unref?.();
  }

  /**
   * A refresh must never take the session down: the store can vanish mid-read
   * during shutdown, and this runs on a timer with no caller to catch it.
   */
  private tick(): void {
    if (this.closed) return;
    try {
      this.refresh();
      this.tui.requestRender();
    } catch {
      clearInterval(this.ticker);
    }
  }

  private refresh(): void {
    this.roots = buildTree(this.sessions, this.store.read(), this.hidden);
  }

  private cleanup(): boolean {
    if (this.closed) return false;
    this.closed = true;
    clearInterval(this.ticker);
    return true;
  }

  dispose(): void {
    this.cleanup();
  }

  private close(outcome: ViewOutcome): void {
    if (this.cleanup()) this.done(outcome);
  }

  handleInput(data: string): void {
    const keys = this.keybindings;
    if (keys.matches(data, "tui.select.cancel")) {
      this.close({ action: "none" });
      return;
    }

    const node = selected(flatten(this.roots, this.state.expanded), this.state);

    if (keys.matches(data, "tui.select.confirm")) {
      this.enter(node);
      return;
    }
    if (data === KEY_CTRL_X && node) {
      this.hidden.add(node.id);
      this.refresh();
      this.tui.requestRender();
      return;
    }
    if (data === KEY_CTRL_R && this.hidden.size > 0) {
      this.hidden.clear();
      this.refresh();
      this.tui.requestRender();
      return;
    }

    const key = treeKeyFor(data, keys);
    if (!key) return;
    // Right on a session means the same as enter: keep going in the direction
    // you were already travelling. Left walks back out, and once you are in a
    // session, left on an empty editor reopens this view.
    if (key === "right" && node?.kind === "session") {
      this.enter(node);
      return;
    }
    this.state = navigate(this.roots, this.state, key);
    this.tui.requestRender();
  }

  /** Enter the selected row, when there is anything to enter. */
  private enter(node: TreeNode | undefined): void {
    const action = enterActionFor(node, (window) => this.store.isOwn(window));
    // "current", "busy" and "none" have nothing to open; the detail pane
    // already says why.
    if (action === "switch" && node?.session) {
      this.close({ action: "switch", sessionPath: node.session.path });
    }
  }

  render(width: number): string[] {
    const theme = this.theme;
    const now = Date.now();
    const visible = flatten(this.roots, this.state.expanded);
    const current = selected(visible, this.state);
    const rows = this.tui.terminal.rows || 30;
    // Leave pi's own footer row visible.
    const bodyHeight = Math.max(6, rows - 5);
    const sidebarWidth =
      width - SIDEBAR_WIDTH - 3 >= MIN_DETAIL_WIDTH
        ? SIDEBAR_WIDTH
        : Math.max(12, Math.floor(width / 2) - 2);
    const detailWidth = Math.max(0, width - sidebarWidth - 3);

    let open = 0;
    let sessions = 0;
    for (const directory of this.roots) {
      sessions += directory.children.length;
      open += directory.children.filter((child) => child.window).length;
    }

    const lines: string[] = [];
    lines.push(
      truncateToWidth(
        `  ${theme.fg("accent", theme.bold("Sessions"))}  ${theme.fg(
          "muted",
          `${open} open · ${sessions} session${sessions === 1 ? "" : "s"} · ${this.roots.length} director${this.roots.length === 1 ? "y" : "ies"}`,
        )}`,
        width,
      ),
    );
    lines.push(theme.fg("border", "─".repeat(width)));

    const sidebar = this.renderSidebar(visible, current, sidebarWidth, bodyHeight);
    const detail = this.renderDetail(current, detailWidth, bodyHeight, now);
    for (let i = 0; i < bodyHeight; i++) {
      const left = pad(sidebar[i] ?? "", sidebarWidth);
      lines.push(
        truncateToWidth(`${left} ${theme.fg("border", "│")} ${detail[i] ?? ""}`, width),
      );
    }

    lines.push(theme.fg("border", "─".repeat(width)));
    lines.push(
      truncateToWidth(
        theme.fg(
          "dim",
          "  ↑↓ move · →/⏎ enter · ← back · ^x hide" +
            (this.hidden.size > 0 ? ` · ^r restore ${this.hidden.size}` : "") +
            " · esc close",
        ),
        width,
      ),
    );
    return lines;
  }

  private renderSidebar(
    visible: readonly TreeNode[],
    current: TreeNode | undefined,
    width: number,
    height: number,
  ): string[] {
    const theme = this.theme;
    if (visible.length === 0) return [theme.fg("dim", " No pi sessions found.")];

    // Scroll so the cursor stays on screen without jumping around.
    const index = Math.max(0, visible.findIndex((node) => node.id === current?.id));
    const start =
      visible.length <= height
        ? 0
        : Math.min(Math.max(0, index - Math.floor(height / 2)), visible.length - height);

    const out: string[] = [];
    for (const node of visible.slice(start, start + height)) {
      const text = truncateToWidth(
        nodeLabel(node, this.state.expanded.has(node.id)),
        width - 1,
      );
      const tone = node.kind === "directory" || node.window ? "text" : "muted";
      out.push(
        node.id === current?.id
          ? theme.bg("selectedBg", theme.fg("accent", pad(text, width)))
          : theme.fg(tone, text),
      );
    }
    return out;
  }

  private renderDetail(
    node: TreeNode | undefined,
    width: number,
    height: number,
    now: number,
  ): string[] {
    const theme = this.theme;
    return detailLines(node, now, (window) => this.store.isOwn(window))
      .slice(0, height)
      .map((line, i) =>
        truncateToWidth(
          i === 0 ? theme.bold(theme.fg("text", line)) : theme.fg("muted", line),
          width,
        ),
      );
  }

  invalidate(): void {}
}

function pad(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

/** Opens the session overlay and resolves with what the user chose to do. */
export async function openSessionTree(
  ctx: {
    ui: {
      custom<T>(
        factory: (
          tui: TUI,
          theme: Theme,
          keybindings: KeybindingsManager,
          done: (value: T) => void,
        ) => Component,
        options?: Record<string, unknown>,
      ): Promise<T>;
    };
  },
  store: WindowStore,
  sessions: readonly SessionRow[],
  hidden: Set<string>,
): Promise<ViewOutcome> {
  return ctx.ui.custom<ViewOutcome>(
    (tui, theme, keybindings, done) =>
      new SessionTreeView(tui, theme, keybindings, store, sessions, hidden, done),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" },
    },
  );
}
