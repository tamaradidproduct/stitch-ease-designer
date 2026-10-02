import type { StitchSymbol } from "../symbols/types";
import { SymbolGlyph } from "./SymbolGlyph";
import { ColorChip } from "./ColorChip";
import { glyphCellSize } from "./glyphSize";

export type QuickTileEntry = {
  key: string;
  symbol: StitchSymbol;
  colorId?: string;
  disabled?: boolean;
};

export type QuickTileProps = {
  entry: QuickTileEntry;
  /** Whether this tile is the picker's current slot - drives both the active highlight and whether the recolor chip shows. */
  active: boolean;
  onChoose: (symbol: StitchSymbol, colorId?: string) => void;
  /** Only ever invoked while `active` (see `active`'s own doc comment), so it's safe for the caller to bind it against a definitely-current slot. */
  onRecolor: (colorId: string) => void;
  getPopoverBoundaryRect: () => DOMRect | null;
};

/**
 * One quick-row tile in the stitch picker (issue #323): the five fixed
 * quick-slot tiles and the dynamic 6th tile (FR-30, shown only when the
 * current selection isn't already one of the five) rendered identical
 * markup, including the recolor `ColorChip`. The dynamic tile's `ColorChip`
 * guard used to be `!dynamicSlot.colorId && currentSlot` (no key match) vs
 * the quick-slot tile's `!entry.colorId && currentSlot?.key === entry.key`;
 * they're equivalent in practice - the dynamic tile only ever exists when it
 * *is* the current slot (see `StitchPicker.tsx`'s `dynamicSlot` memo, built
 * directly off `currentSlot.key`) - so this standardizes on the key-matching
 * form (`active`) for both, per the issue's note to confirm before
 * committing to it.
 */
export function QuickTile({ entry, active, onChoose, onRecolor, getPopoverBoundaryRect }: QuickTileProps) {
  const title = entry.disabled ? `${entry.symbol.label} does not fit this selection` : entry.symbol.label;
  return (
    <div className="picker__quickTile">
      <button
        type="button"
        className="picker__quickButton"
        data-colored={!!entry.colorId}
        data-active={active}
        disabled={entry.disabled}
        onClick={() => onChoose(entry.symbol, entry.colorId)}
        title={title}
        aria-label={title}
        data-label={entry.symbol.label}
      >
        <SymbolGlyph symbol={entry.symbol} cell={glyphCellSize(entry.symbol.span, 58, 22)} colorId={entry.colorId} />
      </button>
      {/* FR-25: a colored slot's color is fixed - no chip. Only the current, uncolored slot gets one. */}
      {!entry.colorId && active && (
        <ColorChip
          mode="recolor"
          label={`Color ${entry.symbol.label}`}
          className="picker__quickColorChip"
          popoverPlacement="above-first"
          getPopoverBoundaryRect={getPopoverBoundaryRect}
          onSelect={onRecolor}
        />
      )}
    </div>
  );
}
