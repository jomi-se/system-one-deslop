import type { AuditAnswer } from "./audit.js";
import type { MarkdownDocument } from "./parse.js";

export interface CodeMetrics {
  prose_words: number;
  sentences: number;
  sentence_length_mean_words: number | null;
  sentence_length_stdev_words: number | null;
  short_single_sentence_paragraph_share: number | null;
  em_dashes: number;
  em_dashes_per_1000_words: number | null;
  semicolons: number;
  semicolons_per_1000_words: number | null;
  clause_intro_colons: number;
  clause_intro_colons_per_1000_words: number | null;
  bold_spans: number;
  bold_spans_per_1000_words: number | null;
  headings: number;
  headings_per_1000_words: number | null;
  bullets: number;
  bullets_per_1000_words: number | null;
}
export const CODE_METRICS = [
  "prose_words",
  "sentences",
  "sentence_length_mean_words",
  "sentence_length_stdev_words",
  "short_single_sentence_paragraph_share",
  "em_dashes",
  "em_dashes_per_1000_words",
  "semicolons",
  "semicolons_per_1000_words",
  "clause_intro_colons",
  "clause_intro_colons_per_1000_words",
  "bold_spans",
  "bold_spans_per_1000_words",
  "headings",
  "headings_per_1000_words",
  "bullets",
  "bullets_per_1000_words",
] as const satisfies readonly (keyof CodeMetrics)[];

const words = new Intl.Segmenter("en", { granularity: "word" });
function withoutCode(text: string): string {
  return text.replace(/(?<!`)(`+)(?!`)[\s\S]*?\1(?!`)/g, " ");
}
function visibleText(text: string): string {
  return withoutCode(text)
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1");
}
export function wordCount(text: string): number {
  return Array.from(words.segment(visibleText(text))).filter((segment) => segment.isWordLike)
    .length;
}
function rate(count: number, wordTotal: number): number | null {
  return wordTotal ? (count / wordTotal) * 1_000 : null;
}

export function codeMetrics(document: MarkdownDocument): CodeMetrics {
  const paragraphs = document.sections.flatMap((section) => section.paragraphs);
  const headings = document.sections.flatMap((section) =>
    section.heading ? [section.heading] : [],
  );
  const prose = [...paragraphs.map((p) => p.text), ...headings.map((heading) => heading.title)];
  const text = prose.map(visibleText).join("\n");
  const prose_words = prose.reduce((sum, value) => sum + wordCount(value), 0);
  const lengths = paragraphs.flatMap((p) =>
    p.sentences.map((sentence) => wordCount(sentence.text)),
  );
  const mean = lengths.length
    ? lengths.reduce((sum, length) => sum + length, 0) / lengths.length
    : null;
  const stdev =
    mean === null
      ? null
      : Math.sqrt(lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lengths.length);
  const short = paragraphs.filter(
    (p) => p.sentences.length === 1 && wordCount(p.sentences[0]?.text ?? "") <= 12,
  ).length;
  const em_dashes = (text.match(/—/g) ?? []).length;
  const semicolons = (text.match(/;/g) ?? []).length;
  // Deliberately approximate: colon + whitespace + a capital/numeric/quoted opening.
  const clause_intro_colons = (text.match(/:\s+(?=[\p{Lu}\p{N}“"‘'])/gu) ?? []).length;
  const bold_spans = prose.reduce(
    (sum, value) => sum + (withoutCode(value).match(/(\*\*|__)(?=\S)[\s\S]*?\S\1/g) ?? []).length,
    0,
  );
  const bullets = paragraphs.filter((p) => p.list_item).length;
  return {
    prose_words,
    sentences: lengths.length,
    sentence_length_mean_words: mean,
    sentence_length_stdev_words: stdev,
    short_single_sentence_paragraph_share: paragraphs.length ? short / paragraphs.length : null,
    em_dashes,
    em_dashes_per_1000_words: rate(em_dashes, prose_words),
    semicolons,
    semicolons_per_1000_words: rate(semicolons, prose_words),
    clause_intro_colons,
    clause_intro_colons_per_1000_words: rate(clause_intro_colons, prose_words),
    bold_spans,
    bold_spans_per_1000_words: rate(bold_spans, prose_words),
    headings: headings.length,
    headings_per_1000_words: rate(headings.length, prose_words),
    bullets,
    bullets_per_1000_words: rate(bullets, prose_words),
  };
}

export interface Density {
  prose_words: number;
  texture_prose_words: number;
  texture_sentences: number;
  quoted_sentences: number;
  code: CodeMetrics | null;
  questions: Record<
    string,
    {
      count: number | null;
      hits: number | null;
      expected_count: number | null;
      valid: number;
      expected: number;
      per_1000_words: number | null;
      expected_per_1000_words: number | null;
    }
  >;
}

export function measureDensity(
  document: MarkdownDocument,
  answers: AuditAnswer[],
  questionIds: readonly string[],
  options: { code: boolean; texture: boolean },
): Density {
  const metrics = codeMetrics(document);
  const sentences = document.sections.flatMap((section) =>
    section.paragraphs.flatMap((paragraph) => paragraph.sentences),
  );
  const skipped = sentences.filter((sentence) => sentence.quoted_fraction > 0.5);
  const eligible = new Set(
    sentences.filter((sentence) => sentence.quoted_fraction <= 0.5).map((sentence) => sentence.id),
  );
  const quotedHeadingWords = document.sections.reduce(
    (total, section) =>
      total +
      (section.heading && section.heading.quoted_fraction > 0.5
        ? wordCount(section.heading.title)
        : 0),
    0,
  );
  const texture_prose_words = Math.max(
    0,
    metrics.prose_words -
      skipped.reduce((total, sentence) => total + wordCount(sentence.text), 0) -
      quotedHeadingWords,
  );
  const questions = Object.fromEntries(
    questionIds.map((id) => {
      const valid = answers.filter(
        (answer) =>
          answer.question_id === id &&
          eligible.has(answer.unit_id) &&
          answer.answer?.type === "noul" &&
          !answer.error,
      );
      const complete = options.texture && valid.length === eligible.size;
      const count = complete
        ? valid.filter((answer) => answer.answer?.type === "noul" && answer.answer.noul >= 0.5)
            .length
        : null;
      const expected_count = complete
        ? valid.reduce(
            (total, answer) => total + (answer.answer?.type === "noul" ? answer.answer.noul : 0),
            0,
          )
        : null;
      return [
        id,
        {
          count,
          hits: count,
          expected_count,
          valid: valid.length,
          expected: eligible.size,
          per_1000_words: count === null ? null : rate(count, texture_prose_words),
          expected_per_1000_words:
            expected_count === null ? null : rate(expected_count, texture_prose_words),
        },
      ];
    }),
  );
  return {
    prose_words: metrics.prose_words,
    texture_prose_words,
    texture_sentences: eligible.size,
    quoted_sentences: skipped.length,
    code: options.code ? metrics : null,
    questions,
  };
}
