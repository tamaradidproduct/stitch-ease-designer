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
 * Dots scale gently with zoom — thicker zoomed in, thinner zoomed out —
 * rather than a fixed screen size. Only the dot *spacing* is driven by LOD;
 * this is a second, independent scaling of the dot itself, clamped at both
 * ends so it never disappears zoomed out or balloons zoomed in. The clamp
 * range in cellPx (screen px per cell) is generous on purpose: most working
 * zoom levels sit inside it, so the size change reads as a smooth response to
 * zoom rather than snapping to the clamped ends during normal use.
 *
 * The floor matters more than it looks: a placed stitch's own cell border is
 * a constant 1px hairline at every zoom (see drawPlacements in renderer.ts),
 * so a chart's contrast against the background is set by that fixed line
 * against whatever the dots are doing. A dot floor at 1.1px radius (~2.2px of
 * filled "ink") is visually heavier than that 1px stroke — the background
 * was out-weighing the chart's own borders once zoomed out, which is exactly
 * what made a chart read as lost in the dots rather than sitting on top of
 * them. 0.4px keeps the dot clearly subordinate to a hairline at every zoom.
 */
const DOT_RADIUS_MIN = 0.4;
const DOT_RADIUS_MAX = 2.1;
const DOT_SCALE_MIN_PX = 20; // cellPx at which dots hit DOT_RADIUS_MIN
const DOT_SCALE_MAX_PX = 220; // cellPx at which dots hit DOT_RADIUS_MAX

function dotRadiusFor(cam: Camera): number {
  const t =
    (cellPx(cam) - DOT_SCALE_MIN_PX) / (DOT_SCALE_MAX_PX - DOT_SCALE_MIN_PX);
  const clamped = Math.min(1, Math.max(0, t));
  return DOT_RADIUS_MIN + clamped * (DOT_RADIUS_MAX - DOT_RADIUS_MIN);
}

/** Crosses stay a fixed size — only the dots were asked to scale with zoom. */
const CROSS_ARM = 3.5;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  theme: { gridMinor: string; gridMajor: string },
): void {
  const b = visibleCellBounds(cam, vp, 1);
  const { minor, major } = gridSteps(cam);

  // Every major step is a whole multiple of the minor step (gridSteps'
  // ladders guarantee it), so a plain modulo on the integer cell coordinates
  // — before converting to screen space — is enough to tell whether a minor
  // lattice point also falls on the major one and gets a cross instead of a
  // dot there, rather than both drawn on top of each other.
  ctx.fillStyle = theme.gridMinor;
  const dotRadius = dotRadiusFor(cam);
  for (let col = ceilTo(b.minCol, minor); col <= b.maxCol; col += minor) {
    for (let row = ceilTo(b.minRow, minor); row <= b.maxRow; row += minor) {
      if (col % major === 0 && row % major === 0) continue;
      const { x, y } = worldToScreen(col * CELL, row * CELL, cam, vp);
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(y), dotRadius, 0, Math.PI * 2);
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
}
