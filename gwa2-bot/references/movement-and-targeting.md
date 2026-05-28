# Movement and Targeting

How to get the player to a coordinate, find foes, and aggro them. The reusable layer is in `Utils.au3`; raw packet sends live in `GWA2.au3`.

## Three flavors of "go there"

| Helper | Returns when | Use when |
|--------|--------------|----------|
| `Move($X, $Y, $random = 50)` | Immediately | Fire-and-forget. You handle waiting yourself. Good inside a `While IsRecharged($skill)` skill-spam loop. |
| `MoveTo($X, $Y, $precision = 25, $random = 50, $doWhile = Null)` | Player within `$precision` of target, OR map changed, OR died, OR blocked 14× | Default for blocking moves. The `$doWhile` callback fires once per tick — useful for stay-alive logic during travel. |
| `MoveAvoidingBodyBlock($X, $Y, $options = $default_move_defend_options)` | Same termination as `MoveTo`, plus opens chests and randomizes around blockers | Long defended travel where party body-blocks are likely. |

Source: `Utils.au3:57` (`MoveTo`), `Utils.au3:647` (`MoveAvoidingBodyBlock`).

### MoveTo internals (`Utils.au3:57-81`)

```autoit
Func MoveTo($X, $Y, $precision = 25, $random = 50, $doWhileRunning = Null)
    Local $blockedCount = 0
    Local $mapID = GetMapID()
    Local $destinationX = $X + Random(-$random, $random)
    Local $destinationY = $Y + Random(-$random, $random)
    Move($destinationX, $destinationY, 0)

    Local $me = GetMyAgent()
    While GetDistanceToPoint($me, $destinationX, $destinationY) > $precision
        If $doWhileRunning <> Null Then $doWhileRunning()
        RandomSleep(100)
        If Not IsPlayerMoving() Then
            $blockedCount += 1
            $destinationX = $X + Random(-$random, $random)
            $destinationY = $Y + Random(-$random, $random)
            Move($destinationX, $destinationY, 0)
        WEnd
        $me = GetMyAgent()
        If GetMapID() <> $mapID Then ExitLoop
        If DllStructGetData($me, 'HealthPercent') <= 0 Then Return False
        If $blockedCount > 14 Then Return False
    WEnd
    Return True
EndFunc
```

Things to notice:

- Returns `True` if reached, `False` if dead/blocked/map-changed.
- If the player isn't moving for one tick, jitter the destination and resend `Move`. This unsticks against terrain corners.
- Death and map-change are both early-exit. Caller must check the return value.

### MoveAvoidingBodyBlock options dict

`Utils.au3:995`:

```autoit
$default_move_defend_options.Add('defendFunction', Null)       ; called each tick
$default_move_defend_options.Add('moveTimeOut', 5 * 60 * 1000) ; ms
$default_move_defend_options.Add('randomFactor', 100)
$default_move_defend_options.Add('hosSkillSlot', 0)            ; Heart of Shadow slot for shadow-step recovery
$default_move_defend_options.Add('deathChargeSkillSlot', 0)
$default_move_defend_options.Add('openChests', False)
$default_move_defend_options.Add('chestOpenRange', $RANGE_SPIRIT)
```

Clone with `CloneDictMap($default_move_defend_options)` (`Utils.au3:2581`) before mutating — if you assign keys directly to the global, every later caller inherits your changes.

```autoit
Local $options = CloneDictMap($default_move_defend_options)
$options.Item('defendFunction') = MyDefendFunc
$options.Item('openChests') = True
MoveAvoidingBodyBlock($X, $Y, $options)
```

## Map travel

`TravelToOutpost($outpostID, $district = 'Random')` (`Utils.au3:162`):

