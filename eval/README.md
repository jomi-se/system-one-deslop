# Question evaluation

Run from the repository root with Node from `mise.toml`:

```sh
mise x -- npm ci
mise x -- npm run eval -- --filter b. --repeat-order
```

The command loads `.env` locally, pins `jev-1.13.0`, and calls the hosted API.
It is never part of tests or CI. Up to eight requests run concurrently; each
has a 60-second total deadline and up to three SDK retries for 429/529.

Both research catalogues load at runtime. A projects only `type`, `instructions`,
and `criteria`; B uses its `question` unchanged and supplies synthetic cases
automatically. Additional `eval/cases/*.json` files each contain an array:

```json
[
  {
    "case_id": "unique_case_id",
    "question_id": "a.S01",
    "state": { "focus": { "text": "Synthetic prose." } },
    "expected": "false",
    "note": "Optional label rationale."
  }
]
```

`--filter` matches a question ID prefix. Noul uses strict probability thresholds
above/below 0.5; choice compares the selected label; score divides by the highest
level index and uses strict thresholds below/above 0.5 for `low`/`high`. Exact
midpoints count as misses. Invalid IDs, shapes, and labels fail before requests.
Matching JSON states share a request even if object keys were inserted in a
different order. Question criteria retain their original order.

`--repeat-order` additionally reverses choice option order and compares selected
labels on valid response pairs. Its token usage is included, but original case
accuracy is counted once. These synthetic labels are author proposals, not
independent ground truth; A and B do not measure the same task.

Each timestamped run writes `raw.jsonl` (request body, response, usage, timing,
sanitized failures), `summary.json`, and `report.md`. Set `DESLOP_RUNS_DIR` to an
artifact directory; the default `runs/` is gitignored. Raw logs contain text
inputs, so keep them private. They exclude headers, API keys, and raw SDK errors.
Cost is an estimate from reported input usage at
[$0.042 per million tokens](https://docs.typesafe.ai/models.md), with output free;
unreported usage from failed attempts is unknown.
