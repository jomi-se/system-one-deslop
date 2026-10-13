import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { EntryType, JsonValue, Question } from "@typesafe-ai/sdk";

export type Source = "a" | "b";
export interface RegisteredQuestion {
  id: string;
  source: Source;
  type: Question["type"];
  question: Question;
}
export interface EvalCase {
  case_id: string;
  question_id: string;
  state: { [key: string]: JsonValue };
  expected: string;
  note?: string;
}
export interface Registry {
  questions: Map<string, RegisteredQuestion>;
  cases: EvalCase[];
}

export class ValidationError extends Error {}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function object(value: unknown, context: string): Record<string, unknown> {
  invariant(isObject(value), `${context}: expected an object`);
  return value;
}

function isJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isObject(value) && Object.values(value).every(isJson);
}

function isEntry(value: unknown): value is EntryType {
  return isJson(value) && typeof value !== "number" && typeof value !== "boolean";
}

function exactKeys(value: Record<string, unknown>, allowed: string[], context: string): void {
  invariant(
    Object.keys(value).every((key) => allowed.includes(key)),
    `${context}: unexpected field`,
  );
}

function assertQuestion(value: unknown, context: string): asserts value is Question {
  const q = object(value, context);
  exactKeys(q, ["type", "instructions", "criteria"], context);
  invariant(isEntry(q.instructions), `${context}: invalid or missing instructions`);
  if (q.type === "noul") {
    const criteria = object(q.criteria, `${context}.criteria`);
    exactKeys(criteria, ["true", "false"], `${context}.criteria`);
    invariant(
      isEntry(criteria.true) && isEntry(criteria.false),
      `${context}: invalid noul criteria`,
    );
  } else if (q.type === "score") {
    invariant(
      Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.every(isEntry),
      `${context}: score requires at least two valid levels`,
    );
  } else if (q.type === "choice") {
    const criteria = object(q.criteria, `${context}.criteria`);
    invariant(
      Object.keys(criteria).length >= 2 &&
        Object.keys(criteria).every((key) => key.length > 0) &&
        Object.values(criteria).every(isEntry),
      `${context}: invalid choice criteria`,
    );
  } else {
    throw new ValidationError(`${context}: unsupported question type`);
  }
}

export function validateCase(value: unknown, registry: Registry, context: string): EvalCase {
  const c = object(value, context);
  exactKeys(c, ["case_id", "question_id", "state", "expected", "note"], context);
  invariant(typeof c.case_id === "string" && c.case_id.length > 0, `${context}: invalid case_id`);
  invariant(typeof c.question_id === "string", `${context}: invalid question_id`);
  const registered = registry.questions.get(c.question_id);
  invariant(registered, `${context}: unknown question_id`);
  const state = object(c.state, `${context}.state`);
  invariant(isJson(state), `${context}: state must be a JSON object`);
  invariant(typeof c.expected === "string", `${context}: invalid expected label`);
  const q = registered.question;
  const valid =
    q.type === "noul"
      ? ["true", "false"].includes(c.expected)
      : q.type === "score"
        ? ["low", "high"].includes(c.expected)
        : Object.hasOwn(q.criteria, c.expected);
  invariant(valid, `${context}: expected label does not match the question`);
  invariant(c.note === undefined || typeof c.note === "string", `${context}: invalid note`);
  return {
    case_id: c.case_id,
    question_id: c.question_id,
    state,
    expected: c.expected,
    ...(c.note === undefined ? {} : { note: c.note }),
  };
}

export function addCases(registry: Registry, values: unknown, context: string): void {
  invariant(Array.isArray(values), `${context}: expected a case array`);
  const ids = new Set(registry.cases.map((c) => c.case_id));
  const cases = values.map((value, index) => {
    const c = validateCase(value, registry, `${context}[${index}]`);
    invariant(!ids.has(c.case_id), `${context}: duplicate case_id`);
    ids.add(c.case_id);
    return c;
  });
  registry.cases.push(...cases);
}

export function normalizeCatalogues(a: unknown, b: unknown): Registry {
  const registry: Registry = { questions: new Map(), cases: [] };
  const aQuestions = object(object(a, "A catalogue").questions, "A questions");
  const bQuestions = object(
    object(b, "B catalogue").question_definitions,
    "B question_definitions",
  );
  invariant(
    Object.keys(aQuestions).length > 0 && Object.keys(bQuestions).length > 0,
    "Catalogues must not be empty",
  );
  for (const [source, definitions] of [
    ["a", aQuestions],
    ["b", bQuestions],
  ] as const) {
    for (const [localId, value] of Object.entries(definitions)) {
      invariant(
        source === "a" ? /^[DPSV]\d{2}$/.test(localId) : /^[a-z][a-z0-9_]*$/.test(localId),
        `${source}: unexpected question ID`,
      );
      const id = `${source}.${localId}`;
      const definition = object(value, id);
      const question: unknown =
        source === "a"
          ? {
              type: definition.type,
              instructions: definition.instructions,
              criteria: definition.criteria,
            }
          : definition.question;
      assertQuestion(question, id);
      registry.questions.set(id, { id, source, type: question.type, question });
    }
  }
  for (const [localId, value] of Object.entries(bQuestions)) {
    const definition = object(value, `b.${localId}`);
    invariant(Array.isArray(definition.synthetic_cases), `b.${localId}: missing synthetic_cases`);
    addCases(
      registry,
      definition.synthetic_cases.map((synthetic: unknown) => {
        const c = object(synthetic, `b.${localId} synthetic case`);
        exactKeys(
          c,
          ["case_id", "state", "intended_label", "note", "label_status"],
          `b.${localId} synthetic case`,
        );
        return {
          case_id: c.case_id,
          question_id: `b.${localId}`,
          state: c.state,
          expected: c.intended_label,
          ...(c.note === undefined ? {} : { note: c.note }),
        };
      }),
      `b.${localId} synthetic_cases`,
    );
  }
  return registry;
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError(`Invalid JSON: ${path}`);
  }
}

export async function loadRegistry(root = process.cwd()): Promise<Registry> {
  const [a, b] = await Promise.all([
    readJson(join(root, "research/a-dossier/jev-questions.json")),
    readJson(join(root, "research/b-handoff/system-one-deslop-multipass-questions.json")),
  ]);
  return normalizeCatalogues(a, b);
}

export async function loadCaseFiles(registry: Registry, root = process.cwd()): Promise<void> {
  const directory = join(root, "eval/cases");
  let files: string[];
  try {
    files = await readdir(directory);
  } catch (error: unknown) {
    if (isObject(error) && error.code === "ENOENT") return;
    throw error;
  }
  for (const file of files.filter((entry) => entry.endsWith(".json")).sort()) {
    addCases(registry, await readJson(join(directory, file)), `eval/cases/${file}`);
  }
}
