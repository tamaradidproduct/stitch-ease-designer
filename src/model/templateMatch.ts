import { cellWithinReferenceImage, cropReferenceImageCell } from "../canvas/referenceImageCrop";
import type { DocIndex } from "./docIndex";
import type { ReferenceImage } from "./types";

export type BinaryGrid = {
  width: number;
  height: number;
  /** Row-major 0 (background) or 1 (ink). Length is width * height. */
  data: Uint8Array;
  inkCount: number;
  inkRatio: number;
};

export type MatchResult = {
  /** The identified symbol ID, or null if no exemplar exceeded minConfidence. */
  symbolId: string | null;
  /** 0 to 1 confidence score (maximum translation-tolerant IoU). */
  confidence: number;
  /** True if the cell had negligible ink and was classified as an empty/knit cell. */
  isBlank: boolean;
};

/**
 * Converts a cell crop into a border-inset, polarity-corrected binary ink grid.
 *
 * Charts always have printed grid lines. Insetting by ~12-15% (at least 2px)
 * strips away the cell border so only the stitch glyph inside is matched.
 * Auto-detects polarity (dark-on-light vs light-on-dark) by sampling the perimeter
 * background, so it works reliably on both scanned book pages and inverted charts.
 */
export function binarizeCrop(
  canvas: HTMLCanvasElement,
  options?: { insetRatio?: number },
): BinaryGrid {
  const { width, height } = canvas;
  if (width === 0 || height === 0) {
    return { width: 0, height: 0, data: new Uint8Array(0), inkCount: 0, inkRatio: 0 };
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return { width: 0, height: 0, data: new Uint8Array(0), inkCount: 0, inkRatio: 0 };
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  const px = imageData.data;

  const insetRatio = options?.insetRatio ?? 0.12;
  const insetX = Math.max(2, Math.round(width * insetRatio));
  const insetY = Math.max(2, Math.round(height * insetRatio));
  const innerW = Math.max(1, width - 2 * insetX);
  const innerH = Math.max(1, height - 2 * insetY);

  // 1. Detect background luminance from the outer perimeter (the cell margin).
  //
  // The *median* of that margin, not its mean: a diagonal stitch (SKPO,
  // K2tog) is drawn corner-to-corner by design, so it grazes this very
  // border at one or two points even after insetting. On a real chart photo
  // those handful of dark crossing pixels dragged the mean background
  // luminance down enough to shrink the contrast threshold and read most of
  // the line's own ink as "background" - measured on real exported chart
  // crops, this alone was enough to make SKPO, K2tog and Yarn over all
  // register as blank cells and vanish from matching entirely, while Knit
  // and Purl (which don't reach the edge) were unaffected. The median is
  // immune to a minority of contaminating pixels in an otherwise uniform
  // margin, which is exactly this failure mode.
  const borderLums: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < insetX || x >= width - insetX || y < insetY || y >= height - insetY) {
        const idx = (y * width + x) * 4;
        borderLums.push(0.299 * px[idx]! + 0.587 * px[idx + 1]! + 0.114 * px[idx + 2]!);
      }
    }
  }
  borderLums.sort((a, b) => a - b);
  const bgLum = borderLums.length > 0 ? borderLums[Math.floor(borderLums.length / 2)]! : 255;
  const isDarkBg = bgLum < 128;
  const contrastDelta = isDarkBg ? Math.max(30, (255 - bgLum) * 0.35) : Math.max(30, bgLum * 0.35);

  // 2. Binarize the inner region.
  const data = new Uint8Array(innerW * innerH);
  let inkCount = 0;

  for (let iy = 0; iy < innerH; iy++) {
    const y = iy + insetY;
    for (let ix = 0; ix < innerW; ix++) {
      const x = ix + insetX;
      const idx = (y * width + x) * 4;
      const lum = 0.299 * px[idx]! + 0.587 * px[idx + 1]! + 0.114 * px[idx + 2]!;

      const isInk = isDarkBg ? lum > bgLum + contrastDelta : lum < bgLum - contrastDelta;
      if (isInk) {
        data[iy * innerW + ix] = 1;
        inkCount++;
      }
    }
  }

  const inkRatio = inkCount / (innerW * innerH);
  return { width: innerW, height: innerH, data, inkCount, inkRatio };
}

/**
 * Returns true if the cell contains negligible ink (blank/knit).
 */
export function isCellBlank(grid: BinaryGrid, threshold = 0.04): boolean {
  return grid.inkRatio < threshold;
}

/**
 * Computes the maximum Intersection-over-Union (IoU) between two binary grids,
 * searching across a small translation window (±maxShift) to absorb grid misalignment.
 */
