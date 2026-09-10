import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";

export const BASE_URL = "https://chatgpt.com/backend-api";

const PROVIDER_ID = "openai-codex";
const USAGE_URL = `${BASE_URL}/wham/usage`;
const FIVE_HOUR_SECONDS = 18_000;
const WEEKLY_SECONDS = 604_800;
const REQUEST_TIMEOUT_MS = 10_000;
const ACCOUNT_ID_CLAIM = "https://api.openai.com/auth";

type UsageFailureKind = "auth" | "unsupported" | "rate" | "timeout" | "network" | "http";

type UsageRegistry = Pick<ModelRegistry, "getProvider" | "getProviderAuth">;

type CodexUsageWindow = {
  limitSeconds: number;
  usedPercent: number;
  remainingPercent: number;
  resetAtSeconds: number;
};

export type CodexUsage = {
  planType: string;
  fiveHour: CodexUsageWindow;
  weekly: CodexUsageWindow;
};

class UsageFailure extends Error {
  readonly kind: UsageFailureKind;
  readonly status: number | undefined;

  constructor(kind: UsageFailureKind, status?: number) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function accountId(token: string): string | undefined {
  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const claims = record(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    const auth = record(claims?.[ACCOUNT_ID_CLAIM]);
    const id = auth?.chatgpt_account_id;
    return typeof id === "string" && id ? id : undefined;
  } catch {
    return undefined;
  }
}

function parseWindow(value: unknown): CodexUsageWindow | undefined {
  const window = record(value);
  const limitSeconds = number(window?.limit_window_seconds);
  const usedPercent = number(window?.used_percent);
  const resetAtSeconds = number(window?.reset_at);
  if (
    limitSeconds === undefined || usedPercent === undefined || resetAtSeconds === undefined ||
    limitSeconds <= 0 || usedPercent < 0 || usedPercent > 100 || resetAtSeconds <= 0
  ) {
    return undefined;
  }
  return {
    limitSeconds,
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetAtSeconds,
  };
}

export function parseCodexUsage(value: unknown): CodexUsage {
  const payload = record(value);
  const planType = payload?.plan_type;
  const rateLimit = record(payload?.rate_limit);
  if (typeof planType !== "string" || !planType || !rateLimit) {
    throw new UsageFailure("unsupported");
  }

  const windows = Object.values(rateLimit).map(parseWindow).filter((window) => window !== undefined);
  const fiveHour = windows.filter((window) => window.limitSeconds === FIVE_HOUR_SECONDS);
  const weekly = windows.filter((window) => window.limitSeconds === WEEKLY_SECONDS);
  if (fiveHour.length !== 1 || weekly.length !== 1 || !fiveHour[0] || !weekly[0]) {
    throw new UsageFailure("unsupported");
  }

  return { planType, fiveHour: fiveHour[0], weekly: weekly[0] };
}

async function resolvedAuth(registry: UsageRegistry): Promise<{ token: string; account: string }> {
  const provider = registry.getProvider(PROVIDER_ID);
  if (
    provider?.id !== PROVIDER_ID || provider.baseUrl !== BASE_URL ||
    !provider.auth.oauth?.isSubscription
  ) {
    throw new UsageFailure("unsupported");
  }

  let token: string | undefined;
  try {
    token = (await registry.getProviderAuth(PROVIDER_ID))?.auth.apiKey;
  } catch {
    throw new UsageFailure("auth");
  }
  const account = token ? accountId(token) : undefined;
  if (!account || !token) throw new UsageFailure("auth");
  return { token, account };
}

function responseFailure(status: number): UsageFailure {
  if (status === 401 || status === 403) return new UsageFailure("auth");
  if (status === 404) return new UsageFailure("unsupported");
  if (status === 429) return new UsageFailure("rate");
  return new UsageFailure("http", status);
}

export async function loadCodexUsage(
  registry: UsageRegistry,
  request: typeof fetch = fetch,
): Promise<CodexUsage> {
  const { token, account } = await resolvedAuth(registry);
  let response: Response;
  try {
    response = await request(USAGE_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "ChatGPT-Account-Id": account,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new UsageFailure("timeout");
    }
    throw new UsageFailure("network");
  }
  if (!response.ok) throw responseFailure(response.status);

  try {
    return parseCodexUsage(await response.json());
  } catch (error) {
    if (error instanceof UsageFailure) throw error;
    throw new UsageFailure("unsupported");
  }
}

export function formatUsage(usage: CodexUsage): string[] {
  const format = (label: string, window: CodexUsageWindow) => {
    const reset = new Date(window.resetAtSeconds * 1000).toLocaleString();
    return `${label}: ${window.remainingPercent}% left ` +
      `(${window.usedPercent}% used) · resets ${reset}`;
  };
  return [format("5h limit", usage.fiveHour), format("Weekly limit", usage.weekly)];
}

export function usageErrorMessage(error: unknown): string {
  const failure = error instanceof UsageFailure ? error : new UsageFailure("network");
  switch (failure.kind) {
    case "auth":
      return "Codex login was rejected. Run `/login openai-codex`.";
    case "unsupported":
      return "Codex usage endpoint is unsupported.";
    case "rate":
      return "Codex usage is rate limited. Retry later.";
    case "timeout":
      return "Could not fetch Codex usage: request timed out.";
    case "http":
      return `Could not fetch Codex usage: HTTP ${failure.status}.`;
    case "network":
      return "Could not fetch Codex usage: network error.";
  }
}

export default function usage(pi: ExtensionAPI) {
  pi.registerCommand("usage", {
    description: "Show current ChatGPT Codex quota usage",
    handler: async (_args, ctx) => {
      try {
        ctx.ui.notify(formatUsage(await loadCodexUsage(ctx.modelRegistry)).join("\n"), "info");
      } catch (error) {
        ctx.ui.notify(usageErrorMessage(error), "error");
      }
    },
  });
}
