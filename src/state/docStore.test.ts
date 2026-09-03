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

  it("moves a selection as one undoable edit while preserving its ids", () => {
    useDocStore.getState().movePlacements(["a", "b"], 4, 3);
    expect(useDocStore.getState().index.placements.get("a")).toMatchObject({ col: 4, row: 3 });
    expect(useDocStore.getState().index.placements.get("b")).toMatchObject({ col: 5, row: 3 });
    expect(useDocStore.getState().undoStack).toHaveLength(1);

    useDocStore.getState().undo();
    expect(useDocStore.getState().index.placements.get("a")).toMatchObject({ col: 0, row: 0 });
    expect(useDocStore.getState().index.placements.get("b")).toMatchObject({ col: 1, row: 0 });
  });

  it("does not move a selection through an unselected stitch", () => {
    useDocStore.getState().place("knit", 4, 0);
    const blocker = useDocStore.getState().index.placementAt(4, 0)!;
    const historyBeforeMove = useDocStore.getState().undoStack.length;

    useDocStore.getState().movePlacements(["a", "b"], 3, 0);

    expect(useDocStore.getState().index.placements.get("a")).toMatchObject({ col: 0, row: 0 });
    expect(useDocStore.getState().index.placements.get("b")).toMatchObject({ col: 1, row: 0 });
    expect(useDocStore.getState().index.placements.get(blocker.id)).toMatchObject({ col: 4, row: 0 });
    expect(useDocStore.getState().undoStack).toHaveLength(historyBeforeMove);
  });

  it("creates a chart-local repeat and groups its source stitches", () => {
    useDocStore.getState().createRepeat(["a", "b"]);
    const state = useDocStore.getState();
    expect(state.repeats).toHaveLength(1);
    expect(state.repeats[0]).toMatchObject({ name: "Repeat 1", width: 2, height: 1 });
    expect(state.repeats[0]!.stitches).toEqual([
      { symbolId: "knit", col: 0, row: 0 },
      { symbolId: "purl", col: 1, row: 0 },
    ]);
    expect(state.index.placements.get("a")!.groupId).toBe(
      state.index.placements.get("b")!.groupId,
    );
  });

  it("places and duplicates independent grouped repeat instances", () => {
    useDocStore.getState().createRepeat(["a", "b"]);
    const repeat = useDocStore.getState().repeats[0]!;
    useDocStore.getState().instantiateRepeat(repeat.id, 10, 4);
    const placed = useDocStore
      .getState()
      .index.toArray()
      .filter((placement) => placement.col >= 10);
    expect(placed).toHaveLength(2);
    expect(new Set(placed.map((placement) => placement.groupId)).size).toBe(1);

    const duplicateIds = useDocStore.getState().duplicatePlacements(placed.map((p) => p.id));
    expect(duplicateIds).toHaveLength(2);
    const duplicates = duplicateIds.map((id) => useDocStore.getState().index.placements.get(id)!);
    expect(new Set(duplicates.map((placement) => placement.groupId)).size).toBe(1);
    expect(duplicates[0]!.groupId).not.toBe(placed[0]!.groupId);
  });

  it("keeps a replaced stitch's group instead of silently dropping it", () => {
    useDocStore.getState().createRepeat(["a", "b"]);
    const groupId = useDocStore.getState().index.placements.get("a")!.groupId;

    useDocStore.getState().replacePlacements(["a"], "yarn_over");

    const replaced = useDocStore
      .getState()
      .index.toArray()
      .find((p) => p.symbolId === "yarn_over")!;
    expect(replaced.groupId).toBe(groupId);
  });

  it("instantiateRepeat reports failure on a collision instead of silently no-op-ing", () => {
    useDocStore.getState().createRepeat(["a", "b"]);
    const repeat = useDocStore.getState().repeats[0]!;
    const before = useDocStore.getState().index.size;

    // (0, 0) is still occupied by the source stitches of the repeat itself.
    const placed = useDocStore.getState().instantiateRepeat(repeat.id, 0, 0);

    expect(placed).toBe(false);
    expect(useDocStore.getState().index.size).toBe(before);
  });

  it("undoing a created repeat removes the repeat definition too, not just the grouping", () => {
    useDocStore.getState().createRepeat(["a", "b"]);
    expect(useDocStore.getState().repeats).toHaveLength(1);

    useDocStore.getState().undo();

    expect(useDocStore.getState().repeats).toHaveLength(0);
    expect(useDocStore.getState().index.placements.get("a")!.groupId).toBeUndefined();

    useDocStore.getState().redo();
    expect(useDocStore.getState().repeats).toHaveLength(1);
    expect(useDocStore.getState().index.placements.get("a")!.groupId).toBeDefined();
  });

  it("duplicating a mix of grouped and ungrouped stitches preserves that structure", () => {
    // "a"+"b" are an independent group (a repeat's source); "c" is
    // ungrouped. Duplicating all three shouldn't merge "c" into the group,
    // nor should it merge with "a"/"b"'s own new group.
    useDocStore.getState().createRepeat(["a", "b"]);
    useDocStore.getState().place("knit", 5, 5);
    const c = useDocStore.getState().index.placementAt(5, 5)!;

    const duplicateIds = useDocStore.getState().duplicatePlacements(["a", "b", c.id]);
    const duplicates = duplicateIds.map((id) => useDocStore.getState().index.placements.get(id)!);
    const [dupA, dupB, dupC] = duplicates;

    expect(dupA!.groupId).toBeDefined();
    expect(dupA!.groupId).toBe(dupB!.groupId);
    expect(dupC!.groupId).toBeUndefined();
  });
});
