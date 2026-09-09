/**
 * `/fleet` — every pi session on the machine, as a browsable tree.
 *
 * Sidebar is directory → session → agent; the detail pane describes whatever
 * is selected. Enter switches into a session or takes over one of this
 * window's agents; ctrl+x removes the selected row.
 */

import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { FleetStore, FleetWindow } from "../fleet/store.ts";
import type { FleetNode, SessionSummary, TreeState } from "../fleet/tree.ts";
import {
  buildTree,
  flatten,
  isLive,
  navigate,
  prune,
  selected,
} from "../fleet/tree.ts";
import { formatCwd } from "./takeover.ts";

const REFRESH_MS = 1000;
const SIDEBAR_WIDTH = 42;
const MIN_DETAIL_WIDTH = 30;

/** Ctrl+X / Ctrl+R are not in the keybindings manager, so match them literally. */
const KEY_CTRL_X = "\x18";
const KEY_CTRL_R = "\x12";

/** What the user asked the fleet view to do on close. */
export type FleetOutcome =
  | { readonly action: "takeover"; readonly agentId: string }
  | { readonly action: "spawn"; readonly cwd: string }
  | { readonly action: "abort"; readonly agentId: string; readonly title: string }
  | { readonly action: "switch"; readonly sessionPath: string; readonly label: string }
  | { readonly action: "delete"; readonly sessionPath: string; readonly label: string }
  | { readonly action: "none" };

/** The bits of the local session the fleet view is allowed to touch. */
export interface FleetControls {
  /** Drop a settled child of this window. False when it refuses. */
  forget(agentId: string): boolean;
  /** Transcript of the session running in this window, if it has one. */
  currentSessionPath(): string | undefined;
}

/**
 * What ⏎ does on a node. Only this window's own agents can be taken over, and
 * a session another window has open cannot be switched into — two pi processes
 * writing one transcript would corrupt it.
 */
export type EnterAction =
  | "takeover"
  | "switch"
  | "already-here"
  | "busy-elsewhere"
  | "expand"
  | "none";

export function enterActionFor(
  node: FleetNode,
  isOwn: (window: FleetWindow) => boolean,
  currentSessionPath: string | undefined,
): EnterAction {
  if (node.kind === "directory") return "expand";
  if (node.kind === "agent") {
    return node.window && isOwn(node.window) ? "takeover" : "none";
  }
  if (node.session?.path && node.session.path === currentSessionPath) {
    return "already-here";
  }
  if (isLive(node)) return node.window && isOwn(node.window) ? "already-here" : "busy-elsewhere";
  return node.session?.path ? "switch" : "none";
}

/**
 * What ctrl+x does on a node. Rows this window owns are really removed, and a
 * session that nothing has open can be deleted from disk. Anything else is
 * only hidden here, since its owner would republish it within the second.
 */
export type RemoveAction = "forget" | "abort" | "delete" | "hide";

