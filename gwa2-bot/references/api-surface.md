# GWA2 / Utils API Surface

Function index, organized by `#Region` blocks. Path syntax: `<file>:<line>`. Most function signatures are abbreviated — open the file for default values and inline docs.

The two primary modules:

- **`lib/GWA2.au3`** — direct wrappers around game memory and packet sends.
- **`lib/Utils.au3`** — higher-level helpers built on top of GWA2.
- **`lib/Utils-Agents.au3`** — agent queries (counts, scans, distance, predicates).
- **`lib/Utils-Storage.au3`** — inventory and loot.

## GWA2.au3 — Movement (105–183)

Low-level packet sends. Most farms use `Utils.au3` wrappers (`MoveTo`, `MoveAvoidingBodyBlock`) instead.

```autoit
Move($X, $Y, $random = 50)             ; GWA2.au3:106 — fire-and-forget move
GoPlayer($agent)                       ; :119
GoNPC($agent)                          ; :125
GoSignpost($agent)                     ; :131
TurnLeft($turn)  TurnRight($turn)      ; :137,143
MoveBackward($move) MoveForward($move) ; :149,155
StrafeLeft / StrafeRight               ; :161,167
ToggleAutoRun()                        ; :173
ReverseDirection()                     ; :179
```

## GWA2.au3 — Combat & Interaction (185–301)

```autoit
ChangeWeaponSet($slot)                 ; :187
Attack($agent, $callTarget = False)    ; :193
UseSkill($slot, $target, $callTarget)  ; :200 — fire-and-forget
UseHeroSkill($heroIdx, $slot, $target) ; :213 — fire-and-forget
IsCasting($agent)                      ; :222
CancelAction()                         ; :231
ActionInteract()                       ; :237 — spacebar
ActionFollow()                         ; :243
DropBundle()                           ; :249
SuppressAction($which)                 ; :255
OpenChest()                            ; :261
DropBuff($skillID, $agent, $heroIdx)   ; :267
Dialog($dialogID)                      ; :297 — talk to NPC
```

## GWA2.au3 — Skills & Builds (303–597)

```autoit
SetSkillbarSkill($slot, $skillID, $heroIdx)        ; :305
LoadSkillBar(skill1..skill8, $heroIdx)              ; :311
IncreaseAttribute($attrID, $heroIdx)                ; :317
DecreaseAttribute($attrID, $heroIdx)                ; :325
ChangeSecondProfession($prof, $heroIdx)             ; :333
GetSkillbar($heroIdx = 0)                           ; :339 — full struct
GetSkillbarSkillID($slot, $heroIdx)                 ; :385
GetSkillbarSkillAdrenaline($slot, $heroIdx)         ; :391
IsRecharged($slot, $heroIdx)                        ; :397
GetSkillByID($skillID)                              ; :406
GetBuffCount($heroIdx)                              ; :415
GetIsTargetBuffed($skillID, $agent, $heroIdx)       ; :433
GetBuffByIndex($idx, $heroIdx)                      ; :460
GetAttributeInfoByID($attrID)                       ; :482
GetAttributeProfession($attrID)                     ; :491
GetEffect($skillID = 0, $heroIdx = 0)               ; :512 — single effect or array
GetEffectTimeRemaining($effect, $heroIdx)           ; :551
GetSkillTimer()                                     ; :573 — shared cast timer
GetAttributeByID($attrID, $withRunes, $heroIdx)     ; :581
```

## GWA2.au3 — Travel (599–760)

```autoit
GetFoesKilled()  GetFoesToKill()  GetAreaVanquished()  ; :601,609,617
GetMapType()                                            ; :623 — outpost/explorable/mission
GetMapID()                                              ; :631
GetAreaInfoByID($mapID)                                 ; :640
GetMapCampaign($mapID)  GetMapRegion($mapID)            ; :651,658
GetMapIsLoaded()                                        ; :672
GetDistrict()                                           ; :678
MoveMap($mapID, $region, $district, $language)          ; :692 — internal
ReturnToOutpost()                                       ; :698
EnterChallenge()  EnterChallengeForeign()               ; :704,710
TravelGuildHall()  LeaveGuildHall()                     ; :716,726
WaitMapLoading($mapID = -1, $deadlock = 10000, $wait = 2500) ; :750
```

