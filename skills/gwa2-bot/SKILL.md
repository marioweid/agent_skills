---
name: gwa2-bot
description: Use for AutoIt .au3 Guild Wars 1 bot work, especially under ~/Sources/BotsHub. Covers GWA2/BotsHub farm authoring, route/build/skill-rotation implementation, debugging, API usage, farm registration, and AutoIt house style.
license: MIT
metadata:
  author: mario.weidner@gmx.de
  version: "1.0.0"
  domain: automation
  triggers: .au3, AutoIt, ~/Sources/BotsHub, BotsHub, GWA2, gwa2, Guild Wars bot, AutoIt bot, farm bot, UseSkillEx, GetMyAgent, AddFarmToFarmMap, MoveAvoidingBodyBlock, LoadSkillTemplate, agent struct, skill template, AdlibRegister, DllStructGetData, Mantids, Raptors, Vaettirs, Corsairs, ResignAndReturnToOutpost, WaitMapLoading
  role: specialist
  scope: implementation
  output-format: code
  related-skills: systematic-debugging, python-pro
---

# GWA2 Bot Specialist

Collaborative authoring assistant for Guild Wars 1 bots built on the GWA2 AutoIt library and the BotsHub harness at `~/Sources/BotsHub`. The skill does **not** know what mobs live where, how to farm Skales, or which skill rotation works — the user does. The skill knows the GWA2 API, the BotsHub conventions, and the AutoIt quirks, and translates the user's gameplay description into working code.

## When to Use This Skill

**Auto-trigger on any AutoIt work.** Reading, editing, reviewing, or discussing any `.au3` file — especially anywhere under `~/Sources/BotsHub` — should activate this skill, even before the user explicitly mentions GWA2 or BotsHub. AutoIt syntax + the project's house style are non-obvious; defaulting to this skill avoids re-deriving them every time.

Specific scenarios:

- **Any `.au3` file in `~/Sources/BotsHub`** — apply house style (single quotes, tabs, `Opt('MustDeclareVars', True)`, no inline comments, `While/WEnd` over `Do/Until`) by default. See `references/autoit-quirks.md`.
- **Collaborative authoring** — user describes the route/build/rotation; skill scaffolds matching code, asks clarifying questions, iterates.
- **Modifying an existing farm** — "my Mantids run dies before the spike, I want it to wait for Shadow Form to recharge first" → diff against the live file.
- **Debugging** a bot that hangs, deadlocks, dies repeatedly, fails to recharge, rubber-bands.
- **Explaining** a GWA2 / Utils function: signature, behavior, real call sites.
- **Porting** an aggro/movement/skill rotation pattern between farms.
- **Reviewing** a farm pre-commit (sleep cadence, return contract, deadlock recovery, AdlibRegister hygiene).
- **Diagnosing** init/memory-scan failures (`InitializeGameClientForGWA2`).

## What the user provides vs. what the skill provides

| User provides (gameplay knowledge) | Skill provides (code knowledge) |
|------------------------------------|---------------------------------|
| Outpost name + map ID, target explorable | Looks up `$ID_*` constant, wraps in `TravelToOutpost` + `WaitMapLoading` |
| "I run as Ranger with this build code" | Profession gate + `LoadSkillTemplate` boilerplate |
| Hero composition + their build codes | `AddHeroByProfession` calls + per-hero `LoadSkillTemplate` |
| Aggro path: "pull from these 3 spots, ball at coord X,Y" | `GetNearestNPCInRangeOfCoords` + `AggroAgent` + `MoveTo` + `FindMiddleOfFoes` |
| Skill rotation: "buff first, then aggro, spike with skill 7" | `UseSkillEx` ordering, `AdlibRegister` for periodic skills, `IsRecharged` gates |
| Survival logic: "if HP drops below 50%, cast skill 6" | Snapshot pattern + `DllStructGetData($me, 'HealthPercent')` checks |
| "It dies / hangs / takes too long" | Decision tree from `references/debugging-playbook.md` |

## Core Workflow

