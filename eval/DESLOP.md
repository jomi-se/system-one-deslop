# Guarded editor loop

```sh
mise x -- npm run deslop -- document.md --editor opus --audience "maintainers" --purpose "explain the tradeoff" --genre "technical blog post" --out ../artifacts/deslop-run
```

The source is never modified and `--out` must be new. Default: one round;
`--rounds 2` explicitly requests a second. Baseline/revision audits use
`sentence-c,code`. The editor receives only inline `«maxim»`, `«triplet»`,
`«flourish»`, `«heading»`, `«bullets»`, and `«bold»` marks with reader metadata
and a qualitative frequency note. It sees no density targets, baseline numbers,
sentence-length measurements, or held-out metrics. The owner-maintained prompt
is `eval/editor-prompt.md`.

Prose paragraphs/list items and headings have round-local `p1`/`h1` IDs and
UTF-16 offsets. Code and other gaps are read-only context. Edits have this shape:

```json
{
  "edits": [
    {
      "unit_ids": ["h1", "p1"],
      "replacements": { "h1": "", "p1": "The full replacement paragraph." },
      "reason": "The heading split a continuous argument."
    }
  ]
}
```

Dependent units belong in one group. Groups apply or reject atomically; units
cannot appear in multiple groups. Protected numbers, inline-code spans and URLs
must each remain at least once in the whole document; duplicate mentions may
be removed. After application, collapse three or more consecutive newlines to
two outside code blocks, preserving fenced and indented code bytes.

Each group uses the same touched units and immediate neighboring paragraphs
before/after. V01 is a hard specificity gate at noul >= 0.5; B's uncertainty gate
receives `original.claim`/`revision.claim` for that window and rejects stronger
or weaker certainty at probability >= 0.5. Missing hard answers reject the group.
V02 (meaning change) and V04 (erased voice) are advisory only. V05's full
reader-value distribution is recorded but never vetoes or reaches the reviewer.
`document.author_voice` defaults to `"as in the original"`; `--author-voice` can
supply a description. Re-run set guards after rejections to preserve dependent
protected-detail moves.

One call to the other CLI model reviews all surviving groups per document round.
It receives reader/purpose/genre, matched windows, the editor's reasons, and neutral
V02/V04 probability hints. The reasoning reviewer decides reader benefit, preserving
claims, conditions and voice. Its verdict applies atomically; another set-guard
check catches moves whose destinations it rejects. Editing now requires both saved
CLI logins. Every proposal, observation, review and final decision is retained.

Reports include observed habits and held-out mean/stdev sentence length,
semicolons, clause-intro colons and em dashes per 1,000 prose words against a small
selected human baseline (`n=13`). These are diagnostics, not quality targets.
No number from these tables is passed to the editor.

`--judge-other` retains its flag name but now asks the **editor's own model** to
judge full original/revised documents as randomized anonymous A/B versions in a
fresh session. The judge never sees review decisions or knows which is the edit.
It differs from the reviewer, but using the editor model introduces a known
self-preference bias. This differs from v2's other-model blind judging; compare
results with that change in mind. The private mapping, reason and win/tie/loss
are recorded. The corpus experiment enables judging for every run.

`opus` uses the saved Claude CLI subscription, safe mode, no tools, and its
[`structured_output`](https://code.claude.com/docs/en/headless) JSON wrapper.
`sol` uses `gpt-6.1-sol` with read-only sandboxing, ephemeral sessions and a
schema-constrained [final file](https://learn.chatgpt.com/docs/non-interactive-mode).
Both use stdin, a fresh temporary directory, a fifteen-minute deadline and
scratch cleanup. Provider and TypeSafe API-key environment variables are removed.
Each process uses two Jev workers; editor/reviewer/judge calls are sequential within a run.

Output: `revised.md`, atomic-group `edits.jsonl`, `report.md` with before/after,
held-out metrics, stage/gate counts and unified diff, `summary.json`, raw gate/audit
JSONs and `review-N.json` with reviewer inputs and responses.
Judged runs also write `judgment.json`. Files contain prose: retain them privately
outside Git. Failures exit nonzero and write `failure.json`. No live provider calls
run in tests or CI. Review the diff before using a revision.
