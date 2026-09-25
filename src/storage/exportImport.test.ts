import { describe, expect, it } from "vitest";
import type { DocMeta, Placement } from "../model/types";
import { DEFAULT_CHART_NAME, StorageFullError, type ChartStore } from "./ChartStore";
import { fillNoStitchCells, importChart, importChartIntoStore } from "./exportImport";
import { createMemoryChartStore } from "./keyValueChartStore";
import { emptyChart, encode } from "./serialize";

const jsonFile = (name: string, body: unknown) =>
  new File([JSON.stringify(body)], name, { type: "application/json" });

const place = (symbolId: string, col: number, row: number, id = `p_${col}_${row}`) =>
  ({ id, symbolId, col, row }) as Placement;

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

  it("carries worked/firstRow/firstStitch/colorNames through", async () => {
    const file = jsonFile("Gansey.stitchchart.json", {
      ...emptyChart(),
      worked: "round",
      firstRow: "WS",
      firstStitch: "tr",
      colorNames: { "#d3f3d0": "MC" },
    });
    expect((await importChart(file)).patternInfo).toEqual({
      worked: "round",
      firstRow: "WS",
      firstStitch: "tr",
      colorNames: { "#d3f3d0": "MC" },
    });
  });
});

describe("importChartIntoStore", () => {
  it("creates the chart and writes its content", async () => {
    const store = createMemoryChartStore();
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
    const store: ChartStore = {
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

describe("fillNoStitchCells", () => {
  it("fills every gap in the confirmed-placement rectangle, per the spec example", () => {
    const placements = [place("knit", 0, 0), place("knit", 2, 1)];
    const stored = fillNoStitchCells(encode(placements), placements);

    expect(stored.palette).toEqual(["knit", "no_stitch"]);
    expect(stored.stitches).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [2, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
      [2, 1, 0],
    ]);
  });

  it("adds no_stitch as the last palette entry, only when at least one cell needs it", () => {
    const placements = [place("knit", 0, 0), place("purl", 1, 0)];
    const stored = fillNoStitchCells(encode(placements), placements);
    expect(stored).toEqual(encode(placements));
    expect(stored.palette).not.toContain("no_stitch");
  });

  it("every (x, y) in the rectangle appears exactly once", () => {
    const placements = [place("knit", -1, -1), place("knit", 3, 2), place("purl", 0, 0)];
    const stored = fillNoStitchCells(encode(placements), placements);
    const seen = new Set<string>();
    for (const [col, row] of stored.stitches) {
      const key = `${col},${row}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(stored.stitches).toHaveLength((3 - -1 + 1) * (2 - -1 + 1));
  });

  it("respects a multi-cell symbol's span - its cells aren't backfilled", () => {
    const cable = "3_3_left_cable"; // 6 cells wide
    const placements = [place(cable, 0, 0)];
    const stored = fillNoStitchCells(encode(placements), placements);
    // The cable's own 6 cells are the whole rectangle; nothing left to fill.
    expect(stored.palette).not.toContain("no_stitch");
  });

  it("never adds a colors entry for a no-stitch cell", () => {
    const RED = "#e11d48";
    const placements = [{ ...place("knit", 0, 0), colorId: RED }, place("knit", 2, 0)];
    const stored = fillNoStitchCells(encode(placements), placements);
    const noStitchIndex = stored.palette.indexOf("no_stitch");
    expect(noStitchIndex).toBeGreaterThan(-1);
    for (const [col, row, colorIndex] of stored.colors ?? []) {
      const stitch = stored.stitches.find(([c, r]) => c === col && r === row);
      expect(stitch?.[2]).not.toBe(noStitchIndex);
      void colorIndex;
    }
  });

  it("a suggested (unconfirmed) placement is excluded from both stitches and the rectangle - see exportChart", () => {
    // Mirrors exportChart's own filtering: only confirmed placements are
    // passed to encode/fillNoStitchCells in the first place.
    const allPlacements = [place("knit", 0, 0), { ...place("knit", 5, 5), suggested: true }];
    const confirmed = allPlacements.filter((p) => !p.suggested);
    const stored = fillNoStitchCells(encode(confirmed), confirmed);

    expect(stored.suggested).toBeUndefined();
    expect(stored.stitches.some(([col, row]) => col === 5 && row === 5)).toBe(false);
    // The rectangle is just the single confirmed stitch - no gaps to fill.
    expect(stored.palette).not.toContain("no_stitch");
  });

  it("round-trips a filled export back into the original placements instead of inventing no_stitch stitches", async () => {
    const confirmed = [place("knit", 0, 0), place("purl", 2, 1)];
    const stored = fillNoStitchCells(encode(confirmed), confirmed);
    const file = jsonFile("filled.stitchchart.json", { ...stored, name: "Filled", exportedAt: new Date().toISOString() });

    const imported = await importChart(file);
    expect(
      imported.placements.map(({ symbolId, col, row, suggested, colorId }) => ({
        symbolId,
        col,
        row,
        suggested,
        colorId,
      })),
    ).toEqual(
      confirmed.map(({ symbolId, col, row, suggested, colorId }) => ({
        symbolId,
        col,
        row,
        suggested,
        colorId,
      })),
    );
    expect(imported.unknownSymbolIds).not.toContain("no_stitch");
  });
});
