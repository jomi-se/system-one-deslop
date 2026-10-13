import { readFile, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { auditDocument, auditMetadata } from "../src/audit.js";
import type { AuditMetadata } from "../src/audit.js";
import { checkDensity, readCheckBaseline, renderCheckReport } from "../src/check.js";
import { parseMarkdown } from "../src/parse.js";
import { invariant, loadRegistry, ValidationError } from "../src/registry.js";

try {
  const args = process.argv.slice(2);
  const input = args.shift();
  invariant(
    input && !input.startsWith("--"),
    "Usage: npm run check -- FILE.md [--genre TEXT] [--audience TEXT] [--max-ratio N] [--json OUT]",
  );
  let output: string | undefined;
  let maxRatio = 3;
  const metadata: Partial<AuditMetadata> = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[++index];
    invariant(value && !value.startsWith("--"), "Check options require values");
    if (flag === "--genre") metadata.genre = value;
    else if (flag === "--audience") metadata.audience = value;
    else if (flag === "--json") output = resolve(value);
    else if (flag === "--max-ratio") maxRatio = Number(value);
    else throw new ValidationError("Unknown check option");
  }
  invariant(
    Number.isFinite(maxRatio) && maxRatio > 0,
    "--max-ratio must be a finite positive number",
  );
  const source = await readFile(input, "utf8");
  const document = parseMarkdown(source);
  const registry = await loadRegistry();
  const baseline = readCheckBaseline(
    JSON.parse(await readFile("eval/baselines/human-tech-blog.json", "utf8")) as unknown,
  );
  if (output) await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const file = output ? await open(output, "wx", 0o600) : null;
  try {
    const audit = await auditDocument(document, auditMetadata(metadata), registry, undefined, [
      "sentence-c",
      "code",
    ]);
    if (audit.requests.some((request) => request.error)) {
      if (file) await file.writeFile(JSON.stringify({ ...audit, check: null }, null, 2) + "\n");
      throw new ValidationError(
        "Check incomplete: some Jev requests failed; no clean result is available.",
      );
    }
    const report = checkDensity(audit.density, baseline, maxRatio);
    if (file)
      await file.writeFile(JSON.stringify({ ...audit, input, check: report }, null, 2) + "\n");
    console.log(renderCheckReport(input, audit, report).trimEnd());
    process.exitCode = report.flagged ? 1 : 0;
  } finally {
    await file?.close();
  }
} catch (error: unknown) {
  console.error(
    error instanceof ValidationError
      ? error.message
      : "Check failed; check the input, API key, and output path (output must not already exist).",
  );
  process.exitCode = 2;
}
