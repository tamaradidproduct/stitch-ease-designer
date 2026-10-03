import { type RefObject, useEffect } from "react";
import { type Cell, screenToCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { fillOrigins } from "../model/motifs";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { registerListeners } from "./registerListeners";
import { useCanvasRect } from "./useCanvasRect";

/**
 * The armed motif's stamp (FR-64): click places one linked copy, drag tiles
 * as many whole copies as fit. Registered ahead of `usePaintTool` and claims
 * the gesture with `stopImmediatePropagation`, so nothing else paints,
 * selects or opens a picker underneath it. Cmd/Ctrl (temporary Select),
 * Space/Pan and the reference-image panel are left alone.
 */
export function useMotifStampTool(ref: RefObject<HTMLCanvasElement | null>): void {
  const getRect = useCanvasRect(ref);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ui = useUiStore.getState;
    const doc = useDocStore.getState;
    let gesture: { pointerId: number; start: Cell } | null = null;

    const cellAt = (e: PointerEvent): Cell | null => {
      const rect = getRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      if (sx < RULER || sy < RULER) return null;
      const { camera, viewport } = ui();
      return screenToCell(sx, sy, camera, viewport);
    };

    const owns = (e: PointerEvent): boolean => {
      const s = ui();
      return (
        !!s.armedMotif &&
        s.tool === "stitch" &&
        e.button === 0 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !s.spaceHeld &&
        !s.panEnabled &&
        !s.referenceImagePanelOpen &&
        !s.picker
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!owns(e)) return;
      const cell = cellAt(e);
      if (!cell) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      gesture = { pointerId: e.pointerId, start: cell };
      canvas.setPointerCapture(e.pointerId);
      ui().setMotifFill({ start: cell, end: cell });
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      const cell = cellAt(e);
      if (cell) ui().setMotifFill({ start: gesture.start, end: cell });
      e.stopImmediatePropagation();
    };

    const finish = (e: PointerEvent) => {
      if (!gesture || e.pointerId !== gesture.pointerId) return;
      e.stopImmediatePropagation();
      const fill = ui().motifFill;
      gesture = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      ui().setMotifFill(null);
      const armed = ui().armedMotif;
      const motif = armed && doc().repeats.find((r) => r.id === armed.id);
      if (e.type !== "pointerup" || !fill || !motif || !armed) return;
      const { origins } = fillOrigins(motif, fill.start, fill.end);
      const placed = doc().stampMotif(motif.id, origins, armed.mirrored);
      const skipped = origins.length - placed;
      if (skipped > 0) {
        ui().flashMotifNotice(
          origins.length === 1
            ? "Doesn't fit here - it would cover existing stitches"
            : `${skipped} of ${origins.length} copies didn't fit`,
        );
      }
    };

    return registerListeners(canvas, [
      ["pointerdown", onPointerDown],
      ["pointermove", onPointerMove],
      ["pointerup", finish],
      ["pointercancel", finish],
    ]);
  }, [ref, getRect]);
}
