import { type RefObject, useEffect } from "react";
import { CELL, type Point, screenToWorld } from "../canvas/camera";
import {
  CORNERS,
  EDGES,
  OPPOSITE_CORNER,
  cornerPoint,
  handleSigns,
  resizeReferenceImageAround,
  stitchBoxRect,
  type BoxHandle,
  type CalibrationMark,
  type Corner,
  type ReferenceImage,
} from "../model/types";
import {
  addCalibrationMark,
  newCalibrationMarkId,
  patchCalibrationMark,
  snapImageToGrid,
} from "../model/referenceCalibration";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/** Hit-radius for the resize handle, in screen px (constant regardless of zoom). */
const HANDLE_PX = 10;
/** Smallest a reference image can be scaled down to, in world units. */
const MIN_SIZE = 24;
/**
 * Smallest calibration box (in *screen* px, per axis) that's trusted as a
 * deliberate drag rather than a stray click - below this, the scale factor
 * it implies would be wild.
 *
 * Screen px, not world units, because "did they actually drag?" is a
 * question about the gesture, not about the chart. In world units this
 * threshold silently rejected legitimate boxes on any image scaled far
 * enough down: a chart photo sized to 18% puts one row at ~3.7 world
 * units, under a 4-unit floor, so every attempt to calibrate it failed
 * with no visible reason.
 */
const MIN_CALIBRATION_PX = 5;

type Rect = { x: number; y: number; width: number; height: number };

type Drag =
  | {
      mode: "move";
      startWorldX: number;
      startWorldY: number;
      startImageX: number;
      startImageY: number;
      /** Size is fixed while moving, but snapping needs it to place the pin. */
      width: number;
      height: number;
      /** Null when uncalibrated, which is also when there's nothing to snap. */
      pin: { u: number; v: number } | null;
    }
  | {
      mode: "scale";
      handle: BoxHandle;
      startWorld: Point;
      start: Rect;
      /**
       * The calibrated stitch's bottom-left corner, held fixed for the whole
       * drag, plus its fractional position in the image (constant while
       * resizing). Null before the image has ever been calibrated, in which
       * case the drag anchors the corner opposite the one being dragged.
       */
      pin: { point: Point; u: number; v: number } | null;
    }
  | {
      /**
       * Resizing the calibrated stitch box itself, which is really a
       * recalibration: the image is rescaled so the box the user is dragging
       * out ends up exactly one cell again.
       */
      mode: "stitchResize";
      startImage: Rect;
      /** The box corner opposite the dragged one - fixed in world space... */
      anchorWorld: Point;
      /** ...and as a fraction of the image, which the rescale preserves. */
      anchorFrac: { x: number; y: number };
    }
  | { mode: "calibrate"; start: Point }
  | {
      /**
       * Sliding an already-boxed stitch onto the right one. Boxes are a few
       * dozen source pixels across, so being able to correct one without
       * redrawing it is what makes four of them worth collecting.
       */
      mode: "markMove";
      id: string;
      /** Grab offset within the box, so it doesn't jump to the cursor. */
      grabU: number;
      grabV: number;
    }
  | {
      /** Dragging out a new box around a stitch, exactly as calibration does. */
      mode: "markDraw";
      start: Point;
    };

/**
 * Computes the transform that makes the box the user just drew equal one
 * chart cell, keeping the box's own **bottom-left corner** fixed in world
 * space - everything else in the image scales around it. Width and height
 * are calibrated independently, so a source chart with non-square stitches
 * ends up matching the app's square grid rather than merely being scaled
 * uniformly.
 *
 * The bottom-left corner rather than the centre because that corner is what
 * the designer actually lines up with a grid intersection, and it stays the
 * anchor for every later resize (see `stitchBox`) - so this is the one
 * point on the image that never moves again unless the whole image is
 * dragged.
 *
 * Returns null for a box too small to trust (a click that didn't really
 * drag) rather than applying a wild scale factor.
 *
 * Exported for tests: the world-units-vs-screen-px distinction in its size
 * guard is exactly what made calibration fail on scaled-down images, and
 * that's worth pinning down.
 */
