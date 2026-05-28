---
name: python-pro
description: Use when writing, reviewing, or refactoring Python 3.13 code that needs type safety, async correctness, or solid tests. Generates type-annotated Python, configures `ty check` in strict mode, writes pytest suites that emphasize edge cases / property-based / mutation testing, and validates with ruff (lint and format) — not mypy / black / poetry. Invoke for type hints, async/await, dataclasses, dependency injection, structured logging, error handling, packaging with uv, and any task that should match the user's global Python standards in `~/.claude/CLAUDE.md`.
license: MIT
metadata:
  author: mario.weidner@gmx.de (forked + retuned from Jeffallan/claude-skills)
  version: "2.0.0"
  domain: language
  triggers: Python, Python 3.13, type hints, async Python, asyncio, pytest, hypothesis, mutmut, dataclasses, uv, ruff, ty, pyproject.toml, packaging
  role: specialist
  scope: implementation
  output-format: code
  related-skills: fastapi-expert, debugging-wizard, test-driven-development
---

# Python Pro

Modern Python specialist tuned to the user's global standards in `~/.claude/CLAUDE.md`. Type-safe, async-aware, test-discipline-focused. Targets **Python 3.13** with the **uv / ruff / ty** toolchain — not the older mypy / black / poetry stack.

## When to Use This Skill

Trigger on:

- Writing or reviewing Python code in any project where the user's global standards apply (default for this user).
- Adding type hints, configuring `ty` in strict mode, designing Protocols / generics / branded types.
- Writing pytest suites — especially when the user mentions edges, errors, property-based, or mutation testing.
- Setting up a new Python project (`uv venv`, `pyproject.toml`, ruff config, ty config).
- Refactoring async code (`asyncio`, task groups, structured concurrency).
- Packaging questions (`uv_build` vs `hatchling`, hash pinning, supply chain).

Do **not** trigger on framework-specific work that has its own skill — FastAPI work goes to `fastapi-expert`, Django to `django-expert` (if added), etc. This skill stays general-purpose.

## Toolchain (Maps to `~/.claude/CLAUDE.md`)

| Purpose | Tool | Notes |
|---------|------|-------|
| Runtime | Python **3.13** | not 3.11+, not 3.12 |
| Deps + venv | `uv` (`uv venv`, `uv pip install`, `uv lock`) | not pip / poetry / pipenv |
| Lint | `ruff check` | replaces flake8, pylint, isort, pyupgrade |
| Format | `ruff format` | replaces black |
| Static types | `ty check` | replaces mypy / pyright; configure strictness via `[tool.ty.rules]` in `pyproject.toml` |
| Tests | `pytest -q` | tests in `tests/` mirroring package structure |
| Property tests | `hypothesis` | for parsers, serialization, algorithms |
| Mutation tests | `mutmut` | to verify tests actually catch bugs |
| Supply chain | `pip-audit` | before deploying; `uv pip install --require-hashes` |
| Build backend | `uv_build` (pure Python) or `hatchling` (extensions) | not setuptools / poetry-core |

**If a tool in the conversation is mypy / black / poetry**: name the modern replacement and explain *why* (speed, stricter defaults, single binary). Don't silently swap — the user may have constraints.

## Core Workflow

