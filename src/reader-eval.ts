import { noul } from "@typesafe-ai/sdk";
import type { TypeSafeClient } from "@typesafe-ai/sdk";
import { comparisonHash, readRatingsExport } from "./compare-ratings.js";
import type { RatedCard } from "./compare-ratings.js";
import { LABELS } from "./label-types.js";
import type { Label } from "./label-types.js";
import {
  MODEL,
  INPUT_USD_PER_MILLION,
  runGroups,
  stateHash,
  tokenTotals,
  validateResponse,
} from "./jev.js";
import type { RequestGroup, RequestRecord } from "./jev.js";
import { invariant, object } from "./registry.js";

export interface ReaderQuestion {
  id: string;
  family: string;
  question: string;
}
export interface ReaderTask {
  card_id: string;
  question_id: string;
  group: RequestGroup;
}
export interface ReaderPlan {
  cards: RatedCard[];
  questions: ReaderQuestion[];
  tasks: ReaderTask[];
  all_cards: boolean;
  ratings_hash: string;
  questions_hash: string;
}
export interface ReaderRecord extends RequestRecord {
  card_id: string;
  question_id: string;
}

function wireQuestion(text: string) {
  const question = noul(text);
  // The SDK helper includes criteria: undefined; its wire payload omits that key.
  if (question.criteria === undefined) delete question.criteria;
  return question;
}

export function planReaderEval(ratings: unknown, catalogue: unknown, allCards = false): ReaderPlan {
  const cards = readRatingsExport(ratings).filter((card) => allCards || card.rating !== null);
  invariant(cards.length > 0, "No selected reading cards");
  invariant(
    Array.isArray(catalogue) && catalogue.length > 0,
    "Question catalogue must be a nonempty array",
  );
  const seen = new Set<string>();
  const questions: ReaderQuestion[] = catalogue.map((entry: unknown) => {
    const q = object(entry, "Reader question");
    invariant(
      Object.keys(q).length === 3 &&
        typeof q.id === "string" &&
        q.id.trim().length > 0 &&
        typeof q.family === "string" &&
        q.family.trim().length > 0 &&
        typeof q.question === "string" &&
        q.question.trim().length > 0,
      "Each question requires only nonempty id, family and question strings",
    );
    invariant(!seen.has(q.id), "Duplicate reader question ID");
    seen.add(q.id);
    return { id: q.id, family: q.family, question: q.question };
  });
  const tasks = cards.flatMap((card) =>
    questions.map((q): ReaderTask => ({
      card_id: card.id,
      question_id: q.id,
      group: {
        state: card.text,
        state_hash: stateHash(card.text),
        cases: [],
        variant: "original",
        questions: { performative: wireQuestion(q.question) },
      },
    })),
  );
  return {
    cards,
    questions,
    tasks,
    all_cards: allCards,
    ratings_hash: comparisonHash(ratings),
    questions_hash: comparisonHash(catalogue),
  };
}

export async function runReaderEval(
  plan: ReaderPlan,
  client: TypeSafeClient,
  options: { concurrency?: number; onRecord?: (record: ReaderRecord) => void } = {},
): Promise<ReaderRecord[]> {
  const attach = (record: RequestRecord): ReaderRecord => {
    const task = plan.tasks[record.index];
    invariant(task, "Request index has no reader task");
    return { ...record, card_id: task.card_id, question_id: task.question_id };
  };
  const records = await runGroups(
    plan.tasks.map((task) => task.group),
    client,
    {
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
      onRecord: (record) => options.onRecord?.(attach(record)),
    },
  );
  return records.map(attach);
}

