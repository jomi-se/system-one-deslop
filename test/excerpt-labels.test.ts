import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createExcerptDataset } from "../src/excerpt-labels.js";
import { LabelStore, cardId, isDataset } from "../src/labels.js";
import { readRatingsExport, compareRatings } from "../src/compare-ratings.js";
import { isSnapshot } from "../src/label-types.js";

await test("excerpt source bytes, paragraphs, code and UTF-16 spans survive labeling and export", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "deslop-excerpts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const text =
    "**A whole paragraph** with `code` and 📝.\n\n```\nif value != 0:\n    print(value)\n```\n\nAnother paragraph.\n";
  await writeFile(join(root, "one.md"), text);
  await writeFile(join(root, "two.md"), "A separate excerpt.\n\nIts other paragraph.\n");
  const manifest = join(root, "manifest.json");
  await writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      unit: "excerpt",
      sources: [
        { file: "one.md", group: "human" },
        { file: "two.md", group: "generated" },
      ],
    }),
  );
  const dataset = await createExcerptDataset(manifest, "stable");
  assert.deepEqual(dataset, await createExcerptDataset(manifest, "stable"));
  assert.equal(dataset.unit, "excerpt");
  assert.equal(isDataset(dataset), true);
  const card = dataset.cards.find((c) => c.id === cardId(text));
  assert.equal(card?.text, text);
  assert.deepEqual(card?.origins[0]?.offsets, [0, text.length]);
  assert.equal(text.slice(...(card?.origins[0]?.offsets ?? [0, 0])), text);
  const store = new LabelStore(join(root, "ratings.jsonl"), dataset);
  store.rate(cardId(text), {
    label: "a_bit_ai",
    note: "A phrase.",
    highlight: { start: 0, end: 7 },
  });
  const exported = { version: 1, dataset: { ...dataset, cards: undefined }, rows: store.export() };
  const parsed = readRatingsExport(exported);
  assert.equal(parsed.find((c) => c.id === cardId(text))?.text, text);
  assert.equal(parsed.find((c) => c.id === cardId(text))?.rating?.note, "A phrase.");
  assert.throws(() => compareRatings(exported, []), /cannot compare excerpt/);
  for (const publicCard of store.publicCards())
    assert.deepEqual(Object.keys(publicCard).sort(), ["after", "before", "id", "text"]);
  assert.equal(isSnapshot({ cards: store.publicCards(), ...store.state(), unit: "excerpt" }), true);
  assert.equal(
    isSnapshot({ cards: store.publicCards(), ...store.state(), unit: "unknown" }),
    false,
  );
});

await test("invalid or duplicate excerpt sources cannot silently become a smaller batch", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "deslop-excerpts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const manifest = join(root, "manifest.json");
  await writeFile(manifest, JSON.stringify({ version: 1, unit: "sentence", sources: [] }));
  await assert.rejects(createExcerptDataset(manifest, "test"), /excerpt manifest/);
  await writeFile(join(root, "one.md"), "The same excerpt.\n");
  await writeFile(join(root, "two.md"), "The same  excerpt.\n");
  await writeFile(
    manifest,
    JSON.stringify({
      version: 1,
      unit: "excerpt",
      sources: [
        { file: "one.md", group: "human" },
        { file: "two.md", group: "generated" },
      ],
    }),
  );
  await assert.rejects(createExcerptDataset(manifest, "test"), /Duplicate excerpt/);
  await writeFile(join(root, "two.md"), " \n");
  await assert.rejects(createExcerptDataset(manifest, "test"), /Empty excerpt/);
});
