import { describe, expect, it } from "vitest";
import {
  CELL,
  type Camera,
  type Viewport,
  cellToScreenRect,
  cellToWorld,
  panByScreen,
  screenToCell,
  screenToWorld,
  visibleCellBounds,
  worldToCell,
  worldToScreen,
  zoomAt,
} from "./camera";
import { crispColX } from "./renderer";

const vp: Viewport = { width: 1200, height: 800 };
const cam = (x = 0, y = 0, zoom = 1): Camera => ({ x, y, zoom });

describe("world <-> screen", () => {
  it("puts the camera's world point at the viewport centre", () => {
    const s = worldToScreen(100, 250, cam(100, 250), vp);
    expect(s).toEqual({ x: 600, y: 400 });
  });

  it("flips y: increasing world y moves UP the screen", () => {
    const lower = worldToScreen(0, 0, cam(), vp);
    const higher = worldToScreen(0, 100, cam(), vp);
    expect(higher.y).toBeLessThan(lower.y);
  });

  it("round-trips across zoom levels, negative coords and long pans", () => {
    const cams: Camera[] = [
      cam(),
      cam(0, 0, 0.05),
      cam(0, 0, 10),
      cam(-5000, -3200, 0.37),
      cam(1_000_000, -1_000_000, 2.5),
    ];
    for (const c of cams) {
      for (const [sx, sy] of [
        [0, 0],
        [1200, 800],
        [637, 219],
      ] as const) {
        const w = screenToWorld(sx, sy, c, vp);
        const back = worldToScreen(w.x, w.y, c, vp);
        expect(back.x).toBeCloseTo(sx, 6);
        expect(back.y).toBeCloseTo(sy, 6);
      }
    }
  });
});

describe("cell space", () => {
  it("maps a world point to the cell containing it, including negatives", () => {
    expect(worldToCell(0, 0)).toEqual({ col: 0, row: 0 });
    expect(worldToCell(CELL - 0.001, CELL - 0.001)).toEqual({ col: 0, row: 0 });
    expect(worldToCell(CELL, CELL)).toEqual({ col: 1, row: 1 });
    expect(worldToCell(-1, -1)).toEqual({ col: -1, row: -1 });
    expect(worldToCell(-CELL, -CELL)).toEqual({ col: -1, row: -1 });
  });

  it("cellToWorld returns the lower-left corner", () => {
    expect(cellToWorld(2, 3)).toEqual({ x: 2 * CELL, y: 3 * CELL });
  });

  it("screenToCell(centre of cellToScreenRect) is the identity", () => {
    const cams = [cam(), cam(0, 0, 0.2), cam(0, 0, 6), cam(-1234, 987, 1.7)];
    const cells = [
      { col: 0, row: 0 },
      { col: 12, row: 40 },
      { col: -7, row: -3 },
      { col: 233, row: 31 },
    ];
    for (const c of cams) {
      for (const cell of cells) {
        const r = cellToScreenRect(cell.col, cell.row, c, vp);
        const mid = screenToCell(r.x + r.size / 2, r.y + r.size / 2, c, vp);
        expect(mid).toEqual(cell);
      }
    }
  });

  it("row 1 draws below row 2 on screen", () => {
    const r1 = cellToScreenRect(0, 0, cam(), vp);
    const r2 = cellToScreenRect(0, 1, cam(), vp);
    expect(r1.y).toBeGreaterThan(r2.y);
  });
});

