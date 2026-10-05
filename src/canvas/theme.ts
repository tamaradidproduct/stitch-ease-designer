import { colorTokens as t } from "../design/tokens";

/**
 * Canvas paint colours. Kept in one place so the renderer has no literals;
 * anything the chrome also uses comes from the shared design tokens, so the
 * rulers and hover outline follow a change to the CSS palette.
 */
export const theme = {
  // The empty canvas. Still a hair off pure white, not white itself — a
  // placed knit stitch renders as a plain white bordered cell with no glyph,
  // and on a white canvas that would be indistinguishable from an empty one
  // — but now close enough to white that the grid marks (below) carry the
  // "this is a grid" cue rather than a visibly grey backdrop doing it.
  background: "#f6f6f7",
  // One colour for the whole grid: dotted minor lines and major crosses.
  gridMajor: "#8f8f99",

  rulerBackground: t.chrome,
  rulerBorder: t.border,
  rulerText: t["text-muted"],
  rulerTextActive: "#0369a1",
  rulerHighlight: t["accent-soft-bg"],

  hoverFill: "rgba(2, 132, 199, 0.10)",
  hoverStroke: t.accent,

  cellFill: t.bg,
  cellStroke: t["cell-stroke"],
  symbol: t["cell-ink"],
} as const;

/** Width of the row/column rulers, in CSS pixels. */
export const RULER = 22;
