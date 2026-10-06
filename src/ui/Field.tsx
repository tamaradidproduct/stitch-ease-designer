import type { InputHTMLAttributes, ReactNode, Ref } from "react";

type NativeInput = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  className?: string | undefined;
  ref?: Ref<HTMLInputElement>;
};

export type TextFieldVariant = "default" | "inline" | "rename" | "unstyled";

export type TextFieldProps = NativeInput & {
  type?: "text" | "search" | "email";
  /**
   * - `default`: bordered field (forms, color names).
   * - `inline`: borderless until hovered or focused, for editing a title in place.
   * - `rename`: the accent-bordered box that replaces a row's label while renaming it.
   * - `unstyled`: no field chrome, for an input inside its own styled box (search bars).
   */
  variant?: TextFieldVariant;
};

/** The app's single-line text input. */
export function TextField({ variant = "default", type = "text", className, ...rest }: TextFieldProps) {
  const classes = [variant !== "unstyled" && "field", variant !== "default" && variant !== "unstyled" && `field--${variant}`, className]
    .filter(Boolean)
    .join(" ");
  return <input type={type} className={classes || undefined} {...rest} />;
}

/** A range input in the accent color. Lay it out with the surrounding label. */
export function Slider({ className, ...rest }: NativeInput) {
  return <input type="range" className={className ? `slider ${className}` : "slider"} {...rest} />;
}

export type CheckboxProps = NativeInput & {
  /** The visible label, clickable along with the box. */
  children: ReactNode;
  /** Class for the wrapping <label> (layout), separate from the input's. */
  labelClassName?: string | undefined;
  title?: string | undefined;
};

/** A checkbox with its label, in the accent color. */
export function Checkbox({ children, labelClassName, title, className, ...rest }: CheckboxProps) {
  return (
    <label className={labelClassName ? `checkbox ${labelClassName}` : "checkbox"} title={title}>
      <input type="checkbox" className={className} {...rest} />
      {children}
    </label>
  );
}
