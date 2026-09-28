export const MIN_CONTRAST = 0.5;
export const MAX_CONTRAST = 3;
export const DEFAULT_CONTRAST = 1;

/** A reference image's contrast, with absent/invalid values reading as "unchanged". */
export function effectiveContrast(image: { contrast?: number }): number {
  const c = image.contrast;
  if (typeof c !== "number" || !Number.isFinite(c)) return DEFAULT_CONTRAST;
  return Math.min(MAX_CONTRAST, Math.max(MIN_CONTRAST, c));
}

/**
 * Scales each colour channel's distance from mid-grey by `contrast` (1 =
 * unchanged), in place. Alpha is left alone. One lookup table rather than
 * per-pixel maths, since this runs over every pixel of a full-size photo.
 */
export function applyContrastToPixels(data: Uint8ClampedArray, contrast: number): void {
  if (contrast === DEFAULT_CONTRAST) return;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - 128) * contrast + 128;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]!]!;
    data[i + 1] = lut[data[i + 1]!]!;
    data[i + 2] = lut[data[i + 2]!]!;
  }
}

/**
 * A contrast-adjusted copy of `source`, or `source` itself when contrast is
 * unchanged. Every consumer of the reference image (canvas drawing, grid
 * detection for calibration, Suggest's stitch matching) goes through this
 * so they all see the same corrected pixels.
 */
export function contrastedSource(
  source: HTMLImageElement,
  contrast: number,
): HTMLImageElement | HTMLCanvasElement {
  if (contrast === DEFAULT_CONTRAST) return source;
  const canvas = document.createElement("canvas");
  canvas.width = source.naturalWidth;
  canvas.height = source.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyContrastToPixels(data.data, contrast);
    ctx.putImageData(data, 0, 0);
  } catch {
    // Pixels unreadable (tainted cross-origin image): show it unadjusted.
    return source;
  }
  return canvas;
}
