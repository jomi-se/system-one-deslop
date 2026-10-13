import { basename } from "node:path";
import { CODE_METRICS } from "./density.js";
import { invariant, object } from "./registry.js";

export interface CorpusEntry {
  name: string;
  metrics: Record<string, number | null>;
}

export function corpusGroup(name: string): string {
  const match = basename(name).match(/^[^.]+\.([^.]+)\.([^.]+)\.json$/);
  return match ? `${match[1]}.${match[2]}` : "human";
}

function metric(value: unknown, label: string): number | null {
  invariant(
    value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0),
    `${label}: invalid density metric`,
  );
  return value;
}

export function readDensity(name: string, input: unknown): CorpusEntry {
  const density = object(object(input, name).density, `${name} density`);
  const code = object(density.code, `${name} code metrics (run --passes sentence-c,code)`);
  const questions = object(density.questions, `${name} texture density`);
  const entries: [string, number | null][] = CODE_METRICS.map((key) => [
    key,
    metric(code[key], `${name} ${key}`),
  ]);
  for (const [id, value] of Object.entries(questions)) {
    invariant(id.startsWith("c."), `${name}: unexpected density question`);
    const row = object(value, `${name} ${id}`);
    invariant(
      typeof row.count === "number" &&
        Number.isSafeInteger(row.count) &&
        row.count >= 0 &&
        typeof row.valid === "number" &&
        Number.isSafeInteger(row.valid) &&
        row.count <= row.valid &&
        typeof row.expected === "number" &&
        Number.isSafeInteger(row.expected) &&
        row.expected >= 0 &&
        row.valid === row.expected,
      `${name}: incomplete texture judgments`,
    );
    entries.push([`${id}_per_1000_words`, metric(row.per_1000_words, `${name} ${id}`)]);
  }
  invariant(Object.keys(questions).length > 0, `${name}: missing texture densities`);
  return { name, metrics: Object.fromEntries(entries) };
}

export function groupDensities(entries: CorpusEntry[]) {
  invariant(entries.length > 0, "No audit JSON files found");
  const metricNames = Object.keys(entries[0]?.metrics ?? {});
  invariant(
    entries.every(
      (entry) =>
        Object.keys(entry.metrics).length === metricNames.length &&
        metricNames.every((key) => Object.hasOwn(entry.metrics, key)),
    ),
    "Audit files have different metric sets",
  );
  const groups = new Map<string, CorpusEntry[]>();
  for (const entry of entries) {
    const name = corpusGroup(entry.name);
    const group = groups.get(name) ?? [];
    group.push(entry);
    groups.set(name, group);
  }
  invariant(groups.has("human"), "A human group is required for baseline ratios");
  const means = Object.fromEntries(
    [...groups].map(([name, group]) => [
      name,
      {
        n: group.length,
        metrics: Object.fromEntries(
          metricNames.map((key) => {
            const values = group.map((entry) => entry.metrics[key]);
            const valid = values.filter((value): value is number => typeof value === "number");
            return [
              key,
              valid.length === values.length
                ? valid.reduce((sum, value) => sum + value, 0) / valid.length
                : null,
            ];
          }),
        ),
      },
    ]),
  );
  const human = means.human;
  invariant(human, "Missing human means");
  return Object.entries(means)
    .sort(([a], [b]) => (a === "human" ? -1 : b === "human" ? 1 : a.localeCompare(b)))
    .map(([group, summary]) => ({
      group,
      ...summary,
      ratios: Object.fromEntries(
        metricNames.map((key) => {
          const value = summary.metrics[key];
          const baseline = human.metrics[key];
          return [
            key,
            typeof value === "number" && typeof baseline === "number" && baseline > 0
              ? value / baseline
              : null,
          ];
        }),
      ),
    }));
}

function cell(text: string): string {
  return text.replaceAll("|", "\\|").replace(/[\r\n]/g, " ");
}

export function renderCorpusReport(entries: CorpusEntry[]): string {
  const groups = groupDensities(entries);
  const metrics = Object.keys(groups[0]?.metrics ?? {});
  const lines = [
    "# Corpus texture density",
    "",
    "Unweighted means of document metrics. Each cell is mean (ratio to human). A dash marks undefined values, including ratios whose human baseline is zero. Counts and population standard deviation are computed in code; C events use noul >= 0.5. This is an exploratory comparison, not an authorship classifier.",
    "",
    `| Metric | ${groups.map((group) => `${cell(group.group)} (n=${group.n})`).join(" | ")} |`,
    `| --- | ${groups.map(() => "---:").join(" | ")} |`,
  ];
  for (const key of metrics) {
    lines.push(
      `| ${key} | ${groups
        .map((group) => {
          const mean = group.metrics[key];
          const ratio = group.ratios[key];
          return `${typeof mean === "number" ? mean.toFixed(3) : "—"} (${typeof ratio === "number" ? `${ratio.toFixed(2)}×` : "—"})`;
        })
        .join(" | ")} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}
