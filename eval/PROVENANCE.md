# Zero-shot provenance baseline

Question: can Jev tell human-written from AI-generated articles when asked
directly, with no questions of our own?

## Data

Russell, Karpinska and Iyyer, "People who frequently use ChatGPT for writing
tasks are accurate and robust detectors of AI-generated text" (ACL 2025,
arXiv 2501.15654). Dataset: [human_detectors](https://github.com/jenna-russell/human_detectors)
(MIT). 300 nonfiction articles under 1,000 words, 150 human and 150 AI, in five
conditions of 30 pairs: GPT-4o, Claude-3.5-Sonnet, paraphrased GPT-4o, o1-Pro,
and humanized o1-Pro. Five expert annotators label every article. The articles
are not copied into this repository.

## Method

`scripts/provenance-baseline.ts` sends each article to `jev-1.13.0` as state,
with a Choice question built from the paper's zero-shot detector prompt
(`prompts/detector_prompts/classify_zero_shot.txt`), word for word. Each article
is asked in both label orders and the AI probabilities are averaged. An article
is labelled AI when the mean exceeds 0.5.

```sh
npm run provenance-baseline -- path/to/human_detectors.json NEW_OUT_DIR
```

`scripts/normalize-punctuation.ts` writes a copy with markup and mark encodings
made identical across both groups. The original articles differ in ways that
are not writing: only AI articles contain `<br/>` and `**bold**`; most human
articles use curly quotes and many AI ones straight quotes. The copy applies
the same changes to every article:

1. `<br>`, `<br/>` and newlines become one paragraph-break form.
2. `<b>…</b>` and `**…**` markers are removed; the text stays.
3. Hair spaces and soft hyphens are removed; runs of spaces collapse.
4. Curly double quotes become `"`.
5. Curly single quotes and apostrophes become `'`.
6. `…` becomes `...`.
7. Em dashes, en dashes and spaced `--` become one unspaced em dash. Whether a
   dash is used is kept.
8. `•` list markers become `- `.

Other punctuation is unchanged. The script fails if any article's word
sequence changes or if any normalised form remains.

```sh
npm run normalize-punctuation -- path/to/human_detectors.json NEW_OUT.json
```

## Results, 14 October 2026

TPR is AI articles labelled AI; FPR is human articles labelled AI. Original
text, then normalised.

| Condition          |          TPR |          FPR |         AUROC |
| ------------------ | -----------: | -----------: | ------------: |
| Claude-3.5-Sonnet  |   100 → 100% | 23.3 → 23.3% | 1.000 → 1.000 |
| GPT-4o             |   100 → 100% | 23.3 → 23.3% | 1.000 → 1.000 |
| GPT-4o paraphrased |   100 → 100% | 33.3 → 40.0% | 1.000 → 0.998 |
| o1-Pro             |   100 → 100% | 16.7 → 13.3% | 1.000 → 1.000 |
| o1-Pro humanized   | 93.3 → 96.7% | 20.0 → 23.3% | 0.921 → 0.915 |
| All                | 98.7 → 99.3% | 23.3 → 24.7% | 0.980 → 0.978 |

Mean P(AI): AI articles 0.937 → 0.938, human articles 0.352 → 0.358. Swapping
the label order moved P(AI) by 0.013–0.014 on average. Each run was 600
requests with no failures, about 0.82M input tokens and $0.035.

For reference, from the paper: the expert majority vote misclassified 1 of 300
articles; GPT-4o with this prompt caught 3.3% of o1-Pro and 0% of humanized
o1-Pro articles (Table 23).
