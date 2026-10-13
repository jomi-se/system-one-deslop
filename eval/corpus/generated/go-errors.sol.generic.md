# Error Handling in Go Without Drowning in `if err != nil`

Go makes errors visible. A function that can fail usually returns an `error` alongside its result, and the caller decides what happens next:

```go
data, err := os.ReadFile(path)
if err != nil {
    return err
}
```

That explicitness is useful: failure paths sit beside the operations that create them. But a function with several fallible steps can become a wall of nearly identical checks.

The goal is to make each check useful and move repeated mechanics into abstractions that preserve clear failure behavior.

An error is a value describing a failed operation. Returning it transfers responsibility to the caller. Your job at each boundary is to decide whether to recover, translate the failure, add context, or stop.

## Give errors context where it helps

A bare error might say “permission denied.” A useful error tells you which operation failed:

```go
data, err := os.ReadFile(path)
if err != nil {
    return nil, fmt.Errorf("read configuration %q: %w", path, err)
}
```

The `%w` verb wraps the original error. Callers can inspect the underlying cause while humans get a more informative message.

Avoid adding context mechanically at every layer. A chain like “process failed: execute failed: run failed” adds little. Prefer information that changes someone’s understanding: the resource, operation, or relevant identifier.

Likewise, usually handle an error once. Logging it and returning it often produces duplicate messages when the caller also logs. Lower layers can supply context; the application boundary can decide what to show.

## Inspect causes, not strings

Wrapping means direct equality is often insufficient. Use `errors.Is` to recognize a particular error:

```go
if errors.Is(err, fs.ErrNotExist) {
    // Apply the application's missing-file policy.
}
```

Use `errors.As` when you need information carried by a particular error type:

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    fmt.Printf("operation %s failed on %s\n",
        pathErr.Op, pathErr.Path)
}
```

Both functions examine wrapped errors. Comparing error messages is fragile because wording can change, and different failures can produce similar text.

Also, absence is only recoverable when your application says it is. A missing optional preferences file might justify defaults; a missing production configuration probably should stop startup.

## Reduce indentation before reducing checks

Early returns are the simplest improvement:

```go
func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("read config: %w", err)
    }

    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, fmt.Errorf("decode config: %w", err)
    }

    return &cfg, nil
}
```

The successful path stays at one indentation level. The checks are repetitive in syntax, but each marks a distinct operation and supplies distinct context.

Keeping an error variable inside a short `if` statement also limits its scope. That makes accidental reuse and shadowing easier to avoid.

Sometimes this is already the best design. Three clear checks are often easier to understand than a clever abstraction.

## Extract meaningful operations

If the same sequence appears repeatedly, give it a name. Reading and decoding configuration is a coherent operation; a helper can own those checks and expose one result to callers.

Good helpers represent concepts: `loadConfig`, `saveReport`, or `fetchAccount`. Their names explain what succeeds or fails.

A helper whose only purpose is to compress `if err != nil` often moves the syntax without improving the design. Generic “must succeed” functions are particularly risky when they turn ordinary failures into panics.

Extraction works best when it establishes a useful boundary. A caller should be able to understand the helper’s contract without reconstructing every internal step.

## Accumulate errors for a linear sequence

Some operations naturally form a sequence where the first failure makes every later step pointless. Writing a document is a common example.

An error-accumulating writer stores the first error and stops making further writes. Its caller checks once after constructing the output.

The standard library already provides a useful version of this behavior through `bufio.Writer`:

```go
func writeReport(w io.Writer) error {
    b := bufio.NewWriter(w)

    fmt.Fprintln(b, "Monthly report")
    fmt.Fprintln(b, "==============")
    fmt.Fprintln(b, "Revenue: 1200")

    if err := b.Flush(); err != nil {
        return fmt.Errorf("write report: %w", err)
    }
    return nil
}
```

Here, intentionally ignoring the individual formatting calls’ errors works because their write errors are retained by the buffered writer and reported by `Flush`. Subsequent writes also report the stored error.

That reasoning is specific to this arrangement. You cannot assume arbitrary writers, encoders, or clients remember earlier failures. Buffering also delays delivery, which may be inappropriate when immediate output matters.

A custom accumulator can apply the same pattern elsewhere, provided its contract is explicit: preserve the first error, skip dependent operations afterward, and require a final check.

## Keep the failure semantics honest

Reducing checks must not hide partial success. Several successful writes followed by a failed write can leave incomplete output. An accumulator does not provide rollback.

Cleanup needs similar care. `defer file.Close()` releases resources, but discards a possible close error. For output files, closing can reveal a failure that matters to the operation’s success.

Panics are also a poor substitute for ordinary error returns. Missing files, invalid input, and network failures belong in explicit error handling. Reserve panics for situations where continuing violates a program invariant.

Go’s repetition is a design pressure, not a requirement to invent a framework. Start with early returns and useful context. Extract operations when they form real concepts. Accumulate errors when the sequence genuinely stops at its first failure.

The best result is code where the reader can quickly answer three questions: what failed, what happens next, and whether any work already took effect.