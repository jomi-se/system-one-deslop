import assert from "node:assert/strict";
import { test } from "node:test";
import { auditMetadata } from "../src/audit.js";
import { parseMarkdown } from "../src/parse.js";
import { applyEdits, editUnits, guardEdits, groupWindow } from "../src/editor/edits.js";
import type { EditGroup } from "../src/editor/edits.js";
import type { GatedEdit } from "../src/editor/gates.js";
import { REVIEWER_PROMPT, reviewEdits, reviewInput } from "../src/editor/review.js";
import { otherEditor, parseReviewOutput } from "../src/editor/providers.js";
import type { EditorName, ReviewDecision } from "../src/editor/providers.js";
import type { RequestRecord } from "../src/jev.js";
import { blindComparison } from "../src/editor/judge.js";
import { MODEL } from "../src/jev.js";

function fixture(source: string, groups: EditGroup[]) {
  const document = parseMarkdown(source),
    units = editUnits(document);
  const record: RequestRecord = {
    index: 0,
    state_hash: "offline",
    variant: "original",
    case_ids: [],
    request: { model: MODEL, state: {}, questions: {} },
    response: null,
    usage: null,
    started_at: "2026-01-01T00:00:00.000Z",
    duration_ms: 0,
    error: null,
  };
  const decisions = guardEdits(source, groups, units, document.code_blocks).map(
    (decision, index): GatedEdit => ({
      ...decision,
      group_id: `g${index + 1}`,
      accepted: decision.guard.accepted,
      stage: decision.guard.accepted ? "accepted" : "guard",
      reason: decision.guard.reason,
      window: decision.guard.accepted ? groupWindow(source, decision.proposal, units) : null,
      review: null,
      gates: [
        {
          question_id: "a.V02",
          mode: "advisory",
          answer: { type: "noul", noul: 0.71 },
          rejected: false,
          record,
        },
        {
          question_id: "a.V04",
          mode: "advisory",
          answer: { type: "noul", noul: 0.62 },
          rejected: false,
          record,
        },
        {
          question_id: "a.V05",
          mode: "record",
          answer: {
            type: "choice",
            choice: "worse",
            confidence: 1,
            probabilities: { better: 0, equivalent: 0, worse: 1, unclear: 0 },
          },
          rejected: false,
          record,
        },
      ],
    }),
  );
  return { document, units, decisions };
}
const group = (replacements: Record<string, string>): EditGroup => ({
  unit_ids: Object.keys(replacements),
  replacements,
  reason: "Remove a repeated point.",
});

await test("reviewer receives exact instructions, matched windows and neutral hints in one opposite-model call, with no V05 data", async () => {
  const source = "The earlier point.\n\nThat's the whole philosophy.\n\nNext claim.";
  for (const editor of ["opus", "sol"] as const) {
    const { document, units, decisions } = fixture(source, [group({ p2: "" })]);
    const metadata = auditMetadata({ audience: "Engineers", purpose: "Explain", genre: "Blog" });
    const input = reviewInput(metadata, decisions);
    assert.deepEqual(input.groups[0]?.advisory_flags, [
      "Jev: meaning-change probability 0.71",
      "Jev: voice-erased probability 0.62",
    ]);
    assert.equal(input.groups[0]?.original, source);
    assert.ok(input.groups[0]?.revised.includes("Next claim."));
    let calls = 0;
    const provider = async (model: EditorName, prompt: string) => {
      calls += 1;
      assert.equal(model, otherEditor(editor));
      assert.ok(prompt.startsWith(REVIEWER_PROMPT + "\n\n"));
      assert.doesNotMatch(prompt, /V05|reader-value|"worse"|probabilities/);
      return {
        editor: model,
        format: "offline",
        duration_ms: 0,
        decisions: [
          {
            group_id: "g1",
            verdict: "accept",
            reason: "The previous sentence already makes the point.",
          },
        ] satisfies ReviewDecision[],
      };
    };
    const reviewed = await reviewEdits(
      source,
      decisions,
      units,
      document.code_blocks,
      metadata,
      editor,
      provider,
    );
    assert.equal(calls, 1);
    assert.equal(reviewed.reviewer, otherEditor(editor));
    assert.equal(decisions[0]?.accepted, true);
    assert.equal(decisions[0]?.review?.verdict, "accept");
    assert.ok(
      !applyEdits(
        source,
        decisions.filter((d) => d.accepted).map((d) => d.proposal),
        units,
      ).includes("whole philosophy"),
    );
  }
});

