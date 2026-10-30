import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cardId } from "./labels.js";
import type { Card, Dataset } from "./labels.js";
import { invariant, object } from "./registry.js";

/** Load a separately prepared excerpt batch; never sample or rewrite a sentence batch. */
export async function createExcerptDataset(manifestPath: string, seed: string): Promise<Dataset> {
  const manifest = object(
    JSON.parse(await readFile(manifestPath, "utf8")) as unknown,
    "Excerpt manifest",
  );
  invariant(
    manifest.version === 1 &&
      manifest.unit === "excerpt" &&
      Array.isArray(manifest.sources) &&
      manifest.sources.length > 0 &&
      manifest.sources.length <= 2_000,
    "Expected an excerpt manifest with 1–2000 sources",
  );
  const cards: Card[] = [];
  const seen = new Set<string>();
  for (const value of manifest.sources) {
    const source = object(value, "Excerpt source");
    invariant(
      typeof source.file === "string" &&
        source.file.length > 0 &&
        typeof source.group === "string" &&
        source.group.length > 0,
      "Each excerpt source requires a file and group",
    );
    const file = resolve(dirname(manifestPath), source.file);
    const text = await readFile(file, "utf8");
    invariant(text.trim().length > 0, "Empty excerpt source");
    const id = cardId(text);
    invariant(!seen.has(id), "Duplicate excerpt text; prepare a unique batch");
    seen.add(id);
    cards.push({
      id,
      text,
      origins: [
        {
          file,
          group: source.group,
          offsets: [0, text.length],
          raw_text: text,
          paragraph: text,
          before: "",
          after: "",
        },
      ],
    });
  }
  const key = (card: Card) =>
    createHash("sha256")
      .update(seed + card.id)
      .digest("hex");
  return {
    version: 1,
    unit: "excerpt",
    seed,
    documents: cards.length,
    total_unique: cards.length,
    cards: cards.sort((a, b) => key(a).localeCompare(key(b))),
  };
}
