import { quickSlotKey } from "../model/quickSlots";
import { useDocStore } from "../state/docStore";
import { SUGGEST_SYMBOL_ID, useUiStore, type PickerTarget } from "../state/uiStore";
import type { Placement } from "../model/types";

/**
 * FR-25's `currentSlotKey` identity: one value every consumer (chip
 * visibility, recolor effect, tile highlight) must read, rather than each
 * independently reading `armedSymbolId`/`activeColor` - that independent
 * reading is the exact bug DNT-11 describes.
 *
 * The color chip lives on whichever tile is *currently selected* - a direct
 * click, or a homogeneous multi-selection (FR-33) - or, only when there's
 * nothing to look up yet (a fresh pen with nothing under the cursor), the
 * armed pen itself. A mixed multi-selection (more than one distinct combo)
 * has no current slot at all.
 *
 * FR-40: a homogeneous selection only counts as "currently selected" when
 * it accounts for every confirmed placement of that (symbol, color) combo on
 * the whole chart - not just within the selection. Leaving one matching
 * stitch unselected elsewhere on the canvas hides the chip, since coloring
 * it would otherwise silently leave that other stitch a mismatched outlier.
 */
export type CurrentSlot = {
  key: string;
  symbolId: string;
  colorId?: string;
  /** The placements this slot currently resolves to, if any - empty for a bare armed-pen target. */
  placementIds: string[];
};

/** Derives the picker's current slot from its target, or null (mixed selection / nothing armed). */
export function currentSlotForPicker(
  target: PickerTarget | null,
  placementsById: (id: string) => Placement | undefined,
  armedSymbolId: string | null,
  activeColor: string | null,
  allPlacements: readonly Placement[],
): CurrentSlot | null {
  if (target?.selectionIds?.length) {
    const placements = target.selectionIds.flatMap((id) => {
      const p = placementsById(id);
      return p ? [p] : [];
    });
    if (!placements.length) return null;
    const first = placements[0]!;
    const sameCombo = (p: Placement) =>
      p.symbolId === first.symbolId && (p.colorId ?? null) === (first.colorId ?? null);
    const homogeneous = placements.every(sameCombo);
    if (!homogeneous) return null;
    // FR-40: every other confirmed placement sharing this combo must
    // already be part of the selection.
    const selectedIds = new Set(target.selectionIds);
    const missesAnInstance = allPlacements.some(
      (p) => !p.suggested && sameCombo(p) && !selectedIds.has(p.id),
    );
    if (missesAnInstance) return null;
    return {
      key: quickSlotKey(first.symbolId, first.colorId),
      symbolId: first.symbolId,
      ...(first.colorId ? { colorId: first.colorId } : {}),
      placementIds: target.selectionIds,
    };
  }
  if (target?.currentSymbolId) {
    return {
      key: quickSlotKey(target.currentSymbolId, target.currentColorId),
      symbolId: target.currentSymbolId,
      ...(target.currentColorId ? { colorId: target.currentColorId } : {}),
      placementIds: [],
    };
  }
  // Nothing to look up yet - fall back to the armed pen itself.
  if (armedSymbolId) {
    return {
      key: quickSlotKey(armedSymbolId, activeColor ?? undefined),
      symbolId: armedSymbolId,
      ...(activeColor ? { colorId: activeColor } : {}),
      placementIds: [],
    };
  }
  return null;
}

/**
 * Applies `colorId` to `slot` (FR-27): recolors the placement(s) if there
 * are any, recolors its quick slot (DNT-12's rename-vs-mint check), and
 * normally arms the result. When Suggest is already armed, it stays armed so
 * a color correction during a review pass does not interrupt that pass. The
 * caller does the closing - this only performs the state change).
 */
export function applyColorToSlot(slot: CurrentSlot, colorId: string): void {
  const doc = useDocStore.getState();
  const ui = useUiStore.getState();
  const newKey = quickSlotKey(slot.symbolId, colorId);
  if (slot.key !== newKey) {
    doc.recolorQuickSlot(slot.key, newKey, slot.placementIds);
  }
  if (slot.placementIds.length) {
    doc.recolorPlacements(slot.placementIds, colorId);
  }
  if (ui.armedSymbolId !== SUGGEST_SYMBOL_ID) {
    ui.setArmedSymbolId(slot.symbolId, colorId);
  }
}

/**
 * FR-34's add-only path: arms a brand-new (symbolId, colorId) pen and gives
 * it a quick slot, without touching anything already on the chart. Used
 * from the picker's "more stitches" drawer and the glossary panel's plain
 * rows.
 */
export function addColoredVariant(symbolId: string, colorId: string): void {
  useUiStore.getState().chooseSymbol(symbolId, undefined, undefined, colorId);
}
