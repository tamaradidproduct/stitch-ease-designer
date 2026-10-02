import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { ColorChip } from "./ColorChip";
import { CloseIcon, DragHandleIcon } from "./icons";
import { tapActivate } from "./tapActivate";
import { useDismissOnOutsideOrEscape } from "./useDismissOnOutsideOrEscape";

/** One entry in a glossary row's "more" menu. */
export type GlossaryRowMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Why a disabled item is disabled - shown as its tooltip and subtitle. */
  reason?: string;
};

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
  /** The row's name, e.g. "Knit" or "Motif 1". */
  label: string;
  /** The row's icon - a stitch glyph, or a motif glyph in the same cell box. */
  glyph: ReactNode;
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
  /** How many are on the chart, shown as a static "(n)" after the name. */
  count: number;
  /** Menu label for selecting every placed one, e.g. "Select all 12 copies". */
  selectAllLabel: string;
  onSelectAll: () => void;
  /** Stitch rows only: the add-only color chip. Omitted for motif rows. */
  onAddColoredVariant?: ((colorId: string) => void) | undefined;
  /**
   * Whether this entry can be removed right now. Only a removable row shows
   * the active remove button; every other row gets a "more" menu instead,
   * with the remove action disabled inside it and `removeBlockedReason` as
   * the explanation.
   */
  removable: boolean;
  removeBlockedReason?: string | undefined;
  onRemove: () => void;
  /** Row-kind-specific actions for the "more" menu (e.g. a motif's Stamp mirrored). */
  menuItems?: GlossaryRowMenuItem[] | undefined;
  /** When given, the "more" menu offers Rename, editing the name in place. */
  onRename?: ((name: string) => void) | undefined;
  /** 0-4 renders that numbered shortcut kbd; omitted always renders the spacer (overflow rows have no shortcut). */
  shortcutSlot?: number | undefined;
  /**
   * Issue #326's keyboard/touch-friendly reorder controls, alongside drag -
   * dragging stays available on both row kinds, this is the primary path.
   * Each row kind computes its own disabled bounds and target (the quick
   * row's own slot bounds vs. the overflow list's), so the caller builds the
   * whole descriptor rather than `GlossaryRow` reaching into row-kind state.
   */
  moveUp: { disabled: boolean; onClick: () => void; title: string };
  moveDown: { disabled: boolean; onClick: () => void; title: string };
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
 * whether a numbered shortcut shows, the drag handle's title, the
 * drop-target/hover signifier, and the move up/down buttons' bounds/target
 * (issue #326). Everything else (the glyph, label, "All (n)" select-all
 * button, the add-only color chip on a plain row, and the
 * disarm/remove/disabled-remove trailing slot) is identical and lives here
 * once.
 */
