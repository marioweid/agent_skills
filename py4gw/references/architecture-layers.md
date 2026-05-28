# Architecture Layers

This is the operating model for `~/Sources/Py4GW`. It is condensed from `docs/Py4GW_Conceptual_Model.md` (canonical), `AGENTS.md` (root, operator-facing), and the actual import topology of `Py4GWCoreLib/__init__.py`.

When deciding where new code belongs, place it at the **lowest layer that doesn't introduce a circular import**, and respect the migration direction: pure-Python `native_src` is preferred over C++-bound primitives whenever both exist.

## Layer Stack (top is highest)

```
+----------------------------------------------------------------------+
| Bots, Sources, Widgets/Automation, Examples (user-facing scripts)    |
+----------------------------------------------------------------------+
| HeroAI (combat / targeting / follow / interrupt / hex_removal),      |
| ModularBot (Sources/modular_bot), Bot_Factory (root),                |
| Widget Manager + WidgetCatalog (Py4GWCoreLib/py4gwcorelib_src)       |
+----------------------------------------------------------------------+
| Routines / routines_src (BehaviourTrees, Agents, Movement, Checks,   |
| Targeting, Combat), BottingTree, Botting harness                     |
+----------------------------------------------------------------------+
| GLOBAL_CACHE (derivative consumer/cache layer)                       |
+----------------------------------------------------------------------+
| Py4GWCoreLib source-of-truth modules:                                |
|   Agent, AgentArray, Camera, CombatEvents, Context, DXOverlay,       |
|   Effect, ImGui, Inventory, Item, ItemArray, Map, Merchant, Overlay, |
|   Party, Player, Quest, Skill, Skillbar, UIManager, ...              |
+----------------------------------------------------------------------+
| Foundational primitives:                                             |
|   stubs/ (forward decls of C++-bound surface)                        |
|   Py4GWCoreLib/native_src (pure-Python native callers)               |
|   PyScanner, PyPointers, PyCallback, Py4GW (system surface),         |
|   PyPathing, PyKeystroke, PyTrading, Py2DRenderer, PyOverlay,        |
|   PyImGui                                                            |
+----------------------------------------------------------------------+
| Gw.exe (true origin of all runtime data)                             |
+----------------------------------------------------------------------+
```

## Rules

### `Py4GWCoreLib` is the single Python-facing source-of-truth layer

- Game data flows into `Py4GWCoreLib` from the primitives and becomes the project's authoritative Python surface (`Agent`, `Map`, `Player`, …).
- `GLOBAL_CACHE` is a **derivative cache**, not a parallel authority. Don't add new authoritative state to `GLOBAL_CACHE` — add it to the appropriate CoreLib module and let `GLOBAL_CACHE` re-expose it if needed.
- Higher layers (`Routines`, `HeroAI`, `Widgets`) should import from `Py4GWCoreLib`, not from `stubs` / `native_src` directly. Use the lower layers only when you genuinely need a primitive that CoreLib doesn't surface — and consider whether to add the surface to CoreLib instead.

### `Py4GWCoreLib/__init__.py` is a heavy facade

- It manually appends to `sys.path` (`site-packages`) and redirects `sys.stdout` / `sys.stderr` into the Py4GW console.
- It re-exports most subpackages so user scripts can do `from Py4GWCoreLib import *`. This is convenient for bots; it is **not** safe for startup-sensitive or import-cycle-sensitive modules.
- In startup-critical files (e.g. `Py4GWCoreLib/GlobalCache/SharedMemory.py`, which currently imports `HeroAI.follow.leader_publish` directly), **keep imports narrow** — broadening to the package root will introduce side effects and import order issues.

### Native vs C++-bound primitives

- Both `Py4GWCoreLib/native_src` (pure Python) and the C++ binding-backed primitives represent the same conceptual layer.
- The project is migrating **away from C++-backed sources toward `native_src`**. When both exist for the same domain, prefer `native_src` for new code.
- For UI primitives specifically, `PyImGui` (under stubs) is the source-of-truth interface. `ImGui_Py` is **legacy** — do not reference it in new work.

### UI layer split

```
PyImGui (primitive, immediate-mode)   <- stubs/
  ↓
ImGui, DXOverlay, Overlay, UIManager  <- Py4GWCoreLib (higher-level wrappers)
  ↓
ImGui.WindowModule (the canonical bot/widget window shell)
```

