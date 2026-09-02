import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocMeta, Placement } from "../model/types";
import { getSymbol } from "../symbols/registry";
import {
  ChartConflictError,
  ChartNotFoundError,
  DEFAULT_CHART_NAME,
  type DocStore,
  type LoadedChart,
} from "./DocStore";
import { decode, emptyChart, encode } from "./serialize";

/** Shape of a `public.charts` row as it comes back from PostgREST. */
type ChartRow = {
  id: string;
  name: string;
  data: unknown;
  rev: string;
  created_at: string;
  updated_at: string;
};

/**
 * Row -> DocMeta. Pulled out as a pure function so the field mapping (the
 * part most likely to silently drift if the schema changes) is unit-testable
 * without a live database.
 */
export function metaFromRow(row: Pick<ChartRow, "id" | "name" | "created_at" | "updated_at" | "rev">): DocMeta {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rev: row.rev,
  };
}

/**
 * A `DocStore` backed by the `public.charts` table.
 *
 * No `user_id` is ever sent by the client: the column defaults to
 * `auth.uid()` on insert, row-level security scopes every select/update/
 * delete to it, and `charts_touch()` pins it against change on update. The
 * client can't claim to be someone else even by accident.
 *
 * Held to the same `docStore.contract.ts` suite as the local and in-memory
 * stores (run manually against a live project — see README), which is what
 * makes this swap-in behind the `DocStore` interface a real guarantee rather
 * than a hope.
 */
export function createSupabaseDocStore(client: SupabaseClient): DocStore {
  const knownSymbol = (id: string) => !!getSymbol(id);

  return {
    async list(): Promise<DocMeta[]> {
      const { data, error } = await client
        .from("charts")
        .select("id, name, created_at, updated_at, rev")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as ChartRow[]).map(metaFromRow);
    },

    async create(name = DEFAULT_CHART_NAME): Promise<DocMeta> {
      const { data, error } = await client
        .from("charts")
        .insert({ name, data: emptyChart() })
        .select("id, name, created_at, updated_at, rev")
        .single();
      if (error) throw error;
      return metaFromRow(data as ChartRow);
    },

    async load(id: string): Promise<LoadedChart> {
      const { data, error } = await client
        .from("charts")
        .select("id, name, created_at, updated_at, rev, data")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      // RLS makes another designer's chart id look identical to a missing
      // one - a select on it returns zero rows, not a 403. Both are reported
      // the same way here, which is the honest thing to tell the caller: from
      // this account's point of view, that chart simply doesn't exist.
      if (!data) throw new ChartNotFoundError(id);

      const row = data as ChartRow;
      const { placements, unknownSymbolIds } = decode(row.data, knownSymbol);
      return { meta: metaFromRow(row), placements, unknownSymbolIds };
    },

    async save(id: string, placements: Placement[], expectedRev: string): Promise<DocMeta> {
      const { data, error } = await client
        .from("charts")
        .update({ data: encode(placements) })
        .eq("id", id)
        .eq("rev", expectedRev)
        .select("id, name, created_at, updated_at, rev")
        .maybeSingle();
      if (error) throw error;
      if (data) return metaFromRow(data as ChartRow);

      // The conditional update touched nothing. Distinguish "no such chart"
      // from "it moved on since you loaded it" with one more read - the two
      // need different handling upstream (not-found vs. a conflict banner).
      const { data: current, error: checkError } = await client
        .from("charts")
        .select("rev")
        .eq("id", id)
        .maybeSingle();
      if (checkError) throw checkError;
      if (!current) throw new ChartNotFoundError(id);
      throw new ChartConflictError(id, expectedRev, (current as { rev: string }).rev);
    },

    async rename(id: string, name: string): Promise<DocMeta> {
      const { data, error } = await client
        .from("charts")
        .update({ name })
        .eq("id", id)
        .select("id, name, created_at, updated_at, rev")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ChartNotFoundError(id);
      return metaFromRow(data as ChartRow);
    },

    async remove(id: string): Promise<void> {
      const { data, error } = await client
        .from("charts")
        .delete()
        .eq("id", id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new ChartNotFoundError(id);
    },
  };
}
