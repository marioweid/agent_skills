# New Bot Template

Skeleton for a new farm. **The skill cannot fill this in alone** — the user must supply the gameplay specifics. Treat every `[FILL: ...]` marker as a required question to ask before writing the corresponding code.

## Questions to ask the user before scaffolding

Group these into one prompt so the user can answer in one pass:

**Map & travel**
- Outpost name (and explorable name if different)?
- Does the bot port back to the outpost between runs, or stay in the same instance?

**Build**
- Required primary profession? Secondary?
- Player build template (encoded base64 from "Save Build" in-game), or skills in slot order if no template yet.

**Team**
- Hero count (1–7)?
- Per hero: profession, named hero ID if specific, hero build template.
- Should heroes auto-cast (default) or be driven by explicit `UseHeroSkill` calls (then `DisableAllHeroSkills`)?

**Route**
- Aggro waypoints — coordinates or descriptive ("pull the patrol from the bridge").
- Ball/spike location.
- Loot/return route.

**Combat**
- Opening sequence (buffs, hero skill calls).
- Mid-fight maintenance (which skills on cooldown spam, which fire on threshold).
- Spike trigger (adrenaline level, recharge state, foe-count threshold).
- Disengage rule (HP threshold, malus rule).

**Run shape**
- Expected duration in seconds.
- Inventory space needed: 5 (light), 10 (heavy looter), 15 (all-day).
- Hard mode or normal mode?

Replace `<Name>` / `<NAME>` / `<lower>` / `<DisplayName>` consistently, fill in the `[FILL: ...]` markers from the answers, then apply the `BotsHub.au3` patches at the bottom.

## File: `src/farms/<Name>.au3`

```autoit
#CS ===========================================================================
; <Name>Farm — [FILL: one-line description]
; Author: [FILL]
; Licensed under Apache License 2.0
#CE ===========================================================================

#include-once
#RequireAdmin
#NoTrayIcon

#include '../../lib/GWA2.au3'
#include '../../lib/GWA2_ID.au3'
#include '../../lib/Utils.au3'

Opt('MustDeclareVars', True)

; ==== Constants ====
Global Const $<UPPER>_PLAYER_SKILLBAR = '[FILL: encoded build template]'
Global Const $<UPPER>_HERO_SKILLBAR   = '[FILL: encoded hero template]'
Global Const $<UPPER>_FARM_DURATION   = [FILL: ms, e.g. 90 * 1000]

; Player skill slots
Global Const $<UPPER>_SKILL_1 = 1
Global Const $<UPPER>_SKILL_2 = 2
Global Const $<UPPER>_SKILL_3 = 3
Global Const $<UPPER>_SKILL_4 = 4
Global Const $<UPPER>_SKILL_5 = 5
Global Const $<UPPER>_SKILL_6 = 6
Global Const $<UPPER>_SKILL_7 = 7
Global Const $<UPPER>_SKILL_8 = 8

; Hero 1 skill slots (rename to actual skill names)
Global Const $<UPPER>_HERO_SKILL_1 = 1
Global Const $<UPPER>_HERO_SKILL_2 = 2

Global $<lower>_farm_setup = False


;~ Main entry point. Returns $SUCCESS / $FAIL / $PAUSE.
Func <Name>Farm()
    If Not $<lower>_farm_setup And Setup<Name>Farm() == $FAIL Then Return $PAUSE

    GoTo<TargetMap>()
    Local $result = <Name>FarmLoop()
    ResignAndReturnToOutpost($ID_<OUTPOST>)
    Return $result
EndFunc


;~ One-time setup: travel, build, team
Func Setup<Name>Farm()
    Info('Setting up farm')
    If TravelToOutpost($ID_<OUTPOST>, $district_name) == $FAIL Then Return $FAIL
    SwitchMode($ID_HARD_MODE)

    If Setup<Name>Player() == $FAIL Then Return $FAIL
    If Setup<Name>Team() == $FAIL Then Return $FAIL

    $<lower>_farm_setup = True
    Info('Preparations complete')
    Return $SUCCESS
EndFunc


;~ Player build + profession check
Func Setup<Name>Player()
    Info('Setting up player build skill bar')
    If DllStructGetData(GetMyAgent(), 'Primary') == $ID_<PROFESSION> Then
        LoadSkillTemplate($<UPPER>_PLAYER_SKILLBAR)
        RandomSleep(250)
    Else
        Warn('Should run this farm as <profession>')
        Return $FAIL
    EndIf
    Return $SUCCESS
EndFunc


;~ Heroes + hero builds
Func Setup<Name>Team()
    If IsTeamAutoSetup() Then Return $SUCCESS

    Info('Setting up team')
    LeaveParty()
    If AddHeroByProfession($ID_<HERO_PROFESSION>, $ID_<HERO_NAME>) == $FAIL Then Return $FAIL
    LoadSkillTemplate($<UPPER>_HERO_SKILLBAR, 1)
    RandomSleep(250)
    DisableAllHeroSkills(1)
    Return $SUCCESS
EndFunc


;~ Walk from outpost into the explorable zone
Func GoTo<TargetMap>()
    TravelToOutpost($ID_<OUTPOST>, $district_name)
    While GetMapID() <> $ID_<EXPLORABLE>
        Info('Moving to <TargetMap>')
        MoveTo([FILL: gate X], [FILL: gate Y])
        Move([FILL: cross-portal X], [FILL: cross-portal Y])
        RandomSleep(1000)
        WaitMapLoading($ID_<EXPLORABLE>, 10000, 2000)
    WEnd
EndFunc


;~ Per-loop combat, looting, return contract
Func <Name>FarmLoop()
    If GetMapID() <> $ID_<EXPLORABLE> Then Return $FAIL

    ; [FILL: aggro / fight / loot]
    ; Pattern reminders:
    ; - Snapshot once per iteration: Local $me = GetMyAgent()
    ; - Skill spam:  While IsRecharged($SLOT) And IsPlayerAlive() ... WEnd
    ; - Wait clear: While CountFoesInRangeOfAgent($me, $RANGE_NEARBY) > 0 ... WEnd

    If IsPlayerDead() Then Return $FAIL
    Info('Picking up loot')
    PickUpItems()
    Return $SUCCESS
EndFunc
```

