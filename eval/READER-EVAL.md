# Frozen reader-question experiment

This is an explicit hosted Jev experiment. It sends each selected card's exact
displayed reading text as a **raw string state**, with **one question per
request**, using `noul(question)` under the answer key `performative`. This
matches the earlier single-question sentence sweep protocol. No rating, note,
highlight, origin, family, card/question ID or paragraph context is sent to Jev.
IDs are attached only to the local result records. Tasks are scheduled in card
order, with the frozen catalogue order within each card; concurrent completions
may arrive in a different order.

Freeze a UI ratings export and a question catalogue before running:

```json
[
  {
    "id": "content-announcement",
    "family": "delivery",
    "question": "Does this sentence announce what the text is about to explain?"
  }
]
```

Every entry requires exactly `id`, `family` and `question`; IDs must be unique.
The command uses the existing pinned Jev model and server-side API key setup:

```sh
npm run reader-eval -- --ratings /tmp/sentence-ratings.json --questions /tmp/questions.json --out /tmp/new-reader-run
```

Only effectively rated cards are selected by default. `--all-cards` explicitly
includes unrated cards, whose results remain in a separate unrated row. Optional
`--concurrency 1..8` defaults to eight. Input validation and exclusive output
directory creation happen before any hosted request. The output parent must
already exist; an existing directory or symlink is rejected. No resume or
automatic overwrite is supported. Progress prints recorded-request counts every
100 completions, without reading text or labels.

Keep real inputs and outputs outside Git. The new directory has mode `0700`.
Exact input copies (`ratings.json`, `questions.json`) and `manifest.json` are
written once with mode `0400`. The manifest records input fingerprints, model,
selection mode and expected request count. `raw.jsonl` retains each request,
response, usage, timing, failure and local task IDs; each completed record is
flushed and synced. `results.json` and `report.md` contain the resulting
descriptive comparison. These output files have mode `0600`. All artifacts
remain private: the ratings copy includes notes and provenance even though
those fields never enter a model request.

The report preserves all five categories (`very_ai`, `a_bit_ai`, `neutral`,
`good`, `very_good`), including empty categories. Each question gets raw noul
values, means, valid/failed/missing counts, and an unrated row. Failed or absent
predictions never become zero-valued observations. Catalogue order is retained;
no winner ranking, accuracy, thresholding or authorship ground truth is inferred.
The labels are used only after requests, for these descriptive summaries.

Cost is explicitly an estimate from recorded input tokens and the repository's
pinned input-token rate. Missing/failed/retried requests may have unreported
usage, and output tokens are reported but not charged by that estimate. It is
not a billing total.

Offline regeneration uses exported `planReaderEval`, `summarizeReaderEval` and
`renderReaderReport` from `src/reader-eval.ts`: reconstruct the plan from the
retained input JSONs and the manifest's `all_cards`, then pass the parsed raw
records to the pure summarizer. Preserve a raw journal with an incomplete final
line for recovery; do not silently discard its fragment. Duplicate or mismatched
task IDs, model, question, state, response or usage are rejected. A partial set
of complete records is explicitly `complete: false`, with every missing task
counted; failures also make `successful: false`. No API call is needed to report
partial evidence. If request persistence fails, preserve the whole directory
and investigate before starting a new experiment.

Questions should be frozen before inspecting these reader labels. Exploratory
patterns on the same small labeled sample do not establish predictive accuracy
or validate questions selected using that sample.
