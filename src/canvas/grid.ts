import {
  CELL,
  type Camera,
  type Viewport,
  cellPx,
  visibleCellBounds,
  worldToScreen,
} from "./camera";

/**
 * Grid level-of-detail.
 *
 * Below roughly 7px per line the grid stops reading as a grid and starts
 * reading as grey mush, so we step up to every 2nd, 5th, 10th cell and so on.
 * Emphasis lines stay on multiples of 10, which is the convention knitters
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

/** Smallest multiple of `step` that is >= n. */
const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

/** Crisp 1px lines: land on a half-pixel so the stroke doesn't straddle two. */
const crisp = (v: number) => Math.round(v) + 0.5;

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Viewport,
  theme: { gridMinor: string; gridMajor: string; axis: string },
): void {
  const b = visibleCellBounds(cam, vp, 1);
  const { minor, major } = gridSteps(cam);

  ctx.lineWidth = 1;

  // Three passes so we don't restroke a line in a heavier colour: minor lines
  // skip anything that a major line will cover, and both skip the axes.
  const drawPass = (step: number, colour: string, skip: (n: number) => boolean) => {
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (let col = ceilTo(b.minCol, step); col <= b.maxCol; col += step) {
      if (skip(col)) continue;
      const x = crisp(worldToScreen(col * CELL, 0, cam, vp).x);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, vp.height);
    }
    for (let row = ceilTo(b.minRow, step); row <= b.maxRow; row += step) {
      if (skip(row)) continue;
      const y = crisp(worldToScreen(0, row * CELL, cam, vp).y);
      ctx.moveTo(0, y);
      ctx.lineTo(vp.width, y);
    }
    ctx.stroke();
  };

  drawPass(minor, theme.gridMinor, (n) => n === 0 || n % major === 0);
  drawPass(major, theme.gridMajor, (n) => n === 0);

  // The origin axes, so "home" is always findable on an unbounded canvas.
  ctx.strokeStyle = theme.axis;
  ctx.beginPath();
  const ox = crisp(worldToScreen(0, 0, cam, vp).x);
  const oy = crisp(worldToScreen(0, 0, cam, vp).y);
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, vp.height);
  ctx.moveTo(0, oy);
  ctx.lineTo(vp.width, oy);
  ctx.stroke();
}
