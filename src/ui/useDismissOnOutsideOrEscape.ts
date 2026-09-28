import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * The "is this pointerdown one that should dismiss the panel" decision,
 * pulled out as its own pure function so the two things that vary most
 * dangerously between call sites - the inside/outside check and a
 * per-site exception like "ignore clicks on the canvas" - can be exercised
 * directly in a test, without spinning up real DOM listeners.
 *
 * `container` only needs a `contains` method (a real `Element` satisfies
 * this) so a test can pass a plain stand-in instead of a DOM node.
 */
export function isOutsidePointerdown(
  target: EventTarget | null,
  container: { contains(node: Node): boolean } | null | undefined,
  ignoreTarget?: (target: EventTarget | null) => boolean,
): boolean {
  if (ignoreTarget?.(target)) return false;
  if (container?.contains(target as Node)) return false;
  return true;
}

export type UseDismissOnOutsideOrEscapeOptions = {
  /**
   * Called to close/dismiss the panel. Read via a ref internally, so callers
   * can pass a fresh closure every render without this hook resubscribing
   * its listeners each time.
   */
  onDismiss: () => void;
  /**
   * Whether the listeners are active at all. Defaults to true - pass this
   * when the hook is called unconditionally (e.g. every render of an
   * always-mounted component) but should only listen while a given panel is
   * actually open.
   */
  enabled?: boolean;
  /**
   * The panel's own root element. A pointerdown whose target isn't inside it
   * counts as "outside" and dismisses. Required unless
   * `dismissOnOutsidePointerdown` is false.
   */
  containerRef?: RefObject<HTMLElement | null>;
  /**
   * Whether an outside pointerdown dismisses at all. Defaults to true; a
   * caller that only wants Escape-to-close (e.g. because it already has its
   * own separate outside-click handling, like a backdrop overlay's own click
   * handler) sets this false and can omit `containerRef`.
   */
  dismissOnOutsidePointerdown?: boolean;
  /**
   * Add the outside-pointerdown listener on the capture phase rather than
   * bubble. Defaults to true, matching every current call site but one.
   */
  captureOutsidePointerdown?: boolean;
  /**
   * A pointerdown target to ignore outright - neither dismisses nor counts
   * as "inside". For a target (e.g. the canvas) that already closes the
   * panel itself as part of handling that same click, so this hook
   * dismissing it too would just be redundant - or, worse, would fire before
   * that target's own handler gets a chance to look at the click.
   */
  ignoreTarget?: (target: EventTarget | null) => boolean;
  /**
   * When an outside pointerdown dismisses, also call preventDefault and
   * stopPropagation on it, so that same gesture can't also do something else
   * once it reaches whatever's underneath (e.g. arm a stitch on the canvas).
   * Defaults to false.
   */
  suppressDismissingPointerdown?: boolean;
  /** Also dismiss on Escape. Defaults to true. */
  closeOnEscape?: boolean;
  /**
   * Add the Escape listener on the capture phase rather than bubble.
   * Defaults to false.
   */
  captureEscape?: boolean;
  /**
   * Call stopImmediatePropagation on the Escape keydown that dismisses, so
   * no other document-level Escape listener also sees it. Defaults to
   * false.
   */
  stopEscapePropagation?: boolean;
  /** Also dismiss on scroll or window resize. Defaults to false. */
  closeOnScroll?: boolean;
};

/**
 * Closes a floating panel (popover, menu, drawer, dialog) on an outside
 * pointerdown and/or on Escape, while it's open.
 *
 * Consolidates what used to be six independently hand-rolled copies of this
 * pattern (see issue #238) - each with its own small, deliberate variation:
 * a capture-phase listener, a canvas-click exception, event suppression so
 * the dismissing click can't also do something else, whether scroll/resize
 * also dismiss, and so on. Every option here exists because some existing
 * call site needed exactly that behavior; migrating those six sites onto
 * this hook was meant to preserve each one's behavior exactly, not to make
 * them all behave alike.
 */
export function useDismissOnOutsideOrEscape(options: UseDismissOnOutsideOrEscapeOptions): void {
  const {
    onDismiss,
    enabled = true,
    containerRef,
    dismissOnOutsidePointerdown = true,
    captureOutsidePointerdown = true,
    ignoreTarget,
    suppressDismissingPointerdown = false,
    closeOnEscape = true,
    captureEscape = false,
    stopEscapePropagation = false,
    closeOnScroll = false,
  } = options;

  // onDismiss (and ignoreTarget) read via a ref rather than as effect
  // dependencies, so a caller passing a fresh closure every render doesn't
  // cause the listener effect below to tear down and resubscribe each time.
  const latestRef = useRef({ onDismiss, ignoreTarget });
  useEffect(() => {
    latestRef.current = { onDismiss, ignoreTarget };
  });

  // A plain useEffect would work equally well here - nothing in the six
  // sites this hook replaced actually depended on listeners attaching
  // before vs. after paint, since the pointerdown that opens a panel has
  // always finished dispatching (and any effects from opening it have
  // already run) by the time a *later* pointerdown could reach these
  // listeners either way. useLayoutEffect is used anyway so the listeners
  // are guaranteed live as early as possible, matching the two sites that
  // asked for that explicitly (ColorSwatchPopover, SuggestReviewMenu).
  useLayoutEffect(() => {
    if (!enabled) return;

    const cleanups: Array<() => void> = [];

    if (dismissOnOutsidePointerdown) {
      const onPointerDown = (event: PointerEvent) => {
        if (!isOutsidePointerdown(event.target, containerRef?.current, latestRef.current.ignoreTarget)) {
          return;
        }
        if (suppressDismissingPointerdown) {
          event.preventDefault();
          event.stopPropagation();
        }
        latestRef.current.onDismiss();
      };
      document.addEventListener("pointerdown", onPointerDown, captureOutsidePointerdown);
      cleanups.push(() =>
        document.removeEventListener("pointerdown", onPointerDown, captureOutsidePointerdown),
      );
    }

    if (closeOnEscape) {
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        if (stopEscapePropagation) event.stopImmediatePropagation();
        latestRef.current.onDismiss();
      };
      document.addEventListener("keydown", onKeyDown, captureEscape);
      cleanups.push(() => document.removeEventListener("keydown", onKeyDown, captureEscape));
    }

    if (closeOnScroll) {
      const onScrollOrResize = () => latestRef.current.onDismiss();
      // Scroll doesn't bubble, so catching it anywhere in the ancestor chain
      // (a scrolling panel, not just the window) needs the capture phase.
      document.addEventListener("scroll", onScrollOrResize, true);
      window.addEventListener("resize", onScrollOrResize);
      cleanups.push(() => {
        document.removeEventListener("scroll", onScrollOrResize, true);
        window.removeEventListener("resize", onScrollOrResize);
      });
    }

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [
    enabled,
    containerRef,
    dismissOnOutsidePointerdown,
    captureOutsidePointerdown,
    suppressDismissingPointerdown,
    closeOnEscape,
    captureEscape,
    stopEscapePropagation,
    closeOnScroll,
  ]);
}
