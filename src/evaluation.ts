import type { ChoiceResponse, NoulResponse, Question, ScoreResponse } from "@typesafe-ai/sdk";
import { INPUT_USD_PER_MILLION, MODEL, tokenTotals } from "./jev.js";
import type { RequestRecord } from "./jev.js";
import { invariant, SOURCES } from "./registry.js";
import type { EvalCase, RegisteredQuestion, Source } from "./registry.js";

export type Answer = NoulResponse | ChoiceResponse | ScoreResponse;
export interface Assessment {
  correct: boolean;
  decisiveness: number;
  label: string;
}

export function assess(question: Question, expected: string, answer: Answer): Assessment {
  invariant(question.type === answer.type, "Question and answer types must match");
  if (question.type === "noul" && answer.type === "noul") {
    const label = answer.noul > 0.5 ? "true" : answer.noul < 0.5 ? "false" : "tie";
    return { correct: label === expected, decisiveness: Math.abs(answer.noul - 0.5) * 2, label };
  }
  if (question.type === "choice" && answer.type === "choice") {
    return {
      correct: answer.choice === expected,
      decisiveness: answer.confidence,
      label: answer.choice,
    };
  }
  invariant(
    question.type === "score" && answer.type === "score",
    "Unsupported question/answer pair",
  );
  const normalized = answer.score / (question.criteria.length - 1);
  const label = normalized < 0.5 ? "low" : normalized > 0.5 ? "high" : "tie";
  return { correct: label === expected, decisiveness: answer.confidence, label };
}

export interface CaseResult {
  case_id: string;
  question_id: string;
  source: Source;
  expected: string;
  answer: Answer | null;
  reversed_answer: Answer | null;
  assessment: Assessment | null;
  reversed_assessment: Assessment | null;
  error: RequestRecord["error"];
  reversed_error: RequestRecord["error"];
}

export function evaluateCases(
  cases: EvalCase[],
  questions: RegisteredQuestion[],
  records: RequestRecord[],
): CaseResult[] {
  const originals = new Map<string, RequestRecord>();
  const reversed = new Map<string, RequestRecord>();
  for (const record of records) {
    const target = record.variant === "original" ? originals : reversed;
    for (const id of record.case_ids) {
      invariant(!target.has(id), "Duplicate case response");
      target.set(id, record);
    }
  }
  const catalogue = new Map(questions.map((q) => [q.id, q]));
  return cases.map((c) => {
    const q = catalogue.get(c.question_id);
    invariant(q, `Unknown evaluation question: ${c.question_id}`);
    const original = originals.get(c.case_id);
    invariant(original, `Missing original request: ${c.case_id}`);
    const repeat = reversed.get(c.case_id);
    const answer = original.error ? null : (original.response?.answers[c.question_id] ?? null);
    const reversedAnswer = repeat?.error
      ? null
      : (repeat?.response?.answers[c.question_id] ?? null);
    invariant(original.error || answer, `Missing answer: ${c.case_id}`);
    return {
      case_id: c.case_id,
      question_id: c.question_id,
      source: q.source,
      expected: c.expected,
      answer,
      reversed_answer: reversedAnswer,
      assessment: answer ? assess(q.question, c.expected, answer) : null,
      reversed_assessment: reversedAnswer ? assess(q.question, c.expected, reversedAnswer) : null,
      error: original.error,
      reversed_error: repeat?.error ?? null,
    };
  });
}

function metrics(results: CaseResult[]) {
  const valid = results.flatMap((r) => (r.assessment ? [r.assessment] : []));
  const pairs = results.filter(
    (r) => r.answer?.type === "choice" && r.reversed_answer?.type === "choice",
  );
  const flips = pairs.filter(
    (r) =>
      r.answer?.type === "choice" &&
      r.reversed_answer?.type === "choice" &&
      r.answer.choice !== r.reversed_answer.choice,
  ).length;
  return {
    n: results.length,
    correct: valid.filter((r) => r.correct).length,
    errors: results.filter((r) => r.error).length,
    accuracy: results.length ? valid.filter((r) => r.correct).length / results.length : null,
    mean_decisiveness: valid.length
      ? valid.reduce((sum, r) => sum + r.decisiveness, 0) / valid.length
      : null,
    paired: pairs.length,
    flips,
    flip_rate: pairs.length ? flips / pairs.length : null,
  };
}

