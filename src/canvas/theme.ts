import { alpha, tokens as t } from "../design/tokens";

/**
 * Canvas paint colours, all from the shared design tokens
 * (src/design/tokens.json), so the renderer has no literals and follows any
 * change made to the palette.
 */
export const theme = {
  // The empty canvas. Still a hair off pure white, not white itself — a
  // placed knit stitch renders as a plain white bordered cell with no glyph,
  // and on a white canvas that would be indistinguishable from an empty one
  // — but now close enough to white that the grid marks (below) carry the
  // "this is a grid" cue rather than a visibly grey backdrop doing it.
  background: t["canvas-bg"],
  // One colour for the whole grid: dotted minor lines and major crosses.
  gridMajor: t["canvas-grid"],

  rulerBackground: t.chrome,
  rulerBorder: t.border,
  rulerText: t["text-muted"],
  rulerTextActive: t["accent-ink"],
  rulerHighlight: t["accent-soft-bg"],

  hoverFill: alpha(t.accent, 0.1),
  hoverStroke: t.accent,

  cellFill: t.bg,
  cellStroke: t["cell-stroke"],
  symbol: t["cell-ink"],
} as const;

/** Width of the row/column rulers, in CSS pixels. */
export const RULER = 22;
