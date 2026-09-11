import { createReadStream } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

const TOKEN_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "reasoning"];
const COUNT_FIELDS = [
  ...TOKEN_FIELDS,
  "totalTokens",
  "messages",
  "messagesWithoutUsage",
  "toolCalls",
  "spawns",
  "errors",
  "messagesWithoutCost",
];

function validCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function emptyCounters() {
  return { ...Object.fromEntries(COUNT_FIELDS.map((key) => [key, 0])), estimatedCostUsd: 0 };
}

function addCounters(target, source) {
  for (const key of COUNT_FIELDS) target[key] += source[key];
  target.estimatedCostUsd += source.estimatedCostUsd;
}

function messageCounters(message) {
  const counters = emptyCounters();
  counters.messages = 1;
  const usage = message.usage ?? {};
  const complete = ["input", "output", "cacheRead", "cacheWrite"].every((key) =>
    validCount(usage[key]),
  );
  counters.messagesWithoutUsage = Number(!complete);
  for (const key of TOKEN_FIELDS) counters[key] = validCount(usage[key]) ? usage[key] : 0;
  counters.totalTokens =
    counters.input + counters.output + counters.cacheRead + counters.cacheWrite;
  counters.messagesWithoutCost = Number(!validCount(usage.cost?.total));
  counters.estimatedCostUsd = validCount(usage.cost?.total) ? usage.cost.total : 0;
  const calls = Array.isArray(message.content)
    ? message.content.filter((part) => part?.type === "toolCall")
    : [];
  counters.toolCalls = calls.length;
  counters.spawns = calls.filter((call) => call.name === "subagent_spawn").length;
  counters.errors = Number(["error", "aborted"].includes(message.stopReason));
  return counters;
}

async function collectFiles(input, files) {
  let stat;
  try {
    stat = await lstat(input);
  } catch {
    throw new Error(`Cannot inspect ${input}; provide readable Pi session files or directories.`);
  }
  // Never recursively follow links out of a selected directory.
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    const names = (await readdir(input)).sort();
    for (const name of names) await collectFiles(join(input, name), files);
  } else if (stat.isFile() && input.endsWith(".jsonl")) {
    files.add(await realpath(input));
  }
}

function roleFromMessage(message) {
  const content = message.content;
  const text =
    typeof content === "string"
      ? content
      : (Array.isArray(content) ? content : [])
          .filter((part) => part?.type === "text")
          .map((part) => part.text)
          .join("\n");
  return (
    /^You are (?:an? |the )(scout|architect|implementer|reviewer|scribe)\./i
      .exec(text.trim())?.[1]
      ?.toLowerCase() ?? "unclassified"
  );
}

function consumeMessage(entry, session, state, sourcePath, lineNumber) {
  const message = entry.message;
  if (message?.role === "user" && !session.seenUser) {
    session.role = roleFromMessage(message);
    session.seenUser = true;
  }
  if (message?.role !== "assistant") return;
  // Forks copy entry ids and timestamps. Count their actual generation once.
  const key = entry.id
    ? `${entry.id}:${entry.timestamp ?? session.id}`
    : `${sourcePath}:${lineNumber}`;
  if (state.seenMessages.has(key)) {
    state.duplicateMessages++;
    return;
  }
  state.seenMessages.add(key);
  const model = `${message.provider ?? "unknown"}/${message.model ?? "unknown"}`;
  const groupKey = `${session.role}:${model}`;
  if (!state.groups.has(groupKey)) {
    state.groups.set(groupKey, { role: session.role, model, ...emptyCounters() });
  }
  const counts = messageCounters(message);
  addCounters(session, counts);
  addCounters(state.groups.get(groupKey), counts);
  addCounters(state.totals, counts);
}

async function readSession(file, state) {
  const session = {
    file: basename(file),
    id: null,
    role: "unclassified",
    seenUser: false,
    start: null,
    end: null,
    ...emptyCounters(),
  };
  const lines = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line.replace(/^\uFEFF/, ""));
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error();
    } catch {
      state.malformedLines++;
      continue;
    }
    const time = Date.parse(entry.timestamp);
    if (Number.isFinite(time)) {
      session.start = Math.min(session.start ?? time, time);
      session.end = Math.max(session.end ?? time, time);
    }
    if (entry.type === "session") session.id = entry.id ?? null;
    if (entry.type === "message") consumeMessage(entry, session, state, file, lineNumber);
  }
  const { seenUser: _seenUser, start, end, ...result } = session;
  return { ...result, spanSeconds: start === null ? null : (end - start) / 1000 };
}

function finishCounters(counters) {
  if (counters.messagesWithoutCost > 0) counters.estimatedCostUsd = null;
  return counters;
}

/**
 * Aggregate recorded Pi consumption without emitting prompts or tool contents.
 *
 * Args:
 *   inputs: Explicit JSONL files or directories, including parent and child sessions.
 * Returns:
 *   Per-session and role/model counters; incomplete data is counted explicitly.
 */
export async function auditSessions(inputs) {
  if (inputs.length === 0) throw new Error("Provide Pi session files or directories.");
  const files = new Set();
  for (const input of inputs) await collectFiles(resolve(input), files);
  if (files.size === 0) throw new Error("No .jsonl session files found in the selected paths.");
  const state = {
    seenMessages: new Set(),
    groups: new Map(),
    totals: emptyCounters(),
    duplicateMessages: 0,
    malformedLines: 0,
  };
  const sessions = [];
  for (const file of files) sessions.push(finishCounters(await readSession(file, state)));
  return {
    files: files.size,
    malformedLines: state.malformedLines,
    duplicateMessages: state.duplicateMessages,
    totals: finishCounters(state.totals),
    groups: [...state.groups.values()].map(finishCounters),
    sessions,
    notes: [
      "Totals sum recorded requests, including failed attempts and cached input. Not context occupancy.",
      "Reasoning is reported separately and is already included in output; never add it again.",
      "Missing usage makes token totals partial. Cost is the recorded estimate, not billed subscription quota.",
      "Session spans include human idle time; do not sum parallel spans as task latency.",
      "Roles are recognized from the first user preamble; unclassified does not mean parent.",
      "Select all relevant parent and child files. This report does not infer task membership.",
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await auditSessions(process.argv.slice(2)), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
