import type { StitchSymbol } from "../symbols/types";

/** Width budget, in px, for a stitch glyph in a picker row. */
const GLYPH_BUDGET = 210;

/** Cables are up to 12 cells wide; shrink the cell so the whole span fits. */
export const cellSizeFor = (symbol: StitchSymbol) => Math.max(9, Math.min(22, Math.floor(GLYPH_BUDGET / symbol.span)));
