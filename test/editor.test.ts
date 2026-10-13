import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdown } from "../src/parse.js";
import { applyEdits, editUnits, guardEdits } from "../src/editor/edits.js";
import { parseProviderOutput } from "../src/editor/providers.js";

await test("offset application preserves Unicode/CRLF, gaps and code while multiple units change", () => {
  const source =
    "# Title\r\n\r\nCafé 🚀 works.\r\n\r\n```js\r\nconst value = 42;\r\n```\r\n\r\nLast paragraph.\r\n";
  const document = parseMarkdown(source);
  const units = editUnits(document);
  assert.deepEqual(
    units.map((unit) => unit.id),
    ["h1", "p1", "p2"],
  );
  assert.ok(units.every((unit) => source.slice(unit.start, unit.end) === unit.text));
  const output = applyEdits(
    source,
    [
      { unit_id: "h1", replacement: "# Changed", reason: "heading" },
      { unit_id: "p1", replacement: "Café 🚀 still works.", reason: "cadence" },
      { unit_id: "p2", replacement: "", reason: "merge" },
    ],
    units,
  );
  assert.equal(
    output,
    source
      .replace("# Title", "# Changed")
      .replace("Café 🚀 works.", "Café 🚀 still works.")
      .replace("Last paragraph.", ""),
  );
  assert.ok(output.includes(document.code_blocks[0]?.text ?? "missing"));
  assert.throws(
    () => applyEdits(source, [{ unit_id: "unknown", replacement: "x", reason: "x" }], units),
    /offsets/,
  );
  assert.throws(
    () =>
      applyEdits(
        source,
        [
          { unit_id: "p1", replacement: "x", reason: "x" },
          { unit_id: "p1", replacement: "y", reason: "y" },
        ],
        units,
      ),
    /Duplicate/,
  );
});

await test("guards reject unknown IDs, duplicate proposals, code edits and new code blocks", () => {
  const source = "# Title\n\nProse.\n\n```\ncode\n```\n";
  const document = parseMarkdown(source),
    units = editUnits(document);
  const proposals = [
    { unit_id: "unknown", replacement: "x", reason: "x" },
    { unit_id: "p1", replacement: "a", reason: "x" },
    { unit_id: "p1", replacement: "b", reason: "x" },
  ];
  assert.ok(
    guardEdits(source, proposals, units, document.code_blocks).every(
      (entry) => !entry.guard.accepted,
    ),
  );
  const block = document.code_blocks[0];
  assert.ok(block);
  const illicit = {
    ...units[0],
    ...block,
    id: "code",
    kind: "paragraph" as const,
    section: document,
    paragraph: block.text,
  };
  assert.match(
    guardEdits(
      source,
      [{ unit_id: "code", replacement: "changed", reason: "x" }],
      [illicit],
      document.code_blocks,
    )[0]?.guard.reason ?? "",
    /code block/,
  );
  assert.equal(
    guardEdits(
      source,
      [{ unit_id: "p1", replacement: "```\nnew code\n```", reason: "x" }],
      units,
      document.code_blocks,
    )[0]?.guard.accepted,
    false,
  );
});

await test("whole-document multiset guards allow moves and reject lost multiplicity or a failed destination", () => {
  const source = "First 42 `value()` [link](https://example.com/path).\n\nSecond 42.";
  const document = parseMarkdown(source),
    units = editUnits(document);
  const move = [
    { unit_id: "p1", replacement: "First point.", reason: "merge" },
    {
      unit_id: "p2",
      replacement: "Second 42 and 42 `value()` [link](https://example.com/path).",
      reason: "merge",
    },
  ];
  assert.ok(
    guardEdits(source, move, units, document.code_blocks).every((entry) => entry.guard.accepted),
  );
  assert.equal(
    guardEdits(source, move.slice(0, 1), units, document.code_blocks)[0]?.guard.accepted,
    false,
  );
  const lost = [
    {
      unit_id: "p1",
      replacement: "First `value()` [link](https://example.com/path).",
      reason: "x",
    },
  ];
  assert.equal(guardEdits(source, lost, units, document.code_blocks)[0]?.guard.accepted, false);
  const relative = parseMarkdown("Use [docs](./guide.md)."),
    relativeUnits = editUnits(relative);
  assert.equal(
    guardEdits(
      relative.text,
      [{ unit_id: "p1", replacement: "Use docs.", reason: "x" }],
      relativeUnits,
      [],
    )[0]?.guard.accepted,
    false,
  );
});

await test("providers parse Claude structured wrappers and Codex final JSON, rejecting failures and malformed fallbacks", () => {
  const edits = [{ unit_id: "p1", replacement: "New prose.", reason: "general_maxim" }];
  assert.deepEqual(
    parseProviderOutput(
      "opus",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: "",
        structured_output: { edits },
        usage: { ignored: true },
      }),
    ),
    { edits, format: "structured_output" },
  );
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
  for (const bad of [
    { type: "result", is_error: true, structured_output: { edits } },
    { type: "result", subtype: "error_max_turns", structured_output: { edits } },
    { type: "assistant", structured_output: { edits } },
    { type: "result", structured_output: null, result: JSON.stringify({ edits }) },
    { type: "result", result: "```json\n{}\n```" },
  ])
    assert.throws(() => parseProviderOutput("opus", JSON.stringify(bad)));
  assert.throws(() =>
    parseProviderOutput(
      "sol",
      JSON.stringify({ edits: [{ unit_id: "p1", replacement: 42, reason: "x" }] }),
    ),
  );
  assert.throws(() => parseProviderOutput("sol", JSON.stringify({ edits, extra: true })));
});
