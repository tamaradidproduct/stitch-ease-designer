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
export const STRAIGHT_DRAW_CURSOR = cursor(
  svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path d="M2 14h24M14 2v24" stroke="#0284c7" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="14" cy="14" r="3" fill="white" stroke="#0284c7" stroke-width="1.5"/>
  </svg>`),
  14,
  14,
  "crosshair",
);

export const GRAB_CURSOR = cursor(grabCursor, 12, 8, "grab");
export const GRABBING_CURSOR = cursor(grabbingCursor, 12, 8, "grabbing");
export const BLOCKED_MOVE_CURSOR = cursor(blockedMoveCursor, 12, 8, "not-allowed");
export const DUPLICATE_CURSOR = cursor(duplicateCursor, 12, 8, "copy");

export const INSERT_BLOCKED_CURSOR = cursor(insertBlockedCursor, 3, 0, "not-allowed");
export const INSERT_ADD_CURSOR = cursor(insertAddCursor, 3, 0, "default");

/**
 * Shown while Cmd/Ctrl hovers a pending suggestion - confirming it is what
 * that click will do here, which is not what Cmd/Ctrl does anywhere else on
 * the canvas (temporary Select). Reuses the app's own arrow rather than the
 * OS pointer so it still reads as "this is a Stitch Ease cursor," with a
 * green check badge - a colour and mark used nowhere else in this cursor
 * set - so it can't be mistaken for the plain arrow Cmd/Ctrl shows on
 * everything that isn't a suggestion.
 */
export const CONFIRM_SUGGESTION_CURSOR = cursor(
  svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M0 16V0L11.6 11.6081H4.55353L4.40242 11.732L0 16Z" fill="#fff"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M1 2.3V13.5L3.969 10.6309L4.129 10.4918L9.165 10.5L1 2.3Z" fill="#000"/>
    <circle cx="17.5" cy="15.5" r="6.5" fill="#16a34a" stroke="#fff" stroke-width="1.5"/>
    <path d="M14.6 15.6l1.8 1.8 3.4-3.8" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`),
  0,
  0,
  "default",
);

/**
 * Shown while Alt hovers a pending suggestion - dismissing it is what that
 * click will do. Same arrow and badge position as the confirm cursor, so
 * the two read as a matched pair, with a red badge and a cross rather than
 * a green one and a check.
 */
export const DISMISS_SUGGESTION_CURSOR = cursor(
  svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path fill-rule="evenodd" clip-rule="evenodd" d="M0 16V0L11.6 11.6081H4.55353L4.40242 11.732L0 16Z" fill="#fff"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M1 2.3V13.5L3.969 10.6309L4.129 10.4918L9.165 10.5L1 2.3Z" fill="#000"/>
    <circle cx="17.5" cy="15.5" r="6.5" fill="#dc2626" stroke="#fff" stroke-width="1.5"/>
    <path d="M15.2 13.2l4.6 4.6m0-4.6-4.6 4.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>
  </svg>`),
  0,
  0,
  "default",
);

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
