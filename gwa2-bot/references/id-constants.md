# Useful ID Constants

The constants bots reach for repeatedly. Full lists live in `BotsHub/lib/GWA2_ID*.au3` — this file is the curated subset, with file paths so the unabridged tables stay one click away.

## Status flags returned from farm functions

Defined in `BotsHub.au3:91-95`.

```autoit
$NOT_STARTED = -1
$SUCCESS     = 0
$FAIL        = 1
$PAUSE       = 2
```

Every `<Name>Farm()` entry point must return one of `$SUCCESS`, `$FAIL`, `$PAUSE`. `$NOT_STARTED` is internal.

## Modes (`GWA2_ID.au3:41-43`)

```autoit
$ID_NORMAL_MODE = 0
$ID_HARD_MODE   = 1
```

Pass to `SwitchMode($mode)` (`GWA2.au3:2736`). Most farms set hard mode in their Setup function.

## Professions (`GWA2_ID.au3:89-100`)

```autoit
$ID_UNKNOWN = 0       $ID_ELEMENTALIST = 6
$ID_WARRIOR = 1       $ID_ASSASSIN     = 7
$ID_RANGER  = 2       $ID_RITUALIST    = 8
$ID_MONK    = 3       $ID_PARAGON      = 9
$ID_NECROMANCER = 4   $ID_DERVISH      = 10
$ID_MESMER  = 5       $ID_ANY_PROFESSION = 11
```

Read with `DllStructGetData(GetMyAgent(), 'Primary')` or `DllStructGetData(GetMyAgent(), 'Secondary')`. Used in profession-gated setup:

```autoit
If DllStructGetData(GetMyAgent(), 'Primary') == $ID_RANGER Then
    LoadSkillTemplate($RA_MANTIDS_FARMER_SKILLBAR)
Else
    Warn('Should run this farm as ranger')
    Return $FAIL
EndIf
```

## Allegiance (`GWA2_ID.au3:117-122`)

```autoit
$ID_ALLEGIANCE_TEAM    = 1   ; player and party
$ID_ALLEGIANCE_ANIMAL  = 2   ; untamed wildlife
$ID_ALLEGIANCE_FOE     = 3   ; enemies
$ID_ALLEGIANCE_SPIRIT  = 4   ; ranger/ritualist spirits, pets
$ID_ALLEGIANCE_MINION  = 5   ; necro minions
$ID_ALLEGIANCE_NPC     = 6   ; NPCs (can be allies)
```

Read from `DllStructGetData($agent, 'Allegiance')`. Pass as the `$npcAllegiance` argument to `GetNearestNPCInRangeOfCoords`, `CountNPCsInRangeOfAgent`, etc.

## Agent types (`GWA2_ID.au3:126-128`)

```autoit
$ID_AGENT_TYPE_NPC    = 0xDB    ; players, party, NPCs, foes
$ID_AGENT_TYPE_STATIC = 0x200   ; chests, signposts
$ID_AGENT_TYPE_ITEM   = 0x400   ; items on the ground
```

Pass to `GetAgentArray($type)` to scope a scan. Read from `DllStructGetData($agent, 'Type')`.

## TypeMap (state bits, `GWA2_ID.au3:131-153`)

```autoit
$ID_TYPEMAP_ATTACK_STANCE = 0x0001   ; attacking / in attack stance
$ID_TYPEMAP_DEATH_STATE   = 0x0008   ; dead
$ID_TYPEMAP_SKILL_USAGE   = 0x2000   ; using a skill
$ID_TYPEMAP_AGGROED_FOE   = $ID_TYPEMAP_ATTACK_STANCE
$ID_TYPEMAP_DEAD_FOE      = $ID_TYPEMAP_DEATH_STATE
$ID_TYPEMAP_DEAD_PLAYER   = 0x42100C
```

`DllStructGetData($agent, 'TypeMap')` is a bitfield — `BitAND` it with the constant you care about.

## Range constants (`Utils.au3:30-33`)

```autoit
$RANGE_ADJACENT  = 156
$RANGE_NEARBY    = 240
$RANGE_AREA      = 312
$RANGE_EARSHOT   = 1000     ; aggro range = 1.5 * earshot
$RANGE_SPELLCAST = 1085
$RANGE_LONGBOW   = 1250
$RANGE_SPIRIT    = 2500
$RANGE_COMPASS   = 5000
$AGGRO_RANGE     = 1500     ; $RANGE_EARSHOT * 1.5
$PLAYER_DEFAULT_SPEED = 290 ; map units per second, no boosts
```

Squared variants (`$RANGE_AREA_2 = 312^2`, etc.) exist on the next line for hot loops that compare squared distances to skip the sqrt.

## Hero combat behaviour (`GWA2_ID.au3:111-113`)

```autoit
$ID_HERO_FIGHTING = 0
$ID_HERO_GUARDING = 1
$ID_HERO_AVOIDING = 2
```

Pass to `SetHeroBehaviour($heroIndex, $level)` (`GWA2.au3:1073`).

