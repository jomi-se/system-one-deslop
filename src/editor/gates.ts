import type { Questions, TypeSafeClient } from "@typesafe-ai/sdk";
import type { Answer } from "../evaluation.js";
import { runGroups, stateHash } from "../jev.js";
import type { RequestGroup, RequestRecord } from "../jev.js";
import { invariant } from "../registry.js";
import type { Registry } from "../registry.js";
import type { AuditMetadata } from "../audit.js";
import { guardEdits, groupWindow } from "./edits.js";
import type { EditGroup, EditUnit, EditDecision } from "./edits.js";
import type { Span } from "../parse.js";

export const GATES = ["a.V01", "a.V02", "a.V04", "a.V05", "b.uncertainty_change"] as const;
export interface GatedEdit extends EditDecision {
  accepted: boolean;
  reason: string;
  gates: { question_id: string; answer: Answer | null; rejected: boolean; record: RequestRecord }[];
}

export function gateRejects(id: string, answer: Answer | null): boolean {
  if (!answer) return true;
  if (id === "a.V05" || id === "b.uncertainty_change") {
    invariant(answer.type === "choice", "Expected a choice gate answer");
    const probability = answer.probabilities[answer.choice] ?? 0;
    return id === "a.V05"
      ? answer.choice === "worse" && probability >= 0.5
      : (answer.choice === "stronger" || answer.choice === "weaker") && probability >= 0.5;
  }
  invariant(answer.type === "noul", "Expected a noul gate answer");
  return answer.noul >= 0.5;
}

export async function gateEdits(
  source: string,
  proposals: EditGroup[],
  units: EditUnit[],
  code: Span[],
  registry: Registry,
  metadata: AuditMetadata,
  client: TypeSafeClient,
  authorVoice = "as in the original",
) {
  const decisions: GatedEdit[] = guardEdits(source, proposals, units, code).map((decision) => ({
    ...decision,
    accepted: decision.guard.accepted,
    reason: decision.guard.reason,
    gates: [],
  }));
  const tasks: { decision: GatedEdit; group: RequestGroup }[] = [];
  for (const decision of decisions.filter((entry) => entry.accepted)) {
    const window = groupWindow(source, decision.proposal, units);
    const questions: Questions = {};
    for (const id of GATES) {
      const q = registry.questions.get(id);
      invariant(q, `Missing gate: ${id}`);
      if (q.source === "a") questions[id] = q.question;
    }
    const common = {
      document: { ...metadata, author_voice: authorVoice },
      original: { text: window.original },
      candidate: { text: window.revised },
      evidence: { text: source },
      constraints: {
        edit_permission:
          "Rewording and merges are authorized, preserving every fact, condition, qualifier, implication and deliberate voice. Compare the same passage before and after; unchanged neighbours provide context, not new candidate content.",
      },
    };
    function add(state: RequestGroup["state"], qs: Questions): void {
      tasks.push({
        decision,
        group: {
          state,
          state_hash: stateHash(state),
          cases: [],
          questions: qs,
          variant: "original",
        },
      });
    }
    add(common, questions);
    const uncertainty = registry.questions.get("b.uncertainty_change");
    invariant(uncertainty, "Missing uncertainty gate");
    add(
      {
        document: { ...metadata },
        original: { claim: window.original },
        revision: { claim: window.revised },
        context: {
          shared_scope:
            "The same source passage and immediate neighbours, with the group's changes applied. Compare certainty of corresponding propositions under the same conditions and caveats.",
        },
      },
      { [uncertainty.id]: uncertainty.question },
    );
  }
  const records = await runGroups(
    tasks.map((task) => task.group),
    client,
    { concurrency: 2 },
  );
  for (const record of records) {
    const task = tasks[record.index];
    invariant(task, "Gate response has no request");
    for (const id of Object.keys(record.request.questions)) {
      const answer = record.error ? null : (record.response?.answers[id] ?? null);
      const rejected = Boolean(record.error) || gateRejects(id, answer);
      task.decision.gates.push({ question_id: id, answer, rejected, record });
    }
  }
  for (const decision of decisions) {
    const rejected = decision.gates.filter((gate) => gate.rejected);
    if (rejected.length) {
      decision.accepted = false;
      decision.reason = rejected
        .map(
          (gate) => `${gate.question_id} rejected${gate.record.error ? " (request failed)" : ""}`,
        )
        .join("; ");
    }
  }
  // A rejected destination may invalidate another group's protected-token move.
  // Rechecking rejects the entire dependent group, never a subset of its units.
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
      decision.guard = checked.guard;
      decision.reason = checked.guard.reason;
    }
  }
  const rejectedByGate = Object.fromEntries(
    GATES.map((id) => [
      id,
      decisions.filter((decision) =>
        decision.gates.some((gate) => gate.question_id === id && gate.rejected),
      ).length,
    ]),
  );
  return { decisions, records, rejected_by_gate: rejectedByGate };
}