## Patches to `BotsHub.au3`

Apply all three (or four, if your bot ports back to a city between runs).

### Patch 1: include the file (`BotsHub.au3:43-85`)

```diff
 #include 'src/farms/Raptors.au3'
+#include 'src/farms/<Name>.au3'
 #include 'src/farms/SpiritSlaves.au3'
```

### Patch 2: register the display name (`BotsHub.au3:97-99`)

Insert into `$AVAILABLE_FARMS` alphabetically — pipe-separated, spaces in the name are fine:

```diff
- 'Raptors|SoO|SpiritSlaves|...'
+ 'Raptors|<DisplayName>|SoO|SpiritSlaves|...'
```

### Patch 3: register the function (`BotsHub.au3:501`)

```diff
     AddFarmToFarmMap(   'Raptors',          RaptorsFarm,        5,      $RAPTORS_FARM_DURATION)
+    AddFarmToFarmMap(   '<DisplayName>',    <Name>Farm,         5,      $<UPPER>_FARM_DURATION)
     AddFarmToFarmMap(   'SoO',              SoOFarm,            15,     $SOO_FARM_DURATION)
```

Tabs only between columns. Pick `inventorySpace` based on expected loot:

| Inventory space | Use for |
|----------------:|---------|
| `5`  | Most single-zone farms (Mantids, Raptors, Vaettirs, Skales) |
| `10` | Heavy looters (Feathers, Voltaic, Kurzicks, the gemstone variants) |
| `15` | All-day stuff (FoW, SoO) |

### Patch 4: register the setup flag (`BotsHub.au3:554`) — *only if* the bot ports between cities between runs

```diff
     $raptors_farm_setup                     = False
+    $<lower>_farm_setup                     = False
     $soo_farm_setup                         = False
```

The variable name must match the `Global` declaration in your farm file exactly. Skip this patch entirely if your bot stays in the same instance every loop — see the commented block at `BotsHub.au3:573-587` for the canonical "stays put" list (CoF, Corsairs, FoW, the gemstone bots, UW, Voltaic, etc.).

## Optional: per-farm config

If the user needs different defaults than `Default Farm Configuration`, copy:

```
conf/farm/<DisplayName>.json    ; copy of Default Farm Configuration.json, edit hero list / district / hard mode toggle
conf/loot/<DisplayName>.json    ; copy of Default Loot Configuration.json, edit per-item picks
```

Both are selectable from the GUI dropdowns. Most new farms ship without these and reuse the defaults.

## Verification

After applying the patches:

1. Launch BotsHub. The display name appears in the farm dropdown.
2. Select it, press Start. No "This farm does not exist" error.
3. Run one full loop. Bot ends back in the outpost with `Run successful` in the log.
4. Run a *second* loop. Setup runs once if you're in the staying-put list, runs again if you ported between (Patch 4 working).