## Team sizes (`GWA2_ID.au3:105-107`)

```autoit
$ID_TEAM_SIZE_SMALL  = 4
$ID_TEAM_SIZE_MEDIUM = 6
$ID_TEAM_SIZE_LARGE  = 8
```

## Hero IDs (`GWA2_ID.au3:258-294`)

The 29 named heroes plus 8 mercenaries. Subset bots reach for most:

```autoit
$ID_NORGU = 1            $ID_RAZAH = 15
$ID_GOREN = 2            $ID_MOX = 16
$ID_TAHLKORA = 3         $ID_KEIRAN_THACKERAY = 17
$ID_MASTER_OF_WHISPERS = 4   $ID_JORA = 18
$ID_ACOLYTE_JIN = 5      $ID_PYRE_FIERCESHOT = 19
$ID_KOSS = 6             $ID_ANTON = 20
$ID_DUNKORO = 7          $ID_LIVIA = 21
$ID_ACOLYTE_SOUSUKE = 8  $ID_HAYDA = 22
$ID_MELONNI = 9          $ID_KAHMU = 23
$ID_ZHED_SHADOWHOOF = 10 $ID_GWEN = 24
$ID_GENERAL_MORGAHN = 11 $ID_XANDRA = 25
$ID_MARGRID_THE_SLY = 12 $ID_VEKK = 26
$ID_ZENMAI = 13          $ID_OGDEN = 27
$ID_OLIAS = 14           $ID_MIKU = 36, $ID_ZEIRI = 37
```

Pass to `AddHero($heroID)` directly, or to `AddHeroByProfession($profession, $preferredHeroID)` (`Utils.au3:1622`) which falls back to other heroes of the same profession if the preferred one isn't unlocked.

The full ordered array `$HERO_IDS[]` (`GWA2_ID.au3:296`) iterates all 37 in canonical order.

## Districts (`GWA2_ID.au3:54-83`)

Pass district *names* to `TravelToOutpost($mapID, 'German')`, `'Random EU'`, etc. The name → `[language, region]` mapping lives in `$REGION_MAP` (`GWA2_ID.au3:84`). Strings:

```
'English', 'French', 'German', 'Italian', 'Polish', 'Russian', 'Spanish',
'America', 'China', 'Japan', 'Korea', 'International'
```

Plus `'Random'`, `'Random EU'`, `'Random US'`, `'Random Asia'` for shuffled selection.

## Map IDs (`GWA2_ID_Maps.au3` — sample)

The big table. The most-used handful:

```autoit
$ID_NAHPUI_QUARTER  = 216    ; Mantids outpost
$ID_WAJJUN_BAZAAR   = 239    ; Mantids zone
$ID_RIVEN_EARTH     = 501    ; Raptors zone
$ID_JAGA_MORAINE    = 546    ; Vaettirs zone
$ID_RATA_SUM        = 640    ; Raptors outpost
$ID_LONGEYES_LEDGE  = 650    ; Vaettirs outpost
$ID_EYE_OF_THE_NORTH = ($ID_EYE_OF_THE_NORTH_DEFAULT = 642 unless Wintersday)
$ID_TEMPLE_OF_THE_AGES, $ID_CHANTRY_OF_SECRETS  ; UW/FoW entry
```

`$ID_EYE_OF_THE_NORTH` is computed (`GWA2_ID_Maps.au3:1009`) from `IsChristmasFestival()` — during the festival it points to `$ID_EYE_OF_THE_NORTH_WINTERSDAY = 821`. Don't hard-code 642.

`$MAP_NAMES_FROM_IDS[$id]` (used by `TravelToOutpost`) reverses the lookup for log messages.

For any new bot, grep `GWA2_ID_Maps.au3` for the outpost name first — most maps already have a constant.

## Skill IDs

`GWA2_ID_Skills.au3` is large (every Guild Wars skill). Bots typically reference skill *slots* (1–8), not skill IDs — slots are addressed via `Global Const $<FARM>_<SKILL_NAME> = N` in the farm file (see `Mantids.au3:44-51`). Skill *IDs* show up in:

- `LoadSkillTemplate($base64Code)` — encoded build string holds the IDs.
- `GetSkillbarSkillID($slot)` — to verify a specific skill is in a specific slot.
- `IsRecharged($slot)` / `UseSkillEx($slot, $target)` — slot-based, never ID-based.

When a bot needs skill *IDs* (not slots), grep `GWA2_ID_Skills.au3` for the skill name.

## Item IDs

`GWA2_ID_Items.au3` — consumables, materials, scrolls, festival items. Bots use these mainly for `UseConsumable($id)` and loot configuration JSON.

## Quest IDs

`GWA2_ID_Quests.au3` — for `AcceptQuest($id)`, `AbandonQuest($id)`, `GetQuestByID($id)`. Quest log states are an enum:

- `0` — no such quest
- `1` — quest in progress
- `2` — quest over and out
- `3` — quest over, still in map

(Comment at `GWA2.au3:1811`.)
