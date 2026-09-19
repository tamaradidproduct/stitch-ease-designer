import { describe, expect, it } from "vitest";
import { createFakeChartsTable, createFakeSupabaseClient } from "./fakePostgrest";
import { metaFromRow, createSupabaseChartStore } from "./supabaseChartStore";
import { describeChartStoreContract } from "./chartStore.contract";

const monotonicClock = () => {
  let t = Date.UTC(2026, 0, 1);
  return () => new Date((t += 1000));
};

describeChartStoreContract("supabase (fake postgrest)", () => {
  const table = createFakeChartsTable();
  const client = createFakeSupabaseClient(table, monotonicClock());
  return createSupabaseChartStore(client);
});

describe("metaFromRow", () => {
  it("maps snake_case DB columns to the app's DocMeta", () => {
    expect(
      metaFromRow({
        id: "abc",
        name: "Peacock yoke",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        rev: "rev-1",
      }),
    ).toEqual({
      id: "abc",
      name: "Peacock yoke",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      rev: "rev-1",
    });
  });
});
