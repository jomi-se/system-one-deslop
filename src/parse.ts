export interface Span {
  id: string;
  start: number;
  end: number;
  text: string;
}
export interface Sentence extends Span {
  kind: "sentence";
}
export interface Paragraph extends Span {
  kind: "paragraph";
  list_item: boolean;
  sentences: Sentence[];
}
export interface Heading extends Span {
  kind: "heading";
  level: number;
  title: string;
}
export interface Section extends Span {
  kind: "section";
  heading: Heading | null;
  paragraphs: Paragraph[];
}
export interface MarkdownDocument extends Span {
  kind: "document";
  sections: Section[];
  code_blocks: Span[];
}
interface Line {
  start: number;
  end: number;
  text: string;
}

function span(source: string, kind: string, start: number, end: number): Span {
  return { id: `${kind}:${start}-${end}`, start, end, text: source.slice(start, end) };
}

function trimmedSpan(source: string, kind: string, start: number, end: number): Span {
  const raw = source.slice(start, end);
  return span(
    source,
    kind,
    start + raw.length - raw.trimStart().length,
    end - raw.length + raw.trimEnd().length,
  );
}

function linesOf(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (const match of source.matchAll(/\r\n|\r|\n/g)) {
    lines.push({ start, end: match.index, text: source.slice(start, match.index) });
    start = match.index + match[0].length;
  }
  if (start < source.length) lines.push({ start, end: source.length, text: source.slice(start) });
  return lines;
}

function linkOnly(text: string): boolean {
  const content = text.replace(/^\s*(?:>\s*)?(?:(?:[-+*]|\d+[.)])\s+)?/, "").trim();
  if (/^\[[^\]]+\]:\s*\S+/.test(content)) return true;
  return /^(?:(?:!?\[[^\]]*\]\((?:[^()]|\([^()]*\))*\)|\[[^\]]+\]\[[^\]]*\]|<https?:\/\/[^>]+>|https?:\/\/\S+)\s*)+$/.test(
    content,
  );
}

function indentation(text: string): number {
  let columns = 0;
  for (const character of text.match(/^[ \t]*/)?.[0] ?? "") {
    columns = character === "\t" ? columns + 4 - (columns % 4) : columns + 1;
  }
  return columns;
}

