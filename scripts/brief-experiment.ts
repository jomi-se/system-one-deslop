import { spawn } from "node:child_process";
import { randomInt, createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { auditDocument, auditMetadata } from "../src/audit.js";
import { codeMetrics } from "../src/density.js";
import { parseMarkdown } from "../src/parse.js";
import { groupDensities, readDensity, renderCorpusReport } from "../src/corpus-report.js";
import { editorEnvironment, otherEditor, runJudge } from "../src/editor/providers.js";
import type { EditorName } from "../src/editor/providers.js";
import { judgmentOutcome } from "../src/editor/judge.js";
import { invariant, loadRegistry, object, ValidationError } from "../src/registry.js";

export const BRIEF =
  "Write it the way the best human technical bloggers do. Lead each section with a concrete case (code, a bug, a situation) and let the rule come out of it, instead of stating rules and then illustrating them. Don't end paragraphs on a quotable one-liner. Use headings only where the reader would actually jump to a section. Prefer full paragraphs to bullet lists. Vary sentence length the way speech does; some sentences can be long. No jokes for their own sake.";
const TOPICS = [
  {
    id: "go-errors",
    topic: "error handling in Go and patterns that reduce repetitive error checks",
  },
  { id: "go-slices", topic: "how Go slices work internally and the gotchas that follow" },
  { id: "rust-panic", topic: "when Rust code should panic and when it should return a Result" },
] as const;

export function generationPrompt(topic: string): string {
  return `Write a blog post explaining ${topic}. Aim for about 900 words.\n\n${BRIEF}\n\nOutput only the post, in Markdown.`;
}

export function parsePost(model: EditorName, output: string): string {
  let text = output;
  if (model === "opus") {
    const wrapper = object(JSON.parse(output) as unknown, "Claude writer output");
    invariant(
      wrapper.type === "result" &&
        wrapper.is_error !== true &&
        (wrapper.subtype === undefined || wrapper.subtype === "success") &&
        typeof wrapper.result === "string",
      "Claude writer returned a failed or unexpected wrapper",
    );
    text = wrapper.result;
  }
  invariant(text.trim().length > 0, "Writer returned an empty post");
  return text.endsWith("\n") ? text : text + "\n";
}

export function briefComparisonPrompt(
  topic: string,
  generic: string,
  briefed: string,
  briefedFirst: boolean,
) {
  return {
    briefed_version: briefedFirst ? ("A" as const) : ("B" as const),
    generic_version: briefedFirst ? ("B" as const) : ("A" as const),
    prompt: [
      `Topic: ${topic}`,
      "Which post would an experienced backend engineer rather read to learn this topic?",
      "Return A, B, or tie and explain why. The versions are anonymous; their order is randomized.",
      `VERSION A\n${briefedFirst ? briefed : generic}`,
      `VERSION B\n${briefedFirst ? generic : briefed}`,
    ].join("\n\n"),
  };
}

async function jsonFile(path: string, value: unknown): Promise<void> {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
async function textFile(path: string, value: string): Promise<void> {
  await writeFile(path, value, { flag: "wx", mode: 0o600 });
}

// Raw Markdown generation uses the same subscription CLIs as the original corpus,
// without an editor system prompt or a JSON schema that could affect the writing.
async function generate(model: EditorName, prompt: string) {
  const directory = await mkdtemp(join(tmpdir(), "deslop-brief-"));
  const started = Date.now();
  const final = join(directory, "post.md");
  try {
    const args =
      model === "opus"
        ? [
            "-p",
            "--safe-mode",
            "--model",
            "opus",
            "--tools",
            "",
            "--no-session-persistence",
            "--output-format",
            "json",
          ]
        : [
            "exec",
            "-m",
            "gpt-6.1-sol",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            "--ephemeral",
            "-o",
            final,
            "-",
          ];
    const stdout = await new Promise<string>((success, failure) => {
      const child = spawn(model === "opus" ? "claude" : "codex", args, {
        cwd: directory,
        env: editorEnvironment(),
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      let bytes = 0;
      let aborted: string | undefined;
      let hardKill: ReturnType<typeof setTimeout> | undefined;
      const kill = (signal: NodeJS.Signals) => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {
          /* Already exited. */
        }
      };
      const abort = (reason: string) => {
        if (aborted) return;
        aborted = reason;
        kill("SIGTERM");
        hardKill = setTimeout(() => kill("SIGKILL"), 5_000);
      };
      const interrupt = () => abort("Writer interrupted");
      const timeout = setTimeout(
        () => abort("Writer exceeded the 15-minute deadline"),
        15 * 60_000,
      );
      process.once("SIGINT", interrupt);
      process.once("SIGTERM", interrupt);
      const cleanup = () => {
        clearTimeout(timeout);
        if (hardKill) clearTimeout(hardKill);
        process.removeListener("SIGINT", interrupt);
        process.removeListener("SIGTERM", interrupt);
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 4 * 1024 * 1024) abort("Writer output exceeded its size limit");
        else output += chunk;
      });
      child.stderr.on("data", () => {});
      child.stdin.on("error", () => {});
      child.on("error", () => {
        cleanup();
        failure(new ValidationError("Writer CLI could not start"));
      });
      child.on("close", (code) => {
        cleanup();
        if (aborted || code !== 0)
          failure(new ValidationError(aborted ?? `Writer CLI exited with code ${code}`));
        else success(output);
      });
      child.stdin.end(prompt);
    });
    const post = parsePost(model, model === "opus" ? stdout : await readFile(final, "utf8"));
    return { post, duration_ms: Date.now() - started };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function batch<T, R>(items: T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  const failures: unknown[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        const item = items[index];
        invariant(item !== undefined, "Missing batch item");
        try {
          results[index] = await task(item);
        } catch (error: unknown) {
          failures.push(error);
        }
      }
    }),
  );
  if (failures.length)
    throw new ValidationError(
      `${failures.length} experiment tasks failed; completed artifacts were retained. ${failures[0] instanceof ValidationError ? failures[0].message : "Check CLI subscriptions, API availability, and permissions."}`,
    );
  return results;
}

