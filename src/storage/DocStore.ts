import type { DocMeta, Placement, RepeatDefinition } from "../model/types";

/**
 * Where charts live.
 *
 * One interface, three implementations: in-memory for tests, browser storage
 * for the first release, and Supabase once accounts exist. Every one of them
 * is held to the same contract suite (`docStore.contract.ts`), which is what
 * makes swapping the backend later a mechanical change rather than a leap.
 *
 * Callers deal in `Placement[]`; encoding to the compact stored form is the
 * store's business, so nothing upstream ever handles `StoredChart`.
 */
export interface DocStore {
  /** Most recently updated first. */
  list(): Promise<DocMeta[]>;
  create(name?: string): Promise<DocMeta>;
  load(id: string): Promise<LoadedChart>;
  /**
   * `expectedRev` is the rev the caller loaded. If the stored chart has moved
   * on since, this rejects with `ChartConflictError` rather than overwriting.
   */
  save(
    id: string,
    placements: Placement[],
    expectedRev: string,
    repeats?: RepeatDefinition[],
  ): Promise<DocMeta>;
  rename(id: string, name: string): Promise<DocMeta>;
  remove(id: string): Promise<void>;
}

export type LoadedChart = {
  meta: DocMeta;
  placements: Placement[];
  repeats?: RepeatDefinition[];
  /** Symbols this build's library no longer has. See `decode` in serialize.ts. */
  unknownSymbolIds: string[];
};

export const DEFAULT_CHART_NAME = "Untitled chart";

export class ChartNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`chart ${id} not found`);
    this.name = "ChartNotFoundError";
  }
}

/** The stored chart changed since it was loaded — another tab, or another device. */
export class ChartConflictError extends Error {
  constructor(
    readonly id: string,
    readonly expectedRev: string,
    readonly actualRev: string,
  ) {
    super(`chart ${id} was changed elsewhere since it was loaded`);
    this.name = "ChartConflictError";
  }
}

/** Browser storage is full. Surfaced so the UI can tell the user to export and prune. */
export class StorageFullError extends Error {
  constructor(cause?: unknown) {
    super("out of browser storage space");
    this.name = "StorageFullError";
    this.cause = cause;
  }
}
