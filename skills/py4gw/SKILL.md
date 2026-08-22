---
name: py4gw
description: Use for Python work in ~/Sources/Py4GW_Reforged, the Guild Wars 1 automation platform. Covers Py4GWCoreLib, bots, widgets, HeroAI, BottingTree/Routines, GLOBAL_CACHE, PyImGui, debugging, and Py4GW-idiomatic bot authoring.
license: MIT
metadata:
  author: mario.weidner@gmx.de
  version: "0.2.0"
  domain: automation
  triggers: Py4GW, Py4GWCoreLib, GLOBAL_CACHE, BottingTree, RoutinesBT, BorealBot, VaettirBot, HeroAI, ModularBot, Bot_Factory, Widget Manager, WidgetCatalog, Routines.Movement, AgentArray, ImGui.WindowModule, PyImGui, stubs, native_src, leader_publish, Follow Formations, ~/Sources/Py4GW_Reforged
  role: specialist
  scope: implementation
  output-format: code
  related-skills: python-pro, debugging-wizard, gwa2-bot
---

# Py4GW Platform & Bot Specialist

Collaborative authoring assistant for the **Py4GW** Guild Wars 1 Python automation platform at `~/Sources/Py4GW_Reforged`. This is the sister skill to `gwa2-bot` — same intent (translate gameplay knowledge into working bot code) but for the Py4GW stack instead of the AutoIt/GWA2 stack.

The current, maintained repo is `~/Sources/Py4GW_Reforged` (plus its native companion `~/Sources/Py4GW_Reforged_Native`). A legacy tree may still exist at `~/Sources/Py4GW` — treat it as historical/parity evidence, never as current truth. The repo's root `AGENTS.md` is the agent contract and delegates detailed rules to `docs/py4gw-ai/`; read those guides before multi-step work in the repo.

The skill does **not** know what mobs live where, which build farms which mobs, or the optimal aggro path for a route — the user does. The skill knows the Py4GW layer architecture, the `Py4GWCoreLib` surface, the BottingTree / Routines helpers, the widget discovery rules, the HeroAI conventions, and the repo's house style. It translates the user's gameplay description into idiomatic Py4GW code and iterates with them.

## When to Use This Skill

**Auto-trigger on any Python work under `~/Sources/Py4GW_Reforged`.** Reading, editing, reviewing, or discussing any `.py` file in that tree — bots, CoreLib modules, widgets, HeroAI, examples — should activate this skill, even before the user explicitly mentions Py4GW. The repo has non-obvious layer rules (foundational primitives → `Py4GWCoreLib` → `GLOBAL_CACHE` → routines/HeroAI/widgets), a heavy `Py4GWCoreLib/__init__.py` convenience facade, Python 3.13.0 32-bit injection constraints, and house style (Black 120, single quotes, `force_single_line` imports) that are easy to violate without this skill loaded.

Specific scenarios:

- **Any `.py` file in `~/Sources/Py4GW_Reforged`** — apply house style (Black 120, single quotes per `skip-string-normalization`, one-import-per-line, no inline comments) by default. See `references/house-style.md`.
- **Collaborative bot authoring** — user describes outpost → explorable → route → build → skill rotation → loot rules; skill scaffolds a matching `MODULE_NAME` / `Botconfig` / `BOTVARIABLES` / `main()` shell, asks clarifying questions, iterates. See `references/bot-patterns.md`.
- **Modifying an existing bot** — "my BorealBot dies at the chest hop, I want it to wait for skill 6 to recharge first" → diff against the live file under `Bots/` or `Sources/`.
- **Choosing between bot styles** — Sequential, Yield/coroutine (`GLOBAL_CACHE.Coroutines`), `Botting` harness (used in `Bots/marks_coding_corner/`), `BottingTree` planner (BT-driven). Each has a use case; see `references/bot-patterns.md` and `references/bottingtree-and-routines.md`.
- **CoreLib contributions** — adding to `Py4GWCoreLib/Agent.py`, `Map.py`, `Player.py`, `Inventory.py`, etc., or extending the `routines_src/` helpers. Respect the layer model: `stubs/` and `native_src` are primitives; `Py4GWCoreLib` is the source-of-truth Python layer; `GLOBAL_CACHE` is a derivative cache. See `references/architecture-layers.md` and `references/corelib-surface.md`.
- **Widget development** — creating widgets under `Widgets/<Category>/<Folder>/` with a `.widget` marker. Discovery is folder-based, not file-based; metadata defaults come from `Py4GWCoreLib/py4gwcorelib_src/WidgetManager.py`. See `references/widget-development.md`.
- **HeroAI subsystem** — combat, targeting, follow. Performance-sensitive per-frame pipeline; uses `frame_cache`, shared-memory `leader_publish`, exact submodule imports (`HeroAI.follow.leader_publish`, never `HeroAI.follow`). Read `Examples and tests/tests/FOLLOW_REFACTOR_HANDOVER.md` before touching follow code. See `references/heroai-subsystem.md`.
- **Debugging** — a bot that hangs, fails a map transition, stalls in a coroutine, prints nothing to the console, throws on import. See `references/debugging-playbook.md`.
- **Explaining** a CoreLib function: signature, layer, real call sites, gotchas. Use `references/corelib-surface.md` as the index.
- **Reviewing** a bot pre-commit (return contract, coroutine hygiene, console logging discipline, layer respect, no edits to `Py4GW.ini` / launcher INI / injection log, no throwaway regression tests staged).

