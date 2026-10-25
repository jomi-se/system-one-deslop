# Blind sentence ratings

Run a local rating UI without an API key:

```sh
npm run label -- --data /tmp/sentence-ratings --runs /tmp/deslop-runs --count 200
```

Use a retained directory outside the repository for real annotations.
`--runs` is optional; when supplied, revised.md files from the v1/v2/v3 editor
runs join the committed generated, briefed, and human corpus. Add other drafts
with repeated `--include FILE.md`. `--seed` selects a reproducible batch.

The first start freezes a dataset.json snapshot. Restarts reuse it and the
append-only ratings.jsonl journal. Exact duplicate reading text appears once,
with every source retained in its provenance. A quarter of the requested batch
is reserved for human controls; the rest samples across generation/edit groups.
Order is shuffled and source information is hidden from the rating page.
Markdown link destinations and emphasis markers are removed for reading;
original text, source offsets, and paragraph context remain in the snapshot.

The five categories are very_ai, a_bit_ai, neutral, good, and very_good.
They are the reader's categories, not an AI probability scale. Optional notes
and selected phrase offsets are saved with each rating. Saving is acknowledged
after the journal has been synced. Undo appends a restoration event instead
of erasing history. An incomplete journal stops startup without truncating it.

Keys 1–5 rate; arrows navigate. Skip leaves an item unrated. Use the Rated or
All sentences view to revisit earlier choices. Download ratings includes text,
effective labels, notes, highlights and provenance for joining with later Jev
results. The UI does not call Jev or reveal predictions.

The default listener is 127.0.0.1:8842. Set `--host` and `--port` when needed.
The server accepts only loopback/Tailscale peers and same-origin browser
writes, serves only its UI/API, and never serves repository files. It is a
single-reader research tool. Stop it with Ctrl+C; restarting with the same data
directory resumes the ratings.
