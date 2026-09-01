import { useEffect, useRef } from "react";
import { usePanZoom } from "../input/usePanZoom";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
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
  const cursor = useUiStore((s) =>
    s.isPanning ? "grabbing" : s.spaceHeld ? "grab" : "crosshair",
  );

  usePanZoom(ref);

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

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      useUiStore.getState().setViewport({ width, height });
      markDirty();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Plain (non-selector) subscribe so we can diff exactly the fields the
    // renderer reads; spaceHeld/isPanning changes (handled by the cursor
    // selector above) shouldn't force an extra repaint.
    const unsubscribeUi = useUiStore.subscribe((state, prev) => {
      if (
        state.camera !== prev.camera ||
        state.viewport !== prev.viewport ||
        state.hover !== prev.hover ||
        state.armedSymbolId !== prev.armedSymbolId
      ) {
        markDirty();
      }
    });
    const unsubscribeDoc = useDocStore.subscribe(markDirty);

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      if (!dirty.current) return;
      dirty.current = false;

      const { camera, viewport, hover, armedSymbolId } = useUiStore.getState();
      const { index } = useDocStore.getState();
      const dpr = window.devicePixelRatio || 1;

      ctx.save();
      // Work in CSS pixels; the DPR scale is applied once, here.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, { camera, viewport, hover, index, sprites, armedSymbolId });
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
      resize();
      watchDpr();
    };
    watchDpr();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribeUi();
      unsubscribeDoc();
      sprites.clear();
      media.removeEventListener("change", onDprChange);
    };
  }, []);

  return <canvas ref={ref} className="canvas" style={{ cursor }} />;
}
