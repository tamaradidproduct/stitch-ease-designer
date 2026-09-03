import type { DocStore } from "./DocStore";

export type MigrationResult = {
  migrated: string[];
  failed: { name: string; message: string }[];
};

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
  source: DocStore,
  target: DocStore,
): Promise<MigrationResult> {
  const result: MigrationResult = { migrated: [], failed: [] };
  const charts = await source.list();

  for (const meta of charts) {
    try {
      const { placements, repeats } = await source.load(meta.id);
      const created = await target.create(meta.name);
      await target.save(created.id, placements, created.rev, repeats);
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
