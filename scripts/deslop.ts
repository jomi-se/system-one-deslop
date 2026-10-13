import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { auditMetadata } from "../src/audit.js";
import type { AuditMetadata } from "../src/audit.js";
import { deslop } from "../src/editor/loop.js";
import type { EditorName } from "../src/editor/providers.js";
import { invariant, loadRegistry, ValidationError } from "../src/registry.js";

let output: string | undefined;
let created = false;
try {
  const args = process.argv.slice(2);
  const input = args.shift();
  invariant(
    input && !input.startsWith("--"),
    "Usage: npm run deslop -- FILE.md --editor opus|sol [--rounds N] --out NEW_DIR",
  );
  let editor: EditorName | undefined;
  let rounds = 2;
  const metadata: Partial<AuditMetadata> = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index],
      value = args[++index];
    invariant(value && !value.startsWith("--"), "Deslop options require values");
    if (flag === "--editor") {
      invariant(value === "opus" || value === "sol", "Editor must be opus or sol");
      editor = value;
    } else if (flag === "--out") output = resolve(value);
    else if (flag === "--rounds") {
      rounds = Number(value);
      invariant(
        Number.isSafeInteger(rounds) && rounds >= 1 && rounds <= 10,
        "Rounds must be between 1 and 10",
      );
    } else if (flag === "--audience") metadata.audience = value;
    else if (flag === "--purpose") metadata.purpose = value;
    else if (flag === "--genre") metadata.genre = value;
    else throw new ValidationError("Unknown deslop option");
  }
  invariant(editor && output, "--editor and --out are required");
  const source = await readFile(input, "utf8");
  const registry = await loadRegistry();
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await mkdir(output, { mode: 0o700 });
  created = true;
  const summary = await deslop(
    source,
    editor,
    auditMetadata(metadata),
    rounds,
    output,
    registry,
    (message) => console.log(message),
  );
  console.log(
    `Done: ${summary.accepted} edits accepted, ${summary.rejected} rejected; ${summary.words_before} → ${summary.words_after} prose words. Output: ${output}`,
  );
} catch (error: unknown) {
  const message =
    error instanceof ValidationError
      ? error.message
      : "Deslop failed; check inputs, subscriptions, and output permissions.";
  if (created && output)
    await writeFile(join(output, "failure.json"), JSON.stringify({ error: message }) + "\n", {
      mode: 0o600,
    });
  console.error(message);
  process.exitCode = 1;
}