await test("review rejection is atomic and rechecked set guards reject a protected-token move whose destination was rejected", async () => {
  const source = "First 42.\n\nSecond.";
  const { document, units, decisions } = fixture(source, [
    group({ p1: "First." }),
    group({ p2: "Second 42." }),
  ]);
  const provider = async (editor: EditorName) => ({
    editor,
    format: "offline",
    duration_ms: 0,
    decisions: [
      { group_id: "g1", verdict: "accept", reason: "Accept" },
      { group_id: "g2", verdict: "reject", reason: "Reject" },
    ] satisfies ReviewDecision[],
  });
  await reviewEdits(
    source,
    decisions,
    units,
    document.code_blocks,
    auditMetadata(),
    "opus",
    provider,
  );
  assert.deepEqual(
    decisions.map((d) => d.stage),
    ["final-guard", "reviewer"],
  );
  assert.ok(decisions.every((d) => !d.accepted));
  assert.equal(
    applyEdits(
      source,
      decisions.filter((d) => d.accepted).map((d) => d.proposal),
      units,
    ),
    source,
  );
});

await test("review coverage rejects missing, duplicate and unknown ids and empty rounds still make only one call", async () => {
  const source = "First.\n\nSecond.";
  for (const ids of [[], ["g1", "g1"], ["g1", "unknown"]]) {
    const { document, units, decisions } = fixture(source, [
      group({ p1: "Changed." }),
      group({ p2: "Other." }),
    ]);
    const provider = async (editor: EditorName) => ({
      editor,
      format: "offline",
      duration_ms: 0,
      decisions: ids.map((group_id) => ({
        group_id,
        verdict: "accept" as const,
        reason: "Review",
      })),
    });
    await assert.rejects(
      reviewEdits(source, decisions, units, document.code_blocks, auditMetadata(), "sol", provider),
      /Reviewer/,
    );
  }
  const { document, units, decisions } = fixture(source, []);
  let calls = 0;
  await reviewEdits(
    source,
    decisions,
    units,
    document.code_blocks,
    auditMetadata(),
    "sol",
    async (editor) => {
      calls += 1;
      return { editor, format: "offline", duration_ms: 0, decisions: [] };
    },
  );
  assert.equal(calls, 1);
});

await test("review provider parses structured wrappers without accepting malformed verdicts", () => {
  const decisions = [{ group_id: "g1", verdict: "reject", reason: "Lost a condition." }];
  assert.deepEqual(
    parseReviewOutput("opus", JSON.stringify({ type: "result", structured_output: { decisions } })),
    { decisions, format: "structured_output" },
  );
  assert.deepEqual(parseReviewOutput("sol", JSON.stringify({ decisions })), {
    decisions,
    format: "schema-file",
  });
  assert.throws(() =>
    parseReviewOutput(
      "sol",
      JSON.stringify({ decisions: [{ group_id: "g1", verdict: "maybe", reason: "Unsure" }] }),
    ),
  );
  assert.throws(() =>
    parseReviewOutput(
      "opus",
      JSON.stringify({ type: "result", is_error: true, structured_output: { decisions } }),
    ),
  );
});

await test("blind judge uses the editor model in a fresh call, differs from reviewer, and sees no review hints", async () => {
  for (const editor of ["opus", "sol"] as const) {
    let calls = 0;
    const result = await blindComparison(
      "Full original.",
      "Full revision.",
      auditMetadata(),
      editor,
      async (model, prompt) => {
        calls += 1;
        assert.equal(model, editor);
        assert.ok(prompt.includes("Full original.") && prompt.includes("Full revision."));
        assert.doesNotMatch(prompt, /Jev:|verdict|reviewer|V05/);
        return {
          editor: model,
          format: "offline",
          duration_ms: 0,
          better: "tie",
          reason: "Equivalent",
        };
      },
    );
    assert.equal(calls, 1);
    assert.equal(result.judge, editor);
    assert.equal(result.reviewer, otherEditor(editor));
    assert.notEqual(result.judge, result.reviewer);
    assert.equal(result.judge_is_editor, true);
    assert.match(result.bias, /self-preference/);
  }
});
