import { CELL, type Camera, type Viewport } from "../canvas/camera";
import { ReferenceImageCache } from "../canvas/referenceImageCache";
import { render, type RenderState } from "../canvas/renderer";
import { SpriteCache } from "../canvas/spriteCache";
import { theme } from "../canvas/theme";
import { chartBounds } from "../model/chartBounds";
import { DocIndex } from "../model/docIndex";
import type { Placement } from "../model/types";
import { symbolsByCategory } from "../symbols/registry";
import type { StitchSymbol } from "../symbols/types";
import { downloadBlob, safeFilename } from "./download";

export type ImageFormat = "png" | "jpg";

/**
 * Overall resolution multiplier. Every pixel constant below is this many
 * times its original size, so the export is a uniform 3x blow-up of the
 * original layout - not just bigger cells with the same margins and legend
 * text, which would throw the proportions off. Driving the actual cell
 * pixel size (rather than, say, scaling the canvas transform after the fact)
 * also matters for the glyphs specifically: `SpriteCache` rasterises each
 * one to fit the cell size it's asked for, so asking for a 3x cell here
 * means a genuinely sharper glyph, not a blurrier upscale of the old one.
 */
const EXPORT_SCALE = 3;

/** Pixels per cell in the export - crisper than the app's own default CELL size, before scaling. */
const EXPORT_CELL_PX = 36 * EXPORT_SCALE;
/**
 * Uniform whitespace on every side of the chart. Generous enough that the
 * knitter-facing row/stitch numbers - which hang a few pixels outside a
 * group's own edge (see `drawGroupNumbering`) - never clip, even for a
 * group sitting right at the chart's outer boundary.
 */
const CHART_MARGIN = 40 * EXPORT_SCALE;

const LEGEND_PADDING = 24 * EXPORT_SCALE;
const LEGEND_HEADING_HEIGHT = 28 * EXPORT_SCALE;
const LEGEND_ROW_HEIGHT = 32 * EXPORT_SCALE;
const LEGEND_SWATCH = 24 * EXPORT_SCALE;
const LEGEND_COL_WIDTH = 200 * EXPORT_SCALE;
const LEGEND_SWATCH_STROKE = 1 * EXPORT_SCALE;
const LEGEND_TEXT_GAP = 8 * EXPORT_SCALE;
const LEGEND_HEADING_FONT = 13 * EXPORT_SCALE;
const LEGEND_ROW_FONT = 12 * EXPORT_SCALE;

/** Symbols actually used, in the picker's own category order. */
function usedSymbols(placements: Placement[]): StitchSymbol[] {
  const used = new Set(placements.map((p) => p.symbolId));
  return symbolsByCategory()
    .flatMap((group) => group.symbols)
    .filter((symbol) => used.has(symbol.id));
}

function legendHeight(symbolCount: number, legendCols: number): number {
  if (!symbolCount) return 0;
  const rows = Math.ceil(symbolCount / legendCols);
  return LEGEND_PADDING * 2 + LEGEND_HEADING_HEIGHT + rows * LEGEND_ROW_HEIGHT;
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  symbols: StitchSymbol[],
  sprites: SpriteCache,
  top: number,
  width: number,
  legendCols: number,
): void {
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, top, width, legendHeight(symbols.length, legendCols));

  ctx.fillStyle = theme.symbol;
  ctx.font = `bold ${LEGEND_HEADING_FONT}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Legend", LEGEND_PADDING, top + LEGEND_PADDING + LEGEND_HEADING_FONT);

  ctx.font = `${LEGEND_ROW_FONT}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  const rowsTop = top + LEGEND_PADDING + LEGEND_HEADING_HEIGHT;

  symbols.forEach((symbol, i) => {
    const col = i % legendCols;
    const row = Math.floor(i / legendCols);
    const x = LEGEND_PADDING + col * LEGEND_COL_WIDTH;
    const y = rowsTop + row * LEGEND_ROW_HEIGHT + LEGEND_ROW_HEIGHT / 2;

    ctx.fillStyle = theme.cellFill;
    ctx.fillRect(x, y - LEGEND_SWATCH / 2, LEGEND_SWATCH, LEGEND_SWATCH);
    ctx.strokeStyle = theme.cellStroke;
    ctx.lineWidth = LEGEND_SWATCH_STROKE;
    const inset = LEGEND_SWATCH_STROKE / 2;
    ctx.strokeRect(
      x + inset,
      y - LEGEND_SWATCH / 2 + inset,
      LEGEND_SWATCH - LEGEND_SWATCH_STROKE,
      LEGEND_SWATCH - LEGEND_SWATCH_STROKE,
    );
    if (symbol.hasGlyph) {
      const sprite = sprites.get(symbol, LEGEND_SWATCH, theme.symbol);
      if (sprite) ctx.drawImage(sprite, x, y - LEGEND_SWATCH / 2, LEGEND_SWATCH, LEGEND_SWATCH);
    }

    ctx.fillStyle = theme.symbol;
    ctx.fillText(symbol.label, x + LEGEND_SWATCH + LEGEND_TEXT_GAP, y);
  });
}

