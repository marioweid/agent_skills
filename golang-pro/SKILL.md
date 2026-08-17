---
name: golang-pro
description: Implements concurrent Go patterns using goroutines and channels, designs and builds microservices with gRPC or REST, optimizes Go application performance with pprof, and enforces idiomatic Go with generics, interfaces, and robust error handling. Use when building Go applications requiring concurrent programming, microservices architecture, or high-performance systems. Invoke for goroutines, channels, Go generics, gRPC integration, CLI tools, benchmarks, or table-driven testing.
license: MIT
metadata:
  author: https://github.com/Jeffallan
  version: "1.1.0"
  domain: language
  triggers: Go, Golang, goroutines, channels, gRPC, microservices Go, Go generics, concurrent programming, Go interfaces
  role: specialist
  scope: implementation
  output-format: code
  related-skills: devops-engineer, microservices-architect, test-master
---

# Golang Pro

Senior Go developer with deep expertise in Go 1.21+, concurrent programming, and cloud-native microservices. Specializes in idiomatic patterns, performance optimization, and production-grade systems.

## Core Workflow

1. **Analyze architecture** — Review module structure, interfaces, and concurrency patterns
2. **Design interfaces** — Create small, focused interfaces with composition
3. **Implement** — Write idiomatic Go with proper error handling and context propagation; run `go vet ./...` before proceeding
4. **Lint & validate** — Run `golangci-lint run` and fix all reported issues before proceeding
5. **Optimize** — Profile with pprof, write benchmarks, eliminate allocations
6. **Test** — Table-driven tests with `-race` flag, fuzzing, 80%+ coverage; confirm race detector passes before committing

## Code Organization: Structs, Methods, and Functions

Go is not Java. The common shape mistake is **over-structifying** — wrapping everything in `Manager`/`Service`/`Util` types and defining interfaces "just in case." Let the idiom decide the unit of code.

### The package is the primary unit, not the type

- Group code into **packages by responsibility**. Namespacing is the package's job, not a struct's — don't create a struct just to hang related functions off it.
- **Free (package-level) functions are idiomatic.** A stateless transformation is a function, not a method. Reach for a function first.

### When a struct + methods earns its place

- The type holds **state that methods operate on** — a client, a connection pool, accumulated config, a buffer.
- Behavior is genuinely tied to that data (`(s *Server) Handle(...)`).

**The Go tell (opposite of Python's):** a struct with no meaningful state whose only purpose is to group methods — a `FooManager`/`FooService` that's really a namespace — should usually be package-level functions instead. A struct is for state, a package is for grouping.

### Idiomatic Go, not Java-in-Go

| Avoid | Prefer |
|-------|--------|
| Getters/setters (`GetName` / `SetName`) | Export the field; use a method only when access needs logic — and name it `Name()`, not `GetName()` |
| `Manager` / `Service` / `Util` structs as namespaces | Package-level functions; packages for grouping |
| Defining an interface on the producer side | **Accept interfaces, return concrete structs** — define the interface where it's *consumed* |
| Large "just in case" interfaces | Small interfaces (1–3 methods); often one method (`io.Reader`) |
| Inheritance mindset | Composition via **embedding**; interface satisfaction is implicit |
| Stutter (`http.HTTPServer`, `user.UserService`) | `http.Server`, `user.Service` |

- **Constructors:** `NewT(...) (*T, error)` — return the concrete type, not an interface.
- **Optional config:** functional options (`WithTimeout(...)`), not giant parameter lists or config-struct sprawl.
- Keep a type's method set small and focused. Prefer composition (embedding) over deep type hierarchies.

**The test:** before adding a struct, an interface, *or* a method, ask — *would a senior Go engineer say this is idiomatic, or Java dressed up in Go?* If a package function does the job, write the function. Add types and interfaces only where state or a real consumer contract requires them.

### Wiring: dependency injection, context, thin handlers

- **Inject dependencies via the constructor.** `NewT(deps...) (*T, error)` takes what the type needs — don't reach for package globals or a service locator. Take concrete types, or small consumer-defined interfaces where a test seam helps.
- **Bundle shared singletons in one struct.** When many handlers need the same app-scoped state (db, logger, config), hang them on a single `App`/`Server` struct passed once, rather than many package-level accessors. Use `context.Context` for request-scoped values, not for dependencies.
- **Handlers are thin.** An `http.HandlerFunc` decodes the request, calls a method on the service, and encodes the response — orchestration lives on the service, not in the handler.

## Reference Guide

Load detailed guidance based on context:

| Topic | Reference | Load When |
|-------|-----------|-----------|
| Concurrency | `references/concurrency.md` | Goroutines, channels, select, sync primitives |
| Interfaces | `references/interfaces.md` | Interface design, io.Reader/Writer, composition |
| Generics | `references/generics.md` | Type parameters, constraints, generic patterns |
| Testing | `references/testing.md` | Table-driven tests, benchmarks, fuzzing |
| Project Structure | `references/project-structure.md` | Module layout, internal packages, go.mod |

## Core Pattern Example

Goroutine with proper context cancellation and error propagation:

```go
// worker runs until ctx is cancelled or an error occurs.
// Errors are returned via the errCh channel; the caller must drain it.
func worker(ctx context.Context, jobs <-chan Job, errCh chan<- error) {
    for {
        select {
        case <-ctx.Done():
            errCh <- fmt.Errorf("worker cancelled: %w", ctx.Err())
            return
        case job, ok := <-jobs:
            if !ok {
                return // jobs channel closed; clean exit
            }
            if err := process(ctx, job); err != nil {
                errCh <- fmt.Errorf("process job %v: %w", job.ID, err)
                return
            }
        }
    }
}

func runPipeline(ctx context.Context, jobs []Job) error {
    ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
    defer cancel()

    jobCh := make(chan Job, len(jobs))
    errCh := make(chan error, 1)

    go worker(ctx, jobCh, errCh)

    for _, j := range jobs {
        jobCh <- j
    }
    close(jobCh)

    select {
    case err := <-errCh:
        return err
    case <-ctx.Done():
        return fmt.Errorf("pipeline timed out: %w", ctx.Err())
    }
}
```

Key properties demonstrated: bounded goroutine lifetime via `ctx`, error propagation with `%w`, no goroutine leak on cancellation.

## Constraints

### MUST DO
- Use gofmt and golangci-lint on all code
- Add context.Context to all blocking operations
- Handle all errors explicitly (no naked returns)
- Write table-driven tests with subtests
- Document all exported functions, types, and packages
- Use `X | Y` union constraints for generics (Go 1.18+)
- Propagate errors with fmt.Errorf("%w", err)
- Run race detector on tests (-race flag)

### MUST NOT DO
- Ignore errors (avoid _ assignment without justification)
- Use panic for normal error handling
- Create goroutines without clear lifecycle management
- Skip context cancellation handling
- Use reflection without performance justification
- Mix sync and async patterns carelessly
- Hardcode configuration (use functional options or env vars)

## Output Templates

When implementing Go features, provide:
1. Interface definitions (contracts first)
2. Implementation files with proper package structure
3. Test file with table-driven tests
4. Brief explanation of concurrency patterns used

## Knowledge Reference

Go 1.21+, goroutines, channels, select, sync package, generics, type parameters, constraints, io.Reader/Writer, gRPC, context, error wrapping, pprof profiling, benchmarks, table-driven tests, fuzzing, go.mod, internal packages, functional options

[Documentation](https://jeffallan.github.io/claude-skills/skills/language/golang-pro/)
