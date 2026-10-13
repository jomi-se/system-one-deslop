# Go Error Handling, and How to Write Less of It

Here is a function that loads a configuration file. It is ordinary Go, the kind you would write on your first day with the language and still write years later:

```go
func loadConfig(path string) (*Config, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}
```

Four operations, four checks, and roughly half the lines are about failure. People coming from languages with exceptions tend to read this as noise. That reading misses something. Every place this function can fail is visible, and a reviewer can see at a glance that nothing is silently swallowed. Go treats an error as a value returned like any other, and the language gives it no special control flow. The cost is repetition. Most of the useful techniques in Go error handling are ways of keeping that visibility while paying less for it, and a few are ways of making the repetition carry more information.

## Making each check earn its place

Suppose `loadConfig` runs inside a service that also parses request bodies, reads a cache file at startup, and decodes messages off a queue. One morning the logs contain a single line: `unexpected end of JSON input`. Any of a dozen call sites could have produced it, and the error carries nothing that tells you which one.

That is what bare `return nil, err` does at scale. The check is there, but it adds nothing on the way up the stack. The fix is to wrap the error with what this function knows that its caller doesn't:

```go
if err := json.Unmarshal(data, &cfg); err != nil {
	return nil, fmt.Errorf("parsing config %s: %w", path, err)
}
```

Now the log line reads `parsing config /etc/app.json: unexpected end of JSON input`, and you know where to look. The `%w` verb matters here as well as the message. It keeps the original error reachable, so code higher up can still ask what actually went wrong:

```go
cfg, err := loadConfig(path)
if errors.Is(err, fs.ErrNotExist) {
	cfg = defaultConfig()
} else if err != nil {
	return err
}
```

`errors.Is` walks the chain of wrapped errors looking for a match, and `errors.As` does the same for a type, letting you pull out a `*fs.PathError` or your own error struct and inspect its fields. If you had used `%v` instead of `%w`, the message would look identical but the chain would be broken, and the `fs.ErrNotExist` check above would quietly stop working. Wrap with `%w` when callers might reasonably need to inspect the cause. Use `%v` only when you deliberately want to hide an implementation detail from them.

Wrapping doesn't reduce the number of checks. It changes them from bookkeeping into something you will be glad of the next time you're reading logs at 2 a.m., which is usually enough to make them feel less like boilerplate.

## Moving the check out of the sequence

Some code doesn't fit the one-check-per-call shape well. Consider an encoder for a binary file header:

```go
if err := binary.Write(w, binary.LittleEndian, h.Magic); err != nil {
	return err
}
if err := binary.Write(w, binary.LittleEndian, h.Version); err != nil {
	return err
}
if err := binary.Write(w, binary.LittleEndian, h.Flags); err != nil {
	return err
}
// ...and so on for every field and every entry
```

The checks are all the same and none of them adds context worth having. If the third write fails, the fourth will fail too, so there is no reason to handle each one separately. What you want is to stop writing after the first failure and report it at the end. A small type does that:

```go
type errWriter struct {
	w   io.Writer
	err error
}

func (ew *errWriter) write(v any) {
	if ew.err != nil {
		return
	}
	ew.err = binary.Write(ew.w, binary.LittleEndian, v)
}

func (h *Header) Encode(w io.Writer) error {
	ew := &errWriter{w: w}
	ew.write(h.Magic)
	ew.write(h.Version)
	ew.write(h.Flags)
	ew.write(uint32(len(h.Entries)))
	for _, e := range h.Entries {
		ew.write(e.Offset)
		ew.write(e.Length)
	}
	return ew.err
}
```

The error is still checked. It has just moved into the type, where it lives once instead of a dozen times. The standard library uses this "sticky error" design in several places. `bufio.Scanner` lets you call `Scan` in a loop and check `Err()` once afterwards, and `bufio.Writer` remembers the first write failure and returns it from every later call, including `Flush`. The pattern works when the operations form a sequence where any failure invalidates everything after it and the caller only needs to know whether the whole thing succeeded. It works badly when individual steps need different handling or different context, and forcing it onto that kind of code just hides the branching inside a helper where it is harder to follow.

## Errors you were about to drop

The `defer f.Close()` in `loadConfig` is fine because the file is only read. Copy the same line into a function that writes a file and you have a real bug. On many filesystems, buffered data isn't flushed until close, so `Close` can be the call that reports a full disk, and a deferred call's return value is discarded.

A named return value lets the deferred function fold that error into the result:

```go
func writeReport(path string, r *Report) (err error) {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer func() {
		err = errors.Join(err, f.Close())
	}()

	return r.Render(f)
}
```

`errors.Join`, added in Go 1.20, returns nil when both arguments are nil, keeps the single error when only one is set, and combines them when both are. The result still works with `errors.Is` and `errors.As` for either cause. This replaces a fiddly block of "only overwrite `err` if it was nil" logic with one line, and it means a failed render followed by a failed close reports both problems.

None of these techniques removes error handling from Go, and they shouldn't. The aim is to make each `if err != nil` that remains add context a person will read later, and to collapse the ones that only repeat the same information into a single check at the point where the result actually matters.
