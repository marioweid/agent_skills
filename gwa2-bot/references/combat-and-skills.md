# Combat and Skills

How to fire skills with correct timing, manage hero skills, and structure a kill phase.

## Skill slots, not skill IDs

Skills bind to slots 1–8 on the skill bar. The bot calls into the *slot*, not the skill ID. Map slot → skill name with named constants:

```autoit
Global Const $MANTIDS_SERPENTS_QUICKNESS = 1
Global Const $MANTIDS_SHADOWFORM         = 2
Global Const $MANTIDS_SHROUD_OF_DISTRESS = 3
Global Const $MANTIDS_LIGHTNING_REFLEXES = 4
Global Const $MANTIDS_WAY_OF_PERFECTION  = 5
Global Const $MANTIDS_DEATHS_CHARGE      = 6
Global Const $MANTIDS_WHIRLING_DEFENSE   = 7
Global Const $MANTIDS_EDGE_OF_EXTINCTION = 8

UseSkillEx($MANTIDS_SHADOWFORM)
```

The mapping is fixed by the build template. `LoadSkillTemplate($base64)` (`GWA2.au3:2424`) writes the slots in the order the template declares them. If you change the template, change the constants.

## The four UseSkill flavors

| Function | What it does | When to use |
|----------|--------------|-------------|
| `UseSkill($slot, $target, $callTarget)` | Fire-and-forget packet send. Returns immediately. | `GWA2.au3:200`. Building blocks for the others. Rarely called directly. |
| `UseSkillEx($slot, $target = Null)` | Fires + waits for cast/recharge based on the skill's own metadata. Cheaper than `UseSkillTimed` (no effects modifier math). | `Utils.au3:829`. **Default.** Used in every farm's main loop. |
| `UseSkillExNew($slot, $target, $timeout = 5000)` | Like `UseSkillEx` but uses `IsCasting` polling — works for skills with weird recast behavior at the cost of more memory reads. | `Utils.au3:811`. Fallback when `UseSkillEx` returns prematurely. |
| `UseSkillTimed($slot, $target)` | Computes full cast time including consumable/effect modifiers (Pie, EoC, Mindbender, Glyph of Sacrifice, Daze, Migraine, etc.). | `Utils.au3:893`. Use when precise timing matters — back-to-back casts with no margin. |

All four return `False` if the player is dead, the skill isn't recharged, or there isn't enough energy. `UseSkillEx` and `UseSkillTimed` block until done; `UseSkill` is async.

## Energy and recharge gating

`UseSkillEx` already checks energy and recharge:

```autoit
If IsPlayerDead() Or Not IsRecharged($skillSlot) Then Return False
...
If GetEnergy() < $energy Then Return False
```

So you don't need to pre-check. But for a *spam* loop that should retry until ready:

```autoit
While Not IsRecharged($MANTIDS_SHADOWFORM)
    RandomSleep(500)
WEnd
UseSkillEx($MANTIDS_SHADOWFORM)
```

For a *sustained* attack with a particular skill on cooldown:

```autoit
$target = GetNearestEnemyToCoords(-450, -14400)
While IsRecharged($MANTIDS_DEATHS_CHARGE) And IsPlayerAlive()
    UseSkillEx($MANTIDS_DEATHS_CHARGE, $target)
    RandomSleep(200)
WEnd
```

`Mantids.au3:192-195` — note `IsRecharged` is true while available, so the loop fires repeatedly until the skill goes on cooldown.

## Adrenaline

`GetSkillbarSkillAdrenaline($slot, $heroIdx = 0)` returns adrenaline charge as a 0–N integer (10 = single strike, increments per hit). Adrenaline-gated skills (Whirlwind, Eviscerate, etc.) need:

```autoit
While GetSkillbarSkillAdrenaline($SKILL_WHIRLWIND) < 130
    AttackOrUseSkill(500, $SKILL_AUTO_ATTACK)
WEnd
UseSkillEx($SKILL_WHIRLWIND)
```

130 here is from the Raptors farm — adrenaline thresholds are skill-specific.

## Auto-attack

`Attack($agent, $callTarget = False)` (`GWA2.au3:193`) sends an auto-attack command. Doesn't wait. To weave skills with auto-attacks:

