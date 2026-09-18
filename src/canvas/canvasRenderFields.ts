import type { useUiStore } from "../state/uiStore";
import type { RenderState } from "./renderer";

type UiState = ReturnType<typeof useUiStore.getState>;

/**
 * The uiStore fields the renderer reads, listed exactly once. CanvasView's
 * dirty-check subscription and its per-frame `render()` call both derive
 * from this single tuple (via `pickRenderUiFields`), so a field can no
 * longer be added to one and forgotten in the other - previously each was
 * hand-enumerated separately and had already drifted apart (`picker` aside,
 * which the renderer's `RenderState` calls `pickerTarget` - CanvasView
 * handles that rename explicitly where it calls render()).
 */
export const RENDER_UI_FIELDS = [
  "camera",
  "viewport",
  "hover",
  "insertHover",
  "insertAnimation",
  "picker",
  "selectedPlacementIds",
  "selectedEmptyCells",
  "tool",
  "selectHeld",
  "keyboardSelectionActive",
  "stitchHighlightColor",
  "stitchHighlightOpacity",
  "selectionBox",
  "selectionMove",
  "referenceImagePanelOpen",
  "referenceImageCalibrating",
  "referenceImageCalibrationBox",
  "referenceImageActiveMark",
  "referenceImageMarking",
  "referenceImageUnrecognized",
] as const satisfies readonly (keyof UiState)[];

export type RenderUiState = Pick<UiState, (typeof RENDER_UI_FIELDS)[number]>;

/**
 * Compile-time guard: every RenderState field sourced from uiStore (i.e.
 * everything except the docStore/cache/derived fields CanvasView assembles
 * in its frame loop, and `pickerTarget`'s rename of `picker`) must appear in
 * RENDER_UI_FIELDS, and vice versa. Add or remove one without the other and
 * this line stops type-checking.
 */
type RenderStateUiKeys = Exclude<
  keyof RenderState,
  | "index"
  | "revision"
  | "sprites"
  | "referenceImage"
  | "referenceImageCache"
  | "referenceImageMarks"
  | "pickerTarget"
  | "staticExport"
  | "numberScale"
>;
// "picker" is the one name-mismatch (RenderState calls it `pickerTarget`),
// so it's excluded here rather than from RENDER_UI_FIELDS itself, which
// still needs it for the dirty-check.
type RenderUiFieldNames = Exclude<(typeof RENDER_UI_FIELDS)[number], "picker">;
const _renderUiFieldsMatchRenderState: [RenderStateUiKeys] extends [RenderUiFieldNames]
  ? [RenderUiFieldNames] extends [RenderStateUiKeys]
    ? true
    : never
  : never = true;
void _renderUiFieldsMatchRenderState;

export function pickRenderUiFields(state: UiState): RenderUiState {
  const picked: Record<string, unknown> = {};
  for (const key of RENDER_UI_FIELDS) {
    picked[key] = state[key];
  }
  return picked as RenderUiState;
}
