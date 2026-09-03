import { getSymbol } from "../symbols/registry";
import addCursor from "./assets/cursors/add.png";
import blockedMoveCursor from "./assets/cursors/blocked-move.png";
import duplicateCursor from "./assets/cursors/duplicate.png";
import eraseCursor from "./assets/cursors/erase.svg";
import grabCursor from "./assets/cursors/grab.png";
import grabbingCursor from "./assets/cursors/grabbing.svg";
import insertAddCursor from "./assets/cursors/insert-add.png";
import insertBlockedCursor from "./assets/cursors/insert-blocked.png";

/** Cursor artwork exported from the Cursor states frame in Figma. */
const cursor = (url: string, x: number, y: number, fallback: string) =>
  `url("${url}") ${x} ${y}, ${fallback}`;

export const ADD_CURSOR = cursor(addCursor, 0, 0, "default");
export const ERASE_CURSOR = cursor(eraseCursor, 0, 0, "default");

export const GRAB_CURSOR = cursor(grabCursor, 12, 8, "grab");
export const GRABBING_CURSOR = cursor(grabbingCursor, 12, 8, "grabbing");
export const BLOCKED_MOVE_CURSOR = cursor(blockedMoveCursor, 12, 8, "not-allowed");
export const DUPLICATE_CURSOR = cursor(duplicateCursor, 12, 8, "copy");

export const INSERT_BLOCKED_CURSOR = cursor(insertBlockedCursor, 3, 0, "not-allowed");
export const INSERT_ADD_CURSOR = cursor(insertAddCursor, 3, 0, "default");

const armedCursorCache = new Map<string, string>();

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function symbolPreview(symbolId: string): { width: number; markup: string } | null {
  const symbol = getSymbol(symbolId);
  if (!symbol) return null;

  const width = Math.min(64, 18 * symbol.span);
  const cellWidth = width / symbol.span;
  const cells = Array.from({ length: symbol.span }, (_, index) => {
    const fill = symbol.cellFills?.[index] ?? "#f2f6fa";
    return `<rect x="${index * cellWidth}" width="${cellWidth}" height="18" fill="${fill}"/>`;
  }).join("");
  const glyph = symbol.hasGlyph
    ? `<image href="${svgDataUrl(symbol.glyph.replaceAll("currentColor", "#475569"))}" width="${width}" height="18"/>`
    : "";

  return {
    width,
    markup: `<g>${cells}<rect x="0.25" y="0.25" width="${width - 0.5}" height="17.5" fill="none" stroke="#b3bcc7" stroke-width="0.5"/>${glyph}</g>`,
  };
}

/** Figma's arrow cursor with the actual armed stitch rendered in its badge. */
export function armedStitchCursor(symbolId: string): string {
  const key = `draw:${symbolId}`;
  const cached = armedCursorCache.get(key);
  if (cached) return cached;

  const preview = symbolPreview(symbolId);
  if (!preview) return ADD_CURSOR;
  const width = Math.max(12, preview.width + 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="35" viewBox="0 0 ${width} 35" fill="none">
    <defs><filter id="s" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dy="1" stdDeviation="0.9" flood-opacity="0.65"/></filter></defs>
    <g filter="url(#s)">
      <g transform="translate(4 16.5)">${preview.markup}</g>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M0 16V0L11.6 11.6081H4.55353L4.40242 11.732L0 16Z" fill="#fff"/>
      <path fill-rule="evenodd" clip-rule="evenodd" d="M1 2.3V13.5L3.969 10.6309L4.129 10.4918L9.165 10.5L1 2.3Z" fill="#000"/>
    </g>
  </svg>`;
  const result = cursor(svgDataUrl(svg), 0, 0, "default");
  armedCursorCache.set(key, result);
  return result;
}

/** Figma's insertion cursor with the actual armed stitch below the line. */
export function insertStitchCursor(symbolId: string): string {
  const key = `insert:${symbolId}`;
  const cached = armedCursorCache.get(key);
  if (cached) return cached;

  const preview = symbolPreview(symbolId);
  if (!preview) return INSERT_ADD_CURSOR;
  const width = Math.max(23, preview.width + 5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="33" viewBox="0 0 ${width} 33" fill="none">
    <defs><filter id="s" x="-20%" y="-20%" width="150%" height="150%"><feDropShadow dy="1" stdDeviation="0.9" flood-opacity="0.65"/></filter></defs>
    <g filter="url(#s)">
      <path d="M3 0L6.594 3.594L4 6.188V13L6.594 15.594L3 19.188L-0.594 15.594L2 13V6.188L-0.594 3.594L3 0Z" fill="#0284c7" stroke="#fff"/>
      <g transform="translate(5 15)">${preview.markup}</g>
    </g>
  </svg>`;
  const result = cursor(svgDataUrl(svg), 3, 0, "default");
  armedCursorCache.set(key, result);
  return result;
}
