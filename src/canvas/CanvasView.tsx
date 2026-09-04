import { useEffect, useRef } from "react";
import { canInsertAt } from "../model/ops";
import { usePaintTool } from "../input/usePaintTool";
import { usePanZoom } from "../input/usePanZoom";
import { useReferenceImageTool } from "../input/useReferenceImageTool";
import { useShortcuts } from "../input/useShortcuts";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import {
  ADD_CURSOR,
  BLOCKED_MOVE_CURSOR,
  DUPLICATE_CURSOR,
  ERASE_CURSOR,
  GRAB_CURSOR,
  GRABBING_CURSOR,
  INSERT_ADD_CURSOR,
  INSERT_BLOCKED_CURSOR,
  armedStitchCursor,
  insertStitchCursor,
} from "./cursors";
import { ReferenceImageCache } from "./referenceImageCache";
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
  // The cursor selector below reads useDocStore.getState().index imperatively
  // (it isn't itself a useDocStore selector), so without this subscription a
  // doc-only change like undo/redo - which bumps revision without touching
  // uiStore - never re-runs it, leaving a stale cursor until the next
  // hover-changing pointer move.
  useDocStore((s) => s.revision);
  const cursor = useUiStore((s) => {
    if (s.picker) return "default";
    // The panel owns the canvas entirely while it's open - every state below
    // this is about a tool it has already overridden the hover/selection
    // feedback for.
    if (s.referenceImagePanelOpen) {
      // Both calibration modes aim at a specific point, which is exactly
      // what a crosshair is for.
      if (s.referenceImageCalibrating || s.referenceImageMarking) return "crosshair";
      const image = useDocStore.getState().referenceImage;
      if (!image || !image.visible || image.locked) return "default";
      // Handles say which way they resize; everywhere else on the image is
      // a move. The edges have no drawn marker of their own, so this cursor
      // is the only thing announcing them - which is how every other design
      // tool does it too.
      const handle = s.referenceImageHandle?.handle;
      if (handle === "l" || handle === "r") return "ew-resize";
      if (handle === "t" || handle === "b") return "ns-resize";
      if (handle) return handle === "bl" || handle === "tr" ? "nesw-resize" : "nwse-resize";
      return "move";
    }
    if (s.selectionMove) {
      if (s.selectionMove.blocked) return BLOCKED_MOVE_CURSOR;
      return s.selectionMove.duplicating ? DUPLICATE_CURSOR : GRABBING_CURSOR;
    }
    if (s.isPanning) return GRABBING_CURSOR;
    if (s.spaceHeld) return GRAB_CURSOR;
    if (s.keyboardSelectionActive) return "default";
    // An existing selection is draggable from any tool, so its own cells
    // always get the "grab" cursor - checked before the tool-specific cases.
    if (s.selectedPlacementIds.length) {
      const hovered = s.hover
        ? useDocStore.getState().index.placementAt(s.hover.col, s.hover.row)
        : undefined;
      if (hovered && s.selectedPlacementIds.includes(hovered.id)) return GRAB_CURSOR;
    }
    const hovered = s.hover
      ? useDocStore.getState().index.placementAt(s.hover.col, s.hover.row)
      : undefined;
    if (s.tool === "select" || s.selectHeld) {
      if (s.tool === "select" && !hovered) return "crosshair";
      return "default";
    }
    if (s.tool === "eraser") return ERASE_CURSOR;
    if (s.tool === "insert") {
      // No insertHover yet (over the ruler, or before the first pointer
      // move) isn't a blocked target - it's just nothing to judge yet.
      const ok =
        !s.insertHover || canInsertAt(useDocStore.getState().index, s.insertHover.col, s.insertHover.row);
      if (!ok) return INSERT_BLOCKED_CURSOR;
      return s.armedSymbolId ? insertStitchCursor(s.armedSymbolId) : INSERT_ADD_CURSOR;
    }
    // Draw leaves existing stitches as plain-arrow selection targets. Empty
    // cells carry either the add badge or the armed-stitch preview.
    if (hovered) return "default";
    return s.armedSymbolId ? armedStitchCursor(s.armedSymbolId) : ADD_CURSOR;
  });

  // Registered first so it gets first refusal on every pointer event - it
  // claims a drag (and stops the event reaching the tools below) only when
  // its panel is open and the click actually lands on the image.
  useReferenceImageTool(ref);
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
    const referenceImages = new ReferenceImageCache(markDirty);

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
        state.insertAnimation !== prev.insertAnimation ||
        state.picker !== prev.picker ||
        state.selectedPlacementIds !== prev.selectedPlacementIds ||
        state.selectionBox !== prev.selectionBox ||
        state.selectionMove !== prev.selectionMove ||
        state.tool !== prev.tool ||
        state.selectHeld !== prev.selectHeld ||
        state.keyboardSelectionActive !== prev.keyboardSelectionActive ||
        state.referenceImagePanelOpen !== prev.referenceImagePanelOpen ||
        state.referenceImageCalibrationBox !== prev.referenceImageCalibrationBox ||
        state.referenceImageActiveMark !== prev.referenceImageActiveMark
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
        insertAnimation,
        picker,
        selectedPlacementIds,
        tool,
        selectHeld,
        keyboardSelectionActive,
        selectionBox,
        selectionMove,
        referenceImagePanelOpen,
        referenceImageCalibrating,
        referenceImageCalibrationBox,
        referenceImageActiveMark,
      } = useUiStore.getState();
      const { index, revision, referenceImage } = useDocStore.getState();
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      // Work in CSS pixels; the DPR scale is applied once, here.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, {
        camera,
        viewport,
        hover,
        insertHover,
        insertAnimation,
        index,
        revision,
        sprites,
        referenceImage,
        referenceImageCache: referenceImages,
        referenceImagePanelOpen,
        referenceImageCalibrating,
        referenceImageCalibrationBox,
        referenceImagePoints: referenceImage?.calibrationPoints ?? [],
        referenceImageActiveMark,
        pickerTarget: picker,
        selectedPlacementIds,
        tool,
        selectHeld,
        keyboardSelectionActive,
        selectionBox,
        selectionMove,
      });
      ctx.restore();
      if (insertAnimation) {
        if (performance.now() - insertAnimation.startedAt < 220) dirty.current = true;
        else useUiStore.getState().setInsertAnimation(null);
      }
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
