import { chartBounds } from "../model/chartBounds";
import { cellKey } from "../model/cellKey";
import type { DocMeta, PatternInfo, Placement, ReferenceImage, RepeatDefinition } from "../model/types";
import { getSymbol, spanOf } from "../symbols/registry";
import { DEFAULT_CHART_NAME, type ChartStore } from "./ChartStore";
import { decode, encode, type StoredChart } from "./serialize";
import { downloadBlob, safeFilename } from "./download";
import { removeReferenceImageFile, resolveReferenceImageUrl, uploadReferenceImage } from "./referenceImages";

/** The palette id for a cell inside the chart's rectangle where nothing was placed. */
const NO_STITCH_ID = "no_stitch";

/**
 * Every cell in the confirmed-placement rectangle that isn't covered by a
 * placement (span included) - what an export has to backfill with
 * `NO_STITCH_ID`, since the importer reads a chart as a rectangle where every
 * cell is listed explicitly. `placements` must already exclude suggestions
 * (see `exportChart`) - an unconfirmed guess neither counts toward the
 * rectangle nor blocks a cell from needing a fill.
 */
function noStitchCells(placements: readonly Placement[]): [number, number][] {
  const bounds = chartBounds(placements);
  if (!bounds) return [];

  const covered = new Set<string>();
  for (const p of placements) {
    const span = spanOf(p.symbolId);
    for (let col = p.col; col < p.col + span; col++) covered.add(cellKey(col, p.row));
  }

  const missing: [number, number][] = [];
  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      if (!covered.has(cellKey(col, row))) missing.push([col, row]);
    }
  }
  return missing;
}

/**
 * Fills every unstitched cell of `stored`'s rectangle with `NO_STITCH_ID`,
 * added as the palette's last entry (only if at least one cell needs it) so
 * every other stitch keeps its existing palette index.
 *
 * Exported so the fill logic is testable directly against a plain
 * `StoredChart`, without going through `exportChart`'s browser-only download
 * side effect.
 */
export function fillNoStitchCells(stored: StoredChart, confirmedPlacements: readonly Placement[]): StoredChart {
  const missing = noStitchCells(confirmedPlacements);
  if (!missing.length) return stored;

  const noStitchIndex = stored.palette.length;
  const stitches = [...stored.stitches, ...missing.map(([col, row]): [number, number, number] => [
    col,
    row,
    noStitchIndex,
  ])];
  stitches.sort(([colA, rowA], [colB, rowB]) => rowA - rowB || colA - colB);

  return {
    ...stored,
    palette: [...stored.palette, NO_STITCH_ID],
    stitches,
  };
}

/**
 * Export and import a chart as a file.
 *
 * While charts live only in the browser, this is the difference between a
 * tester's work being recoverable and being one cleared-site-data away from
 * gone. It's also the fallback route into an account later, if the automatic
 * upload of local charts ever misses something.
 */

/** The file format: the stored chart, plus enough context to be self-describing. */
export type ChartFile = StoredChart & { name: string; exportedAt: string };

const dataUrlFor = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read reference image"));
    reader.readAsDataURL(blob);
  });

async function exportableReferenceImage(image: ReferenceImage): Promise<ReferenceImage> {
  if (image.ref.startsWith("data:")) return image;
  const response = await fetch(await resolveReferenceImageUrl(image.ref));
  if (!response.ok) throw new Error("Could not include reference image in export");
  return { ...image, ref: await dataUrlFor(await response.blob()) };
}

export async function exportChart(
  name: string,
  placements: Iterable<Placement>,
  repeats: RepeatDefinition[] = [],
  referenceImages: ReferenceImage[] = [],
  glossaryIds?: readonly string[],
  quickSymbolIds?: readonly string[],
  patternInfo?: PatternInfo,
  /** False drops every reference image from the export - e.g. before sharing a chart publicly. */
  includeReferenceImage = true,
): Promise<void> {
  // A chart is exported finished: an unconfirmed suggestion is a guess the
  // designer hasn't signed off on, not a real stitch, so it's dropped
  // entirely rather than exported as one - and never counts toward the
  // rectangle `fillNoStitchCells` backfills below.
  const confirmed = [...placements].filter((p) => !p.suggested);

  const stored = encode(
    confirmed,
    repeats,
    includeReferenceImage ? await Promise.all(referenceImages.map(exportableReferenceImage)) : [],
    glossaryIds,
    quickSymbolIds,
    patternInfo,
  );

  const file: ChartFile = {
    ...fillNoStitchCells(stored, confirmed),
    name,
    exportedAt: new Date().toISOString(),
  };

  downloadBlob(
    new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
    safeFilename(name, "stitchchart.json"),
  );
}

export type ImportedChart = {
  name: string;
  placements: Placement[];
  repeats: RepeatDefinition[];
  referenceImages: ReferenceImage[];
  glossaryIds: string[];
  quickSymbolIds: string[];
  patternInfo: PatternInfo;
  unknownSymbolIds: string[];
};

/**
 * Parse an exported file. Throws `ChartFormatError` (via `decode`) on anything
 * malformed — this is user-supplied input from a file picker, so it gets the
 * same distrust as anything else read back from outside the app.
 */
export async function importChart(file: File): Promise<ImportedChart> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  const { placements, repeats, referenceImages, glossaryIds, quickSymbolIds, patternInfo, unknownSymbolIds } = decode(
    parsed,
    (id) => !!getSymbol(id),
  );

  const fromFile = file.name.replace(/\.stitchchart\.json$|\.json$/i, "").trim();
  const name =
    (typeof (parsed as ChartFile)?.name === "string" && (parsed as ChartFile).name.trim()) ||
    fromFile ||
    DEFAULT_CHART_NAME;

  return {
    name,
    placements,
    repeats,
    referenceImages,
    glossaryIds,
    quickSymbolIds,
    patternInfo,
    unknownSymbolIds,
  };
}

/**
 * Parse a file and land it in `store` as a new chart.
 *
 * Creating the document and writing its content are two separate storage
 * writes; if the second one fails (e.g. the import is big enough to hit
 * `StorageFullError`), the just-created empty chart is removed rather than
 * left behind as an orphan the user never asked for and can't see yet.
 */
export async function importChartIntoStore(store: ChartStore, file: File): Promise<DocMeta> {
  const { name, placements, repeats, referenceImages, glossaryIds, quickSymbolIds, patternInfo } =
    await importChart(file);
  const meta = await store.create(name);
  const importedImages: ReferenceImage[] = [];
  try {
    for (const image of referenceImages) {
      if (!image.ref.startsWith("data:")) {
        importedImages.push(image);
        continue;
      }
      const response = await fetch(image.ref);
      const blob = await response.blob();
      const uploaded = await uploadReferenceImage(
        meta.id,
        new File([blob], "reference-image", { type: blob.type || "image/png" }),
        image.id,
      );
      importedImages.push({ ...image, ...uploaded });
    }
    await store.save(
      meta.id,
      placements,
      meta.rev,
      repeats,
      importedImages,
      glossaryIds,
      quickSymbolIds,
      patternInfo,
    );
  } catch (error) {
    // Clean up whichever images already finished uploading before the
    // failure, so a partial import doesn't orphan Storage files that the
    // about-to-be-removed chart can no longer reference.
    await Promise.all(
      importedImages
        .filter((image) => !image.ref.startsWith("data:"))
        .map((image) => removeReferenceImageFile(image.ref).catch(() => {})),
    );
    await store.remove(meta.id).catch(() => {});
    throw error;
  }
  return meta;
}
