import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invariant, object, ValidationError } from "../registry.js";
import { validateEdits } from "./edits.js";
import type { Edit } from "./edits.js";

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
        required: ["unit_id", "replacement", "reason"],
        properties: {
          unit_id: { type: "string" },
          replacement: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
};

function json(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError("Editor output is not valid JSON");
  }
}

export function parseProviderOutput(
  editor: EditorName,
  stdout: string,
): { edits: Edit[]; format: string } {
  const result = object(json(stdout.trim()), "Editor output");
  if (editor === "sol") return { edits: validateEdits(result), format: "schema-file" };
  invariant(
    result.type === "result" &&
      result.is_error !== true &&
      (result.subtype === undefined || result.subtype === "success"),
    "Claude returned a failed or unexpected result wrapper",
  );
  if (Object.hasOwn(result, "structured_output"))
    return { edits: validateEdits(result.structured_output), format: "structured_output" };
  invariant(typeof result.result === "string", "Claude result has no structured output");
  return { edits: validateEdits(json(result.result)), format: "result-json" };
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

export async function runEditor(editor: EditorName, prompt: string) {
  const directory = await mkdtemp(join(tmpdir(), "deslop-editor-"));
  const started = Date.now();
  try {
    const schema = join(directory, "schema.json");
    const output = join(directory, "output.json");
    await writeFile(schema, JSON.stringify(EDIT_SCHEMA), { mode: 0o600 });
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
              JSON.stringify(EDIT_SCHEMA),
              "--system-prompt",
              "You are a careful editor.",
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
    const parsed = parseProviderOutput(
      editor,
      editor === "opus" ? stdout : await readFile(output, "utf8"),
    );
    return { ...parsed, editor, duration_ms: Date.now() - started };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
