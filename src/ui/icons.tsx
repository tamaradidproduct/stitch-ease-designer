import type { SVGProps } from "react";

/**
 * Small shared inline-SVG icons reused across floating menus and panels.
 *
 * Sizing/stroke-weight is left to the caller (some sites set it inline,
 * others rely on a CSS rule targeting the button's own `svg` descendant) -
 * `undefined` props are simply omitted by React, so a caller that relies on
 * CSS for sizing keeps doing so unchanged.
 */

type IconProps = {
  width?: number | string;
  height?: number | string;
  strokeWidth?: number | string;
  /** Only needed by call sites that target the svg itself with a CSS class (e.g. SearchIcon's `.picker__searchIcon` site). */
  className?: string;
};

/** A checkmark, for "accept/apply all"/"confirm" actions. */
export function CheckIcon({ width, height, strokeWidth }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={width} height={height} aria-hidden="true">
      <path
        d="m4 10 3.5 3.5L16 5"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A large X, for "dismiss all"/"dismiss" actions. */
export function CrossIcon({ width, height, strokeWidth }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" width={width} height={height} aria-hidden="true">
      <path
        d="M4.5 4.5l11 11M15.5 4.5l-11 11"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A smaller close/remove X - a distinct shape from `CrossIcon` (different
 * viewBox and path, not just a scaled copy), used for the picker's close
 * button and the glossary's per-row remove action.
 */
export function CloseIcon({ width, height, strokeWidth }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width={width} height={height} aria-hidden="true">
      <path
        d="M3.5 3.5l9 9m0-9-9 9"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A magnifying glass, for "search" affordances - used by the glossary
 * panel's inline search box and both of the picker's search entry points
 * (the morphed search field and its trigger button), which used to each
 * inline their own identical copy.
 */
export function SearchIcon({ width, height, strokeWidth, className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 20 20" width={width} height={height} aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.25" fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="m12.4 12.4 4 4" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function DragHandleIcon({ width, height }: Pick<IconProps, "width" | "height">) {
  return (
    <svg viewBox="0 0 16 16" width={width} height={height} aria-hidden="true">
      <circle cx="5" cy="3.5" r="1" /><circle cx="11" cy="3.5" r="1" />
      <circle cx="5" cy="8" r="1" /><circle cx="11" cy="8" r="1" />
      <circle cx="5" cy="12.5" r="1" /><circle cx="11" cy="12.5" r="1" />
    </svg>
  );
}

/** A circle with a diagonal slash, for "stop drawing". */
export function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="m5 15 10-10" />
    </svg>
  );
}

/* ---- app icons -----------------------------------------------------------
   One component per glyph, markup unchanged from where it used to be
   inlined. Size and stroke mostly come from the caller's CSS (a
   `.thing svg` rule) or from props passed straight through to the <svg>. */

export type SvgIconProps = SVGProps<SVGSVGElement>;

/** Backspace key, for deleting the last digit. */
export function BackspaceIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m8 5-5 5 5 5h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H8Zm2.5 3 4 4m0-4-4 4" />
    </svg>
  );
}

/** Arrow up, for "bring in front of stitches" (20px grid). */
export function BringFrontIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 17V3m0 0-3 3m3-3 3 3" />
    </svg>
  );
}

/** Arrow up (16px grid). */
export function BringFrontSmallIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M8 13.5v-11m0 0-3 3m3-3 3 3" />
    </svg>
  );
}

/** Move a glossary row down. */
export function ChevronDownIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Move a glossary row up. */
export function ChevronUpIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M5 12l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** X, for clearing reference points. */
export function ClearMarksIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  );
}

/** Heavy checkmark, for the reference dock's save/apply. */
export function ConfirmIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m4 10 4 4 8-8" />
    </svg>
  );
}

