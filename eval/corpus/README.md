# Corpus

Same three topics, written under different prompts, to see whether the audit scores track
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

## briefed/

Two independent samples per topic and model, with the same 900-word target
and a writing brief that asks for concrete cases before rules, fewer
quotable paragraph endings, and restrained headings, lists, and jokes.
The verbatim brief and explicit topic wording are in
[brief-experiment.ts](../../scripts/brief-experiment.ts).
The original corpus did not retain its exact topic wording; this experiment
uses the same topic scope and audit purposes.

Run the experiment with an existing texture audit directory containing the
13 human documents and the 12 original generated posts:

```sh
npm run brief-experiment -- --out /tmp/brief-run --comparison /tmp/texture-audits
```

The output directory and briefed corpus files must not already exist. Live
generation uses the same subscription CLIs and instruction limitations as
the original corpus. Each call runs in a fresh temporary directory without
API keys in the child environment. Raw generations, prompts, audits, and
randomized blind judgments stay in the run directory. Corpus Markdown is
kept verbatim except for a final newline, like the existing corpus sources.
Existing texture observations are reused, with code metrics recomputed from
their stored source. Concurrent C additions remain in raw audits; the
comparison table uses the historical question inventory. Group means
weight documents equally. Sample 1 is compared with the generic original
by the other model, without requiring identical facts.
