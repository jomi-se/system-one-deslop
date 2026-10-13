import { invariant, object } from "../registry.js";
import { parseMarkdown } from "../parse.js";
import type { MarkdownDocument, Span } from "../parse.js";

export interface EditGroup {
  unit_ids: string[];
  replacements: Record<string, string>;
  reason: string;
}
export interface EditUnit extends Span {
  kind: "heading" | "paragraph";
  list_item: boolean;
  section: Span;
  paragraph: string;
}
export interface EditDecision {
  proposal: EditGroup;
  units: EditUnit[];
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
              list_item: false,
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
          list_item: paragraph.list_item,
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

export function validateEdits(value: unknown): EditGroup[] {
  const result = object(value, "Editor result");
  invariant(
    Object.keys(result).length === 1 && Array.isArray(result.edits),
    "Editor result must contain only an edits array",
  );
  return result.edits.map((entry: unknown) => {
    const group = object(entry, "Edit group");
    invariant(
      Object.keys(group).length === 3 &&
        ["unit_ids", "replacements", "reason"].every((key) => Object.hasOwn(group, key)),
      "Invalid edit group fields",
    );
    invariant(
      Array.isArray(group.unit_ids) &&
        group.unit_ids.length > 0 &&
        group.unit_ids.every((id: unknown) => typeof id === "string" && id.length > 0) &&
        typeof group.reason === "string",
      "Invalid edit group values",
    );
    const ids = group.unit_ids.map((id: unknown) => {
      invariant(typeof id === "string" && id.length > 0, "Invalid group unit id");
      return id;
    });
    invariant(new Set(ids).size === ids.length, "Duplicate unit ids in edit group");
    const replacements = object(group.replacements, "Group replacements");
    invariant(
      Object.keys(replacements).length === ids.length &&
        ids.every((id) => Object.hasOwn(replacements, id) && typeof replacements[id] === "string"),
      "Replacements must match group unit ids exactly",
    );
    return {
      unit_ids: ids,
      replacements: Object.fromEntries(
        ids.map((id) => {
          const replacement = replacements[id];
          invariant(typeof replacement === "string", "Invalid replacement text");
          return [id, replacement];
        }),
      ),
      reason: group.reason,
    };
  });
}

export function collapseBlankLines(source: string): string {
  const blocks = parseMarkdown(source).code_blocks;
  const collapse = (text: string) =>
    text.replace(/(?:\r\n|\n|\r){3,}/g, (run) =>
      (run.startsWith("\r\n") ? "\r\n" : (run[0] ?? "\n")).repeat(2),
    );
  let cursor = 0;
  const pieces: string[] = [];
  for (const block of blocks) {
    pieces.push(collapse(source.slice(cursor, block.start)), block.text);
    cursor = block.end;
  }
  pieces.push(collapse(source.slice(cursor)));
  return pieces.join("");
}

export function applyEdits(source: string, proposals: EditGroup[], units: EditUnit[]): string {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const seen = new Set<string>();
  const edits = proposals
    .flatMap((proposal) =>
      proposal.unit_ids.map((id) => {
        const unit = byId.get(id);
        invariant(
          unit && source.slice(unit.start, unit.end) === unit.text,
          "Invalid or stale edit offsets",
        );
        invariant(!seen.has(id), "Duplicate edit unit");
        invariant(Object.hasOwn(proposal.replacements, id), "Missing group replacement");
        seen.add(id);
        return { unit, replacement: proposal.replacements[id] ?? "" };
      }),
    )
    .sort((a, b) => b.unit.start - a.unit.start);
  let boundary = source.length;
  let text = source;
  for (const { unit, replacement } of edits) {
    invariant(unit.start >= 0 && unit.end <= boundary, "Overlapping edit offsets");
    text = text.slice(0, unit.start) + replacement + text.slice(unit.end);
    boundary = unit.start;
  }
  return collapseBlankLines(text);
}

export function protectedTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}_])[-+]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?%?(?![\p{L}\p{N}_])/gu,
  ))
    tokens.add(`number:${match[0]}`);
  // Fenced/indented code is immutable. Only prose code spans enter the token set.
  const blocks = parseMarkdown(text).code_blocks;
  let cursor = 0;
  const prose: string[] = [];
  for (const block of blocks) {
    prose.push(text.slice(cursor, block.start));
    cursor = block.end;
  }
  prose.push(text.slice(cursor));
  for (const part of prose)
    for (const paragraph of part.split(/\r?\n[ \t]*\r?\n/)) {
      for (const match of paragraph.matchAll(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g))
        tokens.add(`code:${match[0]}`);
    }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`)\]]+/g))
    tokens.add(`url:${match[0].replace(/[.,;!?]+$/, "")}`);
  for (const match of text.matchAll(/!?\[[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/g))
    if (match[1] && !/^https?:\/\//.test(match[1])) tokens.add(`url:${match[1]}`);
  return tokens;
}

export function guardEdits(
  source: string,
  proposals: EditGroup[],
  units: EditUnit[],
  codeBlocks: Span[],
): EditDecision[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const decisions = proposals.map((proposal) => {
    const selected = proposal.unit_ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
    let reason = "passed";
    if (selected.length !== proposal.unit_ids.length) reason = "unknown unit id";
    else if (
      new Set(proposal.unit_ids).size !== proposal.unit_ids.length ||
      proposal.unit_ids.some(
        (id) => proposals.filter((group) => group.unit_ids.includes(id)).length > 1,
      )
    )
      reason = "overlapping edit groups";
    else if (selected.every((unit) => unit.text === proposal.replacements[unit.id]))
      reason = "no change";
    else if (
      selected.some((unit) =>
        codeBlocks.some((block) => unit.start < block.end && unit.end > block.start),
      )
    )
      reason = "code block touched";
    else if (
      selected.some(
        (unit) => parseMarkdown(proposal.replacements[unit.id] ?? "").code_blocks.length,
      )
    )
      reason = "replacement introduces a code block";
    return { proposal, units: selected, guard: { accepted: reason === "passed", reason } };
  });
  const original = protectedTokens(source);
  for (;;) {
    const active = decisions.filter((decision) => decision.guard.accepted);
    const revised = applyEdits(
      source,
      active.map((decision) => decision.proposal),
      units,
    );
    invariant(
      JSON.stringify(parseMarkdown(revised).code_blocks.map((block) => block.text)) ===
        JSON.stringify(codeBlocks.map((block) => block.text)),
      "Code blocks changed during edit application",
    );
    const remaining = protectedTokens(revised);
    const missing = [...original].filter((token) => !remaining.has(token));
    if (!missing.length) break;
    let rejected = false;
    for (const decision of active) {
      const before = protectedTokens(decision.units.map((unit) => unit.text).join("\n\n"));
      const after = protectedTokens(Object.values(decision.proposal.replacements).join("\n\n"));
      if (missing.some((token) => before.has(token) && !after.has(token))) {
        decision.guard = {
          accepted: false,
          reason: "protected number, inline code, or URL would be lost",
        };
        rejected = true;
      }
    }
    invariant(rejected, "Protected content loss cannot be attributed to an edit group");
  }
  return decisions;
}

export function groupWindow(
  source: string,
  proposal: EditGroup,
  units: EditUnit[],
): { original: string; revised: string } {
  const windows = proposal.unit_ids
    .map((id) => {
      const index = units.findIndex((unit) => unit.id === id),
        unit = units[index];
      invariant(unit, "Unknown unit in group context");
      const previous = units
        .slice(0, index)
        .reverse()
        .find((entry) => entry.kind === "paragraph");
      const next = units.slice(index + 1).find((entry) => entry.kind === "paragraph");
      return { start: previous?.start ?? unit.start, end: next?.end ?? unit.end };
    })
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const window of windows) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  const original: string[] = [],
    revised: string[] = [];
  for (const window of merged) {
    const local = units.filter((unit) => unit.start >= window.start && unit.end <= window.end);
    const ids = proposal.unit_ids.filter((id) => local.some((unit) => unit.id === id));
    const group = {
      ...proposal,
      unit_ids: ids,
      replacements: Object.fromEntries(ids.map((id) => [id, proposal.replacements[id] ?? ""])),
    };
    const text = source.slice(window.start, window.end);
    original.push(text);
    revised.push(
      applyEdits(
        text,
        [group],
        local.map((unit) => ({
          ...unit,
          start: unit.start - window.start,
          end: unit.end - window.start,
        })),
      ),
    );
  }
  const separator = "\n\n[Other unchanged paragraphs omitted]\n\n";
  return { original: original.join(separator), revised: revised.join(separator) };
}
