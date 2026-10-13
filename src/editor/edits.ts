import { invariant, object } from "../registry.js";
import { parseMarkdown } from "../parse.js";
import type { MarkdownDocument, Span } from "../parse.js";

export interface Edit {
  unit_id: string;
  replacement: string;
  reason: string;
}
export interface EditUnit extends Span {
  kind: "heading" | "paragraph";
  section: Span;
  paragraph: string;
}
export interface EditDecision {
  proposal: Edit;
  unit: EditUnit | null;
  guard: { accepted: boolean; reason: string };
}

export function editUnits(document: MarkdownDocument): EditUnit[] {
  let headingCount = 0;
  let paragraphCount = 0;
  return document.sections
    .flatMap((section) => {
      const sectionSpan: Span = {
        id: section.id,
        start: section.start,
        end: section.end,
        text: section.text,
      };
      const heading: EditUnit[] = section.heading
        ? [
            {
              ...section.heading,
              id: `h${++headingCount}`,
              kind: "heading",
              section: sectionSpan,
              paragraph: section.paragraphs[0]?.text ?? "",
            },
          ]
        : [];
      return [
        ...heading,
        ...section.paragraphs.map((paragraph): EditUnit => ({
          id: `p${++paragraphCount}`,
          kind: "paragraph",
          start: paragraph.start,
          end: paragraph.end,
          text: paragraph.text,
          section: sectionSpan,
          paragraph: paragraph.text,
        })),
      ];
    })
    .sort((a, b) => a.start - b.start);
}

export function validateEdits(value: unknown): Edit[] {
  const result = object(value, "Editor result");
  invariant(
    Object.keys(result).length === 1 && Array.isArray(result.edits),
    "Editor result must contain only an edits array",
  );
  return result.edits.map((entry: unknown) => {
    const edit = object(entry, "Editor edit");
    invariant(
      Object.keys(edit).length === 3 &&
        ["unit_id", "replacement", "reason"].every((key) => Object.hasOwn(edit, key)),
      "Invalid editor edit fields",
    );
    invariant(
      typeof edit.unit_id === "string" &&
        edit.unit_id.length > 0 &&
        typeof edit.replacement === "string" &&
        typeof edit.reason === "string",
      "Invalid editor edit values",
    );
    return { unit_id: edit.unit_id, replacement: edit.replacement, reason: edit.reason };
  });
}

export function applyEdits(source: string, proposals: Edit[], units: EditUnit[]): string {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const seen = new Set<string>();
  const edits = proposals
    .map((proposal) => {
      const unit = byId.get(proposal.unit_id);
      invariant(
        unit && source.slice(unit.start, unit.end) === unit.text,
        "Invalid or stale edit offsets",
      );
      invariant(!seen.has(unit.id), "Duplicate edit unit");
      seen.add(unit.id);
      return { unit, proposal };
    })
    .sort((a, b) => b.unit.start - a.unit.start);
  let boundary = source.length;
  let text = source;
  for (const { unit, proposal } of edits) {
    invariant(unit.start >= 0 && unit.end <= boundary, "Overlapping edit offsets");
    text = text.slice(0, unit.start) + proposal.replacement + text.slice(unit.end);
    boundary = unit.start;
  }
  return text;
}

export function protectedTokens(text: string): Map<string, number> {
  const tokens: string[] = [];
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}_])[-+]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?%?(?![\p{L}\p{N}_])/gu,
  ))
    tokens.push(`number:${match[0]}`);
  for (const match of text.matchAll(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g))
    tokens.push(`code:${match[0]}`);
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g))
    tokens.push(`url:${match[0].replace(/[.,;!?]+$/, "")}`);
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g)) {
    if (match[1] && !/^https?:\/\//.test(match[1])) tokens.push(`url:${match[1]}`);
  }
  const counts = new Map<string, number>();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

export function guardEdits(
  source: string,
  proposals: Edit[],
  units: EditUnit[],
  codeBlocks: Span[],
): EditDecision[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const decisions: EditDecision[] = proposals.map((proposal) => {
    const unit = byId.get(proposal.unit_id) ?? null;
    let reason = "passed";
    if (!unit) reason = "unknown unit id";
    else if (unit.text === proposal.replacement) reason = "no change";
    else if (proposals.filter((edit) => edit.unit_id === proposal.unit_id).length > 1)
      reason = "duplicate unit proposals";
    else if (codeBlocks.some((block) => unit.start < block.end && unit.end > block.start))
      reason = "code block touched";
    else if (parseMarkdown(proposal.replacement).code_blocks.length)
      reason = "replacement introduces a code block";
    return { proposal, unit, guard: { accepted: reason === "passed", reason } };
  });
  const original = protectedTokens(source);
  // Recompute after removing a loss contributor: cross-unit moves can depend on
  // another edit surviving, including after Jev rejects that destination edit.
  for (;;) {
    const active = decisions.filter((decision) => decision.guard.accepted);
    const revised = applyEdits(
      source,
      active.map((decision) => decision.proposal),
      units,
    );
    const remaining = protectedTokens(revised);
    const missing = [...original]
      .filter(([token, count]) => (remaining.get(token) ?? 0) < count)
      .map(([token]) => token);
    if (!missing.length) break;
    let rejected = false;
    for (const decision of active) {
      if (!decision.unit) continue;
      const before = protectedTokens(decision.unit.text);
      const after = protectedTokens(decision.proposal.replacement);
      if (missing.some((token) => (before.get(token) ?? 0) > (after.get(token) ?? 0))) {
        decision.guard = {
          accepted: false,
          reason: "protected number, inline code, or URL would be lost",
        };
        rejected = true;
      }
    }
    invariant(rejected, "Protected content loss cannot be attributed to an edit");
  }
  return decisions;
}

export function sectionAfter(
  source: string,
  section: Span,
  proposals: Edit[],
  units: EditUnit[],
): string {
  const within = units.filter((unit) => unit.start >= section.start && unit.end <= section.end);
  const localUnits = within.map((unit) => ({
    ...unit,
    start: unit.start - section.start,
    end: unit.end - section.start,
  }));
  return applyEdits(
    source.slice(section.start, section.end),
    proposals.filter((edit) => within.some((unit) => unit.id === edit.unit_id)),
    localUnits,
  );
}
