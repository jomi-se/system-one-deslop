# When Rust should panic, and when it should return a `Result`

Your service reads its port from an environment variable:

```rust
let port = std::env::var("PORT")
    .unwrap()
    .parse::<u16>()
    .unwrap();
```

This works until someone forgets the variable or sets it to `eight thousand`. Then the service panics, and the person deploying it gets a message about an `unwrap()` on an error.

Replacing those calls with `?` changes who gets to make the decision:

```rust
fn configured_port() -> Result<u16, Box<dyn std::error::Error>> {
    let value = std::env::var("PORT")?;
    Ok(value.parse()?)
}
```

The caller can now print a configuration error and exit, use a default where appropriate, or reject the new configuration while keeping the old one. Production code might give these errors more context, including which setting failed.

The service may still be unable to start. Returning a `Result` doesn’t promise recovery; it gives the caller a failure it can handle deliberately. That distinction matters more than whether the error seems serious.

## A bad request reaches your library

Suppose you’re writing a library that extracts part of a string. The first version looks reasonable:

```rust
pub fn excerpt(text: &str, start: usize, end: usize) -> &str {
    &text[start..end]
}
```

Then a caller passes offsets from an HTTP request. One offset exceeds the string’s length. Another lands inside a multibyte UTF-8 character. Both can make the slice operation panic.

Rust prevents invalid memory access here, but your API still turns a bad request into a panic. If arbitrary offsets are part of the function’s intended input, make that failure available to the caller:

```rust
#[derive(Debug)]
pub struct InvalidRange;

pub fn excerpt(
    text: &str,
    start: usize,
    end: usize,
) -> Result<&str, InvalidRange> {
    text.get(start..end).ok_or(InvalidRange)
}
```

Now the HTTP layer can translate the error into a response. A command-line tool can identify the offending argument. Neither needs to intercept a panic to do ordinary input validation.

This doesn’t mean every function accepting an index must return a `Result`. Rust’s indexing operations have a contract: the caller must supply a valid index. They panic when that contract is violated, and checked alternatives such as `get` exist.

For your own API, consider where the values come from and what callers are expected to establish before calling. A low-level operation with a documented precondition can reasonably panic. An operation designed to process untrusted requests should usually expose invalid input through its return type. Documentation should make that choice clear enough that callers can use the function correctly.

## Your own code reaches an impossible state

A scheduler keeps jobs in a queue. While holding exclusive access, it checks that the queue is nonempty and then removes the next job:

```rust
if !queue.is_empty() {
    let job = queue
        .pop_front()
        .expect("queue was checked as nonempty");
    run(job);
}
```

If that `expect` fails, the scheduler’s reasoning is broken. The caller didn’t submit a malformed job; the implementation contradicted an assumption it had just established.

A panic can be appropriate for this kind of failure. Returning `Error::QueueUnexpectedlyEmpty` may just move the problem outward, asking callers to accommodate a state the implementation claims cannot occur. Worse, continuing could mean operating with other broken assumptions.

But look at the code again. You can remove the assumption entirely:

```rust
if let Some(job) = queue.pop_front() {
    run(job);
}
```

Before choosing between a panic and an error, check whether the failure can disappear through a better representation or control flow. An enum can make mutually exclusive states explicit. A private constructor can ensure every instance satisfies an invariant. Pattern matching can avoid a separate check followed by an unchecked operation.

When an invariant still needs a runtime check, `assert!` or `expect` can record it. The message should explain the assumption, so the eventual bug report gives a maintainer something useful to investigate.

## The error is fatal, but the implementation is sound

A backup tool fills the destination disk halfway through a write. There’s no useful way to finish that backup immediately.

It should still return an error.

Disk exhaustion is something a correct program can encounter. The caller may delete a temporary file, record which backup failed, ask the user to free space, or terminate with a clear diagnostic. These choices belong where the application has enough context to make them.

The same reasoning applies to a missing file, a refused connection, or invalid credentials. “We can’t proceed” describes the current operation. It doesn’t establish that the program contains a bug.

At an application boundary, handling a `Result` can mean logging the failure and exiting with a nonzero status. That is still handling it. The benefit is control over the message and any required cleanup, even when retrying would be pointless.

## A panic gets caught somewhere else

A worker panics, and someone proposes wrapping every job in `catch_unwind` so processing can continue.

That can be useful at a deliberate isolation boundary, but it doesn’t make panics a substitute for ordinary errors. With unwinding enabled, a panic unwinds the current thread’s stack and runs destructors. With an aborting panic strategy, it terminates the process instead. `catch_unwind` only catches unwinding panics, and catching one doesn’t prove shared state remains suitable for further work.

Use `Result` when callers need a dependable failure path. Reserve panic handling for boundaries designed to contain unexpected failures, with an explicit decision about which state can safely be reused.

Tests are a simpler case. If a test fixture must parse successfully, `expect("fixture should be valid")` is often appropriate: failure should stop that test and report the broken assumption. In production, the same parser may receive user input and return a `Result`, because its caller has a real decision to make about that input.
