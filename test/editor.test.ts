import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdown } from "../src/parse.js";
import {
  applyEdits,
  editUnits,
  guardEdits,
  groupWindow,
  protectedTokens,
} from "../src/editor/edits.js";
import type { EditGroup } from "../src/editor/edits.js";
import { parseProviderOutput, parseJudgeOutput } from "../src/editor/providers.js";
import { gateEdits, gateRejects } from "../src/editor/gates.js";
import { editorPrompt } from "../src/editor/prompt.js";
import { comparisonPrompt, judgmentOutcome } from "../src/editor/judge.js";
import { auditDocument, auditMetadata } from "../src/audit.js";
import { createJevClient, MODEL } from "../src/jev.js";
import { invariant, object, loadRegistry } from "../src/registry.js";
import type { Answer } from "../src/evaluation.js";

function payload(body: unknown) {
  invariant(typeof body === "string", "Fake fetch expected JSON text");
  const request = object(JSON.parse(body) as unknown, "Request");
  return {
    state: object(request.state, "State"),
    questions: object(request.questions, "Questions"),
  };
}

function group(replacements: Record<string, string>): EditGroup {
  return { unit_ids: Object.keys(replacements), replacements, reason: "reader benefit" };
}
function choice(label: string, probabilities: Record<string, number>): Answer {
  return { type: "choice", choice: label, confidence: probabilities[label] ?? 0, probabilities };
}

await test("atomic offset application preserves Unicode, CRLF and code but collapses non-code blank runs", () => {
  const source =
    "# Title\r\n\r\nCafé 🚀 works.\r\n\r\n```js\r\nconst value = 42;\r\n\r\n\r\ncode();\r\n```\r\n\r\nLast paragraph.\r\n\r\n\r\n\r\n";
  const document = parseMarkdown(source),
    units = editUnits(document);
  assert.deepEqual(
    units.map((unit) => unit.id),
    ["h1", "p1", "p2"],
  );
  assert.ok(units.every((unit) => source.slice(unit.start, unit.end) === unit.text));
  const revised = applyEdits(
    source,
    [group({ h1: "# Changed", p1: "Café 🚀 still works.", p2: "" })],
    units,
  );
  assert.ok(revised.includes("Café 🚀 still works."));
  assert.equal(revised.endsWith("\r\n\r\n"), true);
  assert.deepEqual(
    parseMarkdown(revised).code_blocks.map((block) => block.text),
    document.code_blocks.map((block) => block.text),
  );
  assert.throws(() => applyEdits("changed " + source, [group({ p1: "x" })], units), /stale/);
  assert.throws(() => applyEdits(source, [group({ unknown: "x" })], units), /offsets/);
  assert.throws(
    () => applyEdits(source, [group({ p1: "a" }), group({ p1: "b" })], units),
    /Duplicate/,
  );
  const indented = "Text.\n\n    first\n\n\n\n    second\n\n\n\nLast.\n";
  const parsed = parseMarkdown(indented);
  assert.equal(parsed.code_blocks.length, 1);
  assert.ok(parsed.code_blocks[0]?.text.includes("\n\n\n\n"));
  const output = applyEdits(indented, [group({ p2: "Changed." })], editUnits(parsed));
  assert.deepEqual(
    parseMarkdown(output).code_blocks.map((block) => block.text),
    parsed.code_blocks.map((block) => block.text),
  );
  assert.ok(output.includes("second\n\nChanged."));
});

await test("set guards allow duplicate references to disappear while rejecting entire invalid or dependent groups", () => {
  const source =
    "# `unwrap()` is a claim\n\nEvery `unwrap()` makes a claim; keep 42 and [docs](./guide.md).\n\nNeighbor.";
  const document = parseMarkdown(source),
    units = editUnits(document);
  const merged = group({
    h1: "",
    p1: "Every `unwrap()` makes a claim; keep 42 and [docs](./guide.md). This is why it matters.",
  });
  assert.equal(guardEdits(source, [merged], units, document.code_blocks)[0]?.guard.accepted, true);
  const losing = group({ h1: "", p1: "The claim matters." });
  assert.equal(guardEdits(source, [losing], units, document.code_blocks)[0]?.guard.accepted, false);
  assert.ok(protectedTokens(applyEdits(source, [merged], units)).has("code:`unwrap()`"));
  for (const proposals of [
    [group({ h1: "", unknown: "x" })],
    [group({ p1: "a" }), group({ p1: "b" })],
    [group({ h1: "", p1: "```\nnew code\n```" })],
  ])
    assert.ok(
      guardEdits(source, proposals, units, document.code_blocks).every(
        (entry) => !entry.guard.accepted,
      ),
    );
  const moves = [
    group({ p1: "The claim matters." }),
    group({ p2: "Neighbor 42 `unwrap()` [docs](./guide.md)." }),
  ];
  assert.ok(
    guardEdits(source, moves, units, document.code_blocks).every((entry) => entry.guard.accepted),
  );
  assert.equal(
    guardEdits(source, moves.slice(0, 1), units, document.code_blocks)[0]?.guard.accepted,
    false,
  );
  const codeSource = "Prose.\n\n```\ncode\n```",
    codeDoc = parseMarkdown(codeSource),
    codeUnits = editUnits(codeDoc),
    block = codeDoc.code_blocks[0];
  assert.ok(block && codeUnits[0]);
  const illicit = { ...codeUnits[0], ...block, id: "code" };
  assert.equal(
    guardEdits(codeSource, [group({ code: "changed" })], [illicit], codeDoc.code_blocks)[0]?.guard
      .accepted,
    false,
  );
});

