import assert from "node:assert/strict";
import { test } from "node:test";
import type { JsonValue } from "@typesafe-ai/sdk";
import { parseMarkdown } from "../src/parse.js";
import type { MarkdownDocument, Span } from "../src/parse.js";
import {
  AUDIT_QUESTIONS,
  auditDocument,
  auditMetadata,
  buildAuditPlan,
  renderAuditReport,
} from "../src/audit.js";
import { createJevClient, MODEL } from "../src/jev.js";
import { loadRegistry, object } from "../src/registry.js";

function allUnits(document: MarkdownDocument): Span[] {
  return [
    document,
    ...document.sections.flatMap((section) => [
      section,
      ...(section.heading ? [section.heading] : []),
      ...section.paragraphs.flatMap((paragraph) => [paragraph, ...paragraph.sentences]),
    ]),
  ];
}

await test("parser keeps Unicode/CRLF offsets and deterministically reproduces every source span", () => {
  const source =
    "\uFEFF---\r\ntitle: PRIVATE_FRONT_MATTER\r\n---\r\n# Héllo 🚀\r\n\r\nCafé opens. 第二句。 😀 Last sentence!\r\n\r\n- First item. Next thought.\r\n  Continued text.\r\n- Second item.\r\n\r\nSetext heading\r\n----\r\nAnother paragraph.";
  const document = parseMarkdown(source);
  assert.deepEqual(parseMarkdown(source), document);
  assert.equal(document.sections.filter((section) => section.heading).length, 2);
  const paragraphs = document.sections.flatMap((section) => section.paragraphs);
  assert.equal(paragraphs.length, 4);
  assert.equal(paragraphs.filter((paragraph) => paragraph.list_item).length, 2);
  assert.ok(paragraphs[1]?.text.includes("\r\n  Continued text."));
  assert.ok(paragraphs[0]?.sentences.some((sentence) => sentence.text.includes("第二句。")));
  for (const unit of allUnits(document)) {
    assert.equal(source.slice(unit.start, unit.end), unit.text, unit.id);
    assert.ok(unit.start >= 0 && unit.start <= unit.end && unit.end <= source.length);
  }
  assert.ok(!paragraphs.some((paragraph) => paragraph.text.includes("PRIVATE_FRONT_MATTER")));
  const paragraphIds = paragraphs.map((paragraph) => paragraph.id);
  assert.equal(new Set(paragraphIds).size, paragraphIds.length);
});

await test("fences, indented code, link-only lines and thematic breaks never become prose units", () => {
  const source = [
    "# Title",
    "",
    "Before code.",
    "",
    "````ts",
    "SKIP_FENCE",
    "```",
    "STILL_IN_FENCE",
    "````",
    "",
    "~~~",
    "SKIP_TILDE",
    "~~~",
    "",
    "    SKIP_INDENT",
    "\tSKIP_TAB",
    "",
    "[Link](https://example.com)",
    "[ref]: https://example.com",
    "<https://example.com>",
    "",
    "***",
    "",
    "After [inline link](https://example.com) and `inline code`.",
    "",
    "> ```sh",
    "> SKIP_QUOTED_CODE",
    "> ```",
    "",
    "Closing prose.",
    "",
    "```",
    "SKIP_UNCLOSED",
  ].join("\n");
  const paragraphs = parseMarkdown(source).sections.flatMap((section) => section.paragraphs);
  assert.deepEqual(
    paragraphs.map((paragraph) => paragraph.text),
    [
      "Before code.",
      "After [inline link](https://example.com) and `inline code`.",
      "Closing prose.",
    ],
  );
  assert.deepEqual(parseMarkdown("").sections, []);
});

await test("Markdown soft wraps do not create sentence fragments or shift Unicode offsets", () => {
  const source =
    "# Title\r\n\r\nA café 🚀 opens\r\nnext week. To check the\r\nAPI, run the command.\r\n";
  const document = parseMarkdown(source);
  const paragraph = document.sections.flatMap((section) => section.paragraphs)[0];
  assert.deepEqual(
    paragraph?.sentences.map((sentence) => sentence.text),
    ["A café 🚀 opens\r\nnext week.", "To check the\r\nAPI, run the command."],
  );
  for (const unit of allUnits(document))
    assert.equal(source.slice(unit.start, unit.end), unit.text);
});

await test("list continuations and nested items remain prose while list-contained code is skipped", () => {
  const source =
    "- Parent item.\n  Continued text.\n  ```sh\n  SKIP_LIST_CODE\n  ```\n    - Child item.\n- Peer item.\n\nProse resumes.\n\n    SKIP_STANDALONE_CODE";
  const document = parseMarkdown(source);
  const paragraphs = document.sections.flatMap((section) => section.paragraphs);
  assert.equal(paragraphs.length, 4);
  assert.equal(paragraphs[0]?.text, "- Parent item.\n  Continued text.");
  assert.equal(paragraphs[1]?.text, "- Child item.");
  assert.ok(!paragraphs.some((paragraph) => paragraph.text.includes("SKIP_")));
  for (const unit of allUnits(document))
    assert.equal(source.slice(unit.start, unit.end), unit.text);
});

