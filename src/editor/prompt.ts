import type { AuditMetadata, auditDocument } from "../audit.js";
import { invariant, object } from "../registry.js";
import type { EditUnit } from "./edits.js";

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
];
export const HELD_OUT_METRICS = [
  "sentence_length_mean_words",
  "sentence_length_stdev_words",
  "semicolons_per_1000_words",
  "clause_intro_colons_per_1000_words",
  "em_dashes_per_1000_words",
] as const;
export interface Baseline {
  n: number;
  note: string;
  metrics: Record<string, number>;
  held_out: Record<string, number>;
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
  function read(key: string, names: readonly string[]): Record<string, number> {
    const metrics = object(value[key], `Baseline ${key}`);
    return Object.fromEntries(
      names.map((name) => {
        const number = metrics[name];
        invariant(
          typeof number === "number" && Number.isFinite(number) && number >= 0,
          `Missing baseline metric: ${name}`,
        );
        return [name, number];
      }),
    );
  }
  return {
    n: value.n,
    note: value.note,
    metrics: read("metrics", BASELINE_METRICS),
    held_out: read("held_out", HELD_OUT_METRICS),
  };
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
  ] as const) {
    const rate = code[key];
    invariant(typeof rate === "number", `Undefined code metric: ${key}`);
    entries.push([key, rate]);
  }
  return Object.fromEntries(entries);
}

export function heldOutRates(audit: TextureAudit): Record<string, number> {
  return Object.fromEntries(
    HELD_OUT_METRICS.map((key) => {
      const value = audit.density.code?.[key];
      invariant(typeof value === "number", `Undefined held-out metric: ${key}`);
      return [key, value];
    }),
  );
}

export function densityTable(
  before: TextureAudit,
  after: TextureAudit,
  baseline: Baseline,
  heldOut = false,
): string {
  const a = heldOut ? heldOutRates(before) : habitRates(before);
  const b = heldOut ? heldOutRates(after) : habitRates(after);
  const reference = heldOut ? baseline.held_out : baseline.metrics;
  return [
    "| Habit / metric | Before | After | Human baseline |",
    "| --- | ---: | ---: | ---: |",
    ...(heldOut ? HELD_OUT_METRICS : BASELINE_METRICS).map(
      (key) =>
        `| ${key} | ${a[key]?.toFixed(3)} | ${b[key]?.toFixed(3)} | ${reference[key]?.toFixed(3)} |`,
    ),
  ].join("\n");
}

function markedText(unit: EditUnit, audit: TextureAudit): string {
  const labels = new Map<number, string[]>();
  function mark(at: number, name: string): void {
    const values = labels.get(at) ?? [];
    values.push(name);
    labels.set(at, values);
  }
  for (const [id, name] of [
    ["c.aphorism", "maxim"],
    ["c.triplet", "triplet"],
    ["c.playful_flourish", "flourish"],
  ]) {
    for (const row of audit.answers) {
      if (
        row.question_id === id &&
        row.answer?.type === "noul" &&
        row.answer.noul >= 0.5 &&
        row.offsets[0] >= unit.start &&
        row.offsets[1] <= unit.end
      )
        mark(row.offsets[1] - unit.start, name ?? "");
    }
  }
  if (unit.kind === "heading") mark(unit.text.length, "heading");
  if (unit.list_item) mark(unit.text.length, "bullets");
  const boldView = unit.text.replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, (code) =>
    " ".repeat(code.length),
  );
  for (const match of boldView.matchAll(/(\*\*|__)(?=\S)[\s\S]*?\S\1/g))
    mark(match.index + match[0].length, "bold");
  let text = unit.text;
  for (const [offset, names] of [...labels].sort(([a], [b]) => b - a))
    text = text.slice(0, offset) + names.map((name) => ` «${name}»`).join("") + text.slice(offset);
  return text;
}

export function editorPrompt(
  template: string,
  source: string,
  units: EditUnit[],
  audit: TextureAudit,
  metadata: AuditMetadata,
): string {
  let filled = template;
  for (const key of ["audience", "purpose", "genre"] as const)
    filled = filled.replaceAll(`{{${key}}}`, () => metadata[key]);
  invariant(!/{{[^}]+}}/.test(filled), "Unfilled editor prompt slots");
  const pieces = [
    filled,
    "Detector note: These habits are much more frequent than in human writing; judge each marked instance for reader benefit.",
    "Only edit numbered units. Markers are annotations: never copy them into replacements. Read-only gaps include code blocks. Put dependent units in a single atomic group; each changed unit appears in exactly one group.",
    "NUMBERED UNITS",
  ];
  let cursor = 0;
  for (const unit of units) {
    const gap = source.slice(cursor, unit.start);
    if (gap.trim()) pieces.push(`[READ ONLY CONTEXT]\n${gap}\n[/READ ONLY CONTEXT]`);
    pieces.push(`[${unit.id}] ${unit.kind}\n${markedText(unit, audit)}`);
    cursor = unit.end;
  }
  if (source.slice(cursor).trim())
    pieces.push(`[READ ONLY CONTEXT]\n${source.slice(cursor)}\n[/READ ONLY CONTEXT]`);
  return pieces.join("\n\n");
}
