import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { Button } from "./Button";
import { DuplicateIcon, MakeMotifIcon } from "./icons";
import type { selectedMotifCopy } from "./motifActions";
import { MotifCopyBubbles } from "./motifUi";

/**
 * The round action bubbles beside the stitch picker when several stitches
 * (or a motif copy) are selected: make a motif, or duplicate the selection.
 */
export function PickerSelectionActions({
  selectionIds,
  copyInfo,
  onDone,
}: {
  selectionIds: string[];
  copyInfo: ReturnType<typeof selectedMotifCopy>;
  onDone: () => void;
}) {
  const index = useDocStore((s) => s.index);
  const createRepeat = useDocStore((s) => s.createRepeat);
  const duplicateSelection = useDocStore((s) => s.duplicatePlacementsInRow);
  const openPicker = useUiStore((s) => s.openPicker);
  const setSelectedPlacementIds = useUiStore((s) => s.setSelectedPlacementIds);
  return (
    <div className="picker__selectionBubbles" aria-label="Selection actions">
      {copyInfo ? (
        <MotifCopyBubbles copyId={copyInfo.copy.id} overridden={copyInfo.overridden} onDone={onDone} />
      ) : (
      <Button variant="unstyled"
        onClick={() => {
          createRepeat(selectionIds);
                    onDone();
        }}
        title="Make a motif from these stitches (⌘G)"
        aria-label="Make motif"
        data-label="Motif"
      >
        <MakeMotifIcon />
      </Button>
      )}
      <Button variant="unstyled"
        onClick={() => {
          const ids = duplicateSelection(selectionIds);
          const first = ids.length ? index.placements.get(ids[0]!) : undefined;
          if (!ids.length || !first) return;
          setSelectedPlacementIds(ids, false);
          openPicker({
            col: first.col,
            row: first.row,
            x: 0,
            y: 0,
            selectionIds: ids,
            selectionSpan: index.spanOf(first),
          });
        }}
        title="Duplicate selected stitches"
        aria-label="Duplicate selection"
        data-label="Duplicate"
      >
        <DuplicateIcon />
      </Button>
    </div>
  );
}
