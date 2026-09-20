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
   * inconsistencies section) - both use the same palette glyph (reused from
   * the reference-image panel's "canvas stitch colors" button, so the icon
   * actually reads as color-related), and `mode` adds a small "+" badge only
   * for "add-only" so the two philosophies don't read as one affordance.
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
        <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
          <path
            d="M10 3a7 7 0 1 0 0 14h1.2a1.6 1.6 0 0 0 0-3.2h-.5a1.2 1.2 0 0 1 0-2.4H13A4 4 0 0 0 17 7.5C17 5 14 3 10 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <circle cx="6.5" cy="8" r="1" fill="currentColor" />
          <circle cx="9" cy="5.8" r="1" fill="currentColor" />
          <circle cx="13" cy="6.8" r="1" fill="currentColor" />
          {mode === "add-only" && (
            <>
              <circle cx="16" cy="16" r="4.5" fill="var(--bg)" stroke="currentColor" strokeWidth="1" />
              <path d="M16 14v4M14 16h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </>
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