### Workflow A — Author a new farm collaboratively

This is iterative, not one-shot. Don't invent gameplay details — ask the user.

1. **Gather gameplay context.** Ask the user for whatever's missing. Don't proceed past unknowns.
   - Outpost name + target explorable. (User says "Beetletun → Nebo Terrace"; you grep `lib/GWA2_ID_Maps.au3` for the IDs.)
   - Required profession + secondary, if any.
   - Player build template (encoded base64 from in-game "Save Build") or a list of skills in slot order.
   - Hero composition: count, professions, named heroes, hero build templates.
   - The route: aggro points, ball spot, escape route. User can describe in prose ("pull from the bridge, ball at the lamp post") or paste coordinates.
   - The skill rotation: opening buffs, mid-fight maintenance, spike trigger, defensive skills.
   - Survival rules: when to disengage, what HP triggers a heal, max malus handling.
   - Expected run duration in seconds. Loot expectations (drives the inventory-space arg).
2. **Read** `references/bot-lifecycle.md` and `references/botshub-registration.md` to confirm shape, plus `references/api-surface.md` for any helper the user mentions.
3. **Propose a draft.** Start from `scripts/new-bot.md`. Fill in what the user gave. **Stub the rest** — leave `; [FILL: aggro spots — user, give me coords]` markers rather than guessing. Show the draft and ask which sections to expand.
4. **Iterate** with the user. They review the draft, point at sections that don't match the actual route, and you patch them. Each iteration narrows the `[FILL]` markers.
5. **Plumb it in.** Once the farm runs end-to-end on paper, apply the three (or four) `BotsHub.au3` patches: `#include`, `$AVAILABLE_FARMS`, `FillFarmMap()`, plus `ResetBotsSetups()` if it ports between cities.
6. **Verify return contract.** Every function path exits with `$SUCCESS` / `$FAIL` / `$PAUSE`. Snapshot pattern in tight loops. `WaitMapLoading` after every transition.
7. **Final config.** Copy `conf/farm/Default Farm Configuration.json` and/or `conf/loot/Default Loot Configuration.json` only if the user needs different defaults.

### Workflow B — Modify an existing farm

The user says "my X bot does Y but I want it to do Z." This is a diff, not a rewrite.

1. **Read** the existing farm in `~/Sources/BotsHub/src/farms/<Name>.au3`.
2. **Locate** the function that owns the behavior the user wants to change. Quote the current code with file:line.
3. **Confirm the desired behavior** in plain English back to the user before writing code. ("So the spike should fire only after Shadow Form is recharged, not on every loop iteration — correct?")
4. **Show a focused diff** — only the lines that change, with surrounding context. Cite the relevant reference (e.g. `references/combat-and-skills.md` § AdlibRegister fire-until-cooldown).
5. **Flag side effects** — e.g. if the change breaks `ResetBotsSetups` assumptions, the inventory-space arg, or a hero's skill slot.

### Workflow C — Debug a broken farm

1. **Reproduce** — get the log lines, the failing function, the map at failure time. Ask the user for these if they didn't include them.
2. **Triage** with `references/debugging-playbook.md` decision tree: init failure → memory scan; hang in town → `WaitMapLoading` deadlock arg + map-ID guard; mid-run hang → `AdlibRegister` cleanup + `IsRecharged` slot mismatch; recharge stalls → wrong slot constant or ping spike; rubber-band → `IsPlayerRubberBanding` / `CheckAndSendStuckCommand` (rate-limited, ban risk if overused); death loop → max-malus reset.
3. **Inspect agent state** — snapshot once with `Local $me = GetMyAgent()`, then read fields with `DllStructGetData($me, 'X')`. Never re-deref `GetMyAgent()` inside tight loops.
4. **Audit sleep cadence** — `Sleep(t)` for hard waits, `Sleep(t + GetPing())` for packet-sensitive ops (salvage, trade), `RandomSleep` everywhere else.
5. **Verify return contract** — bots returning anything other than `$SUCCESS`/`$FAIL`/`$PAUSE` silently misbehave in `BotHubLoop`.

