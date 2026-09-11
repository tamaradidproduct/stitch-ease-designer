import { useLayoutEffect, useRef, useState } from "react";
import { cellToScreenRect } from "../canvas/camera";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * The compact menu that appears once after a Suggest stroke finishes,
 * summarizing every currently pending suggestion in the document (not just
 * the stroke that opened it) and offering bulk actions on each kind.
 *
 * Deliberately its own component rather than a mode of `StitchPicker`: the
 * data shape is different (document-wide counts, not one cell or selection)
 * and so is the lifecycle (opens once per stroke, never reopens on its own -
 * see `openSuggestReview`/`openPicker` in uiStore for where that's enforced).
 */
export function SuggestReviewMenu() {
  const bounds = useUiStore((s) => s.suggestReview);
  const closeSuggestReview = useUiStore((s) => s.closeSuggestReview);
  const openPicker = useUiStore((s) => s.openPicker);
  const role = useUiStore((s) => s.role);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const index = useDocStore((s) => s.index);
  const referenceImageUnrecognized = useUiStore((s) => s.referenceImageUnrecognized);
  const acceptSuggestions = useDocStore((s) => s.acceptSuggestions);
  const dismissSuggestions = useDocStore((s) => s.dismissSuggestions);
  useDocStore((s) => s.revision);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  const identified = [...index.placements.values()].filter((p) => p.suggested);
  // A marker is stale once something's been placed at its cell by any other
  // route (a hand-placed stitch, a later successful scan) - filtered the
  // same way the right panel's count already is.
  const unrecognizedCells = [...referenceImageUnrecognized].flatMap((key) => {
    const [col, row] = key.split(",").map(Number);
    if (col === undefined || row === undefined || index.placementAt(col, row)) return [];
    return [{ col, row }];
  });

  const open = role === "admin" && !!bounds;

  // Centered horizontally over the batch that opened it, but held above it
  // vertically - the same relationship StitchPicker keeps with a selection -
  // so the menu never sits on top of (and hides) the very cells it's about.
  // Recomputed on every relevant change so an in-progress pan or zoom
  // carries it along, the same way StitchPicker's own position does.
  useLayoutEffect(() => {
    if (!open || !bounds) return;
    const root = rootRef.current;
    if (!root) return;
    const canvasRect = document.querySelector("canvas")?.getBoundingClientRect();
    const topLeft = cellToScreenRect(bounds.minCol, bounds.maxRow, camera, viewport);
    const bottomRight = cellToScreenRect(bounds.maxCol + 1, bounds.minRow - 1, camera, viewport);
    const anchorX = (canvasRect?.left ?? 0) + (topLeft.x + bottomRight.x) / 2;
    const anchorTop = (canvasRect?.top ?? 0) + topLeft.y;
    const width = root.offsetWidth;
    const height = root.offsetHeight;
    setPos({
      left: Math.max(8, Math.min(anchorX - width / 2, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(anchorTop - height - 10, window.innerHeight - height - 8)),
    });
  }, [open, bounds, camera, viewport, identified.length, unrecognizedCells.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      // Same rule as StitchPicker: the canvas closes this itself, so the
      // click that dismisses the menu doesn't also start a new stroke.
      if (e.target instanceof HTMLCanvasElement) return;
      closeSuggestReview();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSuggestReview();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closeSuggestReview]);

  if (!open) return null;

  const identifiedIds = identified.map((p) => p.id);

  // Every action closes the menu - it's a one-shot summary of the batch
  // that just finished, not a panel you keep working from. "Replace all" is
  // the one exception: it hands off straight to the stitch picker instead
  // of just closing, and `openPicker` itself already clears `suggestReview`
  // (see uiStore), so there's nothing extra to close there.
  const acceptAllIdentified = () => {
    acceptSuggestions();
    closeSuggestReview();
  };

  const dismissAllIdentified = () => {
    dismissSuggestions();
    closeSuggestReview();
  };

  const dismissAllUnrecognized = () => {
    useUiStore.getState().clearReferenceImageUnrecognized();
    closeSuggestReview();
  };

  const replaceAllUnrecognized = () => {
    const first = unrecognizedCells[0];
    if (!first) return;
    // Anchored to the whole batch (via `selectionEmptyCells`), not just
    // `first` - StitchPicker's own positioning centers over every cell in
    // that array, so the picker opens where this menu already was instead
    // of jumping to whichever cell happens to be first in the list.
    openPicker({
      col: first.col,
      row: first.row,
      x: 0,
      y: 0,
      selectionEmptyCells: unrecognizedCells,
      reviewingSuggestion: true,
    });
  };

  return (
    <div
      ref={rootRef}
      className="suggestReview"
      style={{ left: pos.left, top: pos.top }}
      role="dialog"
      aria-label="Review suggested stitches"
    >
      <div className="suggestReview__group">
        <p className="suggestReview__heading suggestReview__heading--identified">
          {identified.length} identified
        </p>
        <div className="suggestReview__row">
          <button
            type="button"
            className="suggestReview__action"
            onClick={acceptAllIdentified}
            disabled={!identifiedIds.length}
            aria-label="Accept all identified suggestions"
            title="Accept all"
          >
            <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true">
              <path d="m4 10 3.5 3.5L16 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Accept all</span>
          </button>
          <button
            type="button"
            className="suggestReview__action"
            onClick={dismissAllIdentified}
            disabled={!identifiedIds.length}
            aria-label="Dismiss all identified suggestions"
            title="Dismiss all"
          >
            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
              <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span>Dismiss all</span>
          </button>
        </div>
      </div>

      <span className="suggestReview__divider" aria-hidden="true" />

      <div className="suggestReview__group">
        <p className="suggestReview__heading suggestReview__heading--unrecognized">
          {unrecognizedCells.length} unidentified
        </p>
        <div className="suggestReview__row">
          <button
            type="button"
            className="suggestReview__action"
            onClick={dismissAllUnrecognized}
            disabled={!unrecognizedCells.length}
            aria-label="Dismiss all unidentified markers"
            title="Dismiss all"
          >
            <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true">
              <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <span>Dismiss all</span>
          </button>
          <button
            type="button"
            className="suggestReview__action"
            onClick={replaceAllUnrecognized}
            disabled={!unrecognizedCells.length}
            aria-label="Replace all unidentified markers with a chosen stitch"
            title="Replace all"
          >
            <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true">
              <path
                d="M4 8.5h9.5M11 5.5l3 3-3 3M16 11.5H6.5M9 8.5l-3 3 3 3"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>Replace all</span>
          </button>
        </div>
      </div>
    </div>
  );
}