## GWA2.au3 — Targeting (764–878)

```autoit
GetCurrentTarget()  GetCurrentTargetID()    ; :766,773
ChangeTarget($agent)                        ; :779
CallTarget($target)  CallTargetOnce($target) ; :786,792
ClearTarget()                                ; :802
TargetNearestEnemy()  TargetNextEnemy()      ; :808,814
TargetPreviousEnemy()  TargetCalledTarget()  ; :826,832
TargetSelf()                                  ; :838
TargetNearestAlly()                          ; :844
TargetNearestItem()  TargetNextItem()        ; :850,856
TargetPartyMember($idx)                      ; :820
```

## GWA2.au3 — Agent (880–982)

```autoit
GetMyID()                                ; :882
GetMyAgent()                             ; :888
GetMaxAgents()                           ; :894
GetAgentByID($id)                        ; :900
GetAgentPtr($id)                         ; :910
GetAgentExists($id)                      ; :918
GetAgentByPlayerName($name)              ; :924
GetAgentArray($type = 0)                 ; :933 — fast array of given type
GetPlayerName($agent)                    ; :976
```

## GWA2.au3 — Heroes & Mercenaries (985–1153)

```autoit
AddHero($heroID)                                ; :987
KickHero($heroID)  KickAllHeroes()              ; :994,1000
LeaveParty($kickHeroes = True)                  ; :1006
AddNpc($npcID)  KickNpc($npcID)                 ; :1014,1020
CancelHero($idx)  CancelAll()                   ; :1026,1033
ClearPartyCommands()  CancelAllHeroes()         ; :1039,1045
CommandHero($idx, $X, $Y)                       ; :1053
CommandAll($X, $Y)                              ; :1059 — full-party flag
LockHeroTarget($idx, $agentID)                  ; :1065
SetHeroBehaviour($idx, $level)                  ; :1073 — 0=fight 1=guard 2=avoid
GetHeroCount()                                  ; :1086
GetHeroID($idx)                                 ; :1094
GetHeroNumberByAgentID($id)                     ; :1103
GetHeroNumberByHeroID($id)                      ; :1117
GetHeroProfession($idx, $secondary = False)     ; :1131
GetIsHeroSkillSlotDisabled($idx, $slot)         ; :1150
```

## GWA2.au3 — Party (1156–1207)

```autoit
GetPartyState($flag)        ; :1164 — bitfield, BitAND with 0x10/0x20/0x40/...
GetIsHardMode()             ; :1172
GetPartySize()              ; :1177
GetPartyAlliesSize()        ; :1195
GetPartyWaitingForMission() ; :1203
```

## GWA2.au3 — Item (1209–1391)

```autoit
GetRarity($item)                            ; :1211
IsIdentified($item)  IsUnidentified($item)  ; :1219,1225
IsUnidentifiedGoldItem($item)               ; :1231
GetItemReq($item)  GetItemAttribute($item)  ; :1237,1244
GetModByIdentifier($item, $id)              ; :1251
GetModStruct($item)                         ; :1266
GetBag($bagIdx)  GetBagPtr($bagIdx)         ; :1274,1284
GetItemBySlot($bag, $slot)                  ; :1292
GetItemPtrBySlot($bag, $slot)               ; :1310
GetItemByItemID($id)                        ; :1323
GetItemByAgentID($id)                       ; :1334
GetItemByModelID($modelID)                  ; :1346
GetItemByFilter($filterFunc, $param)        ; :1358
GetGoldStorage()  GetGoldCharacter()        ; :1377,1385
```

Bag indices: `1-5` = inventory + bags + belt pouch + equipment, `6` = xunlai materials, `8-21` = xunlai chest. Reference at `GWA2.au3:1273`.

## GWA2.au3 — Item manipulations (1393–1565)

