# Debugging Playbook

Decision tree for common Py4GW failure modes. Each branch ends with the file/reference to read next.

## Symptom: Script does nothing visible after launching

1. **Did `main()` register?** The Py4GW runtime discovers scripts by importing them. If import threw, the script never gets ticked.
   - Check the Py4GW console for import errors at the time of launch.
   - Try importing the file from the Py4GW console manually.

2. **Is `main()` being called but returning early?** Most bots gate `main()` on `bot_variables.config.is_script_running`. The widget UI usually has a Start button — confirm it was clicked.

3. **Is the console redirected?** `Py4GWCoreLib/__init__.py` redirects `sys.stdout`/`sys.stderr` into the Py4GW console — `print()` works but appears in the in-game console, not in any external terminal.

## Symptom: Console silent (no log output at all)

1. **`Py4GW.Console.Log` argument order:** `Py4GW.Console.Log(tag, message, level)`. Swapping `tag` and `message` doesn't throw but the wrong field becomes the visible tag.
2. **Level filter:** Confirm the console level filter isn't hiding the level you logged at. Try `MessageType.Error` or `MessageType.Notice`.
3. **Module imported via `Py4GWCoreLib import *`?** If yes, `ConsoleLog` is the higher-level wrapper — `ConsoleLog(MODULE_NAME, 'message')`.

## Symptom: Bot hangs / coroutine never resumes

1. **Was the coroutine actually added?** `GLOBAL_CACHE.Coroutines.Add(my_gen())` — and `my_gen()` must produce a generator, not be a regular function. If you forgot a `yield` anywhere in `my_gen`, it returns immediately and the engine is never invoked.

2. **Is the generator blocked on a condition that never becomes true?** E.g. waiting for `Map.IsMapReady()` while the player is in a cinematic. Add a timeout:

   ```python
   start = time.time()
   while not Map.IsMapReady():
       if time.time() - start > 30:
           ConsoleLog(MODULE_NAME, 'Map.IsMapReady timeout', Py4GW.Console.MessageType.Error)
           return  # bail out of the coroutine
       yield
   ```

3. **`time.sleep(long)` inside `main()`?** Hangs the per-frame tick. Move to a coroutine.

4. **HeroAI follower frozen?** See `heroai-subsystem.md` Follow Rules. Most likely cause: `HeroAI.follow` was imported at the package root somewhere instead of a specific submodule.

## Symptom: Import error at startup ("circular import", etc.)

1. **`Py4GWCoreLib/GlobalCache/SharedMemory.py` is startup-sensitive.** Don't broaden imports there. The single direct `from HeroAI.follow.leader_publish import ...` is intentional and narrow — keep it that way.

2. **`from Py4GWCoreLib import *` inside `Py4GWCoreLib/` itself?** Don't. Inside the library, import specific submodules.

3. **A widget folder accidentally loading helpers as widgets?** If a `.py` file at the same level as a `.widget` marker has import-time side effects that fail, the whole widget folder breaks. Move helpers out of marked folders.

## Symptom: Map transition stuck

1. **`Map.Travel(...)` doesn't block.** It enqueues the travel; the actual transition happens later. Wait on state, not on the call's return.

2. **`Map.IsMapReady()` or equivalent loading-state check missing.** Don't proceed to gameplay logic before the instance is loaded.

3. **In a cinematic?** `Context` has a cinematic flag. Skip with `Map.SkipCinematic()` (or whatever the current name is) or wait it out.

4. **Wrong map ID?** Confirm with `Map.GetMapID()` after the transition. If it doesn't match expected, the travel failed (full district, not in party, etc.).

## Symptom: Cast doesn't happen

1. **`Skillbar.UseSkill(slot)` is queued, not synchronous.** Confirm via state:
   - `Skillbar.GetCastingSkill()` shows the skill that's actually casting.
   - `Agent.living_agent.is_casting` on the local player.

2. **Slot index off by one?** Slots are **0-8** in the API even though the in-game bar labels them 1-8. Slot 0 is the leftmost; slot 7 is the rightmost (skill 8); slot 8 is sometimes the special slot.

3. **Skill not recharged?** `Skillbar.GetSkillRecharge(slot)` or `Routines.Checks.Skills.IsRecharged(slot)`.

4. **Not enough energy?** Check `Player.GetEnergy()` against the skill's energy cost (with effect/expertise modifiers applied — `Checks.Skills.GetEnergyCostWithEffects(...)`).

