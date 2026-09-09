/**
 * The `/sessions` overlay: every pi session on the machine as a browsable
 * tree, with enter switching this window into the selected one.
 *
 * A transcript has exactly one writer, so a session another window holds open
 * is shown but cannot be entered from here.
 */

import type { KeybindingsManager, Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import type { Component, Focusable, TUI } from "@earendil-works/pi-tui";
import { Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { homedir } from "node:os";
import type { LiveWindow, WindowStore } from "./store.ts";
import { deleteSessionFiles } from "./store.ts";
import type { Turn } from "./transcript.ts";
import { readConversation } from "./transcript.ts";
import type { SessionRow, TreeKey, TreeNode, TreeState } from "./tree.ts";
import { buildTree, flatten, navigate, selected } from "./tree.ts";

const REFRESH_MS = 1000;
const SIDEBAR_WIDTH = 44;
const MIN_DETAIL_WIDTH = 30;
/**
 * Remove, vim-style: `d` raises the confirm popup, the second `d` deletes.
 *
 * Not ctrl+x: pi binds that to `app.message.copy` and handles it before a
 * focused overlay sees it, so the key silently copies a chat message instead
 * of reaching this view. A plain letter is safe here — the tree has no text
 * input, and every other control is already a bare key.
 */
const KEY_REMOVE = "d";

/** What the user asked the session view to do on close. */
export type ViewOutcome =
  | { readonly action: "switch"; readonly sessionPath: string }
  | {
      readonly action: "newSession";
      readonly cwd: string;
      /**
       * An existing transcript in that directory with no window on it. pi can
       * only start a session in the directory it is already running in, so a
       * new session elsewhere means switching into that directory first.
       */
      readonly anchor?: string;
    }
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

/**
 * What `d` does on a row. Every row that cannot be removed says so, because a
 * key that silently does nothing is indistinguishable from a broken one.
 */
export type RemoveAction = "delete-session" | "blocked-open" | "none";

export function removeActionFor(node: TreeNode | undefined): RemoveAction {
  if (!node) return "none";
  if (node.kind === "session") {
    if (node.window) return "blocked-open";
    return node.session ? "delete-session" : "none";
  }
  return "none";
}

/** The colour of a row's glyph. A live window's glyph reports its state. */
export type GlyphTone = "muted" | "text" | "accent" | "warning" | "success";

export interface NodeParts {
  /** Indent plus the glyph, which is the only part coloured by state. */
  readonly glyph: string;
  readonly tone: GlyphTone;
  readonly text: string;
}

/**
 * A sidebar row, split so the glyph can be coloured on its own.
 *
 * A window that is waiting on a question is yellow, one still working is
 * accented, and one that has finished is green — the whole point of the tree
 * is seeing which window wants you without switching into it.
 */
export function nodeParts(node: TreeNode, expanded: boolean): NodeParts {
  if (node.kind === "directory") {
    const glyph = node.children.length === 0 ? " " : expanded ? "▾" : "▸";
    const open = node.children.filter((child) => child.window).length;
    return {
      glyph,
      tone: "text",
      text: `${formatCwd(node.label)}${open > 0 ? ` (${open})` : ""}`,
    };
  }
  const text = node.label;
  if (!node.window) return { glyph: "  ·", tone: "muted", text };
  const tone: GlyphTone =
    node.window.state === "waiting"
      ? "warning"
      : node.window.state === "working"
        ? "accent"
        : "success";
  return { glyph: "  ◆", tone, text };
}

/** Sidebar text for one node, without theming, so it can be asserted in tests. */
export function nodeLabel(node: TreeNode, expanded: boolean): string {
  const { glyph, text } = nodeParts(node, expanded);
  return `${glyph} ${text}`;
}

/** Hard-wraps one paragraph, keeping words whole where they fit. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (current && current.length + 1 + word.length > width) {
        lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
      // A single word longer than the pane still has to be broken somewhere.
      while (current.length > width) {
        lines.push(current.slice(0, width));
        current = current.slice(width);
      }
    }
    lines.push(current);
  }
  return lines;
}

export interface ConversationLine {
  readonly role: Turn["role"] | "none";
  readonly text: string;
  /** Already carries its own colours; the renderer must not restyle it. */
  readonly styled?: boolean;
}

/**
 * The conversation as display lines: who spoke, then what they said.
 *
 * Answers go through `renderAnswer`, which is pi's own markdown renderer in
 * the running view and a plain wrap in tests, so nothing here needs a theme
 * or a terminal. Prompts stay literal: they are what you typed, and markdown
 * would eat the leading `#` or `-` of a prompt that starts with one.
 */
export function conversationLines(
  turns: readonly Turn[],
  width: number,
  renderAnswer: (text: string, width: number) => string[] = wrap,
): ConversationLine[] {
  const out: ConversationLine[] = [];
  const body = Math.max(10, width - 2);
  for (const turn of turns) {
    if (out.length > 0) out.push({ role: "none", text: "" });
    if (turn.role === "user") {
      for (const line of wrap(turn.text, body)) {
        out.push({ role: "user", text: `› ${line}` });
      }
      continue;
    }
    for (const line of renderAnswer(turn.text, body)) {
      out.push({ role: "assistant", text: `  ${line}`, styled: true });
    }
  }
  return out;
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
      "n  to start a new session here.",
    ];
  }

  const window = node.window;
  const session = node.session;
  const hint = !window
    ? "⏎ to switch this window into this session."
    : isOwn(window)
      ? "This is the session you are in — ⏎ to go back to it."
      : `Open in pi ${window.pid} — switch there, or close it first.`;
  return [
    node.label,
    "",
    `directory  ${node.cwd}`,
    ...(session ? [`messages   ${session.messageCount}`] : []),
    ...(session ? [`last used  ${formatAge(session.modified, now)} ago`] : []),
    ...(window
      ? [
          `open in    pi ${window.pid}`,
          `state      ${window.state === "waiting" ? "input needed" : (window.state ?? "idle")}`,
          `uptime     ${formatAge(window.startedAt, now)}`,
        ]
      : []),
    ...(session ? ["", `transcript ${session.path}`] : []),
    "",
    hint,
    ...(session && !window ? ["dd to delete this session from disk."] : []),
  ];
}