export function summarize(
  questions: RegisteredQuestion[],
  results: CaseResult[],
  records: RequestRecord[],
) {
  return {
    model: MODEL,
    totals: tokenTotals(records),
    requests: records.length,
    failed_requests: records.filter((r) => r.error).length,
    overall: metrics(results),
    sources: Object.fromEntries(
      SOURCES.map((source) => [source, metrics(results.filter((r) => r.source === source))]),
    ),
    questions: questions.map((q) => ({
      id: q.id,
      source: q.source,
      type: q.type,
      ...metrics(results.filter((r) => r.question_id === q.id)),
    })),
  };
}

function decimal(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}
function safeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").replaceAll("\r", " ");
}

export function renderReport(
  questions: RegisteredQuestion[],
  results: CaseResult[],
  records: RequestRecord[],
  repeatOrder: boolean,
): string {
  const summary = summarize(questions, results, records);
  const lines = [
    "# Jev question evaluation",
    "",
    `Model: ${MODEL}. Requests: ${summary.requests}; failed: ${summary.failed_requests}.`,
    "",
    `Cases: ${summary.overall.n}; correct: ${summary.overall.correct}; accuracy: ${decimal(summary.overall.accuracy)}.`,
    "",
    "Labels are author-proposed synthetic expectations, not independent human ground truth. A and B measure different tasks; their rollups are not a controlled comparison.",
    "",
    `Input tokens: ${summary.totals.input_tokens}; output tokens: ${summary.totals.output_tokens}; estimated cost: $${summary.totals.estimated_usd.toFixed(8)} USD at $${INPUT_USD_PER_MILLION}/million input tokens (output free).`,
    "",
    "Token totals include original and reversed requests. Cost uses reported usage only; failed attempts may have unreported billing. Timing includes SDK retry/backoff. Errors count in n and accuracy, but have no decisiveness. Midpoint noul/score answers are ties and count as incorrect.",
    "",
    "## By source",
    "",
    "| Source | n | Correct | Accuracy | Mean decisiveness | Errors |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const source of SOURCES) {
    const m = summary.sources[source];
    invariant(m, "Missing source summary");
    lines.push(
      `| ${source.toUpperCase()} | ${m.n} | ${m.correct} | ${decimal(m.accuracy)} | ${decimal(m.mean_decisiveness)} | ${m.errors} |`,
    );
  }
  lines.push(
    "",
    "## By question",
    "",
    "| Question | Type | n | Correct | Accuracy | Mean decisiveness | Errors | Choice flips / paired | Flip rate |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  );
  for (const m of summary.questions) {
    lines.push(
      `| ${safeCell(m.id)} | ${m.type} | ${m.n} | ${m.correct} | ${decimal(m.accuracy)} | ${decimal(m.mean_decisiveness)} | ${m.errors} | ${m.flips}/${m.paired} | ${decimal(m.flip_rate)} |`,
    );
  }
  lines.push("", "## Misses", "");
  const misses = results.filter((r) => !r.assessment?.correct);
  if (!misses.length) lines.push("None.");
  for (const r of misses) {
    lines.push(
      `- ${safeCell(r.case_id)} (${r.question_id}): expected ${safeCell(r.expected)}; answer ${safeCell(JSON.stringify(r.answer))}; error ${safeCell(JSON.stringify(r.error))}.`,
    );
  }
  lines.push("", "## Option order", "");
  if (!repeatOrder) lines.push("Not requested.");
  else {
    lines.push(
      `Choice flips: ${summary.overall.flips}/${summary.overall.paired}; flip rate ${decimal(summary.overall.flip_rate)}. Paired comparisons require two valid responses; original accuracy is not double-counted. Reversing integer-like keys cannot change their JSON property order.`,
      "",
    );
    for (const r of results.filter((result) => result.reversed_answer || result.reversed_error)) {
      if (
        r.assessment?.label !== r.reversed_assessment?.label ||
        r.reversed_error ||
        !r.reversed_assessment?.correct
      ) {
        lines.push(
          `- ${safeCell(r.case_id)}: original ${safeCell(JSON.stringify(r.answer))}; reversed ${safeCell(JSON.stringify(r.reversed_answer))}; reversed error ${safeCell(JSON.stringify(r.reversed_error))}.`,
        );
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
