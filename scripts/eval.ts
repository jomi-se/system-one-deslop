import { closeSync, openSync, writeSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createJevClient, groupCases, runGroups } from "../src/jev.js";
import { evaluateCases, renderReport, summarize } from "../src/evaluation.js";
import { invariant, loadCaseFiles, loadRegistry, ValidationError } from "../src/registry.js";

try {
  let filter = "";
  let repeatOrder = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--repeat-order") repeatOrder = true;
    else if (arg === "--filter") {
      const value = args[++index];
      invariant(value && !value.startsWith("--"), "--filter requires a question ID prefix");
      filter = value;
    } else
      throw new ValidationError(
        "Usage: npm run eval -- [--filter QUESTION_PREFIX] [--repeat-order]",
      );
  }
  const registry = await loadRegistry();
  await loadCaseFiles(registry);
  const cases = registry.cases.filter((c) => c.question_id.startsWith(filter));
  const questions = [...registry.questions.values()].filter((q) => q.id.startsWith(filter));
  invariant(cases.length > 0, "No cases match the selected question prefix");
  const groups = groupCases(cases, registry, repeatOrder);
  const client = createJevClient();
  const directory = resolve(
    process.env.DESLOP_RUNS_DIR ?? "runs",
    new Date().toISOString().replaceAll(":", "-"),
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const fd = openSync(resolve(directory, "raw.jsonl"), "wx", 0o600);
  console.log(
    `Evaluating ${cases.length} cases in ${groups.length} requests; output: ${directory}`,
  );
  try {
    const records = await runGroups(groups, client, {
      onRecord: (record) => {
        writeSync(fd, `${JSON.stringify(record)}\n`);
      },
    });
    const results = evaluateCases(cases, questions, records);
    const summary = summarize(questions, results, records);
    await writeFile(
      resolve(directory, "summary.json"),
      `${JSON.stringify({ ...summary, filter, repeat_order: repeatOrder, cases: results }, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(
      resolve(directory, "report.md"),
      renderReport(questions, results, records, repeatOrder),
      { mode: 0o600 },
    );
    console.log(
      `${summary.overall.correct}/${summary.overall.n} correct; ${summary.failed_requests} failed requests; ${summary.totals.input_tokens} input tokens; estimated $${summary.totals.estimated_usd.toFixed(8)} USD.`,
    );
    if (summary.failed_requests) process.exitCode = 1;
  } finally {
    closeSync(fd);
  }
} catch (error: unknown) {
  // Only our validation messages are safe to print; never print SDK errors or env values.
  console.error(
    error instanceof ValidationError
      ? error.message
      : "Evaluation failed; check credentials, inputs, and output permissions.",
  );
  process.exitCode = 1;
}
