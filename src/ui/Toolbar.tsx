import { getSymbol } from "../symbols/registry";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";

export function Toolbar() {
  const armedId = useUiStore((s) => s.armedSymbolId);
  const tool = useUiStore((s) => s.tool);
  const recentIds = useUiStore((s) => s.recentSymbolIds);
  const setTool = useUiStore((s) => s.setTool);
  const setArmed = useUiStore((s) => s.setArmedSymbolId);
  const openPicker = useUiStore((s) => s.openPicker);
  const hover = useUiStore((s) => s.hover);

  const undo = useDocStore((s) => s.undo);
  const redo = useDocStore((s) => s.redo);
  const canUndo = useDocStore((s) => s.undoStack.length > 0);
  const canRedo = useDocStore((s) => s.redoStack.length > 0);

  const armed = armedId ? getSymbol(armedId) : undefined;

  // The picker normally anchors to a clicked cell; from the toolbar there
  // isn't one, so fall back to the hovered cell or the canvas origin.
  const openFromToolbar = () =>
    openPicker({ col: hover?.col ?? 0, row: hover?.row ?? 0, x: 16, y: 52 });

  return (
    <div className="toolbar">
      <button
        type="button"
        className="toolbar__armed"
        onClick={openFromToolbar}
        title="Choose a stitch (/)"
      >
        {armed ? (
          <>
            <SymbolGlyph symbol={armed} cell={Math.min(20, 140 / armed.span)} />
            <span className="toolbar__armedLabel">{armed.label}</span>
          </>
        ) : (
          <span className="toolbar__armedLabel toolbar__armedLabel--empty">
            Click a cell to choose a stitch
          </span>
        )}
      </button>

      <button
        type="button"
        className="toolbar__btn"
        data-on={tool === "eraser"}
        onClick={() => setTool(tool === "eraser" ? "stitch" : "eraser")}
        title="Eraser (E) — or right-click the canvas"
      >
        Eraser
      </button>

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
