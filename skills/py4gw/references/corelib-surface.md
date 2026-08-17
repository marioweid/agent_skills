# Py4GWCoreLib Surface Index

Quick-reference index of the `Py4GWCoreLib` modules. Use this to locate the right module before reaching for `grep` or `from Py4GWCoreLib import *`.

Authoritative source: `docs/Py4GW_Conceptual_Model.md`. This file is the working summary for "where does X live?" lookups.

## Module → Concerns Map

| Module | Owns | Use when |
|--------|------|----------|
| `Agent` | Typed-property surface for any world entity (player, NPC, enemy, chest, prop). Sub-views: `living_agent`, `item_agent`, `gadget_agent`. Callback-invalidated property cache. | Reading agent state (hp, energy, position, conditions, profession, allegiance, model id). |
| `AgentArray` | Authoritative agent collection. Pre-filtered semantic arrays (allies, enemies, neutrals, spirits, minions, NPCs/minipets, items, gadgets, dead allies/enemies). Sublayers: `Manipulation`, `Sort`, `Filter`, `Routines` (cluster detection). | Querying many agents at once; finding nearest enemy / nearest healable ally / cluster centers. |
| `Camera` | Camera state and control. | Recording angles, scripted camera moves, screenshots. |
| `CombatEvents` | Combat event hooks (damage taken / dealt, skills cast against, etc.). | Reactive bots: "trigger heal when ally takes >X damage in 2s". |
| `Context` | Game context: client mode, in-cinematic, observing, runtime flags. | Pre-flight gating: don't try to cast in a cinematic. |
| `Dialog` + `DialogCatalog` | NPC dialog tree state and lookup. | Quest pickups, faction donations, trader interactions that require dialog selection. |
| `DXOverlay` | DirectX overlay primitives (3D-world drawing). Sits on top of `Py2DRenderer`. | Drawing world-space markers (e.g. route lines, aggro circles). |
| `Effect` (`Effects`) | Buffs / hexes / conditions / environmental statuses on agents. Read-only mostly; can drop a buff from local player, set drunk visuals. | "Does the target have Empathy?" "How long is my Shadow Form remaining?" |
| `EnemyBlacklist` | Per-bot blacklist of enemy IDs (e.g. "skip this skale, it has resist hexes"). | Bot logic that needs to avoid specific enemies. |
| `GLOBAL_CACHE` (in `Py4GWcorelib.py`) | Derivative cache layer; re-exposes CoreLib state through cached getters. Also hosts `GLOBAL_CACHE.Coroutines`. | Cheap re-reads inside per-frame logic; coroutine registration. **Not** for new authoritative state. |
| `GWUI` | Generic Guild Wars UI helpers (chat, dialogs, ImGui-on-game-canvas). | Drawing on the GW window; sending chat. |
| `HotkeyManager` | Global hotkey registration. | Letting the user toggle a bot from a keybind. |
| `ImGui` | Higher-level Dear ImGui wrappers built on `PyImGui`. Contains `WindowModule` — the canonical window shell. | Any widget or bot window. |
| `IniManager` | INI file read/write helpers. | Persisting bot config without touching the platform INIs. |
| `Inventory` | Bag/storage management. Capacity, free slots, identify, salvage, equip, use, drop, destroy, pick up, storage open/check. | All bag operations. |
| `Item` | Per-item introspection: `Rarity`, `Properties`, `Type`, `Usage`, `Customization`, `Trade`. Modifier inspection. | "Is this item gold rarity?" "Does this scroll grant XP?" |
| `ItemArray` | Cross-bag item collection. Sublayers: `Filter`, `Manipulation`, `Sort`. Bag discovery helpers. | Listing all items in bags + storage; filtering for salvageables. |
| `Map` | Instance state + active travel surface. Subsurfaces: `MissionMap`, `MiniMap`, `WorldMap`, `Pathing`. | Map ID checks, travel, district/region travel, instance loaded/ready, mission state. |
| `Merchant` (a.k.a. `Trading`) | NPC trade/crafting/exchange. Subcontrollers: `Trader`, `Merchant`, `Crafter`, `Collector`. | Buying / selling / crafting / collector exchanges. |
| `Overlay` | Higher-level overlay built on `PyOverlay`. | Persistent on-screen UI that follows the game window. |
| `Party` | Party state, hero composition, hero flags, party-formation operations. | Hero management, party-wide skill use. |
| `Player` | Local-player specialization: identity, progression, targeting, movement, faction deposit, dialog, chat, whisper, fake-chat, title selection. | Anything the local controlled character does. |
| `Quest` + `quest_data` | Quest state, lookup, requirements. | Quest-driven bots (Zaishen, faction missions). |
| `Routines` (`Routines.*`) | Top of CoreLib. Reusable combat/movement/target/checks/agents helpers. Most are generator-shaped — `yield from` them. | Anything a bot does. |
| `Scanner` | Memory positioning / function resolution (links into `PyScanner`). | Internal — rarely consumed by bots. |
| `Skill` | Per-skill data: name, URL, description, type flags, scaling, costs (energy/health/adrenaline), activation/aftercast/recharge, profession, campaign. Loaded from `skill_descriptions.json`. | Skill metadata lookup. |
| `Skillbar` | Active skillbar: slots 0-8, casting status, use skill, load skill template, hero skill use, hero secondary change. | Casting skills; loading builds. |
| `SkillManager` | Higher-level skill rotation / management helpers. | Bot-side skill rotation logic. |
| `UIManager` | UI-state management (window visibility, focus, draw order). | Coordinating multiple bot/widget windows. |
| `BottingTree` + `Botting` | High-level bot harnesses. See `bot-patterns.md` and `bottingtree-and-routines.md`. | Choosing a bot style. |
| `BuildMgr` | Build template management. | Loading/saving player/hero builds. |

