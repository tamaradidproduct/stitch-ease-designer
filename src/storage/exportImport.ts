import type { DocMeta, Placement, ReferenceImage, RepeatDefinition } from "../model/types";
import { getSymbol } from "../symbols/registry";
import { DEFAULT_CHART_NAME, type DocStore } from "./DocStore";
import { decode, encode, type StoredChart } from "./serialize";
import { resolveReferenceImageUrl, uploadReferenceImage } from "./referenceImages";

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

const dataUrlFor = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read reference image"));
    reader.readAsDataURL(blob);
  });

async function exportableReferenceImage(image?: ReferenceImage): Promise<ReferenceImage | undefined> {
  if (!image || image.ref.startsWith("data:")) return image;
  const response = await fetch(await resolveReferenceImageUrl(image.ref));
  if (!response.ok) throw new Error("Could not include reference image in export");
  return { ...image, ref: await dataUrlFor(await response.blob()) };
}

export async function exportChart(
  name: string,
  placements: Iterable<Placement>,
  repeats: RepeatDefinition[] = [],
  referenceImage?: ReferenceImage,
): Promise<void> {
  const file: ChartFile = {
    ...encode(placements, repeats, await exportableReferenceImage(referenceImage)),
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
  repeats: RepeatDefinition[];
  referenceImage?: ReferenceImage;
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
  const { placements, repeats, referenceImage, unknownSymbolIds } = decode(parsed, (id) => !!getSymbol(id));

  const fromFile = file.name.replace(/\.stitchchart\.json$|\.json$/i, "").trim();
  const name =
    (typeof (parsed as ChartFile)?.name === "string" && (parsed as ChartFile).name.trim()) ||
    fromFile ||
    DEFAULT_CHART_NAME;

  return {
    name,
    placements,
    repeats,
    ...(referenceImage ? { referenceImage } : {}),
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
export async function importChartIntoStore(store: DocStore, file: File): Promise<DocMeta> {
  const { name, placements, repeats, referenceImage } = await importChart(file);
  const meta = await store.create(name);
  try {
    let importedImage: ReferenceImage | undefined;
    if (referenceImage?.ref.startsWith("data:")) {
      const response = await fetch(referenceImage.ref);
      const blob = await response.blob();
      const uploaded = await uploadReferenceImage(
        meta.id,
        new File([blob], "reference-image", { type: blob.type || "image/png" }),
      );
      importedImage = { ...referenceImage, ...uploaded };
    }
    await store.save(meta.id, placements, meta.rev, repeats, importedImage);
  } catch (error) {
    await store.remove(meta.id).catch(() => {});
    throw error;
  }
  return meta;
}
