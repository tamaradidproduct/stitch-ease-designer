/** Canvas paint colours. Kept in one place so the renderer has no literals. */
export const theme = {
  // The empty canvas, matching the Figma library's own page background
  // (rgb 0.830, 0.830, 0.830). Distinct from white stitch cells on purpose —
  // on a plain white canvas, an unplaced cell and a placed knit (also white)
  // were indistinguishable.
  background: "#d4d4d4",
  gridMinor: "#c5c5c9",
  gridMajor: "#a5a5ad",
  axis: "#81818b",

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
