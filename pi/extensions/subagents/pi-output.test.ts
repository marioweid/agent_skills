import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { PiRunOutput } from "./src/backends/pi.ts";

function answer(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: text ? [{ type: "text", text }] : [],
    api: "openai-responses",
    provider: "openai",
    model: "test",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
  };
}

test("a follow-up that fails before generating output cannot repeat an old verdict", () => {
  const run = new PiRunOutput();
  run.lastMessage = answer("status: pass");
  run.reset();
  assert.equal(run.text, "");
  assert.equal(run.lastMessage, undefined);
});

test("an empty final response cannot promote earlier commentary into a verdict", () => {
  const run = new PiRunOutput();
  run.lastMessage = answer("I will review it");
  run.lastMessage = answer("");
  assert.equal(run.text, "");
});

test("the latest response in this run is returned with all text parts", () => {
  const final = answer("status: reject");
  final.content.push({ type: "text", text: "file.ts:3 — wrong result" });
  const run = new PiRunOutput();
  run.lastMessage = final;
  assert.equal(run.text, "status: reject\nfile.ts:3 — wrong result");
  assert.deepEqual(run.outcome(), { _tag: "Completed", finalText: run.text });
});

test("no assistant response is empty output", () => {
  assert.equal(new PiRunOutput().text, "");
  assert.equal(new PiRunOutput().outcome()._tag, "Failed");
});

test("truncated or unfinished answers cannot be reported as completed reviews", () => {
  const run = new PiRunOutput();
  for (const reason of ["length", "toolUse", "pending", "deferred"] as const) {
    run.lastMessage = { ...answer("status: pass"), stopReason: reason };
    assert.equal(run.outcome()._tag, "Failed", reason);
  }
});

test("failures and cancellation preserve only the current run's partial text", () => {
  const run = new PiRunOutput();
  run.lastMessage = answer("partial review");
  assert.deepEqual(run.outcome("network failure"), {
    _tag: "Failed",
    errorText: "network failure",
    partialText: "partial review",
  });
  run.lastMessage.stopReason = "error";
  run.lastMessage.errorMessage = "provider failed";
  assert.deepEqual(run.outcome(), {
    _tag: "Failed",
    errorText: "provider failed",
    partialText: "partial review",
  });
  run.lastMessage.stopReason = "aborted";
  assert.deepEqual(run.outcome(), { _tag: "Interrupted", partialText: "partial review" });
  run.reset();
  assert.deepEqual(run.outcome("preflight failure"), {
    _tag: "Failed",
    errorText: "preflight failure",
    partialText: undefined,
  });
});
