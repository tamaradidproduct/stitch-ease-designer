import { useEffect } from "react";
import { calculateViewportShift, type ViewportBounds } from "./fasterFixesViewport";

const POPOVER_SELECTOR = ".stitch-ease-feedback-popover";

function getViewportBounds(): ViewportBounds {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  return {
    left,
    top,
    right: left + (viewport?.width ?? window.innerWidth),
    bottom: top + (viewport?.height ?? window.innerHeight),
  };
}

/** Keeps Faster Fixes' anchored popovers inside the actually visible viewport. */
export function FasterFixesViewportGuard() {
  useEffect(() => {
    let animationFrame: number | null = null;

    const observer = new MutationObserver(scheduleClamp);
    const observe = () =>
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
        subtree: true,
      });

    function clampPopovers() {
      animationFrame = null;
      observer.disconnect();

      const viewport = getViewportBounds();
      document.querySelectorAll<HTMLElement>(POPOVER_SELECTOR).forEach((popover) => {
        // Floating UI owns `transform`; the independent translate property lets
        // us add a viewport correction without replacing its anchored position.
        popover.style.removeProperty("translate");
        const { x, y } = calculateViewportShift(popover.getBoundingClientRect(), viewport);
        if (x || y) popover.style.translate = `${x}px ${y}px`;
      });

      observe();
    }

    function scheduleClamp() {
      if (animationFrame === null) animationFrame = window.requestAnimationFrame(clampPopovers);
    }

    observe();
    scheduleClamp();
    window.addEventListener("resize", scheduleClamp);
    window.addEventListener("scroll", scheduleClamp, true);
    window.visualViewport?.addEventListener("resize", scheduleClamp);
    window.visualViewport?.addEventListener("scroll", scheduleClamp);

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleClamp);
      window.removeEventListener("scroll", scheduleClamp, true);
      window.visualViewport?.removeEventListener("resize", scheduleClamp);
      window.visualViewport?.removeEventListener("scroll", scheduleClamp);
      document.querySelectorAll<HTMLElement>(POPOVER_SELECTOR).forEach((popover) => {
        popover.style.removeProperty("translate");
      });
    };
  }, []);

  return null;
}
