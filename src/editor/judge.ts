import { randomInt } from "node:crypto";
import type { AuditMetadata } from "../audit.js";
import { otherEditor, runJudge } from "./providers.js";
import type { EditorName, Judgment } from "./providers.js";

export function comparisonPrompt(
  original: string,
  revised: string,
  metadata: AuditMetadata,
  revisionFirst: boolean,
) {
  const originalVersion = revisionFirst ? "B" : "A";
  const revisedVersion = revisionFirst ? "A" : "B";
  const prompt = [
    `Reader: ${metadata.audience}\nPurpose: ${metadata.purpose}\nGenre: ${metadata.genre}`,
    "Which version would the stated reader rather read? Same facts are required; prefer the one that reads like a person wrote it for them. Return A, B, or tie and explain why. The versions are anonymous; their order is randomized.",
    `VERSION A\n${revisionFirst ? revised : original}`,
    `VERSION B\n${revisionFirst ? original : revised}`,
  ].join("\n\n");
  return { prompt, original_version: originalVersion, revised_version: revisedVersion } as const;
}

export function judgmentOutcome(
  judgment: Judgment,
  revisedVersion: "A" | "B",
): "win" | "tie" | "loss" {
  return judgment.better === "tie" ? "tie" : judgment.better === revisedVersion ? "win" : "loss";
}

export async function blindComparison(
  original: string,
  revised: string,
  metadata: AuditMetadata,
  editor: EditorName,
  provider: typeof runJudge = runJudge,
) {
  const pair = comparisonPrompt(original, revised, metadata, randomInt(2) === 1);
  const judge = editor;
  const response = await provider(judge, pair.prompt);
  return {
    judge,
    reviewer: otherEditor(editor),
    judge_is_editor: true,
    bias: "The editor’s own model judges its revision; this has a known self-preference bias.",
    original_version: pair.original_version,
    revised_version: pair.revised_version,
    outcome: judgmentOutcome(response, pair.revised_version),
    response,
  };
}
