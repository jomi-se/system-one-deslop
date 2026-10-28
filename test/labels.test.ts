import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
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

await test("an uncertain sync stops subsequent writes until a restart replays the journal", (context) => {
  const folder = mkdtempSync(join(tmpdir(), "deslop-labels-"));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "ratings.jsonl");
  const store = new LabelStore(path, fixture());
  store.rate("one", { label: "good", note: "", highlight: null });
  const sync = context.mock.method(fs, "fsyncSync", () => {
    throw new Error("Simulated storage failure after append");
  });
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => store.rate("two", { label: "neutral", note: "", highlight: null }),
      /restart the server/,
    );
  } finally {
    sync.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(store.state().ratings.two, undefined);
  const uncertain = readFileSync(path, "utf8");
  assert.throws(
    () => store.rate("one", { label: "very_good", note: "", highlight: null }),
    /restart the server/,
  );
  assert.throws(() => store.undo(), /restart the server/);
  assert.equal(readFileSync(path, "utf8"), uncertain);
  const recovered = new LabelStore(path, fixture());
  assert.equal(recovered.state().ratings.two?.label, "neutral");
  recovered.rate("one", { label: "very_good", note: "", highlight: null });
  assert.equal(new LabelStore(path, fixture()).state().ratings.one?.label, "very_good");
});

await test("a complete JSON event missing its newline is preserved and cannot be appended to", (context) => {
  const folder = mkdtempSync(join(tmpdir(), "deslop-labels-"));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "ratings.jsonl");
  new LabelStore(path, fixture()).rate("one", { label: "good", note: "", highlight: null });
  const truncated = readFileSync(path, "utf8").trimEnd();
  writeFileSync(path, truncated);
  assert.throws(() => new LabelStore(path, fixture()), /Incomplete rating journal/);
  assert.equal(readFileSync(path, "utf8"), truncated);
});

await test("a partial append failure preserves the damaged bytes and stops saves and undo", (context) => {
  const folder = mkdtempSync(join(tmpdir(), "deslop-labels-"));
  context.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, "ratings.jsonl");
  const store = new LabelStore(path, fixture());
  store.rate("one", { label: "good", note: "", highlight: null });
  const append = fs.appendFileSync;
  const failing = context.mock.method(
    fs,
    "appendFileSync",
    (
      file: Parameters<typeof fs.appendFileSync>[0],
      data: Parameters<typeof fs.appendFileSync>[1],
    ) => {
      if (typeof data !== "string") throw new Error("Expected a JSON event");
      append(file, data.slice(0, 10));
      throw new Error("Simulated disk exhaustion after a partial write");
    },
  );
  syncBuiltinESMExports();
  try {
    assert.throws(
      () => store.rate("two", { label: "neutral", note: "", highlight: null }),
      /restart the server/,
    );
  } finally {
    failing.mock.restore();
    syncBuiltinESMExports();
  }
  const damaged = readFileSync(path, "utf8");
  assert.equal(store.state().ratings.two, undefined);
  assert.throws(
    () => store.rate("two", { label: "good", note: "", highlight: null }),
    /restart the server/,
  );
  assert.throws(() => store.undo(), /restart the server/);
  assert.throws(() => new LabelStore(path, fixture()), /Incomplete rating journal/);
  assert.equal(readFileSync(path, "utf8"), damaged);
});
