# Go error handling without quite so many `if`s

A configuration loader often starts like this:

```go
data, err := os.ReadFile(path)
if err != nil {
    return Config{}, err
}

var cfg Config
if err := json.Unmarshal(data, &cfg); err != nil {
    return Config{}, err
}
```

There are two operations and two checks. Add validation, a credentials file, and a lookup, and the function begins to feel like a staircase of `if err != nil`.

Those checks do useful work, though. A failed read means there is nothing to decode. A failed decode means there is no valid configuration to use. Removing either check would require some other mechanism to preserve that control flow.

Go represents ordinary failures as values. Functions commonly return a result and an `error`; a nil error means success. The caller decides whether to return, retry, recover, or continue with a fallback. That explicit decision is valuable, but it doesn’t have to occupy every layer of a program.

The useful question is where each decision belongs, and whether several operations share the same failure policy.

## Give the caller enough information to act

Suppose the loader returns `permission denied`. Somewhere above it, the program prints that message and exits. The user knows access failed, but cannot tell whether the problem concerns the configuration, a certificate, or an output directory.

Add context where the operation becomes meaningful:

```go
data, err := os.ReadFile(path)
if err != nil {
    return Config{}, fmt.Errorf("read config %q: %w", path, err)
}
```

The `%w` verb preserves the original error inside the new one. The message becomes more useful without forcing callers to parse text to understand the cause:

```go
cfg, err := loadConfig(path)
if errors.Is(err, fs.ErrNotExist) {
    cfg = defaultConfig()
} else if err != nil {
    return err
}
```

Here, a missing file has a recovery policy. Other failures still propagate. `errors.Is` follows wrapped errors, so adding context inside `loadConfig` does not break this decision.

When recovery depends on information carried by a particular error type, use `errors.As`:

```go
var pathErr *os.PathError
if errors.As(err, &pathErr) {
    // pathErr.Op and pathErr.Path are available here.
}
```

Wrapping every return mechanically can produce messages full of function names and little useful information. Add details the caller would otherwise lack: which resource, which operation, perhaps which record. Usually, return the error through intermediate layers and log it where the application decides what happens next. Logging it at every return tends to produce several reports of the same failure.

## Check a sequence of writes once

Now consider a report generator:

```go
fmt.Fprintf(dst, "Account: %s\n", account.Name)
fmt.Fprintf(dst, "Balance: %d\n", account.Balance)
fmt.Fprintln(dst, "End of report")
```

This is compact, but every call returns an error that the code discards. Checking all three calls would be correct. For a longer report, it would also obscure the document’s structure.

These operations share a policy: after the first failed write, stop sending output and eventually return that failure. A writer can remember it:

```go
type errorWriter struct {
    dst io.Writer
    err error
}

func (w *errorWriter) Write(p []byte) (int, error) {
    if w.err != nil {
        return 0, w.err
    }

    n, err := w.dst.Write(p)
    w.err = err
    return n, err
}
```

The report code can then check once:

```go
w := &errorWriter{dst: dst}

fmt.Fprintf(w, "Account: %s\n", account.Name)
fmt.Fprintf(w, "Balance: %d\n", account.Balance)
fmt.Fprintln(w, "End of report")

return w.err
```

The individual return values are intentionally unused because the wrapper retains the first failure. Later calls return that same error without touching the destination.

This works because the operations have the same consequence when they fail. If one write should be retried and another should trigger a fallback, the wrapper would conceal decisions that belong in the calling code.

It also doesn’t make the output atomic. The destination may contain half a report when the function returns an error. If partial output is unacceptable, you need a separate strategy, such as writing a temporary file and replacing the destination after successful completion.

For buffered output, `bufio.Writer` already remembers write failures. You can often use it instead of building a wrapper, then check `Flush`. Remember that buffering delays writes: successful formatting calls do not establish that the destination received the data.

## Let a helper own a complete operation

An HTTP handler reads configuration, validates it, and starts constructing a response. Each failure branch sends an HTTP error. Soon the handler repeats both the checks and the response policy.

Move the coherent operation into a helper:

```go
func loadConfig(path string) (Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return Config{}, fmt.Errorf("read config %q: %w", path, err)
    }

    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return Config{}, fmt.Errorf("decode config %q: %w", path, err)
    }

    return cfg, nil
}
```

The handler now makes one application-level decision about a configuration-loading failure.

The checks still exist, but they sit beside the operations they protect. That is often enough. A helper earns its place by owning a meaningful operation, its intermediate state, and its error context. Extracting every three-line check into a function usually just makes the reader jump around.

## Don’t lose the last error

A file exporter writes successfully and returns nil, but its deferred `Close` fails. The caller has been told the export succeeded even though the final operation reported a failure.

For an output file, handle closing as part of completing the operation:

```go
writeErr := writeReport(f)
closeErr := f.Close()
return errors.Join(writeErr, closeErr)
```

`errors.Join` preserves both failures and returns nil when both inputs are nil. This is useful when a write fails and closing also fails; neither error needs to disappear.

The broader pattern is to place checks at boundaries that have enough information to make a decision. Sometimes that boundary follows one operation. Sometimes it follows a whole sequence managed by a writer or a helper. Keep the failure visible to whoever must act on it, and the surrounding code can become considerably easier to read.