export function GlossaryRow({
  label,
  glyph,
  colorId,
  armed,
  armMode,
  onArm,
  onDisarm,
  disarmButton,
  count,
  selectAllLabel,
  onSelectAll,
  onAddColoredVariant,
  removable,
  removeBlockedReason,
  onRemove,
  menuItems = [],
  onRename,
  shortcutSlot,
  moveUp,
  moveDown,
  dragHandleTitle,
  onDragHandleStart,
  onDragHandleEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  dragIndicator,
}: GlossaryRowProps) {
  const shortcutNumber = shortcutSlot !== undefined ? shortcutSlot + 1 : null;
  const [renaming, setRenaming] = useState<string | null>(null);
  const commitRename = () => {
    if (renaming !== null) onRename?.(renaming);
    setRenaming(null);
  };
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
        aria-label={`Drag to reorder ${label}`}
        title={dragHandleTitle}
      >
        <DragHandleIcon />
      </button>
      <div className="glossary__moveGroup">
        <button
          type="button"
          className="glossary__move"
          disabled={moveUp.disabled}
          onClick={moveUp.onClick}
          aria-label={`Move ${label} up`}
          title={moveUp.title}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 12l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          type="button"
          className="glossary__move"
          disabled={moveDown.disabled}
          onClick={moveDown.onClick}
          aria-label={`Move ${label} down`}
          title={moveDown.title}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {shortcutNumber !== null ? (
        <kbd className="glossary__shortcut" aria-label={`Shortcut ${shortcutNumber}`}>
          {shortcutNumber}
        </kbd>
      ) : (
        <span className="glossary__shortcutSpacer" />
      )}
      {renaming !== null ? (
        <input
          className="glossary__rename"
          autoFocus
          value={renaming}
          aria-label={`Rename ${label}`}
          onChange={(e) => setRenaming(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setRenaming(null);
          }}
        />
      ) : (
      <div className="glossary__armWrap">
        {/* The glyph is its own tap target (same action as the label) so the
            add-colored-variant chip can sit on its corner, matching the
            picker's quick tiles - a chip can't nest inside the arm button. */}
        <span className="glossary__glyphWrap">
          <span className="glossary__glyph" aria-hidden="true" {...tapActivate(() => (armed ? onDisarm() : onArm()))}>
            {glyph}
          </span>
          {/* FR-34/Bug 8: every plain stitch row gets the add-only chip -
              never a colored row or a motif row. */}
          {onAddColoredVariant && !colorId && (
            <ColorChip
              mode="add-only"
              label={`Add a colored ${label}`}
              className="glossary__colorChip"
              onSelect={onAddColoredVariant}
            />
          )}
        </span>
        <button
          type="button"
          className="glossary__arm"
          {...tapActivate(() => (armed ? onDisarm() : onArm()))}
          title={`Draw with ${label} ${shortcutNumber !== null ? `(${shortcutNumber}) ` : ""}- tap again to stop drawing`}
        >
          <span className="glossary__label">{label}</span>
          <span className="glossary__countText">({count})</span>
        </button>
      </div>
      )}
      {armed ? (
        disarmButton
      ) : removable ? (
        <button
          type="button"
          className="glossary__remove"
          onClick={onRemove}
          aria-label={`Remove ${label} from glossary`}
          title="Remove from glossary"
        >
          <CloseIcon />
        </button>
      ) : (
        <GlossaryRowMenu
          label={label}
          items={[
            ...(count ? [{ label: selectAllLabel, onSelect: onSelectAll }] : []),
            ...(onRename ? [{ label: "Rename", onSelect: () => setRenaming(label) }] : []),
            ...menuItems,
            {
              label: "Remove from glossary",
              onSelect: onRemove,
              disabled: true,
              ...(removeBlockedReason ? { reason: removeBlockedReason } : {}),
            },
          ]}
        />
      )}
    </div>
  );
}

/**
 * The "more" menu replacing a row's remove button whenever that row can't be
 * removed. Positioned `fixed` from its button so the side panel's own
 * scrolling/clipping can't cut it off.
 */
function GlossaryRowMenu({ label, items }: { label: string; items: GlossaryRowMenuItem[] }) {
  const [open, setOpen] = useState<{ right: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useDismissOnOutsideOrEscape({ enabled: !!open, onDismiss: () => setOpen(null), containerRef: rootRef });
  return (
    <div ref={rootRef} className="glossary__menuRoot">
      <button
        ref={buttonRef}
        type="button"
        className="glossary__more"
        aria-label={`More actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={!!open}
        title="More actions"
        onClick={() => {
          if (open) return setOpen(null);
          const rect = buttonRef.current!.getBoundingClientRect();
          setOpen({ right: window.innerWidth - rect.right, top: rect.bottom + 4 });
        }}
      >
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <circle cx="5" cy="10" r="1.4" fill="currentColor" />
          <circle cx="10" cy="10" r="1.4" fill="currentColor" />
          <circle cx="15" cy="10" r="1.4" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="glossary__menu" role="menu" style={{ position: "fixed", right: open.right, top: open.top }}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.reason}
              onClick={() => {
                setOpen(null);
                item.onSelect();
              }}
            >
              <span>{item.label}</span>
              {item.disabled && item.reason && <small>{item.reason}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
