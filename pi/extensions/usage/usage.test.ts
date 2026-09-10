import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  BASE_URL,
  formatUsage,
  loadCodexUsage,
  parseCodexUsage,
  usageErrorMessage,
} from "./index.ts";

const ACCOUNT_ID = "account-test-id";
const TOKEN = [
  "header",
  Buffer.from(JSON.stringify({
    "https://api.openai.com/auth": { chatgpt_account_id: ACCOUNT_ID },
  })).toString("base64url"),
  "signature",
].join(".");

const fiveHourWindow = {
  limit_window_seconds: 18_000,
  used_percent: 25,
  reset_at: 1_800_000_000,
};
const weeklyWindow = {
  limit_window_seconds: 604_800,
  used_percent: 75,
  reset_at: 1_800_100_000,
};

function registry(options: { token?: string; provider?: unknown; reject?: boolean } = {}) {
  const provider = options.provider === undefined
    ? {
        id: "openai-codex",
        baseUrl: BASE_URL,
        auth: { oauth: { isSubscription: true } },
      }
    : options.provider;
  return {
    getProvider: () => provider,
    getProviderAuth: async () => {
      if (options.reject) throw new Error("token must never reach the UI");
      const apiKey = options.token === undefined ? TOKEN : options.token;
      return { auth: { apiKey } };
    },
  };
}

function response(body: unknown, status: number = 200) {
  return new Response(JSON.stringify(body), { status });
}

function usageResponse(windows: Record<string, unknown> = {}) {
  return {
    plan_type: "pro",
    rate_limit: {
      allowed: true,
      limit_reached: false,
      primary_window: fiveHourWindow,
      secondary_window: weeklyWindow,
      ...windows,
    },
  };
}

test("loads reordered Codex windows with the required request contract", async () => {
  let request: { url: string; init: RequestInit | undefined } | undefined;
  const usage = await loadCodexUsage(registry(), async (url, init) => {
    request = { url: String(url), init };
    return response(usageResponse({
      primary_window: weeklyWindow,
      secondary_window: fiveHourWindow,
    }));
  });

  assert.deepEqual(usage, {
    planType: "pro",
    fiveHour: {
      limitSeconds: 18_000,
      usedPercent: 25,
      remainingPercent: 75,
      resetAtSeconds: 1_800_000_000,
    },
    weekly: {
      limitSeconds: 604_800,
      usedPercent: 75,
      remainingPercent: 25,
      resetAtSeconds: 1_800_100_000,
    },
  });
  assert.equal(request?.url, `${BASE_URL}/wham/usage`);
  assert.deepEqual(request?.init?.method, "GET");
  assert.deepEqual(request?.init?.cache, "no-store");
  assert.deepEqual(request?.init?.redirect, "error");
  assert.ok(request?.init?.signal instanceof AbortSignal);
  assert.deepEqual(request?.init?.headers, {
    Accept: "application/json",
    Authorization: `Bearer ${TOKEN}`,
    "ChatGPT-Account-Id": ACCOUNT_ID,
  });
});

test("parses and formats percentage boundaries as two local-time quota rows", () => {
  const usage = parseCodexUsage(usageResponse({
    primary_window: { ...fiveHourWindow, used_percent: 0, reset_at: 1 },
    secondary_window: { ...weeklyWindow, used_percent: 100, reset_at: 2 },
  }));
  const output = formatUsage(usage);

  assert.deepEqual(output, [
    `5h limit: 100% left (0% used) · resets ${new Date(1_000).toLocaleString()}`,
    `Weekly limit: 0% left (100% used) · resets ${new Date(2_000).toLocaleString()}`,
  ]);
});

test("rejects missing or malformed authentication before making a request", async () => {
  const cases = [
    registry({ provider: null }),
    registry({ provider: { id: "openai-codex", baseUrl: "https://elsewhere", auth: {} } }),
    registry({ token: "not-a-jwt" }),
    registry({ reject: true }),
  ];

  for (const value of cases) {
    let calls = 0;
    await assert.rejects(
      loadCodexUsage(value, async () => {
        calls += 1;
        return response({});
      }),
    );
    assert.equal(calls, 0);
  }
});

test("rejects malformed schemas and required windows", async () => {
  const badResponses = [
    new Response("not json"),
    response({ plan_type: "pro", rate_limit: {} }),
    response(usageResponse({ primary_window: { ...fiveHourWindow, used_percent: 101 } })),
    response(usageResponse({ secondary_window: { ...weeklyWindow, reset_at: 0 } })),
  ];

  for (const value of badResponses) {
    await assert.rejects(loadCodexUsage(registry(), async () => value));
  }
});

test("maps network and HTTP failures to fixed non-secret messages", async () => {
  const cases: Array<[() => Promise<Response>, string]> = [
    [
      async () => { throw new DOMException("timeout secret", "TimeoutError"); },
      "Could not fetch Codex usage: request timed out.",
    ],
    [
      async () => { throw new Error("network secret"); },
      "Could not fetch Codex usage: network error.",
    ],
    [async () => response({}, 401), "Codex login was rejected. Run `/login openai-codex`."],
    [async () => response({}, 403), "Codex login was rejected. Run `/login openai-codex`."],
    [async () => response({}, 404), "Codex usage endpoint is unsupported."],
    [async () => response({}, 429), "Codex usage is rate limited. Retry later."],
    [async () => response({}, 500), "Could not fetch Codex usage: HTTP 500."],
  ];

  for (const [request, expected] of cases) {
    await assert.rejects(loadCodexUsage(registry(), request), (error: unknown) => {
      assert.equal(usageErrorMessage(error), expected);
      assert.ok(!usageErrorMessage(error).includes("secret"));
      return true;
    });
  }
});

test("the command does not expose a secret-bearing response body", async () => {
  let handler: ((args: string, ctx: never) => Promise<void>) | undefined;
  const pi = {
    registerCommand: (_name: string, command: { handler: typeof handler }) => {
      handler = command.handler;
    },
  } as unknown as ExtensionAPI;
  const originalFetch = globalThis.fetch;
  const notices: string[] = [];
  globalThis.fetch = async () => new Response("response secret", { status: 500 });
  try {
    (await import("./index.ts")).default(pi);
    const context = {
      modelRegistry: registry(),
      ui: { notify: (text: string) => notices.push(text) },
    };
    await handler?.("", context as never);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(notices, ["Could not fetch Codex usage: HTTP 500."]);
  assert.ok(!notices.join("\n").includes("secret"));
});
