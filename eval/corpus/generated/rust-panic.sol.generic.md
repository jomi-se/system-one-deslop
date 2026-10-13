# When Rust Should Panic—and When It Should Return a `Result`

Rust gives you two familiar ways to report that something went wrong: panic, or return a `Result`. The syntax is straightforward. The judgment takes practice.

A useful starting point is this: return a `Result` when failure is an outcome the caller should be able to handle. Panic when execution reaches a state that violates the program’s assumptions or an explicitly documented contract.

The difficult part is deciding which assumptions your code is entitled to make.

## Failure does not always mean a bug

Suppose a program reads a configuration file. The file might be missing, unreadable, or malformed. None of those conditions necessarily indicates a programming mistake. They are ordinary possibilities when software interacts with the world.

Returning a `Result` makes those possibilities visible:

```rust
fn read_config(path: &std::path::Path) -> std::io::Result<String> {
    std::fs::read_to_string(path)
}
```

The caller can choose another file, use defaults, display an error, or terminate the program.

That last option matters. Returning a `Result` does not promise that the program can recover. It gives the caller authority over what happens next. A command-line application may reasonably print “configuration file not found” and exit. A server might reject one request and continue serving others.

Both can use the same function.

Files, network connections, database queries, user input, and external services generally belong in this category. Their failures should usually travel through explicit error handling.

## Panic when an assumption has been broken

A panic says that execution cannot continue along the current path without violating an assumption.

For example, an internal algorithm might maintain a stack that must always contain a sentinel:

```rust
let current = stack
    .last()
    .expect("the stack always contains its sentinel");
```

If the algorithm guarantees that invariant, an empty stack indicates a defect in the implementation. Returning an “empty stack” error from every internal helper could obscure the real problem: the program has entered a state its design excludes.

The crucial word is *guarantees*. An assumption needs support from the code’s structure, validation, or types. “This probably won’t happen” is not an invariant.

A failed network request does not become a programming bug because your test network was reliable. An environment variable does not become guaranteed because it exists on your laptop.

Before choosing panic, ask what makes the failing state impossible during correct use.

## Be careful with public APIs

Internal code can rely on facts established elsewhere in the implementation. A public library has less control over its callers.

If a function accepts arbitrary text, malformed text is an expected input. A parser should generally return an error. If a function accepts an index, consider whether an out-of-range index should be represented explicitly.

Rust’s standard library offers both choices:

```rust
let item = values.get(index); // Option<&T>
let item = &values[index];    // Panics if out of bounds
```

Indexing has a contract: the index must be valid. `get` lets the caller handle its absence.

Neither approach is universally correct. The choice depends on what the API promises and how callers will use it. However, blaming the caller does not automatically justify a panic. Public APIs often become more useful when they can reject invalid arguments predictably.

For intentional panics, document the conditions clearly. Callers should be able to tell which obligations they must satisfy.

## Use types to reduce the argument

Sometimes the best answer is to redesign the interface so the invalid state cannot reach the function.

A function that requires a nonzero value can accept `NonZeroUsize`. A function that needs validated configuration can accept a configuration type whose constructor performs validation.

The constructor returns a `Result`; later operations use the guarantees established during construction.

This moves error handling to the boundary where the information arrives. It also reduces repeated checks and makes internal assumptions easier to trust.

Types cannot express every invariant, but they can eliminate many reasons to debate panic versus error.

## `unwrap` and `expect` deserve evidence

Calling `unwrap` on a `Result` or `Option` chooses to panic on failure. It should reflect a deliberate decision.

In tests, that is often appropriate. If setup fails or an operation unexpectedly returns an error, failing the test immediately is useful.

During prototyping, `unwrap` can also help you explore an idea quickly. Before that code becomes production code, revisit those decisions.

In production, `expect` is useful when success follows from a clear invariant. Its message should explain the reasoning:

```rust
let address: std::net::IpAddr = "127.0.0.1"
    .parse()
    .expect("the literal is a valid IPv4 address");
```

“Parsing failed” adds little. Explaining why parsing must succeed helps a future reader evaluate the assumption.

## A panic is not an error-handling strategy

A panic normally unwinds the current thread’s stack, but programs can be configured to abort instead. It does not always terminate the entire process, and it does not guarantee that the application can safely carry on.

Although `catch_unwind` exists, it catches unwinding panics, not aborts. It is useful at certain isolation boundaries; it should not replace `Result` for ordinary failures.

Expected failures deserve explicit control flow.

## Make the decision at the right boundary

Ask three questions: can this happen during correct use? Does the caller need to decide what happens next? What evidence establishes that this state is impossible?

Expected failures usually deserve `Result`, or `Option` when absence needs no explanation. Broken internal invariants often justify panic.

Good Rust code makes that distinction visible: errors describe possibilities callers must handle, while panics identify assumptions the implementation was supposed to uphold.