/**
 * Renders the chart (plus a legend of the symbols it uses) to an offscreen
 * canvas and downloads it as PNG or JPG.
 */
export async function exportChartImage(
  name: string,
  placements: Iterable<Placement>,
  format: ImageFormat,
): Promise<void> {
  const list = [...placements];
  const bounds = chartBounds(list);
  if (!bounds) throw new Error("Nothing to export — the chart is empty");
  const { minCol, maxCol, minRow, maxRow } = bounds;

  const cols = maxCol - minCol + 1;
  const rows = maxRow - minRow + 1;
  const symbols = usedSymbols(list);
  const minWidthForLegend = symbols.length ? LEGEND_PADDING * 2 + LEGEND_COL_WIDTH : 0;
  const chartWidth = Math.max(cols * EXPORT_CELL_PX + CHART_MARGIN * 2, minWidthForLegend);
  const chartHeight = rows * EXPORT_CELL_PX + CHART_MARGIN * 2;

  const legendCols = Math.max(1, Math.floor((chartWidth - LEGEND_PADDING * 2) / LEGEND_COL_WIDTH));
  const totalHeight = chartHeight + legendHeight(symbols.length, legendCols);

  const canvas = document.createElement("canvas");
  canvas.width = chartWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser");

  // Rasterising a glyph is async (see SpriteCache); `settle` resolves `ready`
  // once 100ms have passed with no new glyph finishing, so the final render
  // below waits for every glyph the export needs rather than drawing
  // whatever happened to be cached already. The hard cap guards against a
  // decode that never settles (SpriteCache gives up after a few failures,
  // but only stops calling back - it never rejects).
  let done = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let resolveReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    resolveReady = () => {
      if (done) return;
      done = true;
      if (settleTimer) clearTimeout(settleTimer);
      if (hardCap) clearTimeout(hardCap);
      resolve();
    };
  });
  const settle = () => {
    if (done) return;
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(resolveReady, 100);
  };
  const hardCap = setTimeout(resolveReady, 5000);

  const sprites = new SpriteCache(settle);

  const camera: Camera = {
    x: ((minCol + maxCol + 1) / 2) * CELL,
    y: ((minRow + maxRow + 1) / 2) * CELL,
    zoom: EXPORT_CELL_PX / CELL,
  };
  const viewport: Viewport = { width: chartWidth, height: chartHeight };

  const state: RenderState = {
    camera,
    viewport,
    hover: null,
    insertHover: null,
    insertAnimation: null,
    index: DocIndex.from(list),
    revision: 0,
    sprites,
    referenceImage: null,
    referenceImageUnrecognized: new Set(),
    referenceImageCache: new ReferenceImageCache(() => {}),
    referenceImagePanelOpen: false,
    referenceImageCalibrating: false,
    referenceImageCalibrationBox: null,
    referenceImageMarks: [],
    referenceImageActiveMark: null,
    referenceImageMarking: false,
    pickerTarget: null,
    selectedPlacementIds: [],
    tool: "stitch",
    selectHeld: false,
    keyboardSelectionActive: false,
    stitchHighlightColor: theme.symbol,
    stitchHighlightOpacity: 0,
    selectionBox: null,
    selectionMove: null,
    staticExport: true,
    numberScale: EXPORT_SCALE,
  };

  settle(); // baseline timer, in case nothing below ever misses the cache
  render(ctx, state); // triggers chart glyph loads
  for (const symbol of symbols) {
    if (symbol.hasGlyph) sprites.get(symbol, LEGEND_SWATCH, theme.symbol); // triggers legend glyph loads
  }

  await ready;

  render(ctx, state); // final draw, now that every glyph miss above has had a chance to load
  if (symbols.length) drawLegend(ctx, symbols, sprites, chartHeight, chartWidth, legendCols);

  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, mimeType, 0.92));
  if (!blob) throw new Error("Could not encode the exported image");
  downloadBlob(blob, safeFilename(name, format));
}
