---
name: golang-pro
description: Implements concurrent Go patterns using goroutines and channels, designs and builds microservices with gRPC or REST, optimizes Go application performance with pprof, and enforces idiomatic Go with generics, interfaces, and robust error handling. Use when building Go applications requiring concurrent programming, microservices architecture, or high-performance systems. Invoke for goroutines, channels, Go generics, gRPC integration, CLI tools, benchmarks, or table-driven testing.
---

# Golang Pro

Go 1.24+, concurrent and cloud-native systems. Toolchain: see your always-on
global standards (already in context) (standard toolchain, table-driven tests, `-race`).

## The one mistake worth flagging every time: over-structifying

Go is not Java. The reflex to catch in review: wrapping stateless logic in a
`FooManager`/`FooService`/`FooUtil` struct and defining an interface "just in case."

- **The package is the unit of namespacing, not the struct.** A struct with no
  state whose only job is grouping methods is a package of functions wearing a
  costume — hoist the methods to package-level functions instead.
- **A struct earns its place only when it holds state a method operates on** —
  a client, a connection, a buffer, accumulated config. No state, no type.
- **Interfaces belong where they're consumed, not where they're produced.**
  Constructors return concrete types (`NewT(...) (*T, error)`), never
  interfaces — the caller defines the interface it needs, not the package.

```go
// Before: struct posing as a namespace, no state anywhere
type UserValidator struct{}
func (UserValidator) Validate(u User) error { ... }

// After: it was always just a function
func ValidateUser(u User) error { ... }
```

## What golangci-lint won't catch

`unused`, `staticcheck`, and `revive`'s `exported`/stutter checks flag some
symptoms (dead exported methods, `user.UserService` stutter) but not the root
pattern above — a `FooManager` with real callers passes lint clean. This one
needs a human (or reviewer) reading for shape, not a linter.

## Go 1.23/1.24 syntax models often miss

- **Range-over-func iterators** (1.23): a function shaped
  `func(yield func(V) bool)` (or `func(yield func(K, V) bool)`) works directly
  in `for range` — prefer this over building a slice or channel just to expose
  a sequence.
- **Generic type aliases** (1.24): `type Set[T comparable] = map[T]bool` —
  aliases can now take type parameters, not just plain defined types.
