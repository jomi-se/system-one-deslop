# Corpus

Same three topics, written three ways, to see whether the audit scores track
what readers dislike.

## human/

Technical writing from before LLMs, kept verbatim.

- `go-*.md`: posts from The Go Blog, 2010–2015, by their credited authors
  (each file's front matter names them): "Errors are values", "Go Slices:
  usage and internals", "Defer, Panic, and Recover", "JSON and Go", "The Laws
  of Reflection", "Strings, bytes, runes and characters in Go", "Error
  handling and Go", "Go maps in action" and "Go Concurrency Patterns:
  Pipelines and cancellation". From
  [golang/website](https://github.com/golang/website), licensed under
  [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
- `rust-*.md`: chapters 4.1, 8.1, 9.3 and 16.1 of _The Rust Programming
  Language_ by Steve Klabnik, Carol Nichols and contributors, from
  [rust-lang/book](https://github.com/rust-lang/book), under MIT or
  Apache-2.0. The book is still maintained, so these chapters carry recent
  edits on top of pre-LLM text.

The first three (`go-errors-are-values`, `go-slices-intro`,
`rust-to-panic-or-not`) cover the same topics as the generated posts.

## generated/

The same topics written by Opus (`claude -p --safe-mode`, so no personal
instructions) and Sol (`codex exec`, which still loads the operator's
user-level AGENTS.md). Each model got two prompts with the same 900-word target:

- `generic`: "Write a blog post explaining <topic>."
- `reader`: the same, plus "You're writing for the five backend engineers on
  your team: a chill crew, not overly serious, technically strong."

The only difference between the two prompts is whether a reader is named.
