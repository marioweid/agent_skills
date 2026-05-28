# The Agent Struct

Reading game state means reading agent structs. This file documents the layout, the snapshot pattern, and the helpers that produce agents.

## What an "agent" is

Anything in the game world: the player, party members, heroes, NPCs, foes, animals, spirits, minions, items on the ground, chests, signposts. Each has a numeric `ID` (the live agent ID, regenerated per instance) and a struct describing its current state.

The struct definition lives in `GWA2_Assembly.au3:35-61` as a string template — `GetMyAgent()` and friends materialize it via `DllStructCreate`.

## Field reference (`$AGENT_STRUCT_TEMPLATE`)

The fields you actually read, grouped by purpose. Field names are case-sensitive and match the template exactly.

### Identity

| Field | Type | Notes |
|-------|------|-------|
| `ID` | long | Live agent ID. Regenerated per instance. Use as input to `GetAgentByID`. |
| `Type` | long | One of `$ID_AGENT_TYPE_NPC` (0xDB), `$ID_AGENT_TYPE_STATIC` (0x200), `$ID_AGENT_TYPE_ITEM` (0x400). |
| `TypeMap` | dword | Bitfield: attack stance, casting, dead, idle, etc. See `id-constants.md`. |
| `ModelID` | short | Static identity — same for every Charr Patrol. Use to identify NPC species. |
| `Owner` | long | For minions/spirits/items, the agent ID of the owner. |

### Position and movement

| Field | Type | Notes |
|-------|------|-------|
| `X`, `Y` | float | World coordinates. The two you read constantly. |
| `Z` | float | Height. Rarely useful. |
| `Plane` | dword | Z-plane index for multi-floor maps. |
| `Rotation`, `RotationCos`, `RotationSin` | float | Facing direction. `RotationCos2`/`RotationSin2` are the live updated copies. |
| `MoveX`, `MoveY` | float | Velocity vector. |

### Combat / health / energy

| Field | Type | Notes |
|-------|------|-------|
| `HealthPercent` | float | 0.0–1.0. `<= 0` means dead. |
| `MaxHealth` | dword | Absolute HP. |
| `EnergyPercent` | float | 0.0–1.0. |
| `MaxEnergy` | dword | Absolute energy. |
| `EnergyRegen` | float | Pips × 1/3 energy per second. |
| `Overcast` | float | Elementalist overcast level. |
| `HPPips` | float | Health regen, pips. |

### Identity / class

| Field | Type | Notes |
|-------|------|-------|
| `Primary` | byte | Profession ID, see `id-constants.md`. |
| `Secondary` | byte | Profession ID. |
| `Level` | byte | Character/foe level. |
| `Team` | byte | Team index in PvP. |
| `Allegiance` | byte | `$ID_ALLEGIANCE_*`. |

### Effects and state

