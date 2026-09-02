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

/**
 * Dot and cross marks are a fixed screen size regardless of zoom — only the
 * *spacing* between them changes with LOD, the same way a physical dot-grid
 * notebook's dots don't grow as you zoom a photo of the page. A mark that
 * scaled with cell size would either vanish at low zoom or swamp the stitches
 * at high zoom.
 */
const DOT_RADIUS = 0.9;
const CROSS_ARM = 3.5;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  theme: { gridMinor: string; gridMajor: string; axis: string },
): void {
  const b = visibleCellBounds(cam, vp, 1);
  const { minor, major } = gridSteps(cam);

  // Every major step is a whole multiple of the minor step (gridSteps'
  // ladders guarantee it), so a plain modulo on the integer cell coordinates
  // — before converting to screen space — is enough to tell whether a minor
  // lattice point also falls on the major one and gets a cross instead of a
  // dot there, rather than both drawn on top of each other.
  ctx.fillStyle = theme.gridMinor;
  for (let col = ceilTo(b.minCol, minor); col <= b.maxCol; col += minor) {
    for (let row = ceilTo(b.minRow, minor); row <= b.maxRow; row += minor) {
      if (col % major === 0 && row % major === 0) continue;
      const { x, y } = worldToScreen(col * CELL, row * CELL, cam, vp);
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(y), DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

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

  // The origin axes, so "home" is still findable on an unbounded canvas —
  // the one place a full line remains, since a dot grid alone has no way to
  // call out one specific point as special.
  ctx.strokeStyle = theme.axis;
  ctx.beginPath();
  const origin = worldToScreen(0, 0, cam, vp);
  const ox = crisp(origin.x);
  const oy = crisp(origin.y);
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, vp.height);
  ctx.moveTo(0, oy);
  ctx.lineTo(vp.width, oy);
  ctx.stroke();
}