async function experiment(args: string[]): Promise<void> {
  let output: string | undefined;
  let comparison: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[++index];
    invariant(value && !value.startsWith("--"), "Options require values");
    if (flag === "--out") output = resolve(value);
    else if (flag === "--comparison") comparison = resolve(value);
    else throw new ValidationError("Unknown experiment option");
  }
  invariant(
    output && comparison,
    "Usage: npm run brief-experiment -- --out NEW_DIR --comparison EXISTING_TEXTURE_DIR",
  );
  const baselineFiles = (await readdir(comparison)).filter((name) => name.endsWith(".json")).sort();
  const baselineEntries = await Promise.all(
    baselineFiles.map(async (name) => {
      const source = object(
        JSON.parse(await readFile(join(comparison, name), "utf8")) as unknown,
        name,
      );
      const document = object(source.document, "Comparison document");
      invariant(typeof document.text === "string", "Comparison audit has no source text");
      const density = object(source.density, "Comparison density");
      // Older audits predate semicolons; recompute only code metrics, keeping their
      // Jev observations and source bytes intact. Never overwrite retained inputs.
      const refreshed = {
        ...source,
        density: { ...density, code: codeMetrics(parseMarkdown(document.text)) },
        derived_code_metrics:
          "Code metrics recomputed from stored source with the current parser; Jev observations unchanged.",
      };
      return { name, value: refreshed, entry: readDensity(name, refreshed) };
    }),
  );
  const existingGroups = groupDensities(baselineEntries.map((file) => file.entry));
  invariant(
    existingGroups.length === 5 &&
      existingGroups.find((group) => group.group === "human")?.n === 13 &&
      ["opus.generic", "opus.reader", "sol.generic", "sol.reader"].every(
        (name) => existingGroups.find((group) => group.group === name)?.n === 3,
      ),
    "Comparison corpus must contain human n=13 and three posts in each original model/condition group",
  );
  const directory = resolve("eval/corpus/briefed");
  const jobs = TOPICS.flatMap((topic) =>
    (["opus", "sol"] as const).flatMap((model) =>
      [1, 2].map((sample) => ({
        ...topic,
        model,
        sample,
        name: `${topic.id}.${model}.briefed.${sample}`,
      })),
    ),
  );
  // Preflight every output before spending subscriptions; never overwrite a post.
  await mkdir(directory, { recursive: true });
  const present = new Set(await readdir(directory));
  invariant(
    jobs.every((job) => !present.has(job.name + ".md")),
    "Briefed corpus files already exist",
  );
  await mkdir(output, { mode: 0o700 });
  const audits = join(output, "audits");
  const generations = join(output, "generation");
  const judgments = join(output, "judgments");
  await Promise.all([audits, generations, judgments].map((path) => mkdir(path, { mode: 0o700 })));
  await jsonFile(join(output, "manifest.json"), {
    generated_at: new Date().toISOString(),
    brief: BRIEF,
    topics: TOPICS,
    samples_per_model_topic: 2,
    generation_concurrency: 4,
    audit_concurrency_per_document: 2,
    audience: "Experienced backend engineers",
    genre: "technical blog post",
    purpose: "explain <topic>",
    comparison_documents: baselineFiles,
    generation: {
      opus: "claude opus, safe mode, no tools, no session persistence",
      sol: "codex gpt-6.1-sol, read-only, ephemeral; user-level AGENTS.md still applies",
    },
    normalization:
      "Generated Markdown retained verbatim except a final newline; corpus sources are excluded from formatting",
    judge: "Other model; randomized A/B; briefed sample 1 versus generic; no same-facts constraint",
  });
  for (const file of baselineEntries) await jsonFile(join(audits, file.name), file.value);
  await batch(jobs, async (job) => {
    console.log(`Generating ${job.name}`);
    const prompt = generationPrompt(job.topic);
    await textFile(join(generations, job.name + ".prompt.txt"), prompt);
    const response = await generate(job.model, prompt);
    await textFile(join(generations, job.name + ".raw.md"), response.post);
    await textFile(join(directory, job.name + ".md"), response.post);
    await jsonFile(join(generations, job.name + ".json"), {
      model: job.model,
      sample: job.sample,
      duration_ms: response.duration_ms,
    });
    console.log(`Generated ${job.name}`);
    return job;
  });
  await measurePosts(output);
}