/** Broken link, for detaching a motif copy. */
export function DetachIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M8 12l-2 2a2.8 2.8 0 0 1-4-4l2-2M12 8l2-2a2.8 2.8 0 0 1 4 4l-2 2M3 3l14 14" />
    </svg>
  );
}

/** Down chevron for a collapsible section; CSS rotates it via data-open. */
export function DisclosureIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Pencil, for the draw tool. */
export function DrawIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m4 14-.7 3 3-.7L15.5 7 13 4.5 4 14Z" />
      <path d="m11.5 6 2.5 2.5" />
    </svg>
  );
}

/** Two overlapping squares, for duplicate. */
export function DuplicateIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <path d="M7 13v2a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

/** Pencil (16px grid), for editing a reference image. */
export function EditIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5V10.5L10.5 2.5Z" />
    </svg>
  );
}

/** Eraser, for the erase tool. */
export function EraseIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m5 13 6.8-8a2 2 0 0 1 2.8-.2l.6.5a2 2 0 0 1 .2 2.8L8.7 16H5.8L4 14.5 5 13Z" />
      <path d="m8.5 9 4 3.4M9 16h7" />
    </svg>
  );
}

/** Visible (20px grid). */
export function EyeIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M2 10s2.7-5 8-5 8 5 8 5-2.7 5-8 5-8-5-8-5Z" />
      <circle cx="10" cy="10" r="2" />
    </svg>
  );
}

/** Hidden (20px grid). */
export function EyeOffIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M2 10s2.7-5 8-5c1.2 0 2.2.2 3.1.6M18 10s-2.7 5-8 5c-1.2 0-2.2-.2-3.1-.6" />
      <path d="m3 3 14 14" />
    </svg>
  );
}

/** Hidden (16px grid). */
export function EyeOffSmallIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M1.5 8s2.1-4 6.5-4c1 0 1.9.2 2.7.5M14.5 8s-2.1 4-6.5 4c-1 0-1.9-.2-2.7-.5" />
      <path d="m2.5 2.5 11 11" />
    </svg>
  );
}

/** Visible (16px grid). */
export function EyeSmallIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M1.5 8s2.1-4 6.5-4 6.5 4 6.5 4-2.1 4-6.5 4S1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.8" />
    </svg>
  );
}

/** Google "G" mark for the sign-in button. Brand colors are fixed by Google's guidelines. */
export function GoogleLogo(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.33-.17-1.96H10v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.32 2.99-7.27Z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.89 6.61-2.42l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.11H1.08v2.59A10 10 0 0 0 10 20Z"
      />
      <path
        fill="#FBBC05"
        d="M4.41 11.92a6 6 0 0 1 0-3.84V5.49H1.08a10 10 0 0 0 0 9.02l3.33-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M10 3.98c1.47 0 2.79.5 3.82 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0 10 10 0 0 0 1.08 5.49l3.33 2.59C5.2 5.72 7.4 3.98 10 3.98Z"
      />
    </svg>
  );
}

/** Arrows converging on a line, for the insert tool. */
export function InsertIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 3v14M4 10h4m4 0h4" />
      <path d="m6 7 3 3-3 3m8-6-3 3 3 3" />
    </svg>
  );
}

/** Square with a looping arrow, for "make motif". */
export function MakeMotifIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="9" height="9" rx="1.5" />
      <path d="M8 3h6a3 3 0 0 1 3 3v6m0 0-2.5-2.5M17 12l-2.5 2.5" />
    </svg>
  );
}

/** Two squares and a link, for marking reference points. */
export function MarkPointsIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M3 4.5h5v5H3zM12 10.5h5v5h-5z" />
      <path d="M8 7 12 11M6 11v5m-2.5-2.5h5" />
    </svg>
  );
}

/** Mirrored triangles, for mirroring a motif. */
export function MirrorIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 3v14M7 6 3 10l4 4V6zM13 6l4 4-4 4V6z" />
    </svg>
  );
}