function readUsage(value: unknown): RequestRecord["usage"] {
  if (value === null) return null;
  const usage = object(value, "Record usage");
  invariant(
    [usage.input_tokens, usage.output_tokens].every(
      (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
    ),
    "Invalid token usage",
  );
  return { input_tokens: Number(usage.input_tokens), output_tokens: Number(usage.output_tokens) };
}

function readRecord(value: unknown, plan: ReaderPlan): ReaderRecord {
  const r = object(value, "Reader record");
  invariant(
    typeof r.index === "number" && Number.isSafeInteger(r.index) && r.index >= 0,
    "Invalid reader task index",
  );
  const task = plan.tasks[r.index];
  invariant(
    task &&
      r.card_id === task.card_id &&
      r.question_id === task.question_id &&
      r.state_hash === task.group.state_hash &&
      r.variant === "original" &&
      Array.isArray(r.case_ids) &&
      r.case_ids.length === 0,
    "Reader record task association differs from frozen plan",
  );
  const request = { model: MODEL, state: task.group.state, questions: task.group.questions };
  invariant(
    comparisonHash(r.request) === comparisonHash(request),
    "Reader request differs from frozen question, model or reading text",
  );
  invariant(
    typeof r.started_at === "string" &&
      Number.isFinite(Date.parse(r.started_at)) &&
      typeof r.duration_ms === "number" &&
      Number.isFinite(r.duration_ms) &&
      r.duration_ms >= 0,
    "Invalid request timing",
  );
  let error: RequestRecord["error"] = null;
  if (r.error !== null) {
    const failure = object(r.error, "Request failure");
    invariant(
      failure.kind === "api" || failure.kind === "transport" || failure.kind === "validation",
      "Invalid request failure kind",
    );
    invariant(
      Object.keys(failure).every((key) => key === "kind" || key === "status") &&
        (failure.status === undefined ||
          (typeof failure.status === "number" &&
            Number.isInteger(failure.status) &&
            failure.status >= 100 &&
            failure.status <= 599)),
      "Invalid request failure metadata",
    );
    error = {
      kind: failure.kind,
      ...(typeof failure.status === "number" ? { status: failure.status } : {}),
    };
  }
  const usage = readUsage(r.usage);
  let response: RequestRecord["response"] = null;
  if (!error) {
    validateResponse(r.response, task.group.questions);
    invariant(
      comparisonHash(usage) === comparisonHash(readUsage(r.response.usage)),
      "Record usage differs from response usage",
    );
    response = r.response;
  }
  return {
    index: r.index,
    card_id: task.card_id,
    question_id: task.question_id,
    state_hash: task.group.state_hash,
    variant: "original",
    case_ids: [],
    request,
    response,
    usage,
    started_at: r.started_at,
    duration_ms: r.duration_ms,
    error,
  };
}

export function summarizeReaderEval(plan: ReaderPlan, rawRecords: unknown) {
  invariant(Array.isArray(rawRecords), "Raw records must be an array");
  const records = new Map<number, ReaderRecord>();
  for (const raw of rawRecords) {
    const record = readRecord(raw, plan);
    invariant(!records.has(record.index), "Duplicate reader task result");
    records.set(record.index, record);
  }
  const rows = plan.tasks.map((task, index) => {
    const card = plan.cards.find((c) => c.id === task.card_id);
    invariant(card, "Missing card in reader plan");
    const record = records.get(index);
    const answer = record?.response?.answers.performative;
    return {
      index,
      card_id: task.card_id,
      question_id: task.question_id,
      label: card.rating?.label ?? null,
      status: !record ? "missing" : record.error ? "failed" : "valid",
      noul: answer?.type === "noul" ? answer.noul : null,
      error: record?.error ?? null,
    };
  });
  const summaries = plan.questions.map((question) => {
    const summarize = (label: Label | null) => {
      const matching = rows.filter((row) => row.question_id === question.id && row.label === label);
      const values = matching.flatMap((row) => (row.noul === null ? [] : [row.noul]));
      return {
        label,
        cards: matching.length,
        valid: values.length,
        failed: matching.filter((row) => row.status === "failed").length,
        missing: matching.filter((row) => row.status === "missing").length,
        values,
        mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      };
    };
    return { ...question, categories: LABELS.map(summarize), unrated: summarize(null) };
  });
  const missing = rows.filter((row) => row.status === "missing").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  return {
    schema_version: 1,
    model: MODEL,
    protocol:
      "One SDK noul question under performative; raw displayed sentence string state; no labels or context sent.",
    all_cards: plan.all_cards,
    ratings_hash: plan.ratings_hash,
    questions_hash: plan.questions_hash,
    complete: missing === 0,
    successful: missing === 0 && failed === 0,
    coverage: {
      selected_cards: plan.cards.length,
      expected_requests: plan.tasks.length,
      recorded_requests: records.size,
      valid: rows.length - missing - failed,
      failed,
      missing,
      usage_missing: [...records.values()].filter((record) => record.usage === null).length,
    },
    totals: {
      ...tokenTotals([...records.values()]),
      input_usd_per_million: INPUT_USD_PER_MILLION,
      cost_basis:
        "Estimate from recorded input tokens and pinned input-token rate only; missing/failed/retried usage may be unreported. Not a bill.",
    },
    questions: summaries,
    rows,
  };
}

export function renderReaderReport(report: ReturnType<typeof summarizeReaderEval>): string {
  const cell = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("|", "\\|")
      .replace(/[\r\n]/g, " ");
  const lines = [
    "# Reader question experiment",
    "",
    report.protocol,
    "",
    "Descriptive observations by the reader's original categories. No accuracy, authorship truth, threshold decisions, prompt tuning or winning-question ranking is inferred.",
    "",
    `Requests: ${report.coverage.valid} valid, ${report.coverage.failed} failed, ${report.coverage.missing} missing of ${report.coverage.expected_requests}. Complete records: ${report.complete}.`,
    `Tokens: ${report.totals.input_tokens} input, ${report.totals.output_tokens} output; estimated input cost $${report.totals.estimated_usd.toFixed(8)} at $${report.totals.input_usd_per_million}/million. ${report.totals.cost_basis}`,
    "",
  ];
  for (const question of report.questions) {
    lines.push(
      `## ${cell(question.id)}`,
      "",
      `${cell(question.family)}: ${cell(question.question)}`,
      "",
      "| Reader category | Cards | Valid | Failed | Missing | Mean noul | Raw noul values |",
      "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
    );
    for (const category of [...question.categories, question.unrated])
      lines.push(
        `| ${category.label ?? "unrated"} | ${category.cards} | ${category.valid} | ${category.failed} | ${category.missing} | ${category.mean === null ? "—" : String(category.mean)} | ${category.values.join(", ")} |`,
      );
    lines.push("");
  }
  return lines.join("\n");
}
