import { beforeEach, describe, expect, it } from "vitest";
import type { Placement } from "../model/types";
import { useDocStore } from "../state/docStore";
import {
  collectColoredGlossaryEntries,
  collectGlossarySymbols,
  countConfirmedColoredStitches,
  countConfirmedStitches,
  saveGlossaryIds,
  symbolsWithAnyPlacement,
} from "./chartGlossary";

const stitch = (id: string, symbolId: string, opts?: { suggested?: boolean; colorId?: string }): Placement => ({
  id,
  symbolId,
  col: 0,
  row: 0,
  ...(opts?.suggested ? { suggested: true } : {}),
  ...(opts?.colorId ? { colorId: opts.colorId } : {}),
});

beforeEach(() => {
  useDocStore.setState({ glossaryIds: [], quickSymbolIds: [] });
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

describe("collectColoredGlossaryEntries", () => {
  it("gives a colored placement its own entry, separate from the plain symbol", () => {
    const entries = collectColoredGlossaryEntries(
      ["knit"],
      [stitch("a", "knit", { colorId: "#e11d48" })],
    );
    expect(entries.map((e) => e.key)).toEqual(["knit", "knit::#e11d48"]);
  });

  it("deduplicates by (symbol, color) identity", () => {
    const entries = collectColoredGlossaryEntries(
      ["knit::#e11d48"],
      [stitch("a", "knit", { colorId: "#e11d48" }), stitch("b", "knit", { colorId: "#e11d48" })],
    );
    expect(entries).toHaveLength(1);
  });
});

describe("countConfirmedStitches", () => {
  it("excludes still-pending suggestions from the count (FR-13)", () => {
    const counts = countConfirmedStitches([
      stitch("a", "knit"),
      stitch("b", "knit", { suggested: true }),
      stitch("c", "purl"),
    ]);
    expect(counts.get("knit")).toBe(1);
    expect(counts.get("purl")).toBe(1);
  });

  it("confirming a suggestion visibly increments its symbol's count", () => {
    const before = countConfirmedStitches([stitch("a", "knit", { suggested: true })]);
    const after = countConfirmedStitches([stitch("a", "knit")]);
    expect(before.get("knit") ?? 0).toBe(0);
    expect(after.get("knit")).toBe(1);
  });

  // DNT-13: a plain symbol's count must exclude colored placements of that
  // symbol - a colored combo is a separate inventory line with its own count.
  it("excludes colored placements of the same symbol", () => {
    const counts = countConfirmedStitches([
      stitch("a", "purl"),
      stitch("b", "purl", { colorId: "#e11d48" }),
      stitch("c", "purl", { colorId: "#e11d48" }),
    ]);
    expect(counts.get("purl")).toBe(1);
  });
});

describe("countConfirmedColoredStitches", () => {
  it("counts per (symbol, color) combo, excluding uncolored placements", () => {
    const counts = countConfirmedColoredStitches([
      stitch("a", "purl"),
      stitch("b", "purl", { colorId: "#e11d48" }),
      stitch("c", "purl", { colorId: "#e11d48" }),
      stitch("d", "purl", { colorId: "#0ea5e9" }),
    ]);
    expect(counts.get("purl::#e11d48")).toBe(2);
    expect(counts.get("purl::#0ea5e9")).toBe(1);
  });
});

describe("saveGlossaryIds", () => {
  it("writes through to the open chart's docStore state", () => {
    saveGlossaryIds("any-chart-id", ["yo", "knit"]);
    expect(useDocStore.getState().glossaryIds).toEqual(["yo", "knit"]);
  });
});

describe("symbolsWithAnyPlacement", () => {
  it("includes a symbol with only a still-pending suggestion (FR-14)", () => {
    const symbols = symbolsWithAnyPlacement([stitch("a", "knit", { suggested: true })]);
    expect(symbols.has("knit")).toBe(true);
  });

  it("would not let a symbol with only a pending suggestion look removable (Gotcha G-9)", () => {
    const placements = [stitch("a", "knit", { suggested: true })];
    // The FR-13 display count is 0 (nothing confirmed yet)...
    expect(countConfirmedStitches(placements).get("knit") ?? 0).toBe(0);
    // ...but removal-safety must use the separate any-placement check, not that count.
    expect(symbolsWithAnyPlacement(placements).has("knit")).toBe(true);
  });

  it("keys a colored combo separately from its plain symbol", () => {
    const keys = symbolsWithAnyPlacement([stitch("a", "purl", { colorId: "#e11d48" })]);
    expect(keys.has("purl")).toBe(true);
    expect(keys.has("purl::#e11d48")).toBe(true);
  });
});