export async function measurePosts(output: string): Promise<void> {
  const audits = join(output, "audits");
  const directory = resolve("eval/corpus/briefed");
  const generated = TOPICS.flatMap((topic) =>
    (["opus", "sol"] as const).flatMap((model) =>
      [1, 2].map((sample) => ({
        ...topic,
        model,
        sample,
        name: `${topic.id}.${model}.briefed.${sample}`,
      })),
    ),
  );
  const registry = await loadRegistry();
  await batch(generated, async (job) => {
    const source = await readFile(join(directory, job.name + ".md"), "utf8");
    const result = await auditDocument(
      parseMarkdown(source),
      auditMetadata({
        audience: "Experienced backend engineers",
        genre: "technical blog post",
        purpose: "explain " + job.topic,
      }),
      registry,
      undefined,
      ["sentence-c", "code"],
      { concurrency: 2 },
    );
    await jsonFile(join(audits, job.name + ".json"), result);
    invariant(!result.requests.some((request) => request.error), `Incomplete audit: ${job.name}`);
    console.log(`Audited ${job.name}: ${result.density.prose_words} prose words`);
    return {
      name: job.name,
      source_sha256: createHash("sha256").update(source).digest("hex"),
      entry: readDensity(job.name + ".json", result),
      totals: result.totals,
    };
  });
  await completeReport(output);
}

