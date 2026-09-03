import {
  CELL,
  type Camera,
  type Viewport,
  cellPx,
  visibleCellBounds,
  worldToScreen,
} from "./camera";
import { ceilTo } from "./math";

/**
 * Grid level-of-detail.
 *
 * Below roughly 7px per mark the grid stops reading as a grid and starts
 * reading as grey mush, so we step up to every 2nd, 5th, 10th cell and so on.
 * Emphasis marks stay on multiples of 10, which is the convention knitters
 * expect when counting stitches and rows.
 */
const MIN_LINE_SPACING_PX = 7;
const MINOR_LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
const MAJOR_LADDER = [10, 50, 100, 500, 1000, 5000, 10000, 50000];

export type GridSteps = { minor: number; major: number };

export function gridSteps(cam: Camera): GridSteps {
  const px = cellPx(cam);
  const minor =
    MINOR_LADDER.find((s) => s * px >= MIN_LINE_SPACING_PX) ??
    MINOR_LADDER[MINOR_LADDER.length - 1]!;
  const major =
    MAJOR_LADDER.find((s) => s >= minor * 5) ?? MAJOR_LADDER[MAJOR_LADDER.length - 1]!;
  return { minor, major };
}

/**
 * Step between ruler labels: the smallest multiple of the grid's own major
 * line step that keeps labels no closer than `minSpacingPx` apart (labels
 * shouldn't be denser than the lines they annotate, but snapping to
 * MAJOR_LADDER rungs directly can overshoot — e.g. jumping from 1000 to 5000
 * when 2000 would already satisfy the spacing).
 */
export function labelStep(cam: Camera, minSpacingPx = 48): number {
  const { major } = gridSteps(cam);
  // cellPx is CELL * cam.zoom, and zoom is always clamped to >= MIN_ZOOM, so
  // this is bounded well above zero — no need to guard the division below.
  const px = cellPx(cam);
  return Math.max(major, ceilTo(minSpacingPx / px, major));
}

/** Crisp 1px lines: land on a half-pixel so the stroke doesn't straddle two. */
const crisp = (v: number) => Math.round(v) + 0.5;

/** Fixed size regardless of zoom — only the LOD spacing between marks changes. */
const CROSS_ARM = 3.5;
/** Gap between dots along a minor grid line, in screen px. */
const DOT_GAP = 4;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  theme: { gridMajor: string },
): void {
  const b = visibleCellBounds(cam, vp, 1);
  const { minor, major } = gridSteps(cam);

  // Minor grid: full lines at every minor step, dotted rather than solid, in
  // the same colour as the major crosses — one colour for the whole grid,
  // just two different marks (a faint dotted line vs. a small cross) for the
  // two levels of emphasis.
  //
  // A dotted line, not a dashed one: `lineCap: "round"` turns a near-zero
  // dash segment into a round dot rather than a short square tick, which is
  // what actually reads as "dotted" instead of "dashed" at 1px.
  ctx.save();
  ctx.strokeStyle = theme.gridMajor;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  ctx.setLineDash([0.001, DOT_GAP]);
  ctx.beginPath();
  for (let col = ceilTo(b.minCol, minor); col <= b.maxCol; col += minor) {
    const x = crisp(worldToScreen(col * CELL, 0, cam, vp).x);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, vp.height);
  }
  for (let row = ceilTo(b.minRow, minor); row <= b.maxRow; row += minor) {
    const y = crisp(worldToScreen(0, row * CELL, cam, vp).y);
    ctx.moveTo(0, y);
    ctx.lineTo(vp.width, y);
  }
  ctx.stroke();
  ctx.restore(); // drop the dash pattern so it can't leak into the crosses below

  // Major grid: unchanged, a small "+" at each major intersection.
  ctx.strokeStyle = theme.gridMajor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = ceilTo(b.minCol, major); col <= b.maxCol; col += major) {
    for (let row = ceilTo(b.minRow, major); row <= b.maxRow; row += major) {
      const { x, y } = worldToScreen(col * CELL, row * CELL, cam, vp);
      const cx = crisp(x);
      const cy = crisp(y);
      ctx.moveTo(cx - CROSS_ARM, cy);
      ctx.lineTo(cx + CROSS_ARM, cy);
      ctx.moveTo(cx, cy - CROSS_ARM);
      ctx.lineTo(cx, cy + CROSS_ARM);
    }
  }
  ctx.stroke();
}
