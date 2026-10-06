import { useState } from "react";
import { SideModule } from "./SideModule";

const SHORTCUTS: [keys: string[], action: string][] = [
  [["S", "D", "I", "E"], "Select, Draw, Insert, Erase"],
  [["1–5"], "Choose a quick stitch"],
  [["Tab", "/", "Shift Tab"], "Next stitch right / left"],
  [["Shift click"], "Add or remove from selection"],
  [["⌘/Ctrl C", "X", "V"], "Copy or cut selection · paste at hovered cell"],
  [["⌘/Ctrl D"], "Duplicate selection"],
  [["⌘/Ctrl G"], "Make motif"],
  [["⌘/Ctrl Z"], "Undo"],
  [["Shift ⌘/Ctrl Z"], "Redo"],
  [["Delete"], "Erase selection"],
  [["/"], "Open stitch picker at cursor"],
  [["Esc"], "Close or clear selection"],
  [["Space drag"], "Pan canvas"],
  [["⌘/Ctrl scroll"], "Zoom canvas"],
  [["⌘/Ctrl +", "/", "−"], "Zoom in / out"],
  [["⌘/Ctrl 0"], "Reset view to 100%"],
];

/** The right panel's collapsible keyboard-shortcut reference. */
export function HelpSection() {
  const [open, setOpen] = useState(false);
  return (
    <SideModule title="Help" subtitle="Keyboard shortcuts" collapsible={{ open, onToggle: () => setOpen((v) => !v) }}>
      <dl className="shortcutList">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={action} className="shortcutList__row">
            <dt>
              {keys.map((k, i) =>
                k === "/" ? (
                  <span key={i}> / </span>
                ) : (
                  <span key={i}>
                    {i > 0 && keys[i - 1] !== "/" ? " " : ""}
                    <kbd>{k}</kbd>
                  </span>
                ),
              )}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </SideModule>
  );
}
