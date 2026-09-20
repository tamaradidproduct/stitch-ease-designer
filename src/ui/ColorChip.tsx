import { useRef, useState } from "react";
import { ColorSwatchPopover } from "./ColorSwatchPopover";

export type ColorChipProps = {
  /**
   * `"recolor"` is the armed quick-slot tile's own chip - restrictive,
   * FR-25/DNT-11: only ever acts on the current selection. `"add-only"` is
   * the picker drawer's and glossary panel's chip - permissive, FR-34: every
   * plain row gets one, and picking a color there only ever mints a new
   * pen, never touches anything already on the chart. Both chips look
   * similar but work oppositely on purpose (see the colorwork spec's UX
   * inconsistencies section) - `mode` picks a visibly distinct icon (a
   * diagonal line for "this pen's own color" vs. a "+" for "add a new
   * colored variant") so the two philosophies don't read as one affordance.
   */
  mode: "recolor" | "add-only";
  onSelect: (colorId: string) => void;
  label: string;
  className?: string;
};

export function ColorChip({ mode, onSelect, label, className }: ColorChipProps) {
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const openPopover = () => {
    setAnchorRect(buttonRef.current?.getBoundingClientRect() ?? null);
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`colorChip colorChip--${mode}${className ? ` ${className}` : ""}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openPopover();
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.3" />
          {mode === "recolor" ? (
            <path d="M4.2 11.8 11.8 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          ) : (
            <path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          )}
        </svg>
      </button>
      {open && anchorRect && (
        <ColorSwatchPopover
          anchorRect={anchorRect}
          onSelect={(colorId) => {
            setOpen(false);
            onSelect(colorId);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
