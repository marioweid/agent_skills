# Bot Patterns

Four bot styles exist in `~/Sources/Py4GW`. Each has a clear use case. Pick the one that matches the bot's complexity; don't over-engineer.

| Style | When to use | Canonical example |
|-------|-------------|-------------------|
| Sequential | Simple linear route, one happy path | `Bots/Example Bots/VaettirBot (Sequential).py`, `Boreal_Sequential.py` |
| Yield / Coroutine | Need to interleave logic with per-frame waits; non-blocking sleeps | `Bots/Example Bots/Boreal_yield.py`, `VaettirBot (yield).py`, `YAVB 1.0 by Apo (Vaettir bot).py` |
| `Botting` harness | Many handlers (stuck / loot / danger / death), step-based progression | `Bots/marks_coding_corner/DervFeatherFarm.py`, `DervCOFFarm.py` |
| `BottingTree` planner | Behavior-tree-driven; needs upkeep/service trees, structured restart | `Py4GWCoreLib/BottingTree.py` + `routines_src/BehaviourTrees.py`; see `bottingtree-and-routines.md` |

All four are valid and live alongside each other in the repo. **Do not migrate** an existing Sequential bot to BottingTree just because you can — the user's preference and the bot's complexity drive the choice.

## The Per-Frame Contract

Every Py4GW script exposes a top-level `def main()`. The Py4GW runtime calls it **every frame**.

- `main()` must return quickly. No blocking sleeps. No long synchronous IO.
- Anything that needs to span frames goes into a coroutine registered with `GLOBAL_CACHE.Coroutines`.
- Throwing from `main()` kills that script for the session — wrap risky calls.
- Returning early on uninteresting frames is normal and expected.

## Shared Skeleton

All styles share a state-container pattern:

```python
from Py4GWCoreLib import *

MODULE_NAME = 'My Bot'

class Botconfig:
    def __init__(self):
        self.is_script_running = False
        self.log_to_console = True
        self.routine_finished = False
        self.window_module = ImGui.WindowModule(
            MODULE_NAME,
            window_name=MODULE_NAME,
            window_size=(300, 300),
            window_flags=PyImGui.WindowFlags.AlwaysAutoResize,
        )

class BOTVARIABLES:
    def __init__(self):
        self.config = Botconfig()

bot_variables = BOTVARIABLES()
```

The window draw helper is also a fixture across the codebase:

```python
def DrawWindow():
    global bot_variables
    if bot_variables.config.window_module.first_run:
        PyImGui.set_next_window_size(*bot_variables.config.window_module.window_size)
        PyImGui.set_next_window_pos(*bot_variables.config.window_module.window_pos)
        bot_variables.config.window_module.first_run = False
    # ... ImGui begin/end + controls ...
```

## Style 1: Sequential

Linear function chain, one happy path. Easy to read, blocks on `sleep`.

```python
from Py4GWCoreLib import *
import time

MODULE_NAME = 'My Sequential Bot'

# ... Botconfig / BOTVARIABLES / DrawWindow as above ...

def RunBotSequentialLogic():
    # Each step blocks the per-frame tick — only safe for very short steps,
    # OR for bots that are launched manually and not expected to maintain framerate.
    LoadSkillBar()
    LeaveOutpost()
    FollowPathToFarmSpot()
    KillMobs()
    LootItems()
    ResignAndReturn()
    bot_variables.config.routine_finished = True

def main():
    DrawWindow()
    if bot_variables.config.is_script_running and not bot_variables.config.routine_finished:
        RunBotSequentialLogic()
        bot_variables.config.is_script_running = False  # one-shot launch
```

Trade-off: framerate dips while `RunBotSequentialLogic` runs. Acceptable for short flows; bad for long farms.

## Style 2: Yield / Coroutine

Generator-driven. Each `yield` returns control to the runtime; the coroutine resumes on a later frame. **This is the dominant style for non-trivial farms.**

```python
from Py4GWCoreLib import *
from typing import Generator

MODULE_NAME = 'My Yield Bot'

# ... Botconfig / BOTVARIABLES / DrawWindow as above ...

coroutines = GLOBAL_CACHE.Coroutines

def RunRoute() -> Generator:
    yield from Routines.Movement.FollowPath(path_points_to_killing_spot)
    yield from FightMobs()
    yield from Routines.Movement.FollowPath(path_points_to_chest)
    yield from LootChest()
    yield from ResignAndReturn()
    bot_variables.config.routine_finished = True

def FightMobs() -> Generator:
    while EnemiesNearby():
        UseRotationOnce()
        yield  # let the next frame happen
    yield

def main():
    DrawWindow()
    if bot_variables.config.is_script_running and not bot_variables.config.routine_finished:
        coroutines.Add(RunRoute())
        bot_variables.config.is_script_running = False
```