```autoit
StartSalvageWithKit($item, $kit)  CancelSalvage()
SalvageMaterials()  SalvageMod($idx)  EndSalvage()
IdentifyItem($item)
EquipItem($item)  EquipItemByModelID($id)
IsItemEquipped($modelID)  IsItemEquippedInWeaponSlot($modelID, $slot)
ItemExistsInInventory($modelID)
UseItem($item)
PickUpItem($item)
DropItem($item, $amount)  DestroyItem($item)
MoveItem($item, $bagIdx, $slot)
AcceptAllItems()
DropGold($amount)  ChangeGold($char, $storage)
```

## GWA2.au3 — Trade (1568–1789)

NPC trade (1568–1726): `SellItem`, `BuyItem`, `GetTraderCostID/Value`, `GetMerchantItemPtrByModelID`, `TraderRequest`, `TraderBuy`, `SellItemToTrader`.

Player trade (1728–1789): `TradePlayer`, `AcceptTrade`, `SubmitOffer`, `CancelTrade`, `ChangeOffer`, `OfferItem`, `TradeWinExist`, `TradeOfferItemExist`, `TradeOfferMoneyExist`, `ToggleTradePatch`.

## GWA2.au3 — Quest (1791–1839)

```autoit
AcceptQuest($id)  QuestReward($id)  AbandonQuest($id)
GetQuestByID($id)   ; LogState 0/1/2/3 — see id-constants.md
```

## GWA2.au3 — Titles (1841–2061)

35 title getters: `GetHeroTitle`, `GetGladiatorTitle`, `GetKurzickTitle`, `GetLuxonTitle`, `GetDrunkardTitle`, `GetSurvivorTitle`, `GetMaxTitles`, `GetLuckyTitle`, `GetUnluckyTitle`, `GetSunspearTitle`, `GetLightbringerTitle`, `GetCommanderTitle`, `GetGamerTitle`, `GetLegendaryGuardianTitle`, `GetSweetTitle`, `GetAsuraTitle`, `GetDeldrimorTitle`, `GetVanguardTitle`, `GetNornTitle`, `GetNorthMasteryTitle`, `GetPartyTitle`, `GetZaishenTitle`, `GetTreasureTitle`, `GetWisdomTitle`, `GetCodexTitle`, `GetTournamentPoints`, plus setters `SetTitleSpearmarshall`, `SetTitleLightbringer`, `SetTitleAsuran`, `SetTitleDwarven`, `SetTitleEbonVanguard`, `SetTitleNorn`, and the generic `SetDisplayedTitle($title)`.

## GWA2.au3 — Faction (2063–2125)

```autoit
GetKurzickFaction()  GetMaxKurzickFaction()
GetLuxonFaction()  GetMaxLuxonFaction()
GetBalthazarFaction()  GetMaxBalthazarFaction()
GetImperialFaction()  GetMaxImperialFaction()
GetFaction($finalOffset)
DonateFaction($faction)
```

## GWA2.au3 — Display (2127–2210)

```autoit
MakeScreenshot()
EnableRendering($showWindow)  DisableRendering($hideWindow)  ToggleRendering()
GetIsRendering()
DisplayAll($display)  DisplayAllies($display)  DisplayEnemies($display)
```

## GWA2.au3 — Windows (2213–2326)

Toggle helpers: `ToggleHeroWindow`, `ToggleInventory`, `ToggleAllBags`, `ToggleWorldMap`, `ToggleOptions`, `ToggleQuestWindow`, `ToggleSkillWindow`, `ToggleMissionMap`, `ToggleFriendList`, `ToggleGuildWindow`, `TogglePartyWindow`, `ToggleScoreChart`, `ToggleLayoutWindow`, `ToggleMinionList`, `ToggleHeroPanel($hero)`, `ToggleHeroPetPanel($hero)`, `TogglePetPanel`, `ToggleHelpWindow`. `CloseAllPanels()` resets the UI.

## GWA2.au3 — Chat (2329–2420)

```autoit
WriteChat($message, $sender = 'GWA2')   ; :2331 — local-only, debug
SendWhisper($receiver, $message)         ; :2348
SendChat($message, $channel = '!')       ; :2361
ProcessChatMessage($struct)              ; :2375 — internal
```

## GWA2.au3 — Builds & Templates (2422–2623)

