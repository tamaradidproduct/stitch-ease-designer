import { useState } from "react";
import { motifKey } from "../model/motifs";
import type { RepeatDefinition } from "../model/types";
import { armMotifPen } from "./motifActions";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { CloseIcon } from "./icons";
import { tapActivate } from "./tapActivate";

/**
 * Motifs are pens (FR-64): they share the quick row and the picker's More
 * drawer with stitches rather than getting a panel of their own. A tile
 * doesn't try to preview the whole motif - the full-size ghost on the canvas
 * does that once it's armed.
 */
export function MotifGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" className="motifGlyph">
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="2.5" width="6.5" height="6.5" rx="1" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1" />
      <rect x="11" y="11" width="6.5" height="6.5" rx="1" strokeDasharray="2 1.5" />
    </svg>
  );
}

export function MotifQuickTile({
  motif,
  armed,
  onChoose,
}: {
  motif: RepeatDefinition;
  armed: boolean;
  onChoose: () => void;
}) {
  const title = `${motif.name} (${motif.width}×${motif.height} motif)`;
  return (
    <div className="picker__quickTile">
      <button
        type="button"
        className="picker__quickButton motifTile"
        data-active={armed}
        onClick={onChoose}
        title={title}
        aria-label={title}
        data-label={motif.name}
      >
        <MotifGlyph />
        <span className="motifTile__size">{motif.width}×{motif.height}</span>
      </button>
    </div>
  );
}

