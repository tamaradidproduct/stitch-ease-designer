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

  const toggle = () => setPanEnabled(!panEnabled);

  return (
    <div className="panDock">
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
