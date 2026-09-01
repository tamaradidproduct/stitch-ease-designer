import { type RefObject, useEffect } from "react";
import { screenToCell } from "../canvas/camera";
import { RULER } from "../canvas/theme";
import { useUiStore } from "../state/uiStore";

/**
 * Pan and zoom, wired directly to the canvas element.
 *
 * Pan:  space + drag, middle-drag, or two-finger trackpad scroll.
 * Zoom: cmd/ctrl + wheel, or trackpad pinch. Browsers report a pinch as a
 *       wheel event with ctrlKey set, which is why both paths look alike.
 *
 * Handlers are attached imperatively rather than as React props because the
 * wheel listener must be non-passive to call preventDefault, and because these
 * fire far too often to be routing through a re-render.
 */
export function usePanZoom(ref: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ui = useUiStore.getState;

    // Cached instead of read on every wheel/pointermove, since
    // getBoundingClientRect forces a layout read.
    let rect = canvas.getBoundingClientRect();
    const updateRect = () => {
      rect = canvas.getBoundingClientRect();
    };
    const rectObserver = new ResizeObserver(updateRect);
    rectObserver.observe(canvas);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (e.ctrlKey || e.metaKey) {
        // Clamped so a flicked trackpad or a coarse mouse wheel can't jump
        // several zoom levels in one event. A mouse notch (deltaY 100+) lands
        // at the clamp and moves ~23%; trackpad pinch sends small deltas and
        // stays smooth.
        const delta = Math.max(-60, Math.min(60, e.deltaY));
        ui().zoomAt(Math.exp(-delta * 0.0035), sx, sy);
      } else {
        ui().panByScreen(-e.deltaX, -e.deltaY);
      }
    };

    // Keyed to the pointer that started the gesture (and the button that
    // started it) so a second pointer or an unrelated button release
    // in-flight can't hijack or prematurely end an active pan.
    type Pan = { pointerId: number; button: number; lastX: number; lastY: number };
    let pan: Pan | null = null;

    const onPointerDown = (e: PointerEvent) => {
      const wantsPan = e.button === 1 || (e.button === 0 && ui().spaceHeld);
      if (!wantsPan || pan) return;
      e.preventDefault();
      pan = { pointerId: e.pointerId, button: e.button, lastX: e.clientX, lastY: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      ui().setPanning(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pan) {
        if (e.pointerId === pan.pointerId) {
          ui().panByScreen(e.clientX - pan.lastX, e.clientY - pan.lastY);
          pan.lastX = e.clientX;
          pan.lastY = e.clientY;
        }
        return;
      }

      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // The rulers float above the canvas, including their border stroke at
      // RULER..RULER+1; cells beneath them aren't hoverable.
      if (sx <= RULER || sy <= RULER) {
        ui().setHover(null);
        return;
      }
      const { camera, viewport } = ui();
      ui().setHover(screenToCell(sx, sy, camera, viewport));
    };

    const endPan = (e: PointerEvent) => {
      if (!pan || e.pointerId !== pan.pointerId) return;
      // pointerup fires for any button release; only end the gesture when
      // it's the button that started it. pointercancel has no meaningful
      // button and always ends the gesture.
      if (e.type === "pointerup" && e.button !== pan.button) return;
      const { pointerId } = pan;
      pan = null;
      if (canvas.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
      ui().setPanning(false);
    };

    const onPointerLeave = () => {
      if (!pan) ui().setHover(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        // Otherwise space scrolls the page / activates a focused control.
        e.preventDefault();
        ui().setSpaceHeld(true);
      }
      if (e.code === "Digit0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ui().resetView();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") ui().setSpaceHeld(false);
    };

    // Releasing space while the window is unfocused would otherwise leave the
    // canvas stuck in pan mode.
    const onBlur = () => ui().setSpaceHeld(false);

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endPan);
    canvas.addEventListener("pointercancel", endPan);
    canvas.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);

    return () => {
      rectObserver.disconnect();
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endPan);
      canvas.removeEventListener("pointercancel", endPan);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [ref]);
}
