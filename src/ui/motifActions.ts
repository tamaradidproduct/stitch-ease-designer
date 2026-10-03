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


/**
 * Erases `ids`, except stitches that sit inside a motif copy the selection
 * only partly covers - e.g. a glossary "Select all" sweeping up one stitch
 * from every copy. Deleting those would silently change every copy, so
 * they're kept and the status bar says why (FR-64). A whole copy selected
 * is deleted as a copy, and a single stitch picked out on purpose
 * (double-click / Cmd-click) is deleted as an edit to its copy.
 * Returns how many stitches were kept.
 */
export function eraseKeepingMotifStitches(ids: readonly string[]): number {
  const doc = useDocStore.getState();
  if (ids.length <= 1) {
    doc.erasePlacements([...ids]);
    return 0;
  }
  const chosen = new Set(ids);
  const copyNames = new Map<string, string>();
  for (const motif of doc.repeats) for (const copy of motif.copies ?? []) copyNames.set(copy.id, motif.name);
  const kept = new Set<string>();
  const keptNames = new Set<string>();
  for (const id of ids) {
    const groupId = doc.index.placements.get(id)?.groupId;
    if (!groupId || !copyNames.has(groupId)) continue;
    const whole = doc.index.groupMembers(groupId).every((member) => chosen.has(member.id));
    if (!whole) {
      kept.add(id);
      keptNames.add(copyNames.get(groupId)!);
    }
  }
  doc.erasePlacements(ids.filter((id) => !kept.has(id)));
  if (kept.size) {
    useUiStore.getState().flashMotifNotice(
      `Kept ${kept.size} stitch${kept.size === 1 ? "" : "es"} inside ${[...keptNames].join(", ")} - double-click or ⌘-click one to change it`,
    );
  }
  return kept.size;
}
