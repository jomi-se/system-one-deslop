import { createHash } from "node:crypto";
import {
  appendFileSync,
  fsyncSync,
  openSync,
  closeSync,
  readFileSync,
  fstatSync,
  statSync,
  constants,
} from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseMarkdown } from "./parse.js";
import { wordCount } from "./density.js";
import { invariant, object, ValidationError } from "./registry.js";

import { isLabel, isRecord } from "./label-types.js";
import type { Highlight, Rating, LabelState, PublicCard } from "./label-types.js";
export type { Highlight, Rating, LabelState, PublicCard, Label } from "./label-types.js";
export interface Origin {
  file: string;
  group: string;
  offsets: [number, number];
  paragraph: string;
  raw_text: string;
  before: string;
  after: string;
}
export interface Card {
  id: string;
  text: string;
  origins: Origin[];
}
export interface Dataset {
  version: 1;
  seed: string;
  documents: number;
  total_unique: number;
  cards: Card[];
}
interface Event {
  seq: number;
  at: string;
  action: "rate" | "undo";
  id: string;
  value: Rating | null;
  before: Rating | null;
}

export function isDataset(value: unknown): value is Dataset {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.seed === "string" &&
    typeof value.documents === "number" &&
    typeof value.total_unique === "number" &&
    Array.isArray(value.cards) &&
    value.cards.every(
      (card: unknown) =>
        isRecord(card) &&
        typeof card.id === "string" &&
        typeof card.text === "string" &&
        Array.isArray(card.origins) &&
        card.origins.length > 0 &&
        card.origins.every(
          (origin: unknown) =>
            isRecord(origin) &&
            typeof origin.file === "string" &&
            typeof origin.group === "string" &&
            typeof origin.paragraph === "string" &&
            typeof origin.before === "string" &&
            typeof origin.after === "string" &&
            Array.isArray(origin.offsets) &&
            origin.offsets.length === 2 &&
            origin.offsets.every((offset: unknown) => typeof offset === "number"),
        ),
    )
  );
}

