import { deriveOverrides, hasOverrides, motifKey } from "../model/motifs";
import type { DocIndex } from "../model/docIndex";
import type { MotifCopy, RepeatDefinition } from "../model/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/** Arms `motifId`, giving it a quick slot the same way picking a stitch does. */
export function armMotifPen(motifId: string, mirrored = false): void {
  useDocStore.getState().addQuickSlot(motifKey(motifId));
  useUiStore.getState().armMotif(motifId, mirrored);
}

/** The one motif copy `ids` selects in full, if that's exactly what they are. */
export function selectedMotifCopy(
  ids: readonly string[],
  index: DocIndex,
  repeats: readonly RepeatDefinition[],
): { motif: RepeatDefinition; copy: MotifCopy; overridden: boolean } | null {
  const first = ids.length ? index.placements.get(ids[0]!)?.groupId : undefined;
  if (!first) return null;
  const members = index.groupMembers(first);
  if (members.length !== ids.length || !ids.every((id) => index.placements.get(id)?.groupId === first)) return null;
  for (const motif of repeats) {
    const copy = motif.copies?.find((c) => c.id === first);
    if (copy) return { motif, copy, overridden: hasOverrides(deriveOverrides(motif, copy, members)) };
  }
  return null;
}