```autoit
LoadSkillTemplate($base64Code, $heroIdx = 0)   ; :2424 — encoded build string
LoadAttributes($attrArray, $secondProf, $heroIdx) ; :2500
GetProfPrimaryAttribute($prof)                  ; :2559
EmptyAttributes($secondProf, $heroIdx)          ; :2586
ClearAttributes($heroIdx)                       ; :2605
```

## GWA2.au3 — Miscellaneous (2625–end)

```autoit
DecodeEncString($ptr)               ; :2628
DecodeEncStringAsync($ptr, $timeout) ; :2659
GetMorale($heroIdx = 0)              ; :2693
GetExperience()                      ; :2705
GetPing()                            ; :2713 — see autoit-quirks.md
GetDisplayLanguage()                 ; :2720
GetInstanceUpTime()                  ; :2728
SwitchMode($mode)                    ; :2736 — Normal/Hard
SkipCinematic()                      ; :2742
ToggleLanguage()                     ; :2748
SetPlayerStatus($status)             ; :2755 — 0/1/2/3 = offline/online/dnd/away
InviteGuild($charName)               ; :2767
InviteGuest($charName)               ; :2783
Disconnected($maxRetries, $delay)    ; :2799
```

---

## Utils.au3 — Map and travel (48–367)

```autoit
GetOwnPosition()                                          ; :50 — log current X,Y
MoveTo($X, $Y, $precision = 25, $random = 50, $doWhile)   ; :57 — blocking, with stuck detection
MoveRandom($X, $Y, $distance)                             ; :85
GoToNPC($agent)  GoToSignpost($agent)                     ; :92,98
GoToAgent($agent, $goFunc = Null)                          ; :104
DistrictTravel($mapID, $district)                          ; :130
RandomDistrictTravel($mapID, $from, $to)                   ; :152
TravelToOutpost($outpostID, $district = 'Random')          ; :162
ResignAndReturnToOutpost($outpostID, $ignoreMapID = False) ; :178
TravelToFoWOutpost($district)  TravelToUWOutpost($district); :198,218
EnterFissureOfWoe()  EnterUnderworld()                     ; :234,288
EnterUrgozsWarren()  EnterTheDeep()                        ; :337,355
NPCCoordinatesInTown($town, $type)                         ; :373
```

## Utils.au3 — Chests (425–528)

```autoit
ScanForChests($range, $flagged, $X, $Y, $gadgetID)          ; :428
FindChest($range = $RANGE_EARSHOT)                           ; :452
FindAndOpenChests($range, $defendFunc, $blockedFunc)         ; :476
CountOpenedChests()                                          ; :513
ClearChestsMap()                                             ; :523
GoToSignpostWhileDefending($signpost, $defend, $blocked)     ; :530
```

## Utils.au3 — Stuck detection / aggro (557–730)

```autoit
IsPlayerRubberBanding()                            ; :558
CheckStuck($location, $maxFarmDuration)            ; :564
CheckAndSendStuckCommand()                         ; :574 — sends /stuck (rate-limited)
AggroAgent($targetAgent)                           ; :594
GoNearestNPCToCoords($X, $Y)                       ; :603
GetAlmostInRangeOfAgent($agent, $proximity)        ; :628
MoveAvoidingBodyBlock($X, $Y, $options)            ; :647 — see movement-and-targeting.md
```

## Utils.au3 — Combat orchestration (732–1278)

```autoit
AttackOrUseSkill($attackSleep, $skill1...$skill8)        ; :734 — first recharged skill
AllHeroesUseSkill($slot, $target = 0)                     ; :757
GetCastTimeModifier($effects, $skill)                     ; :766
UseSkillExNew($slot, $target, $timeout = 5000)            ; :811 — generic, slower
UseSkillEx($slot, $target = Null)                         ; :829 — primary skill caller
UseSkillTimed($slot, $target)                             ; :893 — full effects modifier math
UseHeroSkillEx($heroIdx, $slot, $target)                  ; :923
UseHeroSkillTimed($heroIdx, $slot, $target)               ; :947
WaitAndFightEnemiesInArea($options)                       ; :1007
MoveAggroAndKill($X, $Y, $log, $options)                  ; :1084 — clear a zone
FlagMoveAggroAndKill / -InRange / -SafeTraps              ; :1040–1062
LootTrappedAreaSafely()                                   ; :1071
IsPlayerStuck($minMove, $stuckTicks, $reset)              ; :1138
TryToGetUnstuck($X, $Y, $unstuckIntervalMs, $threshold)   ; :1176
KillFoesInArea($options)                                  ; :1204
UseSkillSequentially($target, $options)                   ; :1248
FanFlagHeroes($range = 250)                                ; :1277
```

