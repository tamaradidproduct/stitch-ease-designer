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

  it("skips a malformed index entry instead of crashing the chart list", async () => {
    const storage = fakeStorage();
    // Valid JSON, but one entry is missing the fields list()'s sort relies on.
    storage.setItem(
      "stitchease:charts",
      JSON.stringify({
        good: {
          id: "good",
          name: "Good chart",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          rev: "r1",
        },
        bad: { id: "bad", name: "Bad chart" },
      }),
    );
    const store = createLocalDocStore(storage, { clock: monotonicClock() });

    const list = await store.list();
    expect(list.map((m) => m.id)).toEqual(["good"]);
  });

  it("rolls back the body write if the index write then fails, so conflict detection isn't silently broken", async () => {
    const real = fakeStorage();
    let failNextIndexWrite = false;
    const storage = {
      ...real,
      setItem: (key: string, value: string) => {
        if (key === "stitchease:charts" && failNextIndexWrite) {
          failNextIndexWrite = false;
          throw new DOMException("full", "QuotaExceededError");
        }
        real.setItem(key, value);
      },
    };
    const store = createLocalDocStore(storage, { clock: monotonicClock() });
    const created = await store.create("Gansey");

    failNextIndexWrite = true;
    await expect(
      store.save(created.id, [{ id: "t", symbolId: "knit", col: 0, row: 0 }], created.rev),
    ).rejects.toBeInstanceOf(StorageFullError);

    // A failed save must not leave the rev and the body out of step: either
    // the rev silently advancing while the body didn't (false conflicts
    // later) or the body advancing while the rev didn't (letting a stale
    // write sneak past the conflict check) is a broken guarantee.
    const loaded = await store.load(created.id);
    expect(loaded.meta.rev).toBe(created.rev);
    expect(loaded.placements).toHaveLength(0);

    // The original rev must still be honoured - proving the conflict-
    // detection contract survived the earlier failure intact.
    await store.save(created.id, [{ id: "t", symbolId: "knit", col: 0, row: 0 }], created.rev);
    const reloaded = await store.load(created.id);
    expect(reloaded.placements).toHaveLength(1);
  });
});
