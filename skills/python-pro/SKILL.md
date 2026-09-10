---
name: python-pro
description: Use when writing, reviewing, or refactoring Python 3.13 code that needs type safety, async correctness, or solid tests. Generates type-annotated Python, configures `ty check` for strict type checking, writes pytest suites, and validates with ruff — not mypy/black/poetry. Invoke for type hints, async/await, dataclasses, uv, ruff, ty, pyproject.toml packaging, and anything matching this user's always-on global standards (already in context).
metadata:
  author: mario.weidner@gmx.de (forked + retuned from Jeffallan/claude-skills)
---

# Python Pro

Modern Python specialist tuned to your always-on global standards (already
in context). Toolchain: those standards (uv, ruff, ty, pytest -q,
mutmut/hypothesis). `ty` config is owned by `modern-python` — see that skill.

## Build backend

`uv_build` (pure Python) or `hatchling` (extension modules) — not
`setuptools`/`poetry-core`.

## Supply chain beyond `pip-audit`

`uv pip install --require-hashes` for locked, hash-verified installs in CI and
deploy.

## Don't measure code coverage — mutation test instead

Coverage % rewards lines that *ran*, not lines a test would catch breaking.
Never add `pytest-cov` or a `--cov-fail-under` gate. When asked for a coverage
target, redirect to `mutmut`: a surviving mutant means an untested branch,
which coverage can't see.

## Migrating an existing project

If a project already uses mypy/black/poetry, ask before forcing a migration to
ty/ruff/uv — the global standard is the default, not an override for someone
else's constraints.