export function calibrationTransform(
  image: ReferenceImage,
  box: { start: Point; current: Point },
  zoom: number,
): Partial<ReferenceImage> | null {
  const boxWidth = Math.abs(box.current.x - box.start.x);
  const boxHeight = Math.abs(box.current.y - box.start.y);
  const minWorld = MIN_CALIBRATION_PX / zoom;
  if (boxWidth < minWorld || boxHeight < minWorld) return null;

  const width = Math.max(MIN_SIZE, image.width * (CELL / boxWidth));
  const height = Math.max(MIN_SIZE, image.height * (CELL / boxHeight));
  // Bottom-left in world space: smallest x, and smallest y since +y is up.
  const anchor = {
    x: Math.min(box.start.x, box.current.x),
    y: Math.min(box.start.y, box.current.y),
  };
  const resized = resizeReferenceImageAround(image, width, height, anchor);
  return {
    ...resized,
    // The anchor is fixed by construction, so its fractional position is
    // just as valid against the new geometry as the old. Only the corner is
    // recorded: the box it marks is one cell by definition.
    stitchPin: {
      u: (anchor.x - resized.x) / resized.width,
      v: (anchor.y - resized.y) / resized.height,
    },
  };
}

/**
 * Resizing the calibrated stitch box is really a recalibration: whatever
 * rectangle the drag defines has to come out as exactly one cell, so the
 * box's new size *is* the image's new scale. `anchorFrac` - the fraction of
 * the image where the untouched opposite corner sits - is what survives the
 * rescale unchanged, which is what keeps that corner nailed to
 * `anchorWorld`.
 *
 * The cursor is read against `startImage` rather than the live geometry,
 * because the image is being rescaled underneath as the drag goes: deriving
 * the fraction from the current size each frame would feed the rescale back
 * into its own input and run away.
 *
 * Returns null while the box is too small to be a real drag - the same
 * floor calibration uses, and for the same reason: `CELL / boxW` explodes
 * as the box approaches zero.
 */
export function stitchResizeTransform(
  startImage: Rect,
  anchorWorld: Point,
  anchorFrac: { x: number; y: number },
  cursor: Point,
  zoom: number,
): Partial<ReferenceImage> | null {
  // The green box is a stitch *in this image*, so its dragged corner cannot
  // leave the image's own 0..1 coordinate space. Besides keeping the box
  // meaningful, this prevents persisting an invalid stitchPin that the chart
  // serializer would reject on the next reload.
  const fx = Math.max(0, Math.min(1, (cursor.x - startImage.x) / startImage.width));
  const fy = Math.max(0, Math.min(1, (cursor.y - startImage.y) / startImage.height));
  const boxW = Math.abs(fx - anchorFrac.x);
  const boxH = Math.abs(fy - anchorFrac.y);

  const minWorld = MIN_CALIBRATION_PX / zoom;
  if (boxW * startImage.width < minWorld || boxH * startImage.height < minWorld) return null;

  const width = Math.max(MIN_SIZE, CELL / boxW);
  const height = Math.max(MIN_SIZE, CELL / boxH);
  return {
    width,
    height,
    x: anchorWorld.x - anchorFrac.x * width,
    y: anchorWorld.y - anchorFrac.y * height,
    stitchPin: { u: Math.min(fx, anchorFrac.x), v: Math.min(fy, anchorFrac.y) },
  };
}

/**
 * Which corner handle - of the stitch box or of the image - the world-space
 * point `w` is on, or null for neither.
 *
 * The stitch box is tested first: it sits inside the image, so its handles
 * would otherwise be unreachable, and it's the finer of the two controls.
 * Its handles are skipped entirely when the box is drawn too small to aim
 * at, so a stitch box shrunk to a speck can't quietly swallow every click
 * meant for the image underneath it.
 */
/**
 * The boxed stitch under the cursor, if any - so pressing inside one slides
 * it instead of drawing a second box on top of it.
 *
 * The whole box is the grab target, which is the point of using boxes:
 * there is no small handle to miss, so a press that lands on the stitch you
 * meant always picks up the mark on it.
 */
function markAt(image: ReferenceImage, w: Point): CalibrationMark | null {
  const u = (w.x - image.x) / image.width;
  const v = (w.y - image.y) / image.height;
  // Last first, so the most recently drawn box wins where two overlap.
  for (const m of [...(image.calibrationMarks ?? [])].reverse()) {
    if (u >= m.u && u <= m.u + m.w && v >= m.v && v <= m.v + m.h) return m;
  }
  return null;
}

