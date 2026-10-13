# When Rust Should Panic, and When It Should Return a `Result`

A command-line tool starts with this:

```rust
let config = std::fs::read_to_string("config.toml").unwrap();
```

It works on your machine. Then someone runs it from a different directory, and it panics because the file isn’t there. You replace `unwrap()` with `expect("could not read configuration")`. The message improves, but the behavior hasn’t changed: an ordinary failure still takes the panic path.

Now consider another `unwrap()`:

```rust
let last = items.pop().unwrap();
```

Immediately above it, the code checked that `items` wasn’t empty, and nothing modified the vector between those statements. Here, failure would mean your reasoning about the program was wrong.

The syntax is identical. Deciding whether it belongs requires looking at where the value came from and what the surrounding code promises.

## A missing file doesn’t necessarily mean a broken program

Suppose you’re writing a configuration loader for a library:

```rust
fn read_config(path: &std::path::Path) -> std::io::Result<String> {
    std::fs::read_to_string(path)
}
```

The file might be missing, inaccessible, or contain invalid UTF-8. These are documented failure conditions of [`read_to_string`](https://doc.rust-lang.org/std/fs/fn.read_to_string.html), and none requires a bug in the loader.

The calling application knows what to do next. An editor might ask the user to choose another file. A service might reject its startup configuration. A small utility might print the error and exit. Returning `Result` allows all three without making the library depend on any particular policy.

This is where “panic for unrecoverable errors” can mislead. Your function may have no way to recover, but its caller may have one. Even when the whole application must stop, it can stop through an ordinary error path, with a useful diagnostic and a deliberate exit status.

For a small command-line program, propagation can be straightforward:

```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = std::fs::read_to_string("config.toml")?;
    println!("{config}");
    Ok(())
}
```

The `?` passes the error upward. It doesn’t retry, supply a default, or otherwise solve the problem. It keeps the failure available to code that can decide how to report or handle it.

## An index can be input—or evidence of a bug

A request arrives asking for item 40 from a collection containing twelve items:

```rust
let item = items[index];
```

That access panics. If `index` came directly from the request, the application has allowed bad input to reach an operation whose precondition wasn’t established.

Using [`get`](https://doc.rust-lang.org/std/primitive.slice.html#method.get) makes absence explicit:

```rust
let item = items.get(index).ok_or(LookupError::OutOfRange)?;
```

Here, `LookupError` is an application-defined error. If “no item at this position” is a normal answer rather than a failure, returning the `Option` from `get` may be enough.

But imagine the index comes from an internal lookup table that your data structure maintains alongside the collection. Every stored index is supposed to identify an existing item. An out-of-bounds index now means the structure’s invariant has broken.

A panic can be appropriate there. Returning `OutOfRange` would make an internal consistency bug look like an ordinary unsuccessful lookup, potentially letting the application continue using suspect state.

The distinction depends on the API contract. Slice indexing requires a valid index; `get` accepts an arbitrary one. When your own public function has a panicking precondition, document it, as the [Rust book recommends](https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html). Also consider whether callers can realistically establish that precondition before choosing the interface.

## A zero batch size is easier to reject at construction

A batching function receives `batch_size: usize`. Zero makes no sense, so you add an assertion. Then another function needs the same check, and eventually one forgets it.

You can move that validation into the type:

```rust
use std::num::NonZeroUsize;

fn process_batches(batch_size: NonZeroUsize) {
    // The batch size cannot be zero.
}
```

[`NonZeroUsize`](https://doc.rust-lang.org/std/num/type.NonZeroUsize.html) excludes zero. At the input boundary, constructing it with `NonZeroUsize::new(raw)` produces an `Option`; you can turn `None` into a configuration error.

That gives you a useful division of work. The boundary handles invalid input, while the processing code receives a value that already satisfies its requirement. There’s no need to choose between repeatedly returning errors and repeatedly asserting the same condition throughout the implementation.

This also makes later changes easier to review. A new caller must construct the validated value before it can invoke the processing function.

## An `expect` message should explain the assumption

A program parses a literal embedded in its source:

```rust
let port = "8080"
    .parse::<u16>()
    .expect("embedded port literal should fit in u16");
```

The parser accepts arbitrary strings, but this particular string is fixed and valid. `expect` records the assumption at the point where the general-purpose parser meets that specific value. Its documentation recommends messages that explain [why success is expected](https://doc.rust-lang.org/std/result/enum.Result.html#method.expect).

If the literal later becomes an environment variable, that justification disappears. The error handling should change along with the source of the value.

Tests provide another reasonable setting for `unwrap()` or `expect()`. When a success-case test can’t parse its fixture, failing the test is appropriate. When testing malformed input, however, assert on the returned error so the test checks the behavior you actually promise.

## Catching a panic doesn’t make it an ordinary error

A server wraps request handling in `catch_unwind`, hoping to survive a bug in one handler. That can be a deliberate containment boundary, but it doesn’t justify panicking whenever a request is malformed.

[`catch_unwind`](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html) catches unwinding panics; it cannot catch panics that abort the process. Catching one also doesn’t establish that partially modified application state is suitable for reuse. The boundary needs a considered policy for what gets discarded or reset.

During review, trace each possible failure back to its cause. A disconnected peer, invalid document, or missing file belongs in the function’s error behavior. A contradiction in state your code promised to maintain may justify a panic. For each `unwrap()`, look for the actual evidence that failure is impossible; when that evidence rests on something outside the program’s control, give the caller an error it can handle.
