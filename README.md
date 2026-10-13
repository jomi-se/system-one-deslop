# system-one-deslop

Ask Sol for a blog post on when Rust code should panic and you get a correct,
tight post with lines like "Optimism is not an invariant." and "`unwrap()` is
a claim, not a convenience." Each is fine. The trouble is that it has about 40 of
those quotable rules per thousand words, where chapters of the Rust book and
posts on the Go blog average about four. Readers who have read a lot of model output
hear that rate as an accent, even when every sentence is accurate.

This repository measures that accent and tries to remove it. TypeSafe's Jev
model answers narrow questions about each sentence (is this a general maxim?
a three-part series? a disclaimer?), code counts the answers per thousand
words, and the counts are compared with 13 technical posts written before
LLMs. What we found the first night is in [eval/FINDINGS.md](eval/FINDINGS.md).
The short version: Opus and Sol write rule-first where human writers lead
with a case, editing the result afterwards barely helps, and a short brief
before writing fixes most of it. That brief is packaged as an agent skill in
[skills/deslop-writing](skills/deslop-writing/SKILL.md).

To check a draft against the baseline:

```sh
npm ci
cp .env.example .env    # add your TYPESAFE_API_KEY
npm run check -- draft.md --genre "blog post" --audience "Backend engineers"
```

It prints each habit's rate next to the human rate and lists the sentences
behind any habit that occurs more than three times as often as in the
human posts. A check of a
2,000-word post costs a fraction of a cent.

The rest of the tooling is for research. `npm run eval` scores Jev on
labelled cases from the question catalogues in [research](research/README.md)
and [eval/questions](eval/questions/c-texture.json). `npm run audit` runs every
question over a Markdown file ([eval/AUDIT.md](eval/AUDIT.md)), and
`npm run deslop` is the experimental editor loop that asks Opus or Sol, through
their CLIs, for edits and gates them ([eval/DESLOP.md](eval/DESLOP.md)).

Development needs Node 26 (pinned in `mise.toml`). `npm run verify` runs the
typecheck, oxlint, oxfmt and the offline tests; nothing in it calls the API.
MIT licensed. See [SECURITY.md](SECURITY.md).
