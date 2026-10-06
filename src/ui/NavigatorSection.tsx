import { CELL } from "../canvas/camera";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { Button } from "./Button";
import { SideModule } from "./SideModule";

/** The right panel's zoom controls and "Center chart at 100%". */
export function NavigatorSection() {
  const index = useDocStore((state) => state.index);
  const zoom = useUiStore((state) => state.camera.zoom);
  const viewport = useUiStore((state) => state.viewport);
  const zoomAt = useUiStore((state) => state.zoomAt);
  const centerViewAt100 = useUiStore((state) => state.centerViewAt100);

  const zoomFromCenter = (factor: number) => {
    zoomAt(factor, viewport.width / 2, viewport.height / 2);
  };

  const centerChart = () => {
    const placements = index.toArray();
    if (!placements.length) {
      centerViewAt100(0, 0);
      return;
    }
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (const placement of placements) {
      minCol = Math.min(minCol, placement.col);
      maxCol = Math.max(maxCol, placement.col + index.spanOf(placement));
      minRow = Math.min(minRow, placement.row);
      maxRow = Math.max(maxRow, placement.row + 1);
    }
    centerViewAt100(((minCol + maxCol) / 2) * CELL, ((minRow + maxRow) / 2) * CELL);
  };

  return (
    <SideModule title="Navigator" subtitle="Move around the canvas" bodyClassName="navigator">
      <div className="navigator__zoom" aria-label="Canvas zoom">
        <Button variant="unstyled" onClick={() => zoomFromCenter(1 / 1.2)} aria-label="Zoom out">
          −
        </Button>
        <output aria-live="polite">{Math.round(zoom * 100)}%</output>
        <Button variant="unstyled" onClick={() => zoomFromCenter(1.2)} aria-label="Zoom in">
          +
        </Button>
      </div>
      <Button className="navigator__center" onClick={centerChart}>
        Center chart at 100%
      </Button>
    </SideModule>
  );
}
