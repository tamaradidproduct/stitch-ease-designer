import { useEffect, useRef } from "react";
import { canInsertAt } from "../model/ops";
import { usePaintTool } from "../input/usePaintTool";
import { usePanZoom } from "../input/usePanZoom";
import { useShortcuts } from "../input/useShortcuts";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { DUPLICATE_CURSOR } from "./cursors";
import { render } from "./renderer";
import { SpriteCache } from "./spriteCache";

/**
 * React host for the canvas: owns sizing, devicePixelRatio, and the animation
 * frame. React never re-renders on camera or hover changes — the store is
 * subscribed to imperatively and simply marks the next frame dirty.
 */
export function CanvasView() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const dirty = useRef(true);
  useDocStore((s) => s.revision);
  const cursor = useUiStore((s) => {
    if (s.picker) return "default";
    if (s.selectionMove) {
      if (s.selectionMove.blocked) return "not-allowed";
      return s.selectionMove.duplicating ? DUPLICATE_CURSOR : "grabbing";
    }
    if (s.isPanning) return "grabbing";
    if (s.spaceHeld) return "grab";
    // An existing selection is draggable from any tool, so its own cells
    // always get the "grab" cursor - checked before the tool-specific cases.
    if (s.selectedPlacementIds.length) {
      const hovered = s.hover
        ? useDocStore.getState().index.placementAt(s.hover.col, s.hover.row)
        : undefined;
      if (hovered && s.selectedPlacementIds.includes(hovered.id)) return "grab";
    }
    const hovered = s.hover
      ? useDocStore.getState().index.placementAt(s.hover.col, s.hover.row)
      : undefined;
    if (s.tool === "select" || s.selectHeld) {
      if (s.tool === "select" && !hovered) return "crosshair";
      return "default";
    }
    if (s.tool === "eraser") return "cell";
    if (s.tool === "insert") {
      if (!s.insertHover) return "cell";
      const ok = canInsertAt(useDocStore.getState().index, s.insertHover.col, s.insertHover.row);
      return ok ? "cell" : "not-allowed";
    }
    // Draw: a filled, unselected cell is a click-to-select target, not a
    // place target - "pointer" reads as clickable the way "crosshair" doesn't.
    return hovered ? "pointer" : "crosshair";
  });

  usePanZoom(ref);
  usePaintTool(ref);
  useShortcuts();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const markDirty = () => {
      dirty.current = true;
    };

    // A glyph finishing rasterisation has to trigger another frame, or it
    // won't appear until something else happens to invalidate the canvas.
    const sprites = new SpriteCache(markDirty);

    /**
     * Match the backing store to the element's CSS size. Idempotent, so it's
     * safe to call every frame: setting canvas.width also clears the canvas,
     * which is why it must not run unless something actually changed.
     */
    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(canvas.clientWidth));
      const height = Math.max(1, Math.round(canvas.clientHeight));
      const backingWidth = Math.round(width * dpr);
      const backingHeight = Math.round(height * dpr);

      if (canvas.width === backingWidth && canvas.height === backingHeight) return;

      canvas.width = backingWidth;
      canvas.height = backingHeight;
      useUiStore.getState().setViewport({ width, height });
      markDirty();
    };

    // ResizeObserver is the efficient path, but it can't be the only one: it
    // doesn't fire in every embedding, and a canvas stuck at a stale size is
    // invisible until you try to click something. The frame loop re-checks.
    const observer = new ResizeObserver(syncSize);
    observer.observe(canvas);
    window.addEventListener("resize", syncSize);
    syncSize();

    // Plain (non-selector) subscribe so we can diff exactly the fields the
    // renderer reads; spaceHeld/isPanning changes (handled by the cursor
    // selector above) shouldn't force an extra repaint.
    const unsubscribeUi = useUiStore.subscribe((state, prev) => {
      if (
        state.camera !== prev.camera ||
        state.viewport !== prev.viewport ||
        state.hover !== prev.hover ||
        state.insertHover !== prev.insertHover ||
        state.armedSymbolId !== prev.armedSymbolId ||
        state.selectedPlacementIds !== prev.selectedPlacementIds ||
        state.selectionBox !== prev.selectionBox ||
        state.selectionMove !== prev.selectionMove ||
        state.tool !== prev.tool ||
        state.selectHeld !== prev.selectHeld
      ) {
        markDirty();
      }
    });
    const unsubscribeDoc = useDocStore.subscribe(markDirty);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      syncSize();
      if (!dirty.current) return;
      dirty.current = false;

      const {
        camera,
        viewport,
        hover,
        insertHover,
        armedSymbolId,
        picker,
        selectedPlacementIds,
        tool,
        selectHeld,
        selectionBox,
        selectionMove,
      } = useUiStore.getState();
      const { index } = useDocStore.getState();
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      // Work in CSS pixels; the DPR scale is applied once, here.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // While the picker is open, the cursor isn't armed to place anything —
      // showing the stitch preview underneath the popover would suggest a
      // click still drops a stitch where it doesn't.
      render(ctx, {
        camera,
        viewport,
        hover,
        insertHover,
        index,
        sprites,
        armedSymbolId: picker ? null : armedSymbolId,
        selectedPlacementIds,
        tool,
        selectHeld,
        selectionBox,
        selectionMove,
      });
      ctx.restore();
    };
    frame = requestAnimationFrame(loop);

    // devicePixelRatio changes when the window moves between displays. A
    // MediaQueryList only fires once its match state flips relative to the
    // DPR it was created with, so a single query can't track a window that
    // hops across three or more displays (e.g. 1x -> 2x fires, but 2x -> 3x
    // wouldn't flip the original 1x-based query) — recreate it on every fire
    // so it's always watching the current DPR.
    let media: MediaQueryList;
    const watchDpr = () => {
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      media.addEventListener("change", onDprChange);
    };
    const onDprChange = () => {
      media.removeEventListener("change", onDprChange);
      syncSize();
      watchDpr();
    };
    watchDpr();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribeUi();
      unsubscribeDoc();
      sprites.clear();
      window.removeEventListener("resize", syncSize);
      media.removeEventListener("change", onDprChange);
    };
  }, []);

  return <canvas ref={ref} className="canvas" style={{ cursor }} />;
}
