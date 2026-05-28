# Debugging Playbook

Common failure modes and how to diagnose them, in roughly the order you'll encounter them.

## Bot exits immediately on launch (no error visible)

**Symptom**: double-click launches BotsHub, the window flashes and closes, no log.

**Diagnosis** — check in this order:

1. **64-bit AutoIt** — `BotsHub.au3:158` exits if `@AutoItX64` is true. The `MsgBox` may have flashed past or been dismissed. Recompile/relaunch via the 32-bit SciTE.
2. **Old AutoIt** — `BotsHub.au3:154` exits if `@AutoItVersion < '3.3.16.0'`.
3. **No `#RequireAdmin`** — if the user disabled it, memory access fails silently and the script exits at the first `DllCall` against the game process.
4. **Game client not running** — `InitializeGameClientForGWA2()` (`GWA2_Assembly.au3:352`) fails with no client to attach to.

## Bot won't initialize / "memory pattern not found"

**Symptom**: log shows `Pattern scanner could not find ...`.

**Cause**: an Anet patch shifted the offsets the assembly module scans for. The fix is upstream — wait for a `BotsHub` release that updates patterns. As a workaround:

- Confirm the user is on the patch BotsHub last targeted (`README.md` mentions the supported build).
- Check `lib/GWA2_Assembly.au3` git log for recent pattern updates.
- If you're patient and have a debugger, run `SetupTestEnvironment` via `src/utilities/TestSuite.au3` which exercises pattern scans individually.

## Bot hangs in town (never enters the explorable)

**Symptom**: log says "Setting up farm" then stops. No errors. The character stands in the outpost.

Check `WaitMapLoading` (`GWA2.au3:750`) usage. Three modes:

1. **Missing deadlock** — `WaitMapLoading($mapID)` with no second arg uses default 10000 ms. Should be fine, but if the map ID is wrong (e.g. `$ID_NAHPUI_QUARTER_MISSION` instead of `$ID_NAHPUI_QUARTER`), it will time out and return `False` — and the *next* `MoveTo` will move the player around in the outpost.
2. **No follow-up check** — after `WaitMapLoading`, always `If GetMapID() <> $expectedMap Then Return $FAIL`. Mantids does this implicitly by gating `MantidsFarmLoop` on `GetMapID() <> $ID_WAJJUN_BAZAAR`.
3. **Wrong outpost** — `TravelToOutpost` returns `$FAIL` if the user doesn't have access. Check the return value:
   ```autoit
   If TravelToOutpost($ID_NAHPUI_QUARTER, $district_name) == $FAIL Then Return $FAIL
   ```

## Bot hangs mid-run

**Symptom**: the character is alive, in the right map, but not moving. Log is silent.

Walk the suspects in order:

### 1. Stuck in a `While Not IsRecharged` spin

Look for:

```autoit
While Not IsRecharged($SHADOWFORM)
    RandomSleep(500)
WEnd
```

If `$SHADOWFORM` doesn't match the actual slot, this loops forever. Verify with:

```autoit
ConsoleWrite('Slot 2 ID: ' & GetSkillbarSkillID(2) & @CRLF)
```

The skill template (`LoadSkillTemplate(...)`) determines which slot holds which skill. If the template was updated, the slot constants need to be updated too.

### 2. AdlibRegister never unregistered

Mantids fires `MantidsUseFallBack` once per 8 s, then unregisters at the end of the callback. If the unregister fires inside an `If` and the `If` never matches:

```autoit
Func MyAdlibCallback()
    If IsRecharged($MY_SKILL) Then
        UseSkillEx($MY_SKILL)
        AdlibUnRegister('MyAdlibCallback')   ; only fires when condition matches
    EndIf
EndFunc
```

Move `AdlibUnRegister` outside the conditional, or refactor so the condition is the loop guard:

```autoit
Func MyAdlibCallback()
    While IsRecharged($MY_SKILL) And IsPlayerAlive()
        UseSkillEx($MY_SKILL)
        RandomSleep(50)
    WEnd
    AdlibUnRegister('MyAdlibCallback')
EndFunc
```

### 3. `MoveTo` returning `False` and being ignored

`MoveTo` returns `False` on death, blocked count > 14, or map change. Most farm code doesn't check the return — fine when followed by a sentinel like `If IsPlayerDead() Then Return $FAIL`. Not fine when the next line assumes you reached the destination.

Pattern: when a bot says "going to X" then immediately tries to fight at X coords, but the character is still 500 units away, `MoveTo` returned `False` silently.

### 4. Rubber-banding

`IsPlayerRubberBanding()` (`Utils.au3:558`) is a stub in current source — but the symptom (server position diverged from client position) is real. The mitigation is `CheckAndSendStuckCommand()` (`Utils.au3:574`) which sends `/stuck` with a 10 s rate limit. The comment is explicit: **don't overuse, /stuck spam can cause a ban**.

### 5. Body-block

A hero or party member standing on a doorway. `MoveAvoidingBodyBlock` (`Utils.au3:647`) handles this — it jitters around the obstacle. If you're using bare `MoveTo`, swap it.

## Bot dies repeatedly and re-enters the same death loop

**Symptom**: failure counter climbs, log shows `Run failed` over and over.

### Max death malus reached

`IsPlayerAtMaxMalus()` (`Utils-Agents.au3:221`) returns true at -60 DP. Vaettirs handles this:

```autoit
If IsPlayerDead() Then
    If IsPlayerAtMaxMalus() Then
        Warn('Reached max death malus, restarting the farm setup')
        $vaettirs_farm_setup = False
        Return $FAIL
    EndIf
    While IsPlayerDead()
        Sleep(2500)
    WEnd
    Return RezoneToJagaMoraine()
EndIf
```

Setting `$<lower>_farm_setup = False` triggers a full re-port-and-resetup on the next call, which clears the malus.

For bots without explicit malus handling: kill BotsHub, port to a town manually, restart.

### Wrong build loaded

`LoadSkillTemplate` is silent on failure. Check `GetSkillbarSkillID(1)` after — if it's 0, the template didn't load. Most often: the build template string has a typo, or the player is on a profession that can't use the skills in the template.

### Insufficient attribute points

The build template carries skills *and* attribute distribution. If the character doesn't have enough attribute points to fully spec (level too low), some skills will be at attribute level 0. The bot fires them anyway and dies.

The fix is user-level: level up. There's no programmatic detection that scales attributes well.

## Setup loop (Vaettirs deadlock pattern)

Vaettirs.au3 has a defensive setup loop:

```autoit
While $vaettirs_deadlocked Or GetMapID() <> $ID_JAGA_MORAINE
    $vaettirs_deadlocked = False
    If RunToJagaMoraine() == $FAIL Then ContinueLoop
    $vaettirs_farm_setup = True
WEnd
```