/**
 * Turns a dragged-out box into a mark, in image fractions.
 *
 * Rejects a box too small to be a deliberate drag, on the same screen-pixel
 * footing as calibration - a stray click would otherwise leave a
 * zero-width mark that no fit could use and nothing on screen to grab.
 */
export function markFromBox(
  image: Pick<ReferenceImage, "x" | "y" | "width" | "height">,
  box: { start: Point; current: Point },
  zoom: number,
): CalibrationMark | null {
  const minWorld = MIN_CALIBRATION_PX / zoom;
  if (Math.abs(box.current.x - box.start.x) < minWorld) return null;
  if (Math.abs(box.current.y - box.start.y) < minWorld) return null;

  const left = Math.min(box.start.x, box.current.x);
  const bottom = Math.min(box.start.y, box.current.y);
  const u = (left - image.x) / image.width;
  const v = (bottom - image.y) / image.height;
  const w = Math.abs(box.current.x - box.start.x) / image.width;
  const h = Math.abs(box.current.y - box.start.y) / image.height;
  // A box drawn partly off the photo names no stitch on it.
  if (u < 0 || v < 0 || u + w > 1 || v + h > 1) return null;

  return { id: newCalibrationMarkId(), u, v, w, h, stitch: null, row: null };
}

export function handleAt(
  image: ReferenceImage,
  w: Point,
  zoom: number,
): { target: "image" | "stitch"; handle: BoxHandle } | null {
  const radius = HANDLE_PX / zoom;
  const nearCorner = (rect: Rect, corner: BoxHandle) => {
    const p = cornerPoint(rect, corner as Parameters<typeof cornerPoint>[1]);
    return Math.abs(w.x - p.x) <= radius && Math.abs(w.y - p.y) <= radius;
  };

  const stitch = stitchBoxRect(image);
  // The stitch box gets corners only. It's one cell across, so four more
  // hit zones along its sides would overlap the corners at any workable
  // zoom and make the corners themselves hard to hit.
  if (stitch && stitch.width * zoom >= 2 * HANDLE_PX && stitch.height * zoom >= 2 * HANDLE_PX) {
    for (const corner of CORNERS) {
      if (nearCorner(stitch, corner)) return { target: "stitch", handle: corner };
    }
  }

  for (const corner of CORNERS) {
    if (nearCorner(image, corner)) return { target: "image", handle: corner };
  }

  // Edges last, so a corner always wins the overlap where the two meet.
  const withinX = w.x >= image.x - radius && w.x <= image.x + image.width + radius;
  const withinY = w.y >= image.y - radius && w.y <= image.y + image.height + radius;
  for (const edge of EDGES) {
    const hit =
      edge === "l" ? Math.abs(w.x - image.x) <= radius && withinY
      : edge === "r" ? Math.abs(w.x - (image.x + image.width)) <= radius && withinY
      : edge === "b" ? Math.abs(w.y - image.y) <= radius && withinX
      : Math.abs(w.y - (image.y + image.height)) <= radius && withinX;
    if (hit) return { target: "image", handle: edge };
  }
  return null;
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
        useUiStore.getState().setReferenceImageCalibrationRejected(false);
        useUiStore.getState().setReferenceImageCalibrationBox({ start: w, current: w });
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      if (image.locked || !image.visible) return;

      const zoom = useUiStore.getState().camera.zoom;

      // Marking is a mode too, but unlike the box it only claims clicks on
      // the image itself - the marks name stitches *in the photo*, so a
      // click outside it can't mean anything and is left to pan/zoom.
      if (useUiStore.getState().referenceImageMarking) {
        // Marking claims every click on the canvas, including ones that
        // miss the photo. Letting a stray click through drew a stitch
        // underneath the marks instead, which is both destructive and
        // invisible while the photo is covering it.
        e.preventDefault();
        e.stopImmediatePropagation();

        const existing = markAt(image, w);
        if (existing) {
          // Inside a box already drawn: slide it, keeping the grab point
          // under the cursor.
          useUiStore.getState().setReferenceImageActiveMark(existing.id);
          drag = {
            mode: "markMove",
            id: existing.id,
            grabU: (w.x - image.x) / image.width - existing.u,
            grabV: (w.y - image.y) / image.height - existing.v,
          };
          canvas.setPointerCapture(e.pointerId);
          return;
        }

        // Otherwise draw a new box, the same gesture as "Set stitch size".
        useUiStore.getState().setReferenceImageActiveMark(null);
        drag = { mode: "markDraw", start: w };
        useUiStore.getState().setReferenceImageCalibrationBox({ start: w, current: w });
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const handle = handleAt(image, w, zoom);
      const inside =
        w.x >= image.x &&
        w.x <= image.x + image.width &&
        w.y >= image.y &&
        w.y <= image.y + image.height;
      if (!handle && !inside) return; // outside the image entirely - let the active tool handle it

      e.preventDefault();
      e.stopImmediatePropagation();

      const stitch = stitchBoxRect(image);
      if (handle?.target === "stitch" && stitch) {
        // Anchor the opposite corner of the box, in world space and as a
        // fraction of the image - the fraction is what survives the rescale.
        const anchor = cornerPoint(stitch, OPPOSITE_CORNER[handle.handle as Corner]);
        drag = {
          mode: "stitchResize",
          startImage: { x: image.x, y: image.y, width: image.width, height: image.height },
          anchorWorld: anchor,
          anchorFrac: {
            x: (anchor.x - image.x) / image.width,
            y: (anchor.y - image.y) / image.height,
          },
        };
      } else if (handle) {
        drag = {
          mode: "scale",
          handle: handle.handle,
          startWorld: w,
          start: { x: image.x, y: image.y, width: image.width, height: image.height },
          pin:
            stitch && image.stitchPin
              ? { point: { x: stitch.x, y: stitch.y }, u: image.stitchPin.u, v: image.stitchPin.v }
              : null,
        };
      } else {
        drag = {
          mode: "move",
          startWorldX: w.x,
          startWorldY: w.y,
          startImageX: image.x,
          startImageY: image.y,
          width: image.width,
          height: image.height,
          pin: image.stitchPin ? { ...image.stitchPin } : null,
        };
      }
      canvas.setPointerCapture(e.pointerId);
    };

    /**
     * Keeps the hovered handle in the store so the cursor can show which way
     * a corner resizes. Only written when it actually changes - this runs on
     * every pointer move, and a store write per frame would re-render the
     * whole canvas shell for nothing.
     */
    const syncHandleHover = (e: PointerEvent) => {
      const ui = useUiStore.getState();
      const image = useDocStore.getState().referenceImage;
      const next =
        ui.referenceImagePanelOpen && !ui.referenceImageCalibrating && image?.visible && !image.locked
          ? handleAt(image, worldAt(e), ui.camera.zoom)
          : null;
      const prev = ui.referenceImageHandle;
      if (next?.target === prev?.target && next?.handle === prev?.handle) return;
      ui.setReferenceImageHandle(next);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drag) {
        syncHandleHover(e);
        return;
      }
      e.stopImmediatePropagation();
      const w = worldAt(e);
      if (drag.mode === "move") {
        const x = drag.startImageX + (w.x - drag.startWorldX);
        const y = drag.startImageY + (w.y - drag.startWorldY);
        // Alt is the usual "ignore snapping" escape hatch, and the arrow
        // keys never snap at all - so dragging gets you onto the grid fast
        // and those two get you off it when a photo genuinely doesn't sit
        // on whole cells.
        useDocStore
          .getState()
          .updateReferenceImage(
            drag.pin && !e.altKey ? snapImageToGrid(x, y, drag, drag.pin) : { x, y },
          );
      } else if (drag.mode === "scale") {
        // One set of rules covers corners and edges alike: a sign of 0 means
        // the handle simply doesn't touch that axis, which is the whole
        // difference between dragging a side and dragging a corner.
        // Delta-based rather than snapping the handle to the cursor, so
        // grabbing one slightly off-centre doesn't jump the image.
        const { sx, sy } = handleSigns(drag.handle);
        let width = sx === 0 ? drag.start.width
          : Math.max(MIN_SIZE, drag.start.width + sx * (w.x - drag.startWorld.x));
        let height = sy === 0 ? drag.start.height
          : Math.max(MIN_SIZE, drag.start.height + sy * (w.y - drag.startWorld.y));
        // Shift locks the source image's aspect ratio, for the common case
        // where the chart really is drawn on a square grid. On an edge that
        // makes the untouched axis follow along, turning a one-axis stretch
        // into a uniform scale.
        if (e.shiftKey) {
          const scale = Math.max(width / drag.start.width, height / drag.start.height);
          width = Math.max(MIN_SIZE, drag.start.width * scale);
          height = Math.max(MIN_SIZE, drag.start.height * scale);
        }
        if (drag.pin) {
          // Once calibrated, the boxed stitch is what holds still whichever
          // handle you grab - so a chart that's been lined up with the grid
          // doesn't come unaligned just because it was resized.
          useDocStore.getState().updateReferenceImage({
            width,
            height,
            x: drag.pin.point.x - drag.pin.u * width,
            y: drag.pin.point.y - drag.pin.v * height,
          });
        } else {
          // Uncalibrated, the opposite side stays put - ordinary resize
          // behaviour. An axis the handle doesn't touch keeps its origin.
          useDocStore.getState().updateReferenceImage({
            width,
            height,
            x: sx === -1 ? drag.start.x + drag.start.width - width : drag.start.x,
            y: sy === -1 ? drag.start.y + drag.start.height - height : drag.start.y,
          });
        }
      } else if (drag.mode === "stitchResize") {
        const next = stitchResizeTransform(
          drag.startImage,
          drag.anchorWorld,
          drag.anchorFrac,
          w,
          useUiStore.getState().camera.zoom,
        );
        if (next) useDocStore.getState().updateReferenceImage(next);
      } else if (drag.mode === "markMove") {
        // Bound to a const so the narrowing survives into the callback -
        // `drag` is reassignable, so TypeScript widens it again inside one.
        const { id, grabU, grabV } = drag;
        const img = useDocStore.getState().referenceImage;
        const mark = img?.calibrationMarks?.find((m) => m.id === id);
        if (!img || !mark) return;
        useDocStore.getState().updateReferenceImage({
          calibrationMarks: patchCalibrationMark(img.calibrationMarks, id, {
            u: Math.max(0, Math.min(1 - mark.w, (w.x - img.x) / img.width - grabU)),
            v: Math.max(0, Math.min(1 - mark.h, (w.y - img.y) / img.height - grabV)),
          }),
        });
      } else if (drag.mode === "markDraw") {
        useUiStore.getState().setReferenceImageCalibrationBox({ start: drag.start, current: w });
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
        const transform =
          box && image
            ? calibrationTransform(image, box, useUiStore.getState().camera.zoom)
            : null;
        if (transform) {
          useDocStore.getState().updateReferenceImage(transform);
          useUiStore.getState().setReferenceImageCalibrating(false);
        } else {
          // Stay armed and say so, rather than dropping out of the mode with
          // nothing to show for it - a rejected box used to be indis-
          // tinguishable from the feature being broken.
          useUiStore.getState().setReferenceImageCalibrationRejected(true);
        }
        useUiStore.getState().setReferenceImageCalibrationBox(null);
      } else if (drag.mode === "markDraw") {
        const box = useUiStore.getState().referenceImageCalibrationBox;
        const image = useDocStore.getState().referenceImage;
        const mark =
          box && image
            ? markFromBox(image, box, useUiStore.getState().camera.zoom)
            : null;
        if (mark) {
          useDocStore.getState().updateReferenceImage({
            calibrationMarks: addCalibrationMark(image!.calibrationMarks, mark),
          });
          // Opening the popover on the stitch just boxed is the whole point
          // of boxing it: the numbers get read off the chart at that spot,
          // while looking at it.
          useUiStore.getState().setReferenceImageActiveMark(mark.id);
        } else {
          useUiStore.getState().setReferenceImageCalibrationRejected(true);
        }
        useUiStore.getState().setReferenceImageCalibrationBox(null);
      }
      drag = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };

    const onPointerLeave = () => useUiStore.getState().setReferenceImageHandle(null);

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
    };
  }, [ref]);
}
