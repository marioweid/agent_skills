---
description: Run a feature/change through the architect → implementer → QA → quality → critic → docs agent loop
---

Run the following task through the full agent loop: **$ARGUMENTS**

You are the orchestrator. Dispatch each role as a subagent via the task tool (`subagent_type` in parentheses), read the structured block at the end of each report, and drive the flow below. Do not do the roles' work yourself — dispatch them.

**Model selection.** opencode's task tool has no per-dispatch model override. The pipeline agents inherit the model selected for the current session, avoiding stale provider-specific pins. To pin a role deliberately, set `model: <provider>/<model>` in its agent file.

## Flow

1. **architect** — design the approach. Read its `## DESIGN BRIEF`.
   - **DESIGN GATE (mandatory stop).** The architect writes a sparse design doc to the path in `plan_file`. Point the user at that file to open and edit, and give a 3–5 line summary of the approach plus any `open_questions`. Then STOP and wait. Do not dispatch the implementer until the user responds.
     - User approves → continue to step 2.
     - User redirects (in chat or by editing the plan file) → send their feedback back to the **architect** to revise and rewrite the design doc, then present the DESIGN GATE again.
   - This is the one place the loop always waits for a human. Everything after it runs autonomously through the critic loop and docs.
2. **implementer** — pass the design brief. Read its `## CHANGE SUMMARY`.
3. **qa-engineer** — pass the change summary. Read its `## QA REPORT`. If `results: FAIL`, route straight back to **implementer** with the failures (this counts as an iteration).
4. **quality-checker** — read its `## QUALITY GATE`. If `status: FAIL`, route back to **implementer** with the violations (counts as an iteration).
5. **critic** — pass everything. Read its `## VERDICT`.
   - `status: PASS` → go to step 6.
   - `status: REJECT` → dispatch the subagent named in `route_to`, passing the critic's `reasons`. Then re-run every downstream step from that point through the critic again.
6. **docs-writer** — only after the critic PASSES. Read its `## DOCS SUMMARY`.
7. Report a short final summary to the user: what was built, files changed, test/quality status, and how many critic rounds it took.

## Rules

- **Iteration cap: 3 critic rounds.** If the critic still rejects after 3, stop and surface the full picture (latest code state, outstanding critic reasons, your recommendation) to the user for a decision. Do not loop forever.
- When routing back, give the target subagent the specific reasons/violations plus the context it needs — don't make it rediscover the problem.
- Pass each role the prior artifacts it needs (design brief, change summary, reports), not the entire transcript.
- Keep the user informed with a one-line status as each stage completes.
