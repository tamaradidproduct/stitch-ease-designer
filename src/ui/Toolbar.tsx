import { getSymbol } from "../symbols/registry";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";

export function Toolbar() {
  const armedId = useUiStore((s) => s.armedSymbolId);
  const tool = useUiStore((s) => s.tool);
  const selectHeld = useUiStore((s) => s.selectHeld);
  const recentIds = useUiStore((s) => s.recentSymbolIds);
  const setTool = useUiStore((s) => s.setTool);
  const setArmed = useUiStore((s) => s.setArmedSymbolId);
  const openPicker = useUiStore((s) => s.openPicker);
  const selectedIds = useUiStore((s) => s.selectedPlacementIds);
  const clearSelection = useUiStore((s) => s.clearSelection);

  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const canUndo = useDocStore((s) => s.undoStack.length > 0);
  const canRedo = useDocStore((s) => s.redoStack.length > 0);
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.revision);
  const erasePlacements = useDocStore((s) => s.erasePlacements);
  const createRepeat = useDocStore((s) => s.createRepeat);
  const duplicatePlacements = useDocStore((s) => s.duplicatePlacements);
  const setSelectedPlacementIds = useUiStore((s) => s.setSelectedPlacementIds);

  const selected = selectedIds.flatMap((id) => {
    const placement = index.placements.get(id);
    return placement ? [placement] : [];
  });
  const selectedSpan = selected[0] ? index.spanOf(selected[0]) : null;
  const sameSpan =
    selectedSpan !== null && selected.every((placement) => index.spanOf(placement) === selectedSpan);

  return (
    <div className="toolbar">
      <button
        type="button"
        className="toolbar__btn"
        data-on={tool === "select" || selectHeld}
        aria-pressed={tool === "select" || selectHeld}
        onClick={() => setTool("select")}
        title="Select (S) — hold Cmd/Ctrl for temporary selection"
      >
        Select
      </button>
      <button
        type="button"
        className="toolbar__btn"
        data-on={tool === "stitch"}
        aria-pressed={tool === "stitch"}
        onClick={() => setTool("stitch")}
        title="Draw (D)"
      >
        Draw
      </button>
      <button
        type="button"
        className="toolbar__btn"
        data-on={tool === "eraser"}
        aria-pressed={tool === "eraser"}
        onClick={() => setTool("eraser")}
        title="Eraser (E) — or right-click the canvas"
      >
        Eraser
      </button>

      {selected.length > 0 && (
        <div className="toolbar__selection">
          <span>{selected.length} selected</span>
          <button
            type="button"
            className="toolbar__btn"
            onClick={() => createRepeat(selected.map((placement) => placement.id))}
            title="Group these stitches as a chart-local repeat"
          >
            Create repeat
          </button>
          <button
            type="button"
            className="toolbar__btn"
            onClick={() => {
              const ids = duplicatePlacements(selected.map((placement) => placement.id));
              if (ids.length) setSelectedPlacementIds(ids);
            }}
            title="Duplicate selected stitches (⌘D)"
          >
            Duplicate
          </button>
          <button
            type="button"
            className="toolbar__btn"
            disabled={!sameSpan}
            title={sameSpan ? "Replace selected stitches" : "Select stitches of the same width to replace"}
            onClick={() => {
              const first = selected[0]!;
              openPicker({
                col: first.col,
                row: first.row,
                x: 16,
                y: 92,
                selectionIds: selected.map((placement) => placement.id),
                selectionSpan: selectedSpan!,
              });
            }}
          >
            Replace…
          </button>
          <button
            type="button"
            className="toolbar__btn"
            onClick={() => {
              erasePlacements(selected.map((placement) => placement.id));
              clearSelection();
            }}
            title="Delete selected stitches (Delete)"
          >
            Delete
          </button>
        </div>
      )}

      {recentIds.length > 1 && (
        <div className="toolbar__recents">
          {recentIds.map((id) => {
            const symbol = getSymbol(id);
            if (!symbol) return null;
            return (
              <button
                key={id}
                type="button"
                className="toolbar__recent"
                data-on={id === armedId && tool === "stitch"}
                onClick={() => setArmed(id)}
                title={symbol.label}
              >
                <SymbolGlyph
                  symbol={symbol}
                  cell={Math.max(6, Math.min(18, 54 / symbol.span))}
                />
              </button>
            );
          })}
        </div>
      )}

      <span className="toolbar__spacer" />

      <button
        type="button"
        className="toolbar__btn"
        onClick={undo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
      >
        Undo
      </button>
      <button
        type="button"
        className="toolbar__btn"
        onClick={redo}
        disabled={!canRedo}
        title="Redo (⇧⌘Z)"
      >
        Redo
      </button>
    </div>
  );
}
