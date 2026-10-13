# Panic or Result? Ask Whose Mistake It Was

Picture a batch job that imports vendor CSV files overnight, with a parsing loop like this:

```rust
for line in reader.lines() {
    let line = line?;
    let fields: Vec<&str> = line.split(',').collect();
    let qty: u32 = fields[2].parse().unwrap();
    totals.add(fields[0], qty);
}
```

It passes every test fixture. Then a vendor sends a file with a blank trailing line. `fields[2]` goes out of bounds, and the import dies at four in the morning, taking forty thousand perfectly good rows with it. Nothing about that file was exotic. Vendors send blank lines, and quantities sometimes arrive as `"12.0"` or `"N/A"`. The code treated facts about the outside world as if they were guarantees.

Now look at this, from the same codebase:

```rust
let mid = items.len() / 2;
let (left, right) = items.split_at(mid);
```

`split_at` panics if `mid > len`, and nobody would wrap it in a `Result`, because `mid` was computed from `len` one line earlier. If it ever panics, the cause is a broken understanding of arithmetic, not a strange input file. No caller could do anything sensible with an error value describing that.

Between them, those two snippets hold most of the answer. For any failure, ask who would have made the mistake. If the fault lies with data, the environment, or a caller using your API in a legitimate way you didn't anticipate, return a `Result`. If the fault can only be a bug in the code itself, panic. In that case the program has reached a state its author believed impossible, and continuing would mean acting on assumptions that are now known to be false.

## The standard library already draws this line

Indexing a slice with `v[i]` panics on an out-of-range index, and `v.get(i)` returns an `Option`. Both exist because the same operation can be either kind of failure, depending on where `i` came from. If you computed `i` from the slice's length, indexing is correct and the panic works as a bug detector. If `i` arrived in an HTTP request, use `get`. Indexing there would let any client crash your process by sending a large number.

`Duration` shows the same split developing over time. `Duration::from_secs_f64` panics on negative or non-finite input. That's fine when you wrote `from_secs_f64(1.5)` yourself, but it was awkward for anyone converting floats read from a config file, so Rust 1.66 added `try_from_secs_f64`, which returns a `Result`. When you design an API that validates its arguments, offering both forms is often right. If you can offer only one, make it the `Result`, because a caller can turn an error into a panic with `.unwrap()` but has no good way to turn a panic back into an error.

## Making invariants explicit

Some panics are correct but still deserve more than a bare `unwrap`:

```rust
static DATE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\d{4}-\d{2}-\d{2}$").expect("date regex literal is valid")
});
```

`Regex::new` returns a `Result` because patterns usually come from somewhere you don't control. This one is a string literal. If it fails to compile, a programmer mistyped it. Pushing that error through every function that matches dates would spread a meaningless `Result` across the codebase. A panic is right here, and `expect` is better than `unwrap` because the message records your reasoning. The common convention is to phrase that message as the invariant you rely on, so the eventual panic names the belief that turned out wrong instead of just giving a line number. The same applies to `unreachable!()` in a match arm a state machine should never enter: put the reason in the macro's message.

## Libraries and applications

The CSV job is an application, and that changes some of the calculus. You own the whole call stack, so you can decide that certain failures end the process. A CLI tool that can't read its config file has nothing useful left to do, and returning `anyhow::Result<()>` from `main` with a clear message is a reasonable way to exit. Even then, propagate with `?` and make the decision at the top. A helper deep in the stack can't know whether it's being called from `main` or from a retry loop someone will add next quarter.

Library code doesn't get to make that decision at all. If your crate panics on malformed input, every caller must either pre-validate exactly as you would or reach for `std::panic::catch_unwind`. That does nothing in binaries built with `panic = "abort"`, and even where it works, any `Mutex` held during the panic comes back poisoned. In a published crate, a panic should mean that the caller violated a documented precondition, the way passing a chunk size of zero to `slice::chunks` does. Each such precondition belongs in a `# Panics` section of the doc comment.

## Tests and prototypes

In tests, unwrap freely. A panic in a test is a failure with a backtrace, which is exactly what you want. The same goes for documentation examples and code you're still sketching, where each `unwrap` marks a decision you've deferred. The danger is that sketches become production code without anyone revisiting those deferrals, which is how the CSV loop came to exist. Before a code path goes live, grep it for `unwrap()` and ask at each hit whether that failure would be the input's fault or the code's.

For the CSV job, the fix is small: filter out blank lines, use `get(2)` with a descriptive error for short rows, and when parsing fails, log the line number and move on. The bad rows end up in a log, the good rows end up in the database, and nobody gets paged before dawn.
