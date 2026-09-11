import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { tmpdir } from "node:os";
import type { AgentSessionEvent, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { Effect, Stream } from "effect";
import type { SubagentSession } from "./src/backend.ts";

// Only the SDK boundary is scripted. Exercise production spawn/send/event/settle wiring
// without model calls, credentials, real child agents, or writes to the user's sessions.
const sdk = await import("@earendil-works/pi-coding-agent");
let listener: (event: AgentSessionEvent) => void = () => {};
let scenario: "answer" | "preflight" | "empty" | "compacted" = "answer";
let disposed = false;
const messages: AssistantMessage[] = [];

function response(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-responses",
    provider: "test",
    model: "test",
    stopReason: "stop",
    timestamp: 0,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

function emitMessage(text: string) {
  const message = response(text);
  messages.push(message);
  listener({ type: "message_end", message });
}

const session = {
  messages,
  model: undefined,
  isStreaming: false,
  sessionFile: undefined,
  sessionManager: { appendSessionInfo() {} },
  extensionRunner: { hasHandlers: () => false },
  bindExtensions: async () => {},
  getAllTools: () => [],
  getContextUsage: () => undefined,
  clearQueue() {},
  abort: async () => {},
  dispose() {
    disposed = true;
  },
  subscribe(callback: typeof listener) {
    listener = callback;
    return () => {
      listener = () => {};
    };
  },
  async prompt() {
    if (scenario === "preflight") throw new Error("preflight failure");
    listener({ type: "agent_start" });
    if (scenario === "empty") emitMessage("I will review the fix");
    emitMessage(scenario === "empty" ? "" : "status: pass");
    if (scenario === "compacted") messages.length = 0;
    listener({ type: "agent_settled" });
  },
};

mock.module("@earendil-works/pi-coding-agent", {
  namedExports: {
    ...sdk,
    createAgentSession: async () => ({ session }),
    getAgentDir: () => tmpdir(),
    DefaultResourceLoader: class {
      async reload() {}
    },
    SessionManager: { create: () => ({}) },
    SettingsManager: { create: () => ({}) },
  },
});
const { piBackend } = await import("./src/backends/pi.ts");

function nextOutcome(child: SubagentSession) {
  return child.events.pipe(
    Stream.filter((event) => event._tag === "RunSettled"),
    Stream.take(1),
    Stream.runCollect,
    Effect.map((events) => {
      const event = events[0];
      assert.ok(event?._tag === "RunSettled");
      return event.outcome;
    }),
    Effect.timeout("2 seconds"),
  );
}

test("production Pi event wiring isolates restarts, empty responses, and compaction", async () => {
  const registry = { find: () => undefined, getAll: () => [] } as unknown as ModelRegistry;
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const child = yield* piBackend.spawn({
          prompt: "review",
          title: "test",
          cwd: tmpdir(),
          parent: { parentCwd: tmpdir(), projectTrusted: false, modelRegistry: registry },
        });
        assert.deepEqual(yield* nextOutcome(child), {
          _tag: "Completed",
          finalText: "status: pass",
        });

        scenario = "preflight";
        yield* child.send("retry");
        assert.deepEqual(yield* nextOutcome(child), {
          _tag: "Failed",
          errorText: "preflight failure",
          partialText: undefined,
        });

        scenario = "empty";
        yield* child.send("retry");
        assert.equal((yield* nextOutcome(child))._tag, "Failed");

        scenario = "compacted";
        yield* child.send("retry");
        assert.deepEqual(yield* nextOutcome(child), {
          _tag: "Completed",
          finalText: "status: pass",
        });
      }),
    ),
  );
  assert.equal(disposed, true);
});