export function removeActionFor(
  node: FleetNode,
  isOwn: (window: FleetWindow) => boolean,
  currentSessionPath: string | undefined,
): RemoveAction {
  if (node.kind === "agent") {
    if (!node.window || !isOwn(node.window)) return "hide";
    return node.agent?.status === "running" ? "abort" : "forget";
  }
  if (node.kind === "session") {
    // Never offer to delete a transcript that a running pi is writing to.
    if (isLive(node) || node.session?.path === currentSessionPath) return "hide";
    return node.session?.path ? "delete" : "hide";
  }
  return "hide";
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

function statusTone(status: string): "success" | "error" | "warning" | "muted" {
  if (status === "running") return "warning";
  if (status === "error") return "error";
  if (status === "done") return "success";
  return "muted";
}

/** Glyph per node kind: filled while work is running, hollow when idle. */
export function nodeGlyph(node: FleetNode, expanded: boolean): string {
  if (node.kind === "agent") return node.running > 0 ? "●" : "○";
  if (node.kind === "session") return isLive(node) ? (expanded ? "▾" : "▸") : "·";
  return expanded ? "▾" : "▸";
}

/** Sidebar text for one node, without theming, so it can be asserted in tests. */
export function nodeLabel(node: FleetNode, expanded: boolean): string {
  const indent = "  ".repeat(node.depth);
  const glyph = nodeGlyph(node, expanded);
  const label = node.kind === "directory" ? formatCwd(node.label) : node.label;
  const badge =
    node.kind !== "agent" && node.running > 0 ? ` (${node.running})` : "";
  return `${indent}${glyph} ${label}${badge}`;
}

/** The detail pane body for a selection, as plain lines. */
export function detailLines(
  node: FleetNode | undefined,
  now: number,
  currentSessionPath?: string,
): string[] {
  if (!node) return ["Nothing selected."];

  if (node.kind === "agent" && node.agent) {
    const agent = node.agent;
    return [
      agent.title,
      "",
      `status    ${agent.status}`,
      `role      ${agent.role ?? "(none)"}`,
      `harness   ${agent.backend}`,
      `model     ${agent.model ?? "?"}`,
      `directory ${agent.cwd}`,
      `age       ${formatAge(agent.createdAt, agent.settledAt ?? now)}`,
      ...(agent.tokens ? [`tokens    ${agent.tokens.toLocaleString()}`] : []),
    ];
  }

  if (node.kind === "session") {
    const session: SessionSummary | undefined = node.session;
    const here = session?.path === currentSessionPath;
    return [
      node.label,
      "",
      `state     ${here ? "this window" : isLive(node) ? `open in pi ${node.window?.pid}` : "not running"}`,
      `directory ${node.cwd}`,
      ...(session
        ? [
            `messages  ${session.messageCount}`,
            `modified  ${formatAge(session.modified, now)} ago`,
            `file      ${session.path}`,
          ]
        : ["(no transcript yet)"]),
      ...(node.window
        ? [`agents    ${node.window.agents.length}`, `uptime    ${formatAge(node.window.startedAt, now)}`]
        : []),
      "",
      here
        ? "You are here."
        : isLive(node)
          ? "Open in another pi window — switch there to use it."
          : "⏎ to switch this window into it · ^x to delete it",
    ];
  }

  return [
    node.cwd,
    "",
    `sessions  ${node.children.length}`,
    `live      ${node.children.filter(isLive).length}`,
    `running   ${node.running} agent${node.running === 1 ? "" : "s"}`,
    "",
    "→ to list its sessions.",
    "n  to start a new subagent here.",
  ];
}

class FleetView implements Component, Focusable {
  focused = false;

  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly keybindings: KeybindingsManager;
  private readonly store: FleetStore;
  private readonly sessions: readonly SessionSummary[];
  private readonly controls: FleetControls;
  private readonly hidden: Set<string>;
  private readonly done: (value: FleetOutcome) => void;

  private readonly ticker: ReturnType<typeof setInterval>;
  private roots: FleetNode[] = [];
  private state: TreeState = { expanded: new Set<string>() };
  private notice = "";
  private closed = false;

  constructor(
    tui: TUI,
    theme: Theme,
    keybindings: KeybindingsManager,
    store: FleetStore,
    sessions: readonly SessionSummary[],
    controls: FleetControls,
    hidden: Set<string>,
    done: (value: FleetOutcome) => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.store = store;
    this.sessions = sessions;
    this.controls = controls;
    this.hidden = hidden;
    this.done = done;
    this.refresh();

    // Open on this window's own session so the common case needs no keys.
    const here = this.controls.currentSessionPath();
    const directory = this.roots.find((dir) =>
      dir.children.some((child) => child.session?.path === here),
    );
    if (directory) {
      const expanded = new Set(this.state.expanded);
      expanded.add(directory.id);
      const own = directory.children.find((child) => child.session?.path === here);
      if (own) expanded.add(own.id);
      this.state = { expanded, selectedId: own?.id ?? directory.id };
    }

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
    const windows: FleetWindow[] = this.store.read();
    this.roots = prune(buildTree(windows, this.sessions), this.hidden);
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

  private close(outcome: FleetOutcome): void {
    if (this.cleanup()) this.done(outcome);
  }

  private isOwn = (window: FleetWindow) => this.store.isOwn(window);

  /** ⏎ on the current row. */
  private enter(node: FleetNode): void {
    switch (enterActionFor(node, this.isOwn, this.controls.currentSessionPath())) {
      case "takeover":
        this.close({ action: "takeover", agentId: node.agent?.id ?? "" });
        return;
      case "switch":
        this.close({
          action: "switch",
          sessionPath: node.session?.path ?? "",
          label: node.label,
        });
        return;
      case "already-here":
        this.notice = "That session is already open in this window.";
        return;
      case "busy-elsewhere":
        this.notice = `Open in pi ${node.window?.pid} — two windows cannot share one transcript.`;
        return;
      case "expand":
        this.state = navigate(this.roots, this.state, "right");
        return;
      default:
        this.notice = "Nothing to open here.";
    }
  }

  /** ctrl+x on the current row. Returns an outcome when it needs the caller. */
  private remove(node: FleetNode): FleetOutcome | undefined {
    const action = removeActionFor(
      node,
      this.isOwn,
      this.controls.currentSessionPath(),
    );
    if (action === "abort") {
      // Killing running work needs a confirmation, which cannot be shown from
      // inside this overlay, so hand it back to the command handler.
      return { action: "abort", agentId: node.agent?.id ?? "", title: node.label };
    }
    if (action === "delete") {
      return {
        action: "delete",
        sessionPath: node.session?.path ?? "",
        label: node.label,
      };
    }
    if (action === "forget" && this.controls.forget(node.agent?.id ?? "")) {
      return undefined;
    }
    this.hidden.add(node.id);
    return undefined;
  }

  handleInput(data: string): void {
    const keys = this.keybindings;
    this.notice = "";
    if (keys.matches(data, "tui.select.cancel")) {
      this.close({ action: "none" });
      return;
    }

    const node = selected(flatten(this.roots, this.state.expanded), this.state);

    if (keys.matches(data, "tui.select.confirm")) {
      if (node) this.enter(node);
      this.tui.requestRender();
      return;
    }
    if (data === "n" && node) {
      this.close({ action: "spawn", cwd: node.cwd });
      return;
    }
    if (data === KEY_CTRL_X && node) {
      const outcome = this.remove(node);
      if (outcome) {
        this.close(outcome);
        return;
      }
      this.keepCursorNear(node);
      this.tui.requestRender();
      return;
    }
    if (data === KEY_CTRL_R && this.hidden.size > 0) {
      this.hidden.clear();
      this.refresh();
      this.tui.requestRender();
      return;
    }

    const key =
      keys.matches(data, "tui.select.up") || data === "k"
        ? "up"
        : keys.matches(data, "tui.select.down") || data === "j"
          ? "down"
          : data === "\x1b[C" || data === "l"
            ? "right"
            : data === "\x1b[D" || data === "h"
              ? "left"
              : undefined;
    if (!key) return;
    this.state = navigate(this.roots, this.state, key);
    this.tui.requestRender();
  }

  /** After a row disappears, land on its neighbour rather than snapping home. */
  private keepCursorNear(removed: FleetNode): void {
    const before = flatten(this.roots, this.state.expanded);
    const index = before.findIndex((row) => row.id === removed.id);
    this.refresh();
    const after = flatten(this.roots, this.state.expanded);
    this.state = {
      ...this.state,
      selectedId: (after[index] ?? after[index - 1] ?? after[0])?.id,
    };
  }

  render(width: number): string[] {
    const theme = this.theme;
    const now = Date.now();
    const here = this.controls.currentSessionPath();
    const visible = flatten(this.roots, this.state.expanded);
    const current = selected(visible, this.state);
    const rows = this.tui.terminal.rows || 30;
    // Leave pi's own footer row visible, matching the /subagents dashboard.
    const bodyHeight = Math.max(6, rows - 5);
    const sidebarWidth =
      width - SIDEBAR_WIDTH - 3 >= MIN_DETAIL_WIDTH
        ? SIDEBAR_WIDTH
        : Math.max(12, Math.floor(width / 2) - 2);
    const detailWidth = Math.max(0, width - sidebarWidth - 3);

    const running = visible.filter((node) => node.kind === "agent" && node.running > 0).length;
    const live = visible.filter(isLive).length;

    const lines: string[] = [];
    lines.push(
      truncateToWidth(
        `  ${theme.fg("accent", theme.bold("Fleet"))}  ${theme.fg(
          "muted",
          `${running} running · ${live} live session${live === 1 ? "" : "s"} · ${this.roots.length} director${this.roots.length === 1 ? "y" : "ies"}`,
        )}`,
        width,
      ),
    );
    lines.push(theme.fg("border", "─".repeat(width)));

    const sidebar = this.renderSidebar(visible, current, sidebarWidth, bodyHeight, here);
    const detail = this.renderDetail(current, detailWidth, bodyHeight, now, here);
    for (let i = 0; i < bodyHeight; i++) {
      lines.push(
        truncateToWidth(
          `${pad(sidebar[i] ?? "", sidebarWidth)} ${theme.fg("border", "│")} ${detail[i] ?? ""}`,
          width,
        ),
      );
    }

    lines.push(theme.fg("border", "─".repeat(width)));
    lines.push(
      truncateToWidth(
        this.notice
          ? theme.fg("warning", `  ${this.notice}`)
          : theme.fg(
              "dim",
              "  ↑↓ move · →← nest · ⏎ open · n new · ^x remove" +
                (this.hidden.size > 0 ? ` · ^r restore ${this.hidden.size}` : "") +
                " · esc close",
            ),
        width,
      ),
    );
    return lines;
  }

  private renderSidebar(
    visible: readonly FleetNode[],
    current: FleetNode | undefined,
    width: number,
    height: number,
    here: string | undefined,
  ): string[] {
    const theme = this.theme;
    if (visible.length === 0) return [theme.fg("dim", " No pi sessions found.")];

    // Scroll so the cursor stays on screen without jumping around.
    const index = Math.max(0, visible.findIndex((node) => node.id === current?.id));
    const start =
      visible.length <= height
        ? 0
        : Math.min(
            Math.max(0, index - Math.floor(height / 2)),
            visible.length - height,
          );

    const out: string[] = [];
    for (const node of visible.slice(start, start + height)) {
      const isHere = node.session?.path !== undefined && node.session.path === here;
      const text = truncateToWidth(
        nodeLabel(node, this.state.expanded.has(node.id)) + (isHere ? "  ←" : ""),
        width - 1,
      );
      const tone =
        node.kind === "agent" && node.agent
          ? statusTone(node.agent.status)
          : node.running > 0 || isLive(node)
            ? "text"
            : "muted";
      out.push(
        node.id === current?.id
          ? theme.bg("selectedBg", theme.fg("accent", pad(text, width)))
          : theme.fg(tone, text),
      );
    }
    return out;
  }

  private renderDetail(
    node: FleetNode | undefined,
    width: number,
    height: number,
    now: number,
    here: string | undefined,
  ): string[] {
    const theme = this.theme;
    return detailLines(node, now, here)
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

/** Opens the fleet overlay and resolves with what the user chose to do. */
export async function openFleetView(
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
  store: FleetStore,
  sessions: readonly SessionSummary[],
  controls: FleetControls,
  hidden: Set<string>,
): Promise<FleetOutcome> {
  return ctx.ui.custom<FleetOutcome>(
    (tui, theme, keybindings, done) =>
      new FleetView(tui, theme, keybindings, store, sessions, controls, hidden, done),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" },
    },
  );
}