When writing a window, use `ImGui.WindowModule` (the CoreLib wrapper), not raw `PyImGui` calls at the top level. Raw `PyImGui` is for draw-list internals.

### `Map` is both state and active surface

- Passive: instance type (outpost / explorable / loading), map ID, region, district, vanquish kill counters, mission state.
- Active: travel, district / region travel, guild hall travel, cinematic skipping, challenge enter/cancel. These routes go through the action-queue infrastructure inside `Map`.
- Subsurfaces inside `Map`: `MissionMap`, `MiniMap`, `WorldMap`, `Pathing`.

### `Agent` is typed-property-cached

- Generic agent → typed views: `living_agent`, `item_agent`, `gadget_agent`.
- `Agent` maintains a callback-invalidated property cache. Snapshot once and read fields off the snapshot inside a loop.
- The classification rule for anything in the 3D world: **not terrain and not scenery → it's an agent.** Players, NPCs, enemies, chests, props.

### `AgentArray` is the classified collection layer

- Pre-filtered semantic arrays: allies, enemies, neutrals, spirits/pets, minions, NPC/minipets, items, owned items, gadgets, dead allies, dead enemies.
- Sublayers: `Manipulation` (set ops), `Sort`, `Filter`, `Routines` (cluster detection helpers).
- Use the pre-filtered arrays before reaching for the raw array + manual filter.

### `Player` is local-player specialization + action surface

- Identity (player number, login number, party index, account name, UUID).
- Progression (experience, level, morale, rank, titles).
- Actions (target, move, deposit faction, dialog, chat, whisper, fake-chat). Routed through the action queue — `Player` is not just state.

### `Skillbar` is the active combat-loadout execution layer

- State: slots 0-8, casting status, hovered skill, disabled state, owning agent.
- Active: use skill, targetless use, hero skill use, load player template, load hero template, change hero secondary.
- Account-progression: unlocked / learnt checks.

### `Skill` combines runtime data + static metadata

- Runtime: bound skill data from the game.
- Static: project-side description metadata from `skill_descriptions.json`.
- Together: names, descriptions, scaling, costs, timings, type flags (elite, spell, stance, etc.).

### `Inventory` is both state and workflow

- State: capacity, free slots, zero-filled storage maps.
- Workflow actions: identify, salvage, equip, use, drop, destroy, storage open/check, accept salvage-material dialogs, pick up items.

### `Item` and `ItemArray` mirror `Agent` and `AgentArray`

- `Item`: per-item introspection (`Rarity`, `Properties`, `Type`, `Usage`, `Customization`, `Trade`).
- `ItemArray`: cross-bag collection, `Filter` / `Manipulation` / `Sort` sublayers.

### `Effect` is the active-effect / buff inspection layer

- Read: buff lists, effect lists per agent, counts, existence checks by skill ID, combined `has effect`, remaining duration.
- Limited active: drop / remove a buff from the local player, drunk visuals, alcohol level reads.

## Architectural Rules of Thumb

1. **Lowest non-cyclic layer.** New helper → place in the lowest CoreLib module it logically fits in, not in `Routines`.
2. **Prefer `native_src` for new primitives.** Don't add new C++ bindings unless you must.
3. **`GLOBAL_CACHE` re-exposes, doesn't author.** New state belongs in a CoreLib module.
4. **`Py4GWCoreLib` re-exports for user scripts, not for itself.** Inside the library, import from specific submodules.
5. **HeroAI is a consumer, not a primitive.** It depends on CoreLib + Routines; CoreLib must not depend on HeroAI (the `SharedMemory` → `leader_publish` import is the documented exception and must stay narrow).
6. **Widgets are top-of-stack.** They depend on everything below; nothing depends on them.
7. **Bots / Sources / Examples are leaves.** They consume; they are not consumed.

## Cross-References

- `docs/Py4GW_Conceptual_Model.md` — canonical, full model.
- `docs/Py4GW_Model_Features_Detail.txt` — flat text export of the same content, useful for grepping.
- `docs/MCP_bridge.md` — bridge/MCP planning (orthogonal to the layer model; covers bridge daemon + MCP adapter only).
- `AGENTS.md` (repo root) — operator-facing summary + gotchas.
- `FOLLOW_REFACTOR_HANDOVER.md` — required reading before touching `HeroAI/follow/`.