1. **Survey** — Read the project's `pyproject.toml`, find the actual toolchain. If it's mypy + black + poetry, ask the user before forcing a migration (the global standards are the default, but specific projects may have reasons).
2. **Design interfaces first** — types/protocols/dataclasses before implementation. Newtype primitives that have semantics (`UserId`, `OrderId`) — don't pass raw `int` around.
3. **Implement** — full type coverage on public APIs; Google-style docstrings only on non-trivial public APIs (don't restate the name).
4. **Test what the code *does*, not how it does it.** See Testing Philosophy below.
5. **Validate** — `ruff check`, `ruff format --check`, `ty check`, `pytest -q`. Fix every warning. Zero-warning baseline, not goal.

## Testing Philosophy

This section deliberately differs from the old skill body. The user's global standards push back against several common pytest practices.

### Test behavior, not implementation

If a refactor breaks your tests but not your code, the tests were wrong. Tests that assert on internal call patterns, private method invocations, or mock-internal state are testing implementation, not behavior.

### Test edges and errors, not just the happy path

Empty inputs, boundaries, malformed data, missing files, network failures, partial reads, off-by-one. Bugs live in edges. Every `except` branch in the code should have a test that triggers it.

```python
@pytest.mark.parametrize('value', ['', '0', '-1', 'a' * 10_000, '\x00', None])
def test_parser_rejects_invalid(value: str | None) -> None:
    with pytest.raises(ValueError):
        parse(value)
```

### Mock boundaries, not logic

Only mock things that are:

- slow (network, filesystem)
- non-deterministic (time, randomness, UUIDs)
- external services you don't control

If you find yourself mocking a class you wrote in the same package, the design is probably wrong — the boundary is in the wrong place. Refactor before mocking.

### Verify tests actually catch failures

Break the code, confirm the test fails, then fix. Or, do it systematically with mutation testing:

```bash
uv pip install mutmut
mutmut run --paths-to-mutate src/
mutmut results
```

A surviving mutant means a line of code can change without any test failing — usually an untested branch.

### Property-based testing for parsers / serialization / algorithms

```python
from hypothesis import given, strategies as st

@given(st.text())
def test_roundtrip(s: str) -> None:
    assert decode(encode(s)) == s

@given(st.lists(st.integers()))
def test_sort_is_idempotent(xs: list[int]) -> None:
    assert sorted(sorted(xs)) == sorted(xs)
```

Use property-based tests as a *complement* to example-based tests, not a replacement. Example tests document expected behavior; property tests find counter-examples.

### Don't chase coverage %

A 95%-covered codebase with no edge-case or error-path tests is more dangerous than a 70%-covered codebase that actually exercises failure modes. **Mutation score > coverage %.** When asked about coverage targets, redirect to mutation testing.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Type System | `references/type-system.md` | Type hints, ty, generics, Protocol, NewType, branded types |
| Async Patterns | `references/async-patterns.md` | async/await, asyncio, task groups, structured concurrency |
| Standard Library | `references/standard-library.md` | pathlib, dataclasses, functools, itertools, contextlib |
| Testing | `references/testing.md` | pytest, fixtures, mocking, parametrize, hypothesis, async testing |
| Packaging | `references/packaging.md` | uv, pyproject.toml, build backends, supply chain hardening |

Note: the references were written for the older mypy / black / poetry stack. The principles transfer; the tool names map as in the Toolchain table above. Don't quote them as-is — translate to the modern toolchain.

## Code Patterns

### Type-annotated function with structured errors

```python
from pathlib import Path

class ConfigError(Exception):
    '''Raised when configuration cannot be loaded or parsed.'''

def read_config(path: Path) -> dict[str, str]:
    '''Parse a key=value config file.

    Args:
        path: Path to the configuration file.

    Returns:
        Parsed key-value entries.

    Raises:
        ConfigError: If the file is missing or contains an invalid line.
    '''
    config: dict[str, str] = {}
    try:
        text = path.read_text()
    except FileNotFoundError as e:
        raise ConfigError(f'config not found: {path}') from e

    for lineno, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep or not key.strip():
            raise ConfigError(f'{path}:{lineno}: invalid line: {line!r}')
        config[key.strip()] = value.strip()
    return config
```

Notes:
- Custom exception type, not a bare `ValueError`. Callers can catch the specific class.
- `raise ... from e` preserves the cause for tracebacks.
- File:line in the error message makes the diagnosis self-describing.
- Skip comments and blanks — the parser's contract should be deliberate, not accidental.

### Newtype for semantic primitives

```python
from typing import NewType

UserId = NewType('UserId', int)
OrderId = NewType('OrderId', int)

def get_user(user_id: UserId) -> User: ...

# `ty check` flags the mistake at the call site:
# get_user(order_id)  # type error: OrderId is not UserId
```

A naked `int` says nothing; a `UserId` says "this is an identity in the user namespace." Cheap, no runtime cost, prevents whole categories of mix-up bugs.

### Async with structured concurrency

```python
import asyncio
import httpx

async def fetch_all(urls: list[str], timeout: float = 10.0) -> list[bytes]:
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(client.get(url)) for url in urls]
    return [t.result().content for t in tasks]
```

`TaskGroup` (3.11+) is preferable to `asyncio.gather` for new code — failures propagate as a single exception group rather than silently completing.

### Dataclass with validation

```python
from dataclasses import dataclass, field

@dataclass(frozen=True, slots=True)
class AppConfig:
    host: str
    port: int
    debug: bool = False
    allowed_origins: tuple[str, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if not (1 <= self.port <= 65535):
            raise ValueError(f'invalid port: {self.port}')
```

`frozen=True` makes instances hashable and prevents accidental mutation. `slots=True` is a cheap memory win. Use `tuple` instead of `list` for default factories on frozen dataclasses — lists aren't hashable.

### pyproject.toml shape

```toml
[project]
name = 'my-package'
version = '0.1.0'
requires-python = '>=3.13'

[build-system]
requires = ['uv_build']
build-backend = 'uv_build'

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ['E', 'F', 'I', 'B', 'UP', 'SIM', 'RUF']

[tool.ty.rules]
strict = true

[tool.pytest.ini_options]
minversion = '8.0'
addopts = ['-ra', '--strict-markers']
testpaths = ['tests']
```

No `--cov-fail-under` — see Testing Philosophy.

## Constraints

### Apply by default

- **Type hints on all public APIs.** Internal helpers can skip if obvious.
- **`X | None`** instead of `Optional[X]` (3.10+).
- **`list[int]`** instead of `List[int]` (3.9+).
- **Absolute imports only.** No `..` relative paths beyond a single level.
- **Google-style docstrings** on non-trivial public APIs. Don't restate the name; explain the contract.
- **Async/await for I/O.** Don't mix `requests` and `asyncio` in the same module.
- **Dataclasses (or Pydantic v2 if validation is needed)** over manual `__init__`.
- **Context managers** for any resource that has a lifecycle.
- **`pathlib.Path`** not `os.path`. The `os.path` API is legacy.

### Avoid

- **`mypy`** — use `ty`. If a project already uses mypy, ask before migrating; don't silently keep using mypy.
- **`black` + `isort`** — use `ruff format` + `ruff check --select I`. Single binary, faster, stricter defaults.
- **`poetry` / `pipenv` / raw `pip`** — use `uv`. 10-100x faster, deterministic locks, hash pinning.
- **Mutable default arguments.** `def f(x=[]):` is a footgun — use `def f(x=None): x = x or []`.
- **Bare `except:`** clauses. Either name the exception type or let it propagate.
- **Hardcoded secrets / config.** Environment variables + `.env` (gitignored).
- **Deprecated stdlib.** `pathlib` over `os.path`; `dataclasses` over namedtuples for new code; `enum.StrEnum` (3.11+) for string enums.
- **Coverage % as a quality target.** See Testing Philosophy.

## Output Templates

When implementing Python features, provide:

1. **Module file** with complete type hints, docstrings on public APIs, no dead code.
2. **Test file** with happy path + edge cases + error paths. Hypothesis test if the function is a parser / serializer / pure algorithm.
3. **Validation output** — what `ruff check`, `ty check`, `pytest -q` produce. Run them if the environment supports it; otherwise show the expected clean output.
4. **One-paragraph explanation** of any non-obvious design choice (Newtype usage, async strategy, error class hierarchy). Don't explain what the code already says.

## Knowledge Reference

Python 3.13, typing module, `ty` (type checker), `ruff` (lint + format), `uv` (deps + venv + lock), pytest 8+, hypothesis, mutmut, pip-audit, dataclasses, async/await, asyncio TaskGroup, pathlib, functools, itertools, contextlib, `collections.abc`, Protocol, NewType, branded types, structured exception hierarchies, structured logging (stdlib `logging` or `structlog`), Pydantic v2 (when validation is part of the API contract), `uv_build` and `hatchling` build backends, `--require-hashes` supply-chain hardening.
