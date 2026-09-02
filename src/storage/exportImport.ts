import type { DocMeta, Placement } from "../model/types";
import { getSymbol } from "../symbols/registry";
import { DEFAULT_CHART_NAME, type DocStore } from "./DocStore";
import { decode, encode, type StoredChart } from "./serialize";

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

const safeFilename = (name: string) =>
  `${name.trim().replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "chart"}.stitchchart.json`;

export function exportChart(name: string, placements: Iterable<Placement>): void {
  const file: ChartFile = {
    ...encode(placements),
    name,
    exportedAt: new Date().toISOString(),
  };

  const url = URL.createObjectURL(
    new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename(name);
  // Some browsers only honour a click on an anchor that's actually in the
  // document.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the click to have been handled.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ImportedChart = {
  name: string;
  placements: Placement[];
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
  const { placements, unknownSymbolIds } = decode(parsed, (id) => !!getSymbol(id));

  const fromFile = file.name.replace(/\.stitchchart\.json$|\.json$/i, "").trim();
  const name =
    (typeof (parsed as ChartFile)?.name === "string" && (parsed as ChartFile).name.trim()) ||
    fromFile ||
    DEFAULT_CHART_NAME;

  return { name, placements, unknownSymbolIds };
}

/**
 * Parse a file and land it in `store` as a new chart.
 *
 * Creating the document and writing its content are two separate storage
 * writes; if the second one fails (e.g. the import is big enough to hit
 * `StorageFullError`), the just-created empty chart is removed rather than
 * left behind as an orphan the user never asked for and can't see yet.
 */
export async function importChartIntoStore(store: DocStore, file: File): Promise<DocMeta> {
  const { name, placements } = await importChart(file);
  const meta = await store.create(name);
  try {
    await store.save(meta.id, placements, meta.rev);
  } catch (error) {
    await store.remove(meta.id).catch(() => {});
    throw error;
  }
  return meta;
}
