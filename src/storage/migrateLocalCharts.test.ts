import { describe, expect, it } from "vitest";
import type { DocStore } from "./DocStore";
import { createMemoryDocStore } from "./keyValueDocStore";
import { migrateLocalCharts } from "./migrateLocalCharts";

const seed = async (store: DocStore, name: string, symbolId = "knit") => {
  const meta = await store.create(name);
  await store.save(meta.id, [{ id: "p", symbolId, col: 0, row: 0 }], meta.rev);
  return meta;
};

describe("migrateLocalCharts", () => {
  it("copies every chart's stitches and removes it from the source", async () => {
    const source = createMemoryDocStore();
    const target = createMemoryDocStore();
    await seed(source, "Peacock yoke", "purl");
    await seed(source, "Sleeve cable", "k2tog");

    const result = await migrateLocalCharts(source, target);

    expect(result.migrated.sort()).toEqual(["Peacock yoke", "Sleeve cable"]);
    expect(result.failed).toEqual([]);
    expect(await source.list()).toEqual([]);

    const targetCharts = await target.list();
    expect(targetCharts.map((m) => m.name).sort()).toEqual(["Peacock yoke", "Sleeve cable"]);

    const migratedOne = await target.load(
      targetCharts.find((m) => m.name === "Peacock yoke")!.id,
    );
    expect(migratedOne.placements[0]?.symbolId).toBe("purl");
  });

  it("does nothing to an empty source", async () => {
    const result = await migrateLocalCharts(createMemoryDocStore(), createMemoryDocStore());
    expect(result).toEqual({ migrated: [], failed: [] });
  });

  it("leaves a chart in the source when the target write fails, rather than losing it", async () => {
    const source = createMemoryDocStore();
    const good = await seed(source, "Keep me");
    void good;

    const flaky: DocStore = {
      ...createMemoryDocStore(),
      async save() {
        throw new Error("simulated network drop");
      },
    };

    const result = await migrateLocalCharts(source, flaky);

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([{ name: "Keep me", message: "simulated network drop" }]);
    // Not removed locally - nothing was actually confirmed written.
    expect((await source.list()).map((m) => m.name)).toEqual(["Keep me"]);
  });

  it("migrates the rest even if one chart fails, and only removes the successful ones", async () => {
    const source = createMemoryDocStore();
    await seed(source, "Will succeed");
    const willFail = await seed(source, "Will fail");

    const target = createMemoryDocStore();
    const realSave = target.save.bind(target);
    const flakyTarget: DocStore = {
      ...target,
      async create(name) {
        if (name === "Will fail") throw new Error("quota exceeded");
        return target.create(name);
      },
      save: realSave,
    };

    const result = await migrateLocalCharts(source, flakyTarget);

    expect(result.migrated).toEqual(["Will succeed"]);
    expect(result.failed).toEqual([{ name: "Will fail", message: "quota exceeded" }]);
    expect((await source.list()).map((m) => m.name)).toEqual(["Will fail"]);
    void willFail;
  });
});
