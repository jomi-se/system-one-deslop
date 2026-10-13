import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { APIError, TypeSafeClient } from "@typesafe-ai/sdk";
import type {
  Fetch,
  JsonValue,
  Questions,
  SystemOneRequestPayload,
  SystemOneResult,
  Usage,
} from "@typesafe-ai/sdk";
import { invariant, object, ValidationError } from "./registry.js";
import type { EvalCase, Registry } from "./registry.js";

export const MODEL = "jev-1.13.0";
export const INPUT_USD_PER_MILLION = 0.042;
export type JevResponse = SystemOneResult<Questions>;
export interface RequestGroup {
  state_hash: string;
  state: EvalCase["state"];
  cases: EvalCase[];
  questions: Questions;
  variant: "original" | "reversed";
}
export interface RequestRecord {
  index: number;
  state_hash: string;
  variant: RequestGroup["variant"];
  case_ids: string[];
  request: SystemOneRequestPayload;
  response: JevResponse | null;
  usage: Usage | null;
  started_at: string;
  duration_ms: number;
  error: { kind: "api" | "validation" | "transport"; status?: number } | null;
}

function stableJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const entry = value[key];
        invariant(entry !== undefined, "State contains undefined");
        return `${JSON.stringify(key)}:${stableJson(entry)}`;
      })
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stateHash(state: EvalCase["state"]): string {
  return createHash("sha256").update(stableJson(state)).digest("hex");
}

export function groupCases(
  cases: EvalCase[],
  registry: Registry,
  repeatOrder = false,
): RequestGroup[] {
  const grouped = new Map<string, RequestGroup>();
  for (const c of cases) {
    const hash = stateHash(c.state);
    let group = grouped.get(hash);
    if (!group) {
      group = { state_hash: hash, state: c.state, cases: [], questions: {}, variant: "original" };
      grouped.set(hash, group);
    }
    const registered = registry.questions.get(c.question_id);
    invariant(registered, `Unknown question: ${c.question_id}`);
    invariant(
      !group.cases.some(
        (other) => other.question_id === c.question_id && other.expected !== c.expected,
      ),
      `Conflicting labels for identical state and question: ${c.question_id}`,
    );
    group.cases.push(c);
    group.questions[c.question_id] = registered.question;
  }
  const originals = [...grouped.values()];
  if (!repeatOrder) return originals;
  const reversed: RequestGroup[] = [];
  for (const group of originals) {
    const questions: Questions = {};
    for (const [id, q] of Object.entries(group.questions)) {
      if (q.type === "choice") {
        questions[id] = {
          ...q,
          criteria: Object.fromEntries(Object.entries(q.criteria).reverse()),
        };
      }
    }
    if (Object.keys(questions).length > 0) {
      reversed.push({
        ...group,
        variant: "reversed",
        questions,
        cases: group.cases.filter((c) => Object.hasOwn(questions, c.question_id)),
      });
    }
  }
  return [...originals, ...reversed];
}

function probability(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readUsage(value: unknown): Usage {
  const usage = object(value, "Response usage");
  invariant(
    typeof usage.input_tokens === "number" &&
      Number.isSafeInteger(usage.input_tokens) &&
      usage.input_tokens >= 0 &&
      typeof usage.output_tokens === "number" &&
      Number.isSafeInteger(usage.output_tokens) &&
      usage.output_tokens >= 0,
    "Invalid response token usage",
  );
  return { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens };
}

export function validateResponse(
  value: unknown,
  questions: Questions,
): asserts value is JevResponse {
  const response = object(value, "Response");
  invariant(response.model === MODEL, "Response model does not match the pinned model");
  readUsage(response.usage);
  const answers = object(response.answers, "Response answers");
  invariant(
    Object.keys(answers).length === Object.keys(questions).length,
    "Unexpected answer count",
  );
  for (const [id, question] of Object.entries(questions)) {
    const answer = object(answers[id], `${id} answer`);
    invariant(answer.type === question.type, `${id}: answer type mismatch`);
    if (question.type === "noul") {
      invariant(probability(answer.noul), `${id}: invalid noul probability`);
    } else {
      invariant(probability(answer.confidence), `${id}: invalid confidence`);
      const keys =
        question.type === "choice"
          ? Object.keys(question.criteria)
          : question.criteria.map((_, index) => String(index));
      const probabilities = object(answer.probabilities, `${id} probabilities`);
      invariant(
        Object.keys(probabilities).length === keys.length &&
          keys.every((key) => probability(probabilities[key])),
        `${id}: invalid probability map`,
      );
      if (question.type === "choice") {
        invariant(
          typeof answer.choice === "string" && Object.hasOwn(question.criteria, answer.choice),
          `${id}: unknown choice label`,
        );
      } else {
        invariant(
          typeof answer.score === "number" &&
            Number.isFinite(answer.score) &&
            answer.score >= 0 &&
            answer.score <= question.criteria.length - 1,
          `${id}: invalid score`,
        );
      }
    }
  }
}

export function createJevClient(options: { apiKey?: string; fetch?: Fetch } = {}): TypeSafeClient {
  return new TypeSafeClient({
    ...options,
    baseURL: "https://api.typesafe.ai",
    defaultModel: MODEL,
    logLevel: "off",
    timeout: 15_000,
    // SDK backoff covers both rate limits and temporary overload. Never retry indefinitely.
    retry: { maxRetries: 3, httpStatuses: new Set([429, 529]), maxRetryAfterMs: 5_000 },
  });
}

export async function runGroups(
  groups: RequestGroup[],
  client: TypeSafeClient,
  options: { concurrency?: number; onRecord?: (record: RequestRecord) => void } = {},
): Promise<RequestRecord[]> {
  const concurrency = options.concurrency ?? 8;
  invariant(
    Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 8,
    "Concurrency must be an integer between 1 and 8",
  );
  const records: RequestRecord[] = [];
  let next = 0;
  async function worker(): Promise<void> {
    while (next < groups.length) {
      const index = next++;
      const group = groups[index];
      invariant(group, "Missing request group");
      const request = { model: MODEL, state: group.state, questions: group.questions };
      const started_at = new Date().toISOString();
      const start = performance.now();
      let response: JevResponse | null = null;
      let usage: Usage | null = null;
      let error: RequestRecord["error"] = null;
      try {
        response = await client.systemOne(request, { signal: AbortSignal.timeout(60_000) });
        usage = readUsage(object(response, "Response").usage);
        validateResponse(response, group.questions);
      } catch (cause: unknown) {
        // Raw SDK errors may contain credentials or private service bodies.
        error =
          cause instanceof APIError
            ? { kind: "api", status: cause.status }
            : { kind: cause instanceof ValidationError ? "validation" : "transport" };
      }
      const record: RequestRecord = {
        index,
        state_hash: group.state_hash,
        variant: group.variant,
        case_ids: group.cases.map((c) => c.case_id),
        request,
        response,
        usage,
        started_at,
        duration_ms: performance.now() - start,
        error,
      };
      options.onRecord?.(record);
      records.push(record);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, groups.length) }, worker));
  return records.sort((a, b) => a.index - b.index);
}

export function tokenTotals(records: RequestRecord[]): Usage & { estimated_usd: number } {
  const usage = records.reduce(
    (total, record) => ({
      input_tokens: total.input_tokens + (record.usage?.input_tokens ?? 0),
      output_tokens: total.output_tokens + (record.usage?.output_tokens ?? 0),
    }),
    { input_tokens: 0, output_tokens: 0 },
  );
  return { ...usage, estimated_usd: (usage.input_tokens / 1_000_000) * INPUT_USD_PER_MILLION };
}
