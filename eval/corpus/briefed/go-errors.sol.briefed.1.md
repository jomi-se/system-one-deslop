# Go error handling, with fewer repeated checks

A configuration loader reads a file, decodes JSON, and returns a value. In Go, even that small job usually contains two error checks:

```go
func loadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, err
	}
	return cfg, nil
}
```

The repetition is visible, but each check answers a different question. Did the file arrive? Was its content usable? Decoding after a failed read would make the second operation meaningless.

Go treats errors as values returned through ordinary control flow. A caller can return an error, recover from it, or continue with reduced functionality. The language doesn’t choose among those responses.

That leaves some work at every call site. Early returns keep that work manageable: the failure branches end immediately, and successful execution continues down the page without accumulating indentation. Before trying to remove checks, it helps to see whether they represent distinct decisions.

## Add context without losing the cause

Suppose the loader returns `permission denied`. That’s useful information, but a service loading several files still needs to know which operation failed.

The read branch can supply that context:

```go
if err != nil {
	return Config{}, fmt.Errorf("read config %q: %w", path, err)
}
```

The `%w` verb wraps the original error. The message gains context, while callers retain access to the underlying cause:

```go
cfg, err := loadConfig(path)
if errors.Is(err, os.ErrNotExist) {
	cfg = defaultConfig()
	err = nil
}
if err != nil {
	return err
}
```

Here, a missing file is acceptable; malformed JSON and permission failures still stop startup. `errors.Is` examines wrapped errors, so adding context doesn’t break that decision. Direct equality with `os.ErrNotExist` would miss a wrapped sentinel.

When a caller needs details from a particular error type, `errors.As` serves a similar purpose. For example, it can extract an `*os.PathError` through wrapping.

These distinctions matter when refactoring. A helper that replaces every failure with `errors.New("configuration failed")` may shorten the implementation, but it removes information that callers were using to recover.

## Extract an operation that has a name

Three startup paths might each read a file, decode JSON, validate the result, and attach the same context to failures. Fixing a validation bug then requires finding all three copies.

That’s a reasonable place for a helper such as `loadConfig`. Its value is that it owns a complete operation, including the order of steps and the meaning of their failures. Callers get one result to handle.

A helper named `checkError`, by comparison, has little useful policy to own. Should it return, log, retry, or terminate the process? Those choices usually depend on the caller. A helper that panics avoids repeated return statements by changing the program’s behavior, which is a substantial tradeoff for expected failures such as missing files.

Look for repeated operations before extracting repeated syntax. Reading and validating a configuration has a useful boundary; handling every possible error throughout an application usually doesn’t.

## Remember the first failure in a sequence of writes

A report generator writes a heading, several rows, and a footer. Every write has the same policy: after one fails, stop producing output and return that failure.

Checking each call repeats a decision that never changes. A small writer can remember it:

```go
type errWriter struct {
	w   io.Writer
	err error
}

func (w *errWriter) Write(p []byte) (int, error) {
	if w.err != nil {
		return 0, w.err
	}
	n, err := w.w.Write(p)
	w.err = err
	return n, err
}
```

The report can then use ordinary formatting functions:

```go
ew := &errWriter{w: dst}

fmt.Fprintln(ew, "Inventory")
for _, item := range items {
	fmt.Fprintf(ew, "%s\t%d\n", item.Name, item.Count)
}
fmt.Fprintln(ew, "End")

return ew.err
```

Ignoring those individual return values is intentional: the wrapper records the first write error and prevents subsequent writes from reaching the destination. The loop still runs, though, so this pattern is less attractive if producing each row involves expensive work.

It also covers only write failures. If fetching an item can fail, that operation still needs its own handling.

Existing types sometimes provide this behavior already. A `bufio.Writer` remembers write errors, but buffering adds another obligation: check `Flush`, because data accepted into memory may fail when sent to the destination.

## Collect failures when the checks are independent

A settings form has an empty name and an invalid port. Returning after detecting the name forces the user through another submission before discovering the port problem.

Both checks can run independently, so validation can collect their errors:

```go
var errs []error
if cfg.Name == "" {
	errs = append(errs, errors.New("name is required"))
}
if cfg.Port < 1 || cfg.Port > 65535 {
	errs = append(errs, errors.New("port is out of range"))
}
return errors.Join(errs...)
```

`errors.Join` returns nil when there are no non-nil errors, and its combined result supports `errors.Is` and `errors.As`.

This works because neither check needs the other to succeed. File reading and JSON decoding have a dependency, so collecting both failures would require attempting work without valid input.

When reducing repetition, follow that dependency through the function. Keep checks where failure changes the next action. Move them into a helper when several callers share an operation, remember them when a sequence shares one failure policy, and collect them when independent checks can usefully report together. The resulting code still makes failure visible, while giving each decision a place where it can be understood and maintained.
