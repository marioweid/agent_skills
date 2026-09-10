/**
 * web — first-class web search and page fetch for pi, with zero dependencies.
 *
 * pi ships no web tools; this extension covers the gap `curl` already fills
 * by hand, as a tool the model reaches for on its own. `web_search` queries
 * `html.duckduckgo.com/html/` (the only DuckDuckGo endpoint that answers a
 * plain GET with no API key or JS challenge) and `web_fetch` retrieves a URL
 * and converts HTML to readable text. No retries, no provider fallback, no
 * caching — a failure is reported and left to the caller.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  clamp,
  htmlToText,
  isHtmlContentType,
  parseDdgResults,
  truncateText,
} from "./src/parse.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const DDG_SEARCH_URL = "https://html.duckduckgo.com/html/";
const SEARCH_TIMEOUT_MS = 15_000;
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_MAX_CHARS = 20_000;

/** Combines the tool's cancellation signal with a fixed per-call timeout. */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Rejects any URL whose scheme is not http/https, naming the scheme for the caller. */
function requireHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`web_fetch: "${rawUrl}" is not a valid URL.`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `web_fetch: refusing to fetch "${rawUrl}" — scheme "${url.protocol}" is not http/https.`,
    );
  }
  return url;
}

/** A network-level fetch failure, described with the host it targeted. */
function networkErrorMessage(operation: string, host: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `${operation}: request to ${host} failed (${reason}). Check network connectivity or the URL, then retry.`;
}

function formatSearchResults(
  query: string,
  results: { title: string; url: string; snippet: string }[],
): string {
  const blocks = results.map(
    (result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`,
  );
  return `${results.length} results for "${query}":\n\n${blocks.join("\n\n")}`;
}

export default function web(pi: ExtensionAPI) {
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web via DuckDuckGo and return titles, URLs, and snippets. " +
      "Use this to find current information, documentation, or sources before answering.",
    promptSnippet: "web_search(query, limit?) — search the web via DuckDuckGo",
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
      limit: Type.Optional(
        Type.Integer({
          description: "Maximum number of results to return (1-20, default 8).",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const limit = clamp(params.limit, 1, 20, DEFAULT_SEARCH_LIMIT);
      const url = new URL(DDG_SEARCH_URL);
      url.searchParams.set("q", params.query);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: withTimeout(signal, SEARCH_TIMEOUT_MS),
        });
      } catch (error) {
        throw new Error(networkErrorMessage("web_search", url.hostname, error));
      }
      if (!response.ok) {
        throw new Error(
          `web_search: ${url.hostname} returned HTTP ${response.status} for query ` +
            `"${params.query}". DuckDuckGo may be rate-limiting or blocking this request; retry later.`,
        );
      }

      const results = parseDdgResults(await response.text(), limit);
      const text =
        results.length === 0 ? `No results for ${params.query}` : formatSearchResults(params.query, results);
      return { content: [{ type: "text", text }], details: { query: params.query, count: results.length } };
    },
  });

  pi.registerTool({
    name: "web_fetch",
    label: "Web Fetch",
    description:
      "Fetch a URL and return its content as readable plain text (HTML is stripped of " +
      "scripts, styles, and tags). Use this to read a page found via web_search or named by the user.",
    promptSnippet: "web_fetch(url, max_chars?) — fetch a URL as readable plain text",
    parameters: Type.Object({
      url: Type.String({ description: "The http(s) URL to fetch." }),
      max_chars: Type.Optional(
        Type.Integer({
          description: "Maximum characters of body text to return (1000-100000, default 20000).",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal) {
      const url = requireHttpUrl(params.url);
      const maxChars = clamp(params.max_chars, 1000, 100_000, DEFAULT_MAX_CHARS);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
          signal: withTimeout(signal, FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        throw new Error(networkErrorMessage("web_fetch", url.hostname, error));
      }
      if (!response.ok) {
        throw new Error(`web_fetch: ${params.url} returned HTTP ${response.status}.`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      const body = await response.text();
      const text = isHtmlContentType(contentType) ? htmlToText(body) : body;
      const result = truncateText(text, maxChars);

      const output = result.truncated
        ? `${result.text}\n\n[truncated: showing ${maxChars} of ${result.originalLength} characters]`
        : result.text;
      return {
        content: [{ type: "text", text: output }],
        details: { url: params.url, truncated: result.truncated, originalLength: result.originalLength },
      };
    },
  });
}