## Utils.au3 — Quests / faction (1404–1594)

```autoit
GetQuestEncryptedObjectives($questID, $byteSize)
TakeQuest($npc, $questID, $dialogID, $initialDialogID)
TakeQuestReward($npc, $questID, $dialogID, $initialDialogID)
TakeQuestOrReward($npc, $questID, $dialogID, $statePred)
IsQuestNotFound  IsQuestCompleted  IsQuestActive
IsQuestPartiallyCompleted  IsQuestReward  IsQuestPrimary  IsQuestSecondary
QuestStateMatches($questID, $expectedMask)
GetGoldForShrineBenediction()
TakeFactionBlessing($faction)
ManageFactionPointsKurzickFarm() / -LuxonFarm() / -Farm(...)
```

## Utils.au3 — Heroes (1596–1652)

```autoit
DisableAllHeroSkills($heroIdx)             ; :1597
DisableHeroSkillSlot($heroIdx, $slot)      ; :1607
EnableHeroSkillSlot($heroIdx, $slot)       ; :1613
AddHeroByProfession($profID, $preferredID) ; :1622 — falls back across heroes
AddRequiredHero($heroID)                   ; :1644 — strict
GetNearestItemByModelIDToAgent($modelID, $agent)  ; :1655
```

## Utils.au3 — Misc (1734–end)

```autoit
InvitePlayer($name)  Resign()
WriteBinary  MemoryWrite  MemoryRead  StructMemoryRead  MemoryReadPtr
ScanToFunctionStart  FindInRange  ResolveDirectBranchTarget
ClearMemory($processHandle)
SetMaxMemory($processHandle)
ScanMemoryForPattern($processHandle, $pattern)
GetWindowHandleForProcess($process)
RandomSleep($base, $factor)                   ; :2714
ComputeDistance($X1, $Y1, $X2, $Y2)            ; :2672
IsOverLine(...)  GetIsPointInPolygon(...)      ; :2678,2689
ArrayContains  FillArray  AppendArrayMap
MapFromArray  MapFromDoubleArray  MapFromArrays  AddToMapFromArrays
CloneMap  CloneDictMap                         ; :2571,2581 — deep copy of options dicts
LongestCommonSubstringOfTwoStrings  LongestCommonSubstring  IsSubstring
SafeEval($name)
ConvertTimeToHourString  ConvertTimeToMinutesString
IsCanthanNewYearFestival  IsAnniversaryCelebration
IsDragonFestival  IsHalloweenFestival  IsChristmasFestival
ToggleMapping($mode, $path)  MappingWrite($file)
DynamicExecution($call)  ParseFunctionArguments($args)
_dlldisplay($struct, $fields)                  ; :2768 — pretty-print a DllStruct
```

## Utils-Agents.au3 — Agent queries (full list)