### Workflow D — Explain a GWA2 / Utils function

1. **Locate** in `lib/GWA2.au3`, `lib/Utils.au3`, `lib/Utils-Agents.au3`, or `lib/Utils-Storage.au3` using `references/api-surface.md` as the index.
2. **Quote** the function signature plus the `;~` doc line above the `Func`.
3. **Show** one real call site from Mantids/Raptors/Vaettirs with surrounding context.
4. **Note** timing/recharge rules from `references/combat-and-skills.md` if it touches skills, snapshot rules from `references/agent-struct.md` if it touches agents.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| API surface index | `references/api-surface.md` | Looking up any GWA2/Utils function by category |
| Bot lifecycle | `references/bot-lifecycle.md` | Writing a new bot; understanding setup → loop → return contract |
| BotsHub registration | `references/botshub-registration.md` | Plumbing a farm into the hub (`$AVAILABLE_FARMS`, `FillFarmMap`, `ResetBotsSetups`, conf JSON) |
| Combat / skills | `references/combat-and-skills.md` | Skill bars, recharge logic, hero skills, AdlibRegister patterns, cast-time modifiers |
| Movement / targeting | `references/movement-and-targeting.md` | `MoveTo`, `MoveAvoidingBodyBlock`, aggro, foe finding, range constants |
| Agent struct | `references/agent-struct.md` | Reading `$AGENT_STRUCT_TEMPLATE` fields, snapshot pattern, agent helpers |
| AutoIt quirks | `references/autoit-quirks.md` | 32-bit, RequireAdmin, DllCall safety, AdlibRegister hygiene, MustDeclareVars, sleep cadence |
| Debugging playbook | `references/debugging-playbook.md` | Bot exits/hangs/dies/desyncs/rubber-bands |
| ID constants | `references/id-constants.md` | Map IDs, profession IDs, hero IDs, allegiance, ranges, agent types |

Scaffolding template: `scripts/new-bot.md`.

## Common Patterns

### Farm entry contract

```autoit
Func MantidsFarm()
    If Not $mantids_farm_setup And SetupMantidsFarm() == $FAIL Then Return $PAUSE

    GoToWajjunBazaar()
    Local $result = MantidsFarmLoop()
    ResignAndReturnToOutpost($ID_NAHPUI_QUARTER)
    Return $result
EndFunc
```

### Profession gate in setup

```autoit
If DllStructGetData(GetMyAgent(), 'Primary') == $ID_RANGER Then
    LoadSkillTemplate($RA_MANTIDS_FARMER_SKILLBAR)
    RandomSleep(250)
Else
    Warn('Should run this farm as ranger')
    Return $FAIL
EndIf
```

### Skill-slot constants

```autoit
Global Const $MANTIDS_SHADOWFORM            = 2
Global Const $MANTIDS_LIGHTNING_REFLEXES    = 4
Global Const $MANTIDS_DEATHS_CHARGE         = 6

UseSkillEx($MANTIDS_SHADOWFORM)
```

### AdlibRegister fire-once

```autoit
Func MantidsUseFallBack()
    UseHeroSkill(1, $MANTIDS_FALLBACK)
    AdlibUnRegister('MantidsUseFallBack')
EndFunc

AdlibRegister('MantidsUseFallBack', 8000)
```

### AdlibRegister fire-until-cooldown

```autoit
Func MantidsUseWhirlingDefense()
    While IsRecharged($MANTIDS_WHIRLING_DEFENSE) And IsPlayerAlive()
        UseSkillEx($MANTIDS_WHIRLING_DEFENSE)
        RandomSleep(50)
    WEnd
    AdlibUnRegister('MantidsUseWhirlingDefense')
EndFunc
```

### Agent snapshot

```autoit
Local $me = GetMyAgent()
Local $foesCount = CountFoesInRangeOfAgent($me, $RANGE_NEARBY)
While IsPlayerAlive() And $foesCount > 0
    RandomSleep(1000)
    $me = GetMyAgent()
    $foesCount = CountFoesInRangeOfAgent($me, $RANGE_NEARBY)
WEnd
```

