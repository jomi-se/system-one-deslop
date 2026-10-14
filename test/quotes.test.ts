import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdown, quotedFraction } from "../src/parse.js";
import { measureDensity } from "../src/density.js";
import type { AuditAnswer } from "../src/audit.js";

const sentences = (source: string) =>
  parseMarkdown(source).sections.flatMap((section) =>
    section.paragraphs.flatMap((paragraph) => paragraph.sentences),
  );

await test("long straight/curly/single/guillemet quotes count, while short terms and apostrophes do not", () => {
  for (const source of [
    '"one two three four."',
    "“one two three four.”",
    "'one two three four.'",
    "‘We shouldn’t change this prose.’",
    "«one two three four.»",
  ])
    assert.equal(quotedFraction(source), 1);
  for (const source of [
    '"one two three."',
    "A ‘term’ isn't a quote of someone’s prose.",
    "It's our prose and we're using contractions.",
    'An author uses `"one two three four"` as code.',
    '[Own prose](https://example.com/ "a long link title")',
  ])
    assert.equal(quotedFraction(source), 0);
  assert.equal(quotedFraction("“one two three four” five six seven eight."), 0.5);
  assert.ok(quotedFraction('We say "one two three four."') > 0.5);
});
await test("quote ranges span paragraphs and Unicode soft wraps, ignore fenced strings, and retain source offsets", () => {
  const source =
    'Intro stays ours.\r\n\r\n“Café one two three.\r\n\r\nFive six seven eight.”\r\n\r\n```\r\n"unmatched code quote\r\n```\r\n\r\nOur next paragraph stays ours.';
  const units = sentences(source);
  assert.equal(units.length, 4);
  assert.deepEqual(
    units.map((sentence) => sentence.quoted_fraction),
    [0, 1, 1, 0],
  );
  for (const unit of units) assert.equal(source.slice(unit.start, unit.end), unit.text);
  assert.deepEqual(
    sentences(
      "> one two three four.\nLazy continuation is still quoted.\n\nAuthor resumes prose here.",
    ).map((sentence) => sentence.quoted_fraction),
    [1, 1, 0],
  );
});
await test("quotes leave code metrics intact but remove their sentences, probabilities, hits and words from C density", () => {
  const document = parseMarkdown(
    "Original own prose remains.\n\n> Borrowed maxim repeats from elsewhere.\n\nMore authored words go here.",
  );
  const units = document.sections.flatMap((section) =>
    section.paragraphs.flatMap((paragraph) => paragraph.sentences),
  );
  const probabilities = [0.2, 0.99, 0.3];
  const answers: AuditAnswer[] = units.map((unit, index) => ({
    unit_id: unit.id,
    kind: "sentence",
    offsets: [unit.start, unit.end],
    question_id: "c.signal",
    answer: { type: "noul", noul: probabilities[index] ?? 0 },
    normalized: probabilities[index] ?? 0,
    error: null,
  }));
  const density = measureDensity(document, answers, ["c.signal"], { code: true, texture: true });
  assert.equal(density.prose_words, 14);
  assert.equal(density.texture_prose_words, 9);
  assert.equal(density.quoted_sentences, 1);
  assert.equal(density.texture_sentences, 2);
  assert.equal(density.code?.sentences, 3);
  assert.equal(density.questions["c.signal"]?.expected_count, 0.5);
  assert.equal(density.questions["c.signal"]?.hits, 0);
  assert.equal(density.questions["c.signal"]?.expected_per_1000_words, (0.5 / 9) * 1_000);
});
