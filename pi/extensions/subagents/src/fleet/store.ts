/**
 * Cross-process fleet store.
 *
 * The manager's read model only knows about children of its own pi process.
 * Every window publishes a snapshot of itself to `~/.pi/agent/fleet/<pid>.json`
 * so `/fleet` can show every window on the machine.
 *
 * One file per process, written by atomic rename. Each file has exactly one
 * writer, so there is nothing to lock: readers either see the previous
 * complete file or the next one, never a partial write. A window that dies
 * leaves its file behind, and the next reader unlinks it.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** One subagent, as published by the window that owns it. */
export interface FleetAgent {
  readonly id: string;
  readonly title: string;
  readonly role?: string;
  readonly backend: string;
  readonly model?: string;
  readonly cwd: string;
  readonly status: string;
  readonly createdAt: number;
  readonly settledAt?: number;
  readonly tokens?: number;
  readonly contextWindow?: number;
  /** Transcript file of the child, so other windows can find its history. */
  readonly sessionFile?: string;
}

/** One live pi window. */
export interface FleetWindow {
  readonly pid: number;
  /**
   * Random per-process id. pids are recycled by the OS, so a pid alone cannot
   * tell "my window" from "a dead window that happened to have my pid".
   */
  readonly owner: string;
  readonly cwd: string;
  /** The window's own transcript, used to match it to a session entry. */
  readonly sessionFile?: string;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly agents: readonly FleetAgent[];
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
export function parseWindow(text: string): FleetWindow | undefined {
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
    typeof record.cwd !== "string" ||
    !Array.isArray(record.agents)
  ) {
    return undefined;
  }
  return {
    pid: record.pid,
    owner: record.owner,
    cwd: record.cwd,
    sessionFile:
      typeof record.sessionFile === "string" ? record.sessionFile : undefined,
    startedAt: typeof record.startedAt === "number" ? record.startedAt : 0,
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : 0,
    agents: record.agents as FleetAgent[],
  };
}

export class FleetStore {
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
  isOwn(window: FleetWindow): boolean {
    return window.owner === this.owner;
  }

  private get filePath(): string {
    return path.join(this.dir, `${this.pid}.json`);
  }

  /** Publish this window's current state. Atomic: write a temp file, rename over. */
  publish(
    cwd: string,
    agents: readonly FleetAgent[],
    sessionFile?: string,
  ): void {
    const snapshot: FleetWindow = {
      pid: this.pid,
      owner: this.owner,
      cwd,
      sessionFile,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      agents,
    };
    const temp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(snapshot), { mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }

  /**
   * Every live window, newest first, after unlinking files left behind by
   * windows that have exited. Subagents live inside their parent process, so a
   * dead pid means its children are gone too.
   */
  read(): FleetWindow[] {
    let entries: string[];
    try {
      entries = fs.readdirSync(this.dir);
    } catch {
      return [];
    }

    const windows: FleetWindow[] = [];
    for (const entry of entries) {
      const match = FILE_PATTERN.exec(entry);
      if (!match) continue;
      const pid = Number(match[1]);
      const file = path.join(this.dir, entry);

      if (pid !== this.pid && !this.aliveCheck(pid)) {
        this.discard(file);
        continue;
      }
      let window: FleetWindow | undefined;
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

  /** Remove this window from the fleet. Called on session shutdown. */
  close(): void {
    this.discard(this.filePath);
  }
}

/**
 * Deletes a session transcript and the sibling directory pi keeps beside it
 * for that session's artifacts. Returns false if the transcript is still there
 * afterwards, so the caller can report a failure instead of assuming success.
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
