# House Style

Style rules for any code in `~/Sources/Py4GW`. Sources: `pyproject.toml`, `pyrightconfig.json`, `README.md`, `AGENTS.md`.

## Runtime

- **Python 3.13.0 32-bit** (https://www.python.org/downloads/release/python-3130/).
- The runtime is embedded in the Guild Wars client; mismatched versions can crash the client, not produce friendly errors.
- Do **not** propose 64-bit-only dependencies; the launcher / injector runs against the 32-bit interpreter.
- `requirements.txt` is currently empty. Don't assume there's an enforced dependency set — verify with `pip freeze` in the user's actual environment if needed.

## Formatting

`pyproject.toml` is configured **for formatting only**, not lint. Preserve these settings:

- **Black** with `line-length = 120`.
- **`skip-string-normalization = true`** — keep single quotes when the file already uses them. Don't rewrite `'foo'` to `"foo"`.
- **isort** with `force_single_line = true` — one import per line, no `from x import a, b, c` chains.

```python
# Good (Py4GW style):
from Py4GWCoreLib import Agent
from Py4GWCoreLib import AgentArray
from Py4GWCoreLib import Map
from Py4GWCoreLib import Player

# Wrong (will be reformatted by isort):
from Py4GWCoreLib import Agent, AgentArray, Map, Player
```

For bots specifically, the established convention is `from Py4GWCoreLib import *`. That's the user-script-facing facade and is fine in `Bots/`, `Sources/`, `Examples/`, and most `Widgets/`. **Never** broaden imports to `*` in startup-sensitive modules (see Architecture).

## Type Checking

`pyrightconfig.json`:

- `stubPath = "./stubs"` — type hints for C++-bound modules live there.
- `reportMissingModuleSource = "none"` — suppresses noise for modules that exist only as stubs.

Use pyright **only if it's installed in the environment**. There's no CI step that enforces it. Don't introduce new pyright warnings; don't lean on it as a gate either.

## Linting / Testing

- **No repo-level CI/test runner.** No `.github/workflows`, no `pytest` / `tox` config, no `Makefile`.
- Don't guess a global test command. If you need to verify behavior, run **targeted scripts** — `AGENTS.md` documents a few:
  - `python "bridge_daemon.py" --help`
  - `python "bridge_cli.py" --help`
  - `python "py4gw_mcp_server.py" --help`
  - `python "Sources/modular_bot/tools/validate_modular_docs.py"`
  - `python "Widgets/Data/test_merchant_rules_regression.py"`

## Comments

- No inline comments inside functions for the obvious case. The codebase favors self-describing names + docstrings on non-trivial public APIs (Google style).
- Region markers (`# region X` / `# endregion X`) are used in larger bot files as navigation aids — keep them when editing those files.
- Don't add "what" comments. Add "why" comments only when the why is non-obvious.

## Naming

- `MODULE_NAME = '<Bot Name>'` at the top of every bot file. Used as the window title and console-log tag.
- Skill-slot constants are module-level, e.g. `BOREAL_SHADOWFORM = 2`. Don't hardcode slot indices inside `UseSkill` calls.
- Path coordinate lists: `path_points_to_<destination>: List[Tuple[float, float]] = [...]`.
- Classes for bot state: `Botconfig` (immutable-ish per-run config), `BOTVARIABLES` (mutable runtime container). Existing bots follow this pattern; new bots in the same folder should too.

## Files Not To Touch

Per `AGENTS.md`, these are local-runtime / launcher state and are marked `git update-index --skip-worktree`:

- `Py4GW.ini`
- `Py4GW_Launcher.ini`
- `Py4GW_injection_log.txt`

Don't commit churn to them unless the task is specifically about them.

## Documentation Hierarchy

When citing docs, observe the hierarchy from `AGENTS.md`:

- `docs/Py4GW_Conceptual_Model.md` — canonical architecture / terminology.
- `docs/MCP_bridge.md` — bridge / MCP planning summary; not the primary architecture source.
- `docs/widget_manager_and_catalog.md` — highest-value reference before changing widget discovery / metadata defaults / `WidgetHandler` / `WidgetCatalog`.
- `BridgeRuntime/README.md` — operator/runtime reference for bridge daemon + injected client + CLI.
- `docs/Py4GW_Model_Features_Detail.txt` — derived plain-text export for quick scanning, not authoritative.

## Anti-Patterns

- `time.sleep(longvalue)` inside `main()` — blocks the per-frame tick. Use coroutines.
- Re-calling `Agent.GetAgentByID(...)` inside a tight loop — snapshot once and read fields off the snapshot.
- `from HeroAI.follow import ...` — the package `__init__.py` intentionally exports nothing. Import exact submodules.
- Broadening `Py4GWCoreLib` imports in `Py4GWCoreLib/GlobalCache/SharedMemory.py` — startup-sensitive.
- Adding new authoritative state to `GLOBAL_CACHE` — it's a cache, not an authority. Add to a CoreLib module and let `GLOBAL_CACHE` re-expose.
- Referencing `ImGui_Py` — legacy, replaced by `ImGui` + `PyImGui`.
- Adding a widget folder without a `.widget` marker — invisible to `WidgetHandler`.
