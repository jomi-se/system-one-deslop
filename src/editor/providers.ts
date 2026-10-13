import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invariant, object, ValidationError } from "../registry.js";
import { validateEdits } from "./edits.js";
import type { EditGroup } from "./edits.js";

export type EditorName = "opus" | "sol";
export const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edits"],
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["unit_ids", "replacements", "reason"],
        properties: {
          unit_ids: { type: "array", items: { type: "string" } },
          replacements: {
            type: "object",
            properties: {},
            required: [],
            additionalProperties: { type: "string" },
          },
          reason: { type: "string" },
        },
      },
    },
  },
};
export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["better", "reason"],
  properties: { better: { type: "string", enum: ["A", "B", "tie"] }, reason: { type: "string" } },
};
export interface Judgment {
  better: "A" | "B" | "tie";
  reason: string;
}

export function validateJudgment(value: unknown): Judgment {
  const result = object(value, "Judge result");
  invariant(
    Object.keys(result).length === 2 &&
      (result.better === "A" || result.better === "B" || result.better === "tie") &&
      typeof result.reason === "string",
    "Invalid judge result",
  );
  return { better: result.better, reason: result.reason };
}

function json(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError("Editor output is not valid JSON");
  }
}

function parseResult(editor: EditorName, stdout: string): { value: unknown; format: string } {
  const result = object(json(stdout.trim()), "Provider output");
  if (editor === "sol") return { value: result, format: "schema-file" };
  invariant(
    result.type === "result" &&
      result.is_error !== true &&
      (result.subtype === undefined || result.subtype === "success"),
    "Claude returned a failed or unexpected result wrapper",
  );
  if (Object.hasOwn(result, "structured_output"))
    return { value: result.structured_output, format: "structured_output" };
  invariant(typeof result.result === "string", "Claude result has no structured output");
  return { value: json(result.result), format: "result-json" };
}
export function parseProviderOutput(
  editor: EditorName,
  stdout: string,
): { edits: EditGroup[]; format: string } {
  const parsed = parseResult(editor, stdout);
  return { edits: validateEdits(parsed.value), format: parsed.format };
}
export function parseJudgeOutput(
  editor: EditorName,
  stdout: string,
): Judgment & { format: string } {
  const parsed = parseResult(editor, stdout);
  return { ...validateJudgment(parsed.value), format: parsed.format };
}

export function editorEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of [
    "TYPESAFE_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
  ])
    delete env[key];
  return env;
}

async function command(
  binary: string,
  args: string[],
  prompt: string,
  cwd: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd,
      env: editorEnvironment(),
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let bytes = 0;
    let failure: string | null = null;
    let hardKill: ReturnType<typeof setTimeout> | undefined;
    function kill(signal: NodeJS.Signals): void {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        /* Process may already have exited. */
      }
    }
    function abort(reason: string): void {
      if (failure) return;
      failure = reason;
      kill("SIGTERM");
      hardKill = setTimeout(() => kill("SIGKILL"), 5_000);
    }
    const timeout = setTimeout(() => abort("Editor exceeded the 15-minute deadline"), 15 * 60_000);
    const interrupt = () => abort("Editor interrupted");
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", interrupt);
    function cleanup(): void {
      clearTimeout(timeout);
      if (hardKill) clearTimeout(hardKill);
      process.removeListener("SIGINT", interrupt);
      process.removeListener("SIGTERM", interrupt);
    }
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > 4 * 1024 * 1024) abort("Editor output exceeded its size limit");
      else output += chunk;
    });
    // Drain diagnostics without retaining auth data, prompts, or arbitrary tool output.
    child.stderr.on("data", () => {});
    child.stdin.on("error", () => {});
    child.on("error", () => {
      cleanup();
      reject(new ValidationError("Editor CLI could not start"));
    });
    child.on("close", (code) => {
      cleanup();
      if (failure || code !== 0)
        reject(new ValidationError(failure ?? `Editor CLI exited with code ${code}`));
      else resolve(output);
    });
    child.stdin.end(prompt);
  });
}

async function runProvider(
  editor: EditorName,
  prompt: string,
  outputSchema: object,
  systemPrompt: string,
) {
  const directory = await mkdtemp(join(tmpdir(), "deslop-editor-"));
  const started = Date.now();
  try {
    const schema = join(directory, "schema.json");
    const output = join(directory, "output.json");
    await writeFile(schema, JSON.stringify(outputSchema), { mode: 0o600 });
    const stdout =
      editor === "opus"
        ? await command(
            "claude",
            [
              "-p",
              "--safe-mode",
              "--model",
              "opus",
              "--tools",
              "",
              "--no-session-persistence",
              "--output-format",
              "json",
              "--json-schema",
              JSON.stringify(outputSchema),
              "--system-prompt",
              systemPrompt,
            ],
            prompt,
            directory,
          )
        : await command(
            "codex",
            [
              "exec",
              "-m",
              "gpt-6.1-sol",
              "--sandbox",
              "read-only",
              "--skip-git-repo-check",
              "--ephemeral",
              "--output-schema",
              schema,
              "-o",
              output,
              "-",
            ],
            prompt,
            directory,
          );
    const parsed = parseResult(editor, editor === "opus" ? stdout : await readFile(output, "utf8"));
    return { ...parsed, editor, duration_ms: Date.now() - started };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runEditor(editor: EditorName, prompt: string) {
  const response = await runProvider(
    editor,
    prompt + "\n\nOUTPUT SCHEMA\n" + JSON.stringify(EDIT_SCHEMA),
    EDIT_SCHEMA,
    "You are a careful editor.",
  );
  return {
    edits: validateEdits(response.value),
    editor,
    format: response.format,
    duration_ms: response.duration_ms,
  };
}
export async function runJudge(editor: EditorName, prompt: string) {
  const response = await runProvider(
    editor,
    prompt + "\n\nOUTPUT SCHEMA\n" + JSON.stringify(JUDGE_SCHEMA),
    JUDGE_SCHEMA,
    "You are a careful reader judging two anonymous versions.",
  );
  return {
    ...validateJudgment(response.value),
    editor,
    format: response.format,
    duration_ms: response.duration_ms,
  };
}
