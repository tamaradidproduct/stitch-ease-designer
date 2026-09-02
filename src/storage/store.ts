import type { DocStore } from "./DocStore";
import { createLocalDocStore } from "./keyValueDocStore";

/**
 * Browser storage. The only store before accounts exist, and afterwards the
 * migration source + offline buffer — see `migrateLocalCharts.ts`.
 */
export const localChartStore: DocStore = createLocalDocStore();

let active: DocStore = localChartStore;

/**
 * Swap which backend `chartStore` delegates to — local before sign-in,
 * Supabase after. Call once per transition, before `ChartList`/`ChartEditor`
 * next read from it.
 */
export function setActiveChartStore(store: DocStore): void {
  active = store;
}

/**
 * The app's chart storage, as `ChartList` and `ChartEditor` see it.
 *
 * A thin delegator rather than a plain instance, so swapping backends
 * (`setActiveChartStore`) doesn't require touching either call site — they
 * import this same binding regardless of which account is signed in or
 * whether one is signed in at all.
 */
export const chartStore: DocStore = {
  list: (...args) => active.list(...args),
  create: (...args) => active.create(...args),
  load: (...args) => active.load(...args),
  save: (...args) => active.save(...args),
  rename: (...args) => active.rename(...args),
  remove: (...args) => active.remove(...args),
};
