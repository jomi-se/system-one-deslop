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
After a journal write or sync error, further saves stop until the server is
restarted and the journal replayed. A failed response may still have appended
an event; inspect the preserved journal rather than retrying into uncertain
state. A final event without its newline also stops startup. Request bodies
are limited to 20,000 bytes and decoded as UTF-8 after all chunks arrive;
invalid UTF-8 is rejected.

Loaded journals are checked by file identity and byte size before and after
saving. Replacement, deletion, truncation or unexpected appended bytes stop
further writes; a deleted loaded journal is not recreated. Replay also checks
that the file remains stable while reading. These checks do not detect
same-size edits inside the same file and do not replace writer coordination.
Journal maintenance still requires a stopped server.

Keys 1–5 rate; arrows navigate. Skip leaves an item unrated. Use the Rated or
All sentences view to revisit earlier choices. Download ratings includes text,
effective labels, notes, highlights and provenance for joining with later Jev
results. The UI does not call Jev or reveal predictions.

Use [the offline comparison command](COMPARE-RATINGS.md) to join a downloaded
export with saved Jev audits, preserving the reader's five categories.
For new predictions from a frozen question catalogue, use the explicit
[hosted reader experiment](READER-EVAL.md). Its predictions remain separate
from this blind rating interface.

The default listener is 127.0.0.1:8842. Set `--host` and `--port` when needed.
The server accepts only loopback/Tailscale peers and same-origin browser
writes, serves only its UI/API, and never serves repository files. It is a
single-reader research tool. Stop it with Ctrl+C; restarting with the same data
directory resumes the ratings.

Each upgraded server exclusively owns `.label-writer.lock` in its data
directory, even when servers use different ports. Ownership is acquired before
snapshot creation or journal replay and retained until active requests finish
during shutdown. If the lock disappears or is replaced, that server stops
saving. Read-only replay and offline exports do not acquire this server lock.

Stop every older server using the directory before upgrading: already-running
older code does not participate in this ownership protocol. An existing lock
always blocks a new server. After an abrupt kill, first verify that no writer
remains; only then remove the stale lock manually and restart. The server
does not guess from PIDs or remove replacement locks. This is cooperative
local ownership, not protection against adversarial filesystem changes.
Replacing the journal while a server runs is unsupported and is not prevented
by the writer lock; stop the server before any journal maintenance.