```autoit
Func TravelToOutpost($outpostID, $district = 'Random')
    Local $outpostName = $MAP_NAMES_FROM_IDS[$outpostID]
    If GetMapID() == $outpostID Then Return $SUCCESS
    Info('Travelling to ' & $outpostName & ' (Outpost)')
    DistrictTravel($outpostID, $district)
    RandomSleep(1000)
    If GetMapID() <> $outpostID Then
        Warn('Player may not have access to ' & $outpostName & ' (outpost)')
        Return $FAIL
    EndIf
    Return $SUCCESS
EndFunc
```

The contract: returns `$SUCCESS` if you ended up on the right map, `$FAIL` otherwise. Always check it:

```autoit
If TravelToOutpost($ID_NAHPUI_QUARTER, $district_name) == $FAIL Then Return $FAIL
```

`ResignAndReturnToOutpost($outpostID, $ignoreMapID = False)` (`Utils.au3:178`) — `Resign()` then `ReturnToOutpost()`. Used at the end of every farm loop to reset to the outpost. If your farm's explorable shares an ID with the outpost (rare), pass `$ignoreMapID = True`.

`WaitMapLoading($mapID, $deadlockTime, $waitingTime)` (`GWA2.au3:750`) — block until the map ID matches. Always pass an explicit deadlock; the default 10 s is fine for most transitions.

## Targeting