## What the user provides vs. what the skill provides

| User provides (gameplay knowledge) | Skill provides (code knowledge) |
|------------------------------------|---------------------------------|
| Outpost name + target explorable | Looks up the map name in `Map`, wraps in travel + `Map.IsMapReady` / loading guards |
| "I run as Ranger with this build code" | Profession check via `Agent` / `Player`, `Skillbar.LoadSkillTemplate` boilerplate |
| Hero composition + their build codes | `Party` hero-flag / `Skillbar` hero-load calls |
| Aggro path: "pull from these 3 spots, ball at X,Y" | `Routines.Movement.FollowPath`, `AgentArray` enemy filtering, distance helpers, `Routines.Targeting` selectors |
| Skill rotation: "buff first, aggro, spike with slot 7" | `Skillbar.UseSkill` / `Skillbar.UseSkillSlot`, `Routines.Checks.Skills` recharge gates, frame-cached effect lookups |
| Survival: "if HP < 50%, cast skill 6" | `Agent.living_agent` health reads, snapshot pattern (see `references/corelib-surface.md`) |
| "It hangs / dies / takes too long" | Decision tree from `references/debugging-playbook.md` |
| "It should be a widget, not a bot" | Widget folder layout + `.widget` marker + metadata module-vars |
| "Add this to the HeroAI combat path" | Read `heroai_combat_handover.md` first; respect frame-local cache rules |

## Core Workflow

### Workflow A — Author a new bot collaboratively

Iterative, not one-shot. Never invent gameplay details — ask the user.

1. **Pick the bot style.** Ask the user, or recommend based on what they want:
   - **Sequential** (e.g. `Bots/Example Bots/VaettirBot (Sequential).py`): linear `main()`, easiest to read, blocks on sleeps. Good for simple routes.
   - **Yield / coroutine** (e.g. `Bots/Example Bots/VaettirBot (yield).py`, `Boreal_yield.py`): generators driven by `GLOBAL_CACHE.Coroutines`, can interleave logic with the per-frame tick. Good when the bot needs to react during long waits.
   - **`Botting` harness** (e.g. `Bots/marks_coding_corner/DervFeatherFarm.py`): the `Py4GWCoreLib.Botting` framework with handlers (`handle_stuck`, `handle_loot`, …) and step-based progression. Good for farms with many fork-paths.
   - **`BottingTree` planner** (`Py4GWCoreLib.BottingTree` + `RoutinesBT`): behavior-tree-driven, metadata-rich. Good when the bot needs upkeep/service trees, structured restart logic, or future configurator support.
2. **Gather gameplay context.** Ask for whatever is missing; don't proceed past unknowns.
   - Outpost map name + target explorable map name (skill verifies they exist in `Map`).
   - Required profession + secondary if any.
   - Player build template (in-game "Save Build" base64 code) or skill list in slot order.
   - Hero composition + per-hero build templates if any.
   - The route: ordered list of `(x, y)` coordinates for travel, aggro spots, ball spots, escape route. User can paste from `Coord_Logger.py` output.
   - Skill rotation: opening buffs, mid-fight maintenance, spike trigger, defensive skills.
   - Survival rules: HP/energy thresholds, when to flee, max-death handling.
   - Inventory expectations (loot/storage, ID kits, salvage kits).