Rules:

- `yield from Routines.Movement.FollowPath(...)` is the canonical movement primitive — it handles path following + obstacle dodging + rubber-band recovery.
- `yield` (bare) means "give up this frame, resume next frame." Use it inside tight loops that otherwise would block.
- The `Routines` helpers (Movement, Targeting, Combat, Checks, Agents) are mostly generator-shaped — `yield from` them.
- Register only **once** per logical run with `coroutines.Add(...)`. The flag flip prevents re-adding.

## Style 3: `Botting` harness

Used in `Bots/marks_coding_corner/` farms. The `Py4GWCoreLib.Botting` class provides a state-machine-ish runner with named handlers (`handle_stuck`, `handle_loot`, `handle_sensali_danger`, `on_death`) and step-based progression.

```python
from Py4GWCoreLib import *

HANDLE_STUCK = 'handle_stuck'
HANDLE_LOOT = 'handle_loot'

bot = Botting(name='Feather Farmer')

bot.register_handler(HANDLE_STUCK, handle_stuck)
bot.register_handler(HANDLE_LOOT, handle_loot)
bot.set_on_death(on_death)

bot.add_step(load_skill_bar)
bot.add_step(travel_to_farm_spot)
bot.add_step(farm_loop)
bot.add_step(return_to_outpost)

def main():
    bot.tick()  # advances the current step / runs handlers / draws UI
```

Use when:

- The farm has **many** orthogonal concerns (loot, danger detection, stuck recovery, death handling) that each want their own callback.
- You want named "force-reset" entry points for the user to trigger from the UI.
- The bot ships its own widget UI integrated with the harness.

Read existing examples in `Bots/marks_coding_corner/` before authoring a new `Botting`-based farm — the harness has conventions that aren't obvious from the class surface alone.

## Style 4: `BottingTree` planner

Behavior-tree-driven. Highest ceiling; highest authoring cost. See `bottingtree-and-routines.md` for the full pattern.

Use when:

- The bot needs **upkeep/service trees** (background tasks that fire on conditions: low energy → maintain enchantment, low health → trigger heal).
- You want a metadata-driven future configurator UI.
- The bot has many possible plans (kill / loot / merch / return / vanquish) and chooses among them.

## Path Coordinates

Coordinates come from `Examples/Coord_Logger.py` or from in-game coordinate widgets. Ask the user to paste the list; don't fabricate. Standard format:

```python
path_points_to_killing_spot: List[Tuple[float, float]] = [
    (12890, -16450),
    (12920, -17032),
    (12847, -17136),
    # ...
]
```

The natural movement primitive is `Routines.Movement.FollowPath(path_points, tolerance=50)` — it handles per-point arrival.

## Window UI Discipline

- `ImGui.WindowModule` is the standard window shell — use it.
- First-frame setup goes inside the `window_module.first_run` guard.
- `PyImGui.set_next_window_size` and `set_next_window_pos` are the right primitives for explicit placement; they go inside the first-run block.
- Don't draw windows from inside coroutines — coroutines run independently of the draw cycle. The draw belongs in `main()`.

## Logging

```python
Py4GW.Console.Log(MODULE_NAME, 'Routine finished', Py4GW.Console.MessageType.Notice)
# Levels: Notice, Warning, Error, Info, Success, Debug (check Py4GW.Console.MessageType enum)
```

Or via the `ConsoleLog` wrapper from `Py4GWCoreLib`:

```python
ConsoleLog(MODULE_NAME, 'Routine finished')  # Notice level by default
```

Console output is the only feedback channel for headless scripts. Don't `print()` — the `sys.stdout` redirect in `Py4GWCoreLib/__init__.py` makes that go to the console too, but skipping the structured logger costs you the module-name prefix and the level filter.

## Choosing a Folder

| Folder | Use when |
|--------|----------|
| `Bots/<Category>/` | "Official" example bots and challenge bots. Read-mostly for non-maintainers. |
| `Bots/marks_coding_corner/` | Mark's farm collection. Don't add unrelated bots here. |
| `Sources/<your-name>/` | Personal / contributor bot collections. The natural home for new bots that aren't part of a curated set. |
| `Examples/` | Small demos of a single API surface. Not full farms. |
| `Widgets/Automation/Bots/` | Bots delivered as widgets (loaded by Widget Manager). |
| `Widgets/Automation/modularbot/` | ModularBot wrappers. Note: the real implementation is in `Sources/modular_bot/`; this folder just exposes it. |

Ask the user where they want the bot to live before writing it.
