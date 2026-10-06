import { forwardRef, type ButtonHTMLAttributes } from "react";
import { buttonClassName, type ButtonStyleProps } from "./buttonClassName";

export type ButtonProps = ButtonStyleProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> & {
    /** Toggle state, shown as the solid accent fill (`[data-on]`). */
    on?: boolean | undefined;
    /** Defaults to "button" - a bare <button> inside a form would submit it. */
    type?: "button" | "submit" | "reset";
  };

/** The app's standard text button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ variant, danger, size, className, on, type = "button", ...rest }, ref) => {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, danger, size, className })}
      data-on={on === undefined ? undefined : on}
      {...rest}
    />
  );
});

Button.displayName = "Button";

export type IconButtonProps = Omit<ButtonProps, "aria-label" | "title"> & {
  /** Accessible name - required, since the visible content is only an icon. */
  label: string;
  /** Hover tooltip; defaults to no tooltip rather than repeating `label`. */
  tooltip?: string | undefined;
};

/** A button whose only visible content is an icon, so it must carry a label. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({ label, tooltip, ...rest }, ref) => {
  return <Button ref={ref} aria-label={label} title={tooltip} {...rest} />;
});

IconButton.displayName = "IconButton";
