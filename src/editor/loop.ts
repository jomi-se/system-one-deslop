import { readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { createJevClient, tokenTotals } from "../jev.js";
import type { RequestRecord } from "../jev.js";
import { auditDocument } from "../audit.js";
import type { AuditMetadata } from "../audit.js";
import { parseMarkdown } from "../parse.js";
import type { Registry } from "../registry.js";
import { applyEdits, editUnits } from "./edits.js";
import { runEditor } from "./providers.js";
import type { EditorName } from "./providers.js";
import { readBaseline, editorPrompt, habitRates, heldOutRates, densityTable } from "./prompt.js";
import { blindComparison } from "./judge.js";
import { GATES, gateEdits } from "./gates.js";

function unifiedDiff(before: string, after: string): string {
  if (before === after) return "No changes.\n";
  const a = before ? before.split("\n") : [],
    b = after ? after.split("\n") : [];
  const beforeNewline = before.endsWith("\n"),
    afterNewline = after.endsWith("\n");
  if (beforeNewline) a.pop();
  if (afterNewline) b.pop();
  const equal = (i: number, j: number) =>
    a[i] === b[j] && (i < a.length - 1 || beforeNewline) === (j < b.length - 1 || afterNewline);
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1)
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = rows[i],
        next = rows[i + 1];
      if (row && next)
        row[j] = equal(i, j) ? (next[j + 1] ?? 0) + 1 : Math.max(next[j] ?? 0, row[j + 1] ?? 0);
    }
  const lines = [
    "--- original.md",
    "+++ revised.md",
    `@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@`,
  ];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && equal(i, j)) {
      lines.push(` ${a[i]}`);
      if (i === a.length - 1 && !beforeNewline) lines.push("\\ No newline at end of file");
      i += 1;
      j += 1;
    } else if (
      j < b.length &&
      (i === a.length || (rows[i]?.[j + 1] ?? 0) >= (rows[i + 1]?.[j] ?? 0))
    ) {
      lines.push(`+${b[j]}`);
      if (j === b.length - 1 && !afterNewline) lines.push("\\ No newline at end of file");
      j += 1;
    } else {
      lines.push(`-${a[i]}`);
      if (i === a.length - 1 && !beforeNewline) lines.push("\\ No newline at end of file");
      i += 1;
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function deslop(
  source: string,
  editor: EditorName,
  metadata: AuditMetadata,
  rounds: number,
  directory: string,
  registry: Registry,
  onProgress: (message: string) => void = () => {},
  options: { authorVoice?: string; judgeOther?: boolean } = {},
) {
  const authorVoice = options.authorVoice ?? "as in the original";
  const baseline = readBaseline(
    JSON.parse(await readFile("eval/baselines/human-tech-blog.json", "utf8")) as unknown,
  );
  const template = await readFile("eval/editor-prompt.md", "utf8");
  const client = createJevClient();
  const before = await auditDocument(
    parseMarkdown(source),
    metadata,
    registry,
    client,
    ["sentence-c", "code"],
    { concurrency: 2 },
  );
  habitRates(before);
  await writeFile(join(directory, "before.json"), JSON.stringify(before, null, 2) + "\n", {
    mode: 0o600,
  });
  await writeFile(join(directory, "edits.jsonl"), "", { mode: 0o600 });
  let text = source;
  let audit = before;
  let accepted = 0,
    rejected = 0;
  const rejectedByGate: Record<string, number> = Object.fromEntries(GATES.map((id) => [id, 0]));
  let acceptedUnits = 0,
    rejectedUnits = 0;
  const editorRuns = [];
  const gateRecords: RequestRecord[] = [];
  const audits = [before];
  for (let round = 1; round <= rounds; round += 1) {
    const document = parseMarkdown(text);
    const units = editUnits(document);
    const prompt = editorPrompt(template, text, units, audit, metadata);
    onProgress(`Round ${round}: ${editor} editing ${units.length} units`);
    const response = await runEditor(editor, prompt);
    editorRuns.push({
      round,
      editor,
      format: response.format,
      duration_ms: response.duration_ms,
      proposals: response.edits.length,
    });
    const gated = await gateEdits(
      text,
      response.edits,
      units,
      document.code_blocks,
      registry,
      metadata,
      client,
      authorVoice,
    );
    for (const [id, count] of Object.entries(gated.rejected_by_gate))
      rejectedByGate[id] = (rejectedByGate[id] ?? 0) + count;
    gateRecords.push(...gated.records);
    for (const decision of gated.decisions) {
      if (decision.accepted) {
        accepted += 1;
        acceptedUnits += decision.proposal.unit_ids.length;
      } else {
        rejected += 1;
        rejectedUnits += decision.proposal.unit_ids.length;
      }
      await appendFile(
        join(directory, "edits.jsonl"),
        JSON.stringify({ round, ...decision }) + "\n",
      );
    }
    text = applyEdits(
      text,
      gated.decisions.filter((decision) => decision.accepted).map((decision) => decision.proposal),
      units,
    );
    audit = await auditDocument(
      parseMarkdown(text),
      metadata,
      registry,
      client,
      ["sentence-c", "code"],
      { concurrency: 2 },
    );
    habitRates(audit);
    audits.push(audit);
    await writeFile(join(directory, `round-${round}.json`), JSON.stringify(audit, null, 2) + "\n", {
      mode: 0o600,
    });
    await writeFile(join(directory, "revised.md"), text, { mode: 0o600 });
    onProgress(
      `Round ${round}: ${gated.decisions.filter((decision) => decision.accepted).length} accepted, ${gated.decisions.filter((decision) => !decision.accepted).length} rejected`,
    );
  }
  let judgment = null;
  if (options.judgeOther) {
    onProgress(
      `Blind comparison: ${editor === "opus" ? "sol" : "opus"} judging anonymous versions`,
    );
    judgment = await blindComparison(source, text, metadata, editor);
    await writeFile(join(directory, "judgment.json"), JSON.stringify(judgment, null, 2) + "\n", {
      mode: 0o600,
    });
  }
  const usage = tokenTotals([...audits.flatMap((entry) => entry.requests), ...gateRecords]);
  const summary = {
    editor,
    metadata,
    author_voice: authorVoice,
    baseline,
    rounds: editorRuns.length,
    editor_runs: editorRuns,
    accepted,
    rejected,
    accepted_units: acceptedUnits,
    rejected_units: rejectedUnits,
    rejected_by_gate: rejectedByGate,
    judgment,
    words_before: before.density.prose_words,
    words_after: audit.density.prose_words,
    before: habitRates(before),
    after: habitRates(audit),
    held_out_before: heldOutRates(before),
    held_out_after: heldOutRates(audit),
    usage,
  };
  await writeFile(join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n", {
    mode: 0o600,
  });
  const diff = unifiedDiff(source, text);
  const fence = "`".repeat(
    Math.max(3, ...(diff.match(/`+/g) ?? []).map((ticks) => ticks.length + 1)),
  );
  const report = [
    "# Deslop editor run",
    "",
    `Editor: ${editor}; rounds: ${summary.rounds}; groups accepted: ${accepted}; groups rejected: ${rejected}.`,
    judgment
      ? `Blind cross-model judge: ${judgment.judge}; outcome: ${judgment.outcome}. ${judgment.response.reason}`
      : "Blind comparison was not requested.",
    `Prose words: ${summary.words_before} → ${summary.words_after}. Estimated Jev cost: $${usage.estimated_usd.toFixed(8)}. Editor usage is on the configured CLI subscription.`,
    "",
    `Human baseline n=${baseline.n}. ${baseline.note}`,
    "",
    densityTable(before, audit, baseline),
    "",
    "## Held-out metrics (never sent to the editor)",
    "",
    densityTable(before, audit, baseline, true),
    "",
    "## Gate rejections (a group can fail more than one gate)",
    "",
    ...Object.entries(rejectedByGate).map(([id, count]) => `- ${id}: ${count}`),
    "",
    "Rates are diagnostics, not proof of quality. Number/code/URL guards and Jev gates are fallible; review the diff before using the result.",
    "",
    "## Unified diff",
    "",
    `${fence}diff`,
    diff.trimEnd(),
    fence,
    "",
  ].join("\n");
  await writeFile(join(directory, "report.md"), report, { mode: 0o600 });
  return summary;
}
