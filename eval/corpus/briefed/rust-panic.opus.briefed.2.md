# Panic or Result: Asking Who Can Do Something About It

Here is a function that shows up, in some form, in a lot of early Rust services:

```rust
fn port() -> u16 {
    std::env::var("PORT").unwrap().parse().unwrap()
}
```

It works on every developer's machine and it passes CI. Then it gets deployed somewhere the variable is set from a file that ends in a newline. The process exits with `called Result::unwrap() on an Err value: ParseIntError { kind: InvalidDigit }`, and nothing in that message says which value failed or where it came from. Stopping the program was correct, since a server with no usable port has nothing to do. The trouble is that the decision to stop was made deep inside a helper that knew nothing about its surroundings, so the person reading the crash got no help.

## Failures that come from outside the program

Rewritten to return a `Result`, the function hands the decision back up:

```rust
#[derive(Debug)]
enum ConfigError {
    Missing(&'static str),
    Invalid { var: &'static str, value: String },
}

fn port() -> Result<u16, ConfigError> {
    let raw = std::env::var("PORT").map_err(|_| ConfigError::Missing("PORT"))?;
    raw.trim()
        .parse()
        .map_err(|_| ConfigError::Invalid { var: "PORT", value: raw })
}
```

Now the caller can choose. It might fall back to 8080 when the variable is missing, or it might print `PORT is set to "80 80", expected a number` and exit with a nonzero status. Either is better than a panic, and neither choice belongs to `port()`. The value came from the environment, which the program doesn't control, so a bad value is an ordinary event the program should plan for. The same reasoning covers files that don't exist, network calls that time out, JSON that doesn't match the schema, and anything a user typed. When the failure originates in the world rather than in your code, return a `Result`, because the caller has context you don't and may be able to recover.

## Failures that mean your own code is wrong

Compare that with the inside of a ring buffer:

```rust
struct RingBuffer<T> {
    slots: Vec<Option<T>>,
    head: usize,
    len: usize,
}

impl<T> RingBuffer<T> {
    fn pop(&mut self) -> Option<T> {
        if self.len == 0 {
            return None;
        }
        let item = self.slots[self.head]
            .take()
            .expect("slots within len are always occupied");
        self.head = (self.head + 1) % self.slots.len();
        self.len -= 1;
        Some(item)
    }
}
```

Two different kinds of failure live in this function. An empty buffer is a normal state that any caller might encounter, so `pop` returns `Option` and lets them deal with it. An empty slot inside the occupied range is different. It can only happen if `push` or `pop` has a bug that broke the relationship between `head`, `len`, and the contents of `slots`. Suppose that were reported as `Err(RingBufferError::Corrupted)`. Every caller would have to match on a variant they cannot do anything useful with, and most would end up calling `unwrap()` on it anyway. The panic is more honest: it fires at the line where the assumption broke, it names the assumption in its message, and with `RUST_BACKTRACE=1` it shows how execution got there. The message is written as a statement of the invariant ("slots within len are always occupied") rather than a description of the failure, so a reader of the source learns why the `expect` is safe.

## Preconditions the caller is responsible for

The standard library has a pattern worth copying. `slice.split_at(mid)` panics if `mid` is greater than the length, and `slice.split_at_checked(mid)` returns an `Option` instead. Indexing with `v[i]` panics on out-of-bounds, while `v.get(i)` doesn't. `a + b` on integers panics on overflow in debug builds, and `a.checked_add(b)` hands you an `Option`. In each pair, the panicking version is for when the caller has already established the precondition, usually because the index came from iterating over the same slice, and a violation would mean the caller has a bug. The fallible version is for when the value comes from somewhere untrusted and checking it first would just duplicate work the function does anyway. The panicking functions document the condition under a `# Panics` heading, which is a convention your own libraries should follow.

This matters most when you write a library. Imagine a date crate where `Date::new(2024, 2, 30)` panics. Any web form that accepts a date now has to validate the day-of-month itself before calling the library, reimplementing leap-year logic the library already contains. If dates plausibly arrive from users, the constructor should return a `Result`, and the crate can offer a panicking convenience for literals if it wants. A library cannot know how its callers obtained their arguments, so it should panic only on conditions that indicate a bug in the calling code.

## The top of the program, and tests

At the top of a binary, there is no caller left to hand the error to. Returning `Result` from `main` (often with `anyhow` or `Box<dyn Error>`) gives you a clean exit and a printed message, which is usually nicer than a panic. Still, an `expect` in `main` is not a design flaw, because the program is the one making the decision. Compile-time constants fall into a similar category: `Regex::new(r"^\d{4}-\d{2}-\d{2}$").expect("date pattern is valid")` can only fail if the pattern in the source is wrong, and the first run of the test suite will tell you. Inside tests, `unwrap()` is fine everywhere, since a panic is exactly how a Rust test reports failure.

One last thing to keep in mind is that a panic is not an exception you can reliably catch. Your library might be compiled with `panic = "abort"`, in which case the whole process ends immediately. Under the default unwinding behavior, a panicking thread poisons any `Mutex` it holds, and every other thread that tries to lock it afterwards gets an error. Tokio will catch a panic in a spawned task and surface it through the `JoinHandle`, but the task's work is lost and any shared state it was in the middle of updating may be inconsistent. Using `catch_unwind` to turn panics back into errors is meant for boundaries like FFI and thread pools, and it is a poor substitute for returning `Result` in the first place.

When reviewing a codebase, it helps to search for `unwrap` and `expect` and ask the same question at each call site: where did this value come from? If it came from outside the program, the call probably wants to become a `?` with a meaningful error type. If it came from an invariant your own code maintains, it can stay as an `expect` whose message says what the invariant is.
