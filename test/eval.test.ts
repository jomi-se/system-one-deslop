import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout } from "node:timers/promises";
import type { Question } from "@typesafe-ai/sdk";
import {
  addCases,
  loadRegistry,
  normalizeCatalogues,
  object,
  ValidationError,
} from "../src/registry.js";
import type { EvalCase } from "../src/registry.js";
import {
  createJevClient,
  groupCases,
  MODEL,
  runGroups,
  stateHash,
  tokenTotals,
} from "../src/jev.js";
import { assess, evaluateCases, renderReport, summarize } from "../src/evaluation.js";

const aQuestion = {
  type: "noul",
  instructions: "Does the text mention blue?",
  criteria: { true: "Blue is mentioned.", false: "Blue is absent." },
};
const bQuestion = {
  type: "choice",
  instructions: { question: "Which color is named?" },
  criteria: { blue: "Blue", red: "Red" },
};
function documents() {
  return {
    a: { questions: { S01: { ...aQuestion, title: "Ignored metadata", phase: "sentence" } } },
    b: {
      question_definitions: {
        color: {
          question: bQuestion,
          synthetic_cases: [
            {
              case_id: "color_1",
              state: { text: "blue" },
              intended_label: "blue",
              note: "A synthetic label",
            },
          ],
        },
      },
    },
  };
}
function fixture() {
  const { a, b } = documents();
  const registry = normalizeCatalogues(a, b);
  addCases(
    registry,
    [{ case_id: "a_1", question_id: "a.S01", state: { text: "blue" }, expected: "true" }],
    "fixture",
  );
  return registry;
}
function jsonResponse(answers: unknown, input = 100, output = 2): Response {
  return new Response(
    JSON.stringify({
      model: MODEL,
      answers,
      usage: { input_tokens: input, output_tokens: output },
    }),
    { headers: { "content-type": "application/json" } },
  );
}

await test("normalization strips A metadata, preserves B question identity/order and imports labels", async () => {
  const { a, b } = documents();
  const registry = normalizeCatalogues(a, b);
  assert.deepEqual(registry.questions.get("a.S01"), {
    id: "a.S01",
    source: "a",
    type: "noul",
    question: aQuestion,
  });
  assert.equal(registry.questions.get("b.color")?.question, bQuestion);
  assert.deepEqual(registry.cases, [
    {
      case_id: "color_1",
      question_id: "b.color",
      state: { text: "blue" },
      expected: "blue",
      note: "A synthetic label",
    },
  ]);
  const actual = await loadRegistry();
  assert.ok(actual.questions.has("a.S01") && actual.questions.has("b.significance_assertion"));
  assert.ok(actual.cases.length > 0);
});

await test("surprising catalogue shapes and API metadata fail loudly", () => {
  const { a, b } = documents();
  const malformed = [
    { questions: { S01: { ...aQuestion, type: "boolean" } } },
    { questions: { S01: { ...aQuestion, criteria: { true: "yes" } } } },
    { questions: { S01: { type: "score", instructions: "rate", criteria: ["one"] } } },
    {
      questions: { S01: { type: "choice", instructions: "choose", criteria: { x: 42, y: null } } },
    },
  ];
  for (const candidate of malformed)
    assert.throws(() => normalizeCatalogues(candidate, b), ValidationError);
  assert.throws(
    () =>
      normalizeCatalogues(a, {
        question_definitions: {
          color: {
            question: { ...bQuestion, extraApiField: true },
            synthetic_cases: [],
          },
        },
      }),
    /unexpected field/,
  );
  assert.throws(
    () => normalizeCatalogues(a, { question_definitions: { color: { question: bQuestion } } }),
    /synthetic_cases/,
  );
});

await test("invalid case labels, missing context shapes and duplicate IDs are rejected before calls", () => {
  const registry = fixture();
  const base = { case_id: "new", question_id: "a.S01", state: { text: "blue" }, expected: "true" };
  for (const malformed of [
    { ...base, question_id: "a.UNKNOWN" },
    { ...base, expected: "yes" },
    { ...base, state: [] },
    { ...base, state: { value: undefined } },
    { ...base, note: 42 },
    { ...base, extra: true },
    { ...base, case_id: "a_1" },
    { ...base, question_id: "b.color", expected: "green" },
  ])
    assert.throws(() => addCases(registry, [malformed], "bad fixture"), ValidationError);
  assert.equal(registry.cases.length, 2);
});

