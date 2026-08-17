# AutoIt + GWA2 Quirks

Hard rules and house style for BotsHub. The build will not run, or will silently misbehave, if these are violated. Sourced from `BotsHub/BotsHub.au3`, `BotsHub/doc/BotsHub AutoIt clean code guidelines.md`, and `BotsHub/doc/BotsHub AutoIt Tips & Tricks.md`.

## Runtime preconditions

- **AutoIt 3.3.16.0 or higher.** `BotsHub.au3:154` exits with a `MsgBox` if older.
- **32-bit (x86) only.** `BotsHub.au3:158` exits if `@AutoItX64` is true. The Guild Wars client is 32-bit; injection requires a 32-bit AutoIt process.
- **`#RequireAdmin`** on the launcher and on every farm file. `OpenProcess` and memory writes need elevation.
- **`#NoTrayIcon`** is conventional for bot files.
- **`Opt('MustDeclareVars', True)`** at the top of every farm. Catches typoed names that would otherwise become silent globals.

## Farm file header (canonical)

```autoit
#include-once
#RequireAdmin
#NoTrayIcon

#include '../../lib/GWA2.au3'
#include '../../lib/GWA2_ID.au3'
#include '../../lib/Utils.au3'

Opt('MustDeclareVars', True)
```

`#include-once` matters — every farm is included from `BotsHub.au3`, and the GWA2 includes get pulled in many times.

## House style (`doc/BotsHub AutoIt clean code guidelines.md`)

15+ rules; the ones most likely to bite:

- **Single quotes** by default. Double quotes only when escaping is needed.
- **Tabs for indentation, not spaces.** No mixing. `FillFarmMap()` aligns columns by tab — adding spaces breaks the diff.
- **No trailing whitespace.**
- **No stray semicolons** at end of lines.
- **No inline comments.** Comment on the line above. Inline `;` triggers the project's lint regex.
- **Consistent variable naming.** `Global Const $UPPER_SNAKE`, `Global $lower_snake`, `Local $camelCase`. Match this — `ResetBotsSetups()` references variables by exact name.
- **Prefer `While/WEnd`.** `Do/Until` is flagged by the lint regex.
- **No magic numbers.** Declare `Global Const $<FARM>_<SKILL_NAME> = N` for skill slots; use named constants for map IDs (`$ID_NAHPUI_QUARTER`).
- **Document every function** with `;~ ` above its `Func` line. The reference table generator and other tooling read those.
- **TODO/FIXME/NOTE** are all flagged — resolve them, don't leave them.

## Sleep cadence (rule 17)

Three flavors, each with a specific use:

| Call | When |
|------|------|
| `Sleep(<ms>)` | Precise wait — exact map-loading countdowns, fixed pauses between skills you've timed. |
| `Sleep(<ms> + GetPing())` | Frequent or packet-sensitive — salvage, trade, anything where a missed packet aborts the operation. |
| `RandomSleep(<ms>)` | Default everywhere else. Adds jitter so the bot doesn't look mechanical. |

`GetPing()` (`GWA2.au3:2713`) hits the network — comment in source says *"Do not overuse, is valuable for sensitive things (salvage for instance) and small sleeps."* Sample once per loop, reuse.

## AdlibRegister discipline

`AdlibRegister(name, intervalMs)` simulates background threading — the named function fires on a timer until you call `AdlibUnRegister(name)`. Mantids uses both fire-once and fire-until-condition flavors:

```autoit
Func MantidsUseFallBack()
    UseHeroSkill(1, $MANTIDS_FALLBACK)
    AdlibUnRegister('MantidsUseFallBack')
EndFunc

Func MantidsUseWhirlingDefense()
    While IsRecharged($MANTIDS_WHIRLING_DEFENSE) And IsPlayerAlive()
        UseSkillEx($MANTIDS_WHIRLING_DEFENSE)
        RandomSleep(50)
    WEnd
    AdlibUnRegister('MantidsUseWhirlingDefense')
EndFunc
```

Rules:

- Always pair `AdlibRegister` with `AdlibUnRegister` — either at the end of the callback (fire-once) or when the loop exits (fire-until).
- Never leave a callback registered across loop iterations. The next iteration will fire stale logic.
- The interval is wall-clock — don't pick a value smaller than your skill's cast time.

## Memory safety

- **Snapshot agents.** `GetMyAgent()` builds a `DllStruct` from the live game memory. Calling it 4× in a `While` loop is 4× the memory reads. The pattern in every farm is:

  ```autoit
  Local $me = GetMyAgent()
  While IsPlayerAlive() And $foesCount > 0
      RandomSleep(1000)
      $me = GetMyAgent()
      $foesCount = CountFoesInRangeOfAgent($me, $RANGE_NEARBY)
  WEnd
  ```

  Refresh `$me` once per iteration. Call `DllStructGetData($me, 'X')` etc. against the local snapshot. Per `BotsHub.au3:22`: *"Always refresh agents before getting data from them (agent = snapshot)"*.

