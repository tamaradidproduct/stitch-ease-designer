import { useEffect, useRef } from "react";
import { canInsertAt } from "../model/ops";
import { isDismissable, resolveSuggestAction, usePaintTool } from "../input/usePaintTool";
import { usePanZoom } from "../input/usePanZoom";
import { useReferenceImageTool } from "../input/useReferenceImageTool";
import { useShortcuts } from "../input/useShortcuts";
import { useTouchGestures } from "../input/useTouchGestures";
import { useDocStore } from "../state/docStore";
import { cellKey } from "../model/cellKey";
import { SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import {
  ADD_CURSOR,
  BLOCKED_MOVE_CURSOR,
  CONFIRM_SUGGESTION_CURSOR,
  DISMISS_SUGGESTION_CURSOR,
  DUPLICATE_CURSOR,
  ERASE_CURSOR,
  GRAB_CURSOR,
  GRABBING_CURSOR,
  INSERT_ADD_CURSOR,
  INSERT_BLOCKED_CURSOR,
  STRAIGHT_DRAW_CURSOR,
  SUGGEST_CURSOR,
  armedStitchCursor,
  insertStitchCursor,
} from "./cursors";
import { getSharedReferenceImageCache } from "./referenceImageCache";
import { pickRenderUiFields, RENDER_UI_FIELDS } from "./canvasRenderFields";
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
  // A hot-reloaded renderer can change without any store state changing.
  // Re-render once so visual-only edits appear immediately in the preview.
  useEffect(() => {
    dirty.current = true;
  });
  // The cursor selector below reads useDocStore.getState().index imperatively
  // (it isn't itself a useDocStore selector), so without this subscription a
  // doc-only change like undo/redo - which bumps revision without touching
  // uiStore - never re-runs it, leaving a stale cursor until the next
  // hover-changing pointer move.
  useDocStore((s) => s.revision);
  const cursor = useUiStore((s) => {
    if (s.picker) return "default";
    // Space is a canvas-level pan modifier. It deliberately wins even while
    // editing a reference image, otherwise the image's move/resize cursor
    // implies the next drag will edit the image rather than pan the view.
    if (s.isPanning) return GRABBING_CURSOR;
    if (s.spaceHeld || s.panEnabled) return GRAB_CURSOR;
    // The panel owns the canvas entirely while it's open - every state below
    // this is about a tool it has already overridden the hover/selection
    // feedback for.
    if (s.referenceImagePanelOpen) {
      // Both calibration modes aim at a specific point, which is exactly
      // what a crosshair is for.
      if (s.referenceImageCalibrating || s.referenceImageMarking) {
        return "crosshair";
      }
      const image = useDocStore
        .getState()
        .referenceImages.find((img) => img.id === s.activeReferenceImageId);
      // An expanded module isn't itself a canvas mode. Only an editable,
      // visible image takes over the cursor; otherwise the chosen stitch
      // tool below (including Erase) remains in control.
      if (image && image.visible) {
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
    }
    if (s.selectionMove) {
      if (s.selectionMove.blocked) return BLOCKED_MOVE_CURSOR;
      return s.selectionMove.duplicating ? DUPLICATE_CURSOR : GRABBING_CURSOR;
    }
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
    const hoveredUnrecognized =
      !!s.hover && s.referenceImageUnrecognized.has(cellKey(s.hover.col, s.hover.row));
    // Holding both review chords at once is blocked outright (FR-4,
    // revised) - checked before anything else, including Dismiss's own
    // precedence over the no-modifier override just below.
    if (s.selectHeld && s.shiftHeld && s.altHeld) return "not-allowed";
    // Dismiss always wins, even over the no-modifier override just below -
    // matches `modeFor`'s own precedence exactly (a deliberately held
    // destructive chord should never be silently absorbed by whatever's
    // armed), computed from the same live modifiers and sticky default
    // rather than a second copy of the rule (Gotcha G-1, G-2; SR-1).
    if (s.shiftHeld && s.altHeld) {
      if (isDismissable(hovered, hoveredUnrecognized)) return DISMISS_SUGGESTION_CURSOR;
      return s.tool === "eraser" ? ERASE_CURSOR : "default";
    } else {
      // A real armed stitch landing on a suggestion applies and confirms it
      // outright with no modifier needed (pre-existing, unaffected - FR-11)
      // - that override wins over the Confirm cursor below, the same way it
      // wins in the paint logic.
      const overrideSymbolId =
        s.armedSymbolId && s.armedSymbolId !== SUGGEST_SYMBOL_ID ? s.armedSymbolId : null;
      if (!(hovered?.suggested && overrideSymbolId)) {
        const effective = resolveSuggestAction(
          { confirmHeld: s.selectHeld, dismissHeld: false },
          s.armedSymbolId === SUGGEST_SYMBOL_ID ? s.suggestAction : "suggest",
        );
        if (effective === "confirm" && hovered?.suggested) return CONFIRM_SUGGESTION_CURSOR;
        // The sticky default can resolve to Dismiss too, with no live
        // modifier held at all (the toolDock's Dismiss button) - mirrors
        // `modeFor`'s own fallback check, not just its live-Shift+Opt path.
        if (effective === "dismiss" && isDismissable(hovered, hoveredUnrecognized)) {
          return DISMISS_SUGGESTION_CURSOR;
        }
      }
    }
    // Cmd/Ctrl's temporary selection clutch reads as Select outright, cursor
    // included - not some hybrid with whatever tool it's overriding.
    if (s.tool === "select" || s.selectHeld) return hovered ? "default" : "crosshair";
    if (s.tool === "eraser") return ERASE_CURSOR;
    if (s.tool === "insert") {
      // No insertHover yet (over the ruler, or before the first pointer
      // move) isn't a blocked target - it's just nothing to judge yet.
      const ok =
        !s.insertHover || canInsertAt(useDocStore.getState().index, s.insertHover.col, s.insertHover.row);
      if (!ok) return INSERT_BLOCKED_CURSOR;
      return s.armedSymbolId ? insertStitchCursor(s.armedSymbolId, s.activeColor) : INSERT_ADD_CURSOR;
    }
    // Draw leaves existing stitches as plain-arrow selection targets. Empty
    // cells carry either the add badge or the armed-stitch preview.
    if (s.armedSymbolId && s.shiftHeld) return STRAIGHT_DRAW_CURSOR;
    if (hovered) return "default";
    // Suggest armed but nothing eligible under the cursor - a distinct wand
    // badge, not the plain add-cursor a real armed stitch would show here,
    // nor an armed-stitch glyph preview (FR-8).
    if (s.armedSymbolId === SUGGEST_SYMBOL_ID) return SUGGEST_CURSOR;
    return s.armedSymbolId ? armedStitchCursor(s.armedSymbolId, s.activeColor) : ADD_CURSOR;
  });

  // Registered first of all so a second touch finger gets first refusal,
  // ahead of everything below - including useReferenceImageTool's own
  // "first refusal" on a single pointer.
  useTouchGestures(ref);
  // Claims a drag (and stops the event reaching the tools below) only when
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
    // Shared with usePaintTool.ts's Suggest matcher, not a private instance -
    // two separate caches used to mean Suggest's first click always missed,
    // silently loading an image the canvas had already rendered from its own
    // copy a moment earlier.
    const referenceImages = getSharedReferenceImageCache();
    referenceImages.setOnReady(markDirty);

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
      const uiFieldChanged = RENDER_UI_FIELDS.some((key) => state[key] !== prev[key]);
      // altHeld isn't itself read by render() (it only feeds the cursor
      // selector above), so it's kept as its own check rather than folded
      // into RENDER_UI_FIELDS - preserved here unchanged from prior behavior.
      if (uiFieldChanged || state.altHeld !== prev.altHeld) {
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

      const { picker, ...renderUiFields } = pickRenderUiFields(useUiStore.getState());
      const { index, revision, referenceImages: docReferenceImages } = useDocStore.getState();
      const activeImage = docReferenceImages.find((img) => img.id === renderUiFields.activeReferenceImageId);
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      // Work in CSS pixels; the DPR scale is applied once, here.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, {
        ...renderUiFields,
        index,
        revision,
        sprites,
        referenceImages: docReferenceImages,
        referenceImageCache: referenceImages,
        referenceImageMarks: activeImage?.calibrationMarks ?? [],
        pickerTarget: picker,
      });
      ctx.restore();
      if (renderUiFields.insertAnimation) {
        if (performance.now() - renderUiFields.insertAnimation.startedAt < 220) dirty.current = true;
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
      referenceImages.setOnReady(null);
      window.removeEventListener("resize", syncSize);
      media.removeEventListener("change", onDprChange);
    };
  }, []);

  return <canvas ref={ref} className="canvas" style={{ cursor }} />;
}
