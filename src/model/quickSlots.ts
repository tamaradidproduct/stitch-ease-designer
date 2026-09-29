/**
 * A quick-slot / glossary entry identifies a (symbol, color) pen, not just a
 * symbol. The composite key is the single source of truth for that identity
 * - imported by both docStore (persistence) and the UI (rendering, arming),
 * never redefined inline at either site.
 *
 * Symbol ids come from the Figma-sourced registry and never contain `::`,
 * which is what makes a first-occurrence split unambiguous (DNT-9). Don't
 * introduce a symbol id that contains it.
 */
export function quickSlotKey(symbolId: string, colorId?: string | null): string {
  return colorId ? `${symbolId}::${colorId}` : symbolId;
}

export type ParsedQuickSlot = { symbolId: string; colorId: string | null };

/** Splits on the first `::` - see `quickSlotKey`'s DNT-9 note. */
export function parseQuickSlotId(key: string): ParsedQuickSlot {
  const at = key.indexOf("::");
  if (at === -1) return { symbolId: key, colorId: null };
  return { symbolId: key.slice(0, at), colorId: key.slice(at + 2) };
}

/** The two foundational stitches every fresh chart starts with (FR-32). */
export const DEFAULT_STITCH_IDS: readonly string[] = ["knit", "purl"];

export function assignQuickSlot(slots: readonly string[], key: string): string[] {
  if (slots.includes(key)) return [...slots];
  const openSlot = slots.indexOf("");
  if (openSlot !== -1) {
    return slots.map((slot, index) => (index === openSlot ? key : slot));
  }
  return [...slots, key];
}

/**
 * Swaps a quick slot with its neighbouring slot. Empty slots deliberately
 * participate in the swap: moving into one changes the number-key shortcut
 * without renumbering the other stitches.
 */
export function moveQuickSlot(slots: readonly string[], key: string, direction: -1 | 1): string[] {
  const from = slots.indexOf(key);
  const to = from + direction;
  if (from === -1 || to < 0) return [...slots];

  const next = [...slots];
  while (next.length <= to) next.push("");
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

/** Moves a slot to a target index by walking it through its adjacent neighbours. */
export function moveQuickSlotTo(slots: readonly string[], key: string, targetSlot: number): string[] {
  const start = slots.indexOf(key);
  if (start === -1 || start === targetSlot || targetSlot < 0) return [...slots];

  let next = slots;
  const direction: -1 | 1 = targetSlot < start ? -1 : 1;
  for (let slot = start; slot !== targetSlot; slot += direction) {
    next = moveQuickSlot(next, key, direction);
  }
  return [...next];
}

/**
 * Which edge of a hovered, *occupied* quick slot should carry the
 * insertion-line hover signifier while dragging another quick slot over it
 * (issue #271). `moveQuickSlotTo` walks the dragged slot through its
 * neighbours until it lands exactly at `targetSlot`, shifting everything
 * between the two indices over by one - so the slot that currently sits at
 * `targetSlot` ends up on the near side of wherever the drag came from: it
 * moves toward `draggedIndex`, and the dragged item takes its place. That
 * means the drop will land the dragged item on the far side of the target
 * from the drag's origin - after it when dragging forward (a lower index
 * onto a higher one), before it when dragging backward - which is the edge
 * this returns.
 *
 * `draggedIndex` is -1 when the dragged key isn't in the row yet (a glossary
 * overflow entry being promoted): `promoteQuickSlot` appends it past the
 * last slot first and only then walks it back to `targetSlot`, so it always
 * arrives from beyond the end - the same as a very large `draggedIndex`,
 * hence "before".
 *
 * Returns null only when hovering the slot the drag already started from -
 * dropping there is a no-op, matching `moveQuickSlotTo`'s own early-out.
 */
export function quickSlotInsertEdge(draggedIndex: number, targetSlot: number): "before" | "after" | null {
  if (draggedIndex === targetSlot) return null;
  if (draggedIndex === -1) return "before";
  return draggedIndex < targetSlot ? "after" : "before";
}

export function removeQuickSlot(slots: readonly string[], key: string): string[] {
  const at = slots.indexOf(key);
  if (at === -1) return [...slots];
  return slots.map((slot, index) => (index === at ? "" : slot));
}

/** Renames a slot's key in place (used by the DNT-12 rename-vs-mint path), preserving its position. */
function renameQuickSlot(slots: readonly string[], oldKey: string, newKey: string): string[] {
  const at = slots.indexOf(oldKey);
  if (at === -1) return [...slots];
  return slots.map((slot, index) => (index === at ? newKey : slot));
}

export { renameQuickSlot };
