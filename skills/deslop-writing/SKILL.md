---
name: deslop-writing
description: Write prose that reads like a person wrote it for a specific reader. Use when drafting or revising a README, blog post, design doc, guide, announcement, PR description or any explanatory text meant for people, and when the user complains that writing sounds like AI. Not for code comments or commit messages.
---

# Writing without the model accent

Model prose is usually correct and tight. What gives it away is how often it
does a handful of things a human writer does now and then. Measured against
13 well-regarded technical posts written before LLMs, Opus and Sol drafts
used general maxims 4–8 times as often, three-part series 2–3 times, headings
2–3½ times, and sentences averaging 11 words instead of 16. Sol drafts also
disclaim four to six times as often. Asked to write casually, both models
add jokes at ten times the human rate.

Deleting these afterwards barely works, because in model drafts the rules
carry the argument. Writing differently from the start does work: posts
written with the brief below won every blind comparison against the same
models' plain drafts.

## Before writing

Name the reader in one line: who they are, what they already know, what
they will do after reading. Write to that person. Do not describe the
register you are aiming for ("casual", "fun", "professional") and then
perform it; describe the person and let the register follow.

## While writing

- **Lead with a case.** Open each section on something concrete: a snippet,
  a bug, a number, a situation. Let the rule come out of it. If you have no
  real case, say so and ask the user for one rather than inventing it.
- **Don't end paragraphs on a one-liner.** "Boring is fine." "Optimism is not
  an invariant." One per piece can land. A rule the reader needs belongs in
  the paragraph that shows it.
- **Count your threes.** List three things when there are three things.
- **Headings only where a reader would jump.** A continuous argument is one
  section. Prefer paragraphs to bullet lists, and bold nothing a reader
  would not scan for.
- **Let sentence length vary like speech.** Some long, some short. Do not
  chop an explanation into eleven-word sentences.
- **Jokes only if they are funny to this reader.** Not to sound relaxed.
- **Say what is true, once.** Skip disclaimers about what the text does not
  claim, and reminders the reader did not need ("usage may be billed", "keep
  secrets out of logs") unless the reader will act on them here.
- **No "not X, it's Y" for emphasis.** Use it when someone actually believes X.

## After writing

If the system-one-deslop repository is available and `TYPESAFE_API_KEY` is
set, run the check and fix what it flags by rewriting the passage, not by
deleting the flagged sentence:

```sh
npm run check -- path/to/draft.md --genre "README" --audience "Developers who land on the repo"
```

It reports each habit's rate against the human baseline and lists the
sentences that drive it. The baseline is 13 technical blog posts, so treat
other genres' ratios as a rough guide.
