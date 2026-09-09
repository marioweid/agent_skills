/**
 * Agent roles — reusable specialist prompts loaded from `~/.pi/agent/agents/*.md`.
 *
 * A role file is YAML-ish frontmatter (name, description, model, thinking,
 * tools) followed by the prompt body. `subagent_spawn(agent: "critic", ...)`
 * prepends that body to the task and applies the file's model/effort/tools.
 *
 * pi's `createAgentSession` has no `systemPrompt` option, so the role arrives
 * as the head of the child's first user message. For a headless one-shot child
 * that is equivalent in practice.
 */

import fs from "node:fs";
import path from "node:path";
import { REASONING_EFFORTS, type ReasoningEffort } from "./domain.ts";

export interface AgentRole {
  readonly name: string;
  readonly description: string;
  readonly prompt: string;
  readonly model?: string;
  readonly reasoningEffort?: ReasoningEffort;
  /**
   * Tool allowlist. `undefined` means the role did not restrict tools;
   * a `tools:` key that parses to nothing is an error, never "unrestricted",
   * because silently widening a permission is the wrong way to fail.
   */
  readonly tools?: string[];
}

/** A role file that could not be used, and why. Surfaced to the user. */
export interface RejectedRole {
  readonly file: string;
  readonly reason: string;
}

export interface LoadedRoles {
  readonly roles: AgentRole[];
  readonly rejected: RejectedRole[];
}

class RoleError extends Error {}

function splitFrontmatter(text: string) {
  // Editors and Windows checkouts both produce CRLF; normalise before parsing.
  const normalized = text.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---\n")) {
    throw new RoleError("missing opening --- frontmatter delimiter");
  }
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    throw new RoleError("missing closing --- frontmatter delimiter");
  }
  const body = normalized.slice(normalized.indexOf("\n", end + 1) + 1);
  return { frontmatter: normalized.slice(4, end + 1), body: body.trim() };
}

/**
 * Parses the frontmatter into scalars plus block sequences, so both YAML list
 * forms work:
 *
 *     tools: read, grep        # inline
 *     tools:                   # block
 *       - read
 *       - grep
 */
export function parseFrontmatter(frontmatter: string) {
  const scalars = new Map<string, string>();
  const lists = new Map<string, string[]>();
  let currentKey: string | undefined;

  for (const line of frontmatter.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && currentKey) {
      const value = unquote(item[1] ?? "");
      if (value) lists.get(currentKey)?.push(value) ?? lists.set(currentKey, [value]);
      continue;
    }
    if (/^\s/.test(line)) continue;

    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    currentKey = line.slice(0, colon).trim();
    const value = unquote(line.slice(colon + 1).trim());
    if (value) scalars.set(currentKey, value);
    else lists.set(currentKey, []);
  }
  return { scalars, lists };
}

function unquote(value: string) {
  return value.trim().replace(/^["']|["']$/g, "").trim();
}

/** Tool names must match what pi registers; a typo would silently disable a tool. */
const TOOL_NAME = /^[a-z][a-z0-9_]*$/;

function parseTools(
  scalars: ReadonlyMap<string, string>,
  lists: ReadonlyMap<string, string[]>,
): string[] | undefined {
  const inline = scalars.get("tools");
  const block = lists.get("tools");
  if (inline === undefined && block === undefined) return undefined;

  const tools = (inline ? inline.split(",") : (block ?? []))
    .map((tool) => tool.trim())
    .filter(Boolean);
  if (tools.length === 0) {
    throw new RoleError(
      "`tools:` is present but empty — remove the key to allow all tools, " +
        "or list the tools the role may use",
    );
  }
  const invalid = tools.filter((tool) => !TOOL_NAME.test(tool));
  if (invalid.length > 0) {
    throw new RoleError(
      `tool names must be lowercase pi tool ids, got ${invalid.join(", ")}`,
    );
  }
  return tools;
}

function parseRole(file: string): AgentRole {
  const { frontmatter, body } = splitFrontmatter(fs.readFileSync(file, "utf8"));
  const { scalars, lists } = parseFrontmatter(frontmatter);

  const name = scalars.get("name") ?? path.basename(file, ".md");
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
    throw new RoleError(
      `"${name}" is not a usable role name (letters, digits and dashes only)`,
    );
  }
  if (!body) throw new RoleError("no prompt body below the frontmatter");

  const thinking = scalars.get("thinking");
  if (thinking && !(REASONING_EFFORTS as readonly string[]).includes(thinking)) {
    throw new RoleError(
      `thinking: ${thinking} is not one of ${REASONING_EFFORTS.join(", ")}`,
    );
  }

  return {
    name,
    description: scalars.get("description") ?? name,
    prompt: body,
    model: scalars.get("model"),
    reasoningEffort: thinking as ReasoningEffort | undefined,
    tools: parseTools(scalars, lists),
  };
}

/**
 * Load every role in `<agentDir>/agents`, sorted by name. A broken file is
 * reported rather than silently ignored: a role that fails to load looks
 * exactly like a role that was never written.
 */
export function loadAgentRoles(agentDir: string): LoadedRoles {
  const dir = path.join(agentDir, "agents");
  let entries: string[];
  try {
    entries = fs.readdirSync(dir).filter((name) => name.endsWith(".md"));
  } catch {
    return { roles: [], rejected: [] };
  }

  const roles: AgentRole[] = [];
  const rejected: RejectedRole[] = [];
  const seen = new Map<string, string>();

  for (const entry of entries.sort()) {
    let role: AgentRole;
    try {
      role = parseRole(path.join(dir, entry));
    } catch (error) {
      rejected.push({
        file: entry,
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const duplicate = seen.get(role.name);
    if (duplicate) {
      rejected.push({
        file: entry,
        reason: `duplicate role name "${role.name}", already defined by ${duplicate}`,
      });
      continue;
    }
    seen.set(role.name, entry);
    roles.push(role);
  }

  roles.sort((a, b) => a.name.localeCompare(b.name));
  return { roles, rejected };
}

/** Combine a role prompt with the caller's task into one child prompt. */
export function applyRole(role: AgentRole, task: string) {
  return `${role.prompt}\n\n---\n\n# Your task\n\n${task}`;
}
