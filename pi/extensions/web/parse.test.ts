import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  clamp,
  decodeDdgHref,
  htmlToText,
  isHtmlContentType,
  parseDdgResults,
  stripTags,
  truncateSnippet,
  truncateText,
  unescapeHtml,
} from "./src/parse.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(HERE, "fixtures/ddg-sample.html"), "utf8");

test("parses the real DDG fixture into results with clean titles, real URLs, and snippets", () => {
  const results = parseDdgResults(FIXTURE, 20);
  assert.ok(results.length >= 5, `expected at least 5 results, got ${results.length}`);
  for (const result of results) {
    assert.ok(result.title.length > 0, "title should not be empty");
    assert.match(result.url, /^https:\/\//, "url should be https");
    assert.doesNotMatch(result.url, /duckduckgo\.com/, "url should not be a DDG redirect");
    assert.ok(result.snippet.length > 0, "snippet should not be empty");
  }
});

test("unescapes HTML entities in titles and snippets from the fixture", () => {
  const results = parseDdgResults(FIXTURE, 20);
  const joined = results.map((r) => `${r.title} ${r.snippet}`).join(" ");
  assert.doesNotMatch(joined, /&#x27;|&amp;|&quot;/, "raw entities should be decoded");
});

test("respects the limit parameter", () => {
  const results = parseDdgResults(FIXTURE, 3);
  assert.equal(results.length, 3);
});

test("a response with zero results yields an empty array, not an error", () => {
  assert.deepEqual(parseDdgResults("<html><body>No results.</body></html>", 10), []);
});

test("malformed and truncated HTML yields whatever it can parse without throwing", () => {
  const truncated =
    '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Example';
  assert.doesNotThrow(() => parseDdgResults(truncated, 10));
  assert.deepEqual(parseDdgResults(truncated, 10), []);

  const oneGoodOneBroken =
    '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com">Example</a>' +
    '<a class="result__a" href="not-even-a-tag';
  const results = parseDdgResults(oneGoodOneBroken, 10);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.url, "https://example.com");
});

test("unescapeHtml decodes named, decimal, and hex entities", () => {
  assert.equal(unescapeHtml("Tom &amp; Jerry"), "Tom & Jerry");
  assert.equal(unescapeHtml("it&#x27;s"), "it's");
  assert.equal(unescapeHtml("&#39;quoted&#39;"), "'quoted'");
  assert.equal(unescapeHtml("no entities here"), "no entities here");
});

test("stripTags removes tags but keeps their text content", () => {
  assert.equal(stripTags("<b>bold</b> and <i>italic</i>"), "bold and italic");
});

test("decodeDdgHref decodes the uddg redirect target", () => {
  const href = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath&rut=abc123";
  assert.equal(decodeDdgHref(href), "https://example.com/path");
});

test("decodeDdgHref falls back to the raw href when uddg is absent", () => {
  assert.equal(decodeDdgHref("https://example.com/direct"), "https://example.com/direct");
});

test("truncateSnippet leaves short text untouched", () => {
  assert.equal(truncateSnippet("short snippet"), "short snippet");
});

test("truncateSnippet cuts at a word boundary near the limit", () => {
  const long =
    "The quick brown fox jumps over the lazy dog again and again and again more words here";
  const result = truncateSnippet(long, 40);
  assert.ok(result.endsWith("…"), "should end with an ellipsis");
  const withoutEllipsis = result.slice(0, -1);
  assert.ok(withoutEllipsis.length <= 40);
  assert.ok(long.startsWith(withoutEllipsis), "kept text must be a prefix of the original");
  assert.equal(long[withoutEllipsis.length], " ", "should cut right at a space, not mid-word");
});

test("htmlToText drops script and style content, not just the tags", () => {
  const html = `
    <html><head><title>t</title></head>
    <body>
      <script>alert("should not appear");</script>
      <style>.x { color: red; should-not-appear: true; }</style>
      <nav>Skip this nav link</nav>
      <p>Visible paragraph.</p>
    </body></html>
  `;
  const text = htmlToText(html);
  assert.doesNotMatch(text, /should not appear/);
  assert.doesNotMatch(text, /should-not-appear/);
  assert.doesNotMatch(text, /Skip this nav link/);
  assert.match(text, /Visible paragraph\./);
});

test("htmlToText strips HTML comments and collapses blank line runs", () => {
  const html = "<p>one</p>\n<!-- a comment -->\n\n\n\n<p>two</p>";
  const text = htmlToText(html);
  assert.doesNotMatch(text, /a comment/);
  assert.doesNotMatch(text, /\n{3,}/);
  assert.match(text, /one/);
  assert.match(text, /two/);
});

test("htmlToText unescapes entities in the remaining text", () => {
  assert.equal(htmlToText("<p>Tom &amp; Jerry</p>"), "Tom & Jerry");
});

test("truncateText cuts at a line boundary and reports the original length", () => {
  const text = "line one\nline two\nline three\nline four";
  const result = truncateText(text, 20);
  assert.equal(result.truncated, true);
  assert.equal(result.originalLength, text.length);
  assert.ok(!result.text.includes("\n") || text.startsWith(result.text));
  assert.ok(text.startsWith(result.text));
  assert.equal(text[result.text.length], "\n");
});

test("truncateText returns the text unchanged when under the limit", () => {
  const result = truncateText("short", 100);
  assert.equal(result.truncated, false);
  assert.equal(result.text, "short");
  assert.equal(result.originalLength, 5);
});

test("isHtmlContentType matches text/html with or without a charset", () => {
  assert.equal(isHtmlContentType("text/html"), true);
  assert.equal(isHtmlContentType("text/html; charset=utf-8"), true);
  assert.equal(isHtmlContentType("application/json"), false);
  assert.equal(isHtmlContentType("text/plain"), false);
});

test("clamp bounds a value into range and falls back for missing/invalid input", () => {
  assert.equal(clamp(5, 1, 20, 8), 5);
  assert.equal(clamp(50, 1, 20, 8), 20);
  assert.equal(clamp(0, 1, 20, 8), 1);
  assert.equal(clamp(undefined, 1, 20, 8), 8);
  assert.equal(clamp(Number.NaN, 1, 20, 8), 8);
});
