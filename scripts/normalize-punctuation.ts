// Punctuation-normalised copy of the Russell et al. (2025) human_detectors dataset, applied
// identically to human and AI articles, so a provenance run cannot key on markup or on how a
// mark is encoded. Word sequences and all non-article fields are verified unchanged.
import { readFile, writeFile } from "node:fs/promises";
import { invariant, object, ValidationError } from "../src/registry.js";

export function normalizeArticle(text: string): string {
  let t = text.replace(/<br\s*\/?>/g, "\n"); // 1. line-break markup → paragraph break
  t = t.replace(/<\/?b>/g, "").replaceAll("**", ""); // 2. bold markup removed, text kept
  t = t.replaceAll(" ", " ").replaceAll("­", ""); // 3. hair space, soft hyphen
  t = t.replaceAll("“", '"').replaceAll("”", '"'); // 4. curly double quotes
  t = t.replaceAll("‘", "'").replaceAll("’", "'"); // 5. curly single quotes, apostrophes
  t = t.replaceAll("…", "..."); // 6. ellipsis glyph
  t = t.replace(/\s*(?:—|–|(?<= )--(?= ))\s*/g, "—"); // 7. em, en, spaced -- → unspaced em dash
  t = t.replace(/^\s*•\s*/gm, "- "); // 8. bullet glyph → list marker
  t = t.replace(/[ \t]+/g, " "); // 3. runs of spaces
  return t
    .split(/\s*\n\s*/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n"); // 1. one paragraph break form
}

const words = (text: string): string[] =>
  text.replace(/<\/?b>|<br\s*\/?>/g, " ").match(/[A-Za-z0-9]+/g) ?? [];

try {
  const [input, output] = process.argv.slice(2);
  invariant(input && output, "Usage: npm run normalize-punctuation -- IN.json NEW_OUT.json");
  const dataset = object(JSON.parse(await readFile(input, "utf8")) as unknown, "Dataset");
  const normalized: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(dataset)) {
    const entry = object(value, `Article ${id}`);
    invariant(typeof entry.article === "string", `Article ${id} has no text`);
    const article = normalizeArticle(entry.article);
    invariant(
      words(article).join(" ") === words(entry.article).join(" "),
      `Normalisation changed the words of article ${id}`,
    );
    normalized[id] = { ...entry, article };
  }
  const leftovers = Object.values(normalized).filter((entry) =>
    /<[^>]+>|\*\*|[“”‘’…–• ­]| —|— | {2}|[^\n]\n[^\n]|\n{3}/.test(String(entry.article)),
  ).length;
  invariant(leftovers === 0, `${leftovers} articles still contain normalised forms`);
  await writeFile(output, JSON.stringify(normalized), { flag: "wx", mode: 0o600 });
  console.log(`Normalised ${Object.keys(normalized).length} articles; words and fields unchanged.`);
} catch (error: unknown) {
  console.error(
    error instanceof ValidationError
      ? error.message
      : "Normalisation failed; check the input path and that the output file is new.",
  );
  process.exitCode = 2;
}
