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

export function DragHandleIcon({ width, height }: Pick<IconProps, "width" | "height">) {
  return (
    <svg viewBox="0 0 16 16" width={width} height={height} aria-hidden="true">
      <circle cx="5" cy="3.5" r="1" /><circle cx="11" cy="3.5" r="1" />
      <circle cx="5" cy="8" r="1" /><circle cx="11" cy="8" r="1" />
      <circle cx="5" cy="12.5" r="1" /><circle cx="11" cy="12.5" r="1" />
    </svg>
  );
}
