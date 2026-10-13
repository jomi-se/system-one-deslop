import { readFile, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  auditDocument,
  auditMetadata,
  auditPasses,
  buildAuditPlan,
  renderAuditReport,
} from "../src/audit.js";
import type { AuditMetadata } from "../src/audit.js";
import { parseMarkdown } from "../src/parse.js";
import { invariant, loadRegistry, ValidationError } from "../src/registry.js";

try {
  const args = process.argv.slice(2);
  const input = args.shift();
  invariant(
    input && !input.startsWith("--"),
    "Usage: npm run audit -- FILE.md [--audience TEXT] [--purpose TEXT] [--genre TEXT] [--passes LIST] [--json OUT.json]",
  );
  const metadata: Partial<AuditMetadata> = {};
  let output: string | undefined;
  let passOption: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    invariant(
      flag && ["--audience", "--purpose", "--genre", "--passes", "--json"].includes(flag),
      "Unknown audit option",
    );
    const value = args[++index];
    invariant(value && !value.startsWith("--"), "Audit options require nonempty values");
    if (flag === "--json") output = resolve(value);
    else if (flag === "--passes") passOption = value;
    else if (flag === "--audience") metadata.audience = value;
    else if (flag === "--purpose") metadata.purpose = value;
    else metadata.genre = value;
  }
  const source = await readFile(input, "utf8");
  const document = parseMarkdown(source);
  const registry = await loadRegistry();
  const context = auditMetadata(metadata);
  const passes = auditPasses(passOption);
  const plan = buildAuditPlan(document, context, registry, passes);
  // Exclusive creation prevents overwriting the source, an existing artifact, or a symlink.
  if (output) await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  const file = output ? await open(output, "wx", 0o600) : null;
  try {
    console.log(`Auditing ${input}: ${plan.length} requests planned; source will not be modified.`);
    const result = await auditDocument(document, context, registry, undefined, passes);
    if (file) await file.writeFile(`${JSON.stringify(result, null, 2)}\n`);
    console.log(renderAuditReport(result));
    if (result.requests.some((request) => request.error)) process.exitCode = 1;
  } finally {
    await file?.close();
  }
} catch (error: unknown) {
  console.error(
    error instanceof ValidationError
      ? error.message
      : "Audit failed; check the input, API key, and output path (output must not already exist).",
  );
  process.exitCode = 1;
}
