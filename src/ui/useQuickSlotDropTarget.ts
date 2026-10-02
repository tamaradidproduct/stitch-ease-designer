import { useState, type DragEvent } from "react";

export type QuickSlotDropHandlers = {
  onDragOver: (event: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent) => void;
};

/**
 * The quick-row's drag-and-drop state and handlers (issue #323) - what used
 * to be three independently hand-rolled copies in RightPanel.tsx (a filled
 * quick slot reordering/pushing another onto it, the inline search box that
 * temporarily replaces an empty slot, and a plain empty slot), each wiring
 * up the same `draggingQuickId`/`dragOverQuickId`/`dragOverQuickSlot` trio by
 * hand.
 *
 * The 4th, differently-shaped drop target - an overflow glossary row, which
 * additionally guards against promoting an item that's already in the quick
 * row and reorders via `moveGlossaryIdTo` rather than `moveQuickSymbolTo` -
 * stays outside this hook (per issue #323, not forced into it), but still
 * reads `draggingQuickId`/`dragOverQuickId` and calls `startDragging`/
 * `resetDragState` from here, so there remains exactly one copy of this
 * state, not two.
 */
export function useQuickSlotDropTarget(moveQuickSymbolTo: (key: string, targetSlot: number) => void) {
  const [draggingQuickId, setDraggingQuickId] = useState<string | null>(null);
  const [dragOverQuickId, setDragOverQuickId] = useState<string | null>(null);
  const [dragOverQuickSlot, setDragOverQuickSlot] = useState<number | null>(null);

  const resetDragState = () => {
    setDraggingQuickId(null);
    setDragOverQuickId(null);
    setDragOverQuickSlot(null);
  };

  /** Wire onto a draggable quick-row drag handle's `onDragStart`. */
  const startDragging = (key: string) => setDraggingQuickId(key);

  /**
   * The hover-highlight half of a key-identified drop target: tracks
   * `dragOverQuickId` while another quick-row item is dragged over this one.
   * Shared by `forFilledSlot` below and, directly, by the overflow glossary
   * row's own bespoke `onDrop` (issue #323: its hover highlight is this same
   * state - only how a drop resolves differs there, see RightPanel.tsx).
   */
  const trackDragOverKey = (key: string): Pick<QuickSlotDropHandlers, "onDragOver" | "onDragLeave"> => ({
    onDragOver: (event) => {
      if (draggingQuickId && draggingQuickId !== key) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDragOverQuickId(key);
      }
    },
    onDragLeave: () => setDragOverQuickId((current) => (current === key ? null : current)),
  });

  /**
   * A filled quick slot: dropping another dragged quick-row item onto it
   * reorders/pushes it in (#271's `moveQuickSymbolTo`/`promoteQuickSlot`).
   */
  const forFilledSlot = (key: string, slot: number): QuickSlotDropHandlers => ({
    ...trackDragOverKey(key),
    onDrop: (event) => {
      event.preventDefault();
      const draggedKey = draggingQuickId;
      if (draggedKey && draggedKey !== key) moveQuickSymbolTo(draggedKey, slot);
      resetDragState();
    },
  });

  /**
   * An empty quick slot, or the inline search box standing in for one while
   * its "Add stitch" search is open - dropping a dragged quick-row item
   * fills it. `onFilled` lets the inline-search call site also close its
   * search box on a successful drop (issue #323g: via `closeGlossarySearch`),
   * without this hook needing to know anything about search state.
   */
  const forEmptySlot = (slot: number, onFilled?: () => void): QuickSlotDropHandlers => ({
    onDragOver: (event) => {
      if (draggingQuickId) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (dragOverQuickSlot !== slot) setDragOverQuickSlot(slot);
      }
    },
    onDragLeave: () => setDragOverQuickSlot((current) => (current === slot ? null : current)),
    onDrop: (event) => {
      event.preventDefault();
      const draggedId = draggingQuickId;
      if (draggedId) {
        moveQuickSymbolTo(draggedId, slot);
        onFilled?.();
      }
      resetDragState();
    },
  });

  return {
    draggingQuickId,
    dragOverQuickId,
    dragOverQuickSlot,
    startDragging,
    resetDragState,
    trackDragOverKey,
    forFilledSlot,
    forEmptySlot,
  };
}
