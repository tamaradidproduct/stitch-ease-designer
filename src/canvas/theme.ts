/** Canvas paint colours. Kept in one place so the renderer has no literals. */
export const theme = {
  background: "#ffffff",
  gridMinor: "#dde3ea",
  gridMajor: "#b6c2d1",
  axis: "#7c8ca0",

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