export function computeGridSimilarity(
  a: BinaryGrid,
  b: BinaryGrid,
  maxShift = 2,
): number {
  if (a.inkCount === 0 && b.inkCount === 0) return 1.0;
  if (a.inkCount === 0 || b.inkCount === 0) return 0.0;

  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  let bestIoU = 0.0;

  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      let intersection = 0;

      for (let y = 0; y < h; y++) {
        const by = y + dy;
        if (by < 0 || by >= b.height) continue;
        const aRow = y * a.width;
        const bRow = by * b.width;

        for (let x = 0; x < w; x++) {
          const bx = x + dx;
          if (bx < 0 || bx >= b.width) continue;

          if (a.data[aRow + x] === 1 && b.data[bRow + bx] === 1) {
            intersection++;
          }
        }
      }

      if (intersection > 0) {
        const union = a.inkCount + b.inkCount - intersection;
        const iou = intersection / union;
        if (iou > bestIoU) bestIoU = iou;
      }
    }
  }

  return bestIoU;
}

/**
 * Matches a candidate cell against a set of active exemplars.
 * Returns the highest scoring symbol and confidence score.
 */
/**
 * How much closer the best match has to be than the second-best *different*
 * symbol before it's trusted. Below this margin the two are called a tie
 * rather than a winner - the real case this exists for is two mirror-image
 * diagonals (an SKPO and a K2TOG drawn as opposite-slanted lines), which
 * score close to each other by construction and are exactly the pair a
 * wrong silent guess would be most costly on.
 */
const AMBIGUITY_MARGIN = 0.08;
/**
 * An empty chart square is usually Knit. This is deliberately a suggestion
 * rather than a perfect match: a confirmed blank exemplar for another stitch
 * always wins, and contradictory blank samples still remain unresolved.
 */
const DEFAULT_BLANK_KNIT_CONFIDENCE = 0.72;

export function matchCandidateStitch(
  candidate: BinaryGrid,
  exemplars: Map<string, BinaryGrid[]>,
  minConfidence = 0.55,
): MatchResult {
  // Real exemplars get first crack, even on a near-empty-looking candidate -
  // deciding "blank" before ever comparing against what's actually been
  // taught meant a faintly-drawn real stitch that dipped under the blank
  // cutoff was declared knit at a false 100% confidence, without a single
  // exemplar ever being consulted. Blank is now a fallback for when nothing
  // else fits, not a shortcut that runs before matching gets a turn.

  // Best score per symbol, not per exemplar - several exemplars of the same
  // symbol competing with each other isn't a tie worth flagging, only two
  // *different* symbols scoring close together is.
  //
  // Which symbol a blank-looking cell should become isn't fixed to "knit" -
  // some charts draw knit as a mark and leave purl as the blank square (or
  // any other convention). That mapping comes entirely from what the
  // designer has actually confirmed: `extractExemplars` keeps blank crops
  // for whichever symbol they were confirmed under, so a blank candidate
  // naturally scores 1.0 against a blank exemplar of the right symbol here,
  // with no special-casing needed.
  const bestBySymbol = new Map<string, number>();
  for (const [symbolId, grids] of exemplars.entries()) {
    let best = 0;
    for (const grid of grids) best = Math.max(best, computeGridSimilarity(candidate, grid));
    if (best > 0) bestBySymbol.set(symbolId, best);
  }

  const ranked = [...bestBySymbol.entries()].sort((a, b) => b[1] - a[1]);
  const isBlank = isCellBlank(candidate);
  const defaultBlankToKnit = () =>
    isBlank ? { symbolId: "knit", confidence: DEFAULT_BLANK_KNIT_CONFIDENCE, isBlank: true } : null;

  // Nothing scored anything at all - either there are no exemplars yet, or
  // every comparison came back a flat zero. An otherwise blank square follows
  // the normal knitting convention. A chart that uses another blank symbol
  // gets the chance to establish that first: its blank exemplar would have
  // scored 1.0 and therefore would not reach this fallback.
  if (ranked.length === 0) return defaultBlankToKnit() ?? { symbolId: null, confidence: 0, isBlank };

  const [topSymbolId, topScore] = ranked[0]!;
  const runnerUpScore = ranked[1]?.[1] ?? 0;

  if (topScore < minConfidence) {
    return defaultBlankToKnit() ?? { symbolId: null, confidence: topScore, isBlank };
  }
  if (topScore - runnerUpScore < AMBIGUITY_MARGIN) {
    // Report the leading score, but withhold the guess - a coin flip between
    // two candidates is worse than asking a person, not better.
    return { symbolId: null, confidence: topScore, isBlank: false };
  }

  return { symbolId: topSymbolId, confidence: topScore, isBlank: false };
}

