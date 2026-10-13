# Corpus

Same three topics, written three ways, to see whether the audit scores track
what readers dislike.

## human/

Technical writing from before LLMs, kept verbatim.

- `go-errors-are-values.md`: Rob Pike, "Errors are values", The Go Blog, 2015.
- `go-slices-intro.md`: Andrew Gerrand, "Go Slices: usage and internals", The
  Go Blog, 2011.

  Both come from [golang/website](https://github.com/golang/website) and are
  licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- `rust-to-panic-or-not.md`: "To panic! or Not to panic!", chapter 9.3 of
  _The Rust Programming Language_ by Steve Klabnik, Carol Nichols and
  contributors, from [rust-lang/book](https://github.com/rust-lang/book), under
  MIT or Apache-2.0.

## generated/

The same topics written by Opus (`claude -p --safe-mode`, so no personal
instructions) and Sol (`codex exec`, which still loads the operator's
user-level AGENTS.md). Each model got two prompts with the same 900-word target:

- `generic`: "Write a blog post explaining <topic>."
- `reader`: the same, plus "You're writing for the five backend engineers on
  your team: a chill crew, not overly serious, technically strong."

The only difference between the two prompts is whether a reader is named.
