import { newPlacementId } from "../model/ops";
import type { Placement } from "../model/types";
import { getSymbol } from "../symbols/registry";

/**
 * The stored form of a chart.
 *
 * A `Placement` carries a 36-character UUID and a symbol slug — around 90 bytes
 * per stitch as plain JSON, which is how the previous version of this app ended
 * up with a 1.4 MB file for a single cardigan. That size makes whole-document
 * autosave untenable at garment scale, so stitches are stored as integer tuples
 * against a symbol palette instead.
 *
 * The per-stitch id is deliberately not stored. It exists only to key the
 * occupancy map and the undo stack at runtime, and `DocIndex.from()` rebuilds
 * both from the placement list, so ids are minted fresh on load.
 */
export type StoredChart = {
  v: number;
  /** Symbol slugs. A stitch's third tuple element indexes into this. */
  palette: string[];
  /** [col, row, paletteIndex] per stitch. */
  stitches: [number, number, number][];
};

export const STORED_VERSION = 1;

export const emptyChart = (): StoredChart => ({
  v: STORED_VERSION,
  palette: [],
  stitches: [],
});

/**
 * Thrown when stored data doesn't match the format. Everything decoded here
 * came from somewhere untrusted — browser storage a user can edit, a JSON file
 * they picked, eventually the network — so malformed input has to fail loudly
 * rather than produce a half-built chart.
 */
export class ChartFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartFormatError";
  }
}

/**
 * Stitches are emitted bottom-to-top, left-to-right, and the palette is built
 * in first-seen order of that sequence. Both are ordering decisions rather than
 * requirements, but they make the output a pure function of the chart's
 * contents: re-encoding an unchanged chart produces byte-identical JSON, so
 * autosave can skip no-op writes and diffs stay readable.
 */
export function encode(placements: Iterable<Placement>): StoredChart {
  const sorted = [...placements].sort((a, b) => a.row - b.row || a.col - b.col);

  const palette: string[] = [];
  const indexOf = new Map<string, number>();
  const stitches: [number, number, number][] = [];

  for (const p of sorted) {
    let paletteIndex = indexOf.get(p.symbolId);
    if (paletteIndex === undefined) {
      paletteIndex = palette.length;
      palette.push(p.symbolId);
      indexOf.set(p.symbolId, paletteIndex);
    }
    stitches.push([p.col, p.row, paletteIndex]);
  }

  return { v: STORED_VERSION, palette, stitches };
}

const isInteger = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

function validate(stored: unknown): StoredChart {
  if (typeof stored !== "object" || stored === null) {
    throw new ChartFormatError("not an object");
  }
  const chart = stored as Partial<StoredChart>;

  if (!isInteger(chart.v)) throw new ChartFormatError("missing version");
  if (chart.v !== STORED_VERSION) {
    // The version field is the migration hook. There's nothing to migrate from
    // yet, so anything else is either corrupt or from a newer build.
    throw new ChartFormatError(
      `unsupported chart version ${chart.v} (this build reads ${STORED_VERSION})`,
    );
  }

  if (!Array.isArray(chart.palette) || chart.palette.some((s) => typeof s !== "string")) {
    throw new ChartFormatError("palette must be an array of symbol ids");
  }
  if (!Array.isArray(chart.stitches)) {
    throw new ChartFormatError("stitches must be an array");
  }

  chart.stitches.forEach((stitch, i) => {
    if (!Array.isArray(stitch) || stitch.length !== 3 || !stitch.every(isInteger)) {
      throw new ChartFormatError(`stitch ${i} is not [col, row, paletteIndex] integers`);
    }
    const paletteIndex = stitch[2] as number;
    if (paletteIndex < 0 || paletteIndex >= chart.palette!.length) {
      throw new ChartFormatError(`stitch ${i} references palette index ${paletteIndex}`);
    }
  });

  return chart as StoredChart;
}

export type DecodedChart = {
  placements: Placement[];
  /**
   * Symbols the stored chart references that this build's library doesn't have
   * — a chart saved before a symbol was renamed or removed in Figma. They're
   * kept as placements rather than dropped, so the data survives for whoever
   * can fix it, but the caller should warn: the renderer falls back to a
   * one-cell span, which is wrong for what may have been a wide cable.
   */
  unknownSymbolIds: string[];
};

export function decode(stored: unknown, knownSymbol: (id: string) => boolean): DecodedChart {
  const chart = validate(stored);

  const unknown = new Set<string>();
  for (const id of chart.palette) {
    if (!knownSymbol(id)) unknown.add(id);
  }

  // Stored data can come from an edited localStorage entry or an imported
  // file. Do not let either create a document whose placements disagree with
  // its one-placement-per-cell occupancy index. Unknown symbols deliberately
  // retain the renderer's one-cell fallback, because their original span is
  // unavailable in this version of the library.
  const occupied = new Set<string>();
  for (const [col, row, paletteIndex] of chart.stitches) {
    const symbolId = chart.palette[paletteIndex]!;
    const span = knownSymbol(symbolId) ? (getSymbol(symbolId)?.span ?? 1) : 1;
    for (let cell = col; cell < col + span; cell++) {
      const key = `${cell},${row}`;
      if (occupied.has(key)) {
        throw new ChartFormatError(`overlapping stitches at col ${cell}, row ${row}`);
      }
      occupied.add(key);
    }
  }

  const placements = chart.stitches.map(([col, row, paletteIndex]) => ({
    id: newPlacementId(),
    symbolId: chart.palette[paletteIndex]!,
    col,
    row,
  }));

  return { placements, unknownSymbolIds: [...unknown] };
}
