import { useState } from "react";
import type { RepeatDefinition } from "../model/types";
import { armMotifPen } from "./motifActions";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { DetachIcon, MirrorIcon, PushToMotifIcon, RenameIcon, ResetIcon, TrashSmallIcon } from "./icons";

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
                  <RenameIcon />
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
                  <MirrorIcon />
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
                  <TrashSmallIcon />
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
            <PushToMotifIcon />
          </button>
          <button
            type="button"
            onClick={act(() => doc().resetMotifCopy(copyId))}
            title="Discard this copy's changes"
            aria-label="Reset copy to motif"
            data-label="Reset"
          >
            <ResetIcon />
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
        <MirrorIcon />
      </button>
      <button
        type="button"
        onClick={act(() => doc().detachMotifCopy(copyId))}
        title="Unlink this copy from its motif"
        aria-label="Detach copy"
        data-label="Detach"
      >
        <DetachIcon />
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

/**
 * The motif glyph inside the same bordered cell a one-stitch glyph sits in,
 * so a motif row's icon matches every stitch row's (FR-64).
 */
export function MotifCellGlyph({ cell = 20 }: { cell?: number }) {
  return (
    <span className="glyph" style={{ width: cell, height: cell }}>
      <span className="glyph__cell" style={{ left: 0, width: cell, height: cell }} />
      <span className="motifCellGlyph"><MotifGlyph size={Math.round(cell * 0.75)} /></span>
    </span>
  );
}
