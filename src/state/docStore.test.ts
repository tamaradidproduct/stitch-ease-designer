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

describe("selection edits", () => {
  beforeEach(() => {
    useDocStore.getState().openChart({
      meta: meta("selection"),
      placements: [
        { id: "a", symbolId: "knit", col: 0, row: 0 },
        { id: "b", symbolId: "purl", col: 1, row: 0 },
      ],
      unknownSymbolIds: [],
    });
  });

  it("replaces several same-span placements as one undoable edit", () => {
    useDocStore.getState().replacePlacements(["a", "b"], "yarn_over");
    expect(useDocStore.getState().index.toArray().map((p) => p.symbolId)).toEqual([
      "yarn_over",
      "yarn_over",
    ]);
    expect(useDocStore.getState().undoStack).toHaveLength(1);

    useDocStore.getState().undo();
    expect(useDocStore.getState().index.toArray().map((p) => p.symbolId).sort()).toEqual([
      "knit",
      "purl",
    ]);
  });

  it("deletes several placements as one undoable edit", () => {
    useDocStore.getState().erasePlacements(["a", "b"]);
    expect(useDocStore.getState().index.size).toBe(0);
    expect(useDocStore.getState().undoStack).toHaveLength(1);

    useDocStore.getState().undo();
    expect(useDocStore.getState().index.size).toBe(2);
  });

  it("refuses a bulk replacement with a different span", () => {
    useDocStore.getState().replacePlacements(["a", "b"], "3_3_left_cable");
    expect(useDocStore.getState().index.toArray().map((p) => p.symbolId).sort()).toEqual([
      "knit",
      "purl",
    ]);
    expect(useDocStore.getState().undoStack).toHaveLength(0);
  });
});
