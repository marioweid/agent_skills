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
// Versions and model ids are read from the snapshot, never pinned here: a
// package upgrade or a model preference change is not an error. What is
// checked is that the three files still agree with each other.
const dependencies = manifest.dependencies ?? {};
assert.equal(manifest.private, true);
assert.equal(lock.lockfileVersion, 3);
assert.equal(lock.name, manifest.name);
assert.equal(lock.packages[""].name, manifest.name);
assert.deepEqual(lock.packages[""].dependencies, dependencies);
assert.deepEqual(
  [...settings.packages].sort(),
  Object.entries(dependencies)
    .map(([name, version]) => `npm:${name}@${version}`)
    .sort(),
  "settings.packages must list exactly the pinned dependencies",
);
assert.match(settings.defaultModel, /\S/);
assert(
  settings.enabledModels.includes(`${settings.defaultProvider}/${settings.defaultModel}`),
  "the default model must be one of the enabled models",
);
assert(!("lastChangelogVersion" in settings));
assert(!("httpProxy" in settings));
assert(!existsSync(resolve(root, "models.json")), "No models override belongs in this snapshot");
for (const document of [settings, manifest, lock]) {
  assert(!/headroom|localhost:8787|127\.0\.0\.1:8787/i.test(JSON.stringify(document)));
}
for (const [name, version] of Object.entries(dependencies)) {
  // Exact pins only: a range here means `npm install` on another machine can
  // resolve something the lockfile never saw.
  assert.match(version, /^\d+\.\d+\.\d+(?:[-+].+)?$/, `${name} must be pinned exactly`);
  assert.equal(lock.packages[`node_modules/${name}`].version, version);
}
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  assert.match(entry.version, /^\d+\.\d+\.\d+(?:[-+].+)?$/);
  assert.match(entry.integrity, /^sha512-/);
  assert.equal(new URL(entry.resolved).origin, "https://registry.npmjs.org");
}
// This repo is public and machine-agnostic. Nothing tied to one machine or one
// employer belongs in it: absolute home paths, credential locations, cloud
// project ids, or a private registry picked up by a regenerated lockfile.
//
// The patterns below name categories, never a specific company or project, so
// this file stays publishable. Machine-local config lives outside the repo
// entirely -- put it directly in ~/.pi/agent/extensions/, which is a real
// directory of per-entry symlinks rather than a link to pi/extensions/, so a
// local-only file has nowhere to leak into. See README.md "What links where".
const PLACEHOLDER = "(?:you|me|user|username|name|someone)";
const FORBIDDEN = new RegExp(
  [
    // An absolute home path. Generic placeholders are allowed so docstrings and
    // mockups can show a realistic shape; the trailing `/` anchors the
    // exception so a real name like `mendel` still trips it.
    `/Users/(?!${PLACEHOLDER}/)[a-z0-9._-]+/`,
    `/home/(?!${PLACEHOLDER}/)[a-z0-9._-]+/`,
    "GOOGLE_APPLICATION_CREDENTIALS", // a credential location
    "AWS_SECRET_ACCESS_KEY",
    "\\.config/gcloud",
    "\\.ssh/id_[a-z]+",
    "_authToken", // an .npmrc registry token
  ].join("|"),
  "i",
);
const SKIP = new Set(["node_modules", ".git", ".DS_Store"]);
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
    // This file spells the patterns out in order to search for them.
    if (full === self) continue;
    const match = FORBIDDEN.exec(readFileSync(full, "utf8"));
    assert(!match, `Machine-specific value "${match?.[0]}" in ${full}`);
  }
};
// Scan the whole repo, not just pi/: skills, standards and .agent/ are just as
// publishable and were previously unchecked.
scan(resolve(root, ".."));
const extensionsLock = json("extensions/package-lock.json");
for (const [path, entry] of Object.entries(extensionsLock.packages)) {
  if (!path || !entry.resolved) continue;
  assert.equal(new URL(entry.resolved).origin, "https://registry.npmjs.org");
}

// The README tells a reader which pi the extensions were written against; the
// version comes from the lockfile, so an upgrade only fails this when the two
// actually drift apart.
const agentPackage = "@earendil-works/pi-coding-agent";
const piVersion = extensionsLock.packages[`node_modules/${agentPackage}`]?.version;
const guide = readFileSync(resolve(root, "README.md"), "utf8");
assert(
  guide.includes(`${agentPackage}@${piVersion}`),
  `pi/README.md names a different pi than the lockfile's ${piVersion}`,
);

// The build loop dispatches these five roles by name; a missing or renamed file
// fails at spawn time, deep inside a run. Catch it here instead.
const roles = ["scout", "architect", "implementer", "reviewer", "scribe"];
for (const role of roles) {
  const file = resolve(root, `agents/${role}.md`);
  assert(existsSync(file), `Missing role file agents/${role}.md`);
  const frontmatter = readFileSync(file, "utf8").split("---")[1] ?? "";
  assert.match(frontmatter, new RegExp(`^name: ${role}$`, "m"), `agents/${role}.md: name must be ${role}`);
  assert.match(frontmatter, /^model: \S+\/\S+$/m, `agents/${role}.md: model must be provider/id`);
  assert.match(frontmatter, /^tools: /m, `agents/${role}.md: tools allowlist is required`);
}

console.log(
  "PASS: snapshot files agree, exact pins, registry-only lock records, role files, no machine-specific values",
);
