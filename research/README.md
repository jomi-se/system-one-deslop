# Research inputs

Two independent research passes from 13 October 2026, kept exactly as delivered.
They disagree on purpose, and the eval harness exists to settle it with data.

- `a-dossier/` makes Jev a critic. It has 52 questions that ask whether text is
  defective ("is this significance unwarranted?", "could this paragraph go?"),
  organized as document, paragraph, sentence and verification passes.
- `b-handoff/` makes Jev an observer. It has 13 questions that only report what
  the text does ("does it assert significance?", "how do these two claims
  relate?"), and a reasoning model decides what is wrong. Its reference list
  corrects several readings in A, so trust B on what the papers actually say.
  `background/` holds its earlier review drafts.

Neither set had been run against Jev when these were written. Results of
running them live in `eval/`.
