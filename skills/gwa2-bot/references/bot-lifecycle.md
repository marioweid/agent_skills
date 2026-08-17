# Bot Lifecycle

The shape every farm follows, from file header to `Return $SUCCESS`. Annotated walkthrough of `Mantids.au3` — the smallest representative bot.

## File anatomy

```autoit
#include-once          ; included from BotsHub.au3 alongside many siblings
#RequireAdmin          ; memory ops need elevation
#NoTrayIcon            ; cosmetic

#include '../../lib/GWA2.au3'
#include '../../lib/GWA2_ID.au3'
#include '../../lib/Utils.au3'

Opt('MustDeclareVars', True)

; ==== Constants ====
; Build template encoded strings
Global Const $RA_MANTIDS_FARMER_SKILLBAR = 'OgcTYxr+5B5ozOgFHCIuT4AdAA'
Global Const $MANTIDS_HERO_SKILLBAR      = 'OQijEqmMKODbe8OmEbi7x3YWMA'
Global Const $MANTIDS_FARM_DURATION      = 1 * 60 * 1000 + 30 * 1000

; Skill slots (player) — declared so calls read like prose
Global Const $MANTIDS_SERPENTS_QUICKNESS = 1
...
Global Const $MANTIDS_EDGE_OF_EXTINCTION = 8

; Skill slots (hero 1)
Global Const $MANTIDS_VOCAL_WAS_SOGOLON  = 1
...

; Setup-once flag
Global $mantids_farm_setup = False
```

Five things every farm declares:

1. **Build template strings** — at least one for the player, one per hero.
2. **Farm duration constant** — `$<NAME>_FARM_DURATION` in ms. Read by `BotsHub.au3:528` for progress bar and timeout heuristics.
3. **Skill-slot constants** — `Global Const $<FARM>_<SKILL_NAME> = N`, one per slot used. Banishes magic numbers.
4. **Hero skill-slot constants** — same shape. Conventionally `$<FARM>_VOCAL_WAS_SOGOLON` for the hero's slot 1.
5. **Setup flag** — `Global $<lower>_farm_setup = False`. Tracked by `BotsHub.au3:554` (`ResetBotsSetups`).

## The four functions

Every farm has the same four-function shape (sometimes split further):

### 1. Entry point: `<Name>Farm()`

```autoit
Func MantidsFarm()
    If Not $mantids_farm_setup And SetupMantidsFarm() == $FAIL Then Return $PAUSE

    GoToWajjunBazaar()
    Local $result = MantidsFarmLoop()
    ResignAndReturnToOutpost($ID_NAHPUI_QUARTER)
    Return $result
EndFunc
```

The contract:

- Skip setup if already done. If setup *fails*, `Return $PAUSE` — something the user has to fix (wrong profession, no hero unlocked).
- Travel to the explorable.
- Run the loop. Capture its return.
- Always end by porting back to the outpost (so the next iteration starts clean).
- Return what the loop returned.

### 2. Setup: `Setup<Name>Farm()`

```autoit
Func SetupMantidsFarm()
    Info('Setting up farm')
    If TravelToOutpost($ID_NAHPUI_QUARTER, $district_name) == $FAIL Then Return $FAIL
    SwitchMode($ID_HARD_MODE)

    If SetupPlayerMantidsFarm() == $FAIL Then Return $FAIL
    If SetupTeamMantidsFarm() == $FAIL Then Return $FAIL

    GoToWajjunBazaar()
    MoveTo(9100, -19600)
    Move(9100, -20500)
    RandomSleep(1000)
    WaitMapLoading($ID_NAHPUI_QUARTER, 10000, 2000)
    $mantids_farm_setup = True
    Info('Preparations complete')
    Return $SUCCESS
EndFunc
```

The pattern:

