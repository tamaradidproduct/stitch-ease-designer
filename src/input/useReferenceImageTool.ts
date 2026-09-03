import { type RefObject, useEffect } from "react";
import { CELL, type Point, screenToWorld } from "../canvas/camera";
import { resizeReferenceImageAround, type ReferenceImage } from "../model/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/** Hit-radius for the resize handle, in screen px (constant regardless of zoom). */
const HANDLE_PX = 10;
/** Smallest a reference image can be scaled down to, in world units. */
const MIN_SIZE = 24;
/**
 * Smallest calibration box (in world units, per axis) that's trusted as a
 * deliberate drag rather than a stray click - below this, the scale factor
 * it implies would be wild.
 */
const MIN_CALIBRATION_SIZE = 4;

type Drag =
  | { mode: "move"; startWorldX: number; startWorldY: number; startImageX: number; startImageY: number }
  | {
      mode: "scale";
      startWorldX: number;
      startWorldY: number;
      startImageX: number;
      topY: number;
      startWidth: number;
      startHeight: number;
    }
  | { mode: "calibrate"; start: Point };

/**
 * Computes the transform that makes the box the user just drew equal one
 * chart cell, keeping the box's own centre fixed in world space - the
 * stitch they circled stays roughly where it was, everything else in the
 * image scales around it. Width and height are calibrated independently, so
 * a source chart with non-square stitches ends up matching the app's square
 * grid rather than merely being scaled uniformly.
 *
 * Returns null for a box too small to trust (a click that didn't really
 * drag) rather than applying a wild scale factor.
 */
function calibrationTransform(
  image: ReferenceImage,
  box: { start: Point; current: Point },
): Partial<ReferenceImage> | null {
  const boxWidth = Math.abs(box.current.x - box.start.x);
  const boxHeight = Math.abs(box.current.y - box.start.y);
  if (boxWidth < MIN_CALIBRATION_SIZE || boxHeight < MIN_CALIBRATION_SIZE) return null;

  const width = Math.max(MIN_SIZE, image.width * (CELL / boxWidth));
  const height = Math.max(MIN_SIZE, image.height * (CELL / boxHeight));
  const center = { x: (box.start.x + box.current.x) / 2, y: (box.start.y + box.current.y) / 2 };
  return resizeReferenceImageAround(image, width, height, center);
}

/**
 * Drag-to-move, drag-to-resize, and draw-a-box-to-calibrate for the
 * reference image, active only while its panel is open and it's unlocked -
 * closing the panel hands the canvas back to the normal tools entirely,
 * rather than leaving a mode active that has to be separately remembered
 * and exited.
 *
 * Registered before `usePaintTool`/`usePanZoom` in `CanvasView`, and calls
 * `stopImmediatePropagation` the moment it claims a drag, so the two never
 * both act on the same click - one image, one gesture, no ambiguity about
 * which one wins.
 */
export function useReferenceImageTool(ref: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    let drag: Drag | null = null;

    const worldAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { camera, viewport } = useUiStore.getState();
      return screenToWorld(e.clientX - rect.left, e.clientY - rect.top, camera, viewport);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || !useUiStore.getState().referenceImagePanelOpen) return;
      const image = useDocStore.getState().referenceImage;
      if (!image) return;

      const w = worldAt(e);

      // Calibrating wins outright: it's an explicit, one-shot mode armed
      // from the panel, and works anywhere on the canvas - the box being
      // drawn doesn't have to start inside the image's current bounds.
      if (useUiStore.getState().referenceImageCalibrating) {
        e.preventDefault();
        e.stopImmediatePropagation();
        drag = { mode: "calibrate", start: w };
        useUiStore.getState().setReferenceImageCalibrationBox({ start: w, current: w });
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (image.locked || !image.visible) return;

      const handleRadius = HANDLE_PX / useUiStore.getState().camera.zoom;
      const cornerX = image.x + image.width;
      const cornerY = image.y;

      const onHandle =
        Math.abs(w.x - cornerX) <= handleRadius && Math.abs(w.y - cornerY) <= handleRadius;
      const inside =
        w.x >= image.x &&
        w.x <= image.x + image.width &&
        w.y >= image.y &&
        w.y <= image.y + image.height;
      if (!onHandle && !inside) return; // outside the image entirely - let the active tool handle it

      e.preventDefault();
      e.stopImmediatePropagation();
      drag = onHandle
        ? {
            mode: "scale",
            startWorldX: w.x,
            startWorldY: w.y,
            startImageX: image.x,
            topY: image.y + image.height,
            startWidth: image.width,
            startHeight: image.height,
          }
        : { mode: "move", startWorldX: w.x, startWorldY: w.y, startImageX: image.x, startImageY: image.y };
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag) return;
      e.stopImmediatePropagation();
      const w = worldAt(e);
      if (drag.mode === "move") {
        useDocStore.getState().updateReferenceImage({
          x: drag.startImageX + (w.x - drag.startWorldX),
          y: drag.startImageY + (w.y - drag.startWorldY),
        });
      } else if (drag.mode === "scale") {
        // Anchored at the untouched top-left corner (startImageX, topY) -
        // the dragged bottom-right corner moves freely on both axes, so by
        // default this stretches width and height independently. Holding
        // Shift locks the source image's aspect ratio, for the common case
        // where the chart really is drawn on a square grid.
        let width = Math.max(MIN_SIZE, drag.startWidth + (w.x - drag.startWorldX));
        let height = Math.max(MIN_SIZE, drag.startHeight + (drag.startWorldY - w.y));
        if (e.shiftKey) {
          const scale = Math.max(width / drag.startWidth, height / drag.startHeight);
          width = Math.max(MIN_SIZE, drag.startWidth * scale);
          height = Math.max(MIN_SIZE, drag.startHeight * scale);
        }
        useDocStore.getState().updateReferenceImage({ width, height, y: drag.topY - height });
      } else {
        useUiStore.getState().setReferenceImageCalibrationBox({ start: drag.start, current: w });
      }
    };

    const endDrag = (e: PointerEvent) => {
      if (!drag) return;
      e.stopImmediatePropagation();
      if (drag.mode === "calibrate") {
        const box = useUiStore.getState().referenceImageCalibrationBox;
        const image = useDocStore.getState().referenceImage;
        if (box && image) {
          const transform = calibrationTransform(image, box);
          if (transform) useDocStore.getState().updateReferenceImage(transform);
        }
        useUiStore.getState().setReferenceImageCalibrationBox(null);
        useUiStore.getState().setReferenceImageCalibrating(false);
      }
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
    };
  }, [ref]);
}
