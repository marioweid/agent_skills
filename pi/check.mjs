import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL(".", import.meta.url));
const json = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const settings = json("settings.json");
const manifest = json("npm/package.json");
const lock = json("npm/package-lock.json");
const dependencies = { "@dietrichgebert/ponytail": "4.9.0", "pi-subagents": "0.66.0" };
assert.equal(manifest.private, true);
assert.deepEqual(manifest.dependencies, dependencies);
assert.equal(lock.lockfileVersion, 3);
assert.equal(lock.name, manifest.name);
assert.equal(lock.packages[""].name, manifest.name);
assert.deepEqual(lock.packages[""].dependencies, dependencies);
assert.deepEqual(settings.packages, [
  "npm:@dietrichgebert/ponytail@4.9.0",
  "npm:pi-subagents@0.66.0",
]);
assert.equal(settings.defaultProvider, "openai-codex");
assert.equal(settings.defaultModel, "gpt-5.6-terra");
assert.equal(settings.defaultThinkingLevel, "high");
assert.deepEqual(settings.enabledModels, [
  "openai-codex/gpt-5.6-luna",
  "openai-codex/gpt-5.6-sol",
  "openai-codex/gpt-5.6-terra",
  "openai-codex/gpt-6-astra",
  "deepseek/deepseek-v4-flash",
]);
assert.deepEqual(settings.subagents.agentOverrides, {
  scout: { model: "openai-codex/gpt-6-astra", thinking: "high" },
  reviewer: { model: "openai-codex/gpt-6-astra", thinking: "high" },
  worker: { model: "openai-codex/gpt-5.6-terra", thinking: "medium" },
  oracle: { model: "openai-codex/gpt-6-astra", thinking: "high" },
});
assert(!("lastChangelogVersion" in settings));
assert(!("httpProxy" in settings));
assert(!existsSync(resolve(root, "models.json")), "No models override belongs in this snapshot");
for (const document of [settings, manifest, lock]) {
  assert(!/headroom|localhost:8787|127\.0\.0\.1:8787/i.test(JSON.stringify(document)));
}
for (const [name, version] of Object.entries(dependencies)) {
  assert.equal(lock.packages[`node_modules/${name}`].version, version);
}
assert.equal(lock.packages["node_modules/@earendil-works/pi-server"].version, "0.85.0");
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  assert.match(entry.version, /^\d+\.\d+\.\d+(?:[-+].+)?$/);
  assert.match(entry.integrity, /^sha512-/);
  assert.equal(new URL(entry.resolved).origin, "https://registry.npmjs.org");
}
const guide = readFileSync(resolve(root, "README.md"), "utf8");
assert(guide.includes("@earendil-works/pi-coding-agent@0.85.1"));
console.log("PASS: direct Codex snapshot, model preferences, exact pins and lock records");
