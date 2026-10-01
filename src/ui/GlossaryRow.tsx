import type { DragEvent, ReactNode } from "react";
import type { StitchSymbol } from "../symbols/types";
import { SymbolGlyph } from "./SymbolGlyph";
import { ColorChip } from "./ColorChip";
import { CloseIcon, DragHandleIcon } from "./icons";
import { tapActivate } from "./tapActivate";
import { glyphCellSize } from "./glyphSize";

export type GlossaryRowArmMode = "arm-only" | "arm-and-promote";

/**
 * The hover/insert-while-dragging signifier differs by row kind (issue
 * #323): a slotted row shows which edge a drop would insert on either side
 * of (#271), an overflow row just highlights as a drop target. Each row
 * kind's own drop-target handlers (passed separately, since the slotted and
 * overflow drop behaviors genuinely differ - see `useQuickSlotDropTarget`'s
 * own doc comment) decide which of these applies; `GlossaryRow` only
 * renders whichever one it's given.
 */
export type GlossaryRowDragIndicator =
  | { kind: "insert-edge"; edge: "before" | "after" | null }
  | { kind: "drag-over"; active: boolean };

export type GlossaryRowProps = {
  symbol: StitchSymbol;
  colorId?: string | null | undefined;
  /** Already combined with `tool === "stitch"` by the caller. */
  armed: boolean;
  /**
   * Which semantics `onArm` performs - a legible, testable label for the
   * caller's choice (issue #323's "arming unification"), not a second source
   * of truth: `GlossaryRow` never branches on it, the actual behavior lives
   * entirely in the `onArm` callback the caller supplies. A slotted row's
   * item is already in a quick slot, so arming it needs no promotion
   * ("arm-only"); an overflow row's isn't, so choosing it also promotes it
   * into a free quick slot ("arm-and-promote"). Surfaced as `data-arm-mode`
   * so a test (or a curious dev) can see which mode a given row is wired to
   * without reaching into its props.
   */
  armMode: GlossaryRowArmMode;
  onArm: () => void;
  /** Always the same action regardless of row kind: stop drawing. */
  onDisarm: () => void;
  /** The shared "stop drawing" button, built once by the caller and reused across every armed row (same action everywhere, see RightPanel's `disarmButton`). */
  disarmButton: ReactNode;
  count: number;
  onSelectAll: () => void;
  onAddColoredVariant: (colorId: string) => void;
  /** Whether this entry can be removed from the glossary right now (nothing of it placed on the chart). */
  removable: boolean;
  onRemove: () => void;
  /** 0-4 renders that numbered shortcut kbd; omitted always renders the spacer (overflow rows have no shortcut). */
  shortcutSlot?: number | undefined;
  dragHandleTitle: string;
  onDragHandleStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragHandleEnd: () => void;
  onRowDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onRowDragLeave: () => void;
  onRowDrop: (event: DragEvent<HTMLDivElement>) => void;
  dragIndicator: GlossaryRowDragIndicator;
};

/**
 * One glossary/quick-row entry (issue #323): unifies what used to be two
 * ~90-line near-identical copies - a slotted quick-row row and an overflow
 * glossary row - that differed in a few deliberate ways (see each prop's own
 * doc comment above): whether arming promotes the item into a quick slot,
 * whether a numbered shortcut shows, the drag handle's title, and the
 * drop-target/hover signifier. Everything else (the glyph, label, "All (n)"
 * select-all button, the add-only color chip on a plain row, and the
 * disarm/remove/spacer trailing slot) is identical and lives here once.
 */
export function GlossaryRow({
  symbol,
  colorId,
  armed,
  armMode,
  onArm,
  onDisarm,
  disarmButton,
  count,
  onSelectAll,
  onAddColoredVariant,
  removable,
  onRemove,
  shortcutSlot,
  dragHandleTitle,
  onDragHandleStart,
  onDragHandleEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  dragIndicator,
}: GlossaryRowProps) {
  const selectAllLabel = `Select all ${count} placed ${symbol.label} stitches`;
  const hasShortcut = shortcutSlot !== undefined;
  return (
    <div
      className="glossary__item"
      data-on={armed}
      data-arm-mode={armMode}
      {...(dragIndicator.kind === "insert-edge"
        ? { "data-insert-edge": dragIndicator.edge ?? undefined }
        : { "data-drag-over": dragIndicator.active })}
      onDragOver={onRowDragOver}
      onDragLeave={onRowDragLeave}
      onDrop={onRowDrop}
    >
      <button
        type="button"
        draggable
        className="glossary__dragHandle"
        onDragStart={onDragHandleStart}
        onDragEnd={onDragHandleEnd}
        aria-label={`Drag to reorder ${symbol.label}`}
        title={dragHandleTitle}
      >
        <DragHandleIcon />
      </button>
      {hasShortcut ? (
        <kbd className="glossary__shortcut" aria-label={`Shortcut ${shortcutSlot! + 1}`}>
          {shortcutSlot! + 1}
        </kbd>
      ) : (
        <span className="glossary__shortcutSpacer" />
      )}
      <button
        type="button"
        className="glossary__arm"
        {...tapActivate(() => (armed ? onDisarm() : onArm()))}
        title={`Draw with ${symbol.label} ${hasShortcut ? `(${shortcutSlot! + 1}) ` : ""}- tap again to stop drawing`}
      >
        <span className="glossary__glyph">
          <SymbolGlyph symbol={symbol} cell={glyphCellSize(symbol.span, 54, 20)} colorId={colorId} />
        </span>
        <span className="glossary__label">{symbol.label}</span>
      </button>
      <button
        type="button"
        className="glossary__count glossary__selectEntry"
        disabled={!count}
        onClick={onSelectAll}
        aria-label={selectAllLabel}
        title={selectAllLabel}
      >
        All ({count})
      </button>
      {/* FR-34/Bug 8: the add-only chip belongs on every plain row, slotted
          or not - a colored row never gets it. */}
      {!colorId && (
        <ColorChip
          mode="add-only"
          label={`Add a colored ${symbol.label}`}
          className="glossary__colorChip"
          onSelect={onAddColoredVariant}
        />
      )}
      {armed ? (
        disarmButton
      ) : removable ? (
        <button
          type="button"
          className="glossary__remove"
          onClick={onRemove}
          aria-label={`Remove ${symbol.label} from glossary`}
          title="Remove from glossary"
        >
          <CloseIcon />
        </button>
      ) : (
        <span className="glossary__removeSlot" aria-hidden="true" />
      )}
    </div>
  );
}
