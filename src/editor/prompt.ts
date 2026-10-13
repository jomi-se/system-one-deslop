import type { AuditMetadata, auditDocument } from "../audit.js";
import { invariant, object } from "../registry.js";
import type { EditUnit } from "./edits.js";
import { EDIT_SCHEMA } from "./providers.js";

export type TextureAudit = Awaited<ReturnType<typeof auditDocument>>;
export const HABITS = {
  general_maxim_per_1000_words: "c.aphorism",
  triplet_per_1000_words: "c.triplet",
  playful_flourish_per_1000_words: "c.playful_flourish",
} as const;
export const BASELINE_METRICS = [
  ...Object.keys(HABITS),
  "headings_per_1000_words",
  "bullets_per_1000_words",
  "bold_spans_per_1000_words",
  "mean_sentence_length_words",
];
export interface Baseline {
  n: number;
  note: string;
  metrics: Record<string, number>;
}

export function readBaseline(input: unknown): Baseline {
  const value = object(input, "Human baseline");
  invariant(
    typeof value.n === "number" &&
      Number.isSafeInteger(value.n) &&
      value.n > 0 &&
      typeof value.note === "string",
    "Invalid human baseline metadata",
  );
  const metrics = object(value.metrics, "Human baseline metrics");
  const entries: [string, number][] = BASELINE_METRICS.map((key) => {
    const number = metrics[key];
    invariant(
      typeof number === "number" && Number.isFinite(number) && number >= 0,
      `Missing baseline metric: ${key}`,
    );
    return [key, number];
  });
  return { n: value.n, note: value.note, metrics: Object.fromEntries(entries) };
}

export function habitRates(audit: TextureAudit): Record<string, number> {
  const code = audit.density.code;
  invariant(code && audit.requests.every((request) => !request.error), "Incomplete texture audit");
  const entries: [string, number][] = Object.entries(HABITS).map(([metric, question]) => {
    const rate = audit.density.questions[question]?.per_1000_words;
    invariant(typeof rate === "number", `Incomplete habit density: ${question}`);
    return [metric, rate];
  });
  for (const key of [
    "headings_per_1000_words",
    "bullets_per_1000_words",
    "bold_spans_per_1000_words",
    "sentence_length_mean_words",
  ] as const) {
    const rate = code[key];
    invariant(typeof rate === "number", `Undefined code metric: ${key}`);
    entries.push([key === "sentence_length_mean_words" ? "mean_sentence_length_words" : key, rate]);
  }
  return Object.fromEntries(entries);
}

export function needsAnotherRound(audit: TextureAudit, baseline: Baseline): boolean {
  return Object.entries(habitRates(audit)).some(
    ([key, value]) =>
      key !== "mean_sentence_length_words" && value > 1.5 * (baseline.metrics[key] ?? 0),
  );
}

export function densityTable(
  before: TextureAudit,
  after: TextureAudit,
  baseline: Baseline,
): string {
  const a = habitRates(before),
    b = habitRates(after);
  return [
    "| Habit / metric | Before | After | Human baseline |",
    "| --- | ---: | ---: | ---: |",
    ...BASELINE_METRICS.map(
      (key) =>
        `| ${key} | ${a[key]?.toFixed(3)} | ${b[key]?.toFixed(3)} | ${baseline.metrics[key]?.toFixed(3)} |`,
    ),
  ].join("\n");
}

function markedText(unit: EditUnit, audit: TextureAudit): string {
  const labels = new Map<number, string[]>();
  for (const [habit, id] of Object.entries(HABITS)) {
    for (const row of audit.answers.filter(
      (answer) =>
        answer.question_id === id && answer.answer?.type === "noul" && answer.answer.noul >= 0.5,
    )) {
      if (row.offsets[0] < unit.start || row.offsets[1] > unit.end) continue;
      const at = row.offsets[1] - unit.start;
      const values = labels.get(at) ?? [];
      values.push(habit.replace("_per_1000_words", ""));
      labels.set(at, values);
    }
  }
  let text = unit.text;
  for (const [offset, names] of [...labels].sort(([a], [b]) => b - a)) {
    text = text.slice(0, offset) + names.map((name) => ` «${name}»`).join("") + text.slice(offset);
  }
  return text;
}

export function editorPrompt(
  template: string,
  source: string,
  units: EditUnit[],
  audit: TextureAudit,
  baseline: Baseline,
  metadata: AuditMetadata,
  feedback = "",
): string {
  let filled = template;
  for (const key of ["audience", "purpose", "genre"] as const)
    filled = filled.replaceAll(`{{${key}}}`, () => metadata[key]);
  invariant(!/{{[^}]+}}/.test(filled), "Unfilled editor prompt slots");
  const pieces = [
    filled,
    "\nDETECTOR REPORT\n",
    densityTable(audit, audit, baseline),
    `\nBaseline n=${baseline.n}. ${baseline.note}`,
    "\nOnly edit numbered units. Markers are annotations: never copy them into replacements. Read-only gaps include code blocks and must remain untouched. Headings may be replaced or deleted using their h ids. Return the exact JSON schema below.",
    JSON.stringify(EDIT_SCHEMA),
    feedback ? `\nPREVIOUS ROUND FEEDBACK (previous unit ids)\n${feedback}` : "",
    "\nNUMBERED UNITS\n",
  ];
  let cursor = 0;
  for (const unit of units) {
    const gap = source.slice(cursor, unit.start);
    if (gap.trim()) pieces.push(`[READ ONLY CONTEXT]\n${gap}\n[/READ ONLY CONTEXT]`);
    pieces.push(
      `[${unit.id}] ${unit.kind} [${unit.start},${unit.end})\n${markedText(unit, audit)}`,
    );
    cursor = unit.end;
  }
  if (source.slice(cursor).trim())
    pieces.push(`[READ ONLY CONTEXT]\n${source.slice(cursor)}\n[/READ ONLY CONTEXT]`);
  return pieces.join("\n\n");
}
