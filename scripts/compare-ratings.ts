import { open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareRatings } from "../src/compare-ratings.js";
import type { AuditInput } from "../src/compare-ratings.js";
import { invariant, object, ValidationError } from "../src/registry.js";

export async function compareRatingFiles(ratingsPath: string, mapPath: string, outputPath: string) {
  const readJson = async (path: string): Promise<unknown> =>
    JSON.parse(await readFile(path, "utf8")) as unknown;
  const manifest = object(await readJson(mapPath), "Audit map");
  invariant(manifest.version === 1 && Array.isArray(manifest.audits), "Invalid audit map");
  const inputs: AuditInput[] = [];
  const paths = [resolve(ratingsPath), resolve(mapPath)];
  for (const value of manifest.audits) {
    const entry = object(value, "Audit map entry");
    invariant(
      typeof entry.origin_file === "string" &&
        entry.origin_file.length > 0 &&
        typeof entry.audit_file === "string" &&
        entry.audit_file.length > 0,
      "Invalid audit map entry",
    );
    const path = resolve(dirname(resolve(mapPath)), entry.audit_file);
    paths.push(path);
    inputs.push({ origin_file: entry.origin_file, audit_id: path, value: await readJson(path) });
  }
  invariant(!paths.includes(resolve(outputPath)), "Output aliases an input");
  const result = compareRatings(await readJson(ratingsPath), inputs);
  // Exclusive creation also rejects existing symlinks/hard links to inputs.
  const file = await open(outputPath, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await file.close();
  }
  return result.coverage;
}

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    invariant(
      flag &&
        ["--ratings", "--audits", "--json"].includes(flag) &&
        !options.has(flag) &&
        value &&
        !value.startsWith("--"),
      "Usage: npm run compare-ratings -- --ratings EXPORT.json --audits MAP.json --json NEW.json",
    );
    options.set(flag, value);
  }
  const ratings = options.get("--ratings");
  const audits = options.get("--audits");
  const output = options.get("--json");
  invariant(ratings && audits && output, "Required options: --ratings, --audits, --json");
  const coverage = await compareRatingFiles(ratings, audits, output);
  console.log(
    `${coverage.rated_cards} rated cards; ${coverage.primary_matched_rated_cards} matched primary origins; ${coverage.secondary_only_rated_cards} secondary only; ${coverage.unmatched_rated_cards} unmatched; ${coverage.failed_predictions} failed predictions.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error: unknown) {
    console.error(
      error instanceof ValidationError
        ? error.message
        : "Comparison failed; check JSON inputs and output permissions. Output must be a new file.",
    );
    process.exitCode = 1;
  }
}
