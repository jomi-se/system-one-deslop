import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { LabelStore } from "../src/labels.js";
import type { Dataset } from "../src/labels.js";

const dataset: Dataset = {
  version: 1,
  seed: "synthetic",
  documents: 1,
  total_unique: 1,
  cards: [
    {
      id: "one",
      text: "A synthetic sentence.",
      origins: [
        {
          file: "fixture.md",
          group: "control",
          offsets: [0, 21],
          raw_text: "A synthetic sentence.",
          paragraph: "A synthetic sentence.",
          before: "",
          after: "",
        },
      ],
    },
  ],
};
const rating = { label: "good", note: "café 日本語 📝", highlight: null };

function fixture(context: TestContext) {
  const directory = fs.mkdtempSync(join(tmpdir(), "deslop-journal-identity-"));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "ratings.jsonl");
  return { path, store: new LabelStore(path, dataset) };
}

await test("read-only replay and UTF-8 append sizes preserve restart and undo", (context) => {
  const { path, store } = fixture(context);
  assert.equal(fs.existsSync(path), false);
  assert.deepEqual(store.state(), { ratings: {}, canUndo: false });
  store.rate("one", rating);
  const before = fs.readFileSync(path);
  assert.ok(before.length > before.toString("utf8").length);
  const reader = new LabelStore(path, dataset);
  assert.equal(reader.state().ratings.one?.note, rating.note);
  assert.equal(reader.export().length, 1);
  assert.deepEqual(fs.readFileSync(path), before);
  store.rate("one", { ...rating, note: "mañana", label: "neutral" });
  store.undo();
  assert.equal(new LabelStore(path, dataset).state().ratings.one?.note, rating.note);
  new LabelStore(path, dataset).undo();
  assert.deepEqual(new LabelStore(path, dataset).state(), { ratings: {}, canUndo: false });
});

for (const mutation of [
  "replacement-empty",
  "replacement-same-size",
  "deleted",
  "truncated",
  "appended",
] as const) {
  await test(`${mutation} journal is preserved and further writes stay stopped`, (context) => {
    const { path, store } = fixture(context);
    store.rate("one", rating);
    const original = fs.readFileSync(path);
    if (mutation.startsWith("replacement")) {
      fs.renameSync(path, path + ".original");
      fs.writeFileSync(path, mutation === "replacement-empty" ? "" : original);
    } else if (mutation === "deleted") fs.unlinkSync(path);
    else if (mutation === "truncated") fs.truncateSync(path, original.length - 1);
    else fs.appendFileSync(path, "Unexpected extra bytes\n");
    const changed = fs.existsSync(path) ? fs.readFileSync(path) : null;
    assert.throws(() => store.rate("one", { ...rating, label: "neutral" }), /restart the server/);
    assert.equal(store.state().ratings.one?.label, "good");
    assert.throws(() => store.undo(), /restart the server/);
    assert.deepEqual(fs.existsSync(path) ? fs.readFileSync(path) : null, changed);
    // Restoring apparently valid bytes cannot revive the failed instance.
    fs.writeFileSync(path, original);
    assert.throws(() => store.rate("one", rating), /restart the server/);
    assert.deepEqual(fs.readFileSync(path), original);
  });
}

await test("a stale second store cannot create or append after another store writes", (context) => {
  const { path, store } = fixture(context);
  const absent = new LabelStore(path, dataset);
  store.rate("one", rating);
  const first = fs.readFileSync(path);
  assert.throws(() => absent.rate("one", rating), /restart the server/);
  assert.deepEqual(fs.readFileSync(path), first);
  const stale = new LabelStore(path, dataset);
  store.rate("one", { ...rating, note: "Second event" });
  const second = fs.readFileSync(path);
  assert.throws(() => stale.undo(), /restart the server/);
  assert.deepEqual(fs.readFileSync(path), second);
  assert.equal(new LabelStore(path, dataset).state().ratings.one?.note, "Second event");
});

await test("a disappearing path during descriptor replay is an error, never an empty store", (context) => {
  const { path, store } = fixture(context);
  store.rate("one", rating);
  const read = fs.readFileSync;
  const mocked = context.mock.method(fs, "readFileSync", (file: Parameters<typeof read>[0]) => {
    assert.equal(typeof file, "number");
    const bytes = read(file);
    fs.renameSync(path, path + ".moved");
    return bytes;
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => new LabelStore(path, dataset), { code: "ENOENT" });
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(new LabelStore(path + ".moved", dataset).state().ratings.one?.note, rating.note);
});

await test("replacement during sync is caught before applying in-memory state", (context) => {
  const { path, store } = fixture(context);
  store.rate("one", rating);
  const sync = fs.fsyncSync;
  const mocked = context.mock.method(fs, "fsyncSync", (fd: number) => {
    sync(fd);
    fs.renameSync(path, path + ".synced");
    fs.writeFileSync(path, "Replacement kept untouched");
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => store.rate("one", { ...rating, label: "neutral" }), /restart the server/);
  } finally {
    mocked.mock.restore();
    syncBuiltinESMExports();
  }
  assert.equal(store.state().ratings.one?.label, "good");
  assert.throws(() => store.undo(), /restart the server/);
  assert.equal(fs.readFileSync(path, "utf8"), "Replacement kept untouched");
  assert.equal(new LabelStore(path + ".synced", dataset).state().ratings.one?.label, "neutral");
});
