/** Canvas paint colours. Kept in one place so the renderer has no literals. */
export const theme = {
  // The empty canvas. Still a hair off pure white, not white itself — a
  // placed knit stitch renders as a plain white bordered cell with no glyph,
  // and on a white canvas that would be indistinguishable from an empty one
  // — but now close enough to white that the grid marks (below) carry the
  // "this is a grid" cue rather than a visibly grey backdrop doing it.
  background: "#f6f6f7",
  // One colour for the whole grid: dotted minor lines and major crosses.
  gridMajor: "#8f8f99",

  rulerBackground: "#f8fafc",
  rulerBorder: "#e2e8f0",
  rulerText: "#64748b",
  rulerTextActive: "#0369a1",
  rulerHighlight: "#e0f2fe",

  hoverFill: "rgba(2, 132, 199, 0.10)",
  hoverStroke: "#0284c7",

  cellFill: "#ffffff",
  cellStroke: "#94a3b8",
  symbol: "#334155",
} as const;

/** Width of the row/column rulers, in CSS pixels. */
export const RULER = 22;
