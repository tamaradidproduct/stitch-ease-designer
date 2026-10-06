import type { DocIndex } from "../model/docIndex";
import {
  deriveOverrides,
  expectedStitches,
  fillOrigins,
  footprintOf,
  overrideCells,
  stampOrigin,
} from "../model/motifs";
import type { MotifCopy, RepeatDefinition } from "../model/types";
import { getSwatch, glyphInkFor } from "../model/colorPalette";
import { getSymbol, spanOf } from "../symbols/registry";
import { type Camera, type Cell, type Viewport, cellPx, cellToScreenRect } from "./camera";
import type { SpriteCache } from "./spriteCache";
import { theme } from "./theme";
import { alpha, tokens as tk } from "../design/tokens";

const MOTIF_ACCENT = tk["motif-accent"];
const BLOCKED = tk.danger;

export type MotifOverlayState = {
  camera: Camera;
  viewport: Viewport;
  hover: Cell | null;
  index: DocIndex;
  sprites: SpriteCache;
  repeats: readonly RepeatDefinition[];
  armedMotif: { id: string; mirrored: boolean } | null;
  motifFill: { start: Cell; end: Cell } | null;
  selectedPlacementIds: readonly string[];
};

/** Screen rect of a footprint (`row` is its bottom row; +row is up). */
function footprintRect(
  fp: { col: number; row: number; width: number; height: number },
  cam: Camera,
  vp: Viewport,
) {
  const bottomLeft = cellToScreenRect(fp.col, fp.row, cam, vp);
  const size = bottomLeft.size;
  return {
    x: bottomLeft.x,
    y: bottomLeft.y - (fp.height - 1) * size,
    w: fp.width * size,
    h: fp.height * size,
  };
}

function dashed(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, color: string) {
  ctx.save();
  ctx.setLineDash([5, 3]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.restore();
}

function tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
  ctx.save();
  ctx.font = "600 10px system-ui, sans-serif";
  const w = ctx.measureText(text).width + 8;
  ctx.fillStyle = color;
  ctx.fillRect(x, y - 15, w, 14);
  ctx.fillStyle = tk.bg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 4, y - 8);
  ctx.restore();
}

/** The armed motif's ghost: one translucent copy per origin, red where it wouldn't fit. */
function drawStampGhost(ctx: CanvasRenderingContext2D, state: MotifOverlayState, motif: RepeatDefinition) {
  const { camera: cam, viewport: vp, hover, index, sprites, armedMotif, motifFill } = state;
  if (!armedMotif || !hover) return;
  const size = cellPx(cam);
  const fill = motifFill ? fillOrigins(motif, motifFill.start, motifFill.end) : null;
  const origins = fill ? fill.origins : [stampOrigin(motif, hover)];

  for (const origin of origins) {
    const stitches = expectedStitches(motif, { ...origin, mirrored: armedMotif.mirrored });
    const blocked = stitches.some((s) => {
      for (let c = s.col; c < s.col + spanOf(s.symbolId); c++) {
        if (index.placementAt(c, s.row)) return true;
      }
      return false;
    });
    ctx.save();
    ctx.globalAlpha = 0.55;
    for (const s of stitches) {
      const symbol = getSymbol(s.symbolId);
      const span = symbol?.span ?? 1;
      const r = cellToScreenRect(s.col, s.row, cam, vp);
      ctx.fillStyle = getSwatch(s.colorId ?? "")?.hex ?? theme.cellFill;
      ctx.fillRect(r.x, r.y, size * span, size);
      if (symbol) {
        const sprite = sprites.get(symbol, size, glyphInkFor(s.colorId, theme.symbol));
        if (sprite) ctx.drawImage(sprite, r.x, r.y, size * span, size);
      }
    }
    ctx.restore();
    const rect = footprintRect(footprintOf(motif, origin), cam, vp);
    if (blocked) {
      ctx.save();
      ctx.fillStyle = alpha(tk.danger, 0.12);
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
    dashed(ctx, rect, blocked ? BLOCKED : MOTIF_ACCENT);
  }

  if (fill && origins.length > 1) {
    const first = footprintRect(footprintOf(motif, origins[0]!), cam, vp);
    tag(ctx, `${fill.across} × ${fill.up}`, first.x, first.y, MOTIF_ACCENT);
  }
}

/**
 * Outlines the motif copy under the pointer and any selected copy, tagged
 * with the motif's name; a selected copy's overridden cells get a dot.
 */
function drawCopyOutlines(ctx: CanvasRenderingContext2D, state: MotifOverlayState) {
  const { camera: cam, viewport: vp, hover, index, repeats, selectedPlacementIds } = state;
  const copyById = new Map<string, { motif: RepeatDefinition; copy: MotifCopy }>();
  for (const motif of repeats) for (const copy of motif.copies ?? []) copyById.set(copy.id, { motif, copy });
  if (!copyById.size) return;

  const selected = new Set<string>();
  for (const id of selectedPlacementIds) {
    const groupId = index.placements.get(id)?.groupId;
    if (groupId && copyById.has(groupId)) selected.add(groupId);
  }
  const hovered = hover ? index.placementAt(hover.col, hover.row)?.groupId : undefined;
  const outlined = new Set(selected);
  if (hovered && copyById.has(hovered)) outlined.add(hovered);

  const size = cellPx(cam);
  for (const copyId of outlined) {
    const { motif, copy } = copyById.get(copyId)!;
    const rect = footprintRect(footprintOf(motif, copy), cam, vp);
    dashed(ctx, rect, MOTIF_ACCENT);
    tag(ctx, copy.mirrored ? `${motif.name} ⇋` : motif.name, rect.x, rect.y, MOTIF_ACCENT);
    if (!selected.has(copyId) || size < 8) continue;
    const overrides = deriveOverrides(motif, copy, index.groupMembers(copyId));
    ctx.save();
    ctx.fillStyle = tk.highlight;
    const radius = Math.max(2, Math.min(4, size * 0.12));
    for (const cell of overrideCells(overrides)) {
      const r = cellToScreenRect(cell.col, cell.row, cam, vp);
      ctx.beginPath();
      ctx.arc(r.x + r.size - radius - 2, r.y + radius + 2, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Every placed copy's footprint, framed - always on, so where a copy starts
 * and ends reads at a glance on the canvas and in an exported image
 * (FR-64). Quiet on the canvas; solid ink in an export, where it doubles as
 * the printed repeat outline.
 */
export function drawCopyFrames(
  ctx: CanvasRenderingContext2D,
  state: Pick<MotifOverlayState, "camera" | "viewport" | "repeats">,
  forExport = false,
): void {
  const { camera: cam, viewport: vp } = state;
  const size = cellPx(cam);
  if (size < 3) return;
  ctx.save();
  ctx.strokeStyle = forExport ? theme.symbol : alpha(tk["motif-accent"], 0.55);
  ctx.lineWidth = forExport ? Math.max(2, size / 12) : 1.5;
  for (const motif of state.repeats) {
    for (const copy of motif.copies ?? []) {
      const r = footprintRect(footprintOf(motif, copy), cam, vp);
      if (r.x > vp.width || r.y > vp.height || r.x + r.w < 0 || r.y + r.h < 0) continue;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    }
  }
  ctx.restore();
}

export function drawMotifOverlay(ctx: CanvasRenderingContext2D, state: MotifOverlayState): void {
  if (cellPx(state.camera) < 3) return;
  drawCopyOutlines(ctx, state);
  const motif = state.armedMotif && state.repeats.find((r) => r.id === state.armedMotif!.id);
  if (motif) drawStampGhost(ctx, state, motif);
}
