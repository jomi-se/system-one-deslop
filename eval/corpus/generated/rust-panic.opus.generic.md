# Panic or Result? Choosing How Your Rust Code Fails

Rust gives you two ways to handle things going wrong. You can return a `Result<T, E>` and let the caller decide what to do, or you can `panic!` and stop the current thread. Newcomers often treat this as a style preference. It isn't. Each mechanism communicates something different about the failure, and choosing correctly makes your code easier to use, easier to debug, and more honest about its assumptions.

## The Core Distinction

Ask one question: **is this failure a bug, or is it something that can happen in a correct program?**

- If a correct program could encounter this situation, such as a missing file, malformed user input, or a dropped network connection, return a `Result`. The failure is part of the normal domain of the operation, and the caller deserves a chance to respond.
- If reaching this point means someone wrote incorrect code, such as an invariant that was violated, an index that should have been in bounds, or a state that should be impossible, panic. The program is already wrong, and continuing risks making things worse.

A `Result` says "this might not work, and that's expected." A panic says "this should never happen, and if it did, something is broken."

## When to Return a Result

Use `Result` whenever failure depends on something outside your code's control:

```rust
use std::fs;
use std::io;

fn load_config(path: &str) -> Result<String, io::Error> {
    fs::read_to_string(path)
}
```

The file might not exist. The user might lack permission. The disk might be full. None of these are programming errors, and the caller is in a much better position than `load_config` to decide what happens next. Maybe it falls back to defaults. Maybe it prompts the user. Maybe it really should exit. That's the caller's call.

The same applies to parsing. If you're turning a string from a user, a config file, or an HTTP request into structured data, invalid input is a normal occurrence:

```rust
fn parse_port(s: &str) -> Result<u16, std::num::ParseIntError> {
    s.trim().parse()
}
```

A good rule of thumb: **if the input crosses a trust boundary, failure belongs in a `Result`.**

## When to Panic

Panic when continuing would mean operating on a broken assumption. The standard library does this itself. Indexing a slice out of bounds panics, because an out-of-range index almost always indicates a logic error, and silently returning garbage would be far more dangerous.

Consider a function with a documented precondition:

```rust
/// Splits `buf` into chunks of `size` bytes.
///
/// # Panics
///
/// Panics if `size` is zero.
fn chunk(buf: &[u8], size: usize) -> Vec<&[u8]> {
    assert!(size > 0, "chunk size must be non-zero");
    buf.chunks(size).collect()
}
```

Passing zero here isn't a runtime condition the caller needs to handle. It's a mistake in the calling code. Returning `Result` would force every correct caller to handle an error that can never occur in their program. That adds noise and tempts people to write `.unwrap()` anyway.

Notice the `# Panics` section in the doc comment. If your public function can panic, say so. It's part of the contract.

## The "I Know Better Than the Compiler" Case

Sometimes you have information the type system can't see:

```rust
use std::net::IpAddr;

let home: IpAddr = "127.0.0.1"
    .parse()
    .expect("hardcoded loopback address should be valid");
```

`parse` returns a `Result` because, in general, strings can be invalid. But this string is a literal, and you can see it's valid. Panicking here is entirely reasonable. If it ever fails, someone edited the literal incorrectly, which is a bug.

Prefer `expect` over `unwrap` in these situations. The message documents *why* you believe the operation can't fail, which is invaluable when it does. Phrasing the message as the expectation ("should be valid") rather than the failure ("parse failed") tends to read better in both the source and the panic output.

## Prototypes, Examples, and Tests

`unwrap` and `expect` are perfectly fine when robustness isn't the point:

- **Prototypes.** Sprinkle `unwrap` freely while exploring. Each one is a clear marker of where real error handling will go later, and searching for them is easy.
- **Examples and documentation.** Elaborate error handling can obscure the concept you're demonstrating.
- **Tests.** A panic is exactly how a test signals failure. That said, test functions can return `Result<(), E>` too, which lets you use `?` and keeps setup code tidy.

## Libraries vs. Applications

The calculus shifts depending on who's calling you.

**Libraries** should be conservative about panicking. You don't know your caller's context. A panic in a web server's request handler might take down a worker thread. A panic in embedded code might reset the device. Return `Result` for anything plausibly recoverable, reserve panics for genuine contract violations, and document them.

**Applications** have more freedom near the top level. If `main` can't open the database it depends on, there's often nothing sensible to do but report the error and exit. Even then, it's usually cleaner to propagate errors up to `main` with `?` and print a friendly message than to panic deep in the call stack. Crates like `anyhow` make this pleasant.

## Encode Invariants in Types

The best way to avoid the dilemma is often to make invalid states unrepresentable. Instead of validating the same condition in a dozen functions, validate once at construction:

```rust
pub struct NonZeroSize(usize);

impl NonZeroSize {
    pub fn new(n: usize) -> Option<Self> {
        (n > 0).then_some(Self(n))
    }
}
```

Now the fallible check happens at the boundary, returning `Option` or `Result`, and every downstream function can accept `NonZeroSize` without asserting anything. The standard library's `NonZeroUsize` follows exactly this pattern.

## Panics Are Not Exceptions

Finally, don't use panics as a control-flow mechanism. `std::panic::catch_unwind` exists, but it's meant for isolating failures at boundaries such as FFI or thread pools, not for routine error handling. Many projects compile with `panic = "abort"`, in which case there is no unwinding to catch at all. If you find yourself wanting to catch a panic in normal operation, that's a strong sign the function should have returned a `Result`.

## A Quick Checklist

- Could a correct program hit this? **Return `Result`.**
- Does it mean the code itself is wrong? **Panic.**
- Do you know it can't fail, but the compiler doesn't? **`expect` with a clear message.**
- Writing a library? **Lean toward `Result`, and document every panic.**
- Validating the same thing repeatedly? **Push it into a type.**

Handled thoughtfully, the choice between panic and `Result` becomes documentation in its own right. It tells readers which failures are part of the world your code lives in and which ones mean the code itself needs fixing.
