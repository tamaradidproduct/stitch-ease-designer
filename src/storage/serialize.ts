import { newPlacementId } from "../model/ops";
import type { Placement, ReferenceImage, RepeatDefinition } from "../model/types";
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
  stitches: ([number, number, number] | [number, number, number, number])[];
  groups?: string[];
  repeats?: RepeatDefinition[];
  referenceImage?: ReferenceImage;
};

export const STORED_VERSION = 2;

export const emptyChart = (): StoredChart => ({
  v: STORED_VERSION,
  palette: [],
  stitches: [],
  groups: [],
  repeats: [],
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
export function encode(
  placements: Iterable<Placement>,
  repeats: RepeatDefinition[] = [],
  referenceImage?: ReferenceImage,
): StoredChart {
  const sorted = [...placements].sort((a, b) => a.row - b.row || a.col - b.col);

  const palette: string[] = [];
  const indexOf = new Map<string, number>();
  const stitches: StoredChart["stitches"] = [];
  const groups: string[] = [];
  const groupIndex = new Map<string, number>();

  for (const p of sorted) {
    let paletteIndex = indexOf.get(p.symbolId);
    if (paletteIndex === undefined) {
      paletteIndex = palette.length;
      palette.push(p.symbolId);
      indexOf.set(p.symbolId, paletteIndex);
    }
    if (p.groupId) {
      let at = groupIndex.get(p.groupId);
      if (at === undefined) {
        at = groups.length;
        groups.push(p.groupId);
        groupIndex.set(p.groupId, at);
      }
      stitches.push([p.col, p.row, paletteIndex, at]);
    } else {
      stitches.push([p.col, p.row, paletteIndex]);
    }
  }

  return {
    v: STORED_VERSION,
    palette,
    stitches,
    groups,
    repeats,
    ...(referenceImage ? { referenceImage } : null),
  };
}

const isInteger = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

function validate(stored: unknown): StoredChart {
  if (typeof stored !== "object" || stored === null) {
    throw new ChartFormatError("not an object");
  }
  const chart = stored as Partial<StoredChart>;

  if (!isInteger(chart.v)) throw new ChartFormatError("missing version");
  if (chart.v !== 1 && chart.v !== STORED_VERSION) {
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
    if (!Array.isArray(stitch) || ![3, 4].includes(stitch.length) || !stitch.every(isInteger)) {
      throw new ChartFormatError(`stitch ${i} has an invalid tuple`);
    }
    const paletteIndex = stitch[2] as number;
    if (paletteIndex < 0 || paletteIndex >= chart.palette!.length) {
      throw new ChartFormatError(`stitch ${i} references palette index ${paletteIndex}`);
    }
  });

  chart.groups ??= [];
  chart.repeats ??= [];
  if (!Array.isArray(chart.groups) || chart.groups.some((id) => typeof id !== "string")) {
    throw new ChartFormatError("groups must be an array of ids");
  }
  if (!Array.isArray(chart.repeats)) throw new ChartFormatError("repeats must be an array");
  chart.stitches.forEach((stitch, i) => {
    if (stitch.length === 4 && (stitch[3] < 0 || stitch[3] >= chart.groups!.length)) {
      throw new ChartFormatError(`stitch ${i} references an invalid group`);
    }
  });
  chart.repeats.forEach((repeat, i) => {
    if (
      typeof repeat !== "object" ||
      repeat === null ||
      typeof repeat.id !== "string" ||
      typeof repeat.name !== "string" ||
      !isInteger(repeat.width) ||
      repeat.width < 1 ||
      !isInteger(repeat.height) ||
      repeat.height < 1 ||
      !Array.isArray(repeat.stitches) ||
      repeat.stitches.some(
        (stitch) =>
          typeof stitch !== "object" ||
          stitch === null ||
          typeof stitch.symbolId !== "string" ||
          !isInteger(stitch.col) ||
          !isInteger(stitch.row),
      )
    ) {
      throw new ChartFormatError(`repeat ${i} is invalid`);
    }
  });

  // A repeat is user-controlled data on import, not just something produced
  // by createRepeat(). Reject a malformed footprint before it can be
  // instantiated: DocIndex records one owner per cell, so overlapping repeat
  // stitches would otherwise silently overwrite each other's occupancy.
  chart.repeats.forEach((repeat, i) => {
    const occupied = new Set<string>();
    for (const stitch of repeat.stitches) {
      const span = getSymbol(stitch.symbolId)?.span ?? 1;
      if (
        stitch.col < 0 ||
        stitch.row < 0 ||
        stitch.row >= repeat.height ||
        stitch.col + span > repeat.width
      ) {
        throw new ChartFormatError(`repeat ${i} has a stitch outside its footprint`);
      }
      for (let col = stitch.col; col < stitch.col + span; col++) {
        const key = `${col},${stitch.row}`;
        if (occupied.has(key)) {
          throw new ChartFormatError(`repeat ${i} has overlapping stitches at col ${col}, row ${stitch.row}`);
        }
        occupied.add(key);
      }
    }
  });

  if (chart.referenceImage !== undefined) {
    const img = chart.referenceImage as Partial<ReferenceImage> | null;
    if (
      typeof img !== "object" ||
      img === null ||
      typeof img.ref !== "string" ||
      typeof img.x !== "number" ||
      typeof img.y !== "number" ||
      typeof img.width !== "number" ||
      !(img.width > 0) ||
      typeof img.height !== "number" ||
      !(img.height > 0) ||
      typeof img.naturalWidth !== "number" ||
      !(img.naturalWidth > 0) ||
      typeof img.naturalHeight !== "number" ||
      !(img.naturalHeight > 0) ||
      typeof img.opacity !== "number" ||
      typeof img.visible !== "boolean" ||
      typeof img.locked !== "boolean" ||
      (img.inFront !== undefined && typeof img.inFront !== "boolean")
    ) {
      throw new ChartFormatError("referenceImage is invalid");
    }
    if (img.stitchPin !== undefined) {
      const pin = img.stitchPin as Partial<NonNullable<ReferenceImage["stitchPin"]>> | null;
      // A fraction of the image, so both components are bounded - anything
      // outside 0..1 would pin a point that isn't on the image at all.
      if (
        typeof pin !== "object" ||
        pin === null ||
        typeof pin.u !== "number" ||
        typeof pin.v !== "number" ||
        !(pin.u >= 0 && pin.u <= 1) ||
        !(pin.v >= 0 && pin.v <= 1)
      ) {
        throw new ChartFormatError("referenceImage.stitchPin is invalid");
      }
    }
  }

  return chart as StoredChart;
}

export type DecodedChart = {
  placements: Placement[];
  repeats: RepeatDefinition[];
  referenceImage?: ReferenceImage;
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

  const placements = chart.stitches.map(([col, row, paletteIndex, groupIndex]) => ({
    id: newPlacementId(),
    symbolId: chart.palette[paletteIndex]!,
    col,
    row,
    ...(groupIndex === undefined ? {} : { groupId: chart.groups![groupIndex] }),
  }));

  return {
    placements,
    repeats: chart.repeats!,
    unknownSymbolIds: [...unknown],
    ...(chart.referenceImage ? { referenceImage: chart.referenceImage } : null),
  };
}
