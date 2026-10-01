/**
 * Shared glyph-cell-size formula (issue #323). A stitch glyph is rendered
 * inside a fixed-width tile, so wider symbols (a 12-cell cable, say) need a
 * smaller per-cell size to still fit - `numerator / span`, clamped to a 7px
 * floor (anything smaller stops reading as a glyph at all) and each call
 * site's own `max` (that tile's own width budget).
 *
 * This only centralizes the formula itself. Each of its three call sites -
 * StitchPicker's quick/dynamic tiles (58, max 22), RightPanel's glossary
 * rows (54, max 20), and RightPanel's glossary search-result rows (48, max
 * 18) - keeps its own existing numerator and max; none of those numbers
 * changed when this was extracted.
 */
export function glyphCellSize(span: number, numerator: number, max: number): number {
  return Math.max(7, Math.min(max, numerator / span));
}
