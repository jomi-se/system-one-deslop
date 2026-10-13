# `if err != nil`: A Love Story (With Coping Strategies)

Every Go codebase has a moment where you scroll through a function and realize half of it is the same three lines:

```go
if err != nil {
    return err
}
```

It's like a chorus that never stops. Some people find it comforting, some find it exhausting, and most of us have felt both on the same afternoon. The Go team spent years looking at syntax proposals (`try`, `check/handle`, `?`) and in 2025 officially said they're done pursuing language changes for this. So the boilerplate isn't going anywhere, but we can write it better and sometimes write less of it.

## Quick refresher: errors are just values

In Go an error is anything that implements:

```go
type error interface {
    Error() string
}
```

There's no special control flow and no stack unwinding. A function returns an error, and you decide what to do with it. That's the whole philosophy. It's verbose, but it's also why you can read a Go function top to bottom and know exactly where it can bail out.

Most of the real work is in deciding how to return an error.

### Wrap with context

A bare `return err` from five layers deep gives you something like `connection refused`, which tells you nothing about where it happened. Add context with `%w`:

```go
user, err := s.repo.GetUser(ctx, id)
if err != nil {
    return fmt.Errorf("get user %s: %w", id, err)
}
```

Now the message reads like a breadcrumb trail: `handle checkout: get user 42: dial tcp: connection refused`. The `%w` verb keeps the original error in the chain, so callers can still inspect it.

### Inspect with `errors.Is` and `errors.As`

Don't compare errors with `==` once wrapping is involved. Use:

```go
if errors.Is(err, sql.ErrNoRows) {
    return nil, ErrUserNotFound
}

var pgErr *pgconn.PgError
if errors.As(err, &pgErr) && pgErr.Code == "23505" {
    return ErrDuplicateEmail
}
```

`errors.Is` checks for a specific value anywhere in the chain. `errors.As` finds a specific type and gives you access to its fields. Between those two, sentinel errors (`var ErrUserNotFound = errors.New(...)`) and custom error types cover pretty much every case we have.

One rule worth agreeing on: **wrap at boundaries, translate at layers.** The repo layer shouldn't leak `sql.ErrNoRows` up to HTTP handlers. Translate it into a domain error so the handler can map it to a 404 without importing `database/sql`.

## Patterns that cut down the repetition

None of these replace `if err != nil` entirely, and you shouldn't want them to. But each one is good at a particular kind of repetition.

### 1. The sticky error (aka `errWriter`)

This one comes from Rob Pike's "Errors are values" post. If you're doing a bunch of sequential operations on the same thing, stash the first error and make later calls no-ops:

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

func writeReport(w io.Writer, r Report) error {
    ew := &errWriter{w: w}
    ew.write(r.Header())
    ew.write(r.Body())
    ew.write(r.Footer())
    return ew.err
}
```

You end up with one check instead of three. `bufio.Scanner` works the same way: you loop on `Scan()` and check `Err()` once at the end. It's a good fit for encoders, builders, and protocol writers.

### 2. Deferred wrapping

If every return in a function wraps with the same prefix, do it once in a `defer` with a named return:

```go
func (s *Service) LoadUser(ctx context.Context, id string) (_ *User, err error) {
    defer func() {
        if err != nil {
            err = fmt.Errorf("load user %s: %w", id, err)
        }
    }()

    u, err := s.repo.GetUser(ctx, id)
    if err != nil {
        return nil, err
    }
    if err := s.enrich(ctx, u); err != nil {
        return nil, err
    }
    return u, nil
}
```

The checks are still there, but they're back to plain `return err` and the context lives in one spot. Watch out for shadowing, though. `if err := ...; err != nil { return nil, err }` is fine because the `return` assigns to the named result. Just don't capture a shadowed `err` in the closure itself.

### 3. Don't drop `Close()` errors

This one's less about saving lines and more about not silently losing errors. `defer f.Close()` throws away the close error, and on writes that can mean data didn't actually hit disk. `errors.Join` (Go 1.20+) makes this tidy:

```go
func writeFile(path string, data []byte) (err error) {
    f, err := os.Create(path)
    if err != nil {
        return err
    }
    defer func() {
        err = errors.Join(err, f.Close())
    }()

    _, err = f.Write(data)
    return err
}
```

`errors.Join` returns `nil` if everything is `nil`, and `errors.Is`/`errors.As` work across all the joined errors.

### 4. Steps as a slice

When you have a pipeline of independent steps that all have the same signature, loop over them:

```go
func (o *Order) Process(ctx context.Context) error {
    steps := []struct {
        name string
        fn   func(context.Context) error
    }{
        {"validate", o.validate},
        {"reserve inventory", o.reserve},
        {"charge card", o.charge},
        {"send receipt", o.notify},
    }
    for _, s := range steps {
        if err := s.fn(ctx); err != nil {
            return fmt.Errorf("%s: %w", s.name, err)
        }
    }
    return nil
}
```

You get one check, consistent wrapping, and adding a step is a one-line change. Don't force it, though. If steps pass data to each other, this pattern gets awkward fast and plain sequential code is clearer.

### 5. Collect, don't bail (validation)

For validation you usually want *all* the problems, not just the first:

```go
func (r CreateUserReq) Validate() error {
    var errs []error
    if r.Email == "" {
        errs = append(errs, errors.New("email is required"))
    }
    if len(r.Password) < 12 {
        errs = append(errs, errors.New("password too short"))
    }
    return errors.Join(errs...)
}
```

Users get every issue in one response, and the code has no early returns at all.

### 6. `must` helpers, but only where panics are okay

```go
func must[T any](v T, err error) T {
    if err != nil {
        panic(err)
    }
    return v
}

var tmpl = must(template.ParseFS(templates, "*.html"))
```

This is great for package init, tests, and CLI scaffolding, where a failure means the program is broken anyway. **Never** use it in request paths. A panic in a handler is a bad day.

## What not to do

- **Log and return.** Pick one. If you log and then return, the same error gets logged at every layer and our logs turn into an echo chamber. Return errors up and log once at the top, usually in the handler or middleware.
- **`_ = doThing()`** without a comment. If you're deliberately ignoring an error, say why.
- **String matching** with `strings.Contains(err.Error(), "not found")`. That's what `errors.Is` is for.
- **Generic wrapper libraries** that try to fake exceptions. They fight the language, and the language wins.

## TL;DR

`if err != nil` is staying, so make each one count: wrap with context, translate at layer boundaries, and inspect with `Is`/`As`. When the repetition is genuinely noisy, reach for sticky errors, deferred wrapping, step loops, or `errors.Join`. When it isn't, just write the check. It's three lines, and the next person debugging at 2am will know exactly where things went sideways.

Got a pattern I missed? Drop it in the channel and let's argue about it.