| Field | Type | Notes |
|-------|------|-------|
| `Effects` | dword | Pointer to effect array (use `GetEffect`, don't read directly). |
| `Hex` | byte | Hex flag. |
| `ModelState` | dword | Animation/state machine for the agent. |
| `LastStrike` | byte | Type of last attack received. |

### Equipment (player/heroes)

| Field | Type | Notes |
|-------|------|-------|
| `WeaponType` | short | Equipped weapon type. |
| `WeaponItemType` | byte | Item subtype. |
| `WeaponItemID`, `OffhandItemID` | short | Specific items. |

### Items on the ground

| Field | Type | Notes |
|-------|------|-------|
| `ItemID` | dword | Item ID — use `GetItemByItemID` to resolve. |
| `ExtraType` | dword | Item flavor (rare/gold/etc). |

### Static objects

| Field | Type | Notes |
|-------|------|-------|
| `GadgetID` | dword | Identifies a specific chest/signpost type. Filter chests by GadgetID in `ScanForChests`. |

## Reading fields: the snapshot pattern

`GetMyAgent()` (and any `Get*Agent*` helper) returns a fresh `DllStruct`. Each call hits game memory. **Never call it inside a tight loop:**

```autoit
; WRONG - 4 memory reads per frame
While IsPlayerAlive()
    If DllStructGetData(GetMyAgent(), 'X') > 1000 Then ...
    If DllStructGetData(GetMyAgent(), 'Y') < -5000 Then ...
    Local $hp = DllStructGetData(GetMyAgent(), 'HealthPercent')
    Local $e = DllStructGetData(GetMyAgent(), 'EnergyPercent')
WEnd
```

```autoit
; RIGHT - one snapshot, four reads
Local $me = GetMyAgent()
While IsPlayerAlive()
    If DllStructGetData($me, 'X') > 1000 Then ...
    If DllStructGetData($me, 'Y') < -5000 Then ...
    Local $hp = DllStructGetData($me, 'HealthPercent')
    Local $e = DllStructGetData($me, 'EnergyPercent')
    RandomSleep(500)
    $me = GetMyAgent()
WEnd
```

Comment at `BotsHub.au3:22` codifies this: *"Always refresh agents before getting data from them (agent = snapshot). So only use `$me` if you are sure nothing important changes between `$me` definition and `$me` usage."*

Refresh once per loop iteration, just before you read fields. The Mantids loop (`Mantids.au3:208-216`) is the canonical example.

## Producing agents

Defined in `GWA2.au3:880-984` and `Utils-Agents.au3:259-740`. The ones bots actually use:

### Self / by ID

| Helper | Returns |
|--------|---------|
| `GetMyID()` | Your live agent ID. |
| `GetMyAgent()` | Snapshot of the player agent. |
| `GetAgentByID($id)` | Snapshot of a specific agent. |
| `GetAgentExists($id)` | True/False — guard before reading from a freshly loaded map. |

### By proximity (most-used in farms)

| Helper | Notes |
|--------|-------|
| `GetNearestEnemyToAgent($me, $range)` | Closest foe to your snapshot. |
| `GetNearestEnemyToCoords($X, $Y)` | Closest foe to a coord pair. |
| `GetNearestNPCToCoords($X, $Y)` | Closest NPC of any allegiance. |
| `GetNearestNPCInRangeOfCoords($X, $Y, $allegiance, $range)` | Closest NPC of specific allegiance within range. Used for aggroing groups (`Mantids.au3:165`). |
| `GetNearestNPCToAgent($agent, $range)` | Same but anchored to an agent. |

### Counts and groups

| Helper | Notes |
|--------|-------|
| `CountFoesInRangeOfAgent($agent, $range)` | Foe count for "are we done?" checks. |
| `CountFoesInRangeOfCoords($X, $Y, $range)` | Same, coord-anchored. |
| `GetFoesInRangeOfAgent($agent, $range)` | Foe array for iteration. |
| `FindMiddleOfFoes($X, $Y, $range)` | Returns `[centerX, centerY]` — used for balling. |
| `FindMiddleOfParty()` | `[X, Y]` of the party centroid. |
| `GetAgentArray($type)` | All agents of a given type. Cheap; iterate locally. |

### Type predicates

```autoit
IsNPCAgentType($agent)      ; Type == 0xDB
IsStaticAgentType($agent)   ; Type == 0x200 (chest/signpost)
IsItemAgentType($agent)     ; Type == 0x400 (ground item)
```

### State predicates (`Utils-Agents.au3:723-816`)

```autoit
IsPlayerAlive()           IsPlayerDead()
IsPlayerMoving()          GetIsMoving($agent)
GetIsKnocked($agent)      GetIsAttacking($agent)
GetIsCasting($agent)      GetIsDead($agent)
GetIsBleeding($agent)     GetIsPoisoned($agent)
GetIsEnchanted($agent)    GetHasHex($agent)
GetHasDegenHex($agent)    GetHasCondition($agent)
GetHasDeepWound($agent)   GetIsBoss($agent)
```

### Energy/health helpers (read from a snapshot)

```autoit
GetEnergy($agent = Null)    ; defaults to player
GetHealth($agent = Null)    ; defaults to player
```

## Distance

`Utils-Agents.au3:27-46`:

```autoit
GetDistance($agent1, $agent2)             ; sqrt distance
GetDistanceToPoint($agent, $X, $Y)
GetPseudoDistance($agent1, $agent2)       ; squared, faster — compare against $RANGE_*_2
```

In hot loops use `GetPseudoDistance` and the squared range constants — avoids the sqrt.

## Buffs and effects

`GetEffect($skillID = 0, $heroIndex = 0)` (`GWA2.au3:512`) returns the effect struct (or array of all effects when `$skillID == 0`). The `EFFECT_STRUCT_TEMPLATE` (`GWA2_Assembly.au3:64`):

```
long SkillID; long AttributeLevel; long EffectID; long AgentID;
float Duration; long TimeStamp;
```

`GetEffectTimeRemaining($effect)` (`GWA2.au3:551`) returns ms remaining.

Buffs (maintained enchantments) use `BUFF_STRUCT_TEMPLATE` and `GetBuffByIndex($i, $heroIndex)`.

## Type guard for newly loaded maps

After `WaitMapLoading`, a brief window exists where `GetMaxAgents() > 0` but specific agents are still being populated. Standard guard:

```autoit
WaitMapLoading($ID_WAJJUN_BAZAAR, 10000, 2000)
While Not GetAgentExists(GetMyID())
    RandomSleep(100)
WEnd
Local $me = GetMyAgent()
```

`WaitMapLoading` itself already polls `GetMyID() == 0 Or GetMaxAgents() == 0` (`GWA2.au3:754`), so this extra check is rarely needed — but reach for it if you see "Variable used without being declared" or null-deref errors right after a transition.