export async function completeReport(output: string): Promise<void> {
  const audits = join(output, "audits");
  const judgments = join(output, "judgments");
  const directory = resolve("eval/corpus/briefed");
  const files = (await readdir(audits)).filter((name) => name.endsWith(".json")).sort();
  const rows = await Promise.all(
    files.map(async (name) => ({
      name,
      value: object(JSON.parse(await readFile(join(audits, name), "utf8")) as unknown, name),
    })),
  );
  const original = rows.filter((row) => !row.name.includes(".briefed."));
  const baselineEntries = original.map((row) => readDensity(row.name, row.value));
  // Concurrent catalogue additions have no historical observations. Keep every
  // raw answer, but compare exactly the historical question inventory.
  groupDensities(baselineEntries);
  const questions = Object.keys(
    object(object(original[0]?.value, "Original audit").density, "Density").questions ?? {},
  );
  invariant(questions.length > 0, "Missing comparison questions");
  const comparisonDirectory = join(output, "comparison-audits");
  await mkdir(comparisonDirectory, { mode: 0o700 });
  const entries = [];
  const measured = [];
  const generated = TOPICS.flatMap((topic) =>
    (["opus", "sol"] as const).flatMap((model) =>
      [1, 2].map((sample) => ({
        ...topic,
        model,
        sample,
        name: `${topic.id}.${model}.briefed.${sample}`,
      })),
    ),
  );
  invariant(
    rows.length === 37 &&
      generated.every((job) => rows.some((row) => row.name === job.name + ".json")),
    "Expected 25 comparison audits and 12 briefed audits",
  );
  for (const row of rows) {
    const density = object(row.value.density, "Audit density");
    const observations = object(density.questions, "Audit texture observations");
    invariant(
      questions.every((id) => Object.hasOwn(observations, id)),
      "A comparison question is missing",
    );
    const projected = {
      ...row.value,
      density: {
        ...density,
        questions: Object.fromEntries(questions.map((id) => [id, observations[id]])),
      },
      comparison_note:
        "Historical C question inventory only; all observations remain in ../audits/.",
    };
    await jsonFile(join(comparisonDirectory, row.name), projected);
    entries.push(readDensity(row.name, projected));
    if (row.name.includes(".briefed.")) {
      const document = object(row.value.document, "Briefed document");
      const source = await readFile(join(directory, row.name.replace(/\.json$/, ".md")), "utf8");
      invariant(document.text === source, "Briefed post changed after its audit");
      const totals = object(row.value.totals, "Audit totals");
      invariant(
        typeof totals.input_tokens === "number" &&
          typeof totals.output_tokens === "number" &&
          typeof totals.estimated_usd === "number",
        "Invalid audit totals",
      );
      measured.push({
        name: row.name.replace(/\.json$/, ""),
        source_sha256: createHash("sha256").update(source).digest("hex"),
        totals: {
          input_tokens: totals.input_tokens,
          output_tokens: totals.output_tokens,
          estimated_usd: totals.estimated_usd,
        },
      });
    }
  }
  const texture = renderCorpusReport(entries);
  await textFile(join(comparisonDirectory, "corpus-report.md"), texture);

  const comparisons = await batch(
    generated.filter((job) => job.sample === 1),
    async (job) => {
      const generic = await readFile(
        resolve("eval/corpus/generated", `${job.id}.${job.model}.generic.md`),
        "utf8",
      );
      const briefed = await readFile(join(directory, job.name + ".md"), "utf8");
      const pair = briefComparisonPrompt(job.topic, generic, briefed, randomInt(2) === 1);
      await textFile(join(judgments, job.name + ".prompt.txt"), pair.prompt);
      const response = await runJudge(otherEditor(job.model), pair.prompt);
      const result = {
        name: job.name,
        topic: job.id,
        writer: job.model,
        judge: otherEditor(job.model),
        briefed_version: pair.briefed_version,
        generic_version: pair.generic_version,
        generic_sha256: createHash("sha256").update(generic).digest("hex"),
        briefed_sha256: createHash("sha256").update(briefed).digest("hex"),
        outcome: judgmentOutcome(response, pair.briefed_version),
        response,
      };
      await jsonFile(join(judgments, job.name + ".json"), result);
      console.log(`Judged ${job.name}: ${result.outcome}`);
      return result;
    },
  );
  const tallies = (["opus", "sol"] as const).map((model) => {
    const modelRows = comparisons.filter((result) => result.writer === model);
    return {
      model,
      judge: otherEditor(model),
      wins: modelRows.filter((row) => row.outcome === "win").length,
      ties: modelRows.filter((row) => row.outcome === "tie").length,
      losses: modelRows.filter((row) => row.outcome === "loss").length,
    };
  });
  const totals = measured.reduce(
    (sum, row) => ({
      input_tokens: sum.input_tokens + row.totals.input_tokens,
      output_tokens: sum.output_tokens + row.totals.output_tokens,
      estimated_usd: sum.estimated_usd + row.totals.estimated_usd,
    }),
    { input_tokens: 0, output_tokens: 0, estimated_usd: 0 },
  );
  await jsonFile(join(output, "summary.json"), {
    groups: groupDensities(entries),
    comparisons,
    tallies,
    audited_sources: measured.map(({ name, source_sha256 }) => ({ name, source_sha256 })),
    jev_totals: totals,
  });
  await textFile(
    join(output, "summary.md"),
    texture +
      [
        "",
        "# Blind briefed vs generic comparisons",
        "",
        "Other-model judgments, randomized A/B, sample 1 only. Independently generated posts need not contain identical facts. Six pairs give directional evidence, not a general quality estimate.",
        "The table uses the historical C question inventory. Concurrent catalogue additions remain in raw audits, without inventing historical baselines.",
        "",
        "| Writer | Judge | Wins | Ties | Losses |",
        "| --- | --- | ---: | ---: | ---: |",
        ...tallies.map(
          (row) => `| ${row.model} | ${row.judge} | ${row.wins} | ${row.ties} | ${row.losses} |`,
        ),
        "",
        "| Topic | Writer | Briefed outcome | Reason |",
        "| --- | --- | --- | --- |",
        ...comparisons.map(
          (row) =>
            `| ${row.topic} | ${row.writer} | ${row.outcome} | ${row.response.reason.replaceAll("|", "\\|").replace(/[\r\n]/g, " ")} |`,
        ),
        "",
        `New audits: ${totals.input_tokens} input tokens, estimated Jev cost $${totals.estimated_usd.toFixed(6)}. CLI calls use subscriptions.`,
        "",
      ].join("\n"),
  );
  console.log(`Complete: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await experiment(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(
      error instanceof ValidationError
        ? error.message
        : "Experiment failed; check inputs, subscriptions, API availability, and permissions.",
    );
    process.exitCode = 1;
  }
}
