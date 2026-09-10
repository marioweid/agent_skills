---
gate: yes
---

# Pi Linux notification sound and Codex usage

**Goal.** Make Pi's existing chime audible on Linux/NixOS without changing macOS or
Windows behavior, and add an on-demand `/usage` command that safely shows the current
ChatGPT Codex 5-hour and weekly quota percentages and reset times.

**Approach.** Extend the existing `notify` branch with Linux's native `pw-play` and the
known freedesktop sound; keep `afplay` on macOS and BEL on Windows/other platforms. Add
one dependency-free `usage` extension whose command resolves only Pi's `openai-codex`
OAuth auth, performs one `GET https://chatgpt.com/backend-api/wham/usage`, validates the
response, and reports two compact lines with `ctx.ui.notify`. This endpoint and its
`Authorization: Bearer` plus `ChatGPT-Account-Id` headers match the installed Pi Codex
provider contract and official Codex client's ChatGPT path; do not probe alternative
URLs. No design pattern is needed: pure selector/parser/formatter functions plus thin
extension wiring are simpler than a service layer.

**Not doing.**

- No footer, polling, cache, startup hook, or persisted usage state; `/usage` alone fetches.
- No OpenAI API-key provider, direct `auth.json` read/write, token logging, response-body
  logging, redirect following, or endpoint fallback; each would widen the credential boundary.
- No absolute quota counts: the account response exposes window duration, used percent, and
  reset time, as Codex displays them, but not an honest absolute denominator.
- No sound setting or player discovery; this machine's required Linux contract is `pw-play`.

## Steps

1. In `pi/extensions/notify/index.ts`, select `{ command, args }` by platform: existing
   `afplay`/Glass on `darwin`, `pw-play` with
   `/run/current-system/sw/share/sounds/freedesktop/stereo/complete.oga` on `linux`, and BEL
   otherwise. Export the pure selector, add Linux/macOS/Windows cases to
   `pi/extensions/notify/notify.test.ts`, and treat Linux spawn failure as tolerable by
   emitting BEL once — verify: the focused Node test passes and direct `pw-play` is audible.
2. Add `pi/extensions/usage/index.ts`. Register only `usage`; require the built-in
   `openai-codex` provider, exact `https://chatgpt.com/backend-api` base, subscription OAuth,
   and resolved API key. Decode the JWT's
   `https://api.openai.com/auth.chatgpt_account_id` locally with Node base64url support, then
   make one no-store, no-redirect GET with a 10-second timeout and only the bearer token,
   account-id, and JSON accept headers. Keep the token function-local and never interpolate it
   into output or errors — verify: mocked request tests assert URL, method, headers, timeout,
   and zero calls for unsupported/missing auth.
3. In the same module parse `unknown` into
   `CodexUsage { planType, fiveHour, weekly }`; each window contains `limitSeconds`,
   `usedPercent`, clamped `remainingPercent = 100 - usedPercent`, and `resetAtSeconds`.
   Require objects and finite values, percentages in `0..100`, positive epoch seconds, and
   locate exactly the 18,000-second and 604,800-second windows rather than trusting field
   order. Format local reset dates as `5h limit: N% left (M% used) · resets …` and the weekly
   equivalent. Add `pi/extensions/usage/usage.test.ts` for valid/reordered windows, 0/100
   boundaries, malformed JSON/schema, missing windows, timeout/network failure, 401/403,
   404, 429, and a secret-bearing error body that must not reach UI/errors — verify: focused
   Node tests pass with no live request.
4. Map every usage failure to fixed user text: missing/rejected auth tells the user to run
   `/login openai-codex`; 404/schema mismatch says the endpoint is unsupported; 429 says retry
   later; timeout/network/other HTTP status reports the operation and status only. These are
   fatal to that command (show no partial/stale quota) but do not affect Pi. Add `usage` to
   `pi/extensions/README.md`, create the live symlink
   `~/.pi/agent/extensions/usage -> <repo>/pi/extensions/usage`, then `/reload` — verify:
   `readlink` resolves to this checkout and `/usage` displays both live rows without a model
   turn or footer change.

## Verification evidence

- Linux sound and retained platform behavior — evidence:
  `cd pi/extensions && node --test --experimental-strip-types --no-warnings notify/notify.test.ts`;
  selector cases pass, then `pw-play` with the configured freedesktop `complete.oga`
  and a real Pi completion are audible.
- Safe, accurate quota parsing/request — evidence:
  `cd pi/extensions && node --test --experimental-strip-types --no-warnings usage/usage.test.ts`;
  fixtures produce 5h/weekly percentages and reset epochs, and all auth/schema/error cases pass.
- Production path — evidence: after `/reload`, invoke `/usage`; it must show both current
  quota lines from the authenticated account, make no model call, and leave the footer unchanged.
- Credential boundary — evidence:
  `if rg 'auth\.json|readFile|writeFile|appendEntry|setFooter|setStatus|console\.'`
  `pi/extensions/usage; then exit 1; fi`; it exits zero, and tests prove dummy secrets stay hidden.
- Repository gate — evidence: `cd pi/extensions && npm test && npm run check`, followed by
  `node pi/check.mjs`; all exit zero with no warnings.

## Risks

- The undocumented endpoint or schema can change. Exact origin checks, strict required-window
  validation, fixed errors, and no fallback probing make that a clear unsupported result rather
  than leaked credentials or misleading quota.
- Pi may refresh an expired OAuth credential inside `getProviderAuth`; that is Pi's existing
  locked auth behavior. The extension must never access or persist credential files itself.
- `node pi/check.mjs` currently has an unrelated baseline failure for an absolute home path in
  `docs/superpowers/plans/2026-09-09-direct-codex-portability.md`; fix it separately or confirm
  this work adds no further gate failures.

## Open questions

- None; the approved scope and the verified Codex response contract determine the implementation.
