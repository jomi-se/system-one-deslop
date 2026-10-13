import type { JsonValue, Questions, TypeSafeClient } from "@typesafe-ai/sdk";
import { createJevClient, MODEL, runGroups, stateHash, tokenTotals } from "./jev.js";
import type { RequestGroup, RequestRecord } from "./jev.js";
import { invariant } from "./registry.js";
import type { Registry } from "./registry.js";
import type { Answer } from "./evaluation.js";
import type { MarkdownDocument, Span } from "./parse.js";
import { measureDensity } from "./density.js";

export const AUDIT_QUESTIONS = {
  document: ["a.D01", "a.D04", "a.D05", "a.D10", "a.D11", "a.D12", "a.D13"],
  paragraph: ["a.P02", "a.P04", "a.P06", "a.P10", "a.P13", "a.P14", "a.P17"],
  sentence: {
    a: ["a.S01", "a.S02", "a.S03", "a.S04", "a.S05", "a.S06", "a.S07", "a.S12", "a.S14", "a.S15"],
    b: ["b.significance_assertion", "b.content_announcement", "b.authority_invocation"],
    c: ["c.contrast_reframe", "c.aphorism", "c.playful_flourish", "c.setup_line", "c.triplet"],
  },
} as const;

export interface AuditMetadata {
  audience: string;
  purpose: string;
  genre: string;
}
export const AUDIT_PASSES = [
  "document",
  "paragraph",
  "sentence-a",
  "sentence-b",
  "sentence-c",
  "code",
] as const;
export type AuditPass = (typeof AUDIT_PASSES)[number];
export function auditPasses(value?: string): AuditPass[] {
  if (value === undefined) return [...AUDIT_PASSES];
  const names = value.split(",");
  invariant(
    names.length > 0 && names.every((name) => AUDIT_PASSES.some((pass) => pass === name)),
    "Unknown or empty audit pass",
  );
  return AUDIT_PASSES.filter((pass) => names.includes(pass));
}
export interface AuditRequest {
  unit: Span;
  pass: Exclude<AuditPass, "code">;
  group: RequestGroup;
}
export interface AuditAnswer {
  unit_id: string;
  kind: "document" | "paragraph" | "sentence";
  offsets: [number, number];
  question_id: string;
  answer: Answer | null;
  normalized: number | null;
  error: RequestRecord["error"];
}

export function auditMetadata(input: Partial<AuditMetadata> = {}): AuditMetadata {
  return {
    audience: input.audience ?? "unspecified",
    purpose: input.purpose ?? "unspecified",
    genre: input.genre ?? "unspecified",
  };
}

