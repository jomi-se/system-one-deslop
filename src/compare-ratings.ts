import { createHash } from "node:crypto";
import { LABELS, isLabel } from "./label-types.js";
import type { Label, Rating } from "./label-types.js";
import { cardId, readingText } from "./labels.js";
import type { Card, Origin } from "./labels.js";
import { invariant, object } from "./registry.js";

type JsonObject = Record<string, unknown>;
export interface RatedCard extends Card {
  rating: Rating | null;
}
interface Unit {
  id: string;
  start: number;
  end: number;
  text: string;
  paragraph: { start: number; text: string };
  previous: string;
  next: string;
}
interface Prediction {
  pass: string;
  question_id: string;
  question: JsonObject;
  definition_hash: string;
  answer: JsonObject | null;
  error: JsonObject | null;
}
interface ParsedAudit {
  model: string;
  units: Unit[];
  predictions: Map<string, Prediction[]>;
  questions: Prediction[];
}
export interface AuditInput {
  origin_file: string;
  audit_id: string;
  value: unknown;
}
const PASSES = ["sentence-a", "sentence-b", "sentence-c"];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  invariant(encoded !== undefined, "Input contains a non-JSON value");
  return encoded;
}
export function comparisonHash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function string(value: unknown): string {
  invariant(typeof value === "string", "Expected a string");
  return value;
}
function array(value: unknown): unknown[] {
  invariant(Array.isArray(value), "Expected an array");
  return value;
}
function offsets(value: unknown): [number, number] {
  const span = array(value);
  const start = span[0];
  const end = span[1];
  invariant(
    span.length === 2 &&
      typeof start === "number" &&
      typeof end === "number" &&
      Number.isSafeInteger(start) &&
      Number.isSafeInteger(end) &&
      start >= 0 &&
      end > start,
    "Invalid offsets",
  );
  return [start, end];
}
function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}
export function readRatingsExport(exportValue: unknown): RatedCard[] {
  const input = object(exportValue, "Ratings export");
  invariant(input.version === 1, "Unsupported ratings export version");
  const dataset = object(input.dataset, "Export dataset");
  invariant(
    dataset.unit === undefined || dataset.unit === "sentence" || dataset.unit === "excerpt",
    "Unknown labeling unit",
  );
  const normalize = dataset.unit === "excerpt" ? (text: string) => text : readingText;
  string(dataset.seed);
  for (const count of [dataset.documents, dataset.total_unique])
    invariant(
      typeof count === "number" && Number.isSafeInteger(count) && count >= 0,
      "Invalid dataset count",
    );
  const seen = new Set<string>();
  return array(input.rows).map((rowValue) => {
    const row = object(rowValue, "Rating row");
    const id = string(row.id);
    const text = string(row.text);
    invariant(
      text.length > 0 && cardId(text) === id && !seen.has(id),
      "Invalid or duplicate card identity",
    );
    seen.add(id);
    const origins: Origin[] = array(row.origins).map((value) => {
      const origin = object(value, "Origin");
      const span = offsets(origin.offsets);
      const raw_text = string(origin.raw_text);
      invariant(
        raw_text.length === span[1] - span[0] && cardId(normalize(raw_text)) === id,
        "Origin text does not match card identity or offsets",
      );
      const paragraph = string(origin.paragraph);
      invariant(paragraph.includes(raw_text), "Origin paragraph does not contain its sentence");
      return {
        file: string(origin.file),
        group: string(origin.group),
        offsets: span,
        raw_text,
        paragraph,
        before: string(origin.before),
        after: string(origin.after),
      };
    });
    invariant(
      origins.length > 0 && normalize(origins[0]?.raw_text ?? "") === text,
      "Invalid primary reading text",
    );
    let rating: Rating | null = null;
    if (row.rating !== null) {
      const r = object(row.rating, "Rating");
      invariant(isLabel(r.label), "Invalid reader category");
      const note = string(r.note);
      invariant(note.length <= 4_000, "Invalid rating note");
      let highlight: Rating["highlight"] = null;
      if (r.highlight !== null) {
        const h = object(r.highlight, "Highlight");
        const [start, end] = offsets([h.start, h.end]);
        invariant(end <= text.length, "Highlight exceeds reading text");
        highlight = { start, end };
      }
      rating = { label: r.label, note, highlight, updated_at: string(r.updated_at) };
    }
    return { id, text, origins, rating };
  });
}
function readQuestion(value: unknown): JsonObject {
  const q = object(value, "Question");
  const isEntry = (entry: unknown) => typeof entry === "string" || typeof entry === "object";
  invariant(
    Object.hasOwn(q, "instructions") && isEntry(q.instructions),
    "Missing question instructions",
  );
  if (q.type === "score")
    invariant(
      array(q.criteria).length >= 2 && array(q.criteria).every(isEntry),
      "Invalid score criteria",
    );
  else {
    const criteria = object(q.criteria, "Question criteria");
    invariant(
      Object.keys(criteria).every((key) => key.length > 0) &&
        Object.values(criteria).every(isEntry),
      "Invalid question criteria",
    );
    if (q.type === "noul")
      invariant(
        Object.keys(criteria).length === 2 &&
          Object.hasOwn(criteria, "true") &&
          Object.hasOwn(criteria, "false"),
        "Invalid noul criteria",
      );
    else
      invariant(
        q.type === "choice" && Object.keys(criteria).length >= 2,
        "Invalid question type or criteria",
      );
  }
  return q;
}
function readAnswer(value: unknown, question: JsonObject): JsonObject {
  const answer = object(value, "Answer");
  invariant(answer.type === question.type, "Answer type differs from question");
  if (answer.type === "noul") invariant(probability(answer.noul), "Invalid noul answer");
  else {
    invariant(probability(answer.confidence), "Invalid answer confidence");
    const keys =
      question.type === "choice"
        ? Object.keys(object(question.criteria, "Criteria"))
        : array(question.criteria).map((_, i) => String(i));
    const probabilities = object(answer.probabilities, "Answer probabilities");
    invariant(
      Object.keys(probabilities).length === keys.length &&
        keys.every((key) => probability(probabilities[key])),
      "Invalid answer probabilities",
    );
    if (answer.type === "choice")
      invariant(
        typeof answer.choice === "string" && keys.includes(answer.choice),
        "Invalid choice answer",
      );
    else
      invariant(
        typeof answer.score === "number" &&
          Number.isFinite(answer.score) &&
          answer.score >= 0 &&
          answer.score <= keys.length - 1,
        "Invalid score answer",
      );
  }
  return answer;
}
function readAudit(auditValue: unknown): ParsedAudit {
  const audit = object(auditValue, "Audit");
  invariant(audit.schema_version === "1.0", "Unsupported audit version");
  const model = string(audit.model);
  invariant(model.length > 0, "Missing audit model");
  const document = object(audit.document, "Audit document");
  const source = string(document.text);
  const units: Unit[] = [];
  const seen = new Set<string>();
  for (const section of array(document.sections)) {
    for (const paragraphValue of array(object(section, "Section").paragraphs)) {
      const paragraph = object(paragraphValue, "Paragraph");
      const [start, end] = offsets([paragraph.start, paragraph.end]);
      const text = string(paragraph.text);
      invariant(
        end <= source.length && source.slice(start, end) === text,
        "Audit paragraph span is inconsistent",
      );
      for (const value of array(paragraph.sentences)) {
        const sentence = object(value, "Sentence");
        const [from, to] = offsets([sentence.start, sentence.end]);
        const id = string(sentence.id);
        const sentenceText = string(sentence.text);
        invariant(
          from >= start &&
            to <= end &&
            source.slice(from, to) === sentenceText &&
            !seen.has(id) &&
            !units.some((u) => u.start === from && u.end === to),
          "Invalid or ambiguous audit sentence span",
        );
        seen.add(id);
        units.push({
          id,
          start: from,
          end: to,
          text: sentenceText,
          paragraph: { start, text },
          previous: "",
          next: "",
        });
      }
    }
  }
  units.forEach((unit, index) => {
    unit.previous = units[index - 1]?.text ?? "";
    unit.next = units[index + 1]?.text ?? "";
  });
  const predictions = new Map<string, Prediction[]>();
  const questions = new Map<string, Prediction>();
  const answers = array(audit.answers).map((a) => object(a, "Audit answer"));
  const consumed = new Set<JsonObject>();
  for (const recordValue of array(audit.requests)) {
    const record = object(recordValue, "Audit request");
    invariant(
      typeof record.pass === "string" && [...PASSES, "document", "paragraph"].includes(record.pass),
      "Invalid audit request pass",
    );
    if (!PASSES.includes(record.pass)) continue;
    const unit = units.find((u) => u.id === record.unit_id);
    invariant(
      unit && canonical(record.offsets) === canonical([unit.start, unit.end]),
      "Audit request has no matching sentence",
    );
    const request = object(record.request, "Request payload");
    invariant(request.model === model, "Request model differs from audit model");
    const state = object(request.state, "Request state");
    // Validate the actual hosted context against the saved document, without reparsing it.
    const target = object(
      record.pass === "sentence-a" ? state.focus : state.target,
      "Sentence target",
    );
    invariant(target.text === unit.text, "Request target differs from sentence");
    if (record.pass === "sentence-c") {
      const context = [
        unit.previous ? `Previous: ${unit.previous}` : "",
        unit.next ? `Next: ${unit.next}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      invariant(target.context === context, "Request neighbor context differs from document");
    } else {
      const context =
        record.pass === "sentence-a" ? state : object(state.context, "Sentence context");
      invariant(
        (record.pass === "sentence-a" ? target.paragraph : context.paragraph) ===
          unit.paragraph.text,
        "Request paragraph context differs from document",
      );
      const neighbors = object(context.neighbors, "Neighbors");
      invariant(
        neighbors.previous === unit.previous && neighbors.next === unit.next,
        "Request neighbor context differs from document",
      );
    }
    const error = record.error === null ? null : object(record.error, "Request error");
    if (error)
      invariant(
        ["api", "validation", "transport"].includes(string(error.kind)),
        "Invalid request failure",
      );
    const response = error ? null : object(record.response, "Response");
    if (response) invariant(response.model === model, "Response model differs from audit model");
    const responseAnswers = response ? object(response.answers, "Response answers") : null;
    const requested = object(request.questions, "Request questions");
    if (responseAnswers)
      invariant(
        Object.keys(responseAnswers).length === Object.keys(requested).length,
        "Unexpected answer count",
      );
    const rows = predictions.get(unit.id) ?? [];
    for (const [question_id, value] of Object.entries(requested)) {
      const question = readQuestion(value);
      const definition_hash = comparisonHash(question);
      invariant(
        !rows.some((p) => p.pass === record.pass && p.question_id === question_id),
        "Ambiguous duplicate sentence prediction",
      );
      const answer = responseAnswers ? readAnswer(responseAnswers[question_id], question) : null;
      const matching = answers.filter(
        (a) => a.kind === "sentence" && a.unit_id === unit.id && a.question_id === question_id,
      );
      invariant(matching.length === 1, "Missing or ambiguous audit answer association");
      const stored = matching[0];
      invariant(
        stored &&
          canonical(stored.offsets) === canonical([unit.start, unit.end]) &&
          canonical(stored.answer) === canonical(answer) &&
          canonical(stored.error) === canonical(error),
        "Audit answer differs from saved request result",
      );
      consumed.add(stored);
      const prediction = {
        pass: record.pass,
        question_id,
        question,
        definition_hash,
        answer,
        error,
      };
      rows.push(prediction);
      questions.set(`${record.pass}:${question_id}:${definition_hash}`, prediction);
    }
    predictions.set(unit.id, rows);
  }
  invariant(
    answers.every((a) => a.kind !== "sentence" || consumed.has(a)),
    "Orphaned sentence answer",
  );
  return { model, units, predictions, questions: [...questions.values()] };
}

export function compareRatings(exportValue: unknown, inputs: AuditInput[]) {
  invariant(
    object(object(exportValue, "Ratings export").dataset, "Export dataset").unit !== "excerpt",
    "Sentence audit matching cannot compare excerpt ratings",
  );
  const cards = readRatingsExport(exportValue);
  const identities = new Set<string>();
  const audits = inputs.map((input) => {
    const key = canonical([input.origin_file, input.audit_id]);
    invariant(!identities.has(key), "Duplicate audit mapping");
    identities.add(key);
    return { ...input, parsed: readAudit(input.value) };
  });
  const categories = LABELS.map((label) => ({
    label,
    rated_cards: cards.filter((card) => card.rating?.label === label).length,
  }));
  const groups = new Map<
    string,
    {
      audit_id: string;
      model: string;
      pass: string;
      question_id: string;
      definition_hash: string;
      question: JsonObject;
      categories: {
        label: Label;
        valid: number;
        failed: number;
        missing: number;
        noul_values: number[];
      }[];
    }
  >();
  const rows = cards.map((card) => {
    const matches = card.origins.flatMap((origin, originIndex) =>
      audits
        .filter((a) => a.origin_file === origin.file)
        .map((audit) => {
          const unit = audit.parsed.units.find(
            (u) => u.start === origin.offsets[0] && u.end === origin.offsets[1],
          );
          invariant(
            unit && unit.text === origin.raw_text,
            "Mapped audit does not match frozen origin offsets/text",
          );
          invariant(
            unit.paragraph.text === origin.paragraph &&
              readingText(unit.paragraph.text.slice(0, unit.start - unit.paragraph.start)) ===
                origin.before &&
              readingText(unit.paragraph.text.slice(unit.end - unit.paragraph.start)) ===
                origin.after,
            "Mapped audit does not match frozen origin context",
          );
          const predictions = audit.parsed.predictions.get(unit.id) ?? [];
          const missing = audit.parsed.questions.filter(
            (q) =>
              !predictions.some(
                (p) =>
                  p.pass === q.pass &&
                  p.question_id === q.question_id &&
                  p.definition_hash === q.definition_hash,
              ),
          );
          if (originIndex === 0 && card.rating) {
            for (const expected of audit.parsed.questions) {
              const key = canonical([
                audit.audit_id,
                audit.parsed.model,
                expected.pass,
                expected.question_id,
                expected.definition_hash,
              ]);
              const group = groups.get(key) ?? {
                audit_id: audit.audit_id,
                model: audit.parsed.model,
                pass: expected.pass,
                question_id: expected.question_id,
                definition_hash: expected.definition_hash,
                question: expected.question,
                categories: LABELS.map((label) => ({
                  label,
                  valid: 0,
                  failed: 0,
                  missing: 0,
                  noul_values: [],
                })),
              };
              const category = group.categories.find((c) => c.label === card.rating?.label);
              invariant(category, "Missing reader category");
              const prediction = predictions.find(
                (p) =>
                  p.pass === expected.pass &&
                  p.question_id === expected.question_id &&
                  p.definition_hash === expected.definition_hash,
              );
              if (!prediction) category.missing += 1;
              else if (prediction.error) category.failed += 1;
              else {
                category.valid += 1;
                if (prediction.answer?.type === "noul" && probability(prediction.answer.noul))
                  category.noul_values.push(prediction.answer.noul);
              }
              groups.set(key, group);
            }
          }
          return {
            audit_id: audit.audit_id,
            model: audit.parsed.model,
            origin_index: originIndex,
            role: originIndex === 0 ? "primary" : "secondary",
            match: "verified_stored_span",
            predictions,
            missing_questions: missing.map(({ pass, question_id, definition_hash }) => ({
              pass,
              question_id,
              definition_hash,
            })),
            missing_passes: PASSES.filter((pass) => !predictions.some((p) => p.pass === pass)),
          };
        }),
    );
    return {
      ...card,
      primary_matches: matches.filter((m) => m.role === "primary"),
      secondary_matches: matches.filter((m) => m.role === "secondary"),
    };
  });
  const rated = rows.filter((row) => row.rating !== null);
  const primary = rated.flatMap((row) => row.primary_matches);
  return {
    version: 1,
    interpretation:
      "Descriptive reader-category comparison, not accuracy or AI authorship. Only primary-origin matches enter summaries. Audits may contain more context than the rating UI. Legacy spans do not establish full source-file identity.",
    inputs: {
      ratings_hash: comparisonHash(exportValue),
      audits: inputs.map((a) => ({
        origin_file: a.origin_file,
        audit_id: a.audit_id,
        hash: comparisonHash(a.value),
      })),
    },
    coverage: {
      cards: cards.length,
      rated_cards: rated.length,
      primary_matched_rated_cards: rated.filter((r) => r.primary_matches.length > 0).length,
      secondary_only_rated_cards: rated.filter(
        (r) => r.primary_matches.length === 0 && r.secondary_matches.length > 0,
      ).length,
      unmatched_rated_cards: rated.filter(
        (r) => r.primary_matches.length === 0 && r.secondary_matches.length === 0,
      ).length,
      primary_comparisons: primary.length,
      failed_predictions: primary.flatMap((m) => m.predictions).filter((p) => p.error !== null)
        .length,
      missing_questions: primary.reduce((n, m) => n + m.missing_questions.length, 0),
      missing_passes: primary.reduce((n, m) => n + m.missing_passes.length, 0),
    },
    categories,
    groups: [...groups.values()].map((g) => ({
      ...g,
      categories: g.categories.map((c) => ({
        ...c,
        noul_mean: c.noul_values.length
          ? c.noul_values.reduce((sum, n) => sum + n, 0) / c.noul_values.length
          : null,
      })),
    })),
    rows,
  };
}
