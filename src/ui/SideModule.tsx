import type { ReactNode, Ref } from "react";
import { Button } from "./Button";
import { DisclosureIcon } from "./icons";

export type SideModuleProps = {
  title: string;
  subtitle: ReactNode;
  children?: ReactNode;
  /** Shown at the right of the header (non-collapsible modules only). */
  actions?: ReactNode;
  /** Makes the header a disclosure button; `open` controls the body. */
  collapsible?: { open: boolean; onToggle: () => void };
  className?: string | undefined;
  headerClassName?: string | undefined;
  bodyClassName?: string | undefined;
  ref?: Ref<HTMLElement>;
  /** Extra attributes for the section element (e.g. data-editing). */
  sectionProps?: Record<`data-${string}`, string | boolean | undefined>;
};

/**
 * One card in the editor's right panel (glossary, reference image, export,
 * help, navigator): a header with title and subtitle, optionally a
 * disclosure toggle, and a body.
 */
export function SideModule({
  title,
  subtitle,
  children,
  actions,
  collapsible,
  className,
  headerClassName,
  bodyClassName,
  ref,
  sectionProps,
}: SideModuleProps) {
  const heading = (
    <div>
      <h2>{title}</h2>
      <span>{subtitle}</span>
    </div>
  );
  const showBody = children !== undefined && (!collapsible || collapsible.open);
  return (
    <section ref={ref} className={className ? `sideModule ${className}` : "sideModule"} {...sectionProps}>
      {collapsible ? (
        <Button
          variant="unstyled"
          className={["sideModule__header sideModule__toggle", headerClassName].filter(Boolean).join(" ")}
          onClick={collapsible.onToggle}
          aria-expanded={collapsible.open}
        >
          {heading}
          <DisclosureIcon width="14" height="14" data-open={collapsible.open} />
        </Button>
      ) : (
        <div className={["sideModule__header", headerClassName].filter(Boolean).join(" ")}>
          {heading}
          {actions}
        </div>
      )}
      {showBody && <div className={["sideModule__body", bodyClassName].filter(Boolean).join(" ")}>{children}</div>}
    </section>
  );
}
