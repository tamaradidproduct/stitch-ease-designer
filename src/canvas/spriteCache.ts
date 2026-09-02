import { CELL, MAX_ZOOM } from "./camera";
import type { StitchSymbol } from "../symbols/types";

/**
 * Rasterised glyphs, cached per zoom bucket and colour.
 *
 * Parsing SVG in the draw loop is the obvious way to make a canvas editor
 * unusable, so each glyph is rendered once into an offscreen canvas at a
 * handful of fixed sizes and blitted from there. Zoom snaps to the nearest
 * bucket at or above the current cell size, so a sprite is only ever scaled
 * down — scaling up would show the raster. The top bucket must cover the
 * largest cell size the camera can reach (CELL * MAX_ZOOM), or the ladder
 * runs out and the last bucket gets scaled up after all.
 */
const BUCKETS = [12, 24, 48, 96, 192, CELL * MAX_ZOOM] as const;

export function bucketFor(cellSizePx: number): number {
  for (const b of BUCKETS) if (cellSizePx <= b) return b;
  return BUCKETS[BUCKETS.length - 1]!;
}

type Sprite = HTMLCanvasElement;

/** Rasterisation attempts before a glyph is given up on and logged. */
const MAX_ATTEMPTS = 3;

export class SpriteCache {
  private readonly cache = new Map<string, Sprite>();
  private readonly pending = new Set<string>();
  /** Failed attempts per key, so a transient decode error gets retried a few
   *  times before giving up, instead of either retrying every frame forever
   *  or silently blacklisting the glyph on the first failure. */
  private readonly failures = new Map<string, number>();

  /** Called when a glyph finishes rasterising, so the caller can redraw. */
  constructor(private readonly onReady: () => void) {}

  /**
   * The sprite for this symbol at this cell size, or null if it isn't ready.
   * A miss starts the work and returns null; the frame simply draws without it
   * and `onReady` schedules another.
   */
  get(symbol: StitchSymbol, cellSizePx: number, colour: string): Sprite | null {
    const bucket = bucketFor(cellSizePx);
    const key = `${symbol.id}@${bucket}@${colour}`;

    const hit = this.cache.get(key);
    if (hit) return hit;

    if ((this.failures.get(key) ?? 0) >= MAX_ATTEMPTS) return null;

    if (!this.pending.has(key)) {
      this.pending.add(key);
      void this.rasterise(symbol, bucket, colour, key);
    }
    return null;
  }

  private async rasterise(
    symbol: StitchSymbol,
    bucket: number,
    colour: string,
    key: string,
  ): Promise<void> {
    try {
      const width = bucket * symbol.span;
      const height = bucket;

      // An <img> needs explicit width/height (Firefox won't infer them from
      // viewBox alone), and `color` is what currentColor resolves against
      // inside a standalone SVG document.
      const svg = symbol.glyph.replace(
        "<svg",
        `<svg width="${width}" height="${height}" color="${colour}"`,
      );

      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      this.cache.set(key, canvas);
      this.failures.delete(key);
      this.onReady();
    } catch (err) {
      // A glyph that won't rasterise shouldn't take the canvas down with it;
      // the cell just renders empty. Retried a bounded number of times (a
      // decode failure can be transient), then logged and left alone so a
      // real problem is visible instead of silently retrying forever or
      // silently giving up.
      const attempts = (this.failures.get(key) ?? 0) + 1;
      this.failures.set(key, attempts);
      if (attempts >= MAX_ATTEMPTS) {
        console.error(
          `SpriteCache: giving up on "${key}" after ${attempts} failed rasterise attempts`,
          err,
        );
      }
    } finally {
      this.pending.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
    this.failures.clear();
  }
}
