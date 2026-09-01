import { useUiStore } from "../state/uiStore";

export function StatusBar() {
  const hover = useUiStore((s) => s.hover);
  const zoom = useUiStore((s) => s.camera.zoom);
  const resetView = useUiStore((s) => s.resetView);

  return (
    <div className="statusbar">
      <span className="statusbar__cell">
        {hover ? `col ${hover.col}, row ${hover.row}` : "—"}
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
