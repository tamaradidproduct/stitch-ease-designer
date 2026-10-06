import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { Button } from "./Button";

export type SegmentedOption<T extends string> = {
  value: T;
  /** Visible content; omit for a purely visual option (then give `label`). */
  children?: ReactNode;
  /** Accessible name and tooltip, required when `children` isn't text. */
  label?: string;
};

export type SegmentedControlProps<T extends string> = {
  /** Accessible name of the whole group. */
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  className?: string | undefined;
  /**
   * `"custom"` keeps the radio behaviour but leaves the look to `className`
   * (e.g. the pattern settings corner picker's 2×2 grid of squares).
   */
  appearance?: "segmented" | "custom";
};

/**
 * A single-choice row of options (role="radiogroup"). Arrow keys move the
 * choice, and only the chosen option is in the tab order, like a native
 * radio group.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  appearance = "segmented",
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement | null>(null);
  const current = Math.max(0, options.findIndex((o) => o.value === value));

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (current + step + options.length) % options.length;
    onChange(options[next]!.value);
    groupRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  const classes = [appearance === "segmented" && "segmented", className].filter(Boolean).join(" ");
  return (
    <div ref={groupRef} className={classes || undefined} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option, i) => {
        const checked = option.value === value;
        return (
          <Button
            key={option.value}
            variant="unstyled"
            className={appearance === "segmented" ? "segmented__item" : undefined}
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            tabIndex={i === current ? 0 : -1}
            on={checked}
            onClick={() => onChange(option.value)}
          >
            {option.children}
          </Button>
        );
      })}
    </div>
  );
}