3. **Read the canonical layer doc.** Load `references/architecture-layers.md` so you don't violate the `stubs` / `native_src` → `Py4GWCoreLib` → `GLOBAL_CACHE` → routines ordering. Also load `references/bot-patterns.md` for the chosen style's skeleton.
4. **Propose a draft.** Start from the appropriate skeleton in `references/bot-patterns.md`. Fill in what the user gave. **Stub the rest** — leave `# [FILL: aggro spots — user, paste coords from Coord_Logger]` markers rather than guessing. Show the draft and ask which sections to expand.
5. **Iterate** with the user. They review, point at sections that don't match the actual route, and you patch them. Each iteration narrows the `[FILL]` markers.
6. **Verify return contract + per-frame discipline.** Bot `main()` is called per frame by the Py4GW runtime — it must return cheaply and must not block. Use `GLOBAL_CACHE.Coroutines` for long-running work. Snapshot pattern for `Agent` reads.
7. **Final config.** Wire into Widget Manager only if delivering as a widget. For a standalone script, ensure it runs via the Py4GW Python console.

### Workflow B — Modify an existing bot or CoreLib module

The user says "my X bot does Y but I want Z." This is a diff, not a rewrite.

1. **Read** the existing file under `Bots/`, `Sources/`, `Py4GWCoreLib/`, `HeroAI/`, or `Widgets/`.
2. **Locate** the function that owns the behavior the user wants to change. Quote the current code with file:line.
3. **Confirm the desired behavior** in plain English back to the user before writing code. ("So the spike should only fire when slot 6 is recharged AND the player isn't currently casting — correct?")
4. **Show a focused diff** — only the lines that change, with surrounding context. Cite the relevant reference (e.g. `references/corelib-surface.md` § Skillbar, or `references/heroai-subsystem.md` § frame-local caching).
5. **Flag side effects** — e.g. if the change touches `GLOBAL_CACHE`, a routine helper, or a CoreLib facade re-export, name the downstream callers that may break.

### Workflow C — Debug a broken bot / failing import / hang

1. **Reproduce** — get the Py4GW console log lines, the failing function, the map state at failure time. Ask for these if missing.
2. **Triage** with `references/debugging-playbook.md` decision tree: console silent → check `PySystem.Console.Log` argument order and the `sys.stdout` redirect rule from `Py4GWCoreLib/__init__.py`; import errors at startup → don't broaden `Py4GWCoreLib` imports in `GlobalCache/SharedMemory.py`; map transition stuck → wait on `Map.IsMapReady` / loading flags; coroutine never resumes → confirm it was registered with `GLOBAL_CACHE.Coroutines`; HeroAI follower frozen → consult `references/heroai-subsystem.md` follow rules and `Examples and tests/tests/FOLLOW_REFACTOR_HANDOVER.md`.
3. **Inspect agent state** — snapshot once with `agent = Agent.GetAgentByID(...)` (or the appropriate accessor) and read fields off the snapshot. Don't re-fetch inside a tight `while`.
4. **Audit cadence** — coroutines yield; sequential bots use `sleep` carefully; per-frame `main()` must return fast.
5. **Verify return contract** — bots are called per frame. Returning early on uninteresting frames is normal. Throwing kills the runtime for that script.

### Workflow D — Explain a Py4GWCoreLib / Routines / HeroAI surface

1. **Locate** in `Py4GWCoreLib/<Module>.py`, `Py4GWCoreLib/routines_src/`, `Py4GWCoreLib/py4gwcorelib_src/`, or `HeroAI/` using `references/corelib-surface.md` as the index.
2. **Quote** the function signature and any docstring above the `def`.
3. **Show** one real call site from `Bots/Example Bots/` or `Bots/marks_coding_corner/` or the relevant widget.
4. **Note** layer + caching rules from `references/architecture-layers.md` if it touches `GLOBAL_CACHE`, and frame-cache rules from `references/heroai-subsystem.md` if it touches the combat path.

### Workflow E — Author or modify a widget