await test("state hashing ignores nested object key order but preserves arrays and value types", () => {
  assert.equal(
    stateHash({ a: { z: 1, x: "2" }, b: [1, 2] }),
    stateHash({ b: [1, 2], a: { x: "2", z: 1 } }),
  );
  assert.notEqual(stateHash({ x: [1, 2] }), stateHash({ x: [2, 1] }));
  assert.notEqual(stateHash({ x: "1" }), stateHash({ x: 1 }));
  assert.notEqual(stateHash({ "a:b": "c" }), stateHash({ a: "b:c" }));
  const registry = fixture();
  const groups = groupCases(registry.cases, registry, true);
  assert.equal(groups.length, 2);
  assert.deepEqual(Object.keys(groups[0]?.questions ?? {}), ["b.color", "a.S01"]);
  assert.deepEqual(Object.keys(groups[1]?.questions ?? {}), ["b.color"]);
  const reversed = groups[1]?.questions["b.color"];
  assert.ok(reversed?.type === "choice");
  assert.deepEqual(Object.keys(reversed.criteria), ["red", "blue"]);
  assert.deepEqual(Object.keys(bQuestion.criteria), ["blue", "red"]);
  assert.throws(
    () =>
      groupCases(
        [
          ...registry.cases,
          {
            ...registry.cases[1],
            case_id: "conflict",
            question_id: "a.S01",
            state: { text: "blue" },
            expected: "false",
          },
        ],
        registry,
      ),
    /Conflicting labels/,
  );
});

await test("scoring uses strict midpoint thresholds, declared level count and confidence", () => {
  const noul: Question = { type: "noul" };
  assert.deepEqual(assess(noul, "true", { type: "noul", noul: 0.9 }), {
    correct: true,
    decisiveness: 0.8,
    label: "true",
  });
  assert.equal(assess(noul, "false", { type: "noul", noul: 0.2 }).correct, true);
  assert.equal(assess(noul, "false", { type: "noul", noul: 0.5 }).correct, false);
  const score: Question = { type: "score", criteria: ["low", "middle", "high"] };
  for (const [value, label] of [
    [0.99, "low"],
    [1.01, "high"],
    [1, "tie"],
  ] as const) {
    const answer = {
      type: "score" as const,
      score: value,
      confidence: 0.7,
      probabilities: { 0: 0.2, 1: 0.6, 2: 0.2 },
      legend: { 0: "low", 1: "middle", 2: "high" },
    };
    assert.equal(assess(score, label === "tie" ? "low" : label, answer).correct, label !== "tie");
    assert.equal(assess(score, "high", answer).decisiveness, 0.7);
  }
  const longer: Question = { type: "score", criteria: ["low", "one", "two", "three", "high"] };
  assert.equal(
    assess(longer, "low", {
      type: "score",
      score: 1.5,
      confidence: 0.4,
      probabilities: {},
      legend: {},
    }).correct,
    true,
  );
  assert.throws(() => assess(score, "low", { type: "noul", noul: 0.1 }), /must match/);
});

