# Python Packaging and Project Setup

Modern packaging with the `uv` / `ruff` / `ty` toolchain. Targets Python 3.13.
For project scaffolding, migration, and standalone scripts, see the
`modern-python` skill — this reference covers the packaging shape a
`python-pro` author needs while writing code.

## Project Structure

```
myproject/
├── pyproject.toml          # Project metadata, dependencies, tool config
├── README.md               # Project description
├── .gitignore              # Git ignore patterns
├── .python-version         # Python version pin (uv reads this)
├── uv.lock                 # Locked dependency graph (commit for apps)
├── src/
│   └── myproject/
│       ├── __init__.py     # Package initialization
│       ├── py.typed        # PEP 561 type marker
│       ├── core.py         # Core functionality
│       └── utils.py        # Utilities
└── tests/
    ├── __init__.py
    ├── conftest.py         # Pytest fixtures
    └── test_core.py        # Tests mirroring src/ layout
```

Create it with uv (never hand-roll the venv):

```bash
uv init --package myproject   # src/ layout, distributable
cd myproject
uv add requests pydantic      # runtime deps → pyproject.toml + uv.lock
uv add --dev pytest hypothesis ruff ty mutmut   # dev tools → dependency group
uv sync --all-groups          # materialize the environment
```

## pyproject.toml Configuration

```toml
[project]
name = "myproject"
version = "0.1.0"
description = "A Python project"
readme = "README.md"
requires-python = ">=3.13"
license = "MIT"
authors = [
    {name = "Your Name", email = "you@example.com"}
]
keywords = ["python", "package"]
classifiers = [
    "Development Status :: 4 - Beta",
    "Intended Audience :: Developers",
    "License :: OSI Approved :: MIT License",
    "Programming Language :: Python :: 3.13",
    "Typing :: Typed",
]

# Pin exact versions for reproducibility (== not >=).
dependencies = [
    "requests==2.32.3",
    "pydantic==2.9.2",
]

[project.scripts]
myproject = "myproject.cli:main"

[project.urls]
Homepage = "https://github.com/username/myproject"
Repository = "https://github.com/username/myproject"
Changelog = "https://github.com/username/myproject/blob/main/CHANGELOG.md"

[build-system]
requires = ["uv_build>=0.9,<1"]   # pure Python — check pypi.org/project/uv-build
build-backend = "uv_build"

# Dev tooling lives in dependency groups (PEP 735), NOT optional-dependencies.
[dependency-groups]
dev = [{include-group = "lint"}, {include-group = "test"}]
lint = ["ruff", "ty"]
test = ["pytest", "hypothesis", "mutmut"]

[tool.uv]
default-groups = ["dev"]

# --- Tool configuration ---

[tool.ruff]
line-length = 100
target-version = "py313"
src = ["src"]

[tool.ruff.lint]
select = [
    "E",   # pycodestyle errors
    "W",   # pycodestyle warnings
    "F",   # pyflakes
    "I",   # isort
    "B",   # flake8-bugbear
    "C4",  # flake8-comprehensions
    "UP",  # pyupgrade
    "SIM", # flake8-simplify
    "RUF", # Ruff-specific
]

[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]  # re-exports

[tool.ty.environment]
python-version = "3.13"

[tool.ty.rules]
all = "error"

[tool.pytest.ini_options]
minversion = "8.0"
addopts = ["-ra", "--strict-markers", "--strict-config"]
testpaths = ["tests"]
pythonpath = ["src"]
```

No `pytest-cov` and no `--cov-fail-under` — see the skill's Testing Philosophy.

## Build Backends: uv_build vs. hatchling

| Package kind | Backend | requires |
|--------------|---------|----------|
| Pure Python | `uv_build` | `["uv_build>=0.9,<1"]` |
| Native / compiled extensions | `hatchling` | `["hatchling"]` |

`uv_build` is the simplest correct choice for pure-Python packages. Reach for
`hatchling` when you ship compiled extensions (Cython, C/Rust via a plugin) or
need its plugin ecosystem for build customization:

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

Use static versioning in `[project] version`, not VCS-derived dynamic versions.

## Dependency Management

Always go through `uv` — never edit the `dependencies` / `dependency-groups`
tables by hand, and never call `pip` directly.

```bash
uv add httpx                 # runtime dependency
uv add --dev pytest          # dev dependency group
uv remove requests           # drop a dependency
uv lock                      # refresh the lock without installing
uv sync --all-groups         # install everything from the lock
```

Pin exact versions (`==`) for applications so deploys are reproducible; the
`uv.lock` records the full resolved graph. Commit `uv.lock` for applications;
`.gitignore` it for libraries so downstream users resolve their own graph.

## Package __init__.py

```python
# src/myproject/__init__.py
"""MyProject - A Python package."""

from myproject.core import CoreClass, main_function
from myproject.utils import helper_function

__version__ = "0.1.0"
__all__ = ["CoreClass", "helper_function", "main_function"]
```

## Type Marker (py.typed)

PEP 561 requires a marker file so type checkers use your inline annotations:

```
src/myproject/py.typed   # empty file; signals "this package is typed"
```

## CLI Entry Points

```python
# src/myproject/cli.py
import sys


def main() -> int:
    """Run the CLI and return a process exit code."""
    print("MyProject CLI")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

## Building and Publishing

```bash
uv build                     # build wheel + sdist into dist/
uv publish                   # publish to PyPI (token via UV_PUBLISH_TOKEN)
uv publish --index testpypi  # publish to a configured alternate index
```

## Supply-Chain Hardening

```bash
uv run pip-audit             # scan the resolved graph for known CVEs
uv pip install --require-hashes -r requirements.txt   # verify hashes on install
```

- Pin exact versions (`==`) and commit `uv.lock` for applications.
- Run `pip-audit` before deploying; wire it into CI.
- Configure Dependabot with a cooldown and grouped updates on the `uv` ecosystem
  so it maintains `uv.lock`.

## Prek Hooks

Use `prek` (Rust-native, no Python runtime) as the pre-commit runner. It reads
the standard `.pre-commit-config.yaml`:

```yaml
# .pre-commit-config.yaml
default_language_version:
  python: python3.13

repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: <latest>  # https://github.com/astral-sh/ruff-pre-commit/releases
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
```

```bash
uv tool install prek
prek install                          # register the git hook
prek run --all-files                  # run every hook now
prek auto-update --cooldown-days 7    # bump pinned revs, with a cooldown
```

ty is not yet distributed as a ruff-pre-commit hook; run `uv run ty check src/`
in CI (and via a Makefile target) alongside `prek`.
