import { type RefObject, useCallback, useEffect, useRef } from "react";
import { useUiStore } from "../state/uiStore";

/**
 * Caches `canvas.getBoundingClientRect()` instead of forcing a layout read on
 * every pointer/wheel event - originally usePanZoom.ts's own pattern, pulled
 * out here so usePaintTool.ts and useReferenceImageTool.ts can share it too.
 *
 * Refreshed whenever the canvas resizes (piggybacking on CanvasView's own
 * ResizeObserver via the `viewport` store field, rather than running a
 * second observer on the same element), or the page scrolls or the window
 * itself resizes, either of which can reposition the canvas without
 * changing its own box size.
 *
 * Returns a stable function that always reads the latest cached rect - safe
 * to call from event handlers registered once for the ref's lifetime.
 */
export function useCanvasRect(ref: RefObject<HTMLCanvasElement | null>): () => DOMRect {
  const rectRef = useRef<DOMRect>(new DOMRect());

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const updateRect = () => {
      rectRef.current = canvas.getBoundingClientRect();
    };
    updateRect();

    const unsubscribeViewport = useUiStore.subscribe((state, prev) => {
      if (state.viewport !== prev.viewport) updateRect();
    });
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    return () => {
      unsubscribeViewport();
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [ref]);

  return useCallback(() => rectRef.current, []);
}
