import { describe, expect, it } from "vitest";
import { ADD_CURSOR, INSERT_ADD_CURSOR, armedStitchCursor, insertStitchCursor } from "./cursors";

describe("armed stitch cursors", () => {
  it("renders the armed symbol rather than a shared generic thumbnail", () => {
    expect(armedStitchCursor("purl")).not.toBe(armedStitchCursor("ktbl"));
    expect(insertStitchCursor("purl")).not.toBe(insertStitchCursor("ktbl"));
  });

  it("preserves the width of multi-cell symbols in the preview", () => {
    expect(armedStitchCursor("1_1_left_cable")).not.toBe(armedStitchCursor("purl"));
  });

  it("falls back safely when an armed symbol is unavailable", () => {
    expect(armedStitchCursor("missing-symbol")).toBe(ADD_CURSOR);
    expect(insertStitchCursor("missing-symbol")).toBe(INSERT_ADD_CURSOR);
  });
});
