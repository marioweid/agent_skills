import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditSessions } from "./session-usage.mjs";

function fixture(lines) {
  const directory = mkdtempSync(join(tmpdir(), "pi-usage-"));
  const file = join(directory, "session.jsonl");
  writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return { directory, file };
}

const header = { type: "session", id: "session-one", timestamp: "2026-09-11T10:00:00Z" };
const response = {
  type: "message",
  id: "answer-one",
  timestamp: "2026-09-11T10:01:00Z",
  message: {
    role: "assistant",
    provider: "test",
    model: "model",
    stopReason: "stop",
    content: [{ type: "toolCall", name: "read", arguments: { path: "private-file" } }],
    usage: {
      input: 10,
      output: 20,
      cacheRead: 100,
      cacheWrite: 5,
      reasoning: 15,
      totalTokens: 135,
      cost: { total: 0.25 },
    },
  },
};

test("separates cached input and reasoning without double-counting either", async () => {
  const { file } = fixture([header, response]);
  const report = await auditSessions([file]);
  assert.equal(report.totals.input, 10);
  assert.equal(report.totals.cacheRead, 100);
  assert.equal(report.totals.cacheWrite, 5);
  assert.equal(report.totals.output, 20);
  assert.equal(report.totals.reasoning, 15);
  assert.equal(report.totals.totalTokens, 135);
  assert.equal(report.totals.estimatedCostUsd, 0.25);
  assert.equal(report.totals.toolCalls, 1);
});

test("includes children and classifies only recognized role preambles", async () => {
  const user = {
    type: "message",
    message: {
      role: "user",
      content: [{ type: "text", text: "You are the reviewer.\nPrivate task details" }],
    },
  };
  const { directory } = fixture([header, user, response]);
  const report = await auditSessions([directory]);
  assert.equal(report.groups[0].role, "reviewer");
  assert.equal(report.sessions[0].spanSeconds, 60);
  assert.doesNotMatch(JSON.stringify(report), /Private task|private-file|You are the reviewer/);
});

test("does not infer a role from quoted instructions later in a user message", async () => {
  const user = {
    type: "message",
    message: { role: "user", content: "Please review this prompt: You are the reviewer." },
  };
  const { file } = fixture([header, user, response]);
  assert.equal((await auditSessions([file])).groups[0].role, "unclassified");
});

test("counts copied/forked entries and repeated file arguments only once", async () => {
  const { directory, file } = fixture([header, response]);
  writeFileSync(join(directory, "copy.jsonl"), [header, response].map(JSON.stringify).join("\n"));
  const report = await auditSessions([directory, file]);
  assert.equal(report.totals.totalTokens, 135);
  assert.equal(report.duplicateMessages, 1);
});

test("reports corrupt lines and absent usage rather than pretending they are free", async () => {
  const missing = structuredClone(response);
  delete missing.message.usage;
  const { file } = fixture([header, missing]);
  writeFileSync(file, "{unfinished private content\n", { flag: "a" });
  const report = await auditSessions([file]);
  assert.equal(report.malformedLines, 1);
  assert.equal(report.totals.messagesWithoutUsage, 1);
  assert.equal(report.totals.estimatedCostUsd, null);
  assert.doesNotMatch(JSON.stringify(report), /unfinished private content/);
});

test("groups model switches separately and retains failed attempts' consumption", async () => {
  const failed = structuredClone(response);
  failed.id = "answer-two";
  failed.message.model = "other";
  failed.message.stopReason = "error";
  const { file } = fixture([header, response, failed]);
  const report = await auditSessions([file]);
  assert.equal(report.groups.length, 2);
  assert.equal(report.totals.errors, 1);
  assert.equal(report.totals.totalTokens, 270);
});

test("empty inputs and unreadable paths are actionable errors", async () => {
  await assert.rejects(auditSessions([]), /Provide/);
  const { directory } = fixture([]);
  await assert.rejects(auditSessions([join(directory, "missing")]), /Cannot inspect/);
  const empty = mkdtempSync(join(tmpdir(), "pi-usage-empty-"));
  await assert.rejects(auditSessions([empty]), /No .jsonl/);
});

test("invalid counters are flagged and absent ids do not conflate different files", async () => {
  const invalid = structuredClone(response);
  delete invalid.id;
  invalid.message.usage.input = -1;
  invalid.message.usage.cost.total = "unknown";
  const first = fixture([header, invalid]);
  const second = fixture([header, invalid]);
  const report = await auditSessions([first.file, second.file]);
  assert.equal(report.totals.messages, 2);
  assert.equal(report.totals.messagesWithoutUsage, 2);
  assert.equal(report.totals.estimatedCostUsd, null);
  assert.equal(report.duplicateMessages, 0);
});