For *programmatic* targeting (the bot's own decision), use the agent helpers below — they return an agent struct directly. The `Target*` functions in `GWA2.au3` send keypress-equivalent packets and are mostly for hotkey-style behavior:

```autoit
TargetNearestEnemy()         ; same as the V key
TargetNextEnemy()            ; cycle
ChangeTarget($agent)         ; set target to specific agent
CallTarget($target)          ; call (alerts the team)
CallTargetOnce($target)      ; call only if target changed
ClearTarget()
```

Most farm code does this instead:

```autoit
Local $target = GetNearestNPCInRangeOfCoords(700, -16700, $ID_ALLEGIANCE_FOE, $RANGE_EARSHOT)
AggroAgent($target)
```

## Finding foes / NPCs

All in `Utils-Agents.au3`. Coord-anchored helpers are the most useful for predetermined aggro points:

```autoit
GetNearestEnemyToCoords($X, $Y)
GetNearestNPCInRangeOfCoords($X, $Y, $allegiance, $range)
GetFurthestNPCInRangeOfCoords($allegiance, $X, $Y, $range)
GetNearestNPCToCoords($X, $Y)               ; any allegiance
```

Agent-anchored variants: `GetNearestEnemyToAgent($me, $range)`, `GetNearestNPCToAgent`, `GetNearestSignpostToAgent`, `GetNearestItemToAgent`.

For foe groups:

```autoit
$foes  = GetFoesInRangeOfAgent($me, $RANGE_EARSHOT)
$count = CountFoesInRangeOfAgent($me, $RANGE_NEARBY)
$mid   = FindMiddleOfFoes($X, $Y, $RANGE_AREA)   ; returns [centerX, centerY]
```

`FindMiddleOfFoes` is the canonical "ball center" calculation — used as the destination after pulling mobs (`Mantids.au3:202`).

### Ranges that matter

```
$RANGE_ADJACENT  = 156    melee
$RANGE_NEARBY    = 240    "are foes still alive?"
$RANGE_AREA      = 312    PBAoE skills
$RANGE_EARSHOT   = 1000   aggro range / 1.5
$RANGE_SPELLCAST = 1085   spell range
$RANGE_LONGBOW   = 1250
$RANGE_SPIRIT    = 2500
$RANGE_COMPASS   = 5000   the compass
$AGGRO_RANGE     = 1500   $RANGE_EARSHOT * 1.5
```

For hot loops, the squared variants (`$RANGE_AREA_2`, etc.) compare against `GetPseudoDistance` to skip the sqrt.

## Aggroing

The Mantids pattern (`Mantids.au3:165-175`):

```autoit
$target = GetNearestNPCInRangeOfCoords(700, -16700, $ID_ALLEGIANCE_FOE, $RANGE_EARSHOT)
AggroAgent($target)
MoveTo(-800, -15800)
```

`AggroAgent($targetAgent)` (`Utils.au3:594`) walks toward the target until distance is under `$RANGE_EARSHOT - 100`. It does not attack — it just gets you close enough that the foe enters combat with you.

`GetAlmostInRangeOfAgent($target, $proximity = $RANGE_SPELLCAST + 100)` (`Utils.au3:628`) — gets within casting range of a target without entering aggro range. Useful before casting a single targeted skill.

## Moving while staying alive

Pass a callback to `MoveTo($X, $Y, $precision, $random, $doWhile)` — fires once per 100 ms tick:

```autoit
Func StayAlive()
    If DllStructGetData(GetMyAgent(), 'HealthPercent') < 0.5 Then UseSkillEx($MY_HEAL)
    If IsRecharged($MY_BUFF) Then UseSkillEx($MY_BUFF)
EndFunc

MoveTo($X, $Y, 25, 50, StayAlive)
```

Vaettirs uses this pattern heavily — `VaettirsStayAlive` casts profession-specific buffs and heals based on health/distance/energy.

## Multi-waypoint pathing

When the path between zones is long enough that the engine drops the move command, hardcode a coord array and iterate:

```autoit
Local $path[][] = [ _
    [15003, -16598], _
    [12699, -14589], _
    [10891, -12989], _
    [9296,   -8811] _
]
For $i = 0 To UBound($path) - 1
    If RunAcrossBjoraMarches($path[$i][0], $path[$i][1]) == $FAIL Then Return $FAIL
Next
```

`Vaettirs.au3:170-204` is the canonical example. Keep coords in the file's `Const` declarations or a `Local Static` for clarity.

## Per-step defended movement

When each step needs combat handling, wrap `Move` in a custom helper rather than reusing `MoveTo`. Vaettirs's `RunAcrossBjoraMarches` (`Vaettirs.au3:212-235`):

```autoit
Func RunAcrossBjoraMarches($X, $Y)
    Move($X, $Y)
    Local $target
    Local $me = GetMyAgent()
    While GetDistanceToPoint($me, $X, $Y) > $RANGE_NEARBY
        If IsPlayerDead() Then Return $FAIL
        $target = GetNearestEnemyToAgent($me)
        If GetDistance($me, $target) < 1300 And GetEnergy() > 20 Then VaettirsCheckBuffs()
        ...
        $me = GetMyAgent()
        If Not IsPlayerMoving() Then Move($X, $Y)
        RandomSleep(500)
        $me = GetMyAgent()
    WEnd
    Return $SUCCESS
EndFunc
```

Pattern: snapshot `$me` once per iteration, check exit conditions, refresh, sleep, refresh again. The double-refresh (top + bottom of loop) is intentional — buff casts can take 500+ ms during which state changes.

## Stuck detection

`MoveTo` already counts non-movement ticks and bails after 14. For longer-running operations, layer two checks:

1. **Per-loop**: `CheckStuck($location, $maxFarmDuration = 3600000)` (`Utils.au3:564`) — returns `$FAIL` if the run exceeded the duration.
2. **Per-step**: `IsPlayerStuck($minMovement, $stuckTicks, $reset)` (`Utils.au3:1138`) and `TryToGetUnstuck($X, $Y, $intervalMs, $threshold)` (`Utils.au3:1176`).
3. **Last resort**: `CheckAndSendStuckCommand()` (`Utils.au3:574`) sends `/stuck` with rate limiting (10 s minimum). The comment is explicit: *"do not overuse, otherwise there can be a BAN!"*

## Hero flags

```autoit
CommandHero($idx, $X, $Y)    ; flag one hero
CommandAll($X, $Y)           ; flag full party (used in Mantids:162)
CancelHero($idx)             ; release flag
CancelAll()                  ; release party flag
ClearPartyCommands()         ; clear everything
FanFlagHeroes($range = 250)  ; spread heroes around player position (Utils.au3:1277)
```

`SetHeroBehaviour($idx, $level)` switches between fight/guard/avoid (0/1/2). For most farms heroes stay on fight (default).
