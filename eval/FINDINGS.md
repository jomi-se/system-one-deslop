# Findings, 13 October 2026

What we learned the first night we pointed Jev at real text. Run artifacts
stay outside the repo; the numbers below come from them, and every step is
reproducible with the scripts in this directory. Jev cost for the whole night,
including two dozen editor runs, was under a dollar.

## 1. Jev answers both question styles well on clear cases

`npm run eval` on the labelled cases: dossier A's defect questions scored
97/100 and dossier B's observation questions 39/40, with one Choice answer
flipping when its options were reversed. The cases were written by us and
are easy, so this says the questions are understood, not that they work on
real text.

The misses were informative. A.S08 ("does an -ing clause attach unsupported
significance?") fired on "The script exits early, leaving the lock file in
place." Jev answers the literal question: there is an -ing clause.

## 2. A's defect questions flag human writing more than model writing

We audited 3 pre-LLM human posts (Go blog, Rust book) and 12 posts written by
Opus and Sol on the same topics. Human writing got more flags on almost
every A question: removable paragraphs, padding, hedging, signposting,
"manufactured drama". Pike and Gerrand write with asides, pacing and
signposts. Opus and Sol write tight. A's questions measure tightness, and by
that measure current models are not the problem.

The one A question leaning the other way was D10, "generic synthesis".

## 3. What separates model prose is how often it does things

Each habit below is fine once. Models do them several times more often than
the 13 human documents in `corpus/human`:

| Habit (per 1,000 words, vs human)                     |     Opus |      Sol |
| ----------------------------------------------------- | -------: | -------: |
| general maxims ("Boring is fine.")                    |     4.1× | 6.7–7.9× |
| three-part series                                     | 2.1–2.9× | 2.7–3.0× |
| headings                                              | 3.3–3.5× | 1.9–2.6× |
| playful asides, when the prompt names a casual reader |      13× |     8.8× |

Mean sentence length alone separated all 25 documents: every model post
averaged 12.1 words or fewer, every human one 12.7 or more. That needs more
documents and more prompt styles before anyone leans on it.

"Not X, it's Y" reframes and setup lines ("Here's the thing:") did not
separate the groups, even though they feel like tells when you read model
prose. Short one-sentence paragraphs did not either: the human posts use
them a quarter of the time.

So Jev's job is narrow observations per sentence (catalogue C,
`questions/c-texture.json`) and code does the counting, which is what the
Jev 1.13 notes recommend anyway.

## 4. Naming the reader changes the slop, not the amount

Telling a model its readers are "a chill crew, not overly serious,
technically strong" did not reduce any defect measure. It multiplied playful
asides by ten or more. The model performs the register it was told about.
This is the same thing that happened when Claude rewrote this repo's first
README for "a chill dev team" (`fixtures/`): better than the original,
still recognisably a model being casual on purpose.

## 5. An editor shown the counts games the counts

Editor v1 gave Opus and Sol each document's rates next to the human
baseline. Both brought every targeted rate down to about the baseline, and
reading the results shows how: short sentences glued together with
semicolons, natural three-item lists bent into two-plus-an-afterthought,
a good joke flattened into a plain clause, one conditional turned into an
assertion. The numbers improved and the prose got only partly better. This
is the reward hacking the Science or Slop paper warns about, reproduced in
an hour.

## 6. Jev's "is the revision better?" question likes longer answers

We took 20 edits that v1 accepted and labelled them by hand: 3 better, 11
no different, 6 worse (`cases/v05-real-edits.json`). A.V05 agreed on 9. It
never answered "worse", and it called an edit "better" with near certainty
whenever the new paragraph had absorbed sentences from its neighbour, which
makes it look more informative. On the synthetic cases it had scored 4/4.
That is the length bias from "Flattery, Fluff, and Fog", in our own judge.
So V05 can veto ("worse") but cannot approve, and the comparison has to
cover the same stretch of text before and after.

The labels are one rater's, and that rater is the same model family as one
of the editors. Treat them as a smoke test, not ground truth.

## 7. Editor v2: no gaming, but the gates block good edits

v2 shows the editor the marked sentences instead of rates, keeps sentence
length and punctuation hidden as a Goodhart alarm, and accepts an edit group
only if it passes Jev's preservation checks and V05 does not call it worse.
The other model then compares the whole original and revised document
blind.

- No gaming: sentence length, its spread and semicolon rate stayed flat.
- Where the document changed, the blind judge preferred the edit 8 times,
  tied twice, and preferred the original once. The loss deleted the line
  "A panic in a handler is a bad day", which was carrying the voice.
- Only 14 of 72 proposed groups got through. Reading 16 rejected ones: 8
  were good edits (deleting "That's the whole philosophy.", "That last
  option matters.", "Neither approach is universally correct."), 5 were
  rightly stopped (they dropped a real claim or a voice line), 3 were close
  calls. V05 did most of the blocking: it prefers the longer text whichever
  side it is on.

So Jev is good at narrow observations ("is this an aphorism?") and crisp
preservation checks ("does the revision add a new fact?", "did certainty
change?"), and not at "is this better for the reader?". Dossier B argued for
that split before we had any data. Editor v3 hands the reader judgment to the
other model as a reviewer and keeps Jev for detection and hard checks.

## 8. Editor v3: good edits, small effect

v3 keeps Jev for the hard checks (new facts, changed certainty) and lets the
other model review each proposed edit as the reader would. Every one of the
12 documents it changed won its blind comparison, the voice lines survived,
and the hidden metrics did not move. The judge was the editor's own model
this time, which flatters the editor, so read 12 of 12 as "no regressions"
rather than as proof of a large gain.

The catch is that the habit rates barely moved (maxims 23.3 to 22.8 per
1,000 words against a human 4.1). The accepted edits are all of one kind:
delete a sentence that restates its neighbour. The reviewer turned down 51
other proposals, and on reading them it was mostly right. The deleted maxim
was the post's thesis, or the next sentence pointed back at it.

In these posts the maxims carry the argument. Opus and Sol write rule first
and illustrate second, where Pike and the Rust book lead with a case and let
the rule fall out of it. A meaning-preserving editor that may not invent
examples cannot turn one into the other. The fix is probably upstream: ask
the author for the case the rule needs, or brief the writer before it
writes.