await test("matched windows include neighbours on both sides and preserve borrowed content once", () => {
  const source =
    "Before.\n\n# Claim\n\nIf clients trigger it, return an error.\n\nAfter.\n\nDistant.";
  const units = editUnits(parseMarkdown(source));
  const window = groupWindow(
    source,
    group({ h1: "", p2: "If clients trigger it, return an error; that is the claim." }),
    units,
  );
  assert.ok(window.original.startsWith("Before."));
  assert.ok(window.original.endsWith("After."));
  assert.equal(window.original.includes("Distant."), false);
  assert.ok(window.revised.startsWith("Before."));
  assert.ok(window.revised.endsWith("After."));
  assert.equal(window.revised.includes("# Claim"), false);
  assert.equal((window.revised.match(/If clients trigger it/g) ?? []).length, 1);
});

await test("provider parsing keeps atomic maps and full blind judgments, rejecting malformed wrappers or partial maps", () => {
  const edits = [group({ h1: "", p1: "New prose." })];
  const wrap = (value: unknown) =>
    JSON.stringify({ type: "result", subtype: "success", structured_output: value });
  assert.deepEqual(parseProviderOutput("opus", wrap({ edits })), {
    edits,
    format: "structured_output",
  });
  assert.deepEqual(
    parseProviderOutput(
      "opus",
      JSON.stringify({ type: "result", result: JSON.stringify({ edits }) }),
    ),
    { edits, format: "result-json" },
  );
  assert.deepEqual(parseProviderOutput("sol", JSON.stringify({ edits })), {
    edits,
    format: "schema-file",
  });
  assert.deepEqual(parseJudgeOutput("opus", wrap({ better: "B", reason: "Clearer" })), {
    better: "B",
    reason: "Clearer",
    format: "structured_output",
  });
  assert.equal(
    parseJudgeOutput("sol", JSON.stringify({ better: "tie", reason: "Same" })).better,
    "tie",
  );
  for (const bad of [
    { type: "result", is_error: true, structured_output: { edits } },
    { type: "assistant", structured_output: { edits } },
    { type: "result", structured_output: null, result: JSON.stringify({ edits }) },
    { type: "result", result: "```json\n{}\n```" },
  ])
    assert.throws(() => parseProviderOutput("opus", JSON.stringify(bad)));
  assert.throws(() =>
    parseProviderOutput(
      "sol",
      JSON.stringify({
        edits: [{ unit_ids: ["h1", "p1"], replacements: { h1: "" }, reason: "partial" }],
      }),
    ),
  );
  assert.throws(() =>
    parseProviderOutput(
      "sol",
      JSON.stringify({
        edits: [{ unit_ids: ["p1", "p1"], replacements: { p1: "x" }, reason: "duplicate" }],
      }),
    ),
  );
  assert.throws(() =>
    parseJudgeOutput("sol", JSON.stringify({ better: "original", reason: "not blind" })),
  );
});

