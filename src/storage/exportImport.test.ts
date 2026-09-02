import { describe, expect, it } from "vitest";
import type { DocMeta } from "../model/types";
import { DEFAULT_CHART_NAME, StorageFullError, type DocStore } from "./DocStore";
import { importChart, importChartIntoStore } from "./exportImport";
import { createMemoryDocStore } from "./keyValueDocStore";
import { emptyChart } from "./serialize";

const jsonFile = (name: string, body: unknown) =>
  new File([JSON.stringify(body)], name, { type: "application/json" });

describe("importChart", () => {
  it("prefers the name stored in the file", async () => {
    const file = jsonFile("whatever.json", { ...emptyChart(), name: "Peacock yoke" });
    expect((await importChart(file)).name).toBe("Peacock yoke");
  });

  it("falls back to the filename when the file has no name", async () => {
    const file = jsonFile("Gansey.stitchchart.json", emptyChart());
    expect((await importChart(file)).name).toBe("Gansey");
  });

  it("falls back to a default name rather than an empty string when both are blank", async () => {
    // A file literally named ".json" reduces to "" once the extension is
    // stripped, and the stored chart has no name of its own either.
    const file = jsonFile(".json", { ...emptyChart(), name: "   " });
    expect((await importChart(file)).name).toBe(DEFAULT_CHART_NAME);
  });
});

describe("importChartIntoStore", () => {
  it("creates the chart and writes its content", async () => {
    const store = createMemoryDocStore();
    const file = jsonFile("Gansey.stitchchart.json", emptyChart());

    const meta = await importChartIntoStore(store, file);

    expect(meta.name).toBe("Gansey");
    expect((await store.load(meta.id)).placements).toEqual([]);
    expect(await store.list()).toHaveLength(1);
  });

  it("removes the just-created chart if writing its content fails, instead of leaving an orphan", async () => {
    const created: DocMeta = {
      id: "new-chart",
      name: "Gansey",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      rev: "r1",
    };
    const removed: string[] = [];
    const store: DocStore = {
      list: async () => [],
      create: async () => created,
      load: async () => {
        throw new Error("not exercised by this test");
      },
      save: async () => {
        throw new StorageFullError();
      },
      rename: async () => created,
      remove: async (id) => void removed.push(id),
    };
    const file = jsonFile("Gansey.stitchchart.json", emptyChart());

    await expect(importChartIntoStore(store, file)).rejects.toBeInstanceOf(StorageFullError);
    expect(removed).toEqual(["new-chart"]);
  });
});
