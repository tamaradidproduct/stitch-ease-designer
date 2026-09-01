/**
 * Coordinate systems.
 *
 * There are three, and every conversion between them lives in this file.
 *
 *   Cell space   integer (col, row). Unbounded, negatives allowed.
 *                +row points UP: row 1 is the cast-on, drawn at the visual
 *                bottom of a chart, exactly as knitters read a chart.
 *
 *   World space  cell * CELL. One cell is CELL x CELL world units, matching
 *                the 24-unit design grid the Figma stitch symbols use, so a
 *                symbol's viewBox width divided by CELL is its span in cells.
 *                +y still points UP.
 *
 *   Screen space canvas CSS pixels, origin top-left, +y points DOWN.
 *
 * The y-axis flip happens in worldToScreen/screenToWorld and nowhere else.
 * If you find yourself negating a y outside this file, something is wrong.
 */

/** World units per cell. Matches the stitch symbols' 24-unit design grid. */
export const CELL = 24;

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 10;

export type Camera = {
  /** World coordinate shown at the centre of the viewport. */
  x: number;
  y: number;
  /** Screen pixels per world unit. At zoom 1 a cell is CELL px across. */
  zoom: number;
};

export type Viewport = { width: number; height: number };

export type Point = { x: number; y: number };
export type Cell = { col: number; row: number };

export const defaultCamera = (): Camera => ({ x: 0, y: 0, zoom: 1 });

export const clampZoom = (zoom: number): number =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Screen pixels per cell at the current zoom. */
export const cellPx = (cam: Camera): number => CELL * cam.zoom;

export function worldToScreen(
  wx: number,
  wy: number,
  cam: Camera,
  vp: Viewport,
): Point {
  return {
    x: (wx - cam.x) * cam.zoom + vp.width / 2,
    // Flip: world +y is up, screen +y is down.
    y: (cam.y - wy) * cam.zoom + vp.height / 2,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  cam: Camera,
  vp: Viewport,
): Point {
  return {
    x: (sx - vp.width / 2) / cam.zoom + cam.x,
    y: cam.y - (sy - vp.height / 2) / cam.zoom,
  };
}

/**
 * The cell containing a world point. A cell (col, row) covers
 * x in [col*CELL, (col+1)*CELL) and y in [row*CELL, (row+1)*CELL).
 */
export function worldToCell(wx: number, wy: number): Cell {
  return { col: Math.floor(wx / CELL), row: Math.floor(wy / CELL) };
}

/** World coordinate of a cell's lower-left corner (its origin, since +y is up). */
export function cellToWorld(col: number, row: number): Point {
  return { x: col * CELL, y: row * CELL };
}

export function screenToCell(
  sx: number,
  sy: number,
  cam: Camera,
  vp: Viewport,
): Cell {
  const w = screenToWorld(sx, sy, cam, vp);
  return worldToCell(w.x, w.y);
}

/**
 * Screen rect of a cell. Returns the TOP-left corner in screen space, which
 * is the cell's upper edge in world space (row + 1), because of the flip.
 */
export function cellToScreenRect(
  col: number,
  row: number,
  cam: Camera,
  vp: Viewport,
): { x: number; y: number; size: number } {
  const topLeft = worldToScreen(col * CELL, (row + 1) * CELL, cam, vp);
  return { x: topLeft.x, y: topLeft.y, size: cellPx(cam) };
}

/** Inclusive cell bounds currently visible, padded by `pad` cells. */
export function visibleCellBounds(
  cam: Camera,
  vp: Viewport,
  pad = 1,
): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
  // Screen top-left is world (min x, max y); screen bottom-right is (max x, min y).
  const topLeft = screenToWorld(0, 0, cam, vp);
  const bottomRight = screenToWorld(vp.width, vp.height, cam, vp);
  // The far edges are exclusive: a cell whose left edge sits exactly on the
  // viewport's right edge has no visible area, so ceil()-1 rather than floor().
  return {
    minCol: Math.floor(topLeft.x / CELL) - pad,
    maxCol: Math.ceil(bottomRight.x / CELL) - 1 + pad,
    minRow: Math.floor(bottomRight.y / CELL) - pad,
    maxRow: Math.ceil(topLeft.y / CELL) - 1 + pad,
  };
}

/**
 * Zoom by `factor`, keeping the world point under (sx, sy) pinned to that
 * screen position. Returns a new camera; does not mutate.
 */
export function zoomAt(
  cam: Camera,
  factor: number,
  sx: number,
  sy: number,
  vp: Viewport,
): Camera {
  const zoom = clampZoom(cam.zoom * factor);
  if (zoom === cam.zoom) return cam;

  const before = screenToWorld(sx, sy, cam, vp);
  const zoomed: Camera = { ...cam, zoom };
  const after = screenToWorld(sx, sy, zoomed, vp);

  return { x: cam.x + (before.x - after.x), y: cam.y + (before.y - after.y), zoom };
}

/** Pan by a screen-pixel delta (e.g. a drag or a wheel scroll). */
export function panByScreen(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return {
    ...cam,
    x: cam.x - dxScreen / cam.zoom,
    // Screen down is world down, which is -y.
    y: cam.y + dyScreen / cam.zoom,
  };
}
