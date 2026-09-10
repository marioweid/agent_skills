---
name: rust-engineer
description: Writes, reviews, and debugs idiomatic Rust code with memory safety and zero-cost abstractions. Implements ownership patterns, manages lifetimes, designs trait hierarchies, builds async applications with tokio, and structures error handling with Result/Option. Use when building Rust applications, solving ownership or borrowing issues, designing trait-based APIs, implementing async/await concurrency, creating FFI bindings, or optimizing for performance and memory safety. Invoke for Rust, Cargo, ownership, borrowing, lifetimes, async Rust, tokio, zero-cost abstractions, memory safety, systems programming.
license: MIT
---

# Rust Engineer

Rust 2024 edition (current stable). Toolchain: see your always-on global
standards (already in context) (clippy `-D warnings`, fmt, test, deny). Two
checks that doesn't list — run both before calling test coverage adequate:

- `cargo careful test` — stdlib debug assertions + UB checks where Miri can't run.
- `cargo mutants` — mutation testing; a surviving mutant is an untested branch.

## Error handling convention

`thiserror` for library crates (typed variants callers can match on), `anyhow`
for binaries (context chains, no public error type to maintain). Log at
boundaries with `tracing` — a bare `println!`/`eprintln!` in library code is a
bug, not a style nit.

## Cargo.toml lint denials — set these, don't rely on clippy defaults

Default clippy warnings don't fail a build. This crate-level config does:

```toml
[lints.clippy]
pedantic = { level = "warn", priority = -1 }
unwrap_used = "deny"
expect_used = "warn"
panic = "deny"
panic_in_result_fn = "deny"
unimplemented = "deny"
dbg_macro = "deny"
todo = "deny"
print_stdout = "deny"
print_stderr = "deny"
await_holding_lock = "deny"
large_futures = "deny"
exit = "deny"
mem_forget = "deny"
allow_attributes = "deny"
module_name_repetitions = "allow"   # pedantic relaxation, too noisy
similar_names = "allow"
```

Every `unsafe` block gets a `// SAFETY:` comment naming the invariant it
upholds — clippy doesn't enforce this, review does.