### BotsHub registration block

```autoit
; BotsHub.au3 line ~60: include
#include 'src/farms/Skales.au3'

; BotsHub.au3 line 97: GUI dropdown (alphabetical)
'Raptors|Skales|SoO|...'

; BotsHub.au3 line 501: farm map
AddFarmToFarmMap( 'Skales', SkalesFarm, 5, $SKALES_FARM_DURATION)

; BotsHub.au3 line 554: only if porting between cities
$skales_farm_setup = False
```

## Constraints

### MUST DO

- **Ask the user for gameplay details** the skill cannot know: aggro coordinates, mob locations, skill rotation order, build template strings, hero composition, survival thresholds. Never invent these.
- **Stub unknowns** with `; [FILL: ...]` markers in the draft and explicitly call them out so the user can fill them in.
- **Confirm intent in plain English** before writing a non-trivial change — paraphrase what the user wants and wait for confirmation.
- Compile and run AutoIt in **32-bit (x86)** — `BotsHub.au3:158` exits otherwise.
- Include `#RequireAdmin` and `Opt('MustDeclareVars', True)` on every farm file.
- Use `../../lib/` relative paths in farm-file `#include` lines (matches every existing farm).
- Snapshot agents once per iteration: `Local $me = GetMyAgent()` then `DllStructGetData($me, ...)`.
- Use `Safe*` wrappers from `lib/GWA2_Assembly.au3` for memory ops, never raw `DllCall` against game memory.
- Return only `$SUCCESS` / `$FAIL` / `$PAUSE` from any farm-level function.
- Pair every `AdlibRegister` with `AdlibUnRegister` — inside the callback for fire-once, at the loop exit for fire-until.
- Use `RandomSleep` by default; `Sleep(t + GetPing())` for packet-sensitive ops (salvage, trade); `Sleep(t)` only for precise waits.
- Register a new farm in **all** required places: `#include`, `$AVAILABLE_FARMS`, `FillFarmMap()`, plus `ResetBotsSetups()` if it ports between cities.
- Guard map transitions with `WaitMapLoading($expectedID, deadlockMs, waitMs)` then `If GetMapID() <> $expectedID Then Return $FAIL`.
- Single quotes, tabs (not spaces), no inline comments — `BotsHub/doc/BotsHub AutoIt clean code guidelines.md`.

### MUST NOT DO

- **Invent gameplay details** the user didn't supply: don't guess aggro coordinates, don't fabricate skill rotations, don't pick build templates from thin air. The skill knows the GWA2 API; the user knows the game.
- **Generate a complete farm from a one-line prompt.** "Add a Skales farm" is not enough — ask for route, build, rotation, heroes first.
- **Modify any file under `~/Sources/BotsHub/lib/`.** That tree (`GWA2.au3`, `GWA2_Assembly.au3`, `GWA2_ID*.au3`, `GWA2_Headers.au3`, `Utils.au3`, `Utils-Agents.au3`, `Utils-Storage.au3`, `Utils-Debugger.au3`, `Utils-Items_Modstructs.au3`, `BotsHub-GUI.au3`, `JSON.au3`, `SQLite*.au3`, `Build_*.au3`) is the **community-shared standard** — it's pulled from upstream via git and other people contribute commits to it. Editing those files locally creates merge conflicts on every upstream pull. **If a library function needs different behavior for a specific farm, reimplement a customized copy inside the farm file with a unique name** — e.g. copy `MoveTo` into `Skales.au3` as `SkalesMoveTo` and modify there. All bot logic lives in `src/farms/<Name>.au3`. The only library-tree file that's edited routinely is `BotsHub.au3` itself (registration: include, `$AVAILABLE_FARMS`, `FillFarmMap`, `ResetBotsSetups`).
- `Sleep(0)` or busy-loop on memory reads — use `TimerInit`/`TimerDiff` or `WaitMapLoading`'s deadlock arg.
- Hardcode skill slots in `UseSkillEx` calls — declare `Global Const $<FARM>_<SKILL_NAME> = N` first.
- Use `Do/Until` — house style requires `While/WEnd`.
- Assume `GetMyAgent()` returns a populated agent on a freshly loaded map — `WaitMapLoading` already guards this; reach for `GetAgentExists(GetMyID())` if you see null-deref errors right after a transition.
- Leave `AdlibRegister` callbacks active across loop iterations.
- Mix tabs and spaces in `FillFarmMap()` column alignment — tabs only.
- Spam `/stuck` — `CheckAndSendStuckCommand` is rate-limited to once per 10s by design; reducing the interval risks a ban.
- Add a farm to `FillFarmMap` without also adding it to `$AVAILABLE_FARMS` — the GUI dropdown reads the latter.
- Re-declare globals like `$default_move_defend_options` — clone with `CloneDictMap` (Vaettirs pattern) before mutating.

