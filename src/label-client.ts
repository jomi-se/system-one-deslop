/// <reference lib="dom" />
import { isLabel, isRecord, isSnapshot, isLabelState, isUndoResult } from "./label-types.js";
import type { Highlight, Label, LabelState, PublicCard } from "./label-types.js";

const element = <T extends HTMLElement>(id: string, type: new () => T): T => {
  const value = document.getElementById(id);
  if (!(value instanceof type)) throw new Error(`Missing element: ${id}`);
  return value;
};
const sentence = element("sentence", HTMLElement);
const status = element("status", HTMLElement);
const note = element("note", HTMLTextAreaElement);
const filter = element("filter", HTMLSelectElement);
const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-label]")];
let cards: PublicCard[] = [];
let state: LabelState = { ratings: {}, canUndo: false };
let position = 0;
let busy = false;
let highlight: Highlight | null = null;

async function api<T>(
  path: string,
  guard: (value: unknown) => value is T,
  value?: unknown,
): Promise<T> {
  const response = await fetch(
    path,
    value === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        },
  );
  const result: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isRecord(result) && typeof result.error === "string" ? result.error : "Could not save",
    );
  if (!guard(result)) throw new Error("Unexpected server response");
  return result;
}
function visible(): PublicCard[] {
  return cards.filter(
    (card) =>
      filter.value === "all" ||
      (filter.value === "rated" ? !!state.ratings[card.id] : !state.ratings[card.id]),
  );
}
function current(): PublicCard | undefined {
  return visible()[position];
}
function render(): void {
  const queue = visible();
  position = Math.max(0, Math.min(position, queue.length - 1));
  const card = current();
  const rated = Object.keys(state.ratings).length;
  element("progress-text", HTMLElement).textContent = `${rated} of ${cards.length} rated`;
  element("progress", HTMLProgressElement).value = cards.length ? rated / cards.length : 0;
  element("position", HTMLElement).textContent = card
    ? `${position + 1} / ${queue.length} in this view`
    : "All caught up";
  sentence.textContent =
    card?.text ??
    (filter.value === "rated"
      ? "No ratings yet."
      : "This batch is done. You can review your ratings or download them below.");
  const saved = card ? state.ratings[card.id] : undefined;
  note.value = saved?.note ?? "";
  highlight = saved?.highlight ?? null;
  element("highlight", HTMLElement).textContent =
    highlight && card
      ? `Marked: “${card.text.slice(highlight.start, highlight.end)}”`
      : "Select a phrase in the sentence to mark it (optional).";
  element("undo", HTMLButtonElement).disabled = busy || !state.canUndo;
  for (const button of buttons) {
    button.disabled = busy || !card;
    button.setAttribute("aria-pressed", String(button.dataset.label === saved?.label));
  }
  element("next", HTMLButtonElement).disabled = busy || !card;
  element("previous", HTMLButtonElement).disabled = busy || !card || position === 0;
  const context = element("context-text", HTMLElement);
  context.replaceChildren();
  if (card) {
    context.append(document.createTextNode(card.before));
    const mark = document.createElement("mark");
    mark.textContent = card.text;
    context.append(mark, document.createTextNode(card.after));
  }
  element("context", HTMLDetailsElement).open = false;
}
async function rate(label: Label): Promise<void> {
  const card = current();
  if (!card || busy) return;
  busy = true;
  status.textContent = "Saving…";
  const selection = window.getSelection();
  if (
    selection?.anchorNode === sentence.firstChild &&
    selection.focusNode === sentence.firstChild &&
    !selection.isCollapsed
  )
    highlight = {
      start: Math.min(selection.anchorOffset, selection.focusOffset),
      end: Math.max(selection.anchorOffset, selection.focusOffset),
    };
  const draft = { note: note.value, highlight };
  let saved = false;
  for (const button of buttons) button.disabled = true;
  try {
    state = await api("/api/rate", isLabelState, {
      id: card.id,
      label,
      note: note.value,
      highlight,
    });
    saved = true;
    if (filter.value !== "unrated") position++;
    status.textContent = "Saved on the VM";
    window.getSelection()?.removeAllRanges();
  } catch (error: unknown) {
    status.textContent = error instanceof Error ? error.message : "Save failed. Please retry.";
  } finally {
    busy = false;
    render();
    if (!saved) {
      note.value = draft.note;
      highlight = draft.highlight;
    }
  }
}
for (const button of buttons)
  button.addEventListener("click", () => {
    const label = button.dataset.label;
    if (isLabel(label)) void rate(label);
  });
element("next", HTMLElement).addEventListener("click", () => {
  if (!busy) {
    position = (position + 1) % Math.max(1, visible().length);
    render();
  }
});
element("previous", HTMLElement).addEventListener("click", () => {
  if (!busy) {
    position--;
    render();
  }
});
filter.addEventListener("change", () => {
  position = 0;
  render();
});
element("undo", HTMLElement).addEventListener("click", () => {
  if (busy) return;
  busy = true;
  void api("/api/undo", isUndoResult, {})
    .then((result) => {
      state = result.state;
      if (result.id) {
        if (!visible().some((card) => card.id === result.id)) filter.value = "all";
        position = visible().findIndex((card) => card.id === result.id);
      }
      status.textContent = "Last rating undone";
    })
    .catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : "Undo failed";
    })
    .finally(() => {
      busy = false;
      render();
    });
});
document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  if (
    selection?.anchorNode === sentence.firstChild &&
    selection.focusNode === sentence.firstChild &&
    !selection.isCollapsed
  ) {
    highlight = {
      start: Math.min(selection.anchorOffset, selection.focusOffset),
      end: Math.max(selection.anchorOffset, selection.focusOffset),
    };
    element("highlight", HTMLElement).textContent =
      `Marked: “${sentence.textContent?.slice(highlight.start, highlight.end)}”`;
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLSelectElement ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    busy
  )
    return;
  const index = Number(event.key) - 1;
  if (event.key.length === 1 && index >= 0 && index < 5) {
    event.preventDefault();
    buttons[index]?.click();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    element("next", HTMLElement).click();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    element("previous", HTMLElement).click();
  }
});
try {
  const result = await api("/api/state", isSnapshot);
  cards = result.cards;
  state = result;
  status.textContent = "Saved ratings loaded";
  render();
} catch (error: unknown) {
  status.textContent = error instanceof Error ? error.message : "Could not load the batch";
}
