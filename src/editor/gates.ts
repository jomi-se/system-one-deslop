import type { JsonValue, Questions, TypeSafeClient } from "@typesafe-ai/sdk";
import { runGroups, stateHash } from "../jev.js";
import type { RequestGroup, RequestRecord } from "../jev.js";
import { invariant } from "../registry.js";
import type { Registry } from "../registry.js";
import type { AuditMetadata } from "../audit.js";
import { guardEdits, sectionAfter } from "./edits.js";
import type { Edit, EditUnit, EditDecision } from "./edits.js";
import type { Span } from "../parse.js";

export interface GatedEdit extends EditDecision {
  accepted: boolean;
  reason: string;
  gates: {
    attempt: number;
    question_id: string;
    answer: { type: "noul"; noul: number } | null;
    error: RequestRecord["error"];
    request: RequestRecord["request"];
    usage: RequestRecord["usage"];
  }[];
}

export async function gateEdits(
  source: string,
  proposals: Edit[],
  units: EditUnit[],
  code: Span[],
  registry: Registry,
  metadata: AuditMetadata,
  client: TypeSafeClient,
) {
  const decisions: GatedEdit[] = guardEdits(source, proposals, units, code).map((decision) => ({
    ...decision,
    accepted: decision.guard.accepted,
    reason: decision.guard.reason,
    gates: [],
  }));
  const usageRecords: RequestRecord[] = [];
  for (let attempt = 1; attempt <= proposals.length + 1; attempt += 1) {
    const active = decisions.filter((decision) => decision.accepted);
    const guarded = guardEdits(
      source,
      active.map((decision) => decision.proposal),
      units,
      code,
    );
    for (let index = 0; index < active.length; index += 1) {
      const checked = guarded[index];
      const decision = active[index];
      if (decision && checked && !checked.guard.accepted) {
        decision.accepted = false;
        decision.guard = checked.guard;
        decision.reason = checked.guard.reason;
      }
    }
    const survivors = decisions.filter((decision) => decision.accepted);
    const tasks: { decision: GatedEdit; group: RequestGroup }[] = [];
    for (const decision of survivors) {
      const unit = decision.unit;
      invariant(unit, "Gate has no edit unit");
      const deletion = decision.proposal.replacement.trim() === "";
      // Only deletions need another semantic check when another edit was rejected.
      if (attempt > 1 && !deletion) continue;
      const state = {
        document: { ...metadata },
        original: { text: unit.text },
        candidate: { text: decision.proposal.replacement },
        evidence: { text: source },
        focus: { paragraph: unit.paragraph },
        constraints: {
          edit_permission:
            "Rewording, paragraph merges and heading changes are authorized. Preserve all claims, facts, qualifiers, commitments and implications. Moving source-backed content within a section is authorized; losing it is not.",
        },
      };
      function add(ids: string[], input: { [key: string]: JsonValue }): void {
        const questions: Questions = {};
        for (const id of ids) {
          const q = registry.questions.get(id);
          invariant(q, `Missing gate: ${id}`);
          questions[id] = q.question;
        }
        tasks.push({
          decision,
          group: {
            state: input,
            state_hash: stateHash(input),
            cases: [],
            questions,
            variant: "original",
          },
        });
      }
      if (!deletion) add(["a.V01", "a.V02"], state);
      else {
        if (attempt === 1) add(["a.V01"], state);
        add(["a.V02"], {
          ...state,
          original: { text: unit.section.text },
          candidate: {
            text: sectionAfter(
              source,
              unit.section,
              survivors.map((entry) => entry.proposal),
              units,
            ),
          },
        });
      }
    }
    if (!tasks.length) break;
    const records = await runGroups(
      tasks.map((task) => task.group),
      client,
      { concurrency: 2 },
    );
    usageRecords.push(...records);
    let removed = false;
    for (const record of records) {
      const task = tasks[record.index];
      invariant(task, "Gate response has no request");
      for (const id of Object.keys(record.request.questions)) {
        const answer = record.error ? null : record.response?.answers[id];
        invariant(record.error || answer?.type === "noul", "Invalid gate answer");
        const noul = answer?.type === "noul" ? answer : null;
        task.decision.gates.push({
          attempt,
          question_id: id,
          answer: noul,
          error: record.error,
          request: record.request,
          usage: record.usage,
        });
        if (record.error || !noul || noul.noul >= 0.5) {
          task.decision.accepted = false;
          task.decision.reason = record.error ? "Jev gate failed" : `${id} rejected at noul >= 0.5`;
          removed = true;
        }
      }
    }
    if (!removed) break;
  }
  // A final whole-document check catches protected-detail moves whose destination
  // failed a gate. No rejected edit is silently resurrected.
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
  return { decisions, records: usageRecords };
}
