import { beforeEach, describe, expect, it } from "vitest";
import type { DocMeta, ReferenceImage } from "../model/types";
import type { LoadedChart } from "../storage/ChartStore";
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

  it("defaults patternInfo to an empty object when the loaded chart never set it", () => {
    useDocStore.getState().openChart(chart("a"));
    expect(useDocStore.getState().patternInfo).toEqual({});
  });

  it("carries a loaded chart's patternInfo into the store", () => {
    useDocStore.getState().openChart({
      ...chart("a"),
      patternInfo: { worked: "round", firstStitch: "tr" },
    });
    expect(useDocStore.getState().patternInfo).toEqual({ worked: "round", firstStitch: "tr" });
  });
});

describe("pattern info", () => {
  beforeEach(() => {
    useDocStore.getState().openChart(chart("a"));
  });

  it("setPatternInfo merges into the existing patternInfo, bumping revision", () => {
    const before = useDocStore.getState().revision;
    useDocStore.getState().setPatternInfo({ worked: "flat" });
    useDocStore.getState().setPatternInfo({ firstRow: "RS" });
    expect(useDocStore.getState().patternInfo).toEqual({ worked: "flat", firstRow: "RS" });
    expect(useDocStore.getState().revision).toBeGreaterThan(before);
  });

  it("setColorName adds a name for a color", () => {
    useDocStore.getState().setColorName("#d3f3d0", "MC");
    expect(useDocStore.getState().patternInfo.colorNames).toEqual({ "#d3f3d0": "MC" });
  });

  it("setColorName trims whitespace", () => {
    useDocStore.getState().setColorName("#d3f3d0", "  MC  ");
    expect(useDocStore.getState().patternInfo.colorNames).toEqual({ "#d3f3d0": "MC" });
  });

  it("setColorName with a blank name removes that color's entry", () => {
    useDocStore.getState().setColorName("#d3f3d0", "MC");
    useDocStore.getState().setColorName("#e11d48", "CC");
    useDocStore.getState().setColorName("#d3f3d0", "   ");
    expect(useDocStore.getState().patternInfo.colorNames).toEqual({ "#e11d48": "CC" });
  });

  it("is not undoable - see the field's own doc comment", () => {
    useDocStore.getState().setPatternInfo({ worked: "flat" });
    expect(useDocStore.getState().undoStack).toHaveLength(0);
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

  it("clears suggested/confidence flags on replace, resolving the review", () => {
    useDocStore.getState().openChart({
      meta: meta("selection"),
      placements: [{ id: "a", symbolId: "knit", col: 0, row: 0, suggested: true, confidence: 0.4 }],
      unknownSymbolIds: [],
    });
    useDocStore.getState().replacePlacements(["a"], "purl");
    const placement = useDocStore.getState().index.toArray()[0]!;
    expect(placement.symbolId).toBe("purl");
    expect(placement.suggested).toBeUndefined();
    expect(placement.confidence).toBeUndefined();
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

  it("duplicates beside a selection and shifts earlier stitches to make room", () => {
    const ids = useDocStore.getState().duplicatePlacementsInRow(["b"]);
    const duplicate = useDocStore.getState().index.placements.get(ids[0]!)!;

    expect(duplicate).toMatchObject({ symbolId: "purl", col: 0, row: 0 });
    expect(useDocStore.getState().index.placements.get("a")).toMatchObject({ col: -1 });
    expect(useDocStore.getState().index.placements.get("b")).toMatchObject({ col: 1 });
    expect(useDocStore.getState().undoStack).toHaveLength(1);

    useDocStore.getState().undo();
    expect(useDocStore.getState().index.placements.get("a")).toMatchObject({ col: 0 });
    expect(useDocStore.getState().index.placements.get("b")).toMatchObject({ col: 1 });
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

describe("reference images", () => {
  const image: ReferenceImage = {
    id: "image-1",
    number: 1,
    ref: "data:image/png;base64,abc",
    x: 0,
    y: 0,
    width: 100,
    height: 75,
    naturalWidth: 400,
    naturalHeight: 300,
    opacity: 0.5,
    visible: true,
    locked: false,
  };

  beforeEach(() => {
    useDocStore.getState().openChart({ meta: meta("ref"), placements: [], unknownSymbolIds: [] });
  });

  it("adds, patches, and removes one, bumping revision each time so autosave notices", () => {
    const r0 = useDocStore.getState().revision;

    useDocStore.getState().addReferenceImage(image);
    expect(useDocStore.getState().referenceImages).toEqual([image]);
    expect(useDocStore.getState().revision).toBeGreaterThan(r0);

    const r1 = useDocStore.getState().revision;
    useDocStore.getState().updateReferenceImage(image.id, { opacity: 0.8, locked: true });
    expect(useDocStore.getState().referenceImages[0]).toMatchObject({ opacity: 0.8, locked: true });
    expect(useDocStore.getState().revision).toBeGreaterThan(r1);

    const r2 = useDocStore.getState().revision;
    useDocStore.getState().removeReferenceImage(image.id);
    expect(useDocStore.getState().referenceImages).toEqual([]);
    expect(useDocStore.getState().revision).toBeGreaterThan(r2);
  });

  it("holds several images independently", () => {
    const second: ReferenceImage = { ...image, id: "image-2", ref: "data:image/png;base64,def" };
    useDocStore.getState().addReferenceImage(image);
    useDocStore.getState().addReferenceImage(second);
    expect(useDocStore.getState().referenceImages.map((img) => img.id)).toEqual(["image-1", "image-2"]);

    useDocStore.getState().updateReferenceImage("image-2", { opacity: 0.9 });
    expect(useDocStore.getState().referenceImages[0]).toMatchObject({ id: "image-1", opacity: 0.5 });
    expect(useDocStore.getState().referenceImages[1]).toMatchObject({ id: "image-2", opacity: 0.9 });

    useDocStore.getState().removeReferenceImage("image-1");
    expect(useDocStore.getState().referenceImages.map((img) => img.id)).toEqual(["image-2"]);
  });

  it("undoes and redoes adding one", () => {
    useDocStore.getState().addReferenceImage(image);
    expect(useDocStore.getState().referenceImages).toEqual([image]);

    useDocStore.getState().undo();
    expect(useDocStore.getState().referenceImages).toEqual([]);

    useDocStore.getState().redo();
    expect(useDocStore.getState().referenceImages).toEqual([image]);
  });

  it("undoes removing one back into its original position, not just back into existence", () => {
    const second: ReferenceImage = { ...image, id: "image-2", ref: "data:image/png;base64,def" };
    const third: ReferenceImage = { ...image, id: "image-3", ref: "data:image/png;base64,ghi" };
    useDocStore.getState().addReferenceImage(image);
    useDocStore.getState().addReferenceImage(second);
    useDocStore.getState().addReferenceImage(third);

    useDocStore.getState().removeReferenceImage("image-2");
    expect(useDocStore.getState().referenceImages.map((img) => img.id)).toEqual(["image-1", "image-3"]);

    useDocStore.getState().undo();
    expect(useDocStore.getState().referenceImages.map((img) => img.id)).toEqual(["image-1", "image-2", "image-3"]);

    useDocStore.getState().redo();
    expect(useDocStore.getState().referenceImages.map((img) => img.id)).toEqual(["image-1", "image-3"]);
  });

  it("undoes and redoes reference-point patches, scoped to that image's id", () => {
    useDocStore.getState().addReferenceImage({
      ...image,
      calibrationMarks: [{ id: "point-1", u: 0.1, v: 0.2, w: 0.05, h: 0.05, row: null, stitch: null }],
    });

    useDocStore.getState().updateReferenceImage(image.id, {
      calibrationMarks: [{ id: "point-1", u: 0.1, v: 0.2, w: 0.05, h: 0.05, row: 12, stitch: 8 }],
    });
    expect(useDocStore.getState().referenceImages[0]?.calibrationMarks?.[0]).toMatchObject({ row: 12, stitch: 8 });

    useDocStore.getState().undo();
    expect(useDocStore.getState().referenceImages[0]?.calibrationMarks?.[0]).toMatchObject({ row: null, stitch: null });

    useDocStore.getState().redo();
    expect(useDocStore.getState().referenceImages[0]?.calibrationMarks?.[0]).toMatchObject({ row: 12, stitch: 8 });
  });

  it("banks a continuous reference-image edit as one undo step", () => {
    useDocStore.getState().addReferenceImage(image);
    const afterAdd = useDocStore.getState().undoStack.length;

    useDocStore.getState().beginReferenceImageEdit(image.id);
    useDocStore.getState().updateReferenceImage(image.id, { width: 101 });
    useDocStore.getState().updateReferenceImage(image.id, { width: 104 });
    useDocStore.getState().updateReferenceImage(image.id, { width: 108 });
    useDocStore.getState().endReferenceImageEdit();

    expect(useDocStore.getState().referenceImages[0]?.width).toBe(108);
    // The drag/resize itself only ever banks one more entry, on top of
    // whatever the add already banked - not one per intermediate update.
    expect(useDocStore.getState().undoStack).toHaveLength(afterAdd + 1);

    useDocStore.getState().undo();
    expect(useDocStore.getState().referenceImages[0]?.width).toBe(100);
  });

  it("updateReferenceImage for an id that isn't present is a harmless no-op", () => {
    const r0 = useDocStore.getState().revision;
    useDocStore.getState().updateReferenceImage("missing", { opacity: 0.2 });
    expect(useDocStore.getState().referenceImages).toEqual([]);
    expect(useDocStore.getState().revision).toBe(r0);
  });
});
