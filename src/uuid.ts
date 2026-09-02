/**
 * A random, unique-enough id, for any caller that just needs one — a
 * placement id, a chart id, an opaque revision token. `prefix` (only used by
 * the fallback path, since `crypto.randomUUID` output needs no help) is
 * purely a debugging aid for telling id kinds apart in raw stored JSON.
 */
export const newUuid = (prefix = ""): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${prefix}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