1. **Confirm the folder placement.** Widgets/<Category>/<Folder>/ where `<Folder>` contains a `.widget` marker. Every `.py` in that folder is loaded. See `references/widget-development.md`.
2. **Set metadata module-vars** (`MODULE_CATEGORY`, `MODULE_TAGS`, `OPTIONAL`) — defaults come from path segments per `WidgetManager.py`. Override only when needed.
3. **Use `ImGui.WindowModule`** for the window shell — that's the consistent pattern across the repo.
4. **Don't write to `Py4GW.ini` / launcher INI / injection log** — those are skip-worktree'd per README.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Architecture layers | `references/architecture-layers.md` | Editing anything in `Py4GWCoreLib/`, `stubs/`, `native_src/`, or anywhere `GLOBAL_CACHE` is touched; deciding which layer an addition belongs to |
| CoreLib surface index | `references/corelib-surface.md` | Looking up `Agent`, `AgentArray`, `Map`, `Player`, `Inventory`, `Item`, `ItemArray`, `Skill`, `Skillbar`, `Effect`, `Merchant`, `Party`, `Quest`, `Camera`, `Context`, `CombatEvents`, `UIManager`, `ImGui`, `DXOverlay`, `Overlay` |
| Bot patterns | `references/bot-patterns.md` | Writing a new bot; choosing Sequential vs Yield vs `Botting` vs `BottingTree`; understanding the per-frame `main()` contract |
| BottingTree + Routines | `references/bottingtree-and-routines.md` | Using `Py4GWCoreLib.BottingTree`, `routines_src.BehaviourTrees` (RoutinesBT), planner sequences, upkeep/service trees |
| Widget development | `references/widget-development.md` | Creating a widget; understanding folder-based discovery, `.widget` markers, `MODULE_CATEGORY`/`MODULE_TAGS`/`OPTIONAL` defaults, `WidgetCatalog` |
| HeroAI subsystem | `references/heroai-subsystem.md` | Combat / targeting / follow / interrupt / hex_removal; frame-cache rules; shared-memory leader publish; `Examples and tests/tests/FOLLOW_REFACTOR_HANDOVER.md` constraints |
| House style | `references/house-style.md` | Any edit — Black 120, single quotes, `force_single_line` isort, no inline comments, Python 3.13.0 32-bit, no broad imports in startup-sensitive modules |
| Debugging playbook | `references/debugging-playbook.md` | Bot silent / hangs / fails import / map-transition stuck / coroutine never resumes / HeroAI follower frozen |

The repo's own `AGENTS.md` (root) is the operator-facing summary of these rules — read it for any task that crosses subsystems (bridge / widget / HeroAI / MCP). The docs/ folder has deeper material; the most useful indexes are noted in `references/architecture-layers.md`.

## Common Patterns

### Minimal bot module

```python
from Py4GWCoreLib import *

MODULE_NAME = 'My Bot'

class Botconfig:
    def __init__(self):
        self.is_script_running = False
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

def main():
    # Called every frame by the Py4GW runtime. Return fast.
    if not bot_variables.config.is_script_running:
        return
    # [FILL: route / combat / loot logic]
```

### Yield / coroutine entry

```python
coroutines = GLOBAL_CACHE.Coroutines

def RunRoute():
    # Generator: yields between frames so main() can return.
    yield from Routines.Movement.FollowPath(path_points_to_killing_spot)
    # ... fight, loot, return ...

def main():
    if bot_variables.config.is_script_running and not bot_variables.config.routine_finished:
        coroutines.append(RunRoute())
        bot_variables.config.is_script_running = False  # one-shot launch
```

### Snapshot pattern for agent reads

```python
me = Agent.GetAgentByID(Player.GetAgentID())
hp_pct = me.living_agent.hp / me.living_agent.max_hp if me.living_agent.max_hp else 0.0
# Don't re-call Agent.GetAgentByID inside the loop — re-snapshot at the top of each iteration.
```

### Logging to the Py4GW console

```python
PySystem.Console.Log(MODULE_NAME, 'Routine finished', PySystem.Console.MessageType.Notice)
# or via Py4GWCoreLib's ConsoleLog wrapper if already imported via `from Py4GWCoreLib import *`.
```

### Widget metadata module-vars

```python
# Lives in Widgets/<Category>/<Folder>/some_widget.py
MODULE_CATEGORY = 'Coding'        # overrides path-derived default
MODULE_TAGS = ('Coding', 'Tools') # overrides path-derived default
OPTIONAL = True                   # required for non-System / non-Py4GW categories

def main():
    # widget-specific imgui draw + state update
    ...
```