/**
 * Extracts binary exemplars from all confirmed (non-suggested) placements that fall
 * within the reference image boundary.
 */
/**
 * Most exemplars kept per symbol. Matching takes the *best* score across a
 * symbol's exemplars (see `matchCandidateStitch`), so more of them only ever
 * helps by covering real variation the photo actually has - different
 * lighting or a slight tilt in one corner of the chart, say. Past a handful
 * that stops paying for itself: exemplars of one symbol drawn consistently
 * add nothing once one of them is already a good match, and every one of
 * them is re-cropped and re-binarized on every cell scanned (mitigated by
 * the cache below, but still real work). Six is enough room to cover a
 * symbol confirmed in a few different regions of the photo without a
 * heavily-traced chart making every scan slower for no matching benefit.
 */
export const MAX_EXEMPLARS_PER_SYMBOL = 6;

/**
 * Picks up to `cap` of `items`, preferring ones spread apart over ones
 * clustered together - greedy farthest-point sampling on `col`/`row`.
 * Exported standalone (rather than folded into `extractExemplars`) because
 * it's the part of exemplar selection that's actually worth unit testing:
 * it has nothing to do with pixels, just picking a diverse subset of
 * positions, and doing that selection *before* anything gets cropped is
 * what makes the cap also cut the crop/binarize cost, not just the list
 * length.
 */
export function selectDiverseExemplars<T extends { col: number; row: number }>(
  items: T[],
  cap: number,
): T[] {
  if (items.length <= cap) return items;

  const remaining = [...items];
  const selected = [remaining.shift()!];
  while (selected.length < cap && remaining.length) {
    let bestIndex = 0;
    let bestDistance = -1;
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;
      let nearest = Infinity;
      for (const s of selected) {
        const d = Math.hypot(s.col - candidate.col, s.row - candidate.row);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        bestIndex = i;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return selected;
}

/**
 * Cached by the confirmed placements and the image geometry they sample.
 * Suggested placements deliberately do not affect this key, so adding a
 * suggestion during a drag does not re-crop every confirmed exemplar.
 */
let cachedFor: { fingerprint: string; ref: string; imageGeometry: string } | null = null;
let cachedExemplars: Map<string, BinaryGrid[]> | null = null;

export function extractExemplars(
  index: DocIndex,
  referenceImage: ReferenceImage,
  imageElement: CanvasImageSource,
  revision: number,
): Map<string, BinaryGrid[]> {
  // Suggested-only changes deliberately do not invalidate this cache.
  void revision;
  const confirmedPlacements = index.toArray().filter((p) => !p.suggested);
  const fingerprint = confirmedPlacements
    .map((p) => `${p.id}:${p.symbolId}:${p.col}:${p.row}`)
    .join("|");
  const imageGeometry = [
    referenceImage.x,
    referenceImage.y,
    referenceImage.width,
    referenceImage.height,
    referenceImage.naturalWidth,
    referenceImage.naturalHeight,
  ].join(":");
  if (
    cachedExemplars &&
    cachedFor?.fingerprint === fingerprint &&
    cachedFor.ref === referenceImage.ref &&
    cachedFor.imageGeometry === imageGeometry
  ) {
    return cachedExemplars;
  }

  const bySymbol = new Map<string, Array<{ col: number; row: number }>>();
  for (const p of confirmedPlacements) {
    if (!cellWithinReferenceImage(referenceImage, p.col, p.row)) continue;
    const list = bySymbol.get(p.symbolId) ?? [];
    list.push({ col: p.col, row: p.row });
    bySymbol.set(p.symbolId, list);
  }

  const map = new Map<string, BinaryGrid[]>();
  for (const [symbolId, positions] of bySymbol.entries()) {
    const chosen = selectDiverseExemplars(positions, MAX_EXEMPLARS_PER_SYMBOL);
    const grids: BinaryGrid[] = [];
    for (const { col, row } of chosen) {
      const crop = cropReferenceImageCell(referenceImage, imageElement, col, row, 32);
      const grid = binarizeCrop(crop);
      // A confirmed placement is trusted as-is, blank crop included - some
      // charts draw their blank-looking stitch as something other than
      // knit (see `matchCandidateStitch`), and second-guessing that here
      // would silently refuse to learn it.
      grids.push(grid);
    }
    if (grids.length) map.set(symbolId, grids);
  }

  const imageLoaded =
    typeof HTMLImageElement === "undefined" ||
    !(imageElement instanceof HTMLImageElement) ||
    (imageElement.complete && imageElement.naturalWidth > 0);
  if (imageLoaded) {
    cachedFor = { fingerprint, ref: referenceImage.ref, imageGeometry };
    cachedExemplars = map;
  }
  return map;
}
