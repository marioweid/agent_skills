/**
 * Which pi windows are alive, and what each one has open.
 *
 * A session transcript has exactly one writer, so the tree has to know which
 * sessions are already held by another window before it offers to switch into
 * one. The session files on disk cannot say that, so every window publishes a
 * snapshot of itself to `~/.pi/agent/session-tree/<pid>.json`.
 *
 * One file per process, written by atomic rename. Each file has exactly one
 * writer, so there is nothing to lock: readers either see the previous
 * complete file or the next one, never a partial write. A window that dies
 * leaves its file behind, and the next reader unlinks it.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * What a pi window is doing right now.
 *
 * `waiting` is the one that matters: that window has a question on screen and
 * is doing nothing until someone answers it.
 */
export type WindowState = "working" | "waiting" | "idle";

const WINDOW_STATES: readonly string[] = ["working", "waiting", "idle"];

/** One live pi window. */
export interface LiveWindow {
  readonly pid: number;
  /**
   * Random per-process id. pids are recycled by the OS, so a pid alone cannot
   * tell "my window" from "a dead window that happened to have my pid".
   */
  readonly owner: string;
  readonly cwd: string;
  /** Session name, or a compact form of the first user message. */
  readonly title?: string;
  /** Transcript this window is writing, which binds it to a session row. */
  readonly sessionFile?: string;
  readonly startedAt: number;
  readonly updatedAt: number;
  /** Absent in snapshots written by an older build; treated as idle. */
  readonly state?: WindowState;
}

const FILE_PATTERN = /^(\d+)\.json$/;

/**
 * A pid is only meaningful while its process is alive; signal 0 tests that.
 * A failure of any kind counts as dead: ESRCH is gone, and EPERM is a live
 * process owned by another user, which can never be one of our pi windows.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Parses one published window file, returning undefined for anything unusable. */
export function parseWindow(text: string): LiveWindow | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.pid !== "number" ||
    typeof record.owner !== "string" ||
    typeof record.cwd !== "string"
  ) {
    return undefined;
  }
  return {
    pid: record.pid,
    owner: record.owner,
    cwd: record.cwd,
    ...(typeof record.title === "string" ? { title: record.title } : {}),
    ...(typeof record.sessionFile === "string"
      ? { sessionFile: record.sessionFile }
      : {}),
    ...(typeof record.state === "string" && WINDOW_STATES.includes(record.state)
      ? { state: record.state as WindowState }
      : {}),
    startedAt: typeof record.startedAt === "number" ? record.startedAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
  };
}

export class WindowStore {
  private readonly dir: string;
  private readonly pid: number;
  private readonly owner: string;
  private readonly startedAt: number;
  private readonly aliveCheck: (pid: number) => boolean;

  constructor(
    dir: string,
    pid: number = process.pid,
    aliveCheck: (pid: number) => boolean = isProcessAlive,
    owner: string = randomUUID(),
  ) {
    this.dir = dir;
    this.pid = pid;
    this.owner = owner;
    this.startedAt = Date.now();
    this.aliveCheck = aliveCheck;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  /** True when this window published the given snapshot. */
  isOwn(window: LiveWindow): boolean {
    return window.owner === this.owner;
  }

  private get filePath(): string {
    return path.join(this.dir, `${this.pid}.json`);
  }

  /** Publish this window's current state. Atomic: write a temp file, rename over. */
  publish(
    cwd: string,
    details: {
      title?: string;
      sessionFile?: string;
      state?: WindowState;
    } = {},
  ): void {
    const snapshot: LiveWindow = {
      pid: this.pid,
      owner: this.owner,
      cwd,
      ...(details.title ? { title: details.title } : {}),
      ...(details.sessionFile ? { sessionFile: details.sessionFile } : {}),
      ...(details.state ? { state: details.state } : {}),
      startedAt: this.startedAt,
      updatedAt: Date.now(),
    };
    const temp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(snapshot), { mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }

  /**
   * Every live window, newest first, after unlinking files left behind by
   * windows that have exited.
   */
  read(): LiveWindow[] {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return [];
    }

    const windows: LiveWindow[] = [];
    for (const entry of entries) {
      const match = FILE_PATTERN.exec(entry);
      if (!match) continue;
      const pid = Number(match[1]);
      const file = path.join(this.dir, entry);

      if (pid !== this.pid && !this.aliveCheck(pid)) {
        this.discard(file);
        continue;
      }
      let window: LiveWindow | undefined;
      try {
        window = parseWindow(fs.readFileSync(file, "utf8"));
      } catch {
        // The owner may be mid-rename; skip this tick rather than delete.
        continue;
      }
      if (!window) {
        this.discard(file);
        continue;
      }
      windows.push(window);
    }
    return windows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private discard(file: string): void {
    try {
      fs.unlinkSync(file);
    } catch {
      // Another window pruned it first, or it is read-only. Either way the
      // next read skips it; there is nothing useful to do here.
    }
  }

  /** Remove this window from the list. Called on session shutdown. */
  close(): void {
    this.discard(this.filePath);
  }
}

/**
 * Deletes a session transcript and the sibling directory pi keeps beside it
 * for that session's artifacts. Returns false if the transcript survives, so
 * the caller can report a failure instead of assuming success.
 */
export function deleteSessionFiles(sessionPath: string): boolean {
  const artifacts = sessionPath.replace(/\.jsonl$/, "");
  try {
    fs.rmSync(sessionPath, { force: true });
    if (artifacts !== sessionPath) {
      fs.rmSync(artifacts, { recursive: true, force: true });
    }
  } catch {
    return false;
  }
  return !fs.existsSync(sessionPath);
}
