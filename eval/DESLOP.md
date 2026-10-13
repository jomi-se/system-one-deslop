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

Each group is judged on the same touched units and immediate neighboring
paragraphs before/after. V01 rejects unsupported specificity, V02 changed meaning,
and V04 erased voice at noul >= 0.5. `document.author_voice` defaults to
`"as in the original"`; `--author-voice` can supply an explicit description.
B's uncertainty gate receives `original.claim` and `revision.claim` for that
same window and rejects stronger/weaker certainty at probability >= 0.5.
V05 is advisory: reject only `worse` at probability >= 0.5, preserving the full
choice distribution. Failed gate requests reject the group. Re-run set guards
after gate rejections so protected-detail moves cannot depend on rejected groups.
Every proposal, guard and gate answer is recorded.

Reports include observed habits and held-out mean/stdev sentence length,
semicolons, clause-intro colons and em dashes per 1,000 prose words against a small
selected human baseline (`n=13`). These are diagnostics, not quality targets.
No number from these tables is passed to the editor.

`--judge-other` additionally asks the other CLI model to judge full original
and revised documents as randomized anonymous A/B versions. The judgment records
the private mapping, reason and win/tie/loss outcome. This blind preference is the
primary corpus quality signal, not a guarantee of factual fidelity. Ordinary
editing requires only the selected editor; cross-model judging requires both
saved CLI logins. The corpus experiment enables it for every run.

`opus` uses the saved Claude CLI subscription, safe mode, no tools, and its
[`structured_output`](https://code.claude.com/docs/en/headless) JSON wrapper.
`sol` uses `gpt-6.1-sol` with read-only sandboxing, ephemeral sessions and a
schema-constrained [final file](https://learn.chatgpt.com/docs/non-interactive-mode).
Both use stdin, a fresh temporary directory, a fifteen-minute deadline and
scratch cleanup. Provider and TypeSafe API-key environment variables are removed.
Each process uses two Jev workers; editor/judge calls are sequential within a run.

Output: `revised.md`, atomic-group `edits.jsonl`, `report.md` with before/after,
held-out metrics, gate counts and unified diff, `summary.json`, and raw audit JSONs.
Judged runs also write `judgment.json`. Files contain prose: retain them privately
outside Git. Failures exit nonzero and write `failure.json`. No live provider calls
run in tests or CI. Review the diff before using a revision.
