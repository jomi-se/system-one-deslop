# Rust Errors Without the Drama

Use `Result` when failure is part of the operation’s contract. Panic when continuing would mean pretending the program is still in a valid state.

That’s the useful starting point. “Expected versus unexpected” gets us close, but it’s fuzzy: a database outage can surprise everyone and still belong in a `Result`. The sharper question is whether the caller should have a meaningful way to respond.

For backend code, that usually means returning an error. Requests are messy, networks are unreliable, and databases occasionally choose violence. Those failures deserve handling, even when handling means logging the error and returning a 503.

A panic makes a different claim: something has broken an assumption this code depends on, and ordinary execution should stop here.

## Return `Result` for failures the caller owns

Suppose we’re loading an account:

```rust
fn load_account(id: AccountId) -> Result<Account, LoadError> {
    // ...
}
```

The account might not exist. The database might be unavailable. A query might time out. None of those outcomes proves that our program is internally broken.

The caller can decide what happens next: return a 404, retry a transient failure, serve cached data, or fail the request. Returning `Result` preserves that choice.

This also applies to invalid input. A malformed UUID, unsupported content type, or out-of-range page size should not panic just because our happy-path code wanted something nicer. If clients can trigger it through normal interaction with the service, it belongs in validation and error handling.

Sometimes absence isn’t an error at all. A lookup might return `Result<Option<Account>, DbError>`: `None` means no account matched, while `Err` means we couldn’t complete the lookup. That distinction can keep both code and API behavior honest.

## Panic when an invariant is broken

An invariant is a condition the program establishes and relies on. Imagine an internal allocator that must never assign the same active slot twice:

```rust
let previous = active_slots.insert(slot, job);
assert!(
    previous.is_none(),
    "allocator assigned an active slot twice"
);
```

If this assertion fails, we have a bug in our bookkeeping. Turning it into `Err(SlotAlreadyOccupied)` may just invite callers to ignore corruption and keep going.

That is a reasonable place to panic.

The important word is *internal*. If the slot came directly from a request and collisions are possible by design, the same condition becomes an ordinary error. The syntax doesn’t determine the policy; ownership of the assumption does.

Also, “this should never happen” needs evidence. Did our code establish the condition? Does a type enforce it? Did we validate it earlier? Or are we just feeling optimistic about a third-party response?

Optimism is not an invariant.

## `unwrap()` is a claim, not a convenience

Every `unwrap()` on a `Result` says: “An error here means this execution should panic.”

Sometimes that’s correct. In tests, unwrapping setup results is usually fine: a failed setup should fail the test. For a hardcoded value whose validity we control, `expect()` can also be reasonable:

```rust
let address = "127.0.0.1:8080"
    .parse::<std::net::SocketAddr>()
    .expect("hardcoded listen address must be valid");
```

The message explains why failure represents a programming mistake.

Compare that with:

```rust
let address = std::env::var("LISTEN_ADDR")
    .unwrap()
    .parse::<std::net::SocketAddr>()
    .unwrap();
```

Now we’re panicking over deployment configuration. That’s something an operator can fix, so return a startup error with context: which setting failed, what format we expected, and how to correct it.

The service may still exit. That’s fine. Returning `Result` doesn’t promise recovery; it gives the application a deliberate way to report failure and choose its exit behavior.

## Put policy at the boundary

Lower-level code usually knows *what* failed. Higher-level code knows *what to do about it*.

A database helper should report a connection failure. A request handler decides how that maps to an HTTP response. The startup path decides whether missing configuration prevents the service from launching.

This is why `Result` is especially useful in reusable libraries. Panicking takes control away from callers whose requirements we may not know.

Public APIs can still have documented panic conditions, particularly for caller violations of a clear contract. But if misuse is common, externally driven, or easy to check, a fallible API often makes the better interface.

## A panic isn’t a recovery plan

Don’t assume a panic safely resets everything.

Depending on the build configuration, a panic may unwind the stack or abort the process. Unwinding runs destructors, but it does not roll back database writes, unsend messages, or automatically restore application invariants.

In concurrent services, whether a panic stops a thread, a task, or the whole process also depends on how execution is managed. A process that stays alive can still have lost useful work.

Likewise, `catch_unwind` is not a substitute for ordinary error handling. It cannot catch aborting panics, and catching an unwind doesn’t prove shared state remains usable.

## The review question

When reviewing a panic, ask: “What establishes this assumption, and can external conditions break it?”

When reviewing a `Result`, ask: “Does this error describe a legitimate failure, or are we disguising an internal bug as something callers should handle?”

Prefer types that make invalid states impossible, then validation that makes assumptions explicit. Return errors for the remaining operational failures. Reserve panics for broken contracts and invariants where continuing would be dishonest.

The goal isn’t zero panics or maximum error enums. It’s making each failure tell the truth—and giving the right layer control over what happens next.