import { allSymbols } from "../symbols/registry";
import type { Placement } from "../model/types";

/**
 * Temporary scaffolding: lays every symbol in the library out on the grid so
 * the import can be compared against the Figma file by eye. Cable crossings
 * mirror left/right in a way that is very easy to get wrong and impossible to
 * catch from data alone.
 *
 * Delete once the stitch picker exists.
 */
export function symbolSheet(): Placement[] {
  const out: Placement[] = [];
  let id = 0;
  const add = (symbolId: string, col: number, row: number) =>
    out.push({ id: `sheet_${id++}`, symbolId, col, row });

  const singles = allSymbols().filter((s) => s.span === 1);
  const wide = allSymbols().filter((s) => s.span > 1);

  // Single-cell symbols, ten to a row, starting just below the origin.
  const PER_ROW = 10;
  singles.forEach((s, i) => {
    add(s.id, (i % PER_ROW) * 2, -Math.floor(i / PER_ROW) * 2);
  });

  // Cables get a row each, since they're 2-12 cells wide.
  const cableTop = -Math.ceil(singles.length / PER_ROW) * 2 - 3;
  wide.forEach((s, i) => {
    add(s.id, 0, cableTop - i * 2);
  });

  return out;
}
