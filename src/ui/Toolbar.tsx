import { getSymbol } from "../symbols/registry";
import { resolveSuggestAction } from "../input/usePaintTool";
import { useDocStore } from "../state/docStore";
import { SUGGEST_SYMBOL_ID, useUiStore } from "../state/uiStore";
import { SymbolGlyph } from "./SymbolGlyph";
import { tapActivate } from "./tapActivate";
import { DisarmDrawingButton } from "./DisarmDrawingButton";
import { CheckIcon, CrossIcon, DrawIcon, EraseIcon, InsertIcon, SelectIcon, SuggestIcon } from "./icons";

export function Toolbar() {
  const referenceImagePanelOpen = useUiStore((s) => s.referenceImagePanelOpen);
  const hasReferenceImage = useDocStore((s) => s.referenceImages.length > 0);
  const tool = useUiStore((s) => s.tool);
  const panEnabled = useUiStore((s) => s.panEnabled);
  const selectHeld = useUiStore((s) => s.selectHeld);
  const shiftHeld = useUiStore((s) => s.shiftHeld);
  const altHeld = useUiStore((s) => s.altHeld);
  const setTool = useUiStore((s) => s.setTool);
  const armedSymbolId = useUiStore((s) => s.armedSymbolId);
  const activeColor = useUiStore((s) => s.activeColor);
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
          <CheckIcon />
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
          <SelectIcon />
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
            <SuggestIcon />
          ) : armedSymbol ? (
            <SymbolGlyph
              symbol={armedSymbol}
              cell={Math.max(7, Math.min(17, 40 / armedSymbol.span))}
              colorId={activeColor ?? undefined}
            />
          ) : (
            <DrawIcon />
          )}
          <span>{suggestArmed ? "Suggest" : "Draw"}</span>
        </button>
        {armedSymbolId && (
          <DisarmDrawingButton className="toolDock__drawStop" onActivate={() => setArmedSymbolId(null)} />
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
          <CrossIcon />
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
          <InsertIcon />
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
        <EraseIcon />
        <span>Erase</span>
      </button>
    </div>
  );
}
