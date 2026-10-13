import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { readDensity, renderCorpusReport } from "../src/corpus-report.js";
import { invariant, ValidationError } from "../src/registry.js";

try {
  const args = process.argv.slice(2);
  invariant(args.length === 1 && args[0], "Usage: npm run corpus-report -- DIR_OF_AUDIT_JSONS");
  const directory = resolve(args[0]);
  const entries = [];
  for (const name of (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort()) {
    const raw: unknown = JSON.parse(await readFile(join(directory, name), "utf8"));
    entries.push(readDensity(name, raw));
  }
  const report = renderCorpusReport(entries);
  await writeFile(join(directory, "corpus-report.md"), report, { mode: 0o600 });
  console.log(report);
} catch (error: unknown) {
  console.error(
    error instanceof ValidationError
      ? error.message
      : "Corpus report failed; check the directory and audit JSON files.",
  );
  process.exitCode = 1;
}
