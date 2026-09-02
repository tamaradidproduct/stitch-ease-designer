import { describe, expect, it } from "vitest";
import { StorageFullError } from "./DocStore";
import { describeDocStoreContract } from "./docStore.contract";
import { createLocalDocStore, createMemoryDocStore } from "./keyValueDocStore";

/**
 * A clock that always moves forward.
 *
 * `new Date()` at millisecond resolution can hand two charts created
 * back-to-back the same timestamp, which would make "most recently updated
 * first" a coin flip and the ordering test flaky. Tests supply their own time.
 */
const monotonicClock = () => {
  let t = Date.UTC(2026, 0, 1);
  return () => new Date((t += 1000));
};

const fakeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

describeDocStoreContract("memory", () => createMemoryDocStore({ clock: monotonicClock() }));

describeDocStoreContract("browser storage", () =>
  createLocalDocStore(fakeStorage(), { clock: monotonicClock() }),
);

describe("browser storage specifics", () => {
  it("persists across store instances over the same storage", async () => {
    const storage = fakeStorage();
    const first = createLocalDocStore(storage, { clock: monotonicClock() });
    const created = await first.create("Peacock yoke");
    await first.save(created.id, [{ id: "t", symbolId: "knit", col: 3, row: 4 }], created.rev);

    // A fresh store, as if the page had been reloaded.
    const second = createLocalDocStore(storage, { clock: monotonicClock() });
    const loaded = await second.load(created.id);

    expect(loaded.meta.name).toBe("Peacock yoke");
    expect(loaded.placements).toHaveLength(1);
    expect(loaded.placements[0]).toMatchObject({ symbolId: "knit", col: 3, row: 4 });
  });

  it("surfaces a full disk as StorageFullError, not a raw DOMException", async () => {
    const storage = {
      ...fakeStorage(),
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    };
    const store = createLocalDocStore(storage, { clock: monotonicClock() });
    await expect(store.create()).rejects.toBeInstanceOf(StorageFullError);
  });

  it("survives a corrupt index instead of bricking the chart list", async () => {
    const storage = fakeStorage();
    storage.setItem("stitchease:charts", "{ this is not json");
    const store = createLocalDocStore(storage, { clock: monotonicClock() });

    expect(await store.list()).toEqual([]);
    // ...and is still usable afterwards.
    await store.create("recovered");
    expect((await store.list()).map((m) => m.name)).toEqual(["recovered"]);
  });
});