```autoit
AttackOrUseSkill($attackSleep, $skill1, $skill2, ..., $skill8)
```

(`Utils.au3:734`) — starts auto-attack against the nearest enemy, then iterates through the provided skill slots and fires the *first* one that's recharged. If none are ready, sleeps `$attackSleep` ms.

Used inside `KillFoesInArea` (`Utils.au3:1204`) for build-agnostic combat phases.

## Cast time and effect modifiers

`UseSkillTimed` calls `GetCastTimeModifier($effects, $skill)` (`Utils.au3:766`) which knows about:

- **Speed-up consumables**: Essence of Celerity (×0.80), Pie-Induced Ecstasy (×0.85), Red/Blue/Green Rock Candy.
- **Speed-up skills**: Deadly Paradox + Shadow Form (×0.667), Glyph of Sacrifice/Essence + Signet of Mystic Speed (cast time → 0), Mindbender (×0.80), Time Ward / Over the Limit (attribute-scaled).
- **Slow-down hexes**: Arcane Conundrum, Migraine, Stolen Speed, Shared Burden, Frustration, Confusing Images (×2), Sum of All Fears (×1.5).
- **Slow-down conditions**: Daze (×2).

The full table lives at `Utils.au3:766-807`. If you're writing a build that uses any of these, prefer `UseSkillTimed` over `UseSkillEx` so back-to-back casts don't desync.

## Hero skills

```autoit
UseHeroSkill($heroIdx, $slot, $target = Null)         ; GWA2.au3:213, fire-and-forget
UseHeroSkillEx($heroIdx, $slot, $target)              ; Utils.au3:923, blocking, no modifiers
UseHeroSkillTimed($heroIdx, $slot, $target)           ; Utils.au3:947, blocking, full modifiers
AllHeroesUseSkill($slot, $target = 0)                 ; Utils.au3:757, all alive heroes fire same slot
```

`$heroIdx` is 1–7 (party slot, not hero ID). Hero 0 is the player.

Disable hero skills (e.g. to prevent them from blowing cooldowns during travel):

```autoit
DisableAllHeroSkills($heroIdx)               ; Utils.au3:1597
DisableHeroSkillSlot($heroIdx, $slot)        ; Utils.au3:1607
EnableHeroSkillSlot($heroIdx, $slot)         ; Utils.au3:1613
```

Mantids disables all hero skills after setup so the bot can fire them in a precise sequence (`Mantids.au3:118`).

## Adlib-driven hero loops

Some skills want to fire as soon as they recharge, while the main thread handles aggro/movement. Use `AdlibRegister`:

```autoit
;~ Paragon Hero uses Fallback once
Func MantidsUseFallBack()
    UseHeroSkill(1, $MANTIDS_FALLBACK)
    AdlibUnRegister('MantidsUseFallBack')
EndFunc

;~ Player spams Whirling Defense until cooldown locks it out
Func MantidsUseWhirlingDefense()
    While IsRecharged($MANTIDS_WHIRLING_DEFENSE) And IsPlayerAlive()
        UseSkillEx($MANTIDS_WHIRLING_DEFENSE)
        RandomSleep(50)
    WEnd
    AdlibUnRegister('MantidsUseWhirlingDefense')
EndFunc

; from MantidsFarmLoop:
AdlibRegister('MantidsUseFallBack', 8000)
...
AdlibRegister('MantidsUseWhirlingDefense', 500)
```

Rules:

- The interval is in ms. Fire-once callbacks should self-unregister at the bottom.
- Fire-until callbacks should self-unregister inside the same exit condition that ends the loop.
- Don't pick an interval shorter than your skill's cast time.

## Buff and effect inspection

```autoit
GetEffect($skillID = 0, $heroIdx = 0)    ; specific effect, or array if $skillID == 0
GetEffectTimeRemaining($effect)          ; ms
GetBuffCount($heroIdx)                   ; how many enchantments you're maintaining
GetBuffByIndex($idx, $heroIdx)
GetIsTargetBuffed($skillID, $agent, $heroIdx)   ; you maintaining $skill on $agent?
DropBuff($skillID, $agent, $heroIdx)     ; stop maintaining
```

