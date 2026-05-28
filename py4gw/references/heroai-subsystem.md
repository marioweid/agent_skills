# HeroAI Subsystem

The `HeroAI/` package is the headless combat / targeting / follow / interrupt / hex-removal pipeline. It runs in the per-frame tick and is **performance-sensitive** — micro-optimizations here actually matter because the code runs every frame, every skill, every hero, every party-member-aware scan.

Canonical docs:

- `docs/heroai_combat_handover.md` — combat path direction + hot spots.
- `FOLLOW_REFACTOR_HANDOVER.md` — required reading before touching `HeroAI/follow/`.
- `docs/HeroAi_interrupt_feasibility.md` — interrupt subsystem.
- `docs/hex_removal_architecture_and_authoring.md` — hex removal architecture.
- `docs/heroai_combat_handover.md` — combat handover doc.

## Layout

```
HeroAI/
├── __init__.py                  intentionally narrow
├── combat.py                    CombatClass — IsReadyToCast, GetAppropiateTarget,
│                                AreCastConditionsMet (the hot one)
├── targeting.py                 lowest-ally selectors, target selection
├── utils.py                     misc HeroAI helpers
├── cache_data.py                per-frame caches local to HeroAI
├── party_cache.py               party-member-aware cache
├── frame_cache (helpers)        frame-local memoization primitive
├── follow/                      follow subsystem (see FOLLOW_REFACTOR_HANDOVER)
│   ├── __init__.py              EXPORTS NOTHING by design
│   ├── leader_publish.py        leader publishes follow points via shared memory
│   ├── follower_runtime.py      follower consumes follow points and moves
│   ├── vector_fields.py         obstacle/avoidance vector fields
│   ├── editor.py                follow editor UI
│   └── feature_flags.py         feature flags for the rebuild
├── custom_skill.py              CustomSkill bridge — user-defined skill behaviors
├── custom_skill_src/
├── hex_removal.py + hex_removal_src/
├── interrupt.py
├── call_target.py               team call-target broadcast
├── team_viewer_broadcast.py
├── headless_tree.py             behavior tree integration for headless mode
├── commands.py
├── constants.py
├── globals.py
├── settings.py
├── types.py
├── ui.py + ui_base.py + windows.py
```

## The Combat Hot Path

Per-skill evaluation in `CombatClass`:

1. `IsReadyToCast(slot)` — cheap rejects first (recharge, energy, casting).
2. `GetAppropiateTarget(slot)` — target acquisition.
3. `AreCastConditionsMet(slot, vTarget)` — the **hot function**.
4. `HasEffect(vTarget, skill_id)` — effect/buff inspection.
5. Cast / aftercast.

`AreCastConditionsMet` is the main optimization target — it mixes many condition families in one long function and over-eagerly computes target booleans even when the current skill doesn't need them.

## Performance Rules

The whole pipeline is being pushed toward:

1. **Frame-local caching for repeated reads.** Helpers that already use `frame_cache`:
   - shared-memory getters
   - effect getters
   - `Checks.Skills.GetEnergyCostWithEffects(...)`

2. **Single-pass scans instead of filter-then-sort chains.** E.g. `Routines.Agents.GetNearestEnemy*` now uses single-pass nearest selection.

3. **Cheap early exits before expensive target resolution.** `Checks.Skills.apply_expertise_reduction(...)` exits early for non-primary-Rangers (with the `Ranger of Melandru` exception).

4. **Delay shared-memory + effect checks until truly needed.** Don't fetch effect IDs for branches that won't use them.

When adding combat code: **measure before micro-optimizing, but default to lazy locals.** A new helper that's called inside `AreCastConditionsMet` will be called thousands of times per minute.

## Lazy Local Pattern

Replace eager computation of every condition with lazy locals computed on demand:

```python
# Bad — eager bundle, computed every call even if unused
is_blind = self.HasEffect(vTarget, SkillID.Blindness)
is_burning = self.HasEffect(vTarget, SkillID.Burning)
is_dazed = self.HasEffect(vTarget, SkillID.Dazed)
# ...many more...
if skill_needs_blind and is_blind:
    ...

# Good — lazy, only computed if the skill actually requires it
def _check_blind():
    return self.HasEffect(vTarget, SkillID.Blindness)

if skill_needs_blind and _check_blind():
    ...
```