## Output Templates

### When authoring a new farm (Workflow A)

The first response is **not** a complete farm file. It's a clarifying-questions list plus a stubbed scaffold. Iterate from there.

1. **Question list** for whatever wasn't supplied: route coordinates, build template, hero composition, skill rotation, survival rules. Group questions so the user can answer in one pass.
2. **Stubbed `<Name>.au3` scaffold** with the parts you do know filled in (header, includes, constants block, function shells) and `; [FILL: ...]` markers everywhere the user's input is needed.
3. **Open questions** highlighted at the top of the response so the user knows what to answer next.

Once the user has filled in enough detail, deliver:

1. The completed `.au3` file under `src/farms/<Name>.au3`.
2. The 1-line patch to `$AVAILABLE_FARMS` (alphabetical insert).
3. The 1-line patch to `FillFarmMap()` with display name, function, inventory space, duration constant.
4. The 1-line `#include` patch (alphabetical, in the `src/farms/` block).
5. Optional `$<lower>_farm_setup = False` line in `ResetBotsSetups()` — only if the bot ports between cities.
6. Notes on any new `conf/farm/*.json` or `conf/loot/*.json` files the user needs to create.

### When modifying an existing farm (Workflow B)

1. Quote of the current code at file:line.
2. Plain-English paraphrase of the requested change, awaiting user confirmation.
3. Focused diff — only the lines that change, with surrounding context.
4. Side-effect notes (e.g. `ResetBotsSetups`, inventory-space arg, hero slot indices).

### When debugging (Workflow C)

1. The diagnosis (which decision-tree branch fits the symptom).
2. The minimal reproducer or the suspect lines with file:line references.
3. The fix — exact diff or replacement function — citing the relevant reference file.

### When explaining (Workflow D)

1. Function signature with `;~` doc line.
2. One real call site from Mantids/Raptors/Vaettirs.
3. Timing/recharge/snapshot rules if relevant.

## Knowledge Reference

GWA2 AutoIt library (caustic-kronos / Gahais), BotsHub harness, AutoIt 3.3.16+ (32-bit only), Guild Wars memory layout, `$AGENT_STRUCT_TEMPLATE` (62 fields), `$SKILLBAR_STRUCT_TEMPLATE`, `$EFFECT_STRUCT_TEMPLATE`, `$BUFF_STRUCT_TEMPLATE`, DllStruct/DllCall, `AdlibRegister`/`AdlibUnRegister`, `RandomSleep`/`GetPing`, profession IDs, hero IDs (Norgu through Mercenary 8), map IDs (`GWA2_ID_Maps.au3`), allegiance IDs, agent types (NPC 0xDB / STATIC 0x200 / ITEM 0x400), TypeMap bitfields, `LoadSkillTemplate` encoded build strings, hard mode / normal mode, `CommandHero`/`CommandAll` flagging, `MoveTo`/`MoveAvoidingBodyBlock`, `WaitMapLoading` deadlock guard, `ResignAndReturnToOutpost`, `PickUpItems` defend callbacks, conf/farm and conf/loot JSON, `BotsHub.au3` registration plumbing.
