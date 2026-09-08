import { getSymbol } from "../symbols/registry";
import { SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { tapActivate } from "./tapActivate";

export function Toolbar() {
  const tool = useUiStore((s) => s.tool);
  const panEnabled = useUiStore((s) => s.panEnabled);
  const selectHeld = useUiStore((s) => s.selectHeld);
  const setTool = useUiStore((s) => s.setTool);
  const armedSymbolId = useUiStore((s) => s.armedSymbolId);
  const setArmedSymbolId = useUiStore((s) => s.setArmedSymbolId);
  const armedSymbol = armedSymbolId && armedSymbolId !== SUGGEST_SYMBOL_ID
    ? getSymbol(armedSymbolId)
    : undefined;

  return (
    <div className="toolDock" aria-label="Canvas tools">
      <button
        type="button"
        className="toolDock__button"
        data-on={!panEnabled && (tool === "select" || selectHeld)}
        aria-pressed={!panEnabled && (tool === "select" || selectHeld)}
        {...tapActivate(() => setTool("select"))}
        title="Select (S) — hold Cmd/Ctrl for temporary selection"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 3 9 7-4.2 1.2L8 16 5 3Z" />
        </svg>
        <span>Select</span>
      </button>
      <div className="toolDock__button toolDock__drawGroup" data-on={!panEnabled && tool === "stitch"}>
        <button
          type="button"
          className="toolDock__drawMain"
          aria-pressed={!panEnabled && tool === "stitch"}
          {...tapActivate(() => setTool("stitch"))}
          title="Draw (D)"
        >
          {armedSymbol ? (
            <SymbolGlyph symbol={armedSymbol} cell={Math.max(7, Math.min(17, 40 / armedSymbol.span))} />
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 14-.7 3 3-.7L15.5 7 13 4.5 4 14Z" />
              <path d="m11.5 6 2.5 2.5" />
            </svg>
          )}
          <span>Draw</span>
        </button>
        {armedSymbolId && (
          <button
            type="button"
            className="toolDock__drawStop"
            {...tapActivate(() => setArmedSymbolId(null))}
            aria-label="Stop drawing"
            title="Stop drawing (Esc)"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7" />
              <path d="m5 15 10-10" />
            </svg>
          </button>
        )}
      </div>
      <button
        type="button"
        className="toolDock__button"
        data-on={!panEnabled && tool === "insert"}
        aria-pressed={!panEnabled && tool === "insert"}
        {...tapActivate(() => setTool("insert"))}
        title="Insert (I) — add a stitch and shift the rest of the row over"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 3v14M4 10h4m4 0h4" />
          <path d="m6 7 3 3-3 3m8-6-3 3 3 3" />
        </svg>
        <span>Insert</span>
      </button>
      <span className="toolDock__separator" aria-hidden="true" />
      <button
        type="button"
        className="toolDock__button toolDock__eraser"
        data-on={!panEnabled && tool === "eraser"}
        aria-pressed={!panEnabled && tool === "eraser"}
        {...tapActivate(() => setTool("eraser"))}
        title="Erase (E)"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5 13 6.8-8a2 2 0 0 1 2.8-.2l.6.5a2 2 0 0 1 .2 2.8L8.7 16H5.8L4 14.5 5 13Z" />
          <path d="m8.5 9 4 3.4M9 16h7" />
        </svg>
        <span>Erase</span>
      </button>
    </div>
  );
}
