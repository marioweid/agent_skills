import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePullRequestJson } from "./index.ts";

const OPEN = { number: 7, url: "https://example.test/pr/7", state: "OPEN" };

test("an empty list is a definitive 'no open pull request'", () => {
  assert.equal(parsePullRequestJson("[]"), null);
});

test("the first list entry is the branch's pull request", () => {
  assert.deepEqual(parsePullRequestJson(JSON.stringify([OPEN])), {
    number: 7,
    url: "https://example.test/pr/7",
    isDraft: false,
  });
  assert.deepEqual(
    parsePullRequestJson(JSON.stringify([{ ...OPEN, isDraft: true }])),
    { number: 7, url: "https://example.test/pr/7", isDraft: true },
  );
});

test("a closed or malformed entry is not reported as open", () => {
  assert.equal(parsePullRequestJson(JSON.stringify([{ ...OPEN, state: "MERGED" }])), null);
  assert.equal(parsePullRequestJson(JSON.stringify([{ number: 7 }])), null);
  assert.equal(parsePullRequestJson("not json"), null);
});
