/**
 * Pure parsing helpers for web_search and web_fetch — no network, fully
 * testable. Kept apart from the extension wiring in `index.ts` so the HTML
 * parsing and text-shaping logic can be unit tested against real fixtures.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface Truncation {
  text: string;
  truncated: boolean;
  originalLength: number;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Unescapes named (`&amp;`), decimal (`&#39;`), and hex (`&#x27;`) HTML entities. */
export function unescapeHtml(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity] ?? match;
    const isHex = entity[1] === "x" || entity[1] === "X";
    const codePoint = isHex ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    // Out of Unicode range makes fromCodePoint throw, which would take down
    // web_fetch on any page containing `&#x110000;`. Leave it as written.
    if (Number.isNaN(codePoint) || codePoint > 0x10ffff) return match;
    return String.fromCodePoint(codePoint);
  });
}

/** Removes all HTML tags, keeping their text content. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

const TAGS_DROPPED_WITH_CONTENT = ["script", "style", "nav", "head", "svg"];

/**
 * Converts an HTML document to readable plain text: comments and the tags in
 * {@link TAGS_DROPPED_WITH_CONTENT} are removed along with their content,
 * remaining tags are stripped, entities are unescaped, and runs of blank
 * lines are collapsed.
 */
export function htmlToText(html: string): string {
  let text = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const tag of TAGS_DROPPED_WITH_CONTENT) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
  }
  text = unescapeHtml(stripTags(text));
  text = text.replace(/[ \t]+$/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

/** Truncates to roughly `maxLength` characters at a word boundary. */
export function truncateSnippet(text: string, maxLength = 200): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const head = trimmed.slice(0, maxLength);
  const boundary = head.lastIndexOf(" ");
  const cut = boundary === -1 ? head : head.slice(0, boundary);
  return `${cut.trimEnd()}…`;
}

/**
 * Decodes a DuckDuckGo `/l/?uddg=...` redirect href into the real target URL.
 * Falls back to the (entity-unescaped) href itself when there is no `uddg`
 * parameter, e.g. for DuckDuckGo's own internal links.
 */
export function decodeDdgHref(rawHref: string): string {
  const href = unescapeHtml(rawHref);
  try {
    const url = new URL(href, "https://duckduckgo.com");
    return url.searchParams.get("uddg") ?? href;
  } catch {
    return href;
  }
}

const RESULT_LINK_RE = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const RESULT_SNIPPET_RE = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

/**
 * Parses the result list out of a `html.duckduckgo.com/html/` response page.
 *
 * Titles and snippets are matched independently and paired by position,
 * since DuckDuckGo emits them as separate anchors within each result block.
 * Malformed or truncated HTML simply yields fewer matches; it never throws.
 */
export function parseDdgResults(html: string, limit: number): SearchResult[] {
  const titles = [...html.matchAll(RESULT_LINK_RE)].map((match) => ({
    href: match[1] ?? "",
    title: unescapeHtml(stripTags(match[2] ?? "")).trim(),
  }));
  const snippets = [...html.matchAll(RESULT_SNIPPET_RE)].map((match) =>
    unescapeHtml(stripTags(match[1] ?? "")).trim(),
  );

  const results: SearchResult[] = [];
  for (let index = 0; index < titles.length && results.length < limit; index++) {
    const { href, title } = titles[index]!;
    if (!title) continue;
    results.push({
      title,
      url: decodeDdgHref(href),
      snippet: truncateSnippet(snippets[index] ?? ""),
    });
  }
  return results;
}

/** Cuts `text` to `maxChars` at the last line boundary, reporting the original length. */
export function truncateText(text: string, maxChars: number): Truncation {
  const originalLength = text.length;
  if (originalLength <= maxChars) {
    return { text, truncated: false, originalLength };
  }
  const head = text.slice(0, maxChars);
  const boundary = head.lastIndexOf("\n");
  const cut = boundary === -1 ? head : head.slice(0, boundary);
  return { text: cut, truncated: true, originalLength };
}

/** True for a `text/html` (with or without charset) content-type header. */
export function isHtmlContentType(contentType: string): boolean {
  return contentType.split(";")[0]!.trim().toLowerCase() === "text/html";
}

/** Clamps `value` into `[min, max]`, falling back to `fallback` when not a finite number. */
export function clamp(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = value ?? fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