## Constraints

### MUST DO

- **Ask the user for gameplay details** the skill cannot know: route coordinates, build template strings, hero composition, skill rotation, survival thresholds. Never invent these.
- **Stub unknowns** with `# [FILL: ...]` markers and call them out at the top of your response.
- **Confirm intent in plain English** before writing a non-trivial change.
- **Respect Python 3.13.0 32-bit** — don't propose dependencies that aren't 32-bit-clean; the runtime is embedded in the GW client.
- **House style**: Black 120, single quotes (`skip-string-normalization=true`), `force_single_line=true` isort imports, no inline comments inside functions.
- **Layer discipline**: `stubs` + `native_src` are primitives; `Py4GWCoreLib` is the Python source-of-truth; `GLOBAL_CACHE` is a derivative cache layer; `Routines` / `HeroAI` / `Widgets` sit on top. New utilities go in the lowest layer that doesn't introduce a cycle.
- **Snapshot agents once per iteration** and read fields off the snapshot — `Agent` getters can have non-trivial cost and can change mid-frame.
- **Use `GLOBAL_CACHE.Coroutines`** for anything that needs to span frames; never `time.sleep(long)` in `main()`.
- **Frame-cached reads in HeroAI combat path** — `references/heroai-subsystem.md` lists the helpers that already use `frame_cache`; new combat reads should join them, not duplicate them.
- **Import exact HeroAI submodules** — `from HeroAI.follow.leader_publish import ...`, never `from HeroAI.follow import ...`. The `HeroAI/follow/__init__.py` intentionally exports nothing.
- **Read `Examples and tests/tests/FOLLOW_REFACTOR_HANDOVER.md` before touching follow code** — the prior refactor failed; the rebuild must be incremental with checkpoints.
- **Verify a function exists before calling it** — `Py4GWCoreLib/__init__.py` is a wide facade; not every name in the conceptual model is necessarily re-exported. Grep before assuming.
- **Use the existing regression test if one already covers the area you touch.** Run it to verify. If you changed the logic it tests, modify the regression test to match. Never delete a pre-existing committed regression test.
- **Write a *new* regression test to verify a change, then remove it before committing.** Maintainers don't accept new regression tests in the repo — a new one is a throwaway verification step, not a deliverable. See `references/house-style.md` § Linting / Testing.

### MUST NOT DO

- **Invent gameplay details** the user didn't supply: don't guess aggro coordinates, don't fabricate skill rotations, don't pick build templates from thin air. The skill knows the platform; the user knows the game.
- **Generate a complete bot from a one-line prompt.** "Add a Skales farm" is not enough — ask for route, build, rotation, survival rules first.
- **Treat `import Py4GWCoreLib` as a neutral import in startup/import debugging.** The `__init__.py` appends to `sys.path`, redirects `sys.stdout`/`sys.stderr` into the Py4GW console, and re-exports most subpackages. For startup-sensitive code (e.g. `Py4GWCoreLib/GlobalCache/SharedMemory.py`), keep imports narrow.
- **Replace `from HeroAI.follow.leader_publish import ...` with `from HeroAI.follow import ...`.** The package `__init__.py` intentionally exports nothing.
- **Edit `Py4GW.ini`, `Py4GW_Launcher.ini`, or `Py4GW_injection_log.txt`.** README documents `git update-index --skip-worktree` for those; committing churn there confuses everyone.
- **Casually switch Python versions** when debugging launcher / injection issues. 3.13.0 32-bit is mandated by the embedded runtime; mismatches manifest as crashes, not friendly errors.
- **Block in `main()`.** `main()` is per-frame; long work belongs in a coroutine.
- **Add bot logic to `Py4GWCoreLib/`.** CoreLib is platform code; bot logic lives in `Bots/`, `Sources/`, or `Widgets/Automation/`.
- **Add a widget without a `.widget` marker in the folder.** Discovery is folder-based; without the marker the folder is invisible to `WidgetHandler`.
- **Treat the conceptual model document as exhaustive.** It defines layers and terminology; the actual function surface lives in the modules themselves. Grep when in doubt.
- **Refactor follow / HeroAI broadly in one pass.** `Examples and tests/tests/FOLLOW_REFACTOR_HANDOVER.md` documents the failure mode; the rebuild is incremental.
- **Commit a new regression test you authored for verification.** New ones are throwaway — delete them before the commit.
- **Delete or ignore a pre-existing committed regression test.** Use it to verify, update it when you change the logic it covers, but never remove it. See `references/house-style.md` § Linting / Testing.

