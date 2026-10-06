import type { PointerEvent as ReactPointerEvent } from "react";
import { RIGHT_PANEL_MAX_WIDTH, RIGHT_PANEL_MIN_WIDTH, useUiStore } from "../state/uiStore";
import { ExportSection } from "./ExportSection";
import { GlossarySection } from "./GlossarySection";
import { HelpSection } from "./HelpSection";
import { NavigatorSection } from "./NavigatorSection";
import { ReferenceImagePanel } from "./ReferenceImagePanel";

/**
 * The editor's resizable right panel. Each card is its own component:
 * glossary, reference image (admins), export, help and navigator.
 */
export function RightPanel() {
  const isAdmin = useUiStore((state) => state.role === "admin");
  const rightPanelWidth = useUiStore((state) => state.rightPanelWidth);
  const setRightPanelWidth = useUiStore((state) => state.setRightPanelWidth);

  // Drag-to-resize from the panel's left edge. Pointer capture keeps the
  // handle receiving move/up events even once the cursor leaves its thin
  // hit area mid-drag, the same pattern useReferenceImageTool.ts uses for
  // canvas drags.
  const onResizeHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = rightPanelWidth;
    const onMove = (moveEvent: PointerEvent) => {
      setRightPanelWidth(startWidth + (startX - moveEvent.clientX));
    };
    // A plain pointerup only fires on a clean release. A gesture the OS or
    // browser interrupts (touch scroll takeover, a system dialog stealing
    // focus) instead ends the drag with pointercancel/lostpointercapture and
    // no pointerup at all - without listening for those too, the resize
    // would get stuck mid-drag and these listeners would leak.
    const cleanup = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      handle.removeEventListener("lostpointercapture", cleanup);
    };
    const onUp = (upEvent: PointerEvent) => {
      try {
        handle.releasePointerCapture(upEvent.pointerId);
      } catch {
        // Already released (e.g. by the lostpointercapture that's about to fire).
      }
      cleanup();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    handle.addEventListener("lostpointercapture", cleanup);
  };

  return (
    <aside className="rightPanel" aria-label="Pattern details" style={{ width: rightPanelWidth }}>
      <div
        className="rightPanel__resizeHandle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={Math.round(rightPanelWidth)}
        aria-valuemin={RIGHT_PANEL_MIN_WIDTH}
        aria-valuemax={RIGHT_PANEL_MAX_WIDTH}
        onPointerDown={onResizeHandlePointerDown}
      />
      <GlossarySection />

      {isAdmin && <ReferenceImagePanel />}

      <div className="rightPanel__bottom">
        <ExportSection />
        <HelpSection />
        <NavigatorSection />
      </div>
    </aside>
  );
}
