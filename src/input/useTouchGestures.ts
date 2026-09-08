import { type RefObject, useEffect } from "react";
import { useUiStore } from "../state/uiStore";

type Point = { x: number; y: number };

/**
 * Two real fingers touching down within a blink of each other almost never
 * land in the exact same event-loop tick - the first one is indistinguishable
 * from an ordinary single-finger tap-to-draw until the second one shows up,
 * typically tens of milliseconds later. Forwarding that first touch straight
 * downstream (as the pre-holdoff version of this hook did) meant it could
 * already place a stitch before the pan gesture was even recognized. Holding
 * every solo touch for this long before handing it off is what closes that
 * gap; a real one-finger tap almost always outlasts it, so drawing never
 * feels delayed in practice.
 */
const HOLDOFF_MS = 70;

/**
 * Two-finger touch pan + pinch-zoom.
 *
 * A lone finger is held here, briefly, in case a second one is about to
 * join it (see HOLDOFF_MS) - once that window passes with no second finger,
 * it's handed downstream (draw, select, drag a reference image...) via a
 * synthetic pointerdown carrying its original touch-down position. If a
 * second finger does join - before or after that hand-off - this hook takes
 * both over for pan + pinch-zoom, synthesizing a pointercancel for whatever
 * the first finger had already been handed, so that gesture unwinds exactly
 * the way it would if the finger had simply been lifted.
 *
 * Registered ahead of every other pointer hook (see CanvasView) so it gets
 * first refusal on every touch, before useReferenceImageTool, usePanZoom, or
 * usePaintTool ever see one.
 *
 * Apple Pencil reports pointerType "pen", never "touch" - it's ignored here
 * entirely and keeps working exactly like a mouse, including drawing with
 * the pencil in one hand while two fingers on the other pan the canvas.
 */
export function useTouchGestures(ref: RefObject<HTMLCanvasElement | null>): void {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ui = useUiStore.getState;
    const points = new Map<number, Point>();
    // Touch pointers already handed downstream - their moves/lifts are ours
    // to track for gesture-counting purposes, but otherwise none of our
    // business until a second finger arrives.
    const forwarded = new Set<number>();
    let pendingId: number | null = null;
    let pendingDown: Point | null = null;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let gestureActive = false;
    let lastMid: Point | null = null;
    let lastDist = 0;

    const midpoint = (): Point => {
      const [a, b] = [...points.values()];
      return { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    };
    const distance = (): number => {
      const [a, b] = [...points.values()];
      return Math.hypot(a!.x - b!.x, a!.y - b!.y);
    };

    const forward = (type: string, pointerId: number, p: Point) => {
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: "touch",
          clientX: p.x,
          clientY: p.y,
          button: 0,
          buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
          isPrimary: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    };

    const clearPending = () => {
      if (pendingTimer !== null) clearTimeout(pendingTimer);
      pendingTimer = null;
      pendingId = null;
      pendingDown = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Forwarded events are for the hooks below, not for this gesture
      // recognizer to claim a second time.
      if (!e.isTrusted || e.pointerType !== "touch") return;
      if (gestureActive) {
        // A third finger while already panning/zooming: ignored outright,
        // rather than folded into the two-finger math.
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (points.size === 1) {
        // Lone finger: hold it rather than handing it off immediately, in
        // case a second one is about to join (see HOLDOFF_MS above).
        e.preventDefault();
        e.stopImmediatePropagation();
        pendingId = e.pointerId;
        pendingDown = { x: e.clientX, y: e.clientY };
        pendingTimer = setTimeout(() => {
          pendingTimer = null;
          if (pendingId === e.pointerId && pendingDown) {
            const down = pendingDown;
            forward("pointerdown", e.pointerId, down);
            forwarded.add(e.pointerId);
            const current = points.get(e.pointerId);
            if (current && (current.x !== down.x || current.y !== down.y)) {
              forward("pointermove", e.pointerId, current);
            }
          }
          pendingId = null;
          pendingDown = null;
        }, HOLDOFF_MS);
        return;
      }

      // Second finger: claim the gesture outright.
      e.preventDefault();
      e.stopImmediatePropagation();
      clearPending();
      for (const id of points.keys()) {
        if (id !== e.pointerId && forwarded.has(id)) {
          canvas.dispatchEvent(
            new PointerEvent("pointercancel", {
              pointerId: id,
              pointerType: "touch",
              bubbles: true,
              cancelable: true,
            }),
          );
        }
      }
      gestureActive = true;
      canvas.setPointerCapture(e.pointerId);
      lastMid = midpoint();
      lastDist = distance();
      ui().setPanning(true);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!e.isTrusted || e.pointerType !== "touch" || !points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (gestureActive) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (points.size < 2) {
          lastMid = null;
          lastDist = 0;
          return;
        }
        const mid = midpoint();
        const dist = distance();
        if (lastMid) ui().panByScreen(mid.x - lastMid.x, mid.y - lastMid.y);
        if (lastDist > 0 && dist > 0) {
          const rect = canvas.getBoundingClientRect();
          ui().zoomAt(dist / lastDist, mid.x - rect.left, mid.y - rect.top);
        }
        lastMid = mid;
        lastDist = dist;
        return;
      }

      if (e.pointerId === pendingId) {
        // Still within the holdoff window - not yet decided, so nothing
        // downstream should see this movement.
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      // Already forwarded and not gesturing: not our concern, let it bubble.
    };

    const endGesture = (e: PointerEvent) => {
      // Our own synthetic dispatches are for the hooks below to hear, not
      // this one - this hook's own bookkeeping only reacts to real touches.
      if (!e.isTrusted) return;
      if (e.pointerType !== "touch" || !points.has(e.pointerId)) return;

      if (e.pointerId === pendingId && pendingDown) {
        // Lifted before the holdoff window closed - still a legitimate
        // one-finger gesture (most taps are exactly this fast), so hand it
        // off now: a synthetic down at its original position immediately
        // followed by the real up, rather than dropping it on the floor.
        const down = pendingDown;
        clearPending();
        points.delete(e.pointerId);
        e.preventDefault();
        e.stopImmediatePropagation();
        forward("pointerdown", e.pointerId, down);
        forward(e.type, e.pointerId, { x: e.clientX, y: e.clientY });
        return;
      }

      points.delete(e.pointerId);
      forwarded.delete(e.pointerId);

      if (gestureActive) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (points.size === 0) {
        if (gestureActive) {
          gestureActive = false;
          if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
          ui().setPanning(false);
        }
        lastMid = null;
        lastDist = 0;
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endGesture);
    canvas.addEventListener("pointercancel", endGesture);

    return () => {
      clearPending();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", endGesture);
      canvas.removeEventListener("pointercancel", endGesture);
    };
  }, [ref]);
}
