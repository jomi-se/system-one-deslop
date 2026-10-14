import type { CodeMetrics, Density } from "./density.js";
import { wordCount } from "./density.js";
import type { AuditAnswer, auditDocument } from "./audit.js";
import type { Span } from "./parse.js";
import { invariant, object } from "./registry.js";
import { poissonInterval } from "./interval.js";
import type { Interval } from "./interval.js";

interface Habit {
  id: string;
  label: string;
  source: keyof CodeMetrics | `c.${string}`;
  baseline: "metrics" | "held_out";
  rule: "high" | "short" | "none";
  unit: "/1k" | "words";
}
export const CHECK_HABITS: readonly Habit[] = [
  ...(
    [
      ["general_maxim", "general maxims", "c.aphorism"],
      ["triplet", "triplets", "c.triplet"],
      ["playful_flourish", "playful asides", "c.playful_flourish"],
      ["disclaimer", "disclaimers", "c.disclaimer"],
      ["precaution", "precautions", "c.precaution"],
    ] as const
  ).map(([id, label, source]): Habit => ({
    id: id + "_per_1000_words",
    label,
    source,
    baseline: "metrics",
    rule: "high",
    unit: "/1k",
  })),
  ...(
    [
      ["headings_per_1000_words", "headings"],
      ["bullets_per_1000_words", "bullets"],
      ["bold_spans_per_1000_words", "bold"],
    ] as const
  ).map(([id, label]): Habit => ({
    id,
    label,
    source: id,
    baseline: "metrics",
    rule: "high",
    unit: "/1k",
  })),
  {
    id: "sentence_length_mean_words",
    label: "sentence length mean",
    source: "sentence_length_mean_words",
    baseline: "held_out",
    rule: "short",
    unit: "words",
  },
  {
    id: "sentence_length_stdev_words",
    label: "sentence length stdev",
    source: "sentence_length_stdev_words",
    baseline: "held_out",
    rule: "none",
    unit: "words",
  },
];
export interface CheckBaseline {
  n: number;
  note: string;
  values: Record<string, number>;
}
export function readCheckBaseline(input: unknown): CheckBaseline {
  const value = object(input, "Human baseline");
  invariant(
    typeof value.n === "number" &&
      Number.isSafeInteger(value.n) &&
      value.n > 0 &&
      typeof value.note === "string",
    "Invalid human baseline metadata",
  );
  return {
    n: value.n,
    note: value.note,
    values: Object.fromEntries(
      CHECK_HABITS.map((habit) => {
        const number = object(
          value[habit.source.startsWith("c.") ? "expected_metrics" : habit.baseline],
          "Baseline metrics",
        )[habit.id];
        invariant(
          typeof number === "number" && Number.isFinite(number) && number >= 0,
          `Missing baseline metric: ${habit.id}`,
        );
        return [habit.id, number];
      }),
    ),
  };
}
export interface CheckRow {
  id: string;
  label: string;
  unit: Habit["unit"];
  value: number | null;
  baseline: number;
  ratio: number | "infinity" | null;
  lower_ratio: number | "infinity" | null;
  count: number | null;
  hits: number | null;
  interval: Interval | null;
  flagged: boolean;
  rule: Habit["rule"];
  source: Habit["source"];
}
export interface CheckReport {
  prose_words: number;
  too_short: boolean;
  max_ratio: number;
  baseline: CheckBaseline;
  rows: CheckRow[];
  flagged: number;
}

export function checkDensity(density: Density, baseline: CheckBaseline, maxRatio = 3): CheckReport {
  invariant(
    Number.isFinite(maxRatio) && maxRatio > 0,
    "--max-ratio must be a finite positive number",
  );
  invariant(density.code, "Code metrics are required");
  invariant(
    Number.isSafeInteger(density.prose_words) && density.prose_words >= 0,
    "Invalid prose word count",
  );
  const too_short = density.texture_prose_words < 200;
  const code = object(density.code, "Code metrics");
  const rows = CHECK_HABITS.map((habit): CheckRow => {
    let value: unknown;
    let count: unknown = null;
    let hits: number | null = null;
    let denominator = density.prose_words;
    if (habit.source.startsWith("c.")) {
      const question = density.questions[habit.source];
      invariant(
        question &&
          question.count !== null &&
          question.valid === question.expected &&
          question.expected_count !== null &&
          question.expected === density.texture_sentences,
        `Incomplete texture judgments: ${habit.source}`,
      );
      value = question.expected_per_1000_words;
      count = question.expected_count;
      hits = question.hits;
      denominator = density.texture_prose_words;
    } else {
      value = code[habit.source];
      if (habit.unit === "/1k") count = code[habit.source.replace("_per_1000_words", "")];
    }
    invariant(
      value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0),
      `Invalid check metric: ${habit.id}`,
    );
    const reference = baseline.values[habit.id];
    invariant(
      typeof reference === "number" && Number.isFinite(reference) && reference >= 0,
      `Missing baseline metric: ${habit.id}`,
    );
    const ratio =
      value === null ? null : reference > 0 ? value / reference : value > 0 ? "infinity" : null;
    invariant(
      count === null || (typeof count === "number" && Number.isFinite(count) && count >= 0),
      "Invalid habit count",
    );
    const bounds = count === null || denominator === 0 ? null : poissonInterval(count);
    const interval = bounds
      ? { lower: (bounds.lower / denominator) * 1_000, upper: (bounds.upper / denominator) * 1_000 }
      : null;
    const lower_ratio =
      interval === null
        ? null
        : reference > 0
          ? interval.lower / reference
          : interval.lower > 0
            ? "infinity"
            : null;
    const flagged =
      value !== null &&
      (habit.rule === "high"
        ? lower_ratio === "infinity" || (typeof lower_ratio === "number" && lower_ratio > maxRatio)
        : habit.rule === "short"
          ? !too_short && value < 0.8 * reference
          : false);
    return {
      ...habit,
      value,
      baseline: reference,
      ratio,
      lower_ratio,
      count,
      hits,
      interval,
      flagged,
    };
  });
  return {
    prose_words: density.prose_words,
    too_short,
    max_ratio: maxRatio,
    baseline,
    rows,
    flagged: rows.filter((row) => row.flagged).length,
  };
}

