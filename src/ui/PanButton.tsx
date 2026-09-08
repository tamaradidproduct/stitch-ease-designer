import { useLayoutEffect, useRef } from "react";
import { useUiStore } from "../state/uiStore";
import { tapActivate } from "./tapActivate";

/**
 * Touch/Pencil equivalent of holding Space - a tap-toggled modifier, not a
 * tool: turning it on doesn't touch `tool` at all, so Select/Draw/Insert/
 * Erase stay exactly as they were and resume the instant Pan turns back
 * off. This is deliberate - Space has always worked underneath whatever
 * tool is active, and Pan is that same modifier for a device with no key to
 * hold, not a fifth entry in the tool switcher. Kept in its own corner
 * rather than folded into the main toolDock so it stays reachable one-
 * handed regardless of where that dock ends up on screen. Shown on every
 * platform (see the comment on .panDock in styles.css for why it's not
 * hidden on desktop).
 */
export function PanButton() {
  const panEnabled = useUiStore((s) => s.panEnabled);
  const setPanEnabled = useUiStore((s) => s.setPanEnabled);
  const referenceImagePanelOpen = useUiStore((s) => s.referenceImagePanelOpen);
  const dockRef = useRef<HTMLDivElement>(null);

  const toggle = () => setPanEnabled(!panEnabled);

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const stage = document.querySelector<HTMLElement>(".stage");
    const toolDock = document.querySelector<HTMLElement>(".toolDock");
    const panDock = dockRef.current;
    if (!stage || !toolDock || !panDock) return;

    // Keep the tool dock centered in the usable canvas, unless it would
    // overlap Pan. The latter owns a 16px safety gap and pushes the dock only
    // as far as necessary; ResizeObserver picks up Pan's hover expansion.
    const updateToolDockPosition = () => {
      const stageRect = stage.getBoundingClientRect();
      const panRect = panDock.getBoundingClientRect();
      const toolRect = toolDock.getBoundingClientRect();
      const centered = (stageRect.width - 304) / 2;
      const minimum = panRect.right - stageRect.left + 16 + toolRect.width / 2;
      toolDock.style.setProperty("--tool-dock-center", `${Math.round(Math.max(centered, minimum))}px`);
    };

    updateToolDockPosition();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateToolDockPosition);
    observer?.observe(stage);
    observer?.observe(panDock);
    observer?.observe(toolDock);
    window.addEventListener("resize", updateToolDockPosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateToolDockPosition);
      toolDock.style.removeProperty("--tool-dock-center");
    };
  }, [referenceImagePanelOpen]);

  return (
    <div className="panDock" ref={dockRef}>
      <button
        type="button"
        className="toolDock__button"
        data-on={panEnabled}
        aria-pressed={panEnabled}
        {...tapActivate(toggle)}
        title="Pan - drag anywhere on the canvas to pan, tap again to go back to drawing/selecting normally"
        aria-label="Toggle pan"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2v16M2 10h16" />
          <path d="M10 2 7.5 4.5M10 2l2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5" />
        </svg>
        <span>Pan</span>
      </button>
    </div>
  );
}
