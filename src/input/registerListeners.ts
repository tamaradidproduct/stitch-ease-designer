/**
 * One `addEventListener` call's worth of arguments, as a tuple.
 *
 * `listener` is deliberately untyped (`(ev: any) => any`) rather than
 * `EventListenerOrEventListenerObject`: callers pass handlers typed to their
 * own specific event (`(e: PointerEvent) => void`, `(e: KeyboardEvent) =>
 * void`, ...), and checking those contravariantly against the general
 * `Event`-typed listener signature would force an `as EventListener` cast at
 * every call site. The cast happens once, internally, instead.
 */
export type ListenerEntry = readonly [
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see doc comment above
  listener: (ev: any) => any,
  options?: boolean | AddEventListenerOptions,
];

/**
 * Registers a batch of event listeners on `target`, in the order given, and
 * returns one cleanup function that removes exactly them - the same
 * (addEventListener, addEventListener, ..., removeEventListener,
 * removeEventListener, ...) pair every canvas-event hook otherwise
 * hand-rolls, collapsed to one call each.
 *
 * It only removes the boilerplate: registration order, event types, and
 * options are exactly what the caller passes, in the exact order given -
 * usePanZoom, usePaintTool, useTouchGestures, useReferenceImageTool, and
 * useShortcuts all attach to the same canvas element (or window), and their
 * relative registration order is what CanvasView's
 * `stopImmediatePropagation` coordination between them depends on. This
 * helper changes nothing about that order; it only has to be called in the
 * same relative order the hooks already run in.
 */
export function registerListeners(target: EventTarget, entries: readonly ListenerEntry[]): () => void {
  for (const [type, listener, options] of entries) {
    target.addEventListener(type, listener as EventListener, options);
  }
  return () => {
    for (const [type, listener, options] of entries) {
      target.removeEventListener(type, listener as EventListener, options);
    }
  };
}
