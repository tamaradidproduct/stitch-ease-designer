import { getSymbol } from "../symbols/registry";
import { resolveSuggestAction } from "../input/usePaintTool";
import { useDocStore } from "../state/docStore";
import { SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { tapActivate } from "./tapActivate";

export function Toolbar() {
  const referenceImagePanelOpen = useUiStore((s) => s.referenceImagePanelOpen);
  const hasReferenceImage = useDocStore((s) => !!s.referenceImage);
  const tool = useUiStore((s) => s.tool);
  const panEnabled = useUiStore((s) => s.panEnabled);
  const selectHeld = useUiStore((s) => s.selectHeld);
  const shiftHeld = useUiStore((s) => s.shiftHeld);
  const altHeld = useUiStore((s) => s.altHeld);
  const setTool = useUiStore((s) => s.setTool);
  const armedSymbolId = useUiStore((s) => s.armedSymbolId);
  const setArmedSymbolId = useUiStore((s) => s.setArmedSymbolId);
  const suggestAction = useUiStore((s) => s.suggestAction);
  const setSuggestAction = useUiStore((s) => s.setSuggestAction);
  const armedSymbol = armedSymbolId && armedSymbolId !== SUGGEST_SYMBOL_ID
    ? getSymbol(armedSymbolId)
    : undefined;
  // Deliberately NOT gated on `!selectHeld` the way the ordinary Select/
  // Draw/Insert row is: holding Cmd/Ctrl to confirm a suggestion is the
  // whole point of this row, and treating it as "temporarily use Select"
  // here would fall the toolDock straight back to Select instead of
  // highlighting Confirm.
  const suggestArmed = !panEnabled && tool === "stitch" && armedSymbolId === SUGGEST_SYMBOL_ID;
  // Same precedence `modeFor` and the canvas cursor use, so a literally held
  // modifier highlights the button it would actually act as (FR-4, SR-1).
  const effectiveSuggestAction = resolveSuggestAction(
    { confirmHeld: selectHeld, dismissHeld: shiftHeld && altHeld },
    suggestAction,
  );
  /** FR-7: clicking Confirm/Dismiss toggles the sticky default off again. */
  const toggleSticky = (action: "confirm" | "dismiss") =>
    setSuggestAction(suggestAction === action ? "suggest" : action);

  // While editing a reference image, drawing tools cannot act on the photo
  // and compete visually with the image workflow. Pan remains available in
  // its dedicated dock as the one canvas action still needed here.
  if (referenceImagePanelOpen && hasReferenceImage) return null;

  return (
    <div className={`toolDock${suggestArmed ? " toolDock--suggest" : ""}`} aria-label="Canvas tools">
      {suggestArmed ? (
        <button
          type="button"
          className="toolDock__button"
          data-on={effectiveSuggestAction === "confirm"}
          aria-pressed={effectiveSuggestAction === "confirm"}
          {...tapActivate(() => toggleSticky("confirm"))}
          title="Confirm (Cmd/Ctrl) — tap to make it the sticky default"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4 10 3.5 3.5L16 5" />
          </svg>
          <span>Confirm</span>
        </button>
      ) : (
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
      )}
      <div
        className="toolDock__button toolDock__drawGroup"
        data-on={suggestArmed ? effectiveSuggestAction === "suggest" : !panEnabled && !selectHeld && tool === "stitch"}
      >
        <button
          type="button"
          className="toolDock__drawMain"
          aria-pressed={suggestArmed ? effectiveSuggestAction === "suggest" : !panEnabled && !selectHeld && tool === "stitch"}
          {...tapActivate(() => (suggestArmed ? setSuggestAction("suggest") : setTool("stitch")))}
          title={suggestArmed ? "Suggest — tap to return to the plain sticky default" : "Draw (D)"}
        >
          {suggestArmed ? (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M4 16 13 7m2.5-2.5L17 3M6 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : armedSymbol ? (
            <SymbolGlyph symbol={armedSymbol} cell={Math.max(7, Math.min(17, 40 / armedSymbol.span))} />
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 14-.7 3 3-.7L15.5 7 13 4.5 4 14Z" />
              <path d="m11.5 6 2.5 2.5" />
            </svg>
          )}
          <span>{suggestArmed ? "Suggest" : "Draw"}</span>
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
      {suggestArmed ? (
        <button
          type="button"
          className="toolDock__button"
          data-on={effectiveSuggestAction === "dismiss"}
          aria-pressed={effectiveSuggestAction === "dismiss"}
          {...tapActivate(() => toggleSticky("dismiss"))}
          title="Dismiss (Shift+Opt) — tap to make it the sticky default"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" />
          </svg>
          <span>Dismiss</span>
        </button>
      ) : (
        <button
          type="button"
          className="toolDock__button"
          data-on={!panEnabled && !selectHeld && tool === "insert"}
          aria-pressed={!panEnabled && !selectHeld && tool === "insert"}
          {...tapActivate(() => setTool("insert"))}
          title="Insert (I) — add a stitch and shift the rest of the row over"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3v14M4 10h4m4 0h4" />
            <path d="m6 7 3 3-3 3m8-6-3 3 3 3" />
          </svg>
          <span>Insert</span>
        </button>
      )}
      <span className="toolDock__separator" aria-hidden="true" />
      <button
        type="button"
        className="toolDock__button toolDock__eraser"
        data-on={!panEnabled && !selectHeld && tool === "eraser"}
        aria-pressed={!panEnabled && !selectHeld && tool === "eraser"}
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
