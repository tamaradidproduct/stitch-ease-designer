import { beforeEach, describe, expect, it } from "vitest";
import type { DocMeta } from "../model/types";
import type { LoadedChart } from "../storage/DocStore";
import { isChartOpen, useDocStore } from "./docStore";

const meta = (id: string, rev = "r1"): DocMeta => ({
  id,
  name: id,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  rev,
});

const chart = (id: string): LoadedChart => ({
  meta: meta(id),
  placements: [{ id: "p1", symbolId: "knit", col: 0, row: 0 }],
  unknownSymbolIds: [],
});

describe("isChartOpen", () => {
  beforeEach(() => {
    useDocStore.setState({ meta: null });
  });

  it("is false when no chart is open", () => {
    expect(isChartOpen("a")).toBe(false);
  });

  it("is true for the chart openChart just opened", () => {
    useDocStore.getState().openChart(chart("a"));
    expect(isChartOpen("a")).toBe(true);
    expect(isChartOpen("b")).toBe(false);
  });

  it("flips to the new chart once a different one is opened", () => {
    // This is the exact guard an async write (rename, save) has to check
    // before applying its result: switching charts mid-write must not let a
    // stale write for the old chart land on the new one's state.
    useDocStore.getState().openChart(chart("a"));
    useDocStore.getState().openChart(chart("b"));

    expect(isChartOpen("a")).toBe(false);
    expect(isChartOpen("b")).toBe(true);
  });
});

describe("openChart", () => {
  beforeEach(() => {
    useDocStore.setState({ meta: null });
  });

  it("resets undo/redo, so undo after switching charts can't resurrect the previous chart's stitches", () => {
    useDocStore.getState().openChart(chart("a"));
    useDocStore.getState().place("purl", 5, 5);
    expect(useDocStore.getState().undoStack).toHaveLength(1);

    useDocStore.getState().openChart(chart("b"));

    expect(useDocStore.getState().undoStack).toHaveLength(0);
    expect(useDocStore.getState().redoStack).toHaveLength(0);
  });

  it("marks the freshly opened chart as saved, not dirty", () => {
    useDocStore.getState().openChart(chart("a"));
    const { revision, savedRevision } = useDocStore.getState();
    expect(revision).toBe(savedRevision);
  });
});
