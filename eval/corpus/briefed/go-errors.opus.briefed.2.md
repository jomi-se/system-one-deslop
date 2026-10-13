# Error Handling in Go, and How to Write Less of It

Here is a function that copies one file to another, written the way most Go programmers write it the first time:

```go
func copyFile(dst, src string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}

	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
```

Three of the operations can fail, and each failure gets its own `if err != nil` block. People who come to Go from languages with exceptions tend to look at this and see noise. The repetition is real, but it comes from something deliberate. In Go an error is an ordinary value returned from a function, usually as the last result, and the language gives it no special control flow. Nothing unwinds the stack on your behalf. If you want the caller to know something went wrong, you return the error, and if you want to ignore it, you have to write the underscore where everyone reviewing the code can see it.

That explicitness is why the rest of this post is about shaping those checks rather than avoiding them. Most of the repetition can be reduced without hiding where failures happen.

## Wrapping errors so they mean something

Suppose a service starts failing in production and the only line in the log is `unexpected EOF`. That message came from somewhere deep in the standard library, possibly `io.ReadFull` or the JSON decoder, and it has been passed straight up through five layers of `return err`. Every layer had the chance to say what it was doing and none of them did, so now you are grepping for call sites.

The fix is to add context at each boundary where it is cheap to do so:

```go
func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("loading config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing config %s: %w", path, err)
	}
	return &cfg, nil
}
```

The `%w` verb wraps the original error instead of flattening it into a string, which matters because callers can still inspect it. `errors.Is(err, fs.ErrNotExist)` will see through any number of wrapping layers to find the sentinel underneath, and `errors.As` will pull out a concrete type such as `*fs.PathError` if you need its fields. A useful habit is to describe what the current function was attempting, in lowercase, without words like "failed" or "error", since the chain of messages will read as `parsing config app.json: unexpected EOF` and the reader already knows it is an error.

## Pushing the error into the thing being worked on

Writing a binary file header is a good example of where explicit checks become genuinely tedious. You might have a dozen fields, each written with `binary.Write`, and each of those calls can fail. Twelve identical `if` blocks would bury the actual layout of the header, which is the part a reader cares about.

When a sequence of operations all act on the same destination, the error can live on a small wrapper that stops doing work once something has gone wrong:

```go
type headerWriter struct {
	w   io.Writer
	err error
}

func (hw *headerWriter) write(v any) {
	if hw.err != nil {
		return
	}
	hw.err = binary.Write(hw.w, binary.LittleEndian, v)
}

func writeHeader(w io.Writer, h Header) error {
	hw := &headerWriter{w: w}
	hw.write(h.Magic)
	hw.write(h.Version)
	hw.write(h.Flags)
	hw.write(uint32(len(h.Entries)))
	return hw.err
}
```

The check still happens on every call, but it happens once, inside `write`, and the function that describes the header now reads like the header. The standard library uses the same idea in several places. `bufio.Scanner` lets you loop over `Scan()` and only asks you to check `Err()` once at the end, and `bufio.Writer` keeps the first error it hits and returns it from `Flush`. The pattern fits best when later operations are meaningless after the first failure and when it costs nothing to skip them, which is true for most sequential encoding and writing.

## Errors from cleanup

Go back to the copy function at the top. The final line returns `out.Close()` instead of deferring it, and that was not an accident. When you write to a file, the operating system may buffer the data and only report a failure, a full disk or a dropped network mount, when the file is closed. A bare `defer out.Close()` throws that error away, and the function reports success for a file that was never fully written.

A named return value and a deferred `errors.Join` handle this without cluttering the happy path:

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

`errors.Join` returns nil when every argument is nil, so a clean run returns nil, a failed write returns the write error, and a failed close is no longer lost.

## Collecting more than one error

Validation is the other place where returning on the first failure is the wrong behavior. If a config file has three bad fields, the person editing it wants to hear about all three at once rather than fixing them across three restarts. Here you append to a slice and join at the end:

```go
func (c Config) Validate() error {
	var errs []error
	if c.Port == 0 {
		errs = append(errs, errors.New("port is required"))
	}
	if c.Timeout < 0 {
		errs = append(errs, fmt.Errorf("timeout %v is negative", c.Timeout))
	}
	return errors.Join(errs...)
}
```

The joined error still works with `errors.Is` and `errors.As`, which check each member.

One shortcut that does not hold up is a helper like `check(err)` that panics, paired with a `recover` at the top of the function. It removes the `if` blocks, but it reintroduces invisible control flow and makes it easy for a panic to escape into code that was never written to expect one. The `Must` functions in the standard library, such as `regexp.MustCompile`, are meant for values known at program start, where a failure is a bug in the source and crashing immediately is the right response. For anything that depends on input, the error belongs in the return value, and the patterns above are usually enough to keep those returns from crowding out the code around them.
