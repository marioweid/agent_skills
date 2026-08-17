# BottingTree And RoutinesBT

The behavior-tree-driven bot stack. Use this reference when authoring a `BottingTree`-based bot, or when adding a new helper to `routines_src/BehaviourTrees.py`.

Canonical doc: `docs/bottingtree_and_bt_routines_guide.md` (1100 lines, dense). This is the operating summary.

## Three-Layer Stack

```
BottingTree                <- Py4GWCoreLib/BottingTree.py
  ↓ owns: planner sequence, upkeep/service trees, headless HeroAI,
          start/stop/pause, restart-from-step, movement overlay
RoutinesBT                 <- Py4GWCoreLib/routines_src/BehaviourTrees.py
  ↓ library of reusable subtree builders: movement, targeting, dialog,
    map travel, imp handling
BehaviorTree (framework)   <- Py4GWCoreLib/py4gwcorelib_src/BehaviorTree.py
    nodes, sequence/selector/parallel, decorators, SubtreeNode,
    blackboard propagation, NodeState normalization
```

Optionally, an authoring facade above that:

```
ApoSource wrappers         <- Sources/ApoSource/ApoBottingLib/wrappers.py
    re-exports a curated subset of RoutinesBT with renamed helpers and
    script-local arg shapes (e.g. Vec2f). Not a new engine — just a DSL.
```

## NodeState

The only valid runtime state is `BehaviorTree.NodeState`:

- `RUNNING`
- `SUCCESS`
- `FAILURE`

The framework normalizes return values to this enum. Planner / wrapper / helper logic all depend on consistent terminal propagation.

## Script Integration Pattern

A `BottingTree`-driven script typically looks like:

```python
from Py4GWCoreLib import *
from Py4GWCoreLib.BottingTree import BottingTree
from Py4GWCoreLib.routines_src.BehaviourTrees import BT as RoutinesBT

MODULE_NAME = 'My BT Bot'

# Module-level holder set up by _ensure_prepare_tree
bot: BottingTree | None = None

def MySequence() -> BehaviorTree:
    # Build the planner sequence as a BehaviorTree composed of RoutinesBT subtrees.
    seq = BehaviorTree('MyPlanner')
    seq.add_child(RoutinesBT.Movement.TravelToOutpost(target_map_id))
    seq.add_child(RoutinesBT.Movement.FollowPath(path_points_to_farm_spot))
    seq.add_child(MyCombatSubtree())
    seq.add_child(RoutinesBT.Movement.ResignAndReturn(outpost_map_id))
    return seq

def _get_sequence_builders():
    # BottingTree consumes this to know which planner sequences exist.
    return {
        'Default': MySequence,
        # Add named alternates here. Restart-from-step targets these names.
    }

def _ensure_prepare_tree(auto_start: bool = False) -> BottingTree:
    global bot
    if bot is None:
        bot = BottingTree(name=MODULE_NAME, sequence_builders=_get_sequence_builders())
        if auto_start:
            bot.start()
    return bot

def main():
    bt = _ensure_prepare_tree()
    bt.tick()  # advances planner + upkeep/service trees; draws overlays
```

## Upkeep / Service Trees

`BottingTree` runs the planner in parallel with optional upkeep/service trees — background trees that fire on conditions:

- Low health → trigger heal subtree
- Low energy → maintain energy-management enchantment
- Death detected → respawn + recovery subtree
- Hex / condition → drop / removal subtree (see `HeroAI/hex_removal_src/`)

Register them with `bot.add_service_tree(name, tree)` (check current API — surface evolves). They are independent of the planner and don't consume planner steps.

## Discovery Contract (Configurator Metadata)

The BT helper layer participates in configurator discovery via a docstring contract.

**Rule: metadata is mandatory for discovery. No metadata means ignore.** This is intentional — the parser does not infer user-facing meaning from helper-only support code or low-level implementation details.

Discoverable surfaces use:

1. A human-readable description.
2. A structured `Meta:` block.

Current `Meta:` keys:

- `Expose` — `true` if user-facing; `false` for support helpers that still want metadata.
- `Audience` — who this is for (e.g. `bot-author`, `internal`).
- `Display` — UI label.
- `Purpose` — short purpose summary.
- `UserDescription` — what to show in the configurator.
- `Notes` — caveats / preconditions.

Applies to:

- The BT root catalog surface in `routines_src/BehaviourTrees.py`.
- Grouped BT helper classes.
- BT helper routines that should be visible to the configurator.

When adding a new RoutinesBT helper:

```python
def TravelToOutpost(map_id: int) -> BehaviorTree:
    """Travel to the named outpost and wait for map ready.

    Meta:
        Expose: true
        Audience: bot-author
        Display: Travel to Outpost
        Purpose: Map transition primitive used at the start of farms.
        UserDescription: Sends the player to <map_id> and yields until the
            instance is fully loaded.
        Notes: Assumes the player is in a town/outpost; from explorable, use
            ResignAndReturn first.
    """
    # ...
```

To validate metadata coverage on an existing ModularBot surface:

```bash
python "Sources/modular_bot/tools/validate_modular_docs.py"
```

## When To Reach For BottingTree

Use `BottingTree` if **two or more** are true:

- The bot has upkeep/service trees (background conditions).
- The bot has multiple named plans (kill / vanquish / merch / return) the user picks among.
- The bot needs restart-from-step recovery.
- You want headless HeroAI integration.
- You want the future configurator UI to expose the bot's plans.

Otherwise: a Yield/coroutine bot is simpler. Don't reach for BT when a generator does the job.

## When To Add To RoutinesBT

Add to `routines_src/BehaviourTrees.py` if the subtree is **reusable across bots** — movement, targeting, dialog, map travel, generic combat decisions. Bot-specific subtrees stay in the bot file.

When adding, decorate with the `Meta:` block above. Don't add undecorated helpers to the user-facing namespace — they'll either be invisible to the configurator (silent failure) or pollute the discovery results.

## Cross-References

- `docs/bottingtree_and_bt_routines_guide.md` — canonical, 1100 lines.
- `docs/behavior_tree_metadata_preparation_guide.md` — the metadata discovery contract details.
- `Py4GWCoreLib/BottingTree.py` — runtime wrapper.
- `Py4GWCoreLib/routines_src/BehaviourTrees.py` — reusable subtree catalog.
- `Py4GWCoreLib/py4gwcorelib_src/BehaviorTree.py` — framework.
- `Sources/ApoSource/ApoBottingLib/wrappers.py` — example of a script-local DSL above RoutinesBT.