- Travel to the outpost. If you can't reach it, `Return $FAIL` — most often this means the user doesn't have access (mission incomplete, not unlocked).
- `SwitchMode($ID_HARD_MODE)` — most farms are HM. Some run NM (`Asuran`).
- Player setup (build, profession check). Bail on `$FAIL`.
- Team setup (heroes, hero builds). Bail on `$FAIL`.
- Optional pre-warm: enter the explorable and walk to the start point (so the next call to `<Name>FarmLoop` doesn't repeat that work).
- Set `$<lower>_farm_setup = True` on success.

### 3. Player setup: `Setup<Name>Player()`

```autoit
Func SetupPlayerMantidsFarm()
    Info('Setting up player build skill bar')
    If DllStructGetData(GetMyAgent(), 'Primary') == $ID_RANGER Then
        LoadSkillTemplate($RA_MANTIDS_FARMER_SKILLBAR)
        RandomSleep(250)
    Else
        Warn('Should run this farm as ranger')
        Return $FAIL
    EndIf
    Return $SUCCESS
EndFunc
```

Profession gate first, then `LoadSkillTemplate`. Always `RandomSleep(250)` after — the game needs a tick to apply skills.

For multi-profession farms (Vaettirs supports A/Me/Mo/E), use a `Switch` and store the chosen profession in a global so the combat phase can branch on it.

### 4. Team setup: `Setup<Name>Team()`

```autoit
Func SetupTeamMantidsFarm()
    If IsTeamAutoSetup() Then Return $SUCCESS

    Info('Setting up team')
    LeaveParty()
    If AddHeroByProfession($ID_PARAGON, $ID_GENERAL_MORGAHN) == $FAIL Then Return $FAIL
    LoadSkillTemplate($MANTIDS_HERO_SKILLBAR, 1)
    RandomSleep(250)
    DisableAllHeroSkills(1)
    Return $SUCCESS
EndFunc
```

The pattern:

- `If IsTeamAutoSetup() Then Return $SUCCESS` — respects the GUI's "team setup is automatic" toggle. The hub will run `SetupTeamUsingGlobalSettings` instead.
- `LeaveParty()` — drop existing heroes/players.
- `AddHeroByProfession($prof, $preferredID)` per slot. Returns the assigned 1-based slot or 0 on failure. Use `AddRequiredHero($id)` if you specifically need that hero (no fallback).
- `LoadSkillTemplate($code, $heroIdx)` per hero. `RandomSleep(250)` after each.
- `DisableAllHeroSkills($heroIdx)` if your bot drives the hero via explicit `UseHeroSkill` calls — prevents the hero AI from blowing cooldowns prematurely.

### 5. Loop: `<Name>FarmLoop()`

```autoit
Func MantidsFarmLoop()
    If GetMapID() <> $ID_WAJJUN_BAZAAR Then Return $FAIL

    UseHeroSkill(1, $MANTIDS_VOCAL_WAS_SOGOLON)
    RandomSleep(1500)
    UseHeroSkill(1, $MANTIDS_INCOMING)
    AdlibRegister('MantidsUseFallBack', 8000)

    MoveTo(3150, -16350, 0, 0)
    ; ... pull, fight, loot ...

    If IsPlayerDead() Then Return $FAIL
    Info('Picking up loot')
    PickUpItems()
    FindAndOpenChests()
    Return $SUCCESS
EndFunc
```

Checks at the start: confirm we're on the right map (defensive — if `GoToWajjunBazaar` failed silently, bail).

End conditions:

- Player dead → `Return $FAIL`.
- Cleared, looted → `Return $SUCCESS`.
- Setup invalidated mid-run (rare) → `Return $PAUSE`.

`PickUpItems()` (`Utils-Storage.au3:1566`) reads the loot config JSON. Pass a `$defendFunc` if mobs can respawn or rubber-band into pickup range.

## Hub registration

Three places in `BotsHub.au3` that the farm has to touch:

1. **Include**: `BotsHub.au3:43-85` — alphabetical `#include 'src/farms/<Name>.au3'`.
2. **`$AVAILABLE_FARMS`** (`BotsHub.au3:97-99`) — the GUI dropdown. Pipe-separated string. Alphabetical.
3. **`FillFarmMap()`** (`BotsHub.au3:501`) — the `AddFarmToFarmMap('<DisplayName>', <FarmFunc>, <invSpaceNeeded>, <durationConst>)` line. Tab-aligned columns.

Optional fourth: `ResetBotsSetups()` (`BotsHub.au3:554`) — add `$<lower>_farm_setup = False` if your bot ports back to a city between runs (most do). Skip if you stay in the same instance (CoF, FoW, UW, gemstones).

See `botshub-registration.md` for the diff-by-diff recipe.

## Loot config

`conf/farm/Default Farm Configuration.json` is the per-character defaults: hero list, build toggles, district preferences, hard-mode toggle. Most farms read these via `$run_options_cache[...]` and don't need a per-farm JSON.

If the farm needs custom loot rules (drop everything vs. only specific items), copy `conf/loot/Default Loot Configuration.json` to `conf/loot/<Name>.json` and select it from the GUI.

## Return semantics — full table

| Return | Meaning | Behavior |
|--------|---------|----------|
| `$SUCCESS = 0` | Run completed | Loop again if `loop_mode` enabled |
| `$FAIL = 1` | Run failed (died, stuck, dead-locked) | Loop again immediately — counts as a failure for stats |
| `$PAUSE = 2` | Don't continue | `BotHubLoop` switches to `WILL_PAUSE` and stops |

`BotsHub.au3:228` shows the dispatch:

```autoit
Local $result = RunFarmLoop()
If ($result == $PAUSE Or $run_options_cache['run.loop_mode'] == False) Then $runtime_status = 'WILL_PAUSE'
```

## Mid-run inventory management

`BotsHub.au3:254-263` runs `InventoryManagementMidRun()` *before* each run if `farm_materials_mid_run` is on. If inventory still has fewer than `$inventorySpaceNeeded` slots free after, the bot pauses.

Bots that depend on this set their `inventorySpaceNeeded` value at registration (`AddFarmToFarmMap`, third arg). `5` is typical; loot-heavy farms (FoW, Voltaic, Kurzicks) use `10`–`15`.

## Global farm setup

`BotsHub.au3:272` runs `GeneralFarmSetup()` once per session — applies the GUI weapon-slot setting, runs auto team setup if enabled, applies player build overrides. Sets `$global_farm_setup = True`. `ResetBotsSetups` toggles it back when the hub ports between cities.

If your farm needs the global setup to re-run mid-loop, set `$global_farm_setup = False` directly.

## Putting it together

```
Main()                                  BotsHub.au3:152
└─ BotHubLoop()                         :216
   └─ RunFarmLoop()                     :246
      ├─ InventoryManagementMidRun       (if enabled)
      ├─ InventoryManagementBeforeRun    (if low slots)
      ├─ GeneralFarmSetup                (once per session)
      └─ <Name>Farm()                   src/farms/<Name>.au3
         ├─ Setup<Name>Farm()             (once per port)
         │  ├─ TravelToOutpost
         │  ├─ SwitchMode
         │  ├─ Setup<Name>Player          (build, profession check)
         │  └─ Setup<Name>Team            (heroes, hero builds)
         ├─ <Name>FarmLoop()              (the actual run)
         │  ├─ aggro
         │  ├─ fight
         │  └─ PickUpItems / FindAndOpenChests
         └─ ResignAndReturnToOutpost
```