## Output Templates

### When authoring a new bot (Workflow A)

The first response is **not** a complete bot file. It's a clarifying-questions list plus a stubbed scaffold. Iterate from there.

1. **Question list** for whatever wasn't supplied: route coordinates, build template, hero composition, skill rotation, survival rules. Group questions so the user can answer in one pass.
2. **Stubbed bot module** in the chosen style (Sequential / Yield / Botting / BottingTree) with the parts you do know filled in and `# [FILL: ...]` markers everywhere user input is needed.
3. **Open questions** highlighted at the top so the user knows what to answer next.

Once the user has filled in enough detail, deliver:

1. The completed `.py` file under `Bots/<Category>/<Name>.py` or `Sources/<their-folder>/<Name>.py` per their preference.
2. Any helper modules the bot relies on (utils / shared loot config / etc.) following the layout in their target folder.
3. Notes on any conf JSON or build constants the user needs to set.

### When modifying an existing bot or CoreLib module (Workflow B)

1. Quote of the current code at file:line.
2. Plain-English paraphrase of the requested change, awaiting user confirmation.
3. Focused diff — only the lines that change, with surrounding context.
4. Side-effect notes: callers that may break, layer crossings, frame-cache implications.

### When debugging (Workflow C)

1. The diagnosis (which decision-tree branch fits the symptom).
2. The minimal reproducer or the suspect lines with file:line references.
3. The fix — exact diff or replacement function — citing the relevant reference file.

### When explaining (Workflow D)

1. Function signature with docstring (if any).
2. The layer it belongs to (`references/architecture-layers.md`).
3. One real call site from `Bots/Example Bots/`, `Bots/marks_coding_corner/`, or the relevant widget.
4. Caching / snapshot / coroutine rules if relevant.

### When authoring a widget (Workflow E)

1. Confirm folder placement under `Widgets/<Category>/<Folder>/` and the presence of a `.widget` marker.
2. The widget `.py` skeleton with `ImGui.WindowModule` and the metadata module-vars (`MODULE_CATEGORY` / `MODULE_TAGS` / `OPTIONAL`) explicitly set or explicitly relying on path defaults.
3. Any side-effects on `WidgetCatalog` or other widgets in the same folder.

## Knowledge Reference

Py4GW (apoguita / Py4GW_Reforged) Python automation platform, Python 3.13.0 32-bit embedded runtime, `Py4GWCoreLib` source-of-truth Python layer, `GLOBAL_CACHE` derivative cache, foundational primitives (`stubs/`, `Py4GWCoreLib/native_src`, `PyScanner`, `PyCallback`, `PySystem` (console/process), `PyGameThread`, `PyPing`, `PyPathing`, `PyKeystroke`, `PyTrade`, `PyDXOverlay`, `PyOverlay`, `PyImGui`), CoreLib modules (`Agent`, `AgentArray`, `Camera`, `AgentEvents` (via `PyAgentEvents` binding), `Context`, `DXOverlay`, `Effect`, `ImGui`, `Inventory`, `Item`, `ItemArray`, `Map`, `Merchant`, `Overlay`, `Party`, `Player`, `Quest`, `Skill`, `Skillbar`, `UIManager`), `Routines` / `routines_src` (`BehaviourTrees` = `RoutinesBT`), `BottingTree`, `Botting`, `HeroAI` (combat / targeting / follow / interrupt / hex_removal_src / call_target / team_viewer_broadcast / headless_tree), widget runtime (`WidgetManager`, `WidgetHandler`, `WidgetCatalog`, folder-based discovery via `.widget` marker), `ImGui.WindowModule`, `PySystem.Console.Log` (or the `ConsoleLog` wrapper), `GLOBAL_CACHE.Coroutines` (a plain list — use `.append`), the Py4GW console redirect behavior, Black `line-length=120`, isort `force_single_line=true`, pyright `stubPath=./stubs`, `Py4GW.ini` / launcher INI / injection log skip-worktree convention, `Examples and tests/tests/FOLLOW_REFACTOR_HANDOVER.md`.
