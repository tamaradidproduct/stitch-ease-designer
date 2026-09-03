import type { DocIndex } from "../model/docIndex";
import { canInsertAt } from "../model/ops";
import { rowDirectionAt } from "../model/rowDirection";
import { chartTopology, knittedRowNumbers, roundStitchNumbers } from "../model/stitchNumbers";
import { getSymbol } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import {
  CELL,
  type Camera,
  type Cell,
  type Viewport,
  cellPx,
  cellToScreenRect,
  visibleCellBounds,
  worldToScreen,
} from "./camera";
import { drawGrid, labelStep } from "./grid";
import type { SpriteCache } from "./spriteCache";
import type { SelectionBox, SelectionMove, Tool } from "../state/uiStore";
import { RULER, theme } from "./theme";

export type RenderState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
  /** Where Insert would land - see `screenToInsertCell`. Only Insert reads this. */
  insertHover: Cell | null;
  index: DocIndex;
  revision: number;
  sprites: SpriteCache;
  /** Symbol armed in the toolbar, previewed under the cursor. */
  armedSymbolId: string | null;
  selectedPlacementIds: string[];
  tool: Tool;
  selectHeld: boolean;
  selectionBox: SelectionBox | null;
  selectionMove: SelectionMove | null;
};

/**
 * Crisp screen-space column/row boundaries, computed from the absolute
 * col/row rather than by offsetting a neighbouring cell's own rounded rect.
 *
 * Two adjacent stitches each draw their own border independently. Deriving
 * cell N+1's left edge as "cell N's rounded position, plus the cell size"
 * doesn't generally equal independently rounding cell N+1's own position —
 * Math.round(a) + Math.round(b) isn't Math.round(a + b) — whenever cellPx(cam)
 * isn't a whole number, which is most zoom levels. That drift crosses a
 * rounding boundary periodically as it accumulates across columns, which is
 * why the gap showed up every few cells rather than everywhere or nowhere.
 * Computing each boundary from the same absolute col/row input every time
 * guarantees two neighbours agree on their shared edge exactly.
 */
export function crispColX(col: number, cam: Camera, vp: Viewport): number {
  return Math.round(worldToScreen(col * CELL, 0, cam, vp).x) + 0.5;
}

export function crispRowY(row: number, cam: Camera, vp: Viewport): number {
  // A row's screen TOP is world y = (row+1)*CELL, since +row points up.
  return Math.round(worldToScreen(0, (row + 1) * CELL, cam, vp).y) + 0.5;
}

/**
 * Row and column rulers pinned to the top and left edges.
 *
 * Actual stitched rows are numbered bottom to top, independently of their
 * canvas coordinates. The top ruler follows the hovered row because
 * shaping means a canvas column can have a different stitch number on each
 * row. For knitting in the round, stitch 1 is the rightmost actual stitch.
 */
function drawRulers(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, hover, index, revision } = state;
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

  if (hover) {
    const stitchNumbers = roundStitchNumbers(index, hover.col, hover.row, revision);
    for (const [col, stitchNumber] of stitchNumbers) {
      if (col < b.minCol || col > b.maxCol) continue;
      // Keep the ruler readable when zoomed out, while always retaining the
      // row's first stitch and the currently hovered stitch.
      if (stitchNumber !== 1 && stitchNumber % step !== 0 && col !== hover.col) continue;
      const r = cellToScreenRect(col, hover.row, cam, vp);
      const x = r.x + r.size / 2;
      if (x < RULER) continue;
      ctx.fillStyle = hover.col === col ? theme.rulerTextActive : theme.rulerText;
      ctx.fillText(String(stitchNumber), x, RULER / 2);
    }
  }

  for (const group of chartTopology(index, revision).groups) {
    for (const [row, rowNumber] of knittedRowNumbers(group)) {
      if (row < b.minRow || row > b.maxRow) continue;
      if (rowNumber !== 1 && rowNumber % step !== 0 && row !== hover?.row) continue;
      const r = cellToScreenRect(0, row, cam, vp);
      const y = r.y + r.size / 2;
      if (y < RULER) continue;
      ctx.fillStyle = hover?.row === row ? theme.rulerTextActive : theme.rulerText;
      ctx.fillText(String(rowNumber), RULER / 2, y);
    }
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
      const topY = crispRowY(p.row, cam, vp);
      const botY = crispRowY(p.row - 1, cam, vp);
      for (let i = 0; i < span; i++) {
        const leftX = crispColX(p.col + i, cam, vp);
        const rightX = crispColX(p.col + i + 1, cam, vp);
        ctx.strokeRect(leftX, topY, rightX - leftX, botY - topY);
      }
    }

    // knit and empty are pure cell chrome in the library, so they have no
    // glyph to draw — the bordered cell above is the whole symbol.
    if (!symbol?.hasGlyph) continue;

    const sprite = sprites.get(symbol, size, theme.symbol);
    if (sprite) ctx.drawImage(sprite, r.x, r.y, width, size);
  }
}