export function buildAuditPlan(
  document: MarkdownDocument,
  metadata: AuditMetadata,
  registry: Registry,
  passes: readonly AuditPass[] = AUDIT_PASSES,
): AuditRequest[] {
  const plan: AuditRequest[] = [];
  const paragraphs = document.sections.flatMap((section) => section.paragraphs);
  function add(
    unit: Span,
    pass: AuditRequest["pass"],
    ids: readonly string[],
    state: { [key: string]: JsonValue },
  ): void {
    if (!passes.includes(pass)) return;
    const questions: Questions = {};
    for (const id of ids) {
      const q = registry.questions.get(id);
      invariant(q, `Audit question is missing: ${id}`);
      questions[id] = q.question;
    }
    plan.push({
      unit,
      pass,
      group: { state_hash: stateHash(state), state, questions, cases: [], variant: "original" },
    });
  }
  add(document, "document", AUDIT_QUESTIONS.document, {
    document: { text: document.text, ...metadata },
  });
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (!paragraph) continue;
    const neighbors = {
      previous: paragraphs[index - 1]?.text ?? "",
      next: paragraphs[index + 1]?.text ?? "",
    };
    const context = { document: { ...metadata, summary: "unspecified" }, neighbors };
    add(paragraph, "paragraph", AUDIT_QUESTIONS.paragraph, {
      ...context,
      focus: { text: paragraph.text },
    });
    for (let sentenceIndex = 0; sentenceIndex < paragraph.sentences.length; sentenceIndex += 1) {
      const sentence = paragraph.sentences[sentenceIndex];
      if (!sentence) continue;
      const sentenceNeighbors = {
        previous:
          paragraph.sentences[sentenceIndex - 1]?.text ??
          paragraphs[index - 1]?.sentences.at(-1)?.text ??
          "",
        next:
          paragraph.sentences[sentenceIndex + 1]?.text ??
          paragraphs[index + 1]?.sentences[0]?.text ??
          "",
      };
      add(sentence, "sentence-a", AUDIT_QUESTIONS.sentence.a, {
        ...context,
        neighbors: sentenceNeighbors,
        focus: { text: sentence.text, paragraph: paragraph.text },
      });
      add(sentence, "sentence-b", AUDIT_QUESTIONS.sentence.b, {
        target: { text: sentence.text },
        context: { ...metadata, paragraph: paragraph.text, neighbors: sentenceNeighbors },
      });
      const targetContext = [
        sentenceNeighbors.previous ? `Previous: ${sentenceNeighbors.previous}` : "",
        sentenceNeighbors.next ? `Next: ${sentenceNeighbors.next}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      add(sentence, "sentence-c", AUDIT_QUESTIONS.sentence.c, {
        document: { ...metadata },
        target: { text: sentence.text, context: targetContext },
      });
    }
  }
  return plan;
}

export function collectAuditAnswers(
  plan: AuditRequest[],
  records: RequestRecord[],
  registry: Registry,
): AuditAnswer[] {
  return records.flatMap((record) => {
    const task = plan[record.index];
    invariant(task, "Audit response has no matching request");
    return Object.keys(task.group.questions).map((id) => {
      const q = registry.questions.get(id);
      invariant(q, `Unknown audit question: ${id}`);
      const answer = record.error ? null : (record.response?.answers[id] ?? null);
      invariant(record.error || answer, `Missing audit answer: ${id}`);
      let normalized: number | null = null;
      if (answer?.type === "noul") normalized = answer.noul;
      else if (answer?.type === "score" && q.question.type === "score")
        normalized = answer.score / (q.question.criteria.length - 1);
      else if (answer?.type === "choice") normalized = answer.confidence;
      return {
        unit_id: task.unit.id,
        kind:
          task.pass === "document"
            ? "document"
            : task.pass === "paragraph"
              ? "paragraph"
              : "sentence",
        offsets: [task.unit.start, task.unit.end],
        question_id: id,
        answer,
        normalized,
        error: record.error,
      };
    });
  });
}

export function questionMeans(answers: AuditAnswer[]) {
  const ids = [...new Set(answers.map((answer) => answer.question_id))];
  return ids.map((question_id) => {
    const rows = answers.filter((answer) => answer.question_id === question_id);
    const valid = rows.flatMap((row) => (row.normalized === null ? [] : [row.normalized]));
    return {
      question_id,
      n: rows.length,
      valid: valid.length,
      mean: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null,
    };
  });
}

export async function auditDocument(
  document: MarkdownDocument,
  metadata: AuditMetadata,
  registry: Registry,
  client?: TypeSafeClient,
  passes: readonly AuditPass[] = AUDIT_PASSES,
  options: { concurrency?: number } = {},
) {
  const plan = buildAuditPlan(document, metadata, registry, passes);
  const records = plan.length
    ? await runGroups(
        plan.map((task) => task.group),
        client ?? createJevClient(),
        options,
      )
    : [];
  const answers = collectAuditAnswers(plan, records, registry);
  return {
    schema_version: "1.0",
    model: MODEL,
    generated_at: new Date().toISOString(),
    metadata,
    passes,
    document,
    answers,
    question_means: questionMeans(answers),
    totals: tokenTotals(records),
    density: measureDensity(document, answers, AUDIT_QUESTIONS.sentence.c, {
      code: passes.includes("code"),
      texture: passes.includes("sentence-c"),
    }),
    requests: records.map((record) => {
      const task = plan[record.index];
      invariant(task, "Missing audit request metadata");
      return {
        ...record,
        unit_id: task.unit.id,
        offsets: [task.unit.start, task.unit.end],
        pass: task.pass,
      };
    }),
  };
}

function excerpt(text: string): string {
  const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
  return Array.from(graphemes.segment(text.replace(/\s+/g, " ")))
    .slice(0, 110)
    .map((segment) => segment.segment)
    .join("");
}

export function renderAuditReport(result: Awaited<ReturnType<typeof auditDocument>>): string {
  const units = new Map<string, Span>([[result.document.id, result.document]]);
  for (const section of result.document.sections) {
    for (const paragraph of section.paragraphs) {
      units.set(paragraph.id, paragraph);
      for (const sentence of paragraph.sentences) units.set(sentence.id, sentence);
    }
  }
  const rankings = [...units.values()]
    .map((unit) => {
      const rows = result.answers.filter(
        (row) =>
          row.unit_id === unit.id && row.question_id.startsWith("a.") && row.normalized !== null,
      );
      rows.sort((a, b) => (b.normalized ?? 0) - (a.normalized ?? 0));
      return { unit, worst: rows[0] };
    })
    .filter((entry) => entry.worst)
    .sort((a, b) => (b.worst?.normalized ?? 0) - (a.worst?.normalized ?? 0));
  const failures = result.requests.filter((request) => request.error).length;
  const lines = [
    `Audit: ${result.document.sections.flatMap((section) => section.paragraphs).length} paragraphs; ${result.document.sections.flatMap((section) => section.paragraphs.flatMap((paragraph) => paragraph.sentences)).length} sentences; ${result.requests.length} requests; ${failures} failures.`,
    `Context: audience=${JSON.stringify(result.metadata.audience)}, purpose=${JSON.stringify(result.metadata.purpose)}, genre=${JSON.stringify(result.metadata.genre)}.`,
    `Input tokens: ${result.totals.input_tokens}; estimated cost: $${result.totals.estimated_usd.toFixed(8)} USD.`,
    "",
    "Highest A defect signals first (max normalized score per unit; B observations do not rank units):",
  ];
  for (const { unit, worst } of rankings.slice(0, 20)) {
    lines.push(
      `${(worst?.normalized ?? 0).toFixed(3)}  ${unit.id}  ${worst?.question_id}  ${excerpt(unit.text)}`,
    );
  }
  lines.push(
    "",
    "Per-question means (score normalized by highest level index; noul probability unchanged):",
  );
  for (const row of result.question_means)
    lines.push(
      `${row.question_id.padEnd(28)} ${row.mean?.toFixed(3) ?? "—"}  n=${row.n} valid=${row.valid}`,
    );
  lines.push("", "Texture density per 1,000 prose words (noul >= 0.5):");
  for (const [id, row] of Object.entries(result.density.questions)) {
    lines.push(
      `${id.padEnd(28)} ${row.per_1000_words?.toFixed(3) ?? "—"}  count=${row.count ?? "—"} valid=${row.valid}/${row.expected}`,
    );
  }
  if (result.density.code) lines.push("", `Code metrics: ${JSON.stringify(result.density.code)}`);
  lines.push(
    "",
    "Signals are uncalibrated judgments, not instructions to delete or rewrite. Source text is unchanged.",
  );
  return `${lines.join("\n")}\n`;
}
