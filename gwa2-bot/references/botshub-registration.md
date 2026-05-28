# BotsHub Registration

A new farm file under `src/farms/` is invisible to the hub until it's registered in three places — four if it ports between cities. This file is the recipe.

## The four-touch checklist

Given a new farm `Skales.au3` with main function `SkalesFarm`, duration constant `$SKALES_FARM_DURATION`, that ports between Beetletun and Nebo Terrace:

### 1. Include (`BotsHub.au3:43-85`)

Alphabetical, in the `#include 'src/farms/...'` block:

```diff
 #include 'src/farms/Raptors.au3'
+#include 'src/farms/Skales.au3'
 #include 'src/farms/SpiritSlaves.au3'
```

### 2. `$AVAILABLE_FARMS` constant (`BotsHub.au3:97-99`)

Pipe-separated string, alphabetical. The GUI dropdown reads this directly:

```diff
- 'Raptors|SoO|SpiritSlaves|Sunspear Armor|Tasca|Underworld|Vaettirs|...
+ 'Raptors|Skales|SoO|SpiritSlaves|Sunspear Armor|Tasca|Underworld|Vaettirs|...
```

Use the **display name** (with spaces) here — `'Skales'` not `'SkalesFarm'`.

### 3. `FillFarmMap()` (`BotsHub.au3:501`)

Tab-aligned columns. Order doesn't matter to the runtime, but stay alphabetical for readability:

```diff
     AddFarmToFarmMap(   'Raptors',          RaptorsFarm,        5,      $RAPTORS_FARM_DURATION)
+    AddFarmToFarmMap(   'Skales',           SkalesFarm,         5,      $SKALES_FARM_DURATION)
     AddFarmToFarmMap(   'SoO',              SoOFarm,            15,     $SOO_FARM_DURATION)
```

The four columns:

| Column | Meaning |
|--------|---------|
| Display name | Must match the entry in `$AVAILABLE_FARMS` exactly |
| Farm function | The `<Name>Farm` entry point — passed by reference, no quotes |
| Inventory space needed | Free slots required before a run starts (`5`/`10`/`15` typical) |
| Duration | Expected run time in ms — drives the GUI progress bar; use a `$<NAME>_FARM_DURATION` constant declared in the farm file |

**Tabs only for column alignment.** The lint regex flags space/tab mixing.

### 4. `ResetBotsSetups()` (`BotsHub.au3:554`)

Add the setup flag *only if* the bot ports back to a city between runs. Most do:

```diff
     $raptors_farm_setup                     = False
+    $skales_farm_setup                      = False
     $soo_farm_setup                         = False
```

The variable name must match what the farm file declares (`Global $skales_farm_setup = False` at file scope in `Skales.au3`). A typo here means the setup never resets and the bot starts from the wrong state on the second run.

**Skip this step** for bots that stay inside the same instance — see the commented block at `BotsHub.au3:573-587`:

> Those do not need to be reset - party did not change, build did not change, and there is no need to refresh portal
> BUT those bots MUST tp to the correct map on every loop

That list: `cof`, `corsairs`, `follower`, `fow`, all gemstone variants, `glint_challenge`, `lightbringer`, `ministerial_commendations`, `uw`, `voltaic`, `warsupply`. If your bot's setup is "load build once, then re-enter the same instance forever," it belongs here — leave it commented out (or omit entirely).

## AddFarmToFarmMap mechanics

`BotsHub.au3:613`:

```autoit
Func AddFarmToFarmMap($farmName, $farmFunction, $farmInventorySpace, $farmDuration)
    Local $farmArray[] = [$farmName, $farmFunction, $farmInventorySpace, $farmDuration]
    $farm_map[$farmName] = $farmArray
EndFunc
```

`$farm_map` is keyed by display name. `RunFarmLoop` (`BotsHub.au3:246`) looks up the record by name and calls `$farm[1]` (the function reference). If the GUI sees a name in `$AVAILABLE_FARMS` that's missing from the map, it errors with "This farm does not exist."

## Per-farm config (optional)

Run config JSON: `conf/farm/<Name>.json`. If the bot needs custom defaults (different district, different hero composition, hard-mode off), copy `conf/farm/Default Farm Configuration.json` and edit. Selectable from the GUI dropdown alongside "Default Farm Configuration".

Loot config JSON: `conf/loot/<Name>.json`. Same pattern with `Default Loot Configuration.json`. Read by `PickUpItems` to decide what to pick up.

Neither JSON is required — most farms ship with just the defaults.

## Verifying the registration

Three quick checks after editing:

1. **GUI dropdown** — launch BotsHub, confirm the new name appears in the farm dropdown.
2. **Pick + start** — select the farm, press start. If you immediately get "This farm does not exist," step 2 (`$AVAILABLE_FARMS`) and step 3 (`FillFarmMap`) disagree on the name.
3. **Run a loop** — let it complete one cycle. If the second iteration fails to set up (wrong map, wrong build), step 4 (`ResetBotsSetups`) is missing.

## Convention drift

Looking at the existing 40+ entries:

- Display names use spaces and proper case: `'Eden Iris'`, `'War Supply Keiran'`, `'Lightbringer & Sunspear'`. Match the in-game farm location or thing being farmed.
- Function names are PascalCase suffixed with `Farm`: `EdenIrisFarm`, `WarSupplyKeiranFarm`. Title bots use `<Name>TitleFarm`.
- Duration constants use `$<UPPER_SNAKE>_FARM_DURATION` (or `_DURATION` for non-farms). Defined in the farm file's constants block.
- File names are PascalCase: `EdenIris.au3`, `WarSupplyKeiran.au3`.

Match the conventions; the project uses no autoformatter that would normalize them.
