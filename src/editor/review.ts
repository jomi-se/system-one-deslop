import type { AuditMetadata } from "../audit.js";
import { invariant } from "../registry.js";
import type { Span } from "../parse.js";
import { guardEdits } from "./edits.js";
import type { EditUnit } from "./edits.js";
import type { GatedEdit } from "./gates.js";
import { otherEditor, runReviewer } from "./providers.js";
import type { EditorName } from "./providers.js";

export const REVIEWER_PROMPT =
  "You review proposed edits for the reader below. Accept an edit only if the reader would rather read the new version: it says the same things, keeps the author's voice, and reads more like a person who knows the reader wrote it. Reject edits that drop a claim, a condition or a voice-carrying line, or that only shuffle words. The automated flags are hints from a small model and are often wrong about deletions of repeated points; use your own reading.";

export function reviewInput(metadata: AuditMetadata, decisions: GatedEdit[]) {
  return {
    reader: metadata.audience,
    purpose: metadata.purpose,
    genre: metadata.genre,
    groups: decisions
      .filter((decision) => decision.accepted)
      .map((decision) => {
        invariant(decision.window, "Review group has no matched window");
        const flags = [
          ["a.V02", "meaning-change"],
          ["a.V04", "voice-erased"],
        ].map(([id, label]) => {
          const answer = decision.gates.find((gate) => gate.question_id === id)?.answer;
          return `Jev: ${label} probability ${answer?.type === "noul" ? answer.noul.toFixed(2) : "unavailable"}`;
        });
        return {
          group_id: decision.group_id,
          original: decision.window.original,
          revised: decision.window.revised,
          reason: decision.proposal.reason,
          advisory_flags: flags,
        };
      }),
  };
}

export async function reviewEdits(
  source: string,
  decisions: GatedEdit[],
  units: EditUnit[],
  code: Span[],
  metadata: AuditMetadata,
  editor: EditorName,
  provider: typeof runReviewer = runReviewer,
) {
  const input = reviewInput(metadata, decisions);
  const prompt = REVIEWER_PROMPT + "\n\n" + JSON.stringify(input, null, 2);
  const reviewer = otherEditor(editor);
  // Exactly one batched review per document round, including an empty group list.
  const response = await provider(reviewer, prompt);
  const expected = new Set(input.groups.map((group) => group.group_id));
  const seen = new Set<string>();
  invariant(response.decisions.length === expected.size, "Reviewer omitted or added groups");
  for (const result of response.decisions) {
    invariant(
      expected.has(result.group_id) && !seen.has(result.group_id),
      "Reviewer returned unknown or duplicate group ids",
    );
    seen.add(result.group_id);
  }
  for (const decision of decisions.filter((entry) => entry.accepted)) {
    const result = response.decisions.find((entry) => entry.group_id === decision.group_id);
    invariant(result, "Missing reviewer decision");
    decision.review = { verdict: result.verdict, reason: result.reason };
    if (result.verdict === "reject") {
      decision.accepted = false;
      decision.stage = "reviewer";
      decision.reason = result.reason;
    } else decision.reason = result.reason;
  }
  const active = decisions.filter((decision) => decision.accepted);
  const final = guardEdits(
    source,
    active.map((decision) => decision.proposal),
    units,
    code,
  );
  for (let index = 0; index < active.length; index += 1) {
    const decision = active[index],
      checked = final[index];
    if (decision && checked && !checked.guard.accepted) {
      decision.accepted = false;
      decision.stage = "final-guard";
      decision.guard = checked.guard;
      decision.reason = checked.guard.reason;
    }
  }
  return { reviewer, input, prompt, response };
}