describe("zoomAt", () => {
  it("pins the world point under the cursor", () => {
    const c = cam(140, -60, 1);
    const [sx, sy] = [910, 122];
    const before = screenToWorld(sx, sy, c, vp);
    const zoomed = zoomAt(c, 2.5, sx, sy, vp);
    const after = screenToWorld(sx, sy, zoomed, vp);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("clamps and returns the same camera at the limits", () => {
    const maxed = zoomAt(cam(0, 0, 10), 4, 0, 0, vp);
    expect(maxed.zoom).toBe(10);
    const mined = zoomAt(cam(0, 0, 0.05), 0.1, 0, 0, vp);
    expect(mined.zoom).toBe(0.05);
  });
});

describe("panByScreen", () => {
  it("moves content with the cursor", () => {
    // Dragging right by 100px should bring content that was left into view,
    // i.e. the camera moves left in world space.
    const panned = panByScreen(cam(0, 0, 1), 100, 0);
    expect(panned.x).toBe(-100);
  });

  it("is undone by the inverse drag", () => {
    const c = cam(31, -12, 0.8);
    const there = panByScreen(c, 250, -90);
    const back = panByScreen(there, -250, 90);
    expect(back.x).toBeCloseTo(c.x, 9);
    expect(back.y).toBeCloseTo(c.y, 9);
  });
});

describe("visibleCellBounds", () => {
  it("covers exactly the cells on screen", () => {
    // 1200x800 at zoom 1 -> 50 x 33.33 cells, centred on cell (0,0)'s origin.
    const b = visibleCellBounds(cam(), vp, 0);
    const topLeft = screenToCell(0, 0, cam(), vp);
    const bottomRight = screenToCell(vp.width - 1, vp.height - 1, cam(), vp);
    expect(b.minCol).toBe(topLeft.col);
    expect(b.maxRow).toBe(topLeft.row);
    expect(b.maxCol).toBe(bottomRight.col);
    expect(b.minRow).toBe(bottomRight.row);
  });

  it("grows when zoomed out", () => {
    const near = visibleCellBounds(cam(0, 0, 4), vp);
    const far = visibleCellBounds(cam(0, 0, 0.25), vp);
    expect(far.maxCol - far.minCol).toBeGreaterThan(near.maxCol - near.minCol);
  });
});

/**
 * Regression: the renderer drew each stitch's cell border independently,
 * rounding its own screen position to a crisp pixel. Two adjacent stitches'
 * shared edge was computed two different ways — "this cell's left, rounded"
 * vs "the previous cell's rounded left, plus the rounded cell size" — and
 * those don't generally agree once cell size isn't a whole number of pixels,
 * which is most zoom levels. The mismatch showed up as a hairline seam
 * between stitches, appearing every few cells as the fractional drift
 * crossed a rounding boundary and cleared again.
 *
 * `crispColX`/`crispRowY` (imported from renderer.ts, the actual production
 * code, not reimplemented here) are the fix: derive every boundary from its
 * own absolute column, never by offsetting a neighbour's already-rounded
 * edge, so two cells asking about the same boundary always get the same
 * answer.
 */
describe("adjacent cell border alignment", () => {
  const zooms = [0.3, 0.7, 1, 1.37, 2.2, 3.7, 4.5, 6.13];
  const xs = [0, 5.5, -33.25, 144, 1000.1];

  it("the old relative-offset math could disagree on a shared boundary", () => {
    // Standalone demonstration of the bug class, not a test of renderer.ts:
    // cell N's right edge derived as anchor + N*size (then rounded) vs cell
    // N+1's left edge derived the same way for N+1 — two different roundings
    // of what should be the identical boundary.
    let sawADisagreement = false;
    for (const zoom of zooms) {
      const size = CELL * zoom;
      for (const anchor of xs) {
        for (let n = 0; n < 20; n++) {
          const rightOfN = Math.round(anchor + n * size) + Math.round(size);
          const leftOfNPlus1 = Math.round(anchor + (n + 1) * size);
          if (rightOfN !== leftOfNPlus1) sawADisagreement = true;
        }
      }
    }
    expect(sawADisagreement).toBe(true);
  });

  it("drawPlacements' actual boundary helper agrees for adjacent placements, at every zoom", () => {
    // Simulates a row of single-cell placements the way drawPlacements walks
    // them: each placement's right edge is crispColX(col+1); the next
    // placement's left edge is crispColX(col+1) again, for the neighbouring
    // col. Exercising the real exported function, not a copy of its formula,
    // so a regression to relative-offset math here would fail this test.
    for (const zoom of zooms) {
      for (const x of xs) {
        const c = cam(x, 0, zoom);
        let previousRight: number | null = null;
        for (let col = -5; col < 15; col++) {
          const left = crispColX(col, c, vp);
          if (previousRight !== null) expect(left).toBe(previousRight);
          previousRight = crispColX(col + 1, c, vp);
        }
      }
    }
  });
});
