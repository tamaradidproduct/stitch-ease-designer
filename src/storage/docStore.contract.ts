import { describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import type { Placement } from "../model/types";
import {
  ChartConflictError,
  ChartNotFoundError,
  DEFAULT_CHART_NAME,
  type DocStore,
} from "./DocStore";

/**
 * The behaviour every `DocStore` must have, run against each implementation.
 *
 * This exists so that swapping browser storage for Supabase is a mechanical
 * change rather than a hopeful one: the conflict semantics, the ordering, and
 * the not-found behaviour are pinned here once, and the new backend either
 * passes or it doesn't.
 *
 * Kept free of any implementation detail — a store is only ever touched
 * through the interface.
 */

const CABLE = "3_3_left_cable"; // 6 cells
const stitch = (symbolId: string, col: number, row: number): Placement => ({
  id: `tmp_${col}_${row}`,
  symbolId,
  col,
  row,
});

export function describeDocStoreContract(name: string, makeStore: () => DocStore): void {
  describe(`DocStore contract: ${name}`, () => {
    it("starts empty", async () => {
      expect(await makeStore().list()).toEqual([]);
    });

    it("creates a chart with a default name and lists it", async () => {
      const store = makeStore();
      const meta = await store.create();

      expect(meta.name).toBe(DEFAULT_CHART_NAME);
      expect(meta.createdAt).toBe(meta.updatedAt);
      expect(await store.list()).toEqual([meta]);
    });

    it("creates a chart with a given name, empty of stitches", async () => {
      const store = makeStore();
      const meta = await store.create("Frost flower yoke");
      const loaded = await store.load(meta.id);

      expect(loaded.meta.name).toBe("Frost flower yoke");
      expect(loaded.placements).toEqual([]);
      expect(loaded.unknownSymbolIds).toEqual([]);
    });

    it("round-trips stitches, spans intact", async () => {
      const store = makeStore();
      const { id, rev } = await store.create();
      await store.save(id, [stitch(CABLE, 0, 0), stitch("purl", 10, 3)], rev);

      const loaded = await store.load(id);
      expect(loaded.placements).toHaveLength(2);

      const index = DocIndex.from(loaded.placements);
      expect(index.placementAt(5, 0)?.symbolId).toBe(CABLE);
      expect(index.placementAt(6, 0)).toBeUndefined();
      expect(index.placementAt(10, 3)?.symbolId).toBe("purl");
    });

    it("advances rev on every write, so a save can't be replayed", async () => {
      const store = makeStore();
      const created = await store.create();
      const saved = await store.save(created.id, [stitch("knit", 0, 0)], created.rev);

      expect(saved.rev).not.toBe(created.rev);
      await expect(store.save(created.id, [], created.rev)).rejects.toBeInstanceOf(
        ChartConflictError,
      );
    });

    it("rejects a save built on a rev that has moved on", async () => {
      const store = makeStore();
      const created = await store.create();

      // Two tabs load the same chart...
      const tabA = await store.load(created.id);
      const tabB = await store.load(created.id);

      // ...one saves...
      await store.save(created.id, [stitch("knit", 0, 0)], tabA.meta.rev);

      // ...and the other must not silently overwrite it.
      await expect(
        store.save(created.id, [stitch("purl", 5, 5)], tabB.meta.rev),
      ).rejects.toBeInstanceOf(ChartConflictError);

      const loaded = await store.load(created.id);
      expect(loaded.placements.map((p) => p.symbolId)).toEqual(["knit"]);
    });

    it("lets the loser save once it reloads", async () => {
      const store = makeStore();
      const created = await store.create();
      await store.save(created.id, [stitch("knit", 0, 0)], created.rev);

      const fresh = await store.load(created.id);
      await store.save(created.id, [stitch("purl", 1, 1)], fresh.meta.rev);

      expect((await store.load(created.id)).placements.map((p) => p.symbolId)).toEqual([
        "purl",
      ]);
    });

    it("renames without touching the stitches", async () => {
      const store = makeStore();
      const created = await store.create();
      const saved = await store.save(created.id, [stitch("knit", 2, 2)], created.rev);

      const renamed = await store.rename(created.id, "Sleeve cable");
      expect(renamed.name).toBe("Sleeve cable");
      expect(renamed.rev).not.toBe(saved.rev);

      const loaded = await store.load(created.id);
      expect(loaded.meta.name).toBe("Sleeve cable");
      expect(loaded.placements).toHaveLength(1);
    });

    it("removes a chart", async () => {
      const store = makeStore();
      const a = await store.create("keep");
      const b = await store.create("drop");

      await store.remove(b.id);

      expect((await store.list()).map((m) => m.id)).toEqual([a.id]);
      await expect(store.load(b.id)).rejects.toBeInstanceOf(ChartNotFoundError);
    });

    it("keeps charts independent of one another", async () => {
      const store = makeStore();
      const a = await store.create("a");
      const b = await store.create("b");

      await store.save(a.id, [stitch("knit", 0, 0)], a.rev);
      await store.save(b.id, [stitch("purl", 1, 0), stitch("purl", 2, 0)], b.rev);

      expect((await store.load(a.id)).placements).toHaveLength(1);
      expect((await store.load(b.id)).placements).toHaveLength(2);
    });

    it("lists most recently updated first", async () => {
      const store = makeStore();
      const first = await store.create("first");
      await store.create("second");

      expect((await store.list()).map((m) => m.name)).toEqual(["second", "first"]);

      await store.save(first.id, [stitch("knit", 0, 0)], first.rev);
      expect((await store.list()).map((m) => m.name)).toEqual(["first", "second"]);
    });

    it("reports not-found rather than inventing a chart", async () => {
      const store = makeStore();
      await expect(store.load("nope")).rejects.toBeInstanceOf(ChartNotFoundError);
      await expect(store.rename("nope", "x")).rejects.toBeInstanceOf(ChartNotFoundError);
      await expect(store.remove("nope")).rejects.toBeInstanceOf(ChartNotFoundError);
      await expect(store.save("nope", [], "r")).rejects.toBeInstanceOf(ChartNotFoundError);
    });

    it("handles a chart big enough to matter", async () => {
      const store = makeStore();
      const created = await store.create();
      const many: Placement[] = [];
      for (let row = 0; row < 60; row++) {
        for (let col = 0; col < 60; col++) many.push(stitch("knit", col, row));
      }

      await store.save(created.id, many, created.rev);
      expect((await store.load(created.id)).placements).toHaveLength(3600);
    });
  });
}
