/** A stitch symbol from the Figma library. See scripts/sync-symbols.py. */
export type StitchSymbol = {
  /** Stable slug, e.g. "k2tog" or "3_3_cable_left_hr". */
  id: string;
  /** Human label for the picker and legend. */
  label: string;
  category: string;
  /**
   * Width in grid cells. A 3/3 cable is six stitches wide, so span is 6 and
   * the placement occupies col .. col + 5.
   */
  span: number;
  /** Node it came from, so a symbol can be traced back to the library. */
  figmaNodeId: string;
  /**
   * Per-cell background overrides, one entry per span. Null means "use the
   * theme's ordinary cell colour". Present only where the library gives a cell
   * a meaningful tint — "no stitch" is distinguished from knit by its grey
   * alone, so that colour is data, not decoration.
   */
  cellFills?: (string | null)[];
  /** Inline SVG, recolourable via currentColor, with no cell chrome. */
  glyph: string;
};