await test("audit states match each source, retain context and never fabricate missing metadata", async () => {
  const registry = await loadRegistry();
  const document = parseMarkdown(
    "# Heading\n\nFirst sentence. Another sentence.\n\nNext paragraph.",
  );
  const metadata = auditMetadata();
  assert.deepEqual(metadata, {
    audience: "unspecified",
    purpose: "unspecified",
    genre: "unspecified",
  });
  assert.deepEqual(auditMetadata({ audience: "maintainers" }), {
    ...metadata,
    audience: "maintainers",
  });
  const plan = buildAuditPlan(document, metadata, registry);
  const documentTask = plan.find((task) => task.pass === "document");
  assert.deepEqual(documentTask?.group.state, { document: { text: document.text, ...metadata } });
  assert.deepEqual(Object.keys(documentTask?.group.questions ?? {}), [...AUDIT_QUESTIONS.document]);
  const paragraphs = document.sections.flatMap((section) => section.paragraphs);
  const paragraphTask = plan.find((task) => task.pass === "paragraph");
  assert.deepEqual(paragraphTask?.group.state, {
    document: { ...metadata, summary: "unspecified" },
    neighbors: { previous: "", next: paragraphs[1]?.text },
    focus: { text: paragraphs[0]?.text },
  });
  const sentenceA = plan.find((task) => task.pass === "sentence-a");
  assert.deepEqual(sentenceA?.group.state.focus, {
    text: "First sentence.",
    paragraph: paragraphs[0]?.text,
  });
  assert.deepEqual(sentenceA?.group.state.neighbors, { previous: "", next: "Another sentence." });
  assert.ok(!Object.hasOwn(sentenceA?.group.state ?? {}, "target"));
  const sentenceB = plan.find((task) => task.pass === "sentence-b");
  assert.deepEqual(sentenceB?.group.state.target, { text: "First sentence." });
  assert.ok(!Object.hasOwn(sentenceB?.group.state ?? {}, "focus"));
  for (const task of plan) {
    assert.ok(
      Object.keys(task.group.questions).every((id) =>
        id.startsWith(task.pass === "sentence-b" ? "b." : "a."),
      ),
    );
  }
  assert.equal(plan.filter((task) => task.pass === "paragraph").length, 2);
  assert.equal(plan.filter((task) => task.pass === "sentence-a").length, 3);
  registry.questions.delete("a.D01");
  assert.throws(() => buildAuditPlan(document, metadata, registry), /missing/);
});

await test("offline audit retains all raw answers/offsets and ranks A defects without conflating B signals", async () => {
  const registry = await loadRegistry();
  const source = "# Heading\n\nA plain sentence.";
  const document = parseMarkdown(source);
  const client = createJevClient({
    apiKey: "offline-test-key",
    fetch: async (_url, init) => {
      assert.ok(typeof init?.body === "string");
      const request = object(JSON.parse(init.body) as unknown, "request");
      const questions = object(request.questions, "questions");
      const answers = Object.fromEntries(
        Object.entries(questions).map(([id, value]): [string, JsonValue] => {
          const q = object(value, id);
          if (q.type === "score")
            return [
              id,
              {
                type: "score",
                score: 0.5,
                confidence: 0.8,
                probabilities: { 0: 0.75, 1: 0, 2: 0.25 },
                legend: { 0: "low", 1: "middle", 2: "high" },
              },
            ];
          return [id, { type: "noul", noul: id.startsWith("b.") ? 0.99 : 0.01 }];
        }),
      );
      return new Response(
        JSON.stringify({ model: MODEL, answers, usage: { input_tokens: 10, output_tokens: 1 } }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  const result = await auditDocument(document, auditMetadata(), registry, client);
  assert.equal(result.requests.length, 4);
  assert.equal(result.answers.length, 27);
  assert.ok(result.answers.every((answer) => answer.answer !== null && answer.error === null));
  assert.equal(result.answers.find((answer) => answer.question_id === "a.P04")?.normalized, 0.25);
  assert.equal(
    result.answers.find((answer) => answer.question_id === "b.significance_assertion")?.normalized,
    0.99,
  );
  const units = new Map(allUnits(document).map((unit) => [unit.id, unit]));
  for (const row of result.answers)
    assert.equal(source.slice(...row.offsets), units.get(row.unit_id)?.text);
  const report = renderAuditReport(result);
  const rankings =
    report.split("Highest A defect signals first")[1]?.split("Per-question means")[0] ?? "";
  assert.ok(!rankings.includes("0.990"));
  assert.equal(source, document.text);
  assert.ok(!JSON.stringify(result).includes("offline-test-key"));
});
