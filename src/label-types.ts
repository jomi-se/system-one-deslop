export const LABELS = ["very_ai", "a_bit_ai", "neutral", "good", "very_good"] as const;
export type Label = (typeof LABELS)[number];
export interface Highlight {
  start: number;
  end: number;
}
export interface Rating {
  label: Label;
  note: string;
  highlight: Highlight | null;
  updated_at: string;
}
export interface PublicCard {
  id: string;
  text: string;
  before: string;
  after: string;
}
export interface LabelState {
  ratings: Record<string, Rating>;
  canUndo: boolean;
}
export interface Snapshot extends LabelState {
  cards: PublicCard[];
}
export interface UndoResult {
  state: LabelState;
  id: string | null;
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isLabel(value: unknown): value is Label {
  return LABELS.some((label) => label === value);
}
function isRating(value: unknown): value is Rating {
  return (
    isRecord(value) &&
    isLabel(value.label) &&
    typeof value.note === "string" &&
    typeof value.updated_at === "string" &&
    (value.highlight === null ||
      (isRecord(value.highlight) &&
        typeof value.highlight.start === "number" &&
        typeof value.highlight.end === "number"))
  );
}
export function isLabelState(value: unknown): value is LabelState {
  return (
    isRecord(value) &&
    typeof value.canUndo === "boolean" &&
    isRecord(value.ratings) &&
    Object.values(value.ratings).every(isRating)
  );
}
export function isSnapshot(value: unknown): value is Snapshot {
  return (
    isLabelState(value) &&
    "cards" in value &&
    Array.isArray(value.cards) &&
    value.cards.every(
      (card: unknown) =>
        isRecord(card) &&
        typeof card.id === "string" &&
        typeof card.text === "string" &&
        typeof card.before === "string" &&
        typeof card.after === "string",
    )
  );
}
export function isUndoResult(value: unknown): value is UndoResult {
  return (
    isRecord(value) &&
    isLabelState(value.state) &&
    (typeof value.id === "string" || value.id === null)
  );
}
