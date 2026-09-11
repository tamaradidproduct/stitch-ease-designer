import { useDocStore } from "./docStore";
import { useUiStore } from "./uiStore";

const lastSequence = (entries: readonly { sequence: number }[]): number =>
  entries[entries.length - 1]?.sequence ?? -1;

/** Undo whichever editor action—document or selection—actually happened last. */
export function undoLatest(): boolean {
  const doc = useDocStore.getState();
  const ui = useUiStore.getState();
  const docSequence = lastSequence(doc.undoStack);
  const selectionSequence = lastSequence(ui.selectionUndoStack);
  if (docSequence < 0 && selectionSequence < 0) return false;
  if (selectionSequence > docSequence) return ui.undoSelection();
  doc.undo();
  return true;
}

/** Redo whichever editor action was most recently undone. */
export function redoLatest(): boolean {
  const doc = useDocStore.getState();
  const ui = useUiStore.getState();
  const docSequence = lastSequence(doc.redoStack);
  const selectionSequence = lastSequence(ui.selectionRedoStack);
  if (docSequence < 0 && selectionSequence < 0) return false;
  // Each redo stack is LIFO, so its top is the earliest action still waiting
  // to be replayed. Across the two stacks, the lower sequence comes first.
  if (selectionSequence >= 0 && (docSequence < 0 || selectionSequence < docSequence)) {
    return ui.redoSelection();
  }
  doc.redo();
  return true;
}
