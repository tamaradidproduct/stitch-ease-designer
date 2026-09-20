import type { ReferenceImage } from "../model/types";
import type { ChartStore } from "./ChartStore";
import { resolveReferenceImageUrl, uploadReferenceImage } from "./referenceImages";

export type MigrationResult = {
  migrated: string[];
  failed: { name: string; message: string }[];
};

/**
 * Re-uploads a chart's reference image into the *target* chart's own
 * storage, rather than carrying its `ref` over unchanged - a local chart's
 * `ref` is either a `data:` URL (fine to inline, but not what a real chart
 * gets normally) or a Storage path scoped to whatever chart it was
 * originally uploaded against, neither of which is what the migrated chart
 * should end up pointing at. Mirrors `importChartIntoStore` in
 * exportImport.ts, which re-uploads for the same reason on the file-import
 * path.
 */
async function migrateReferenceImage(
  targetChartId: string,
  image: ReferenceImage,
): Promise<ReferenceImage> {
  const response = await fetch(await resolveReferenceImageUrl(image.ref));
  if (!response.ok) throw new Error("Could not carry over the reference image");
  const blob = await response.blob();
  const uploaded = await uploadReferenceImage(
    targetChartId,
    new File([blob], "reference-image", { type: blob.type || "image/png" }),
  );
  return { ...image, ...uploaded };
}

/**
 * Copies every chart in `source` (browser storage) into `target` (the
 * signed-in account), removing each from `source` only once it's confirmed
 * written to `target`.
 *
 * Order matters for safety, not just correctness: a chart is only removed
 * locally after `target.save` resolves, so a failure partway through — a
 * dropped connection, a quota error on the target — leaves the unmigrated
 * remainder exactly where it was, safe to retry, rather than in a half-copied
 * limbo with neither store holding a complete version.
 */
export async function migrateLocalCharts(
  source: ChartStore,
  target: ChartStore,
  migrateImage: (targetChartId: string, image: ReferenceImage) => Promise<ReferenceImage> = migrateReferenceImage,
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: [], failed: [] };
  const charts = await source.list();

  for (const meta of charts) {
    try {
      const { placements, repeats, referenceImage, glossaryIds, quickSymbolIds } = await source.load(meta.id);
      const created = await target.create(meta.name);
      try {
        const migratedImage = referenceImage ? await migrateImage(created.id, referenceImage) : undefined;
        await target.save(created.id, placements, created.rev, repeats, migratedImage, glossaryIds, quickSymbolIds);
      } catch (error) {
        // Otherwise a failure here - the image re-upload, or the save that
        // follows it - would leave an empty chart behind in the target
        // with nothing pointing back at it; since the source chart stays
        // put (below) for a retry, an unremoved orphan would just get a
        // sibling every time that retry runs. Same cleanup importChartIntoStore
        // does for the equivalent failure on the file-import path.
        await target.remove(created.id).catch(() => {});
        throw error;
      }
      await source.remove(meta.id);
      result.migrated.push(meta.name);
    } catch (error) {
      result.failed.push({
        name: meta.name,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