State predicates on agents (`Utils-Agents.au3:759-808`):

```autoit
GetIsBleeding($a)  GetIsPoisoned($a)  GetHasCondition($a)
GetHasDeepWound($a)  GetIsEnchanted($a)  GetHasHex($a)
GetHasDegenHex($a)  GetIsKnocked($a)  GetIsCasting($a)
```

## Skill build templates

`LoadSkillTemplate($base64Code, $heroIdx = 0)` (`GWA2.au3:2424`) imports a build from the in-game encoded string. Get a code from the in-game UI's "Save Build", or copy from another farm:

```autoit
Global Const $RA_MANTIDS_FARMER_SKILLBAR = 'OgcTYxr+5B5ozOgFHCIuT4AdAA'
Global Const $MANTIDS_HERO_SKILLBAR      = 'OQijEqmMKODbe8OmEbi7x3YWMA'

LoadSkillTemplate($RA_MANTIDS_FARMER_SKILLBAR)         ; player
LoadSkillTemplate($MANTIDS_HERO_SKILLBAR, 1)           ; hero in slot 1
```

Multi-profession farms gate the load on `Primary`:

```autoit
Switch DllStructGetData(GetMyAgent(), 'Primary')
    Case $ID_ASSASSIN
        LoadSkillTemplate($AME_VAETTIRS_FARMER_SKILLBAR)
    Case $ID_MESMER
        LoadSkillTemplate($MEA_VAETTIRS_FARMER_SKILLBAR)
    Case $ID_MONK
        LoadSkillTemplate($MOA_VAETTIRS_FARMER_SKILLBAR)
    Case $ID_ELEMENTALIST
        LoadSkillTemplate($EME_VAETTIRS_FARMER_SKILLBAR)
    Case Else
        Warn('You need to run this farm bot as Assassin or Mesmer or Monk or Elementalist')
        Return $FAIL
EndSwitch
```

(`Vaettirs.au3:126-142`.)

## Kill-phase patterns

Three common shapes:

### 1. Spam-until-recharge then advance

```autoit
While Not IsRecharged($BIG_AOE)
    AttackOrUseSkill(500, $FILLER_1, $FILLER_2)
WEnd
UseSkillEx($BIG_AOE)
```

### 2. Kill-until-clear

```autoit
Local $me = GetMyAgent()
Local $foesCount = CountFoesInRangeOfAgent($me, $RANGE_NEARBY)
Local $counter = 0
While IsPlayerAlive() And $foesCount > 0 And $counter < 3
    RandomSleep(1000)
    $counter += 1
    $me = GetMyAgent()
    $foesCount = CountFoesInRangeOfAgent($me, $RANGE_NEARBY)
WEnd
```

(`Mantids.au3:208-216`.) The `$counter < 3` is a 3-second timeout — protects against single foes that walk out of range.

### 3. Generic kill driver

`KillFoesInArea($options)` (`Utils.au3:1204`) iterates skill slots 1–8 and fires whichever is ready against the highest-priority foe. Driven by:

```autoit
$default_move_aggro_kill_options.Add('combatFunction', UseSkillSequentially)
$default_move_aggro_kill_options.Add('fightDuration', 60000)
$default_move_aggro_kill_options.Add('fightRange', $RANGE_EARSHOT * 1.5)
$default_move_aggro_kill_options.Add('callTarget', True)
```

`UseSkillSequentially($target, $options)` (`Utils.au3:1248`) walks the bar in order and fires the first recharged skill. Use for build-agnostic farms (OmniFarmer); skip for tightly-tuned ones (Mantids/Vaettirs/Raptors).

`MoveAggroAndKill($X, $Y, $log, $options)` (`Utils.au3:1084`) wraps the full sequence: travel → aggro → fight → loot. The vanquish bots use this heavily.

## Cancelling

```autoit
CancelAction()           ; GWA2.au3:231 — abort current cast/attack
SuppressAction($which)   ; GWA2.au3:255 — block specific actions

DropBuff($skillID, $agent, $heroIdx)   ; stop maintaining an enchantment
DropBundle()             ; drop held environment object
```

`CancelAction` is the escape hatch when a long cast needs to be aborted (e.g. target died mid-cast).