- **Guard agent existence.** A freshly loaded map may not have your agent populated yet. Check with `GetAgentExists(GetMyID())` after a map transition before reading struct fields.

- **Use `Safe*` wrappers** for memory ops. `GWA2_Assembly.au3` exports `SafeDllCall*` and `SafeDllStructCreate` — they handle null-deref and bad-pointer cases. Don't roll your own `DllCall` against game memory.

- **Don't create `DllStruct` globals for templates that change.** Per `GWA2_Assembly.au3:34`: *"Do not create global DllStruct for those (can exist simultaneously in several instances)"*. Build them locally, let them go out of scope.

## Function return contract

Every farm function called from `BotHubLoop` must return one of:

- `$SUCCESS = 0` — run completed, loop again.
- `$FAIL = 1` — run failed, retry.
- `$PAUSE = 2` — give up, pause the bot (used when setup can't complete, e.g. wrong profession).

Returning `True`/`False` or nothing breaks `RunFarmLoop` — `$result == $PAUSE` and `$run_options_cache['run.loop_mode']` are both checked (`BotsHub.au3:229`).

## Map transitions

`WaitMapLoading($mapID, $deadlockTime, $waitingTime)` (`GWA2.au3:750`) is the only safe way to block on a map change. Default `$deadlockTime` is 10s — pass it explicitly. Without a deadlock argument set to a positive value, a failed transition hangs forever:

```autoit
WaitMapLoading($ID_NAHPUI_QUARTER, 10000, 2000)
```

After return, *always* re-check `GetMapID() == $expectedMap` before continuing — `WaitMapLoading` returns `False` on deadlock and the bot may be in the wrong instance.

## Never modify the `lib/` tree — fork into the farm file

`~/Sources/BotsHub/lib/` is the **community-shared standard**. It's pulled from upstream via git and receives commits from other contributors. Locally editing any file there — `GWA2.au3`, `GWA2_Assembly.au3`, the `GWA2_ID*.au3` tables, `Utils.au3`, `Utils-Agents.au3`, `Utils-Storage.au3`, `Utils-Debugger.au3`, `BotsHub-GUI.au3`, `JSON.au3`, `SQLite*`, `Build_*` — guarantees merge conflicts on every `git pull`.

The only library-adjacent file that's edited routinely is `BotsHub.au3` (registration: `#include`, `$AVAILABLE_FARMS`, `FillFarmMap()`, `ResetBotsSetups()`).

### What to do when a library function isn't quite right

Copy the function into the farm file under a new name, change what you need, and call the local version instead. The original keeps doing its job for everyone else; your farm gets the behavior it wants.

```autoit
; src/farms/Skales.au3 — local variant of MoveTo with a tighter precision
; and a per-step lure check. Original at lib/Utils.au3:57 is unchanged.
Func SkalesMoveTo($X, $Y, $precision = 10, $random = 30, $doWhile = Null)
    Local $blockedCount = 0
    Local $mapID = GetMapID()
    Local $destX = $X + Random(-$random, $random)
    Local $destY = $Y + Random(-$random, $random)

    Move($destX, $destY, 0)
    Local $me = GetMyAgent()
    While GetDistanceToPoint($me, $destX, $destY) > $precision
        If $doWhile <> Null Then $doWhile()
        SkalesLureCheck()
        RandomSleep(100)
        ...
    WEnd
    Return True
EndFunc
```

Naming convention: prefix with the farm name (`SkalesMoveTo`, `VaettirsMoveDefending`). This makes it obvious the function lives outside `lib/` and signals to readers that it's farm-specific behavior, not the shared API.

### When you suspect the library itself has a bug

If the issue is in `lib/` and would benefit every farm, that's an **upstream contribution**, not a local fix. Surface it to the user with a clear bug report — they can decide whether to push a PR upstream or keep a local fork in their farm. Do not silently edit `lib/` and hope it doesn't conflict.

## Globals across farms

Every farm declares `Global $<name>_farm_setup = False` at file scope. `BotsHub.au3:554` (`ResetBotsSetups`) lists them by exact variable name. Two consequences:

1. The variable name must match what `ResetBotsSetups` expects, or the reset is silent.
2. If your farm ports back to a city between runs, add the line to `ResetBotsSetups` so the next loop re-runs setup.

Bots that stay in the same instance (CoF, Corsairs, FoW, Underworld, Voltaic, the gemstone variants) deliberately don't appear in `ResetBotsSetups` — see the commented block at `BotsHub.au3:573-587` for the canonical list.

## Tracing and logging

- `Info('msg')`, `Warn('msg')`, `Error('msg')`, `Notice('msg')` are wrappers that route to SciTE console + GUI log + on-disk log. Use them, not `ConsoleWrite`.
- Lint flags `(Out|Debug|Info|Notice|Warn|Error)\(` so debug calls get reviewed before merge — clean them up before commit.
- `TimerInit()` / `TimerDiff($timer)` for measuring elapsed time. `CheckStuck($location, $maxMs)` (`Utils.au3:564`) wraps the common "fail if I've been here too long" pattern.
