---
name: typescript-pro
description: Implements advanced TypeScript type systems, creates custom type guards, utility types, and branded types, and configures tRPC for end-to-end type safety. Use when building TypeScript applications requiring advanced generics, conditional or mapped types, discriminated unions, monorepo setup, or full-stack type safety with tRPC.
---

# TypeScript Pro

Toolchain: see your always-on global standards (already in context) (oxlint, oxfmt, vitest, `tsc --noEmit`, Node 22 ESM).

Tests live colocated with source as `*.test.ts`, not in a separate `tests/` tree.

## Supply chain — beyond `pnpm audit`

```sh
pnpm config set minimumReleaseAge 1440   # 24h publish delay before a version is installable
pnpm config set ignore-scripts true      # blocks postinstall supply-chain attacks
```

Neither is a pnpm default. Set both on every project.

## oxlint plugins to enable

`oxlint` ships most plugins off by default — enable `typescript`, `import`, and
`unicorn` explicitly, or whole rule categories are silently skipped.

## tsconfig flags beyond `strict: true`

`strict: true` alone misses real gaps. Add `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, and
`noPropertyAccessFromIndexSignature` — each catches a bug class `strict` mode
doesn't. Turning on `verbatimModuleSyntax` also means a plain
`import Foo from './foo'` for a type-only import now errors — it must be
`import type Foo from './foo'`.

## tRPC monorepos

The client's type safety comes from importing the server's `AppRouter` *type*
only (`import type { AppRouter } from '../server'`) — a value import pulls
server code into the client bundle. Keep router and client in the same
workspace so `tsc` project references pick up router changes without a build
step.

## No enums

Use `as const` objects instead of TS `enum` — enums don't tree-shake and
generate non-obvious runtime JS (reverse mappings for numeric enums). Models
still reach for `enum` by default; steer away from it.
