import type { ButtonHTMLAttributes, Ref } from "react";
import { buttonClassName, type ButtonStyleProps } from "./buttonClassName";

export type ButtonProps = ButtonStyleProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> & {
    /** Toggle state, shown as the solid accent fill (`[data-on]`). */
    on?: boolean | undefined;
    /** Defaults to "button" - a bare <button> inside a form would submit it. */
    type?: "button" | "submit" | "reset";
    ref?: Ref<HTMLButtonElement>;
  };

/** The app's standard text button. */
export function Button({ variant, danger, size, className, on, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, danger, size, className }) || undefined}
      data-on={on === undefined ? undefined : on}
      {...rest}
    />
  );
}

export type IconButtonProps = Omit<ButtonProps, "aria-label" | "title"> & {
  /** Accessible name - required, since the visible content is only an icon. */
  label: string;
  /** Hover tooltip; defaults to no tooltip rather than repeating `label`. */
  tooltip?: string | undefined;
};

/** A button whose only visible content is an icon, so it must carry a label. */
export function IconButton({ label, tooltip, ...rest }: IconButtonProps) {
  return <Button aria-label={label} title={tooltip} {...rest} />;
}