class SessionTreeView implements Component, Focusable {
  focused = false;

  private readonly tui: TUI;
  private readonly theme: Theme;
  private readonly keybindings: KeybindingsManager;
  private readonly store: WindowStore;
  private sessions: SessionRow[];
  private readonly reload: SessionLoader | undefined;
  /** A rescan is in flight; the tick must not stack another one on top. */
  private reloading = false;
  private readonly done: (value: ViewOutcome) => void;

  private readonly ticker: ReturnType<typeof setInterval>;
  private roots: TreeNode[] = [];
  private state: TreeState = { expanded: new Set<string>() };
  private closed = false;
  /** One-line feedback for the footer, cleared on the next keypress. */
  private notice = "";
  /** The confirm popup, while it is up. */
  private pending?: { readonly path: string; readonly label: string };
  /** First visible line of the detail pane; paged with pageUp/pageDown. */
  private detailScroll = 0;
  /** Lines the detail pane could not fit, as of the last render. */
  private detailOverflow = 0;
  /** Detail rows on screen, as of the last render, so a page is a real page. */
  private detailHeight = 10;
  /** Last markdown render, reused until the transcript or the width changes. */
  private rendered?: { turns: readonly Turn[]; width: number; lines: ConversationLine[] };

  constructor(
    tui: TUI,
    theme: Theme,
    keybindings: KeybindingsManager,
    store: WindowStore,
    sessions: readonly SessionRow[],
    done: (value: ViewOutcome) => void,
    reload?: SessionLoader,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.store = store;
    this.sessions = [...sessions];
    this.reload = reload;
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
      return;
    }
    void this.rescan();
  }

  /**
   * Re-read the session list itself, not just the live windows.
   *
   * Rows carry the last thing asked, the message count and the age, all of
   * which change while you sit here watching a window work — including this
   * window's own session, which keeps answering behind the overlay.
   *
   * A failed rescan keeps the previous list: a transient read error must not
   * empty the tree under the cursor.
   */
  private async rescan(): Promise<void> {
    if (!this.reload || this.reloading || this.closed) return;
    this.reloading = true;
    try {
      const rows = await this.reload();
      if (this.closed) return;
      this.sessions = [...rows];
      this.refresh();
      this.tui.requestRender();
    } catch {
      // Keep showing the list we already have.
    } finally {
      this.reloading = false;
    }
  }

  private refresh(): void {
    this.roots = buildTree(this.sessions, this.store.read());
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
    if (this.pending) {
      this.answerConfirm(data, keys);
      return;
    }
    this.notice = "";
    if (keys.matches(data, "tui.select.cancel")) {
      this.close({ action: "none" });
      return;
    }

    const node = selected(flatten(this.roots, this.state.expanded), this.state);

    if (keys.matches(data, "tui.select.confirm")) {
      this.enter(node);
      return;
    }
    if (data === "n" && node) {
      this.close({ action: "newSession", cwd: node.cwd, ...this.anchorIn(node.cwd) });
      return;
    }
    if (data === KEY_REMOVE) {
      this.remove(node);
      return;
    }
    if (keys.matches(data, "tui.select.pageUp")) {
      this.scrollDetail(-1);
      return;
    }
    if (keys.matches(data, "tui.select.pageDown")) {
      this.scrollDetail(1);
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
    // A new row means a new conversation; keep reading from the top of it.
    this.detailScroll = 0;
    this.tui.requestRender();
  }

  /**
   * A transcript in `cwd` that no window is writing to, newest first.
   *
   * pi can only start a session in the directory it is already running in, so
   * starting one somewhere else means switching into a session there first.
   * A session another window holds open is no use for that: two writers would
   * fight over one transcript.
   */
  private anchorIn(cwd: string): { anchor?: string } {
    for (const directory of this.roots) {
      if (directory.cwd !== cwd) continue;
      for (const child of directory.children) {
        if (!child.window && child.session) return { anchor: child.session.path };
      }
    }
    return {};
  }

  /** Page the detail pane, one screen at a time, clamped to what is there. */
  private scrollDetail(pages: number): void {
    const step = Math.max(1, this.detailHeight - 1);
    const next = this.detailScroll + pages * step;
    this.detailScroll = Math.min(Math.max(0, next), this.detailOverflow);
    if (this.detailOverflow === 0) this.notice = "Nothing more to scroll.";
    this.tui.requestRender();
  }

  /**
   * `d` on the selected row: raise the confirm popup, where the second `d`
   * does the deleting. Every other branch says why it will not, so the key
   * never looks dead.
   */
  private remove(node: TreeNode | undefined): void {
    switch (removeActionFor(node)) {
      case "delete-session":
        this.pending = { path: node?.session?.path ?? "", label: node?.label ?? "" };
        this.tui.requestRender();
        return;
      case "blocked-open":
        this.notice = this.store.isOwn(node!.window!)
          ? "You are in this session — switch to another one before deleting it."
          : `Open in pi ${node?.window?.pid} — close that window before deleting it.`;
        this.tui.requestRender();
        return;
      default:
        this.notice = "Nothing to remove on this row.";
        this.tui.requestRender();
    }
  }

  /**
   * The confirm popup owns the keyboard while it is up, so esc cancels the
   * delete rather than closing the whole tree. `dd` is the whole gesture: the
   * second `d` lands here and deletes.
   */
  private answerConfirm(data: string, keys: KeybindingsManager): void {
    const pending = this.pending;
    this.pending = undefined;
    this.notice = "";
    if (pending && (data === KEY_REMOVE || keys.matches(data, "tui.select.confirm"))) {
      const before = flatten(this.roots, this.state.expanded);
      const deleted = deleteSessionFiles(pending.path);
      if (deleted) {
        this.sessions = this.sessions.filter((row) => row.path !== pending.path);
        this.refresh();
        this.state = { ...this.state, selectedId: this.neighbourOf(before) };
        this.detailScroll = 0;
        this.notice = `Deleted "${pending.label}".`;
      } else {
        this.notice = `Could not delete "${pending.label}".`;
      }
    }
    this.tui.requestRender();
  }

  /**
   * Where the cursor lands after the row under it is gone: the nearest row
   * above that still exists, else the nearest below.
   *
   * Falling back to the top of the list would throw away your place in it,
   * and deleting a directory's last session takes the directory with it, so
   * "the row above" has to be searched for rather than indexed to.
   */
  private neighbourOf(before: readonly TreeNode[]): string | undefined {
    const alive = new Set(flatten(this.roots, this.state.expanded).map((node) => node.id));
    const from = before.findIndex((node) => node.id === this.state.selectedId);
    if (from < 0) return undefined;
    for (let i = from - 1; i >= 0; i--) {
      const id = before[i]?.id;
      if (id && alive.has(id)) return id;
    }
    for (let i = from + 1; i < before.length; i++) {
      const id = before[i]?.id;
      if (id && alive.has(id)) return id;
    }
    return undefined;
  }

  /** Enter the selected row, when there is anything to enter. */
  private enter(node: TreeNode | undefined): void {
    const action = enterActionFor(node, (window) => this.store.isOwn(window));
    // Your own session is already open here, so entering it just means closing
    // the tree — otherwise the row looks dead and esc is the only way back in.
    if (action === "current") {
      this.close({ action: "none" });
      return;
    }
    // "busy" and "none" have nothing to open; the detail pane already says why.
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

    this.detailHeight = bodyHeight;
    const sidebar = this.renderSidebar(visible, current, sidebarWidth, bodyHeight);
    const detail = this.renderDetail(current, detailWidth, bodyHeight, now);
    const body: string[] = [];
    for (let i = 0; i < bodyHeight; i++) {
      const left = pad(sidebar[i] ?? "", sidebarWidth);
      body.push(truncateToWidth(`${left} ${theme.fg("border", "│")} ${detail[i] ?? ""}`, width));
    }
    lines.push(...(this.pending ? this.withConfirm(body, width) : body));

    lines.push(theme.fg("border", "─".repeat(width)));
    lines.push(
      truncateToWidth(
        this.notice
          ? theme.fg("warning", `  ${this.notice}`)
          : theme.fg(
              "dim",
              "  ↑↓ move · →/⏎ enter · ← back · ⇟⇞ read · n new session · dd delete · esc close",
            ),
        width,
      ),
    );
    return lines;
  }

  /**
   * The confirm popup, drawn over the middle of the body. A modal band rather
   * than a floating window: the rows it covers are whole lines of styled text,
   * and splicing a box into the middle of them would mean tracking where every
   * escape sequence starts.
   */
  private withConfirm(body: readonly string[], width: number): string[] {
    const theme = this.theme;
    const pending = this.pending!;
    const inner = Math.max(20, Math.min(64, width - 8));
    const content: string[] = [
      theme.fg("warning", theme.bold("Delete this session?")),
      "",
      theme.fg("text", truncateToWidth(pending.label, inner)),
      theme.fg("muted", truncateToWidth(pending.path, inner)),
      "",
      ...wrap("The transcript and its artifacts are removed from disk. This cannot be undone.", inner).map(
        (line) => theme.fg("muted", line),
      ),
      "",
      theme.fg("dim", "d / ⏎ delete · n / esc cancel"),
    ];
    const border = theme.fg("warning", "│");
    const box = [
      theme.fg("warning", `┌${"─".repeat(inner + 2)}┐`),
      ...content.map((line) => `${border} ${pad(line, inner)} ${border}`),
      theme.fg("warning", `└${"─".repeat(inner + 2)}┘`),
    ];
    const left = " ".repeat(Math.max(0, Math.floor((width - inner - 4) / 2)));
    const top = Math.max(0, Math.floor((body.length - box.length) / 2));
    const out = [...body];
    box.forEach((line, i) => {
      if (top + i < out.length) out[top + i] = truncateToWidth(left + line, width);
    });
    return out;
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
      const parts = nodeParts(node, this.state.expanded.has(node.id));
      const plain = truncateToWidth(`${parts.glyph} ${parts.text}`, width - 1);
      if (node.id === current?.id) {
        out.push(theme.bg("selectedBg", theme.fg("accent", pad(plain, width))));
        continue;
      }
      const tone = node.kind === "directory" || node.window ? "text" : "muted";
      const label = plain.slice(parts.glyph.length);
      out.push(theme.fg(parts.tone, parts.glyph) + theme.fg(tone, label));
    }
    return out;
  }

  /**
   * An answer as pi renders it in the transcript: markdown, with highlighted
   * code blocks. `getMarkdownTheme()` reads pi's active theme, so this follows
   * a theme change without the view knowing one happened.
   */
  private renderAnswer = (text: string, width: number): string[] =>
    new Markdown(text, 0, 0, getMarkdownTheme(), {
      color: (line: string) => this.theme.fg("text", line),
    }).render(width);

  /**
   * Metadata first, then the conversation itself, as one scrollable column.
   * The transcript is read here rather than up front: only the row under the
   * cursor is ever previewed, and the read is cached by mtime.
   *
   * Markdown for a long session is the one expensive thing in a render, and
   * the view re-renders on a one-second tick, so the last result is kept and
   * reused until the transcript or the pane width actually changes.
   *
   * ponytail: the whole conversation is rendered, not just the visible page —
   * 54ms for a 336-message session, then 1ms from the cache. Render per page
   * if selecting a row ever feels slow.
   */
  private detailBody(
    node: TreeNode | undefined,
    width: number,
    now: number,
  ): ConversationLine[] {
    const head: ConversationLine[] = detailLines(
      node,
      now,
      (window) => this.store.isOwn(window),
    ).map((text) => ({ role: "none" as const, text }));
    const path = node?.kind === "session" ? node.session?.path : undefined;
    if (!path) return head;
    const turns = readConversation(path);
    if (turns.length === 0) return head;
    if (this.rendered?.turns !== turns || this.rendered.width !== width) {
      this.rendered = { turns, width, lines: conversationLines(turns, width, this.renderAnswer) };
    }
    return [
      ...head,
      { role: "none", text: "" },
      { role: "none", text: "─".repeat(Math.max(0, width)) },
      { role: "none", text: "" },
      ...this.rendered.lines,
    ];
  }

  private renderDetail(
    node: TreeNode | undefined,
    width: number,
    height: number,
    now: number,
  ): string[] {
    const theme = this.theme;
    const body = this.detailBody(node, width, now);
    this.detailOverflow = Math.max(0, body.length - height);
    const start = Math.min(this.detailScroll, this.detailOverflow);
    return body
      .slice(start, start + height)
      .map(({ role, text, styled }, i) => {
        if (styled) return truncateToWidth(text, width);
        if (role === "user") return truncateToWidth(theme.fg("accent", text), width);
        return truncateToWidth(
          start === 0 && i === 0 ? theme.bold(theme.fg("text", text)) : theme.fg("muted", text),
          width,
        );
      });
  }

  invalidate(): void {}
}

function pad(text: string, width: number): string {
  const truncated = truncateToWidth(text, width);
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

/** Rescans every session on disk; the view calls this on its refresh tick. */
export type SessionLoader = () => Promise<readonly SessionRow[]>;

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
  reload?: SessionLoader,
): Promise<ViewOutcome> {
  return ctx.ui.custom<ViewOutcome>(
    (tui, theme, keybindings, done) =>
      new SessionTreeView(tui, theme, keybindings, store, sessions, done, reload),
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "100%", maxHeight: "100%" },
    },
  );
}
