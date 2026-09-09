/**
 * The contract between the `subagents` extension and anything that displays
 * its children — currently `session-tree` and `notify`.
 *
 * `subagents` owns the children but has no session tree; `session-tree` owns
 * the tree and the published window file. Rather than have two extensions
 * write the same file, `subagents` broadcasts its state in-process and
 * `session-tree` folds it into the snapshot it already publishes. One writer
 * per file, one owner per concern.
 */

/** Broadcast by `subagents` on every change to its children. */
export const SUBAGENT_ACTIVITY_CHANNEL = "subagents:activity";


/** One subagent, flattened for display by another extension. */
export interface SubagentInfo {
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
}

export interface SubagentActivity {
  readonly running: number;
  readonly agents: readonly SubagentInfo[];
}

/** Narrows an event-bus payload to an activity update. */
export function asActivity(data: unknown): SubagentActivity | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as { running?: unknown; agents?: unknown };
  if (typeof record.running !== "number" || !Array.isArray(record.agents)) {
    return undefined;
  }
  return { running: record.running, agents: record.agents as SubagentInfo[] };
}
