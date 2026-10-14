import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECK_HABITS, checkDensity } from "../src/check.js";
import type { CheckBaseline } from "../src/check.js";
import { codeMetrics } from "../src/density.js";
import type { Density } from "../src/density.js";
import { parseMarkdown } from "../src/parse.js";

function reference(): CheckBaseline {
  return {
    n: 13,
    note: "Tiny, one genre.",
    values: Object.fromEntries(
      CHECK_HABITS.map((habit) => [habit.id, habit.id === "sentence_length_mean_words" ? 20 : 10]),
    ),
  };
}
function roundHeadings(words: number): number {
  return Math.round(words * 0.03);
}
function fixture(words = 1_000, events = 30): Density {
  return {
    prose_words: words,
    texture_prose_words: words,
    texture_sentences: 100,
    quoted_sentences: 0,
    code: {
      ...codeMetrics(parseMarkdown("A sentence.")),
      prose_words: words,
      sentences: 100,
      sentence_length_mean_words: 16,
      sentence_length_stdev_words: 50,
      headings: roundHeadings(words),
      headings_per_1000_words: (roundHeadings(words) / words) * 1_000,
      bullets_per_1000_words: 0,
      bold_spans_per_1000_words: 0,
    },
    questions: Object.fromEntries(
      CHECK_HABITS.filter((habit) => habit.source.startsWith("c.")).map((habit) => [
        habit.source,
        {
          count: events,
          hits: events,
          expected_count: events,
          valid: 100,
          expected: 100,
          per_1000_words: (events / words) * 1_000,
          expected_per_1000_words: (events / words) * 1_000,
        },
      ]),
    ),
  };
}
await test("high ratios are strictly above the threshold; short mean is strictly below 0.8; stdev never vetoes", () => {
  const exact = checkDensity(fixture(), reference());
  assert.equal(exact.flagged, 0);
  assert.equal(exact.rows.find((row) => row.id === "sentence_length_mean_words")?.ratio, 0.8);
  const higher = fixture(1_000, 40);
  assert.ok(higher.code);
  higher.code.headings = 40;
  higher.code.headings_per_1000_words = 40;
  higher.code.sentence_length_mean_words = 15.9;
  const report = checkDensity(higher, reference());
  assert.equal(report.rows.find((row) => row.id === "disclaimer_per_1000_words")?.ratio, 4);
  assert.equal(report.flagged, 7);
  assert.equal(report.rows.find((row) => row.id === "sentence_length_stdev_words")?.flagged, false);
  assert.equal(checkDensity(fixture(), reference(), 2).flagged, 6);
  assert.equal(checkDensity(fixture(), reference(), 4).flagged, 0);
});
await test("count intervals allow strong short-text flags; zero prose produces undefined rates", () => {
  const short = checkDensity(fixture(199, 50), reference());
  assert.equal(short.too_short, true);
  assert.equal(short.flagged, 5);
  assert.equal(short.rows[0]?.value, (50 / 199) * 1_000);
  assert.equal(short.rows[0]?.ratio, ((50 / 199) * 1_000) / 10);
  const boundary = checkDensity(fixture(200, 50), reference());
  assert.equal(boundary.too_short, false);
  assert.equal(boundary.flagged, 5);
  const empty: Density = {
    prose_words: 0,
    texture_prose_words: 0,
    texture_sentences: 0,
    quoted_sentences: 0,
    code: codeMetrics(parseMarkdown("```\ncode only\n```")),
    questions: Object.fromEntries(
      CHECK_HABITS.filter((habit) => habit.source.startsWith("c.")).map((habit) => [
        habit.source,
        {
          count: 0,
          hits: 0,
          expected_count: 0,
          valid: 0,
          expected: 0,
          per_1000_words: null,
          expected_per_1000_words: null,
        },
      ]),
    ),
  };
  const zero = checkDensity(empty, reference());
  assert.equal(zero.too_short, true);
  assert.equal(zero.flagged, 0);
  assert.ok(zero.rows.every((row) => row.value === null && row.ratio === null));
});
await test("a zero baseline cannot silently hide positive observations or produce non-JSON infinity", () => {
  const baseline = reference();
  baseline.values.general_maxim_per_1000_words = 0;
  const empty = checkDensity(fixture(1_000, 0), baseline);
  assert.equal(empty.rows[0]?.ratio, null);
  assert.equal(empty.rows[0]?.flagged, false);
  const positive = checkDensity(fixture(1_000, 1), baseline);
  assert.equal(positive.rows[0]?.ratio, "infinity");
  assert.equal(positive.rows[0]?.flagged, true);
  assert.match(JSON.stringify(positive), /"ratio":"infinity"/);
  assert.equal(checkDensity(fixture(199, 1), baseline).flagged, 1);
});
await test("invalid thresholds and incomplete densities cannot yield a clean result", () => {
  for (const limit of [0, -1, NaN, Infinity])
    assert.throws(() => checkDensity(fixture(), reference(), limit), /finite positive/);
  const missing = fixture();
  delete missing.questions["c.disclaimer"];
  assert.throws(() => checkDensity(missing, reference()), /Incomplete texture/);
  const partial = fixture(199);
  const observation = partial.questions["c.precaution"];
  assert.ok(observation);
  observation.valid = 99;
  observation.count = null;
  observation.per_1000_words = null;
  assert.throws(() => checkDensity(partial, reference()), /Incomplete texture/);
});
