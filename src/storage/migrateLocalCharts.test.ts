import { describe, expect, it } from "vitest";
import type { ReferenceImage } from "../model/types";
import type { ChartStore } from "./ChartStore";
import { createMemoryChartStore } from "./keyValueChartStore";
import { migrateLocalCharts } from "./migrateLocalCharts";

const referenceImage: ReferenceImage = {
  ref: "data:image/png;base64,AAAA",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  naturalWidth: 200,
  naturalHeight: 160,
  opacity: 0.5,
  visible: true,
  locked: false,
};

const seed = async (store: ChartStore, name: string, symbolId = "knit") => {
  const meta = await store.create(name);
  await store.save(meta.id, [{ id: "p", symbolId, col: 0, row: 0 }], meta.rev);
  return meta;
};

describe("migrateLocalCharts", () => {
  it("copies every chart's stitches and removes it from the source", async () => {
    const source = createMemoryChartStore();
    const target = createMemoryChartStore();
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
    const result = await migrateLocalCharts(createMemoryChartStore(), createMemoryChartStore());
    expect(result).toEqual({ migrated: [], failed: [] });
  });

  it("leaves a chart in the source when the target write fails, rather than losing it", async () => {
    const source = createMemoryChartStore();
    const good = await seed(source, "Keep me");
    void good;

    const flaky: ChartStore = {
      ...createMemoryChartStore(),
      async save() {
        throw new Error("simulated network drop");
      },
    };

    const result = await migrateLocalCharts(source, flaky);

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([{ name: "Keep me", message: "simulated network drop" }]);
    // Not removed locally - nothing was actually confirmed written.
    expect((await source.list()).map((m) => m.name)).toEqual(["Keep me"]);
    // And no empty orphan left behind in the target either - `create`
    // ran before `save` failed, so without cleanup this would silently
    // grow a fresh orphan on every retry.
    expect(await flaky.list()).toEqual([]);
  });

  it("migrates the rest even if one chart fails, and only removes the successful ones", async () => {
    const source = createMemoryChartStore();
    await seed(source, "Will succeed");
    const willFail = await seed(source, "Will fail");

    const target = createMemoryChartStore();
    const realSave = target.save.bind(target);
    const flakyTarget: ChartStore = {
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

  it("carries a chart's reference image over to the target, re-uploaded rather than reused as-is", async () => {
    const source = createMemoryChartStore();
    const meta = await source.create("Peacock yoke");
    await source.save(meta.id, [], meta.rev, [], referenceImage);

    const target = createMemoryChartStore();
    const calls: { targetChartId: string; image: ReferenceImage }[] = [];
    const migratedRef: ReferenceImage = { ...referenceImage, ref: "uid/new-chart-id/reference.png" };
    const migrateImage = async (targetChartId: string, image: ReferenceImage) => {
      calls.push({ targetChartId, image });
      return migratedRef;
    };

    const result = await migrateLocalCharts(source, target, migrateImage);

    expect(result.failed).toEqual([]);
    expect(result.migrated).toEqual(["Peacock yoke"]);

    const targetMeta = (await target.list())[0]!;
    expect(calls).toEqual([{ targetChartId: targetMeta.id, image: referenceImage }]);

    const migratedChart = await target.load(targetMeta.id);
    expect(migratedChart.referenceImage).toEqual(migratedRef);
  });

  it("leaves a chart with a reference image in the source when re-uploading the image fails", async () => {
    const source = createMemoryChartStore();
    const meta = await source.create("Peacock yoke");
    await source.save(meta.id, [], meta.rev, [], referenceImage);

    const target = createMemoryChartStore();
    const migrateImage = async () => {
      throw new Error("upload failed");
    };

    const result = await migrateLocalCharts(source, target, migrateImage);

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([{ name: "Peacock yoke", message: "upload failed" }]);
    expect((await source.list()).map((m) => m.name)).toEqual(["Peacock yoke"]);
    // No empty orphan left in the target from the `create` that ran
    // before the image re-upload failed.
    expect(await target.list()).toEqual([]);
  });

  it("removes the just-created target chart if the save after a successful image migration fails", async () => {
    const source = createMemoryChartStore();
    const meta = await source.create("Peacock yoke");
    await source.save(meta.id, [], meta.rev, [], referenceImage);

    const target = createMemoryChartStore();
    const flakyTarget: ChartStore = {
      ...target,
      async save() {
        throw new Error("quota exceeded");
      },
    };
    const migrateImage = async () => ({ ...referenceImage, ref: "uid/new-chart-id/reference.png" });

    const result = await migrateLocalCharts(source, flakyTarget, migrateImage);

    expect(result.migrated).toEqual([]);
    expect(result.failed).toEqual([{ name: "Peacock yoke", message: "quota exceeded" }]);
    expect((await source.list()).map((m) => m.name)).toEqual(["Peacock yoke"]);
    // The image migration succeeded, but the chart it belonged to never
    // got saved - the empty chart `create` made for it must not survive.
    expect(await target.list()).toEqual([]);
  });
});