function hash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
export function cardId(text: string): string {
  return hash(text.replace(/\s+/g, " ").trim());
}
export function readingText(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/(`+)([\s\S]*?)\1/g, "$2")
    .replace(/(\*\*|__)(\S[\s\S]*?\S)\1/g, "$2")
    .replace(/(?<!\w)(\*|_)(\S(?:[^\n]*?\S)?)\1(?!\w)/g, "$2");
}

export async function createDataset(
  repo: string,
  runs: string | undefined,
  count: number,
  seed: string,
  extras: string[] = [],
): Promise<Dataset> {
  invariant(
    Number.isSafeInteger(count) && count > 0 && count <= 2_000,
    "Count must be between 1 and 2000",
  );
  const files: { file: string; group: string }[] = [];
  for (const folder of ["generated", "briefed", "human"]) {
    for (const name of (await readdir(join(repo, "eval/corpus", folder))).sort()) {
      if (!name.endsWith(".md")) continue;
      const parts = name.split(".");
      files.push({
        file: join(repo, "eval/corpus", folder, name),
        group: folder === "human" ? "human" : `${folder}.${parts[1]}.${parts[2]}`,
      });
    }
  }
  if (runs) {
    for (const name of (await readdir(runs)).sort()) {
      if (!/^deslop-(?:v[23]-)?\d/.test(name)) continue;
      const version = name.startsWith("deslop-v2")
        ? "v2"
        : name.startsWith("deslop-v3")
          ? "v3"
          : "v1";
      for (const child of await readdir(join(runs, name), { withFileTypes: true })) {
        if (!child.isDirectory() || !/\.(opus|sol)$/.test(child.name)) continue;
        files.push({
          file: join(runs, name, child.name, "revised.md"),
          group: `edited.${version}.${child.name.split(".").at(-1)}`,
        });
      }
    }
  }
  files.push(...extras.map((file) => ({ file, group: "extra" })));
  const pool = new Map<string, Card>();
  for (const source of files) {
    const document = parseMarkdown(await readFile(source.file, "utf8"));
    for (const paragraph of document.sections.flatMap((section) => section.paragraphs)) {
      for (const sentence of paragraph.sentences) {
        const words = wordCount(sentence.text);
        if (words < 3 || words > 70 || /^\s*\|/.test(sentence.text)) continue;
        const text = readingText(sentence.text);
        const id = cardId(text);
        const card = pool.get(id) ?? { id, text, origins: [] };
        card.origins.push({
          file: source.file,
          group: source.group,
          offsets: [sentence.start, sentence.end],
          paragraph: paragraph.text,
          raw_text: sentence.text,
          before: readingText(paragraph.text.slice(0, sentence.start - paragraph.start)),
          after: readingText(paragraph.text.slice(sentence.end - paragraph.start)),
        });
        pool.set(id, card);
      }
    }
  }
  const cards = [...pool.values()];
  const sort = (a: Card, b: Card) => hash(seed + a.id).localeCompare(hash(seed + b.id));
  const human = cards
    .filter((card) => card.origins.some((origin) => origin.group === "human"))
    .sort(sort);
  const selected = human.slice(0, Math.min(Math.round(count / 4), human.length));
  const seen = new Set(selected.map((card) => card.id));
  const groups = new Map<string, Card[]>();
  for (const card of cards.sort(sort))
    for (const group of new Set(card.origins.map((origin) => origin.group))) {
      if (group === "human") continue;
      const bucket = groups.get(group) ?? [];
      bucket.push(card);
      groups.set(group, bucket);
    }
  while (selected.length < count) {
    let added = false;
    for (const bucket of groups.values()) {
      let card = bucket.shift();
      while (card && seen.has(card.id)) card = bucket.shift();
      if (card && selected.length < count) {
        selected.push(card);
        seen.add(card.id);
        added = true;
      }
    }
    if (!added) break;
  }
  for (const card of human)
    if (selected.length < count && !seen.has(card.id)) {
      selected.push(card);
      seen.add(card.id);
    }
  return {
    version: 1,
    seed,
    documents: files.length,
    total_unique: pool.size,
    cards: selected.sort((a, b) =>
      hash("order" + seed + a.id).localeCompare(hash("order" + seed + b.id)),
    ),
  };
}

type JournalIdentity = { dev: bigint; ino: bigint; size: bigint };

export class LabelStore {
  private ratings = new Map<string, Rating>();
  private undoable: Event[] = [];
  private seq = 0;
  private writeFailed = false;
  private journal: JournalIdentity | undefined;
  private cards: Map<string, Card>;
  constructor(
    readonly path: string,
    readonly dataset: Dataset,
  ) {
    this.cards = new Map(dataset.cards.map((card) => [card.id, card]));
    let fd: number;
    try {
      fd = openSync(path, "r");
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    let text: string;
    try {
      const identity = fstatSync(fd, { bigint: true });
      this.assertJournal(fd, identity);
      const bytes = readFileSync(fd);
      this.assertJournal(fd, identity);
      invariant(BigInt(bytes.length) === identity.size, "Rating journal changed during replay");
      this.journal = identity;
      text = bytes.toString("utf8");
    } finally {
      closeSync(fd);
    }
    invariant(
      text === "" || text.endsWith("\n"),
      "Incomplete rating journal; preserve it for recovery",
    );
    for (const line of text.split("\n").filter(Boolean)) {
      const event = object(JSON.parse(line) as unknown, "Rating event");
      invariant(
        event.seq === this.seq + 1 &&
          typeof event.id === "string" &&
          this.cards.has(event.id) &&
          (event.action === "rate" || event.action === "undo"),
        "Invalid rating journal; preserve it for recovery",
      );
      const value = event.value === null ? null : this.validate(event.id, event.value);
      const before = this.ratings.get(event.id) ?? null;
      const entry: Event = {
        seq: event.seq,
        at: String(event.at),
        action: event.action,
        id: event.id,
        value,
        before,
      };
      this.apply(entry);
    }
  }
  private assertJournal(fd: number, expected: JournalIdentity): void {
    const opened = fstatSync(fd, { bigint: true });
    const current = statSync(this.path, { bigint: true });
    invariant(
      [opened, current].every(
        (file) =>
          file.isFile() &&
          file.dev === expected.dev &&
          file.ino === expected.ino &&
          file.size === expected.size,
      ),
      "Rating journal changed; preserve it for recovery",
    );
  }
  private validate(id: string, input: unknown): Rating {
    const card = this.cards.get(id);
    invariant(card, "Unknown sentence");
    const value = object(input, "Rating");
    invariant(
      isLabel(value.label) && typeof value.note === "string" && value.note.length <= 4_000,
      "Invalid rating",
    );
    let highlight: Highlight | null = null;
    if (value.highlight !== null && value.highlight !== undefined) {
      const span = object(value.highlight, "Highlight");
      invariant(
        typeof span.start === "number" &&
          typeof span.end === "number" &&
          Number.isSafeInteger(span.start) &&
          Number.isSafeInteger(span.end) &&
          span.start >= 0 &&
          span.end > span.start &&
          span.end <= card.text.length,
        "Invalid highlight",
      );
      highlight = { start: span.start, end: span.end };
    }
    return {
      label: value.label,
      note: value.note,
      highlight,
      updated_at:
        typeof value.updated_at === "string" ? value.updated_at : new Date().toISOString(),
    };
  }
  private apply(event: Event): void {
    if (event.value) this.ratings.set(event.id, event.value);
    else this.ratings.delete(event.id);
    if (event.action === "rate") this.undoable.push(event);
    else {
      const previous = this.undoable.pop();
      invariant(previous?.id === event.id, "Invalid undo journal");
    }
    this.seq = event.seq;
  }
  private append(action: Event["action"], id: string, value: Rating | null): void {
    const failureMessage =
      "Saving stopped after a journal error; restart the server to recover before saving again.";
    invariant(!this.writeFailed, failureMessage);
    const event: Event = {
      seq: this.seq + 1,
      at: new Date().toISOString(),
      action,
      id,
      value,
      before: this.ratings.get(id) ?? null,
    };
    try {
      const fd = openSync(
        this.path,
        this.journal ? constants.O_WRONLY | constants.O_APPEND : "ax",
        0o600,
      );
      try {
        const identity = this.journal ?? { ...fstatSync(fd, { bigint: true }), size: 0n };
        this.assertJournal(fd, identity);
        const line = JSON.stringify(event) + "\n";
        appendFileSync(fd, line);
        fsyncSync(fd);
        const expected = { ...identity, size: identity.size + BigInt(Buffer.byteLength(line)) };
        this.assertJournal(fd, expected);
        this.journal = expected;
      } finally {
        closeSync(fd);
      }
    } catch (cause: unknown) {
      this.writeFailed = true;
      throw new ValidationError(failureMessage, { cause });
    }
    this.apply(event);
  }
  rate(id: string, input: unknown): LabelState {
    const value = this.validate(id, input);
    this.append("rate", id, value);
    return this.state();
  }
  undo(): { state: LabelState; id: string | null } {
    const previous = this.undoable.at(-1);
    if (!previous) return { state: this.state(), id: null };
    this.append("undo", previous.id, previous.before);
    return { state: this.state(), id: previous.id };
  }
  state(): LabelState {
    return { ratings: Object.fromEntries(this.ratings), canUndo: this.undoable.length > 0 };
  }
  publicCards(): PublicCard[] {
    return this.dataset.cards.map((card) => ({
      id: card.id,
      text: card.text,
      before: card.origins[0]?.before ?? "",
      after: card.origins[0]?.after ?? "",
    }));
  }
  export(): object[] {
    return this.dataset.cards.map((card) => ({
      ...card,
      rating: this.ratings.get(card.id) ?? null,
    }));
  }
}
