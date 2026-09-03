import type { DocMeta, Placement } from "../model/types";
import { getSymbol } from "../symbols/registry";
import { newUuid } from "../uuid";
import {
  ChartConflictError,
  ChartNotFoundError,
  DEFAULT_CHART_NAME,
  type DocStore,
  type LoadedChart,
  StorageFullError,
} from "./DocStore";
import { decode, emptyChart, encode } from "./serialize";

/**
 * A `DocStore` over any synchronous key-value store.
 *
 * The in-memory store (tests) and the browser store (the first release) differ
 * only in where bytes land, so they share this implementation and therefore
 * share their semantics exactly — conflict detection included. Supabase gets
 * its own implementation but is held to the same contract suite.
 *
 * Charts are stored one key each, with a separate index of metadata, so saving
 * one chart doesn't rewrite every other chart, and listing doesn't parse them.
 */

const INDEX_KEY = "stitchease:charts";
const chartKey = (id: string) => `stitchease:chart:${id}`;

export type KeyValueBackend = {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
};

export type DocStoreOptions = {
  /** Injectable for deterministic ordering in tests. */
  clock?: () => Date;
  /** Injectable so the store isn't welded to the symbol registry. */
  knownSymbol?: (id: string) => boolean;
};

type Index = Record<string, DocMeta>;

export function createKeyValueDocStore(
  backend: KeyValueBackend,
  options: DocStoreOptions = {},
): DocStore {
  const clock = options.clock ?? (() => new Date());
  const knownSymbol = options.knownSymbol ?? ((id: string) => !!getSymbol(id));
  const stamp = () => clock().toISOString();

  const isDocMeta = (v: unknown): v is DocMeta => {
    if (typeof v !== "object" || v === null) return false;
    const m = v as Record<string, unknown>;
    return (
      typeof m.id === "string" &&
      typeof m.name === "string" &&
      typeof m.createdAt === "string" &&
      typeof m.updatedAt === "string" &&
      typeof m.rev === "string"
    );
  };

  const readIndex = (): Index => {
    const raw = backend.read(INDEX_KEY);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};
      const index: Index = {};
      for (const [id, meta] of Object.entries(parsed as Record<string, unknown>)) {
        // A single malformed entry (valid JSON, wrong shape) shouldn't brick
        // list()'s sort or crash the whole chart list - drop just that one.
        if (isDocMeta(meta)) index[id] = meta;
      }
      return index;
    } catch {
      // A corrupt index would otherwise brick the chart list on every load.
      // The chart bodies are still under their own keys, so this is
      // recoverable by hand rather than fatal.
      return {};
    }
  };

  const writeIndex = (index: Index) => backend.write(INDEX_KEY, JSON.stringify(index));

  const requireMeta = (index: Index, id: string): DocMeta => {
    const meta = index[id];
    if (!meta) throw new ChartNotFoundError(id);
    return meta;
  };

  return {
    async list(): Promise<DocMeta[]> {
      return Object.values(readIndex()).sort(
        // Ties broken by id so ordering is total, not merely mostly-sorted.
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
      );
    },

    async create(name = DEFAULT_CHART_NAME): Promise<DocMeta> {
      const at = stamp();
      const meta: DocMeta = {
        id: newUuid("c_"),
        name,
        createdAt: at,
        updatedAt: at,
        rev: newUuid("rev_"),
      };
      const index = readIndex();
      index[meta.id] = meta;
      backend.write(chartKey(meta.id), JSON.stringify(emptyChart()));
      writeIndex(index);
      return meta;
    },

    async load(id: string): Promise<LoadedChart> {
      const meta = requireMeta(readIndex(), id);
      const raw = backend.read(chartKey(id));
      if (raw === null) throw new ChartNotFoundError(id);
      const { placements, repeats, unknownSymbolIds } = decode(JSON.parse(raw), knownSymbol);
      return { meta, placements, repeats, unknownSymbolIds };
    },

    async save(id, placements: Placement[], expectedRev: string, repeats = []): Promise<DocMeta> {
      const index = readIndex();
      const current = requireMeta(index, id);
      if (current.rev !== expectedRev) {
        throw new ChartConflictError(id, expectedRev, current.rev);
      }

      // Chart body first: if the index said "saved" but the body write failed,
      // the next load would hand back stale stitches under a fresh rev.
      const previousBody = backend.read(chartKey(id));
      backend.write(chartKey(id), JSON.stringify(encode(placements, repeats)));

      const meta: DocMeta = { ...current, updatedAt: stamp(), rev: newUuid("rev_") };
      try {
        index[id] = meta;
        writeIndex(index);
      } catch (error) {
        // The body already changed but the index (and so `current.rev`)
        // didn't; left alone, a later save still holding the old rev would
        // pass the conflict check above and silently overwrite this one -
        // exactly what `expectedRev` exists to prevent. Best-effort restore
        // the previous body so a failed save leaves nothing changed, rather
        // than leaving the rev the only thing that failed to update.
        if (previousBody !== null) {
          try {
            backend.write(chartKey(id), previousBody);
          } catch {
            // Storage is evidently still full; the original error below is
            // what the caller needs to see regardless.
          }
        }
        throw error;
      }
      return meta;
    },

    async rename(id: string, name: string): Promise<DocMeta> {
      const index = readIndex();
      const current = requireMeta(index, id);
      const meta: DocMeta = { ...current, name, updatedAt: stamp(), rev: newUuid("rev_") };
      index[id] = meta;
      writeIndex(index);
      return meta;
    },

    async remove(id: string): Promise<void> {
      const index = readIndex();
      requireMeta(index, id);
      delete index[id];
      writeIndex(index);
      backend.remove(chartKey(id));
    },
  };
}

/** For tests, and any caller that wants a throwaway store. */
export function createMemoryDocStore(options: DocStoreOptions = {}): DocStore {
  const map = new Map<string, string>();
  return createKeyValueDocStore(
    {
      read: (key) => map.get(key) ?? null,
      write: (key, value) => void map.set(key, value),
      remove: (key) => void map.delete(key),
    },
    options,
  );
}

/**
 * Browser storage. This is the shipping store for the first release, not
 * scaffolding — the group uses it for real before accounts exist.
 *
 * localStorage caps out around 5 MB. With the compact format a typical chart is
 * tens of KB, so that's plenty, but a garment-scale chart runs to a few hundred
 * KB and enough of them will fill it. Quota failures surface as
 * `StorageFullError` so the UI can tell the user to export and prune rather
 * than failing an autosave silently.
 */
export function createLocalDocStore(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = window.localStorage,
  options: DocStoreOptions = {},
): DocStore {
  return createKeyValueDocStore(
    {
      read: (key) => storage.getItem(key),
      write: (key, value) => {
        try {
          storage.setItem(key, value);
        } catch (error) {
          if (isQuotaError(error)) throw new StorageFullError(error);
          throw error;
        }
      },
      remove: (key) => storage.removeItem(key),
    },
    options,
  );
}

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" ||
    // Firefox's legacy name for the same condition.
    error.name === "NS_ERROR_DOM_QUOTA_REACHED");