5. **Wrong target type for skill?** Spell on a non-living target, attack on a spirit, etc. Confirm `Skill.IsValidTarget(skill_id, target_id)` or equivalent.

6. **Skill disabled?** Maintained spells, mantras, and adrenaline depletion can disable slots. `Skillbar.IsSkillDisabled(slot)`.

## Symptom: Death loop

1. **Max-death threshold not handled.** GW kills the character permanently after enough deaths in HM (max malus). Detect via `Player.GetMorale()` / `Player.GetDeathPenalty()` and bail to outpost.

2. **Stuck respawn → run → die → respawn cycle.** Detect repeated deaths within a short window and force a `ResignAndReturn`.

3. **Pet keeps dying and not being detected.** Pet death state differs from owner death; check separately.

## Symptom: "It dies at the chest hop / specific waypoint"

1. **Aggro spike from a path point inside enemy range.** Move the path point further from the cluster, or insert a `yield from` aggro-pull subroutine before the path continuation.

2. **Skill not maintained across the hop.** Maintained enchantments have an upkeep cost; check `Skillbar.GetMaintainedSkills()` or whatever the current accessor is.

3. **Survival rule didn't fire.** "Cast skill 6 at <50% HP" requires the bot to actually check HP each frame during combat — confirm the check runs in the combat coroutine, not just at the path-step boundary.

## Symptom: Widget invisible to manager

1. **Missing `.widget` marker?** The folder is invisible without it. Create the empty file.

2. **`OPTIONAL = True` and disabled in the manager INI?** Re-enable through the widget manager UI.

3. **Import-time error in any `.py` in the same marked folder?** One failure can suppress siblings depending on `_load_widget_module` behavior. Check console for errors at discovery time.

4. **`MODULE_CATEGORY` typo?** Defaults to first path segment, but if you override it with a typo, the catalog UI may filter it into an unexpected bucket.

## Symptom: HeroAI combat path slow / frame drops

1. **New eager bundle of condition checks added?** See `heroai-subsystem.md` Lazy Local Pattern.

2. **Repeated `HasEffect(vTarget, ...)` calls in the same function?** Cache the result.

3. **Re-fetching `GetEffectAndBuffIds(vTarget)` in multiple branches?** Snapshot once per target.

4. **`EnemiesInRange` / `AlliesInRange` scan firing before cheap state checks have failed?** Move the scan later.

## Symptom: Bridge / MCP integration not working

The skill **does not cover bridge / MCP work in depth**. For those, read:

- `BridgeRuntime/README.md` — operator usage.
- `docs/MCP_bridge.md` — bridge planning.
- The injected widget `Widgets/Coding/Tools/Bridge Client.py`.
- Defaults: widget server `127.0.0.1:47811`, control server `127.0.0.1:47812`, CLI targets `47812`.
- Discovery: `python "bridge_daemon.py" --help`, `python "bridge_cli.py" --help`, `python "py4gw_mcp_server.py" --help`.

## Symptom: HeroAI follower frozen / drifting

Mandatory reading: `FOLLOW_REFACTOR_HANDOVER.md`.

Quick checks:

1. **Anyone import `HeroAI.follow` (package)?** That import drags in editor UI + vector fields + follower runtime + leader publish all at once. Replace with the exact submodule.
2. **Recent edit to `Py4GWCoreLib/GlobalCache/SharedMemory.py`?** Even narrow changes there can destabilize startup. Verify the `leader_publish` import is still narrow.
3. **Both leader and follower running on the same client?** Multi-box configurations have specific rules — see `whiteboard_architecture_cross-hero_cast_coordination.md`.

## Investigation Tooling

```bash
# Find a CoreLib function by name:
rg -tpy 'def MyFunctionName' Py4GWCoreLib/

# Find every caller of a function:
rg -tpy 'MyFunctionName\(' --type-add 'py4gw:Bots,Sources,Examples,Widgets,HeroAI'

# Find every widget folder (marked):
fd -t f '\.widget$' Widgets/

# Find every `from Py4GWCoreLib import *` (for legacy audit):
rg -tpy 'from Py4GWCoreLib import \*' .

# Verify house style on a file:
black --check --line-length 120 path/to/file.py
isort --check-only --force-single-line path/to/file.py
```

When the issue is repo-wide (slow imports, startup ordering, layer violations), prefer the conceptual model document over guessing.
