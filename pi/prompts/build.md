---
description: Run a feature, refactor, or unclear bug through the full loop — scouts, questions, plan, implement, review, record
argument-hint: <what to build or change>
---

Run the build loop for: **$ARGUMENTS**

You are the orchestrator. You dispatch, read reports, and decide. You do not write the code yourself.

Dispatch with `subagent_spawn({ harness: "pi", agent: "<role>", name: "<short-name>", prompt: "<self-contained>" })`. Model, thinking level, and tool allowlist come from the role file in `pi/agents/` — do not pass `model` unless I name one. Children cannot see this conversation, so every prompt carries its own context: paths, constraints, the acceptance check, and any relevant scout brief pasted in full.

1. **Recon.** 2-4 `scout`s in parallel, one question each, spawned in a single message. Wait for all. If a brief is empty or the child failed, say so — never invent one.
2. **Clarify.** Collect the scouts' `unknowns` plus your own. Ask me 1-3 `ask_user` questions covering the real forks — not things you can decide. One question per call. Skip this step only if there is genuinely nothing to decide, and say that you skipped it.
3. **Plan.** One `architect`, given the goal, my answers, and the briefs verbatim. Read its `## DESIGN BRIEF`.
4. **Gate.** If `gate: yes`, or the work touches schemas, public APIs, architecture, security, data migrations, deletion of shared code, or anything destructive or external: show me `plan_file` plus a 3-5 line summary and **stop**. Otherwise post the summary, say "proceeding, no gate", and continue.
5. **Build.** One `implementer` — never two at once — given the plan file path and the approved steps. Read its `## CHANGE SUMMARY`.
6. **Verify.** One `reviewer` on the diff (`git diff` plus the plan). Read its `## VERDICT`. On `reject`, send the blockers back to a fresh `implementer` and re-review. Two rounds maximum; then stop and bring me the open blockers with your recommendation.
7. **Record.** One `scribe` to update `.agent/PLAN.md` and append to `.agent/JOURNAL.md`.

Report to me at the end in under ten lines: what shipped, files touched, check results, review rounds, and anything left open.

Keep me posted with one line per completed stage. If a stage fails twice, stop and ask instead of grinding.
