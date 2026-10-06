import { forwardRef, type HTMLAttributes } from "react";

export type PopoverProps = HTMLAttributes<HTMLDivElement>;

/**
 * The shared floating surface for popovers, menus and drawers: background,
 * hairline border, radius and elevation (.popover in styles/popover.css).
 * Positioning, layer, padding, role and dismissal stay with the caller,
 * since every overlay anchors and closes differently. Dismissal goes through
 * useDismissOnOutsideOrEscape.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(({ className, ...rest }, ref) => {
  return <div ref={ref} className={className ? `popover ${className}` : "popover"} {...rest} />;
});

Popover.displayName = "Popover";
