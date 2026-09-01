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