/** Three horizontal dots, for "more actions" menus. */
export function MoreIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <circle cx="5" cy="10" r="1.4" fill="currentColor" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

/** Half-filled circle, for opacity. */
export function OpacityIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2v12" />
    </svg>
  );
}

/** Paint palette with paint dots, for the canvas stitch-color controls. */
export function PaletteDotsIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 3a7 7 0 1 0 0 14h1.2a1.6 1.6 0 0 0 0-3.2h-.5a1.2 1.2 0 0 1 0-2.4H13A4 4 0 0 0 17 7.5C17 5 14 3 10 3Z" />
      <circle cx="6.5" cy="8" r=".8" /><circle cx="9" cy="5.8" r=".8" /><circle cx="13" cy="6.8" r=".8" />
    </svg>
  );
}

/** Paint palette outline, the color-chip affordance. */
export function PaletteIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
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
    </svg>
  );
}

/** Four-way arrows, for the pan tool. */
export function PanIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 2v16M2 10h16" />
      <path d="M10 2 7.5 4.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5" />
    </svg>
  );
}

/** Plus, for adding another reference image. */
export function PlusIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M8 2.5v11M2.5 8h11" />
    </svg>
  );
}

/** Arrow up to a bar, for pushing a copy's edits to its motif. */
export function PushToMotifIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 16V5M5.5 9.5 10 5l4.5 4.5M4 3h12" />
    </svg>
  );
}

/** Small plus, for an empty quick slot. */
export function QuickAddIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path
        d="M10 5.5v9M5.5 10h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Curved arrow forward, for redo. */
export function RedoIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m12 5 4 4-4 4m4-4H9a5 5 0 0 0-5 5" />
    </svg>
  );
}

/** Pencil (20px grid), for renaming a motif. */
export function RenameIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M4 16h3l8.5-8.5-3-3L4 13v3zM11.5 5.5l3 3" />
    </svg>
  );
}

/** Opposing arrows, for "replace all". */
export function ReplaceAllIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M4 8.5h9.5M11 5.5l3 3-3 3M16 11.5H6.5M9 8.5l-3 3 3 3" />
    </svg>
  );
}

/** Circular arrows, for replacing an image. */
export function ReplaceImageIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M3.5 8a4.5 4.5 0 0 1 7.6-3.2M12.5 8a4.5 4.5 0 0 1-7.6 3.2" />
      <path d="M11.5 2.8v2.4h-2.4M4.5 13.2v-2.4h2.4" />
    </svg>
  );
}

/** Counter-clockwise arrow, for reset. */
export function ResetIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M4.5 8A6 6 0 1 1 4 11M4.5 3.5V8H9" />
    </svg>
  );
}

/** Pointer arrow, for the select tool. */
export function SelectIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m5 3 9 7-4.2 1.2L8 16 5 3Z" />
    </svg>
  );
}

/** Arrow down, for "send behind stitches" (20px grid). */
export function SendBehindIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M10 3v14m0 0-3-3m3 3 3-3" />
    </svg>
  );
}

/** Arrow down (16px grid). */
export function SendBehindSmallIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M8 2.5v11m0 0-3-3m3 3 3-3" />
    </svg>
  );
}

/** Magic wand, for Suggest mode. */
export function SuggestIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path
        d="M4 16 13 7m2.5-2.5L17 3M6 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Trash can with lid (16px grid), for removing an image. */
export function TrashIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M3 5h10M6.5 5V3.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1V5M4.5 5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8" />
    </svg>
  );
}

/** Compact trash can, for clearing a stitch or deleting a motif. */
export function TrashSmallIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <path d="M3.5 5h9M6.5 5V3.5h3V5M4.5 5l.5 8h6l.5-8" />
    </svg>
  );
}

/** Curved arrow back, for undo. */
export function UndoIcon(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="m8 5-4 4 4 4M4 9h7a5 5 0 0 1 5 5" />
    </svg>
  );
}