/** A prose-oriented Markdown scanner. Offsets are UTF-16 indices into the unchanged source. */
export function parseMarkdown(source: string): MarkdownDocument {
  const lines = linesOf(source);
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const sections: Section[] = [];
  const codeBlocks: Span[] = [];
  let section: Section = {
    ...span(source, "section", 0, source.length),
    kind: "section",
    heading: null,
    paragraphs: [],
  };
  let paragraphLines: Line[] = [];
  let paragraphIsList = false;
  let listContext: { indent: number; contentIndent: number } | null = null;
  let fence: { character: string; length: number; indent: number; start: number } | null = null;
  let frontMatter: string | null = null;
  const first = lines[0]?.text.replace(/^\uFEFF/, "");
  if (first === "---" || first === "+++") frontMatter = first;

  function flushParagraph(): void {
    const firstLine = paragraphLines[0];
    const lastLine = paragraphLines.at(-1);
    if (firstLine && lastLine) {
      const p = trimmedSpan(source, "paragraph", firstLine.start, lastLine.end);
      const sentences: Sentence[] = [];
      // Markdown soft wraps are spaces in prose. Preserve UTF-16 length so offsets
      // from the segmentation view still point into the exact original source.
      const sentenceView = p.text.replace(/\r\n|\r|\n/g, (newline) => " ".repeat(newline.length));
      for (const segment of segmenter.segment(sentenceView)) {
        const s = trimmedSpan(
          source,
          "sentence",
          p.start + segment.index,
          p.start + segment.index + segment.segment.length,
        );
        if (s.text) sentences.push({ ...s, kind: "sentence" });
      }
      section.paragraphs.push({ ...p, kind: "paragraph", list_item: paragraphIsList, sentences });
    }
    paragraphLines = [];
    paragraphIsList = false;
  }

  function beginSection(heading: Heading): void {
    flushParagraph();
    const previous = { ...section, ...span(source, "section", section.start, heading.start) };
    if (previous.text || previous.heading) sections.push(previous);
    section = {
      ...span(source, "section", heading.start, source.length),
      kind: "section",
      heading,
      paragraphs: [],
    };
    listContext = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (frontMatter) {
      if (
        index > 0 &&
        (line.text.trim() === frontMatter || (frontMatter === "---" && line.text.trim() === "..."))
      )
        frontMatter = null;
      continue;
    }
    const structural = line.text.replace(/^ {0,3}(?:>[ \t]?)+/, "");
    const indent = indentation(structural);
    const fenceMatch = structural.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        fenceMatch &&
        indent <= fence.indent + 3 &&
        fenceMatch[1]?.[0] === fence.character &&
        fenceMatch[1].length >= fence.length &&
        !fenceMatch[2]?.trim()
      ) {
        codeBlocks.push(span(source, "code", fence.start, line.end));
        fence = null;
      }
      continue;
    }
    const fenceAllowed =
      indent <= 3 ||
      (listContext &&
        indent >= listContext.contentIndent &&
        indent <= listContext.contentIndent + 3);
    if (
      fenceAllowed &&
      fenceMatch &&
      fenceMatch[1] &&
      !(fenceMatch[1][0] === "`" && fenceMatch[2]?.includes("`"))
    ) {
      flushParagraph();
      fence = {
        character: fenceMatch[1][0] ?? "`",
        length: fenceMatch[1].length,
        indent,
        start: line.start,
      };
      continue;
    }
    if (!structural.trim()) {
      flushParagraph();
      continue;
    }

    const listMatch = structural.match(/^([ \t]*)(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/);
    const nestedList = listContext !== null && indent >= listContext.contentIndent;
    const listItem = listMatch && (indent <= 3 || nestedList);
    const continuation =
      listContext && indent >= listContext.contentIndent && indent < listContext.contentIndent + 4;
    if (indent >= 4 && !listItem && !continuation) {
      flushParagraph();
      codeBlocks.push(span(source, "code", line.start, line.end));
      continue;
    }
    if (linkOnly(line.text)) {
      flushParagraph();
      continue;
    }

    const atx = structural.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/);
    if (atx && atx[1]) {
      beginSection({
        ...span(source, "heading", line.start, line.end),
        kind: "heading",
        level: atx[1].length,
        title: (atx[2] ?? "").replace(/[ \t]+#+[ \t]*$/, "").trim(),
      });
      continue;
    }
    const next = lines[index + 1];
    const setext = next?.text.match(/^ {0,3}(=+|-+)[ \t]*$/);
    if (!listItem && indent <= 3 && setext && next) {
      beginSection({
        ...span(source, "heading", line.start, next.end),
        kind: "heading",
        level: setext[1]?.[0] === "=" ? 1 : 2,
        title: line.text.trim(),
      });
      index += 1;
      continue;
    }
    if (
      /^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/.test(line.text)
    ) {
      flushParagraph();
      listContext = null;
      continue;
    }
    if (listItem && listMatch) {
      flushParagraph();
      listContext = { indent, contentIndent: indentation(listMatch[0].replace(/\S/g, " ")) };
      paragraphIsList = true;
    } else if (continuation) {
      if (!paragraphLines.length) paragraphIsList = true;
    } else {
      if (paragraphIsList) flushParagraph();
      listContext = null;
    }
    paragraphLines.push(line);
  }
  flushParagraph();
  if (fence) codeBlocks.push(span(source, "code", fence.start, source.length));
  if (section.text || section.heading) sections.push(section);
  return {
    ...span(source, "document", 0, source.length),
    kind: "document",
    sections,
    code_blocks: codeBlocks,
  };
}