/** The More drawer's motif list: arm, rename, arm mirrored, delete. */
export function MotifDrawerSection({ onArmed }: { onArmed: () => void }) {
  const repeats = useDocStore((s) => s.repeats);
  const renameMotif = useDocStore((s) => s.renameMotif);
  const armedMotif = useUiStore((s) => s.armedMotif);
  const requestDelete = useUiStore((s) => s.setMotifDeleteRequest);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  if (!repeats.length) return null;

  const commitRename = (id: string) => {
    renameMotif(id, draft);
    setRenaming(null);
  };

  return (
    <>
      <div className="picker__moreHeader">Motifs</div>
      <div className="picker__moreList">
        {repeats.map((motif) => {
          const copies = motif.copies?.length ?? 0;
          return (
            <div key={motif.id} className="picker__item motifRow">
              {renaming === motif.id ? (
                <input
                  className="motifRow__rename"
                  autoFocus
                  value={draft}
                  aria-label={`Rename ${motif.name}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(motif.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") commitRename(motif.id);
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="picker__itemMain"
                  data-active={armedMotif?.id === motif.id}
                  onClick={() => {
                    armMotifPen(motif.id);
                    onArmed();
                  }}
                  title={`Stamp ${motif.name} (${motif.width}×${motif.height}, ${copies} ${copies === 1 ? "copy" : "copies"})`}
                >
                  <span className="picker__glyph"><MotifGlyph /></span>
                  <span className="picker__label">{motif.name}</span>
                  <span className="picker__span">{motif.width}×{motif.height}</span>
                </button>
              )}
              <div className="motifRow__actions">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(motif.name);
                    setRenaming(motif.id);
                  }}
                  aria-label={`Rename ${motif.name}`}
                  title="Rename"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16h3l8.5-8.5-3-3L4 13v3zM11.5 5.5l3 3" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    armMotifPen(motif.id, true);
                    onArmed();
                  }}
                  aria-label={`Stamp ${motif.name} mirrored`}
                  title="Stamp mirrored"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M7 6 3 10l4 4V6zM13 6l4 4-4 4V6z" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    requestDelete(motif.id);
                    onArmed();
                  }}
                  aria-label={`Delete ${motif.name}`}
                  title="Delete motif"
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 5h9M6.5 5V3.5h3V5M4.5 5l.5 8h6l.5-8" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Push / Reset / Mirror / Detach for a selected motif copy. */
export function MotifCopyBubbles({ copyId, overridden, onDone }: { copyId: string; overridden: boolean; onDone: () => void }) {
  const doc = useDocStore.getState;
  const act = (fn: () => void) => () => {
    fn();
    onDone();
  };
  return (
    <>
      {overridden && (
        <>
          <button
            type="button"
            onClick={act(() => doc().pushMotifCopy(copyId))}
            title="Make this copy's changes the motif - every copy updates"
            aria-label="Push changes to motif"
            data-label="Push to motif"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V5M5.5 9.5 10 5l4.5 4.5M4 3h12" /></svg>
          </button>
          <button
            type="button"
            onClick={act(() => doc().resetMotifCopy(copyId))}
            title="Discard this copy's changes"
            aria-label="Reset copy to motif"
            data-label="Reset"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 8A6 6 0 1 1 4 11M4.5 3.5V8H9" /></svg>
          </button>
        </>
      )}
      <button
        type="button"
        onClick={act(() => doc().mirrorMotifCopy(copyId))}
        title="Mirror this copy"
        aria-label="Mirror copy"
        data-label="Mirror"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M7 6 3 10l4 4V6zM13 6l4 4-4 4V6z" /></svg>
      </button>
      <button
        type="button"
        onClick={act(() => doc().detachMotifCopy(copyId))}
        title="Unlink this copy from its motif"
        aria-label="Detach copy"
        data-label="Detach"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 12l-2 2a2.8 2.8 0 0 1-4-4l2-2M12 8l2-2a2.8 2.8 0 0 1 4 4l-2 2M3 3l14 14" /></svg>
      </button>
    </>
  );
}

/** Asks what happens to a deleted motif's copies (FR-64). */
export function MotifDeleteDialog() {
  const motifId = useUiStore((s) => s.motifDeleteRequest);
  const close = useUiStore((s) => s.setMotifDeleteRequest);
  const motif = useDocStore((s) => s.repeats.find((r) => r.id === motifId));
  if (!motifId || !motif) return null;
  const copies = motif.copies?.length ?? 0;
  const finish = (mode: "detach" | "delete") => {
    if (useUiStore.getState().armedMotif?.id === motifId) useUiStore.getState().armMotif(null);
    useDocStore.getState().deleteMotif(motifId, mode);
    close(null);
  };
  return (
    <ConfirmDialog
      message={
        copies
          ? `"${motif.name}" has ${copies} ${copies === 1 ? "copy" : "copies"} on this chart. What should happen to ${copies === 1 ? "it" : "them"}?`
          : `Delete "${motif.name}"?`
      }
      confirmLabel={copies ? "Delete copies" : "Delete"}
      extraActions={copies ? [{ label: "Detach copies", onClick: () => finish("detach") }] : []}
      onConfirm={() => finish("delete")}
      onCancel={() => close(null)}
    />
  );
}

/** A quick-row slot holding a motif, in the right panel's stitch list. */
export function MotifGlossaryRow({ motif, shortcutSlot }: { motif: RepeatDefinition; shortcutSlot?: number | undefined }) {
  const armed = useUiStore((s) => s.armedMotif?.id === motif.id && s.tool === "stitch");
  const index = useDocStore((s) => s.index);
  useDocStore((s) => s.revision);
  const copies = motif.copies ?? [];
  const shortcutNumber = shortcutSlot !== undefined ? shortcutSlot + 1 : null;
  return (
    <div className="glossary__item motifGlossaryRow" data-on={armed}>
      <span className="glossary__dragHandle glossary__dragHandle--empty" aria-hidden="true" />
      {shortcutNumber !== null ? (
        <kbd className="glossary__shortcut" aria-label={`Shortcut ${shortcutNumber}`}>{shortcutNumber}</kbd>
      ) : (
        <span className="glossary__shortcutSpacer" />
      )}
      <button
        type="button"
        className="glossary__arm"
        {...tapActivate(() => (armed ? useUiStore.getState().armMotif(null) : armMotifPen(motif.id)))}
        title={`Stamp ${motif.name} (${motif.width}×${motif.height}) - tap again to stop`}
      >
        <span className="glossary__glyph"><MotifGlyph /></span>
        <span className="glossary__label">{motif.name}</span>
      </button>
      <button
        type="button"
        className="glossary__count glossary__selectEntry"
        disabled={!copies.length}
        onClick={() =>
          useUiStore.getState().setSelection(
            copies.flatMap((copy) => index.groupMembers(copy.id).map((p) => p.id)),
            [],
            true,
          )}
        title={`Select all copies of ${motif.name}`}
      >
        All ({copies.length})
      </button>
      <button
        type="button"
        className="glossary__remove"
        onClick={() => {
          // Never drop a motif that still has copies on the chart without
          // asking what happens to them (FR-64).
          if (copies.length) useUiStore.getState().setMotifDeleteRequest(motif.id);
          else useDocStore.getState().removeQuickSlot(motifKey(motif.id));
        }}
        aria-label={copies.length ? `Delete ${motif.name}` : `Remove ${motif.name} from the quick row`}
        title={copies.length ? "Delete motif…" : "Remove from quick row (the motif stays in More)"}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
