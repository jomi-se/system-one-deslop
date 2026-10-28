# Idea: observe explanatory UI copy

Not evaluated. This proposal concerns copy that explains the implementation
or answers the person who commissioned a screen, even though it appears on
the screen itself. For example, a footer saying "Data is refreshed from the
service on every load" may belong in documentation rather than beside a
working control. Whether a particular line earns its place needs reader
judgments with the surrounding screen visible.

The proposed policy gives persistent explanation a high bar on working
screens, including after onboarding and repeated use. It is a preference to
test, not a finding that all explanation is unnecessary. No UI-copy question
catalogue, labelled evaluation, or measured detection result exists yet.

## Narrow observations

Compose separate observations in code. Don't ask one question to infer
whether the reader will become an expert and then decide if the copy belongs.

| Observation                                                         | Evidence                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Does the string explain how something works?                        | String, role and nearby visible copy.                                        |
| Does it report the current state?                                   | String and the state actually shown.                                         |
| Does it instruct the reader to take an action?                      | String and the relevant controls.                                            |
| Does it repeat a nearby heading or status?                          | Both strings and their roles.                                                |
| Is the surface help, documentation, onboarding or a working screen? | Product metadata where available; otherwise a labelled inference or unknown. |
| How often is the screen used?                                       | Usage evidence or product knowledge; unknown when unavailable.               |
| Does the nearby action cost money?                                  | Explicit action semantics.                                                   |
| Does it delete something?                                           | Explicit action semantics.                                                   |
| Can the action be undone?                                           | Observed behavior or reviewed implementation.                                |
| Does the copy disappear when the state changes?                     | Compared states or reviewed implementation.                                  |

Cost, deletion and reversibility are separate facts. Explanation, state and
instruction can overlap; don't force them into one exclusive category. A
model's estimate of typical use for a kind of screen can be retained as an
estimate, separate from measured frequency. Neither actual frequency nor
disappearing copy can be established from one screenshot alone.

## Cases before a checker

Start with visible strings from a rendered DOM, their roles, nearby copy,
the relevant screen state, and supplied product facts. Keep unknown facts
explicit. Pair those inputs with a reader's keep/remove judgment and reason.
Repeated headings, implementation footers, help text, errors and instructions
for consequential actions should all appear in the cases.

The first evaluation should inspect which observations agree with those
labels and where they fail. Code can combine the observations into a proposed
policy once there are cases to assess it. No single observation is currently
a validated deletion rule. A short brief before building may prove more
useful than a checker afterward; the prose experiments in
[FINDINGS.md](../eval/FINDINGS.md) are a reason to test that possibility.

## What text alone misses

Gradients, repeated card layouts, icons and visual emphasis need visual
evidence. Jev's text input cannot establish those properties. A text checker
would also need supplied or measured product facts for observations that
depend on use over time or action behavior.

Proposed 2026-10-27; observation method clarified 2026-10-28.
