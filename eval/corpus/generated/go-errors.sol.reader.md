# Go Errors Without the Copy-Paste Workout

Go error handling has a very recognizable shape:

```go
thing, err := doThing()
if err != nil {
    return err
}
```

Then we do another thing. Then another check. By the end of a moderately interesting function, it can feel like we’re writing an error-handling framework with a little business logic sprinkled in.

Still, the explicitness buys us something useful: we can see where an operation fails, what stops, and what gets returned. The goal isn’t to eliminate every `if err != nil`. It’s to make the checks carry their weight—and move repetitive mechanics into places where they’re easier to reason about.

Start with what an error actually means. In Go, `error` is an interface with one method:

```go
type error interface {
    Error() string
}
```

An error value describes a failure. Returning it gives the caller control over the next move: retry, fall back, reject a request, or give up.

A useful default is to handle errors at the level that has enough context to make that decision. A database helper usually shouldn’t decide whether an HTTP request deserves a 404. Similarly, logging an error and returning it often produces the same failure in three different logs. Give one layer responsibility for reporting it.

When passing an error upward, add context that answers “what were we trying to do?”:

```go
user, err := repo.FindUser(ctx, id)
if err != nil {
    return fmt.Errorf("find user %q: %w", id, err)
}
```

The `%w` preserves the underlying error for inspection. That means callers can use `errors.Is` to recognize a particular error, or `errors.As` to find an error of a particular type, even after wrapping.

Avoid branching on `err.Error()`. Error messages are for humans; changing punctuation shouldn’t break your retry policy.

Also, wrapping is an API decision. If callers can discover a database-specific error through your package, they may start depending on it. Sometimes translating it into a package-level error is the better boundary.

With those basics sorted, how do we reduce the boilerplate?

The first pattern is almost suspiciously ordinary: extract a meaningful operation.

Suppose every handler loads an account, checks its status, and fetches its permissions. Put that sequence behind a function such as `loadActiveAccount`. The helper still contains error checks, but its callers deal with one coherent operation:

```go
account, err := loadActiveAccount(ctx, repo, accountID)
if err != nil {
    return fmt.Errorf("prepare account: %w", err)
}
```

This is worthwhile when the helper has a name that explains the work. If the best name available is `doStepsOneThroughThree`, we may just be hiding the mess in another room.

The payoff is bigger than fewer lines: the helper becomes the place to enforce sequencing, attach useful context, and keep repeated workflows consistent. Don’t extract every three-line block. Extract a concept.

Another useful pattern is an object that remembers its first error. This works especially well when building output through a sequence of writes:

```go
type checkedWriter struct {
    dst io.Writer
    err error
}

func (w *checkedWriter) WriteString(s string) {
    if w.err != nil {
        return
    }
    _, w.err = io.WriteString(w.dst, s)
}
```

The caller can describe the output without checking every write:

```go
w := &checkedWriter{dst: dst}
w.WriteString("BEGIN\n")
w.WriteString(payload)
w.WriteString("\nEND\n")

if w.err != nil {
    return fmt.Errorf("write message: %w", w.err)
}
```

Once a write fails, subsequent writes do nothing. We inspect the accumulated state once, at the end.

This pattern fits a specific situation: later operations have no value after the first failure, and the caller doesn’t need intermediate results. It’s great for a serializer or output builder. It’s much less convincing for a service workflow where each step might need its own recovery policy.

It also doesn’t make output atomic. Some bytes may already have reached the destination. If partial output is unacceptable, you need buffering or another commit mechanism.

A third pattern handles the opposite case: several operations must run even if one fails.

For example, flushing a buffered writer and closing its file are both important. Returning immediately after a failed flush can skip the close. Returning only the close error can lose the flush failure.

`errors.Join` lets us preserve both:

```go
flushErr := buffered.Flush()
closeErr := file.Close()

return errors.Join(flushErr, closeErr)
```

It ignores nil arguments and returns nil when all its arguments are nil. The resulting error still works with `errors.Is` and `errors.As`.

This is useful for cleanup and independent operations. It doesn’t justify continuing through dependent steps: if opening a file fails, trying to read it anyway won’t improve the afternoon.

Finally, resist the temptation to introduce a universal `must` helper that panics whenever it sees an error. It removes checks by changing the failure model. Network timeouts, invalid input, and unavailable dependencies belong in ordinary error handling. Panics are a poor shortcut for those situations.

The same caution applies to clever generic chaining libraries. They can be reasonable within a narrow domain, but saving a few lines is a weak trade if everyone now needs to learn custom control flow.

A good Go function lets us scan the successful path and understand each exit. Sometimes that means a helper, sometimes an accumulated error, and sometimes three perfectly boring checks. Boring is fine. The checks earn their place when they make the behavior obvious.