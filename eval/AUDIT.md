# Read-only Markdown audit

```sh
mise x -- npm run audit -- document.md --audience "maintainers" --purpose "explain setup" --genre "README" --json audit.json
```

This explicitly calls hosted Jev with the document and its prose units. The
source is never changed; JSON output must be a new file and is created with
private permissions. Keep raw results outside Git in an artifact directory.
The output path can be under `DESLOP_RUNS_DIR`; `--json` uses the exact path
you supply. Without `--json`, only the terminal report is written.

The parser identifies ATX and single-line Setext headings, paragraphs, list
items, and sentences (`Intl.Segmenter`, English). It is a prose scanner, not a
complete CommonMark renderer. Fenced/indented code, front matter, thematic
breaks, and link-only lines do not become paragraph or sentence units. Inline
Markdown remains intact. Document and section spans retain their original
source, and the document pass deliberately sees the full original Markdown.
Offsets are UTF-16 `[start,end)` indices for JavaScript `source.slice(start,end)`;
IDs derive from kind and offsets and are deterministic for the same source.
Soft line wraps are replaced by equal-length spaces only while segmenting
sentences; returned text and offsets always reference the original Markdown.

Question lists live in `AUDIT_QUESTIONS` in `src/audit.ts`. The document pass
uses seven A questions, paragraph units use seven A questions with adjacent
paragraphs, and every sentence uses ten A questions and three B questions.
B receives its own request with `target.text`; A receives `focus.text` and
`focus.paragraph`. No routing or edits are applied.

Missing audience, purpose, and genre are explicitly `"unspecified"`. A.P02 also
asks for `document.summary`; that is `"unspecified"` because no summary is
provided or generated. Sentence context includes the containing paragraph
and immediate neighboring sentences. Missing neighbors at document boundaries
are empty.

The terminal ranks the twenty strongest A defect signals (maximum normalized
value per unit) and lists every question's mean. Positive B observations are
reported separately and do not affect severity ranking. Scores divide by the
highest level index; noul probabilities remain unchanged. JSON includes every
raw answer, question ID, unit ID, offsets, full requests/responses, and token
usage/cost estimates. Failures remain explicit, and incomplete audits exit
nonzero. These judgments remain uncalibrated; no threshold deletes prose.
