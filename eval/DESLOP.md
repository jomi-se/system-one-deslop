# Guarded editor loop

```sh
mise x -- npm run deslop -- document.md --editor opus --rounds 2 --audience "maintainers" --purpose "explain the tradeoff" --genre "technical blog post" --out ../artifacts/deslop-run
```

The source is never modified. `--out` must be a new directory. Baseline and
revision audits run `sentence-c,code`; the editor sees only general maxims,
triplets, playful flourishes, headings/bullets/bold densities, and mean sentence
length. The baseline is a small selected human corpus (`n=13`), not a universal
style prescription. The prompt template is `eval/editor-prompt.md`.

Every prose paragraph/list item and heading gets a round-local `p1`/`h1` ID
with original UTF-16 offsets. Other source spans are read-only context. Number,
inline-code and URL multisets cannot shrink, but details may move between units.
Duplicate IDs, unknown units, edits overlapping code, and newly introduced code
blocks are rejected. Edits apply in reverse offset order. Code bytes are never
part of an editable unit.

Jev V01 checks unsupported specificity using the source as evidence; V02 checks
meaning with explicit authorization for rewording and merges, preserving all
facts and qualifiers. Deletions compare the containing section before/after.
Gate probabilities >= 0.5 and failed gate calls reject edits. Guards are re-run
after gate rejections; surviving deletions are re-gated against the remaining
section edits. Every answer and decision is recorded. These gates are fallible;
inspect the diff before using the revision.

`opus` uses the user's logged-in Claude CLI subscription, safe mode, no tools,
and structured output. Claude's JSON is a wrapper whose
[`structured_output`](https://code.claude.com/docs/en/headless) holds the edits.
`sol` uses the logged-in Codex CLI with `gpt-6.1-sol`, read-only sandboxing,
ephemeral sessions, and a schema-constrained
[final-output file](https://learn.chatgpt.com/docs/non-interactive-mode).
Both receive stdin in a fresh temporary directory, have a fifteen-minute
deadline, and clean up their scratch files. TypeSafe and provider API-key
environment variables are removed; saved subscription authentication is reused.
No auth setup or credentials are copied. Editors may consume subscription usage.

After each round, re-audit and continue if a selected frequency is above 1.5x
baseline and rounds remain. Mean sentence length is context, not an extra
frequency threshold. Defaults to two rounds, with a maximum of ten.
Each process uses two concurrent Jev workers so four batch runs remain bounded.

Output: `revised.md`, `edits.jsonl`, `report.md` with before/after densities and a
unified diff, `summary.json`, and raw before/round audit JSONs. Files are private
and contain source prose. Keep output in an artifact directory outside Git.
An incomplete run exits nonzero and writes `failure.json`; it is not a successful
edit outcome. No editor or live audit runs in tests or CI.