Combine with a per-target effect snapshot when **any** branch needs target effect IDs:

```python
target_effects = None
def _get_target_effects():
    nonlocal target_effects
    if target_effects is None:
        target_effects = GetEffectAndBuffIds(vTarget)
    return target_effects
```

## Follow Subsystem — Critical Rules

`FOLLOW_REFACTOR_HANDOVER.md` documents a **failed refactor** that destabilized the client. The rebuild must be incremental with checkpoints after every change.

### Rule 1 — Don't touch `SharedMemory.py` early

`Py4GWCoreLib/GlobalCache/SharedMemory.py` is loaded very early during startup. Don't widen its import surface. The single direct import of `HeroAI.follow.leader_publish` is the documented exception; preserve it.

### Rule 2 — Don't import `HeroAI.follow` package root

`HeroAI/follow/__init__.py` **intentionally exports nothing.** Always import the exact submodule:

```python
# Good
from HeroAI.follow.leader_publish import LeaderFollowPositionPublisher
from HeroAI.follow.follower_runtime import FollowerFollowExecutor

# Bad — pulls editor UI, vector fields, follower runtime, leader publish all in
from HeroAI.follow import LeaderFollowPositionPublisher
```

### Rule 3 — Separate import scope from instantiation scope

Two distinct risks:

1. Importing code in a sensitive path (drags in side effects).
2. Instantiating classes in a sensitive path (allocates / wires up callbacks).

Treat them independently. A narrow import doesn't mean it's safe to instantiate there.

### Rule 4 — Quick follow window must still expose threshold controls

A previous refactor reduced the quick follow window to a launcher shell. That broke user expectations. Preserve threshold controls in the quick window when modifying follow UI.

### Rule 5 — Preserve existing UI access paths

- `Follow Formations` button remains.
- Existing quick window remains.
- Following module stays closed by default.
- The module is only opened from HeroAI UI.

### Goal Shape (from the handover doc)

When the rebuild is complete:

```
HeroAI/follow/
├── __init__.py            (still exports nothing)
├── leader_publish.py      Leader writes follow points to shared memory.
├── follower_runtime.py    Follower reads follow points and moves.
├── vector_fields.py       Obstacle / avoidance vector fields. Own concern.
├── editor.py              Follow editor UI. Own concern.
└── feature_flags.py       Flags gating in-progress migrations.
```

Legacy duplicates (`HeroAI/following.py`, `follow_runtime.py`, `follow_movement.py`, `following_module.py`) are removed **only after** the migration is proven safe.

## Headless Mode

`HeroAI/headless_tree.py` integrates HeroAI with `BottingTree` so bots can drive HeroAI without the standard UI being active. Used by:

- `Sources/modular_bot/` (the real ModularBot implementation).
- Headless farms that want HeroAI's targeting/combat but no HeroAI windows.

## Files To Read Before Editing

| If you're editing | Read first |
|-------------------|------------|
| `HeroAI/combat.py` | `docs/heroai_combat_handover.md` |
| `HeroAI/targeting.py` | `docs/heroai_combat_handover.md` |
| `HeroAI/follow/*` | `FOLLOW_REFACTOR_HANDOVER.md` (mandatory) |
| `HeroAI/hex_removal*` | `docs/hex_removal_architecture_and_authoring.md` |
| `HeroAI/interrupt.py` | `docs/HeroAi_interrupt_feasibility.md` |
| `Py4GWCoreLib/GlobalCache/SharedMemory.py` | `FOLLOW_REFACTOR_HANDOVER.md` rules 1 & 2 |

## Anti-Patterns

- Calling `self.HasEffect(vTarget, ...)` multiple times for the same target in the same function.
- Re-fetching `GetEffectAndBuffIds(vTarget)` in multiple branches.
- Computing `feature_count` from static skill metadata every call.
- Triggering `EnemiesInRange` / `AlliesInRange` / `SpiritsInRange` / `MinionsInRange` scans before cheap state checks have had a chance to fail.
- Importing `HeroAI.follow` (the package) anywhere.
- Adding new follow-related imports to `SharedMemory.py`.
- Refactoring follow code across many concerns in one pass without checkpoints.
- Removing the `Follow Formations` button or the existing quick follow window.
