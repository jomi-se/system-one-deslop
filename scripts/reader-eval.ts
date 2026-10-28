import { appendFileSync, closeSync, fsyncSync, openSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevClient, MODEL } from "../src/jev.js";
import {
  planReaderEval,
  renderReaderReport,
  runReaderEval,
  summarizeReaderEval,
} from "../src/reader-eval.js";
import { invariant, ValidationError } from "../src/registry.js";

export async function runReaderEvalFiles(options: {
  ratings: string;
  questions: string;
  out: string;
  allCards?: boolean;
  concurrency?: number;
  client?: TypeSafeClient;
}) {
  const ratingsText = await readFile(options.ratings, "utf8");
  const questionsText = await readFile(options.questions, "utf8");
  const plan = planReaderEval(
    JSON.parse(ratingsText) as unknown,
    JSON.parse(questionsText) as unknown,
    options.allCards ?? false,
  );
  const concurrency = options.concurrency ?? 8;
  invariant(
    Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8,
    "Concurrency must be between 1 and 8",
  );
  await mkdir(options.out, { mode: 0o700 });
  await writeFile(join(options.out, "ratings.json"), ratingsText, { flag: "wx", mode: 0o400 });
  await writeFile(join(options.out, "questions.json"), questionsText, { flag: "wx", mode: 0o400 });
  await writeFile(
    join(options.out, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        model: MODEL,
        created_at: new Date().toISOString(),
        all_cards: plan.all_cards,
        ratings_hash: plan.ratings_hash,
        questions_hash: plan.questions_hash,
        expected_requests: plan.tasks.length,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx", mode: 0o400 },
  );
  const fd = openSync(join(options.out, "raw.jsonl"), "ax", 0o600);
  let completed = 0;
  try {
    const records = await runReaderEval(plan, options.client ?? createJevClient(), {
      concurrency,
      onRecord: (record) => {
        appendFileSync(fd, JSON.stringify(record) + "\n");
        fsyncSync(fd);
        completed += 1;
        if (completed % 100 === 0)
          console.log(`${completed}/${plan.tasks.length} requests recorded.`);
      },
    });
    const report = summarizeReaderEval(plan, records);
    await writeFile(join(options.out, "results.json"), JSON.stringify(report, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(join(options.out, "report.md"), renderReaderReport(report), {
      flag: "wx",
      mode: 0o600,
    });
    return report;
  } finally {
    closeSync(fd);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  let allCards = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--all-cards") {
      invariant(!allCards, "Duplicate --all-cards");
      allCards = true;
      continue;
    }
    const value = args[++index];
    invariant(
      flag &&
        ["--ratings", "--questions", "--out", "--concurrency"].includes(flag) &&
        !options.has(flag) &&
        value &&
        !value.startsWith("--"),
      "Usage: npm run reader-eval -- --ratings EXPORT --questions CATALOG --out NEW_DIR [--all-cards] [--concurrency 1..8]",
    );
    options.set(flag, value);
  }
  const ratings = options.get("--ratings");
  const questions = options.get("--questions");
  const out = options.get("--out");
  invariant(ratings && questions && out, "Required options: --ratings, --questions, --out");
  const report = await runReaderEvalFiles({
    ratings,
    questions,
    out,
    allCards,
    concurrency: Number(options.get("--concurrency") ?? "8"),
  });
  console.log(
    `${report.coverage.valid} valid, ${report.coverage.failed} failed, ${report.coverage.missing} missing requests; ${report.totals.input_tokens} input tokens; estimated input cost $${report.totals.estimated_usd.toFixed(8)}.`,
  );
  if (!report.successful) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    await main();
  } catch (error: unknown) {
    console.error(
      error instanceof ValidationError
        ? error.message
        : "Reader experiment failed; check inputs, credentials and output permissions. Preserve retained artifacts for recovery.",
    );
    process.exitCode = 1;
  }
}