## Action-Queue Routing

Active operations on `Map`, `Player`, `Inventory`, `Skillbar`, and `Merchant` are routed through the action-queue infrastructure — they are **not** direct writes. This means:

- Calling `Player.Move(...)` enqueues a move; it doesn't block.
- Calling `Skillbar.UseSkill(...)` enqueues a skill use; the actual cast may happen one or more frames later.
- The bot should check **state** (`Agent.living_agent.is_casting`, `Skillbar.GetCastingSkill`) to confirm the action took, not rely on the call's return value alone.

## Snapshot Pattern (Important)

`Agent` getters maintain a callback-invalidated cache, but field reads through `DllStruct`-style accessors can still be non-trivial — and the cache can invalidate mid-frame. Snapshot once at the top of each iteration:

```python
me = Agent.GetAgentByID(Player.GetAgentID())
me_living = me.living_agent
hp = me_living.hp
max_hp = me_living.max_hp
is_alive = me_living.is_alive
# Use these locals inside the inner loop. Don't re-call Agent.GetAgentByID.
```

Re-snapshot at the **top** of each iteration of a `while` / each `yield` resume, not inside the body.

## Frequently-Needed Lookups

| What you want | Where to look |
|----------------|---------------|
| Nearest enemy in range | `Routines.Agents.GetNearestEnemy*` |
| Lowest-HP ally | `HeroAI/targeting.py` (lowest-ally selectors) — but read it for the frame-cache rules |
| All allies in range | `AgentArray.Filter.ByDistance(AgentArray.GetAllyArray(), range)` |
| Is the target hexed | `Effect.Effects.HasEffect(...)` or `Routines.Checks.*` |
| Is a skill recharged | `Skillbar.GetSkillRecharge(slot) == 0` or `Routines.Checks.Skills.IsRecharged(slot)` |
| Inventory empty slots | `Inventory.GetFreeSlots()` |
| Salvage all blues | iterate `ItemArray.Filter.ByRarity(...)` + `Inventory.Salvage(...)` |
| Travel to outpost | `Map.Travel(map_id)` then wait `Map.IsMapReady()` |
| Pathfind | `Map.Pathing.GetPath(...)` or use precomputed coord lists with `Routines.Movement.FollowPath` |
| Cast a skill | `Skillbar.UseSkill(slot)` or `Skillbar.UseSkillSlot(slot, target_id)` |
| Drop a buff | `Effect.Effects.DropBuff(skill_id)` |
| Send chat | `Player.SendChat(...)` or `Player.SendWhisper(target, message)` |

When in doubt, grep before assuming:

```bash
rg -tpy 'def IsRecharged' Py4GWCoreLib/
rg -tpy 'class WindowModule' Py4GWCoreLib/
```

## Notes on the `Py4GWCoreLib/__init__.py` Facade

The package `__init__.py` re-exports most subpackages. `from Py4GWCoreLib import *` is the bot/widget convention, but the names exposed depend on what `__init__.py` re-exports — not every CoreLib symbol is necessarily there.

Before assuming a name is exported via `*`:

```bash
rg 'from \.\w+ import' /Users/mario/Sources/Py4GW/Py4GWCoreLib/__init__.py
```

If you need a name that isn't re-exported, import it explicitly from the submodule.
