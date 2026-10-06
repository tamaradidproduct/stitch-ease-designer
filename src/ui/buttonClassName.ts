/**
 * `unstyled` drops the shared `.btn` look entirely and keeps only the
 * caller's own block class - for buttons whose look belongs to their
 * component (tool dock, quick slots, glossary row actions) but should still
 * go through Button for type="button", toggle state and labelling.
 */
export type ButtonVariant = "default" | "primary" | "quiet" | "unstyled";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonStyleProps = {
  variant?: ButtonVariant | undefined;
  /** Destructive: hover turns the button red. Combines with any variant. */
  danger?: boolean | undefined;
  /** Pins the button to a control height; omit to size by padding. */
  size?: ButtonSize | undefined;
  className?: string | undefined;
};

/**
 * The `.btn` class list for a variant/size. Exported for the odd non-button
 * element that should look like one (e.g. a router `<Link>`).
 */
export function buttonClassName({ variant = "default", danger, size, className }: ButtonStyleProps = {}): string {
  if (variant === "unstyled") return className ?? "";
  return [
    "btn",
    variant !== "default" && `btn--${variant}`,
    danger && "btn--danger",
    size && `btn--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
