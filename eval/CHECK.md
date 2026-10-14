# Checking a draft

Run the read-only check with a TypeSafe API key:

```sh
npm run check -- draft.md --genre "technical blog post" --audience "Backend engineers" --json out.json
```

The check runs sentence-C and code passes. It reports maxims, triplets, playful
asides, disclaimers, precautions, headings, bullets, bold, and sentence-length
mean/stdev. Reframes and setup lines remain in the raw audit but are not flagged.

For C habits, the expected count is the sum of sentence nouls. **Hits** count
sentences with noul >= 0.5. Rates and flags use expected counts; hits remain
available for inspection. The baseline stores unweighted means for 13 human
technical blog posts: `expected_metrics` contains expected rates, `metrics`
contains hit rates, and `held_out` contains sentence/punctuation metrics.

The parser measures `quoted_fraction` as the share of visible sentence words
within quoted passages longer than three words. It recognizes straight and
curly single/double quotes, guillemets, and Markdown blockquotes, including soft
continuations. Inline code and link destinations do not open quotes. C skips
sentences above 0.5 and removes their words from its denominator; quoted
headings are also removed from that denominator. Quotes occupying exactly half
a sentence stay eligible. Code metrics retain all prose. Quote detection is a
heuristic; quotation marks do not establish who wrote the passage.

Count flags use the lower end of a **central 90% Poisson score interval** at
every document length. This is the score/Wilson-style approximation obtained
by inverting `(k - lambda)^2 / lambda <= z^2`, with
`z = 1.6448536269514722`. The count endpoints are:

```text
k + z²/2 ± z * sqrt(k + z²/4)
```

Multiply endpoints by 1,000 / word denominator for rate intervals. Fractional
expected counts are used directly without rounding. The lower root is computed
as `k * (k / upper)` to avoid cancellation near zero. At zero counts, the
interval is `[0, z²]`. See the
[Poisson score interval derivation](https://www.stat.umn.edu/geyer/5421/notes/poisson.html).
This approximate band treats the reference baseline as fixed and does not
account for model calibration, sentence dependence, or baseline uncertainty.

A count habit flags only when its lower rate bound exceeds
`--max-ratio` times the baseline (default 3). This applies to structural
counts too. There is no blanket under-200 suppression. Sentence-length mean
still flags below 0.8 times the baseline only with at least 200 authored prose
words; stdev is informational. Flagged C habits show up to five eligible
sentences ranked by noul, including probabilities below 0.5. Structural flags
show matching units, and sentence-length flags show short sentences.

Exit codes: 0 for no flags, 1 for flagged habits, 2 for invalid input or
incomplete Jev results. JSON output keeps raw answers, quote metadata, both
count estimators, intervals, and flags. Existing output files are never
overwritten. This live check is not part of repository CI.
