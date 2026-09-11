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

  it("clears the selection redo stack when a new document edit is committed", () => {
    const doc = useDocStore.getState();
    const ui = useUiStore.getState();
    ui.setSelectedPlacementIds(["a"]);
    ui.clearSelectionWithUndo();
    undoLatest(); // Selection dismissal undone: selectionRedoStack now has an entry.
    expect(useUiStore.getState().selectionRedoStack).toHaveLength(1);

    doc.place("knit", 0, 0);

    // A new doc edit truncates the whole timeline's future, not just its own
    // stack - otherwise redoLatest() could still replay the stale selection
    // dismissal from before this edit.
    expect(useUiStore.getState().selectionRedoStack).toHaveLength(0);
  });

  it("clears the document redo stack when a new selection action is recorded", () => {
    const doc = useDocStore.getState();
    doc.place("knit", 0, 0);
    doc.place("knit", 1, 0);
    undoLatest(); // Last placement undone: doc.redoStack now has an entry.
    expect(useDocStore.getState().redoStack).toHaveLength(1);

    useUiStore.getState().setSelectedPlacementIds(["a"]);

    // Same reasoning in the other direction: a new selection action must
    // not leave a stale doc redoStack a later redo could still jump into.
    expect(useDocStore.getState().redoStack).toHaveLength(0);
  });
});