type TextureAudit = Awaited<ReturnType<typeof auditDocument>>;
interface Example {
  span: Span;
  detail: string;
}
function examples(row: CheckRow, audit: TextureAudit): Example[] {
  const paragraphs = audit.document.sections.flatMap((section) => section.paragraphs);
  const eligible = new Set(
    paragraphs
      .flatMap((paragraph) => paragraph.sentences)
      .filter((sentence) => sentence.quoted_fraction <= 0.5)
      .map((sentence) => sentence.id),
  );
  if (row.source.startsWith("c.")) {
    return audit.answers
      .filter(
        (answer): answer is AuditAnswer & { answer: { type: "noul"; noul: number } } =>
          answer.question_id === row.source &&
          eligible.has(answer.unit_id) &&
          !answer.error &&
          answer.answer?.type === "noul" &&
          answer.answer.noul > 0,
      )
      .sort((a, b) => b.answer.noul - a.answer.noul || a.offsets[0] - b.offsets[0])
      .slice(0, 5)
      .map((answer) => ({
        span: {
          id: answer.unit_id,
          start: answer.offsets[0],
          end: answer.offsets[1],
          text: audit.document.text.slice(...answer.offsets),
        },
        detail: `p=${answer.answer.noul.toFixed(3)}`,
      }));
  }
  if (row.source === "headings_per_1000_words")
    return audit.document.sections
      .flatMap((section) => (section.heading ? [{ span: section.heading, detail: "heading" }] : []))
      .slice(0, 5);
  if (row.source === "bullets_per_1000_words")
    return paragraphs
      .filter((paragraph) => paragraph.list_item)
      .slice(0, 5)
      .map((paragraph) => ({ span: paragraph.sentences[0] ?? paragraph, detail: "list item" }));
  const sentences = paragraphs.flatMap((paragraph) => paragraph.sentences);
  if (row.source === "bold_spans_per_1000_words")
    return sentences
      .filter((sentence) =>
        /(\*\*|__)(?=\S)[\s\S]*?\S\1/.test(
          sentence.text.replace(/(?<!`)(`+)(?!`)[\s\S]*?\1(?!`)/g, " "),
        ),
      )
      .slice(0, 5)
      .map((sentence) => ({ span: sentence, detail: "bold span" }));
  return sentences
    .map((span) => ({ span, words: wordCount(span.text) }))
    .sort((a, b) => a.words - b.words || a.span.start - b.span.start)
    .slice(0, 5)
    .map(({ span, words }) => ({ span, detail: `${words} words` }));
}
export function renderCheckReport(file: string, audit: TextureAudit, report: CheckReport): string {
  const lines = [
    `${file}: ${report.prose_words} prose words; human n=${report.baseline.n}; max ratio ${report.max_ratio}×`,
    `C denominator: ${audit.density.texture_prose_words} words; ${audit.density.quoted_sentences} quoted sentences excluded. Count bands: 90% Poisson score; flags use the lower limit.`,
    report.baseline.note,
  ];
  if (report.too_short)
    lines.push(
      "Under 200 authored prose words: count flags use interval bounds; sentence-length flag suppressed.",
    );
  for (const row of report.rows) {
    const value = row.value === null ? "—" : row.value.toFixed(2);
    const ratio =
      row.ratio === "infinity" ? "∞×" : row.ratio === null ? "—" : row.ratio.toFixed(2) + "×";
    lines.push(
      `${row.flagged ? "!" : " "} ${row.label}: ${value}${row.unit === "/1k" ? "/1k" : " words"}${row.interval ? ` [90% ${row.interval.lower.toFixed(2)}–${row.interval.upper.toFixed(2)}]` : ""} | human ${row.baseline.toFixed(2)} | ${ratio}${row.hits !== null ? ` | expected ${row.count?.toFixed(2)}, hits ${row.hits}` : ""}${row.flagged && row.rule === "short" ? " (below 0.8×)" : ""}`,
    );
    if (row.flagged)
      for (const example of examples(row, audit)) {
        const line = audit.document.text.slice(0, example.span.start).split(/\r\n|\r|\n/).length;
        const excerpt = example.span.text.replace(/\s+/g, " ").trim();
        lines.push(
          `  ${file}:${line} [${example.detail}] ${excerpt.length > 180 ? excerpt.slice(0, 177) + "…" : excerpt}`,
        );
      }
  }
  lines.push(`${report.flagged} habit${report.flagged === 1 ? "" : "s"} flagged.`);
  return lines.join("\n") + "\n";
}
