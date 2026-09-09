import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { applyRole, loadAgentRoles, parseFrontmatter } from "./src/agents.ts";

function fixture(files: Record<string, string>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "roles-"));
  fs.mkdirSync(path.join(dir, "agents"));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, "agents", name), body);
  }
  return dir;
}

test("parses frontmatter, inline tool list, and body", () => {
  const dir = fixture({
    "critic.md":
      "---\nname: critic\ndescription: Adversarial reviewer. Writes no code.\ntools: read, grep, ls\nmodel: anthropic-vertex/claude-opus-5\nthinking: high\n---\n\nYou are a critic.\n",
  });
  const { roles, rejected } = loadAgentRoles(dir);
  assert.deepEqual(rejected, []);
  assert.equal(roles[0]?.name, "critic");
  assert.deepEqual(roles[0]?.tools, ["read", "grep", "ls"]);
  assert.equal(roles[0]?.model, "anthropic-vertex/claude-opus-5");
  assert.equal(roles[0]?.reasoningEffort, "high");
  assert.equal(roles[0]?.prompt, "You are a critic.");
  assert.match(applyRole(roles[0]!, "review X"), /You are a critic\.[\s\S]*review X/);
});

test("block-sequence tool lists are honoured, not silently dropped", () => {
  const dir = fixture({
    "critic.md": "---\nname: critic\ntools:\n  - read\n  - grep\n---\nbody\n",
  });
  const { roles } = loadAgentRoles(dir);
  assert.deepEqual(
    roles[0]?.tools,
    ["read", "grep"],
    "the common YAML list form must not fail open to all tools",
  );
});

test("an empty tools key is rejected rather than treated as unrestricted", () => {
  const dir = fixture({ "critic.md": "---\nname: critic\ntools:\n---\nbody\n" });
  const { roles, rejected } = loadAgentRoles(dir);
  assert.deepEqual(roles, []);
  assert.match(rejected[0]?.reason ?? "", /present but empty/);
});

test("wrong-case tool names are rejected instead of yielding zero tools", () => {
  const dir = fixture({ "critic.md": "---\nname: critic\ntools: Read, Grep\n---\nbody\n" });
  const { rejected } = loadAgentRoles(dir);
  assert.match(rejected[0]?.reason ?? "", /lowercase pi tool ids/);
});

test("CRLF files load like any other", () => {
  const dir = fixture({
    "critic.md": "---\r\nname: critic\r\ntools: read\r\n---\r\n\r\nbody\r\n",
  });
  const { roles, rejected } = loadAgentRoles(dir);
  assert.deepEqual(rejected, []);
  assert.deepEqual(roles[0]?.tools, ["read"]);
  assert.equal(roles[0]?.prompt, "body");
});

test("every malformed shape is reported with a reason", () => {
  const dir = fixture({
    "a-no-frontmatter.md": "just text",
    "b-unterminated.md": "---\nname: b\nbody with no closing delimiter\n",
    "c-no-body.md": "---\nname: c\n---\n",
    "d-bad-thinking.md": "---\nname: d\nthinking: turbo\n---\nbody\n",
    "e-ok.md": "---\nname: e\n---\nbody\n",
  });
  const { roles, rejected } = loadAgentRoles(dir);
  assert.deepEqual(roles.map((r) => r.name), ["e"]);
  assert.deepEqual(rejected.map((r) => r.file), [
    "a-no-frontmatter.md",
    "b-unterminated.md",
    "c-no-body.md",
    "d-bad-thinking.md",
  ]);
  assert.match(rejected[0]!.reason, /opening ---/);
  assert.match(rejected[1]!.reason, /closing ---/);
  assert.match(rejected[2]!.reason, /no prompt body/);
  assert.match(rejected[3]!.reason, /thinking: turbo/);
});

test("a duplicate role name is reported, not silently shadowed", () => {
  const dir = fixture({
    "a.md": "---\nname: critic\n---\nfirst\n",
    "z.md": "---\nname: critic\n---\nsecond\n",
  });
  const { roles, rejected } = loadAgentRoles(dir);
  assert.equal(roles.length, 1);
  assert.equal(roles[0]?.prompt, "first", "first file on disk wins");
  assert.match(rejected[0]?.reason ?? "", /duplicate role name "critic"/);
});

test("the filename supplies the name when the key is absent", () => {
  const dir = fixture({ "docs-writer.md": "---\nmodel: x\n---\nbody\n" });
  assert.equal(loadAgentRoles(dir).roles[0]?.name, "docs-writer");
});

test("a filename that is not a usable role name is rejected", () => {
  const dir = fixture({ "my agent.md": "---\nmodel: x\n---\nbody\n" });
  const { roles, rejected } = loadAgentRoles(dir);
  assert.deepEqual(roles, []);
  assert.match(rejected[0]?.reason ?? "", /not a usable role name/);
});

test("a missing agents directory is not an error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "none-"));
  assert.deepEqual(loadAgentRoles(dir), { roles: [], rejected: [] });
});

test("parseFrontmatter ignores comments and blank lines", () => {
  const { scalars, lists } = parseFrontmatter(
    "# a comment\nname: x\n\ntools:\n  - read\n  # inner comment\n  - grep\n",
  );
  assert.equal(scalars.get("name"), "x");
  assert.deepEqual(lists.get("tools"), ["read", "grep"]);
});
