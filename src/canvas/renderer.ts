import type { DocIndex } from "../model/docIndex";
import { canInsertAt } from "../model/ops";
import { chartTopology, knittedRowNumbers, roundStitchNumbers } from "../model/stitchNumbers";
import type { ReferenceImage } from "../model/types";
import { getSymbol } from "../symbols/registry";
import {
  CELL,
  type Camera,
  type Cell,
  type Point,
  type Viewport,
  cellPx,
  cellToScreenRect,
  visibleCellBounds,
  worldToScreen,
} from "./camera";
import { drawGrid, labelStep } from "./grid";
import type { ReferenceImageCache } from "./referenceImageCache";
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
  referenceImage: ReferenceImage | null;
  referenceImageCache: ReferenceImageCache;
  /**
   * While the reference-image panel is open, it owns the canvas: every
   * normal hover preview (add/edit/insert) is suppressed so the two modes
   * never visually compete, and its own move/resize/calibrate affordances
   * take over instead.
   */
  referenceImagePanelOpen: boolean;
  referenceImageCalibrating: boolean;
  /** The calibration box's corners in world space, while one's being dragged out. */
  referenceImageCalibrationBox: { start: Point; current: Point } | null;
  /** Symbol armed in the toolbar; CanvasView chooses the matching cursor state. */
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
 * The canvas-level target outline for an empty cell. The Figma cursor itself
 * carries the add or armed-stitch badge, so it is intentionally not repeated
 * here.
 */
function drawAddState(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; size: number },
): void {
  const { x, y, size } = r;

  strokeDashedRect(ctx, x + 1, y + 1, size - 2, size - 2, size);

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
 * The reference-image panel's own on-canvas affordances, replacing every
 * normal hover hint while it's open: an outline around the image with a
 * resize handle at its corner (when it's draggable), and the calibration
 * box while one's being dragged out.
 */
function drawReferenceImageOverlay(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { referenceImagePanelOpen, referenceImage, referenceImageCalibrationBox, camera: cam, viewport: vp } =
    state;
  if (!referenceImagePanelOpen) return;

  if (referenceImage?.visible) {
    const topLeft = worldToScreen(referenceImage.x, referenceImage.y + referenceImage.height, cam, vp);
    const bottomRight = worldToScreen(referenceImage.x + referenceImage.width, referenceImage.y, cam, vp);

    ctx.save();
    ctx.strokeStyle = theme.hoverStroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      topLeft.x + 0.5,
      topLeft.y + 0.5,
      bottomRight.x - topLeft.x - 1,
      bottomRight.y - topLeft.y - 1,
    );

    if (!referenceImage.locked) {
      const handle = 9;
      ctx.fillStyle = theme.hoverStroke;
      ctx.fillRect(bottomRight.x - handle / 2, bottomRight.y - handle / 2, handle, handle);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bottomRight.x - handle / 2, bottomRight.y - handle / 2, handle, handle);
    }
    ctx.restore();
  }

  if (referenceImageCalibrationBox) {
    const { start, current } = referenceImageCalibrationBox;
    const a = worldToScreen(start.x, start.y, cam, vp);
    const b = worldToScreen(current.x, current.y, cam, vp);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);

    ctx.save();
    ctx.fillStyle = "rgba(22, 163, 74, 0.14)";
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(b.x - a.x) - 1, Math.abs(b.y - a.y) - 1);
    ctx.restore();
  }
}

function drawHover(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { camera: cam, viewport: vp, hover, insertHover, index, tool, selectHeld } = state;
  // The reference-image panel owns the canvas while it's open - every
  // normal tool hint would otherwise show through underneath its own
  // move/resize/calibrate affordances, competing for the same attention.
  if (state.referenceImagePanelOpen) return;
  // Below this the outline is bigger than the cell and just looks like noise.
  if (cellPx(cam) < 4) return;
  const size = cellPx(cam);

  if (tool === "insert") {
    if (!insertHover) return;
    // No indicator at all when it's not a valid target - landing inside a
    // multi-cell symbol would cut it in half, and an empty stretch of the
    // row (or an empty row entirely) has no stitch to insert "between".
    if (!canInsertAt(index, insertHover.col, insertHover.row)) return;
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

  drawAddState(ctx, { x: r.x, y: r.y, size });
}

/**
 * Draw one frame. `ctx` is expected to already be scaled by devicePixelRatio,
 * so everything here works in CSS pixels.
 */
/**
 * The pattern screenshot a designer is tracing against, drawn before the
 * grid and stitches so it always reads as backdrop, never as content. `x`/
 * `y` anchor its bottom-left corner (world space, +y up, matching how a
 * chart itself grows upward); `width`/`height` are independent so the image
 * can be stretched to match a source chart whose stitches aren't square.
 */
function drawReferenceImage(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { referenceImage, referenceImageCache, camera: cam, viewport: vp } = state;
  if (!referenceImage || !referenceImage.visible) return;

  const img = referenceImageCache.get(referenceImage.ref);
  if (!img) return;

  const { x, y, width, height, opacity } = referenceImage;
  const topLeft = worldToScreen(x, y + height, cam, vp);
  const bottomRight = worldToScreen(x + width, y, cam, vp);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(
    img,
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y,
  );
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, state: RenderState): void {
  const { viewport: vp } = state;

  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, vp.width, vp.height);

  drawReferenceImage(ctx, state);
  drawGrid(ctx, state.camera, vp, theme);
  drawPlacements(ctx, state);
  drawSelection(ctx, state);
  drawSelectionBox(ctx, state);
  drawHover(ctx, state);
  drawReferenceImageOverlay(ctx, state);
  drawRulers(ctx, state);
}

/** World-space size of one cell, re-exported for callers that need it. */
export { CELL };
