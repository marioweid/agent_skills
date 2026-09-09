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

/** Broadcast by `subagents` once its agent roles are loaded. */
export const SUBAGENT_ROLES_CHANNEL = "subagents:roles";

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

export interface SubagentRoles {
  readonly names: readonly string[];
}

/** Commands `subagents` registers so other extensions can act on a child. */
export const SUBAGENT_COMMANDS = {
  /** `/subagent-open <id>` — open the takeover view for one child. */
  open: "subagent-open",
  /** `/subagent-remove <id>` — forget a settled child, or confirm and abort. */
  remove: "subagent-remove",
  /** `/subagent-new <cwd>` — pick a role and task, then spawn in that directory. */
  create: "subagent-new",
} as const;

/** Narrows an event-bus payload to an activity update. */
export function asActivity(data: unknown): SubagentActivity | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const record = data as { running?: unknown; agents?: unknown };
  if (typeof record.running !== "number" || !Array.isArray(record.agents)) {
    return undefined;
  }
  return { running: record.running, agents: record.agents as SubagentInfo[] };
}

/** Narrows an event-bus payload to a role list. */
export function asRoles(data: unknown): SubagentRoles | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const names = (data as { names?: unknown }).names;
  if (!Array.isArray(names)) return undefined;
  return { names: names.filter((name): name is string => typeof name === "string") };
}
