let sequence = 0;

/** Orders undoable UI and document actions on one editor-wide timeline. */
export function nextHistorySequence(): number {
  sequence += 1;
  return sequence;
}
