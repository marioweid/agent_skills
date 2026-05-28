# Widget Development

How widget discovery, loading, and metadata work in `~/Sources/Py4GW`. Source: `docs/widget_manager_and_catalog.md` (canonical) and `Py4GWCoreLib/py4gwcorelib_src/WidgetManager.py`.

The entire widget runtime lives in one module:

- `Py4GWCoreLib/py4gwcorelib_src/WidgetManager.py`

It contains three concerns:

1. `Widget` — one live widget instance + runtime metadata.
2. `WidgetHandler` — discovery, loading, enable/disable, callback registration.
3. `WidgetCatalog` — read/query layer over discovered widgets, for explorer-style UIs.

Plus `Py4GWLibrary` — one particular UI consumer of widget data.

## Discovery Rule (Exact)

`WidgetHandler._scan_widget_folders()` walks the entire `Widgets/` tree and applies one rule:

- **If a folder contains a file named `.widget`, every `.py` file in that folder is loaded as a widget.**

Implications:

- Discovery is **folder-based, not file-based across the whole tree.** A `.py` outside a marked folder is invisible to the widget manager.
- A folder without `.widget` is **not** a discovery root, even if it contains widgets-looking code.
- Intermediate folders may appear in the path hierarchy without being discovery roots.
- A widget's `widget_path` is the **relative folder path of the folder that contained the `.widget` marker** — not the file path.

Example:

```
Widgets/Automation/Bots/Farmers/Trophies/War Supply/
├── .widget                              <- marker
├── war_supply_main.py                   <- discovered widget
├── war_supply_helpers.py                <- ALSO discovered as a widget
                                            (because it's in the same folder)
└── README.md                            <- ignored
```

All `.py` files in that folder get `widget_path == "Automation/Bots/Farmers/Trophies/War Supply"`.

If a folder is meant to hold helpers but **not** load them as widgets, move them out of the marker folder. There's no `__init__`-style opt-out within a marked folder — the rule is strict.

## Widget Module Interface

A widget `.py` exposes any of these top-level callables:

- `main()` — per-frame tick (same contract as bots).
- `update()` — periodic update, distinct from `main` for widgets that separate state from draw.
- `draw()` — explicit draw step.
- `configure()` — opens a configuration panel (the widget appears in `WidgetHandler.execute_configuring_widgets()`).
- `tooltip()` — tooltip text/draw.
- `minimal()` — minimal/compact rendering mode.
- `on_enable()` — fired when the user enables the widget.
- `on_disable()` — fired on disable.

`Widget.load_module()` introspects the imported script, finds these callables by name, and stores references. Missing callables are simply skipped — there is no "must implement" requirement.

## Metadata Module-Vars

Set these at module top-level:

```python
MODULE_NAME = 'War Supply Farmer'           # falls back to a cleaned script filename
MODULE_CATEGORY = 'Automation'              # falls back to first folder segment of widget_path
MODULE_TAGS = ('Automation', 'Farmers')     # falls back to all folder segments in widget_path
OPTIONAL = True                             # default: False for System/Py4GW, True otherwise
```

Defaults (per `WidgetManager.py`):

| Var | Default |
|-----|---------|
| `MODULE_NAME` | cleaned script filename (snake → human) |
| `MODULE_CATEGORY` | first segment of `widget_path` (e.g. `"Automation"`) |
| `MODULE_TAGS` | tuple of all segments of `widget_path` |
| `OPTIONAL` | `False` if category is `"System"` or `"Py4GW"`, else `True` |

`OPTIONAL=False` widgets are **force-enabled** by `_apply_ini_configuration()` — the user can't disable them. Use only for true infrastructure widgets (e.g. system console, widget catalog itself).

Additional module-vars sometimes used:

- `ALIASES` — alternate names for search.
- `IMAGE` — icon path.

## INI Persistence

`WidgetHandler` reads and writes widget enabled state through the manager INI:

- `enable_widget(...)` / `disable_widget(...)` mutate persistent state.
- `_apply_ini_configuration()` restores saved enabled flags at startup and force-enables `OPTIONAL=False` widgets.

Don't manipulate the manager INI directly from widget code — go through `WidgetHandler`.

## Window Pattern

Use `ImGui.WindowModule` for the window shell (same as bots — see `bot-patterns.md`):

```python
from Py4GWCoreLib import ImGui
from Py4GWCoreLib import PyImGui

MODULE_NAME = 'My Widget'
MODULE_CATEGORY = 'Coding'
OPTIONAL = True

window = ImGui.WindowModule(
    MODULE_NAME,
    window_name=MODULE_NAME,
    window_size=(300, 200),
    window_flags=PyImGui.WindowFlags.AlwaysAutoResize,
)

def main():
    global window
    if window.first_run:
        PyImGui.set_next_window_size(*window.window_size)
        PyImGui.set_next_window_pos(*window.window_pos)
        window.first_run = False
    if PyImGui.begin(MODULE_NAME):
        PyImGui.text('Hello widget')
    PyImGui.end()
```

## WidgetCatalog vs WidgetHandler

- **`WidgetHandler`** = the runtime API. Discover, enable/disable, register callbacks. **Use this from any code that drives widgets.**
- **`WidgetCatalog`** = the query API. Iterate, filter, group widgets for explorer UIs. **Use this from code that displays widget collections.**

Don't reach into `WidgetHandler.widgets` directly from a display UI — go through `WidgetCatalog`.

## Common Mistakes

- Adding `.py` files to a marked folder when they were meant to be private helpers. **They will be loaded as widgets.** Move helpers to a sibling folder or to a non-`Widgets/` location.
- Forgetting the `.widget` marker. The folder is silently invisible — no error.
- Setting `OPTIONAL=False` on a non-system widget. The user loses the ability to disable it; this is rarely correct.
- Drawing from a coroutine. The draw cycle runs independently — keep draw inside `main()` / `draw()`.
- Importing `Py4GW_widget_manager.get_widget_handler` from inside a widget loaded by the manager — possible but creates a startup ordering dependency. Prefer asking for the handler via the function entry-point pattern in existing widgets.
- Mutating the widget INI from widget code instead of calling `WidgetHandler.enable_widget` / `disable_widget`.

## Cross-References

- `docs/widget_manager_and_catalog.md` — canonical, 358 lines, file:line precise.
- `Py4GWCoreLib/py4gwcorelib_src/WidgetManager.py` — implementation.
- `Py4GW_widget_manager.py` — in-client bootstrap that creates the manager INI key and runs discovery.
- `Widgets/WidgetCatalog/Py4GW_widget_catalog.py` — the catalog UI consumer.
