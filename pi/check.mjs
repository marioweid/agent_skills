import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
// Nothing from the work machine belongs in this snapshot: the internal npm
// mirror, the GCP project the Vertex models run in, or the local credential
// path. `extensions/00-vertex-env.ts` holds all three and is gitignored; this
// is the guard for everything that could quietly pick them up, above all a
// lockfile regenerated behind the corporate registry.
const FORBIDDEN = /schwarzit|jfrog|sit-agentic|GOOGLE_APPLICATION_CREDENTIALS|\.config\/gcloud/i;
const SKIP = new Set(["node_modules", ".git"]);
// This file names the forbidden values in order to look for them.
const self = fileURLToPath(import.meta.url);
const scan = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      scan(full);
      continue;
    }
    // The vertex shim itself is the one file allowed to hold them, and it is
    // gitignored; everything else must be clean.
    if (entry.name === "00-vertex-env.ts" || full === self) continue;
    const match = FORBIDDEN.exec(readFileSync(full, "utf8"));
    assert(!match, `Machine-specific value "${match?.[0]}" in ${full}`);
  }
};
scan(root);
for (const [path, entry] of Object.entries(json("extensions/package-lock.json").packages)) {
  if (!path || !entry.resolved) continue;
  assert.equal(new URL(entry.resolved).origin, "https://registry.npmjs.org");
}

const guide = readFileSync(resolve(root, "README.md"), "utf8");
assert(guide.includes("@earendil-works/pi-coding-agent@0.85.1"));
console.log(
  "PASS: direct Codex snapshot, model preferences, exact pins, lock records, no machine-specific values",
);
