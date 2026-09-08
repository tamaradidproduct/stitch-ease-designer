import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

type TapGuarded = HTMLElement & { __tapLastFired?: number };

/**
 * iOS Safari (and WebKit generally, so this covers Chrome-on-iOS too - every
 * iOS browser is WebKit under the hood) can need a first tap just to settle
 * a hover-styled button's state before it'll dispatch a real click on a
 * second one. Reacting on pointerup for touch/pen sidesteps that click
 * synthesis (and the quirk) entirely. `preventDefault()` there is *supposed*
 * to stop the click that would otherwise still follow, but that's not
 * reliably honored across every WebKit version - if it isn't, both handlers
 * fire and the action runs twice.
 *
 * For a plain "set to X" action that's invisible - setting the same value
 * twice looks identical - which is exactly why Select/Draw/Insert/Erase
 * never showed a problem despite using this same pattern. For a toggle
 * (Pan, arm/disarm) it means on, then immediately off: indistinguishable
 * from the tap doing nothing.
 *
 * The guard against that has to survive being called fresh on every render
 * (this is invoked inline in JSX, not memoized) - a `let` closed over in
 * this function's own scope would reset on every call, which is no guard
 * at all once you notice the toggle's own state change triggers a re-render
 * before the browser's follow-up click ever arrives. Storing the timestamp
 * as a property on the actual DOM element instead survives that: React
 * reuses the same host node across re-renders at a stable JSX position, so
 * the property is still there when the delayed click shows up.
 */
export function tapActivate(fn: () => void) {
  return {
    onClick: (e: ReactMouseEvent) => {
      const el = e.currentTarget as TapGuarded;
      if (el.__tapLastFired !== undefined && Date.now() - el.__tapLastFired < 500) return;
      fn();
    },
    onPointerUp: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      (e.currentTarget as TapGuarded).__tapLastFired = Date.now();
      fn();
    },
  };
}
