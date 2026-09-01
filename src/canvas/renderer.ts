import {
  CELL,
  type Camera,
  type Cell,
  type Viewport,
  cellPx,
  cellToScreenRect,
  visibleCellBounds,
} from "./camera";
import { drawGrid, gridSteps } from "./grid";
import { RULER, theme } from "./theme";

export type RenderState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
};

const ceilTo = (n: number, step: number) => Math.ceil(n / step) * step;

/**
 * Row and column rulers pinned to the top and left edges.
 *
 * Labels are raw cell indices, with the origin at 0. Once chart frames land,
 * a frame will carry its own 1-based row numbering; until then absolute
 * coordinates are the only honest thing to show.
 */
function drawRulers(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, hover } = state;
  const b = visibleCellBounds(cam, vp, 0);
  const { major } = gridSteps(cam);
  const px = cellPx(cam);

  ctx.fillStyle = theme.rulerBackground;
  ctx.fillRect(0, 0, vp.width, RULER);
  ctx.fillRect(0, 0, RULER, vp.height);

  // Highlight the hovered column/row so a cell far from the origin is still
  // easy to locate.
  if (hover) {
    ctx.fillStyle = theme.rulerHighlight;
    const c = cellToScreenRect(hover.col, hover.row, cam, vp);
    ctx.fillRect(c.x, 0, c.size, RULER);
    ctx.fillRect(0, c.y, RULER, c.size);
  }

  ctx.strokeStyle = theme.rulerBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER + 0.5);
  ctx.lineTo(vp.width, RULER + 0.5);
  ctx.moveTo(RULER + 0.5, 0);
  ctx.lineTo(RULER + 0.5, vp.height);
  ctx.stroke();

  ctx.font =
    '10px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Labelling every major cell gets dense when cells are tiny; step up until
  // the labels have room to breathe.
  const labelStep = Math.max(major, ceilTo(48 / Math.max(px, 0.0001), major) || major);

  for (let col = ceilTo(b.minCol, labelStep); col <= b.maxCol; col += labelStep) {
    const r = cellToScreenRect(col, 0, cam, vp);
    const x = r.x + r.size / 2;
    if (x < RULER) continue;
    ctx.fillStyle = hover?.col === col ? theme.rulerTextActive : theme.rulerText;
    ctx.fillText(String(col), x, RULER / 2);
  }

  for (let row = ceilTo(b.minRow, labelStep); row <= b.maxRow; row += labelStep) {
    const r = cellToScreenRect(0, row, cam, vp);
    const y = r.y + r.size / 2;
    if (y < RULER) continue;
    ctx.fillStyle = hover?.row === row ? theme.rulerTextActive : theme.rulerText;
    ctx.fillText(String(row), RULER / 2, y);
  }

  // Mask the corner where the two rulers meet.
  ctx.fillStyle = theme.rulerBackground;
  ctx.fillRect(0, 0, RULER, RULER);
  ctx.strokeStyle = theme.rulerBorder;
  ctx.beginPath();
  ctx.moveTo(0, RULER + 0.5);
  ctx.lineTo(RULER + 0.5, RULER + 0.5);
  ctx.lineTo(RULER + 0.5, 0);
  ctx.stroke();
}

function drawHover(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, hover } = state;
  if (!hover) return;
  // Below this the outline is bigger than the cell and just looks like noise.
  if (cellPx(cam) < 4) return;

  const r = cellToScreenRect(hover.col, hover.row, cam, vp);
  ctx.fillStyle = theme.hoverFill;
  ctx.fillRect(r.x, r.y, r.size, r.size);
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.size - 1, r.size - 1);
}

/**
 * Draw one frame. `ctx` is expected to already be scaled by devicePixelRatio,
 * so everything here works in CSS pixels.
 */
export function render(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { viewport: vp } = state;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, vp.width, vp.height);

  drawGrid(ctx, state.camera, vp, theme);
  drawHover(ctx, state);
  drawRulers(ctx, state);
}

/** World-space size of one cell, re-exported for callers that need it. */
export { CELL };
