import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { runReaderEvalFiles } from "../scripts/reader-eval.js";
import { MODEL } from "../src/jev.js";
import { LABELS } from "../src/label-types.js";
import type { Rating } from "../src/label-types.js";
import { cardId } from "../src/labels.js";
import {
  planReaderEval,
  renderReaderReport,
  runReaderEval,
  summarizeReaderEval,
} from "../src/reader-eval.js";
import { object } from "../src/registry.js";

function fixture() {
  const rows = [...LABELS, null].map((label, index) => {
    const text = `Sentence number ${index} contains observable detail.`;
    const rating: Rating | null =
      label === null
        ? null
        : {
            label,
            note: "NOTE_NOT_FOR_MODEL",
            highlight: { start: 0, end: 8 },
            updated_at: "2026-01-01T00:00:00Z",
          };
    return {
      id: cardId(text),
      text,
      origins: [
        {
          file: "ORIGIN_NOT_FOR_MODEL",
          group: "GROUP_NOT_FOR_MODEL",
          offsets: [0, text.length],
          raw_text: text,
          paragraph: text,
          before: "BEFORE_NOT_FOR_MODEL",
          after: "AFTER_NOT_FOR_MODEL",
        },
      ],
      rating,
    };
  });
  return {
    ratings: {
      version: 1,
      dataset: { seed: "SEED_NOT_FOR_MODEL", documents: 6, total_unique: 6 },
      rows,
    },
    questions: [
      {
        id: "QUESTION_ONE_NOT_FOR_MODEL",
        family: "FAMILY_NOT_FOR_MODEL",
        question: "Does this sentence announce its content?",
      },
      {
        id: "QUESTION_TWO_NOT_FOR_MODEL",
        family: "FAMILY_NOT_FOR_MODEL",
        question: "Does this sentence assert importance?",
      },
    ],
  };
}
function mockClient(seen: unknown[], fail = false) {
  return new TypeSafeClient({
    apiKey: "offline-test-key",
    baseURL: "https://api.example.com",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      assert.ok(typeof init?.body === "string");
      const request = object(JSON.parse(init.body) as unknown, "Request");
      seen.push(request);
      return new Response(
        JSON.stringify({
          model: MODEL,
          answers: { performative: { type: "noul", noul: fail ? 2 : 0.25 } },
          usage: { input_tokens: 10, output_tokens: 1 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
}

await test("requests use one SDK noul question and raw reading string, with no labels or provenance", async () => {
  const f = fixture();
  const plan = planReaderEval(f.ratings, f.questions);
  assert.equal(plan.cards.length, 5);
  assert.equal(plan.tasks.length, 10);
  assert.deepEqual(
    plan.tasks.slice(0, 2).map((task) => task.question_id),
    f.questions.map((question) => question.id),
  );
  assert.ok(plan.tasks.slice(0, 2).every((task) => task.card_id === plan.cards[0]?.id));
  const seen: unknown[] = [];
  const records = await runReaderEval(plan, mockClient(seen), { concurrency: 3 });
  assert.equal(seen.length, 10);
  for (const [index, task] of plan.tasks.entries()) {
    const record = records[index];
    assert.ok(record);
    assert.equal(record.card_id, task.card_id);
    assert.equal(record.question_id, task.question_id);
    assert.deepEqual(record.request, {
      model: MODEL,
      state: plan.cards.find((card) => card.id === task.card_id)?.text,
      questions: {
        performative: {
          type: "noul",
          instructions: plan.questions.find((q) => q.id === task.question_id)?.question ?? "",
        },
      },
    });
    assert.ok(seen.some((value) => isDeepStrictEqual(value, record.request)));
    assert.ok(!JSON.stringify(record.request).includes("NOT_FOR_MODEL"));
  }
  const report = summarizeReaderEval(plan, records);
  assert.equal(report.complete, true);
  assert.equal(report.successful, true);
  assert.deepEqual(
    report.questions[0]?.categories.map((row) => [row.label, row.valid, row.mean]),
    LABELS.map((label) => [label, 1, 0.25]),
  );
  assert.equal(report.totals.input_tokens, 100);
  assert.equal(report.totals.output_tokens, 10);
  assert.equal(
    report.totals.estimated_usd,
    (100 / 1_000_000) * report.totals.input_usd_per_million,
  );
  assert.ok(renderReaderReport(report).includes("estimated input cost"));
});

await test("all-cards is explicit and missing/failed predictions never become zero-valued observations", async () => {
  const f = fixture();
  const plan = planReaderEval(f.ratings, f.questions, true);
  assert.equal(plan.tasks.length, 12);
  const records = await runReaderEval(plan, mockClient([], true));
  const report = summarizeReaderEval(plan, records.slice(1));
  assert.equal(report.complete, false);
  assert.equal(report.successful, false);
  assert.equal(report.coverage.missing, 1);
  assert.equal(report.coverage.failed, 11);
  assert.equal(report.coverage.valid, 0);
  assert.equal(report.questions[0]?.unrated.failed, 1);
  assert.deepEqual(
    report.questions[0]?.categories.map((row) => row.mean),
    [null, null, null, null, null],
  );
  assert.ok(
    report.questions.every((question) =>
      question.categories.every((category) => category.values.length === 0),
    ),
  );
  const sparse = summarizeReaderEval(
    planReaderEval({ ...f.ratings, rows: f.ratings.rows.slice(0, 1) }, f.questions),
    [],
  );
  assert.deepEqual(
    sparse.questions[0]?.categories.map((row) => row.label),
    [...LABELS],
  );
  assert.deepEqual(
    sparse.questions[0]?.categories.map((row) => row.cards),
    [1, 0, 0, 0, 0],
  );
});

await test("regeneration rejects duplicate tasks and changed card/question/model/state/response associations", async () => {
  const f = fixture();
  const plan = planReaderEval(f.ratings, f.questions);
  const records = await runReaderEval(plan, mockClient([]));
  assert.throws(() => summarizeReaderEval(plan, [...records, ...records]), /Duplicate reader task/);
  for (const field of [
    "index",
    "card_id",
    "question_id",
    "state_hash",
    "state",
    "model",
    "question",
    "answer",
    "usage",
  ]) {
    const edited = structuredClone(records);
    const row = edited[0];
    assert.ok(row);
    if (field === "index") row.index = 99;
    else if (field === "card_id" || field === "question_id" || field === "state_hash")
      row[field] = "wrong";
    else if (field === "state") row.request.state = "Different sentence.";
    else if (field === "model") row.request.model = "other-model";
    else if (field === "question") row.request.questions = { performative: noul("Changed?") };
    else if (field === "answer")
      object(row.response, "Response").answers = { another_key: { type: "noul", noul: 0.25 } };
    else row.usage = { input_tokens: 11, output_tokens: 1 };
    assert.throws(() => summarizeReaderEval(plan, edited), { name: "Error" }, field);
  }
});

await test("malformed and duplicate frozen inputs fail before any request is planned", () => {
  const f = fixture();
  for (const questions of [
    [],
    [...f.questions, f.questions[0]],
    [{ id: "q", family: "x", question: "" }],
    [{ id: "q", family: "x", question: "Prompt?", extra: "unexpected" }],
  ])
    assert.throws(() => planReaderEval(f.ratings, questions));
  const row = f.ratings.rows[0];
  assert.ok(row);
  assert.throws(
    () => planReaderEval({ ...f.ratings, rows: [...f.ratings.rows, row] }, f.questions),
    /duplicate card identity/,
  );
  assert.throws(
    () =>
      planReaderEval(
        { ...f.ratings, rows: f.ratings.rows.map((card) => ({ ...card, rating: null })) },
        f.questions,
      ),
    /No selected reading cards/,
  );
  assert.throws(
    () =>
      planReaderEval(
        { ...f.ratings, rows: [{ ...row, rating: { ...row.rating, label: "human" } }] },
        f.questions,
      ),
    /Invalid reader category/,
  );
});

await test("file runner validates before calls, freezes inputs, protects existing output and supports pure report regeneration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "reader-eval-test-"));
  try {
    const f = fixture();
    const ratings = join(directory, "input-ratings.json");
    const questions = join(directory, "input-questions.json");
    const out = join(directory, "run");
    const ratingsText = JSON.stringify(f.ratings);
    await writeFile(ratings, ratingsText);
    await writeFile(questions, "[]");
    const seen: unknown[] = [];
    const client = mockClient(seen);
    await assert.rejects(runReaderEvalFiles({ ratings, questions, out, client }), /nonempty array/);
    assert.equal(seen.length, 0);
    await assert.rejects(stat(out));
    await writeFile(questions, JSON.stringify(f.questions));
    await assert.rejects(
      runReaderEvalFiles({ ratings, questions, out, client, concurrency: 9 }),
      /Concurrency/,
    );
    assert.equal(seen.length, 0);
    const report = await runReaderEvalFiles({ ratings, questions, out, client, concurrency: 2 });
    assert.equal(report.successful, true);
    assert.equal((await stat(out)).mode & 0o777, 0o700);
    assert.equal((await stat(join(out, "ratings.json"))).mode & 0o777, 0o400);
    assert.equal((await stat(join(out, "raw.jsonl"))).mode & 0o777, 0o600);
    assert.equal(await readFile(ratings, "utf8"), ratingsText);
    assert.equal(await readFile(join(out, "ratings.json"), "utf8"), ratingsText);
    const raw = await readFile(join(out, "raw.jsonl"), "utf8");
    assert.ok(raw.endsWith("\n"));
    const records: unknown[] = raw
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as unknown);
    const replayed = summarizeReaderEval(
      planReaderEval(
        JSON.parse(await readFile(join(out, "ratings.json"), "utf8")) as unknown,
        JSON.parse(await readFile(join(out, "questions.json"), "utf8")) as unknown,
      ),
      records,
    );
    assert.deepEqual(replayed, report);
    const calls = seen.length;
    await assert.rejects(runReaderEvalFiles({ ratings, questions, out, client }));
    assert.equal(seen.length, calls);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
