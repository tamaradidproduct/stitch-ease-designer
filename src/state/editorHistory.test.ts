import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "./docStore";
import { redoLatest, undoLatest } from "./editorHistory";
import { useUiStore } from "./uiStore";

beforeEach(() => {
  useDocStore.getState().openChart({
    meta: {
      id: "history-test",
      name: "History test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      rev: "r1",
    },
    placements: [],
    unknownSymbolIds: [],
  });
  useUiStore.getState().resetForChart();
});

describe("ordered editor history", () => {
  it("unwinds document and selection actions in their actual reverse order", () => {
    const doc = useDocStore.getState();
    doc.place("knit", 0, 0);
    doc.place("knit", 1, 0);
    const firstId = doc.index.placementAt(0, 0)!.id;
    useUiStore.getState().setSelectedPlacementIds([firstId]);
    useUiStore.getState().clearSelectionWithUndo();
    doc.place("knit", 2, 0);

    undoLatest(); // Last stitch placement.
    expect(doc.index.placementAt(2, 0)).toBeUndefined();
    expect(useUiStore.getState().selectedPlacementIds).toEqual([]);

    undoLatest(); // Selection dismissal.
    expect(useUiStore.getState().selectedPlacementIds).toEqual([firstId]);

    undoLatest(); // Original selection.
    expect(useUiStore.getState().selectedPlacementIds).toEqual([]);

    undoLatest(); // Previous stitch placement.
    expect(doc.index.placementAt(1, 0)).toBeUndefined();
    expect(doc.index.placementAt(0, 0)).toBeDefined();
  });

  it("replays the same mixed history in forward order", () => {
    const doc = useDocStore.getState();
    doc.place("knit", 0, 0);
    const firstId = doc.index.placementAt(0, 0)!.id;
    useUiStore.getState().setSelectedPlacementIds([firstId]);
    useUiStore.getState().clearSelectionWithUndo();
    doc.place("purl", 1, 0);

    undoLatest();
    undoLatest();
    undoLatest();
    undoLatest();

    redoLatest();
    expect(doc.index.placementAt(0, 0)).toBeDefined();
    redoLatest();
    expect(useUiStore.getState().selectedPlacementIds).toEqual([firstId]);
    redoLatest();
    expect(useUiStore.getState().selectedPlacementIds).toEqual([]);
    redoLatest();
    expect(doc.index.placementAt(1, 0)?.symbolId).toBe("purl");
  });
});
