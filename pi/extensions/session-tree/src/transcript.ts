/**
 * Reading what was actually said in a session.
 *
 * The tree shows two things from a transcript: the last thing you asked, as
 * the row label, and the conversation itself in the detail pane. Both are the
 * plain back-and-forth — tool calls, tool results and thinking are dropped,
 * because they are the machinery, not the conversation you are trying to
 * recognise.
 */

import fs from "node:fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";

export interface Turn {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/** Text parts of one message, ignoring tool calls, images, and thinking. */
function messageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (
      typeof part === "object" &&
      part !== null &&
      (part as { type?: unknown }).type === "text" &&
      typeof (part as { text?: unknown }).text === "string"
    ) {
      parts.push((part as { text: string }).text);
    }
  }
  return parts.join("\n").trim();
}

/**
 * The conversation on a branch of session entries.
 *
 * Exported separately from the file read so it can be tested without a
 * transcript on disk.
 */
export function conversationFrom(entries: readonly unknown[]): Turn[] {
  const turns: Turn[] = [];
  for (const entry of entries) {
    const record = entry as { type?: unknown; message?: { role?: unknown; content?: unknown } };
    if (record.type !== "message") continue;
    const role = record.message?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = messageText(record.message?.content);
    if (text) turns.push({ role, text });
  }
  return turns;
}

/** The last thing the user asked, for the sidebar row. */
export function lastUserText(turns: readonly Turn[]): string | undefined {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (turn?.role === "user") return turn.text;
  }
  return undefined;
}

/**
 * Conversations already read, keyed by transcript path. The mtime is part of
 * the entry so a session being written to right now still refreshes, while a
 * cursor resting on a row does not re-parse the file every render.
 */
const cache = new Map<string, { mtimeMs: number; turns: Turn[] }>();

/**
 * The conversation in a transcript, or an empty list if it cannot be read.
 *
 * A session on disk is never so broken that browsing sessions should fail, so
 * every failure here degrades to "no preview".
 */
export function readConversation(sessionPath: string): Turn[] {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(sessionPath).mtimeMs;
  } catch {
    return [];
  }
  const hit = cache.get(sessionPath);
  if (hit && hit.mtimeMs === mtimeMs) return hit.turns;
  let turns: Turn[];
  try {
    turns = conversationFrom(SessionManager.open(sessionPath).getBranch());
  } catch {
    turns = [];
  }
  cache.set(sessionPath, { mtimeMs, turns });
  return turns;
}
