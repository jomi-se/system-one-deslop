import assert from "node:assert/strict";
import { test } from "node:test";
import { codeMetrics, measureDensity, wordCount } from "../src/density.js";
import { parseMarkdown } from "../src/parse.js";
import type { AuditAnswer } from "../src/audit.js";
import {
  corpusGroup,
  groupDensities,
  readDensity,
  renderCorpusReport,
} from "../src/corpus-report.js";

await test("code metrics exclude code/URL destinations and use population variance and prose word rates", () => {
  const document = parseMarkdown(
    "# Heading\n\n**One** two.\n\n- Three four five six.\n\n```\nhidden words — hidden: Count\n```\n",
  );
  const metrics = codeMetrics(document);
  assert.equal(metrics.prose_words, 7);
  assert.equal(metrics.sentences, 2);
  assert.equal(metrics.sentence_length_mean_words, 3);
  assert.equal(metrics.sentence_length_stdev_words, 1);
  assert.equal(metrics.short_single_sentence_paragraph_share, 1);
  assert.equal(metrics.bold_spans, 1);
  assert.equal(metrics.headings, 1);
  assert.equal(metrics.bullets, 1);
  assert.equal(metrics.bullets_per_1000_words, 1_000 / 7);
  assert.equal(metrics.em_dashes, 0);
  assert.equal(metrics.clause_intro_colons, 0);
  assert.equal(
    wordCount("Café [label](https://example.com/long/path) `hidden code words` stays."),
    3,
  );
  const punctuation = codeMetrics(parseMarkdown("A cue: This works—usually. **Bold** __other__."));
  assert.equal(punctuation.clause_intro_colons, 1);
  assert.equal(punctuation.em_dashes, 1);
  assert.equal(punctuation.bold_spans, 2);
  const semicolons = codeMetrics(
    parseMarkdown(
      "Visible; **thing** `hidden; value` [link](https://example.com/;)\n\n```\nhidden; too\n```",
    ),
  );
  assert.equal(semicolons.semicolons, 1);
  assert.equal(semicolons.semicolons_per_1000_words, 1_000 / semicolons.prose_words);
  const boundary = codeMetrics(
    parseMarkdown(
      "one two three four five six seven eight nine ten eleven twelve.\n\none two three four five six seven eight nine ten eleven twelve thirteen.",
    ),
  );
  assert.equal(boundary.short_single_sentence_paragraph_share, 0.5);
});

await test("density includes the 0.5 boundary and never turns missing judgments or zero words into zero rates", () => {
  const document = parseMarkdown("One two. Three four.");
  function answer(id: string, probability: number): AuditAnswer {
    return {
      unit_id: id,
      kind: "sentence",
      offsets: [0, 1],
      question_id: "c.signal",
      answer: { type: "noul", noul: probability },
      normalized: probability,
      error: null,
    };
  }
  const answers = [answer("s1", 0.5), answer("s2", 0.49)];
  const measured = measureDensity(document, answers, ["c.signal"], { code: true, texture: true });
  assert.deepEqual(measured.questions["c.signal"], {
    count: 1,
    valid: 2,
    expected: 2,
    per_1000_words: 250,
  });
  const incomplete = measureDensity(document, answers.slice(0, 1), ["c.signal"], {
    code: true,
    texture: true,
  });
  assert.equal(incomplete.questions["c.signal"]?.per_1000_words, null);
  assert.equal(incomplete.questions["c.signal"]?.count, null);
  const skipped = measureDensity(document, [], ["c.signal"], { code: false, texture: false });
  assert.equal(skipped.code, null);
  assert.equal(skipped.questions["c.signal"]?.count, null);
  const empty = measureDensity(parseMarkdown("```\nonly code\n```"), [], ["c.signal"], {
    code: true,
    texture: true,
  });
  assert.equal(empty.prose_words, 0);
  assert.equal(empty.code?.sentence_length_mean_words, null);
  assert.equal(empty.code?.sentence_length_stdev_words, null);
  assert.equal(empty.code?.short_single_sentence_paragraph_share, null);
  assert.equal(empty.questions["c.signal"]?.per_1000_words, null);
});

await test("corpus groups exact generated names, averages documents equally and handles undefined ratios", () => {
  assert.equal(corpusGroup("go-errors.opus.reader.json"), "opus.reader");
  assert.equal(corpusGroup("/some/path/rust-panic.sol.generic.json"), "sol.generic");
  assert.equal(corpusGroup("go-errors-are-values.json"), "human");
  assert.equal(corpusGroup("extra.part.opus.reader.json"), "human");
  const entries = [
    { name: "human-one.json", metrics: { rate: 10, zero: 0, missing: null } },
    { name: "human-two.json", metrics: { rate: 30, zero: 0, missing: null } },
    { name: "go.opus.reader.json", metrics: { rate: 40, zero: 5, missing: null } },
    { name: "rust.opus.reader.json", metrics: { rate: 80, zero: 0, missing: null } },
  ];
  const groups = groupDensities(entries);
  assert.equal(groups[0]?.group, "human");
  assert.equal(groups[0]?.n, 2);
  const ai = groups.find((group) => group.group === "opus.reader");
  assert.equal(ai?.metrics.rate, 60);
  assert.equal(ai?.ratios.rate, 3);
  assert.equal(ai?.ratios.zero, null);
  assert.equal(ai?.ratios.missing, null);
  assert.match(renderCorpusReport(entries), /60\.000 \(3\.00×\)/);
  assert.throws(() => groupDensities(entries.slice(2)), /human group/);
  assert.throws(
    () => groupDensities([...entries, { name: "bad.json", metrics: { other: 1 } }]),
    /different metric sets/,
  );
  assert.throws(
    () =>
      readDensity("bad.json", {
        density: {
          code: codeMetrics(parseMarkdown("Hi.")),
          questions: { "c.signal": { count: null, valid: 0, expected: 1, per_1000_words: null } },
        },
      }),
    /incomplete/,
  );
});
