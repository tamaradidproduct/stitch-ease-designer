import type { DocIndex } from "../model/docIndex";
import { getSymbol } from "../symbols/registry";
import {
  CELL,
  type Camera,
  type Cell,
  type Viewport,
  cellPx,
  cellToScreenRect,
  visibleCellBounds,
} from "./camera";
import { drawGrid, labelStep } from "./grid";
import { ceilTo } from "./math";
import type { SpriteCache } from "./spriteCache";
import { RULER, theme } from "./theme";

export type RenderState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
  index: DocIndex;
  sprites: SpriteCache;
  /** Symbol armed in the toolbar, previewed under the cursor. */
  armedSymbolId: string | null;
};

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
  const step = labelStep(cam);

  for (let col = ceilTo(b.minCol, step); col <= b.maxCol; col += step) {
    const r = cellToScreenRect(col, 0, cam, vp);
    const x = r.x + r.size / 2;
    if (x < RULER) continue;
    ctx.fillStyle = hover?.col === col ? theme.rulerTextActive : theme.rulerText;
    ctx.fillText(String(col), x, RULER / 2);
  }

  for (let row = ceilTo(b.minRow, step); row <= b.maxRow; row += step) {
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

/**
 * Stitches. Each covered cell gets its own chrome — that's how a knitting
 * chart reads, with a cable's crossing drawn across several bordered cells —
 * and the glyph is then blitted across the whole span.
 */
function drawPlacements(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, index, sprites } = state;
  const size = cellPx(cam);
  const bounds = visibleCellBounds(cam, vp, 1);
  const drawChrome = size >= 3;

  for (const p of index.query(bounds)) {
    const symbol = getSymbol(p.symbolId);
    const span = symbol?.span ?? 1;
    const r = cellToScreenRect(p.col, p.row, cam, vp);
    const width = size * span;

    ctx.fillStyle = theme.cellFill;
    ctx.fillRect(r.x, r.y, width, size);

    // Overpaint only the cells the library tints. "No stitch" is grey and
    // otherwise indistinguishable from knit, so this is meaning, not styling.
    const fills = symbol?.cellFills;
    if (fills) {
      for (let i = 0; i < span; i++) {
        const fill = fills[i];
        if (!fill) continue;
        ctx.fillStyle = fill;
        ctx.fillRect(r.x + i * size, r.y, size, size);
      }
    }

    if (drawChrome) {
      ctx.strokeStyle = theme.cellStroke;
      ctx.lineWidth = 1;
      for (let i = 0; i < span; i++) {
        ctx.strokeRect(
          Math.round(r.x + i * size) + 0.5,
          Math.round(r.y) + 0.5,
          Math.round(size) - 1,
          Math.round(size) - 1,
        );
      }
    }

    if (!symbol) continue;
    // knit and empty are pure cell chrome in the library, so they have no
    // glyph to draw — the bordered cell above is the whole symbol.
    if (!symbol.glyph.includes("<path") && !symbol.glyph.includes("<rect")) continue;

    const sprite = sprites.get(symbol, size, theme.symbol);
    if (sprite) ctx.drawImage(sprite, r.x, r.y, width, size);
  }
}

/**
 * The "nothing here yet, click to add" affordance for an empty cell with
 * nothing armed. Deliberately NOT a plus centered in the cell — that's
 * exactly the size and position a stitch glyph occupies, so it would read as
 * one at a glance. A dashed border (stitches are always solid-stroked) and a
 * small badge tucked in the corner instead of the centre keep it unambiguous.
 */
function drawAddState(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; size: number },
): void {
  const { x, y, size } = r;

  ctx.save();
  ctx.setLineDash([Math.max(3, size * 0.14), Math.max(2.5, size * 0.1)]);
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  ctx.restore();

  // Too small a cell makes a corner badge an illegible smudge; the dashed
  // border alone still reads fine at that zoom.
  if (size < 13) return;

  const radius = Math.min(size * 0.2, 8);
  const cx = x + size - radius - 3;
  const cy = y + size - radius - 3;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = theme.hoverStroke;
  ctx.fill();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1.2, radius * 0.28);
  ctx.lineCap = "round";
  const arm = radius * 0.45;
  ctx.beginPath();
  ctx.moveTo(cx - arm, cy);
  ctx.lineTo(cx + arm, cy);
  ctx.moveTo(cx, cy - arm);
  ctx.lineTo(cx, cy + arm);
  ctx.stroke();
}

function drawHover(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, hover, armedSymbolId, sprites, index } = state;
  if (!hover) return;
  // Below this the outline is bigger than the cell and just looks like noise.
  if (cellPx(cam) < 4) return;

  const size = cellPx(cam);
  const symbol = armedSymbolId ? getSymbol(armedSymbolId) : undefined;
  // Preview the armed symbol's full footprint, so it's obvious before clicking
  // that a 3/3 cable is about to consume six cells.
  const span = symbol?.span ?? 1;
  const r = cellToScreenRect(hover.col, hover.row, cam, vp);
  const width = size * span;

  if (!symbol && !index.placementAt(hover.col, hover.row)) {
    drawAddState(ctx, { x: r.x, y: r.y, size });
    return;
  }

  ctx.fillStyle = theme.hoverFill;
  ctx.fillRect(r.x, r.y, width, size);
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, width - 1, size - 1);

  // Show what will actually land there, not just its footprint — the glyph
  // itself, faded so it still reads as a preview rather than a placed stitch.
  if (symbol && (symbol.glyph.includes("<path") || symbol.glyph.includes("<rect"))) {
    const sprite = sprites.get(symbol, size, theme.hoverStroke);
    if (sprite) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sprite, r.x, r.y, width, size);
      ctx.restore();
    }
  }
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
  drawPlacements(ctx, state);
  drawHover(ctx, state);
  drawRulers(ctx, state);
}

/** World-space size of one cell, re-exported for callers that need it. */
export { CELL };