function drawSelectionAt(
  ctx: CanvasRenderingContext2D,
  state: RenderState,
  deltaCol: number,
  deltaRow: number,
): void {
  const { camera: cam, viewport: vp, index, selectedPlacementIds } = state;
  const size = cellPx(cam);
  for (const id of selectedPlacementIds) {
    const placement = index.placements.get(id);
    if (!placement) continue;
    const r = cellToScreenRect(placement.col + deltaCol, placement.row + deltaRow, cam, vp);
    const width = size * index.spanOf(placement);
    ctx.fillRect(r.x, r.y, width, size);
    ctx.strokeRect(r.x + 1, r.y + 1, width - 2, size - 2);
  }
}

function drawSelection(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { selectionMove } = state;
  if (cellPx(state.camera) < 3) return;

  ctx.save();
  ctx.lineWidth = 2;

  // Duplicating leaves the originals in place, so they stay highlighted in
  // the normal colour while the copy-to-be gets its own preview below -
  // a plain move only ever shows the one, since the originals are the
  // things actually moving.
  if (selectionMove?.duplicating) {
    ctx.fillStyle = "rgba(2, 132, 199, 0.14)";
    ctx.strokeStyle = theme.hoverStroke;
    drawSelectionAt(ctx, state, 0, 0);
  }

  if (selectionMove?.blocked) {
    // The drop target is occupied - paint the preview in the same red as the
    // rest of the UI's destructive/blocked actions, so a rejected drop reads
    // as rejected instead of silently doing nothing.
    ctx.fillStyle = "rgba(220, 38, 38, 0.14)";
    ctx.strokeStyle = "#dc2626";
  } else if (selectionMove?.duplicating) {
    // A distinct colour from the plain-move blue, so it's clear a copy is
    // about to be created rather than the originals moving.
    ctx.fillStyle = "rgba(22, 163, 74, 0.14)";
    ctx.strokeStyle = "#16a34a";
  } else {
    ctx.fillStyle = "rgba(2, 132, 199, 0.14)";
    ctx.strokeStyle = theme.hoverStroke;
  }
  drawSelectionAt(ctx, state, selectionMove?.col ?? 0, selectionMove?.row ?? 0);
  ctx.restore();
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { selectionBox, camera: cam, viewport: vp } = state;
  if (!selectionBox) return;
  const minCol = Math.min(selectionBox.start.col, selectionBox.current.col);
  const maxCol = Math.max(selectionBox.start.col, selectionBox.current.col);
  const minRow = Math.min(selectionBox.start.row, selectionBox.current.row);
  const maxRow = Math.max(selectionBox.start.row, selectionBox.current.row);
  const size = cellPx(cam);
  const topLeft = cellToScreenRect(minCol, maxRow, cam, vp);

  ctx.save();
  ctx.fillStyle = "rgba(2, 132, 199, 0.08)";
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.fillRect(
    topLeft.x,
    topLeft.y,
    (maxCol - minCol + 1) * size,
    (maxRow - minRow + 1) * size,
  );
  ctx.strokeRect(
    topLeft.x + 0.5,
    topLeft.y + 0.5,
    (maxCol - minCol + 1) * size - 1,
    (maxRow - minRow + 1) * size - 1,
  );
  ctx.restore();
}

/**
 * The "nothing here yet, click to add" affordance for an empty cell: a
 * dashed border (stitches are always solid-stroked) plus a small "+" badge
 * tucked in the corner, meaning "a new stitch goes here" regardless of
 * whether anything's armed. When something IS armed, a second indicator - a
 * shrunk-down, true-shaped rendition of it - sits just outside the frame,
 * so the two together read as "new stitch" + "specifically this one",
 * rather than one badge trying to carry both meanings at once.
 */
function drawAddState(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; size: number },
  symbol: StitchSymbol | undefined,
  sprites: SpriteCache,
): void {
  const { x, y, size } = r;

  strokeDashedRect(ctx, x + 1, y + 1, size - 2, size - 2, size);

  // Too small a cell makes either indicator an illegible smudge; the dashed
  // border alone still reads fine at that zoom.
  if (size < 13) return;

  const radius = Math.min(size * 0.2, 8);
  drawPlusBadge(ctx, x + size - radius - 3, y + size - radius - 3, radius);

  if (symbol) {
    const h = Math.max(8, Math.min(size * 0.45, 13));
    const w = h * symbol.span;
    // Right-aligned under the box, but clear of it entirely - tucking it
    // inside the corner made it read as part of the cell, which is exactly
    // the "about to overwrite this" impression the dashed border is there
    // to avoid.
    drawStitchThumbnail(ctx, x + size - w, y + size + 3, h, symbol, sprites);
  }
}