await test("gate thresholds keep equivalent V05 advisory and reject voice/certainty regression atomically with matched windows", async () => {
  const equivalent = choice("equivalent", {
    better: 0.05,
    equivalent: 0.85,
    worse: 0.1,
    unclear: 0,
  });
  assert.equal(gateRejects("a.V05", equivalent), false);
  assert.equal(
    gateRejects(
      "a.V05",
      choice("worse", { better: 0.1, equivalent: 0.1, worse: 0.5, unclear: 0.3 }),
    ),
    true,
  );
  assert.equal(
    gateRejects(
      "a.V05",
      choice("worse", { better: 0.2, equivalent: 0.2, worse: 0.49, unclear: 0.11 }),
    ),
    false,
  );
  assert.equal(
    gateRejects(
      "b.uncertainty_change",
      choice("stronger", { preserved: 0.2, stronger: 0.5, weaker: 0.1, insufficient_context: 0.2 }),
    ),
    true,
  );
  assert.equal(
    gateRejects(
      "b.uncertainty_change",
      choice("weaker", { preserved: 0.2, stronger: 0.1, weaker: 0.5, insufficient_context: 0.2 }),
    ),
    true,
  );
  const registry = await loadRegistry(),
    metadata = auditMetadata();
  const source = "# `unwrap()` is a claim\n\nIf clients trigger it, return an error.\n\nNeighbor.";
  const document = parseMarkdown(source),
    units = editUnits(document);
  const requests: Record<string, unknown>[] = [];
  function client(regression: boolean) {
    return createJevClient({
      apiKey: "offline-fixture",
      fetch: async (_url, init) => {
        const request = payload(init?.body);
        requests.push(request.state);
        const answers = Object.fromEntries(
          Object.entries(request.questions).map(([id, q]) => [
            id,
            object(q, "Question").type === "noul"
              ? { type: "noul", noul: id === "a.V04" && regression ? 0.8 : 0.01 }
              : id === "a.V05"
                ? equivalent
                : choice(regression ? "stronger" : "preserved", {
                    preserved: regression ? 0.1 : 0.9,
                    stronger: regression ? 0.8 : 0.05,
                    weaker: 0.05,
                    insufficient_context: regression ? 0.05 : 0,
                  }),
          ]),
        );
        return new Response(
          JSON.stringify({ model: MODEL, answers, usage: { input_tokens: 10, output_tokens: 2 } }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
  }
  const proposal = group({
    h1: "",
    p1: "If clients trigger it, return an error. Every `unwrap()` is a claim.",
  });
  const rejected = await gateEdits(
    source,
    [proposal],
    units,
    document.code_blocks,
    registry,
    metadata,
    client(true),
  );
  assert.equal(rejected.decisions[0]?.accepted, false);
  assert.equal(rejected.decisions[0]?.gates.length, 5);
  assert.equal(
    applyEdits(
      source,
      rejected.decisions.filter((entry) => entry.accepted).map((entry) => entry.proposal),
      units,
    ),
    source,
  );
  assert.equal(rejected.rejected_by_gate["a.V04"], 1);
  assert.equal(rejected.rejected_by_gate["b.uncertainty_change"], 1);
  assert.ok(
    rejected.decisions[0]?.gates.find((g) => g.question_id === "a.V05")?.answer?.type === "choice",
  );
  const accepted = await gateEdits(
    source,
    [proposal],
    units,
    document.code_blocks,
    registry,
    metadata,
    client(false),
  );
  assert.equal(accepted.decisions[0]?.accepted, true);
  assert.equal(
    applyEdits(
      source,
      accepted.decisions.filter((entry) => entry.accepted).map((entry) => entry.proposal),
      units,
    ).includes("# `unwrap()`"),
    false,
  );
  const a = requests.find((request) => Object.hasOwn(request, "candidate"));
  assert.deepEqual(a?.document, { ...metadata, author_voice: "as in the original" });
  const original = object(a?.original, "Original window"),
    candidate = object(a?.candidate, "Revised window");
  assert.ok(typeof original.text === "string" && typeof candidate.text === "string");
  assert.ok(original.text.endsWith("Neighbor.") && candidate.text.endsWith("Neighbor."));
  const b = requests.find((request) => Object.hasOwn(request, "revision"));
  assert.deepEqual(b?.original, { claim: original.text });
  assert.deepEqual(b?.revision, { claim: candidate.text });
});

await test("editor sees only inline habit marks and metadata; blind A/B mapping never exposes provenance or metrics", async () => {
  const source =
    "# Title\n\n**Rule** holds. A joke lands.\n\n- Three real items: red, green, blue.\n\n```\nunchanged();\n```";
  const document = parseMarkdown(source),
    registry = await loadRegistry(),
    metadata = auditMetadata({ audience: "Dev $& Ops" });
  const client = createJevClient({
    apiKey: "offline-fixture",
    fetch: async (_url, init) => {
      const request = payload(init?.body);
      return new Response(
        JSON.stringify({
          model: MODEL,
          answers: Object.fromEntries(
            Object.keys(request.questions).map((id) => [id, { type: "noul", noul: 0.9 }]),
          ),
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const audit = await auditDocument(document, metadata, registry, client, ["sentence-c", "code"]);
  const prompt = editorPrompt(
    "Reader: {{audience}}\nPurpose: {{purpose}}\nGenre: {{genre}}",
    source,
    editUnits(document),
    audit,
    metadata,
  );
  for (const marker of ["maxim", "triplet", "flourish", "heading", "bullets", "bold"])
    assert.ok(prompt.includes(`«${marker}»`));
  assert.ok(prompt.includes("Dev $& Ops"));
  assert.ok(prompt.includes("unchanged();"));
  assert.doesNotMatch(prompt, /per_1000|sentence_length|stdev|baseline|DETECTOR REPORT|\[0,/);
  for (const first of [true, false]) {
    const pair = comparisonPrompt("Original facts.", "Revised facts.", metadata, first);
    assert.equal(
      judgmentOutcome({ better: pair.revised_version, reason: "Preference" }, pair.revised_version),
      "win",
    );
    assert.equal(
      judgmentOutcome(
        { better: pair.original_version, reason: "Preference" },
        pair.revised_version,
      ),
      "loss",
    );
    assert.equal(judgmentOutcome({ better: "tie", reason: "Same" }, pair.revised_version), "tie");
    assert.doesNotMatch(
      pair.prompt,
      /Original version|Revised version|opus|sol|per_1000|sentence_length/,
    );
  }
});
