import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, symlink, link, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { JsonValue } from "@typesafe-ai/sdk";
import { compareRatings } from "../src/compare-ratings.js";
import { compareRatingFiles } from "../scripts/compare-ratings.js";
import { auditDocument, auditMetadata } from "../src/audit.js";
import { createJevClient, MODEL } from "../src/jev.js";
import { LABELS } from "../src/label-types.js";
import { cardId, readingText } from "../src/labels.js";
import { parseMarkdown } from "../src/parse.js";
import { loadRegistry, object } from "../src/registry.js";

function fixture(
  options: {
    omitted?: number;
    failed?: number;
    changedDefinition?: boolean;
    choice?: boolean;
  } = {},
) {
  const document = parseMarkdown(
    "First sentence sounds deliberate.\n\nSecond sentence has useful detail.\n\nThird sentence seems ordinary.\n\nFourth sentence is clear.\n\nFifth sentence makes an impression.",
  );
  const paragraphs = document.sections.flatMap((s) => s.paragraphs);
  const units = paragraphs.flatMap((p) => p.sentences.map((s) => ({ sentence: s, paragraph: p })));
  const rows = units.map(({ sentence, paragraph }, index) => ({
    id: cardId(readingText(sentence.text)),
    text: readingText(sentence.text),
    origins: [
      {
        file: "synthetic.md",
        group: "synthetic",
        offsets: [sentence.start, sentence.end],
        raw_text: sentence.text,
        paragraph: paragraph.text,
        before: "",
        after: "",
      },
    ],
    rating: {
      label: LABELS[index],
      note: "",
      highlight: null,
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  }));
  const requests = units.flatMap(({ sentence, paragraph }, index) => {
    if (index === options.omitted) return [];
    const question = {
      type: options.choice ? "choice" : "noul",
      instructions:
        options.changedDefinition && index === 0
          ? "Changed question."
          : "Does this use a flourish?",
      criteria: options.choice ? { first: "One", second: "Two" } : { true: "Yes", false: "No" },
    };
    const answer = options.choice
      ? {
          type: "choice",
          choice: "first",
          confidence: 0.9,
          probabilities: { first: 0.9, second: 0.1 },
        }
      : { type: "noul", noul: index / 4 };
    return [
      {
        unit_id: sentence.id,
        offsets: [sentence.start, sentence.end],
        pass: "sentence-a",
        request: {
          model: "synthetic-model",
          state: {
            focus: { text: sentence.text, paragraph: paragraph.text },
            neighbors: {
              previous: units[index - 1]?.sentence.text ?? "",
              next: units[index + 1]?.sentence.text ?? "",
            },
          },
          questions: { test: question },
        },
        response:
          options.failed === index ? null : { model: "synthetic-model", answers: { test: answer } },
        error: options.failed === index ? { kind: "transport" } : null,
      },
    ];
  });
  const audit = {
    schema_version: "1.0",
    model: "synthetic-model",
    document,
    requests,
    answers: requests.map((r) => ({
      unit_id: r.unit_id,
      kind: "sentence",
      offsets: r.offsets,
      question_id: "test",
      answer: r.response?.answers.test ?? null,
      error: r.error,
    })),
  };
  return {
    ratings: { version: 1, dataset: { seed: "synthetic", documents: 1, total_unique: 5 }, rows },
    audit,
  };
}
function compare(f: ReturnType<typeof fixture>) {
  return compareRatings(f.ratings, [
    { origin_file: "synthetic.md", audit_id: "audit-1", value: f.audit },
  ]);
}

await test("five reader categories remain distinct, zero overlap is valid, and raw choice confidence has no severity summary", () => {
  const f = fixture();
  const empty = compareRatings(f.ratings, []);
  assert.equal(empty.coverage.unmatched_rated_cards, 5);
  assert.deepEqual(
    empty.categories.map((c) => [c.label, c.rated_cards]),
    LABELS.map((label) => [label, 1]),
  );
  const result = compare(f);
  assert.equal(result.coverage.primary_matched_rated_cards, 5);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(
    result.groups[0]?.categories.map((c) => c.noul_mean),
    [0, 0.25, 0.5, 0.75, 1],
  );
  const choices = compare(fixture({ choice: true }));
  assert.ok(
    choices.groups[0]?.categories.every(
      (c) => c.valid === 1 && c.noul_mean === null && c.noul_values.length === 0,
    ),
  );
  assert.equal(choices.rows[0]?.primary_matches[0]?.predictions[0]?.answer?.confidence, 0.9);
});

await test("missing and failed predictions stay distinct and changed definitions/runs never pool", () => {
  const f = fixture({ omitted: 0, failed: 1 });
  const result = compare(f);
  assert.equal(result.coverage.failed_predictions, 1);
  assert.equal(result.coverage.missing_questions, 1);
  assert.equal(result.groups[0]?.categories[0]?.missing, 1);
  assert.equal(result.groups[0]?.categories[1]?.failed, 1);
  assert.equal(result.groups[0]?.categories[1]?.noul_mean, null);
  const changed = fixture({ changedDefinition: true });
  assert.equal(compare(changed).groups.length, 2);
  const runs = compareRatings(f.ratings, [
    { origin_file: "synthetic.md", audit_id: "one", value: f.audit },
    { origin_file: "synthetic.md", audit_id: "two", value: f.audit },
  ]);
  assert.equal(runs.groups.length, 2);
  assert.equal(runs.coverage.primary_comparisons, 10);
});

await test("secondary-origin matches remain visible but never enter primary summaries", () => {
  const f = fixture();
  const row = f.ratings.rows[0];
  assert.ok(row?.origins[0]);
  row.origins.unshift({ ...row.origins[0], file: "unmapped-primary.md" });
  const result = compare(f);
  assert.equal(result.coverage.secondary_only_rated_cards, 1);
  assert.equal(result.rows[0]?.secondary_matches.length, 1);
  assert.equal(result.groups[0]?.categories[0]?.valid, 0);
});

await test("current auditDocument output imports across all sentence passes using an offline SDK mock", async () => {
  const f = fixture();
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: async (_url, init) => {
      assert.ok(typeof init?.body === "string");
      const request = object(JSON.parse(init.body) as unknown, "Request");
      const answers = Object.fromEntries(
        Object.entries(object(request.questions, "Questions")).map(
          ([id, value]): [string, JsonValue] => {
            const question = object(value, "Question");
            if (question.type !== "score") return [id, { type: "noul", noul: 0.25 }];
            assert.ok(Array.isArray(question.criteria));
            return [
              id,
              {
                type: "score",
                score: 0,
                confidence: 1,
                probabilities: Object.fromEntries(
                  question.criteria.map((_, i) => [String(i), i === 0 ? 1 : 0]),
                ),
              },
            ];
          },
        ),
      );
      return new Response(
        JSON.stringify({ model: MODEL, answers, usage: { input_tokens: 1, output_tokens: 1 } }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const audit = await auditDocument(
    f.audit.document,
    auditMetadata(),
    await loadRegistry(),
    client,
    ["sentence-a", "sentence-b", "sentence-c"],
  );
  const result = compareRatings(f.ratings, [
    { origin_file: "synthetic.md", audit_id: "mock-audit", value: audit },
  ]);
  assert.equal(result.coverage.primary_matched_rated_cards, 5);
  assert.equal(result.coverage.failed_predictions, 0);
  assert.equal(result.coverage.missing_passes, 0);
  assert.equal(result.coverage.missing_questions, 0);
});

await test("incorrect card identity, offsets, raw text, reading context, or request context cannot silently join", () => {
  for (const mutation of ["hash", "offset", "raw", "context", "request", "answer"]) {
    const f = fixture();
    const row = f.ratings.rows[0];
    const origin = row?.origins[0];
    assert.ok(row && origin);
    if (mutation === "hash") row.id = "invalid";
    if (mutation === "offset") origin.offsets = origin.offsets.map((offset) => offset + 1);
    if (mutation === "raw") origin.raw_text = origin.raw_text.replace("First", "Other");
    if (mutation === "context") origin.before = "Unseen context.";
    if (mutation === "request") {
      const record = f.audit.requests[0];
      assert.ok(record);
      record.request.state.neighbors.next = "Wrong neighbor.";
    }
    if (mutation === "answer") {
      const answer = f.audit.answers[0];
      assert.ok(answer);
      answer.offsets = [1, 2];
    }
    assert.throws(() => compare(f), { name: "Error" }, mutation);
  }
});

await test("duplicate predictions/maps/cards fail and malformed types are not trusted", () => {
  const duplicate = fixture();
  const record = duplicate.audit.requests[0];
  assert.ok(record);
  duplicate.audit.requests.push(record);
  assert.throws(() => compare(duplicate), /duplicate sentence prediction/);
  const f = fixture();
  const entry = { origin_file: "synthetic.md", audit_id: "audit", value: f.audit };
  assert.throws(() => compareRatings(f.ratings, [entry, entry]), /Duplicate audit mapping/);
  const row = f.ratings.rows[0];
  assert.ok(row);
  f.ratings.rows.push(row);
  assert.throws(() => compare(f), /duplicate card identity/);
  const bad = fixture();
  object(bad.ratings.rows[0], "row").rating = {
    label: "human",
    note: "",
    highlight: null,
    updated_at: "now",
  };
  assert.throws(() => compare(bad), /Invalid reader category/);
});

await test("file importer is offline, writes private new output, preserves inputs, and rejects overwrite/aliases", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compare-ratings-test-"));
  try {
    const f = fixture();
    const ratings = join(directory, "ratings.json");
    const audit = join(directory, "audit.json");
    const manifest = join(directory, "map.json");
    const output = join(directory, "comparison.json");
    const original = JSON.stringify(f.ratings);
    await writeFile(ratings, original);
    await writeFile(audit, JSON.stringify(f.audit));
    await writeFile(
      manifest,
      JSON.stringify({
        version: 1,
        audits: [{ origin_file: "synthetic.md", audit_file: "audit.json" }],
      }),
    );
    const coverage = await compareRatingFiles(ratings, manifest, output);
    assert.equal(coverage.primary_matched_rated_cards, 5);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(compareRatingFiles(ratings, manifest, output));
    await assert.rejects(compareRatingFiles(ratings, manifest, ratings), /aliases an input/);
    const symbolic = join(directory, "symbolic.json");
    const hard = join(directory, "hard.json");
    await symlink(ratings, symbolic);
    await link(ratings, hard);
    await assert.rejects(compareRatingFiles(ratings, manifest, symbolic));
    await assert.rejects(compareRatingFiles(ratings, manifest, hard));
    assert.equal(await readFile(ratings, "utf8"), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
