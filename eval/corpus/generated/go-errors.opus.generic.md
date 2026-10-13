# Error Handling in Go: Living With `if err != nil`

Most people who learn Go end up typing `if err != nil` hundreds of times. Some find it tedious and others find it reassuring, and many feel both.

This post explains why Go handles errors this way, how to make your errors more useful, and several patterns that cut down on repetitive checks while keeping the code honest.

## Errors Are Just Values

In Go, an error is any type that implements a single method:

```go
type error interface {
    Error() string
}
```

There are no exceptions and no hidden control flow. A function that can fail returns an `error` as its last value, and the caller decides what to do with it:

```go
f, err := os.Open("config.json")
if err != nil {
    return fmt.Errorf("open config: %w", err)
}
defer f.Close()
```

The verbosity is deliberate. Every place where something can go wrong is visible in the source, so reading a function tells you exactly where it can exit early. Nothing is thrown from three calls deep and caught somewhere you didn't expect.

Errors are ordinary values, so you can store them, compare them, wrap them, and pass them around. The patterns later in this post depend on that.

## Make Your Errors Useful First

Before reducing the number of checks, make sure each check adds something. An error that just says `file not found` is hard to trace in a large program. Add context as the error travels up the stack:

```go
if err != nil {
    return fmt.Errorf("load user %d: %w", id, err)
}
```

The `%w` verb wraps the original error, which keeps it available for inspection. Callers can then use `errors.Is` and `errors.As`:

```go
var ErrNotFound = errors.New("not found")

if errors.Is(err, ErrNotFound) {
    // handle the missing case
}

var pathErr *fs.PathError
if errors.As(err, &pathErr) {
    log.Printf("failed on path %s", pathErr.Path)
}
```

Use **sentinel errors** like `ErrNotFound` when callers only need to know *which* failure happened. Use **custom error types** when they need structured details. When several independent things fail, `errors.Join` (Go 1.20+) combines them into one error that still works with `errors.Is`.

Once your errors carry good context, you can start removing the repetition around them.

## Pattern 1: The Sticky Error Writer

Rob Pike's essay *Errors are values* includes a well-known example. Suppose you're writing many fields in sequence:

```go
_, err = w.Write(header)
if err != nil {
    return err
}
_, err = w.Write(body)
if err != nil {
    return err
}
_, err = w.Write(footer)
if err != nil {
    return err
}
```

You can move the error into a small type that remembers the first failure and ignores every call after it:

```go
type errWriter struct {
    w   io.Writer
    err error
}

func (ew *errWriter) write(p []byte) {
    if ew.err != nil {
        return
    }
    _, ew.err = ew.w.Write(p)
}
```

Now the calling code reads like a straight line:

```go
ew := &errWriter{w: w}
ew.write(header)
ew.write(body)
ew.write(footer)
return ew.err
```

The standard library uses the same idea. `bufio.Scanner` lets you loop with `Scan()` and check `Err()` once at the end, and `bufio.Writer` defers write errors until `Flush`.

**When to use it:** a series of similar operations where you only care whether all of them succeeded.

## Pattern 2: A Slice of Steps

When a function runs several independent stages, put them in a slice and loop over it:

```go
func setup() error {
    steps := []struct {
        name string
        fn   func() error
    }{
        {"validate config", validateConfig},
        {"run migrations", migrate},
        {"seed data", seed},
    }

    for _, s := range steps {
        if err := s.fn(); err != nil {
            return fmt.Errorf("%s: %w", s.name, err)
        }
    }
    return nil
}
```

One check covers every stage, and each error still says which stage failed. Adding a new step takes one line.

## Pattern 3: Wrap Once With `defer`

Many functions wrap every error the same way, with the same prefix. A deferred helper can do that wrapping in one place, provided the function uses a named return value:

```go
func wrap(errp *error, format string, args ...any) {
    if *errp != nil {
        *errp = fmt.Errorf(format+": %w", append(args, *errp)...)
    }
}

func LoadConfig(path string) (cfg *Config, err error) {
    defer wrap(&err, "load config %q", path)

    data, err := os.ReadFile(path)
    if err != nil {
        return nil, err
    }
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, err
    }
    return cfg, nil
}
```

The checks remain, but each one is now a bare `return`, and the context is written once. Go's own `pkgsite` project uses this pattern.

## Pattern 4: Don't Lose Errors in `defer`

`defer f.Close()` is idiomatic, but it silently discards the error from `Close`. For files you write to, that error matters, because a failed flush means data loss. A named return with `errors.Join` handles it in one line:

```go
func save(path string, data []byte) (err error) {
    f, err := os.Create(path)
    if err != nil {
        return err
    }
    defer func() { err = errors.Join(err, f.Close()) }()

    _, err = f.Write(data)
    return err
}
```

## Pattern 5: `Must` for Things That Cannot Fail at Runtime

Some errors can only come from programmer mistakes, such as a malformed regular expression literal or a broken embedded template. For package-level initialization, panicking is acceptable, and the standard library follows this convention with `regexp.MustCompile` and `template.Must`. With generics you can write your own:

```go
func Must[T any](v T, err error) T {
    if err != nil {
        panic(err)
    }
    return v
}

var tmpl = Must(template.ParseFS(files, "*.html"))
```

Keep `Must` out of request handlers and other runtime code paths. It's meant for program startup.

## When to Leave the Checks Alone

Not every repeated `if err != nil` is a problem. If each check handles a failure differently, by retrying, falling back, logging, or returning a specific status code, then the repetition is doing real work, and hiding it behind an abstraction makes the code harder to read.

Look for the specific smell: identical checks that add no information. Those are the ones worth consolidating.

## Wrapping Up

Go's error handling is explicit by design, and the explicitness pays off when you're debugging production at 2 a.m. Because errors are plain values, you don't have to accept unlimited boilerplate. To recap:

- Wrap errors with `%w` and inspect them with `errors.Is` and `errors.As`.
- Use sticky error types for sequences of similar operations.
- Loop over a slice of steps for multi-stage workflows.
- Add context once with a deferred wrapper.
- Capture cleanup errors with `errors.Join`.
- Reserve `Must` for initialization.

Write the checks that carry meaning and use these patterns to remove the ones that don't.
