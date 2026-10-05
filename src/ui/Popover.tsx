import type { HTMLAttributes, Ref } from "react";

export type PopoverProps = HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> };

/**
 * The shared floating surface for popovers, menus and drawers: background,
 * hairline border, radius and elevation (.popover in styles/popover.css).
 * Positioning, layer, padding, role and dismissal stay with the caller,
 * since every overlay anchors and closes differently. Dismissal goes through
 * useDismissOnOutsideOrEscape.
 */
export function Popover({ className, ...rest }: PopoverProps) {
  return <div className={className ? `popover ${className}` : "popover"} {...rest} />;
}