await test("fake transport sees grouped requests, exact model and option order; flips and tokens count once", async () => {
  const registry = fixture();
  const requests: unknown[] = [];
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: async (url, init) => {
      assert.equal(url, "https://api.typesafe.ai/v1/systemone");
      assert.equal(init?.method, "POST");
      assert.ok(typeof init?.body === "string");
      const request = object(JSON.parse(init.body) as unknown, "request");
      requests.push(request);
      assert.equal(request.model, MODEL);
      const questions = object(request.questions, "questions");
      const choice = object(questions["b.color"], "color");
      const criteria = object(choice.criteria, "criteria");
      return jsonResponse({
        "b.color": {
          type: "choice",
          choice: Object.keys(criteria)[0],
          confidence: 0.8,
          probabilities: { blue: 0.5, red: 0.5 },
        },
        ...(questions["a.S01"] ? { "a.S01": { type: "noul", noul: 0.9 } } : {}),
      });
    },
  });
  const groups = groupCases(registry.cases, registry, true);
  const recorded: unknown[] = [];
  const records = await runGroups(groups, client, {
    onRecord: (record) => {
      recorded.push(record);
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(recorded.length, 2);
  assert.ok(records.every((r) => r.error === null && r.duration_ms >= 0));
  assert.ok(!JSON.stringify(records).includes("offline-test-key"));
  const questions = [...registry.questions.values()];
  const results = evaluateCases(registry.cases, questions, records);
  const summary = summarize(questions, results, records);
  assert.equal(summary.overall.n, 2);
  assert.equal(summary.overall.correct, 2);
  assert.equal(summary.overall.flips, 1);
  assert.equal(summary.overall.paired, 1);
  assert.equal(summary.sources.a?.n, 1);
  assert.equal(summary.sources.b?.n, 1);
  assert.deepEqual(tokenTotals(records), {
    input_tokens: 200,
    output_tokens: 4,
    estimated_usd: (200 / 1_000_000) * 0.042,
  });
  const report = renderReport(questions, results, records, true);
  assert.match(report, /Choice flips: 1\/1/);
  assert.match(report, /author-proposed synthetic expectations/);
});

await test("bounded workers cap concurrent fetches even with many different states", async () => {
  const registry = fixture();
  const cases: EvalCase[] = Array.from({ length: 12 }, (_, i) => ({
    case_id: `case_${i}`,
    question_id: "a.S01",
    expected: "true",
    state: { text: `blue ${i}` },
  }));
  let active = 0;
  let maximum = 0;
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await setTimeout(5);
      active -= 1;
      return jsonResponse({ "a.S01": { type: "noul", noul: 0.8 } });
    },
  });
  const groups = groupCases(cases, registry);
  assert.equal((await runGroups(groups, client, { concurrency: 2 })).length, 12);
  assert.equal(maximum, 2);
  await assert.rejects(runGroups(groups, client, { concurrency: 9 }), /Concurrency/);
});

await test("SDK retries 429/529, stops on permanent errors and logs no raw error body", async () => {
  const registry = fixture();
  const cases = registry.cases.filter((c) => c.question_id === "a.S01");
  let attempts = 0;
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: async () => {
      attempts += 1;
      if (attempts <= 2)
        return new Response("sensitive-error-body", {
          status: attempts === 1 ? 429 : 529,
          headers: { "retry-after": "0" },
        });
      return jsonResponse({ "a.S01": { type: "noul", noul: 0.8 } });
    },
  });
  const records = await runGroups(groupCases(cases, registry), client);
  assert.equal(attempts, 3);
  assert.equal(records[0]?.error, null);
  let failedAttempts = 0;
  const failureClient = createJevClient({
    apiKey: "offline-test-key",
    fetch: async () => {
      failedAttempts += 1;
      return new Response("sensitive-error-body", { status: 400 });
    },
  });
  const failed = await runGroups(groupCases(cases, registry), failureClient);
  assert.equal(failedAttempts, 1);
  assert.deepEqual(failed[0]?.error, { kind: "api", status: 400 });
  assert.ok(!JSON.stringify(failed).includes("sensitive-error-body"));
  const results = evaluateCases(cases, [...registry.questions.values()], failed);
  const summary = summarize([...registry.questions.values()], results, failed);
  assert.equal(summary.overall.n, 1);
  assert.equal(summary.overall.correct, 0);
  assert.equal(summary.overall.mean_decisiveness, null);
  assert.match(
    renderReport([...registry.questions.values()], results, failed, false),
    /a_1.*expected true; answer null/,
  );
});

await test("invalid answer schemas are errors rather than fabricated scores; reported usage survives", async () => {
  const registry = fixture();
  const cases = registry.cases.filter((c) => c.question_id === "a.S01");
  for (const answers of [
    {},
    { "a.S01": { type: "choice", choice: "x" } },
    { "a.S01": { type: "noul", noul: 1.5 } },
  ]) {
    const client = createJevClient({
      apiKey: "offline-test-key",
      fetch: async () => jsonResponse(answers),
    });
    const records = await runGroups(groupCases(cases, registry), client);
    assert.deepEqual(records[0]?.error, { kind: "validation" });
    assert.equal(tokenTotals(records).input_tokens, 100);
    const results = evaluateCases(cases, [...registry.questions.values()], records);
    assert.equal(results[0]?.answer, null);
  }
});