/** The dashed outline shared by every "not committed yet" preview state. */
function strokeDashedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  unit: number,
): void {
  ctx.save();
  ctx.setLineDash([Math.max(3, unit * 0.14), Math.max(2.5, unit * 0.1)]);
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/**
 * The generic "a new stitch goes here" badge, centred at (cx, cy) - shown
 * whether or not anything's armed, since it marks the action (add), not
 * which symbol. Shared by Draw's empty-cell hover and Insert's line.
 */
function drawPlusBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
): void {
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

/**
 * A shrunk-down, true-shaped rendition of the armed symbol, top-left corner
 * at (x, y) — square for a single stitch, a short rectangle for a
 * multi-cell one, same shape it'll actually have, just smaller. Sits
 * alongside `drawPlusBadge`, not instead of it: "+" says a stitch is about
 * to land, this says which one.
 */
function drawStitchThumbnail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  symbol: StitchSymbol,
  sprites: SpriteCache,
): void {
  const span = symbol.span;
  const w = h * span;
  const cellW = h;

  ctx.fillStyle = theme.cellFill;
  ctx.fillRect(x, y, w, h);
  const fills = symbol.cellFills;
  if (fills) {
    for (let i = 0; i < span; i++) {
      const fill = fills[i];
      if (!fill) continue;
      ctx.fillStyle = fill;
      ctx.fillRect(x + i * cellW, y, cellW, h);
    }
  }
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  if (symbol.hasGlyph) {
    const sprite = sprites.get(symbol, h, theme.symbol);
    if (sprite) ctx.drawImage(sprite, x, y, w, h);
  }
}

/** The plain highlight for hovering a cell that already has a stitch. */
function drawEditHighlight(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number },
  size: number,
): void {
  ctx.fillStyle = theme.hoverFill;
  ctx.fillRect(r.x, r.y, size, size);
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, size - 1, size - 1);
}

/**
 * Insert's indicator: not a cell highlight (there's nothing to select or
 * overwrite - it's an insertion point, like a text cursor between two
 * characters), just a line at the boundary the new stitch will open up,
 * capped with a downward arrow so it doesn't read as a stray grid line.
 * Sits on the side of the hovered cell that stays fixed - the far side is
 * what's about to slide over to make room.
 */
function drawInsertLine(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  cam: Camera,
  vp: Viewport,
  size: number,
  symbol: StitchSymbol | undefined,
  sprites: SpriteCache,
): void {
  const rtl = rowDirectionAt(row) === "rtl";
  const x = crispColX(rtl ? col + 1 : col, cam, vp);
  const topY = crispRowY(row, cam, vp);
  const botY = crispRowY(row - 1, cam, vp);

  ctx.save();
  ctx.strokeStyle = theme.hoverStroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, botY);
  ctx.stroke();

  // Tip touches the line's top end, pointing down into the row.
  const arrowW = Math.min(size * 0.22, 5);
  const arrowH = arrowW * 0.85;
  ctx.beginPath();
  ctx.moveTo(x - arrowW, topY - arrowH);
  ctx.lineTo(x + arrowW, topY - arrowH);
  ctx.lineTo(x, topY);
  ctx.closePath();
  ctx.fillStyle = theme.hoverStroke;
  ctx.fill();
  ctx.restore();

  // Same two-indicator language as Draw's empty-cell hint, anchored below
  // the line's bottom end - tucking either against the row itself would sit
  // it right on top of whichever real stitch is next to the boundary.
  if (size < 13) return;
  const radius = Math.min(size * 0.2, 8);
  const plusCx = x + radius + 3;
  const plusCy = botY + radius + 3;
  drawPlusBadge(ctx, plusCx, plusCy, radius);

  if (symbol) {
    const h = Math.max(8, Math.min(size * 0.45, 13));
    drawStitchThumbnail(ctx, plusCx + radius + 4, plusCy - h / 2, h, symbol, sprites);
  }
}

function drawHover(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, hover, insertHover, armedSymbolId, sprites, index, tool, selectHeld } =
    state;
  // Below this the outline is bigger than the cell and just looks like noise.
  if (cellPx(cam) < 4) return;
  const size = cellPx(cam);

  if (tool === "insert") {
    if (!insertHover) return;
    // No indicator at all when it's not a valid target - landing inside a
    // multi-cell symbol would cut it in half, and an empty stretch of the
    // row (or an empty row entirely) has no stitch to insert "between".
    if (!canInsertAt(index, insertHover.col, insertHover.row)) return;
    const symbol = armedSymbolId ? getSymbol(armedSymbolId) : undefined;
    drawInsertLine(ctx, insertHover.col, insertHover.row, cam, vp, size, symbol, sprites);
    return;
  }

  if (!hover) return;
  const r = cellToScreenRect(hover.col, hover.row, cam, vp);
  const existing = index.placementAt(hover.col, hover.row);

  // A filled cell is a click-to-select target (Draw) or an erase target
  // (Eraser) regardless of what's armed, so its hover state doesn't depend
  // on the armed symbol either way.
  if (existing) {
    drawEditHighlight(ctx, r, size);
    return;
  }

  if (selectHeld) return;

  // Eraser has nothing to preview on an empty cell - it only ever acts on
  // filled ones, handled above.
  if (tool === "eraser") return;

  const symbol = armedSymbolId ? getSymbol(armedSymbolId) : undefined;
  drawAddState(ctx, { x: r.x, y: r.y, size }, symbol, sprites);
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
  drawSelection(ctx, state);
  drawSelectionBox(ctx, state);
  drawHover(ctx, state);
  drawRulers(ctx, state);
}

/** World-space size of one cell, re-exported for callers that need it. */
export { CELL };
