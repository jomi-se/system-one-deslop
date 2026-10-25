import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LabelStore, cardId, readingText } from "../src/labels.js";
import type { Dataset } from "../src/labels.js";

function fixture(): Dataset {
  return {
    version: 1,
    seed: "test",
    documents: 1,
    total_unique: 2,
    cards: [
      {
        id: "one",
        text: "The useful bit is this.",
        origins: [
          {
            file: "example.md",
            group: "unknown",
            offsets: [0, 23],
            paragraph: "Before. The useful bit is this. After.",
            raw_text: "The useful bit is this.",
            before: "Before. ",
            after: " After.",
          },
        ],
      },
      {
        id: "two",
        text: "Run the command.",
        origins: [
          {
            file: "other.md",
            group: "control",
            offsets: [0, 16],
            paragraph: "Run the command.",
            raw_text: "Run the command.",
            before: "",
            after: "",
          },
        ],
      },
    ],
  };
}
await test("ratings, notes and highlights survive restart; undo restores the previous rating across restarts", (context) => {
  const folder = mkdtempSync(join(tmpdir(), "deslop-labels-"));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "ratings.jsonl");
  const store = new LabelStore(path, fixture());
  store.rate("one", { label: "very_ai", note: "The preface.", highlight: { start: 0, end: 14 } });
  store.rate("one", { label: "a_bit_ai", note: "Changed my mind.", highlight: null });
  store.rate("two", { label: "good", note: "", highlight: null });
  const resumed = new LabelStore(path, fixture());
  assert.equal(resumed.state().ratings.one?.label, "a_bit_ai");
  assert.equal(resumed.undo().id, "two");
  assert.equal(resumed.state().ratings.two, undefined);
  assert.equal(resumed.undo().id, "one");
  const again = new LabelStore(path, fixture());
  assert.equal(again.state().ratings.one?.label, "very_ai");
  assert.equal(again.state().ratings.one?.note, "The preface.");
  assert.deepEqual(again.state().ratings.one?.highlight, { start: 0, end: 14 });
  assert.equal(again.undo().id, "one");
  assert.deepEqual(new LabelStore(path, fixture()).state(), { ratings: {}, canUndo: false });
  assert.equal(readFileSync(path, "utf8").trim().split("\n").length, 6);
});
await test("invalid labels and unknown sentences cannot create journal entries; the blind payload has no provenance", (context) => {
  const folder = mkdtempSync(join(tmpdir(), "deslop-labels-"));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "ratings.jsonl");
  const store = new LabelStore(path, fixture());
  assert.throws(() => store.rate("missing", { label: "good", note: "" }), /Unknown sentence/);
  assert.throws(() => store.rate("one", { label: "human", note: "" }), /Invalid rating/);
  assert.throws(
    () => store.rate("one", { label: "good", note: "", highlight: { start: 0, end: 999 } }),
    /Invalid highlight/,
  );
  assert.equal(existsSync(path), false);
  assert.deepEqual(Object.keys(store.publicCards()[0] ?? {}).sort(), [
    "after",
    "before",
    "id",
    "text",
  ]);
  assert.ok(JSON.stringify(store.export()).includes("example.md"));
  writeFileSync(path, '{"seq":1', "utf8");
  assert.throws(() => new LabelStore(path, fixture()));
  assert.equal(readFileSync(path, "utf8"), '{"seq":1');
});
await test("reading normalization hides Markdown destinations while keeping writing cues and a stable whitespace identity", () => {
  assert.equal(
    readingText("**Read** [this](https://example.com) and `seek(t)`—*carefully*."),
    "Read this and seek(t)—carefully.",
  );
  assert.equal(cardId("One\n  sentence."), cardId("One sentence."));
  assert.notEqual(cardId("One—sentence."), cardId("One sentence."));
});
