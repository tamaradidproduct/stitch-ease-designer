import { chartBounds } from "../model/chartBounds";
import type { Placement } from "../model/types";
import { abbreviationFor } from "../symbols/abbreviations";
import { downloadBlob, safeFilename } from "./download";

/** Quotes a CSV field only when it needs it - keeps the common case readable in a raw file. */
function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * A plain grid transcription of the chart: one row per knitting row (top of
 * the piece first, matching how the chart itself is drawn), one column per
 * stitch position left to right, each cell holding the stitch's short code.
 * A span's cells beyond its anchor are left blank - a single CSV cell can't
 * usefully represent a 6-wide cable spanning several columns anyway.
 *
 * This is a spreadsheet-friendly layout, not the knitter-facing right-to-left
 * numbering shown on screen (see `stitchNumbers.ts`) - that numbering is
 * per disconnected motif and doesn't map onto one rectangular grid cleanly,
 * so the header row/column here are just plain 1-based positions.
 */
export function chartToCsv(placements: Iterable<Placement>): string {
  const list = [...placements];
  const bounds = chartBounds(list);
  if (!bounds) return "";
  const { minCol, maxCol, minRow, maxRow } = bounds;

  const grid = new Map<string, string>();
  for (const p of list) grid.set(`${p.col},${p.row}`, abbreviationFor(p.symbolId));

  const header = ["", ...Array.from({ length: maxCol - minCol + 1 }, (_, i) => String(i + 1))];
  const lines = [header.map(csvField).join(",")];

  let rowLabel = 1;
  for (let row = maxRow; row >= minRow; row--) {
    const cells = [String(rowLabel++)];
    for (let col = minCol; col <= maxCol; col++) {
      cells.push(grid.get(`${col},${row}`) ?? "");
    }
    lines.push(cells.map(csvField).join(","));
  }

  return lines.join("\r\n");
}

export function exportChartCsv(name: string, placements: Iterable<Placement>): void {
  const csv = chartToCsv(placements);
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), safeFilename(name, "csv"));
}
