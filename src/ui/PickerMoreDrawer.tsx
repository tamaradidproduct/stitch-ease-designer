import type { StitchSymbol } from "../symbols/types";
import { Button } from "./Button";
import { ColorChip } from "./ColorChip";
import { MotifDrawerSection } from "./motifUi";
import { Popover } from "./Popover";
import { cellSizeFor } from "./pickerLayout";
import { SymbolGlyph } from "./SymbolGlyph";

export type PickerMoreEntry = { key: string; symbol: StitchSymbol; colorId?: string };

/**
 * The stitch picker's "more" drawer: every other stitch already used in this
 * chart (each with its own color chip), then the chart's motifs.
 */
export function PickerMoreDrawer({
  entries,
  isCurrent,
  canColor,
  onChoose,
  onChipColor,
  onClose,
}: {
  entries: readonly PickerMoreEntry[];
  isCurrent: (entry: PickerMoreEntry) => boolean;
  /** False where coloring makes no sense (a single cell inside a cable). */
  canColor: boolean;
  onChoose: (symbol: StitchSymbol, colorId?: string) => void;
  onChipColor: (symbolId: string, colorId: string) => void;
  onClose: () => void;
}) {
  return (
    <Popover id="picker-more-stitches" className="picker__moreDrawer" aria-label="More stitches in this chart">
    {entries.length > 0 && <div className="picker__moreHeader">This chart</div>}
    <div className="picker__moreList" hidden={!entries.length}>
      {entries.map((entry) => (
        <div key={entry.key} className="picker__item">
          <Button variant="unstyled"
            className="picker__itemMain"
            data-colored={!!entry.colorId}
            onClick={() => onChoose(entry.symbol, entry.colorId)}
            title={entry.symbol.label}
          >
            <span className="picker__glyph">
              <SymbolGlyph symbol={entry.symbol} cell={cellSizeFor(entry.symbol)} colorId={entry.colorId} />
            </span>
            <span className="picker__label">{entry.symbol.label}</span>
            {isCurrent(entry) && <span className="picker__current">current</span>}
            {entry.symbol.span > 1 && <span className="picker__span">{entry.symbol.span} sts</span>}
          </Button>
          {!entry.colorId && canColor && (
            <ColorChip
              label={`Color ${entry.symbol.label}`}
              className="picker__itemColorChip"
              onSelect={(colorId) => onChipColor(entry.symbol.id, colorId)}
            />
          )}
        </div>
      ))}
    </div>
    <MotifDrawerSection onArmed={onClose} />
  </Popover>
  );
}
