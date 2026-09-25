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

describe("currentSlotForPicker (FR-40)", () => {
  it("returns a slot for a single selected stitch that is the only instance of its combo", () => {
    const placements = [placement({ id: "a" })];
    const slot = currentSlotForPicker(targetFor(["a"]), byId(placements), null, null, placements);
    expect(slot?.symbolId).toBe("purl");
    expect(slot?.placementIds).toEqual(["a"]);
  });

  it("returns null when another confirmed placement of the same combo exists outside the selection (#211/#224)", () => {
    const placements = [placement({ id: "a" }), placement({ id: "b", col: 1 })];
    const slot = currentSlotForPicker(targetFor(["a"]), byId(placements), null, null, placements);
    expect(slot).toBeNull();
  });

  it("returns a slot once the selection covers every instance of the combo", () => {
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
