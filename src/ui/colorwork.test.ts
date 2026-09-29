import { describe, expect, it } from "vitest";
import { currentSlotForPicker } from "./colorwork";
import type { Placement } from "../model/types";
import type { PickerTarget } from "../state/uiStore";

const placement = (overrides: Partial<Placement> & { id: string }): Placement => ({
  symbolId: "purl",
  col: 0,
  row: 0,
  ...overrides,
});

const byId = (placements: Placement[]) => (id: string) => placements.find((p) => p.id === id);

const targetFor = (selectionIds: string[]): PickerTarget => ({
  col: 0,
  row: 0,
  x: 0,
  y: 0,
  selectionIds,
});

const placementAtFor = (placements: Placement[]) => (col: number, row: number) =>
  placements.find((p) => p.col === col && p.row === row);

describe("currentSlotForPicker (FR-40)", () => {
  it("returns a slot for a single selected stitch that is the only instance of its combo", () => {
    const placements = [placement({ id: "a" })];
    const slot = currentSlotForPicker(targetFor(["a"]), byId(placements), null, null, placements);
    expect(slot?.symbolId).toBe("purl");
    expect(slot?.placementIds).toEqual(["a"]);
  });

  it("returns a slot for a single selected stitch even when another confirmed placement of the same combo exists outside the selection (#267 relaxes #211/#224 for singletons)", () => {
    const placements = [placement({ id: "a" }), placement({ id: "b", col: 1 })];
    const slot = currentSlotForPicker(targetFor(["a"]), byId(placements), null, null, placements);
    expect(slot?.symbolId).toBe("purl");
    expect(slot?.placementIds).toEqual(["a"]);
  });

  it("returns null for a multi-selection missing another confirmed instance of the combo (#211/#224)", () => {
    const placements = [
      placement({ id: "a" }),
      placement({ id: "b", col: 1 }),
      placement({ id: "c", col: 2 }),
    ];
    const slot = currentSlotForPicker(
      targetFor(["a", "b"]),
      byId(placements),
      null,
      null,
      placements,
    );
    expect(slot).toBeNull();
  });

  it("returns a slot once a multi-selection covers every instance of the combo", () => {
    const placements = [placement({ id: "a" }), placement({ id: "b", col: 1 })];
    const slot = currentSlotForPicker(
      targetFor(["a", "b"]),
      byId(placements),
      null,
      null,
      placements,
    );
    expect(slot?.placementIds).toEqual(["a", "b"]);
  });

  it("ignores a matching but still-pending suggestion when checking for other instances", () => {
    const placements = [
      placement({ id: "a" }),
      placement({ id: "b", col: 1, suggested: true }),
    ];
    const slot = currentSlotForPicker(targetFor(["a"]), byId(placements), null, null, placements);
    expect(slot?.placementIds).toEqual(["a"]);
  });

  it("does not let an unselected instance of a different (symbol, color) combo block the chip", () => {
    const placements = [
      placement({ id: "a" }),
      placement({ id: "b", col: 1, colorId: "red" }),
    ];
    const slot = currentSlotForPicker(targetFor(["a"]), byId(placements), null, null, placements);
    expect(slot?.placementIds).toEqual(["a"]);
  });

  it("still returns null for a mixed-combo selection (FR-33)", () => {
    const placements = [placement({ id: "a" }), placement({ id: "b", col: 1, colorId: "red" })];
    const slot = currentSlotForPicker(
      targetFor(["a", "b"]),
      byId(placements),
      null,
      null,
      placements,
    );
    expect(slot).toBeNull();
  });
});

// #307: the double-click handler and the "/" shortcut both open the picker
// with only `currentSymbolId`/`currentColorId` set - never `selectionIds` -
// so they hit this branch instead of the FR-40 one above.
describe("currentSlotForPicker (currentSymbolId-only branch - #307)", () => {
  it("resolves real placementIds (and colorId) off the live placement at the target cell", () => {
    const placements = [placement({ id: "a", colorId: "red" })];
    const target: PickerTarget = {
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      currentSymbolId: "purl",
      // Deliberately omitted, like the "/" shortcut does - the fix must not
      // depend on it since it resolves color live off the placement instead.
    };
    const slot = currentSlotForPicker(
      target,
      byId(placements),
      null,
      null,
      [],
      placementAtFor(placements),
    );
    expect(slot?.placementIds).toEqual(["a"]);
    expect(slot?.colorId).toBe("red");
  });

  it("falls back to the target's own currentSymbolId/currentColorId with empty placementIds when no live placement is found", () => {
    const target: PickerTarget = {
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      currentSymbolId: "purl",
      currentColorId: "red",
    };
    const slot = currentSlotForPicker(target, byId([]), null, null, [], () => undefined);
    expect(slot?.placementIds).toEqual([]);
    expect(slot?.colorId).toBe("red");
  });

  it("falls back to the target-derived shape when the live placement's symbolId no longer matches (stale/replaced in the background)", () => {
    const placements = [placement({ id: "a", symbolId: "knit", colorId: "red" })];
    const target: PickerTarget = {
      col: 0,
      row: 0,
      x: 0,
      y: 0,
      currentSymbolId: "purl",
      currentColorId: "blue",
    };
    const slot = currentSlotForPicker(
      target,
      byId(placements),
      null,
      null,
      [],
      placementAtFor(placements),
    );
    expect(slot?.symbolId).toBe("purl");
    expect(slot?.colorId).toBe("blue");
    expect(slot?.placementIds).toEqual([]);
  });
});
