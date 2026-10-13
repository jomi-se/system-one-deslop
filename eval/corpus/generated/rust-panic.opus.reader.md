# Panic or Result? A Field Guide

We've had this argument in code review enough times that it's worth writing down. Nobody's wrong exactly, but we're inconsistent, and inconsistency is how a `.unwrap()` on a request header ends up taking down a pod at 3am.

So here's the short version:

**Return a `Result` when the failure comes from the outside world. Panic when the failure means our own code is wrong.**

Ask "whose fault is this?" If the answer is the network, the disk, the user, or some other team's service, that's a `Result`. If the answer is "us, we broke a promise we made to ourselves," that's a panic.

## Result: the world is messy

Malformed JSON, a Postgres timeout, a missing file, an upstream returning 503. None of these are bugs. They're Tuesday. The caller can usually do something useful about them: retry, fall back, return a 400, log and move on.

```rust
fn parse_user_id(raw: &str) -> Result<UserId, ParseError> {
    let n: u64 = raw.parse().map_err(|_| ParseError::NotNumeric)?;
    UserId::try_from(n).map_err(|_| ParseError::OutOfRange)
}
```

The rule for us specifically: **untrusted input should never be able to trigger a panic.** If a client can craft a request that makes a handler panic, that's a bug *and* a potential DoS. With default unwinding, hyper drops the connection and the client gets a confusing hangup instead of a 400. If we ever flip on `panic = "abort"` for binary size or perf, it takes the whole process down. Neither outcome is a good response to someone sending `"user_id": "lol"`.

## Panic: we broke something

Panics are for violated invariants, the situations where continuing would mean operating on state we no longer understand.

```rust
let shard = self.shards
    .get(&shard_id)
    .expect("shard_id comes from self.routing, which only holds live shards");
```

If that `expect` fires, there's no meaningful recovery. We have a bug in how routing and shards stay in sync. Wrapping this in a `Result` would push an `Err(InternalInconsistency)` up through six layers of callers, none of which can do anything except log it and return a 500. A panic gives you the same outcome with a backtrace pointing at the actual problem.

That's the real cost of overusing `Result`: every fallible signature is a question you're asking your caller. "What do you want to do if this fails?" If the honest answer is always "nothing, it's a bug," you're just making them write boilerplate.

## `expect` over `unwrap`, and phrase it right

When you do panic deliberately, use `.expect()` and treat the message as documentation of *why you believe this can't fail*. The convention in the Rust docs is to describe the expectation, not the failure:

```rust
// meh
.expect("failed to get config")

// better
.expect("config is validated in main before the server starts")
```

The second one tells the person reading the panic message (likely future you) exactly which assumption broke.

Bare `.unwrap()` is fine in tests, in throwaway prototypes, and on things like `Regex::new(r"^\d+$").unwrap()` where the input is a literal and a failure would show up the first time you ran it. Everywhere else, `expect` costs you ten seconds and saves someone an hour.

## Context-specific rules

**Startup is different from request time.** Missing `DATABASE_URL`? Fail immediately and loudly. A pod that crashloops on deploy is way better than one that boots fine and fails on the first query. That said, returning `anyhow::Result<()>` from `main` usually gives you a nicer error than a panic, so prefer that when it's easy.

**Libraries should lean harder toward `Result`.** In our internal crates you don't know who's calling you or what they can tolerate. If a public function can panic, document it with a `# Panics` section in the doc comment. Clippy's `missing_panics_doc` lint will nag you about it if you turn it on.

**Tests: unwrap away.** A panic is how a test fails. Go nuts.

**Prototypes: also fine, but grep before merging.** `rg '\.unwrap\(\)' src/` is a decent pre-PR habit.

## The sneaky panics

Some panics don't look like panics:

- **Indexing.** `v[i]` panics on out-of-bounds. If `i` came from a request, use `v.get(i)` and handle the `None`.
- **Arithmetic.** Overflow panics in debug builds and silently wraps in release (unless we enable `overflow-checks`). For values derived from user input, reach for `checked_add`, `saturating_sub`, and friends.
- **Slicing strings.** `&s[0..n]` panics if `n` isn't on a UTF-8 char boundary. Great fun with emoji in usernames.
- **`Mutex::lock().unwrap()`.** This one's actually the accepted idiom. A poisoned mutex means another thread already panicked while holding it, so you're already in bug territory. Propagating the panic is reasonable.

## Best option: make the question go away

Often the cleanest answer is neither. Parse untrusted data into a type that *can't* be invalid at the boundary, and then the interior code doesn't need to check anything.

```rust
pub struct Email(String); // private field, only constructible via:

impl TryFrom<String> for Email {
    type Error = InvalidEmail;
    fn try_from(s: String) -> Result<Self, Self::Error> { /* validate */ }
}
```

One `Result` at the edge, zero checks and zero panics downstream. `NonZeroU32`, `NonEmpty<T>`, and newtypes with private constructors all do the same trick. If you find yourself writing the same `.expect("already validated")` in several places, that's a sign a type wants to exist.

## Cheat sheet

| Situation | Do this |
|---|---|
| Bad user input, network/IO failure, upstream error | `Result` |
| Internal invariant violated | `expect` with a reason |
| Missing config at startup | Fail fast (`Result` from `main` or panic) |
| Tests | `unwrap` freely |
| Public library function | `Result`, or document `# Panics` |
| Same validation checked everywhere | Make a type |

None of this is gospel. If you've got a case that doesn't fit, bring it to review and we'll argue about it like usual. But defaulting to "outside world → `Result`, our bug → panic" will get the call right most of the time.
