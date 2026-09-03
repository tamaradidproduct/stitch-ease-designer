import { useUiStore } from "../state/uiStore";
import { useDocStore } from "../state/docStore";
import { knittedRowNumberAt, roundStitchNumberAt } from "../model/stitchNumbers";

export function StatusBar() {
  const hover = useUiStore((s) => s.hover);
  const zoom = useUiStore((s) => s.camera.zoom);
  const resetView = useUiStore((s) => s.resetView);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.revision);
  const stitch = hover ? roundStitchNumberAt(index, hover.col, hover.row) : null;
  const row = hover ? knittedRowNumberAt(index, hover.col, hover.row) : null;

  return (
    <div className="statusbar">
      <span className="statusbar__cell">
        {hover
          ? row
            ? `Row ${row} · ${stitch ? `Stitch ${stitch}` : "No stitch"}`
            : "No stitch"
          : "—"}
      </span>
      <span className="statusbar__spacer" />
      <span className="statusbar__hint">
        space + drag to pan · ⌘ + scroll to zoom
      </span>
      <button className="statusbar__zoom" onClick={resetView} title="Reset view (⌘0)">
        {Math.round(zoom * 100)}%
      </button>
    </div>
  );
}
