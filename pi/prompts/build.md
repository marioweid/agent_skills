---
description: Implement and verify a task with optional focused delegation and risk-based review
argument-hint: <what to build or change>
---

Complete this task: **$ARGUMENTS**

Follow the working loop in the loaded standards. You own implementation in this session;
`/build` does not require a subagent pipeline or override a request to work alone.

Inspect relevant code, state a short plan when useful, implement, run applicable checks,
and inspect the final diff. Resolve routine choices yourself. Honor existing authorization;
ask about consequential unresolved decisions before committing to them.

Delegate only when a bounded assignment has a concrete benefit. Dispatch with
`subagent_spawn({ harness: "pi", agent: "<role>", name: "<short-name>", prompt: "..." })`.
Role files supply the model, effort, and tools. Include the goal, paths, constraints, and
acceptance checks; reference files instead of copying entire scout briefs. Do useful
independent work while a child runs. Never duplicate its investigation or share a worktree
between concurrent writers. Respect any user-selected model and no-subagent instruction.

Before independent review, finish edits and provide the exact diff scope (base revision
or patch, changed and untracked paths), intended behavior, check results, and concrete risks.
An ordinary tested change does not require independent review. The implementation owner
fixes supported blockers; at most one follow-up review checks those fixes and their impact.
Missing evidence is incomplete review, never approval. Report unresolved blockers honestly.

Update relevant docs and existing project memory yourself. Finish with what changed,
verification, whether independent review occurred, and any remaining limitations.
