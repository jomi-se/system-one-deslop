# Offline reader/Jev comparison

Download `sentence-ratings.json` from the blind rating UI, then compare that
snapshot with saved audit JSON files. No API key, server, or hosted call is used.
The live dataset and rating journal are never opened or changed.

```sh
npm run compare-ratings -- --ratings /tmp/sentence-ratings.json --audits /tmp/audit-map.json --json /tmp/reader-jev-comparison.json
```

Keep all real inputs and outputs outside Git. The output contains private
reading text, notes, highlights, origins and model answers. Its parent directory
must exist. Creation is exclusive with mode `0600`; existing outputs, symlinks
and hard links are never overwritten. The terminal prints counts only.

The audit map has this format:

```json
{
  "version": 1,
  "audits": [
    {
      "origin_file": "/tmp/example.md",
      "audit_file": "example-audit.json"
    }
  ]
}
```

`origin_file` must exactly match an origin's `file` in the ratings export.
Relative `audit_file` paths resolve against the map's directory. Multiple
audits of one origin are allowed and remain separate runs. An empty map is a
valid coverage-only report. Eval `raw.jsonl` and prompt-sweep outputs are not
supported by this initial importer.

A match requires exact saved UTF-16 sentence offsets, raw text, paragraph,
before/after reading context and card identity. Sentence requests and their
answers must also agree with the audit's stored document and neighboring
sentences. A declared mapping that disagrees with the frozen origin fails;
an origin with no mapping is explicitly unmatched. Legacy audits do not save
source filenames or source fingerprints: the map declares that association,
and verified stored spans cannot establish identity of the entire source file.

The UI shows paragraph context from the first origin of a deduplicated card.
Only matches to that primary origin enter summaries; secondary matches are
retained separately. Jev's saved request may contain additional context beyond
what the reader saw. Do not interpret a primary match as an identical reading
protocol. Input fingerprints identify the JSON snapshots being compared.

The report preserves `very_ai`, `a_bit_ai`, `neutral`, `good`, and `very_good`,
including empty categories. Groups are separate for each audit, model, pass,
question ID and complete question definition. Only noul answers receive a
descriptive mean and list of values; score/choice answers remain raw. Choice
confidence is never treated as severity. Missing questions are relative to the
question definitions observed elsewhere in that audit; a wholly absent pass
is reported separately. Quotation-skipped texture passes can therefore appear
as missing, without being counted as failed requests.

Coverage counts rated cards separately from primary comparisons (one card can
have several audit runs). Failed predictions and missing questions/passes are
counts across those primary comparisons. Unrated cards remain in detailed rows
but do not enter summaries. Zero overlap is a valid result. Malformed identities,
ambiguous duplicate predictions and inconsistent associations fail explicitly.

These are reader categories, not an authorship truth label or calibrated
probability scale. The report calculates no accuracy, ordinal correlation,
threshold performance or composite quality score. Sparse categories and any
question selection using the same labels limit conclusions to exploration.
