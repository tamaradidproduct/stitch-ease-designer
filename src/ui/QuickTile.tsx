import type { StitchSymbol } from "../symbols/types";
import { SymbolGlyph } from "./SymbolGlyph";
import { ColorChip } from "./ColorChip";
import { glyphCellSize } from "./glyphSize";
import { Button } from "./Button";

export type QuickTileEntry = {
  key: string;
  symbol: StitchSymbol;
  colorId?: string;
  disabled?: boolean;
};

export type QuickTileProps = {
  entry: QuickTileEntry;
  /** Whether this tile is the picker's current slot - drives the active highlight, the "current" tag, and whether the color chip shows. */
  active: boolean;
  /** False where coloring makes no sense (a single cell inside a cable). Defaults to true. */
  canColor?: boolean;
  onChoose: (symbol: StitchSymbol, colorId?: string) => void;
  /** Only ever invoked while `active` (see `active`'s own doc comment). */
  onChooseColor: (colorId: string) => void;
  getPopoverBoundaryRect: () => DOMRect | null;
};

/**
 * One quick-row tile in the stitch picker (issue #323): the five fixed
 * quick-slot tiles and the dynamic 6th tile (FR-30, shown only when the
 * current selection isn't already one of the five) rendered identical
 * markup, including the `ColorChip`. The dynamic tile's `ColorChip`
 * guard used to be `!dynamicSlot.colorId && currentSlot` (no key match) vs
 * the quick-slot tile's `!entry.colorId && currentSlot?.key === entry.key`;
 * they're equivalent in practice - the dynamic tile only ever exists when it
 * *is* the current slot (see `StitchPicker.tsx`'s `dynamicSlot` memo, built
 * directly off `currentSlot.key`) - so this standardizes on the key-matching
 * form (`active`) for both, per the issue's note to confirm before
 * committing to it.
 */
export function QuickTile({ entry, active, canColor = true, onChoose, onChooseColor, getPopoverBoundaryRect }: QuickTileProps) {
  const title = entry.disabled ? `${entry.symbol.label} does not fit this selection` : entry.symbol.label;
  return (
    <div className="picker__quickTile">
      <Button variant="unstyled"
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
      </Button>
      {/* FR-25: a colored slot's color is fixed - no chip. Only the current, uncolored slot gets one. */}
      {!entry.colorId && active && canColor && (
        <ColorChip
          label={`Color ${entry.symbol.label}`}
          className="picker__quickColorChip"
          popoverPlacement="above-first"
          getPopoverBoundaryRect={getPopoverBoundaryRect}
          onSelect={onChooseColor}
        />
      )}
    </div>
  );
}
