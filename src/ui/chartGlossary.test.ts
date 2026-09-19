import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Placement } from "../model/types";
import {
  collectGlossarySymbols,
  countConfirmedStitches,
  getGlossaryRevision,
  loadGlossaryIds,
  saveGlossaryIds,
  symbolsWithAnyPlacement,
} from "./chartGlossary";

const stitch = (id: string, symbolId: string, suggested?: boolean): Placement => ({
  id,
  symbolId,
  col: 0,
  row: 0,
  ...(suggested ? { suggested: true } : {}),
});

function mockStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
    clear: () => {
      entries.clear();
    },
    key: (index) => [...entries.keys()][index] ?? null,
    get length() {
      return entries.size;
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", mockStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collectGlossarySymbols", () => {
  it("keeps explicit glossary order and appends placed stitch types once", () => {
    expect(collectGlossarySymbols(
      ["purl", "knit"],
      ["knit", "yarn_over", "purl", "yarn_over"],
    ).map((symbol) => symbol.id)).toEqual(["purl", "knit", "yarn_over"]);
  });

  it("ignores unknown legacy symbol ids", () => {
    expect(collectGlossarySymbols(["missing", "knit"], []).map((symbol) => symbol.id))
      .toEqual(["knit"]);
  });
});

describe("countConfirmedStitches", () => {
  it("excludes still-pending suggestions from the count (FR-13)", () => {
    const counts = countConfirmedStitches([
      stitch("a", "knit"),
      stitch("b", "knit", true),
      stitch("c", "purl"),
    ]);
    expect(counts.get("knit")).toBe(1);
    expect(counts.get("purl")).toBe(1);
  });

  it("confirming a suggestion visibly increments its symbol's count", () => {
    const before = countConfirmedStitches([stitch("a", "knit", true)]);
    const after = countConfirmedStitches([stitch("a", "knit")]);
    expect(before.get("knit") ?? 0).toBe(0);
    expect(after.get("knit")).toBe(1);
  });
});

describe("saveGlossaryIds", () => {
  it("persists the glossary and bumps only that chart's revision", () => {
    const chartId = "chart-saveGlossaryIds-primary";
    const otherChartId = "chart-saveGlossaryIds-secondary";

    expect(getGlossaryRevision(chartId)).toBe(0);
    expect(getGlossaryRevision(otherChartId)).toBe(0);

    saveGlossaryIds(chartId, ["yo", "knit"]);

    expect(loadGlossaryIds(chartId)).toEqual(["yo", "knit"]);
    expect(localStorage.getItem(`stitch-ease:glossary:${chartId}`)).toBe(JSON.stringify(["yo", "knit"]));
    expect(getGlossaryRevision(chartId)).toBe(1);
    expect(getGlossaryRevision(otherChartId)).toBe(0);
  });

  it("keeps the glossary available for this session if storage is unavailable", () => {
    const chartId = "chart-saveGlossaryIds-storage-error";
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    saveGlossaryIds(chartId, ["ssk"]);

    expect(loadGlossaryIds(chartId)).toEqual(["ssk"]);
    expect(getGlossaryRevision(chartId)).toBe(1);
  });
});

describe("symbolsWithAnyPlacement", () => {
  it("includes a symbol with only a still-pending suggestion (FR-14)", () => {
    const symbols = symbolsWithAnyPlacement([stitch("a", "knit", true)]);
    expect(symbols.has("knit")).toBe(true);
  });

  it("would not let a symbol with only a pending suggestion look removable (Gotcha G-9)", () => {
    const placements = [stitch("a", "knit", true)];
    // The FR-13 display count is 0 (nothing confirmed yet)...
    expect(countConfirmedStitches(placements).get("knit") ?? 0).toBe(0);
    // ...but removal-safety must use the separate any-placement check, not that count.
    expect(symbolsWithAnyPlacement(placements).has("knit")).toBe(true);
  });
});