```autoit
GetDistance($a1, $a2)                       ; :28
GetDistanceToPoint($a, $X, $Y)              ; :34
GetPseudoDistance($a1, $a2)                  ; :40 — squared
CountAliveHeroes()                           ; :51
CountAlivePartyMembers()                     ; :62
IsPlayerAlive() / IsPlayerDead()             ; :69,74
IsHeroAlive($idx) / IsHeroDead($idx)         ; :79,84
IsPlayerAndPartyWiped()                      ; :89
IsPlayerOrPartyAlive()                       ; :94
IsRunFailed()                                ; :100
IsPartyCurrentlyAlive()                      ; :111
ResetFailuresCounter()                       ; :117
TrackPartyStatus()                           ; :124 — Adlib-driven
HasRezMemberAlive()                          ; :137
FindHeroesWithRez()                          ; :149
IsRezSkill($skill)                           ; :170
GetParty($agents = Null)                     ; :186
CheckIfAnyPartyMembersDead()                 ; :209
IsPlayerAtMaxMalus()  TeamHasTooMuchMalus()  ; :221,228
PrintNPCInformations($npc)                   ; :240
CountFoesInRangeOfAgent($a, $range, $cond)   ; :260
CountTeamInRangeOfAgent($a, $range, $cond)   ; :266
CountFoesInRangeOfCoords($X, $Y, $range, $cond) ; :272
CountAlliesInRangeOfCoords($X, $Y, $range, $cond) ; :278
CountNPCsInRangeOfAgent($a, $alleg, $range, $cond) ; :284
CountNPCsInRangeOfCoords($X, $Y, $alleg, $range, $cond) ; :290
GetIntoTeamRange($size, $range, $maxWait)    ; :316
MoveToMiddleOfPartyWithTimeout($timeOut)     ; :327
FindMiddleOfParty()                          ; :342
FindMiddleOfFoes($X, $Y, $range = $RANGE_AREA) ; :362
GetFoesInRangeOfAgent / -Coords              ; :377,383
GetNPCsInRangeOfAgent / -Coords              ; :389,407
GetPartyInRangeOfAgent($a, $range)           ; :395
PartyMemberFilter($agent)                    ; :401
GetNearestNPCInRangeOfCoords(...)            ; :436
GetFurthestNPCInRangeOfCoords(...)           ; :464
BetterGetNearestNPCToCoords(...)             ; :493
GetHighestPriorityFoe($target, $range)       ; :521
IsAgentInRange($a, $X, $Y, $range)           ; :557
GetNearestSignpostToAgent($a, $range)        ; :564
GetNearestNPCToAgent($a, $range)             ; :570
NPCAgentFilter($a)  EnemyAgentFilter($a)     ; :576,591
GetNearestEnemyToAgent($a, $range)           ; :585
GetNearestAgentToAgent($target, $type, $range, $filter) ; :601
GetNearestItemToAgent($a, $canPickUp)        ; :625
GetNearestSignpostToCoords / NPCToCoords / EnemyToCoords ; :635,641,647
GetNearestAgentToCoords($X, $Y, $type, $filter) ; :653
GetAgentByModelID($modelID)                  ; :676
IsNPCAgentType / IsStaticAgentType / IsItemAgentType ; :688,694,700
GetEnergy($agent)  GetHealth($agent)         ; :708,717
GetIsMoving($a)  IsPlayerMoving()            ; :724,730
GetIsKnocked($a)  GetIsAttacking($a)  GetIsCasting($a) ; :737,743,753
GetIsBleeding  GetHasCondition  GetIsDead    ; :759,765,771
GetHasDeepWound  GetIsPoisoned  GetIsEnchanted ; :778,784,790
GetHasDegenHex  GetHasHex  GetHasWeaponSpell ; :796,802,808
GetIsBoss($a)                                 ; :814
CreateMobsPriorityMap()                      ; :821
```

## Utils-Storage.au3 — Inventory & loot

The big helper:

```autoit
PickUpItems($defendFunc, $shouldPickItem, $range)    ; :1566
```

The `$defendFunc` parameter is the bot's stay-alive callback while looting (Vaettirs uses `VaettirsStayAlive`). `$shouldPickItem` defaults to `DefaultShouldPickItem` which reads `conf/loot/<config>.json`.

Bag/inventory: `GetBag`, `GetItemBySlot`, `GetItemByModelID`, `CountSlots`, `InventoryManagementBeforeRun`, `InventoryManagementMidRun`, `UseConsumable($itemID)`. Salvage helpers wrap `StartSalvageWithKit`/`SalvageMaterials`/`EndSalvage` with retries.

## Utils-Debugger.au3 — Logging

```autoit
Info($msg)  Notice($msg)  Warn($msg)  Error($msg)
$LVL_INFO / $LVL_WARN / $LVL_ERROR  ; level constants
```

Prefer these over `ConsoleWrite` — they tee to the GUI log and on-disk log.