`RunToJagaMoraine` walks a 30-waypoint path; any single waypoint can fail. The wrapper retries from the top. `$vaettirs_deadlocked` is set externally if a downstream check (e.g. malus, can't enter zone) detects we're stuck.

This pattern fits any bot whose setup involves a multi-step run with failure points. Borrow it for new bots that need similar retry logic.

## Skill not firing

**Symptom**: `UseSkillEx($SLOT)` returns `False` (or the bot just keeps looping).

`UseSkillEx` returns `False` when:

- Player is dead (`IsPlayerDead()`).
- Skill isn't recharged (`Not IsRecharged($slot)`).
- Slot is empty (`GetSkillbarSkillID($slot) == 0`).
- Energy is below the cost computed from the skill's metadata.
- (`UseSkillTimed` only) Cast timed out — usually means target moved out of range or died mid-cast.

Add a `ConsoleWrite` debug:

```autoit
ConsoleWrite('Slot ' & $slot & _
    ' ID=' & GetSkillbarSkillID($slot) & _
    ' Recharged=' & IsRecharged($slot) & _
    ' Energy=' & GetEnergy() & '/' & DllStructGetData(GetMyAgent(), 'MaxEnergy') & @CRLF)
UseSkillEx($slot, $target)
```

Strip these before commit (the lint regex flags `(Out|Debug|Info|Notice|Warn|Error)\(`, so they won't pass review by mistake).

## Hero not following / not casting

Common causes:

1. **Hero skills disabled** — `DisableAllHeroSkills(1)` was called but `EnableHeroSkillSlot` was never called for the slots you're driving. If you're firing skills explicitly with `UseHeroSkill`, this is fine. If you expect the hero AI to auto-cast, re-enable the skills.
2. **Hero is dead** — `GetIsDead(GetAgentByID(GetHeroID($idx)))`. Most farms ignore dead heroes; some explicitly resurrect them.
3. **Hero's energy is too low** — read `GetEnergy(GetAgentByID(GetHeroID($idx)))`.
4. **Hero behavior set to Avoid** — `SetHeroBehaviour($idx, $ID_HERO_FIGHTING)` to fix.
5. **Hero out of range** — heroes won't follow into different planes / through portals if they're flagged elsewhere. `CancelAllHeroes()` releases all flags.

## Excessive memory reads slowing the bot

**Symptom**: bot works but feels sluggish.

Almost always the snapshot anti-pattern. Search for `GetMyAgent()` inside loops:

```autoit
; search for repeated GetMyAgent in tight loops
rg "GetMyAgent\(\)" src/farms/<Name>.au3
```

Each `GetMyAgent()` is a fresh memory read. The fix is to call it once per loop iteration, store in `$me`, and read fields off the local snapshot.

Same applies to `GetSkillbar()` (each call traverses the offset chain). `GetSkillbar()` has a *cached* variant at `GWA2.au3:352` that built-in caching — read the comment before using.

## Inventory full mid-run

`BotsHub.au3:265-269` pauses the bot when `CountSlots(...) < $inventorySpaceNeeded` after `InventoryManagementBeforeRun`. The bot stops and notifies the user.

Causes:

- Storage full — Xunlai chest can't take more deposits. Manual cleanup required.
- Loot config too aggressive — `conf/loot/<Name>.json` picks up everything; switch to a per-farm config that only picks up valuable drops.
- `inventorySpaceNeeded` too high — set in `AddFarmToFarmMap`. Drop from `15` to `5` if the farm doesn't actually generate that much loot.

## /stuck-related ban risk

`CheckAndSendStuckCommand` is rate-limited to once per 10 seconds. **Don't reduce that interval.** Multiple `/stuck` commands per minute trigger Anet flags. The function's comment is unambiguous: *"do not overuse, otherwise there can be a BAN!"*

If a bot is sending `/stuck` more than once per couple minutes, it's stuck for a real reason — fix the underlying issue (wrong waypoint, body block) instead of leaning on `/stuck`.

## Diagnostic toolkit

- `_dlldisplay($struct, $fieldNames)` (`Utils.au3:2768`) — dump a `DllStruct`. Useful for inspecting an agent or skillbar.
- `GetOwnPosition()` (`Utils.au3:50`) — log current X/Y. Drop one in suspect waypoints to confirm the path.
- `Utils-Debugger.au3` — `Info`/`Warn`/`Error` write to SciTE console + GUI log + on-disk log. The on-disk log lives in `logs/` next to BotsHub.au3.
- `ToggleMapping($mode = 0, $path)` (`Utils.au3:1678`) — write the player's path to disk for offline analysis.
- `src/utilities/TestSuite.au3` — exercise individual GWA2 calls without a full farm. Register it temporarily (already in `FillFarmMap` as `'TestSuite'`).
