/**
 * A minimal fake of the `supabase-js` PostgREST query builder, faithful
 * enough to run `docStore.contract.ts` against `createSupabaseDocStore`.
 *
 * Only implements the exact call shapes `supabaseDocStore.ts` actually uses:
 * `select().order()`, `select().eq().maybeSingle()`, `insert().select().single()`,
 * `update().eq()[.eq()].select().maybeSingle()`, `delete().eq().select().maybeSingle()`.
 * Not a general PostgREST mock — extend the chain shapes here if the store
 * grows a new query pattern.
 *
 * What it deliberately does NOT model: row-level security. There's no
 * concept of "another user's row" here, so this can't stand in for the RLS
 * verification the plan calls for — that has to be two real accounts against
 * the live project. What this fake *does* buy is confidence in this file's
 * own control flow: the conditional-update conflict check, not-found via a
 * null `maybeSingle`, and insert's server-assigned defaults, all exercised
 * through the same assertions the local and in-memory stores are held to.
 */

type Row = {
  id: string;
  name: string;
  data: unknown;
  rev: string;
  created_at: string;
  updated_at: string;
};

export type FakeTable = { rows: Map<string, Row> };

export function createFakeChartsTable(): FakeTable {
  return { rows: new Map() };
}

type Resolved = { data: unknown; error: null } | { data: null; error: { message: string } };

class Builder {
  private filters: [string, unknown][] = [];
  private columns: string[] | null = null;
  private pendingPatch: Partial<Row> | null = null;
  private pendingInsert: Partial<Row> | null = null;
  private pendingDelete = false;
  private orderCol: string | null = null;
  private orderAsc = true;

  constructor(
    private readonly table: FakeTable,
    private readonly clock: () => Date,
  ) {}

  select(columns: string): this {
    this.columns = columns.split(",").map((c) => c.trim());
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push([col, val]);
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  insert(patch: Partial<Row> & { name?: string }): this {
    this.pendingInsert = patch;
    return this;
  }

  update(patch: Partial<Row>): this {
    this.pendingPatch = patch;
    return this;
  }

  delete(): this {
    this.pendingDelete = true;
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(([col, val]) => (row as Record<string, unknown>)[col] === val);
  }

  private project(row: Row): unknown {
    if (!this.columns || this.columns.includes("*")) return row;
    const out: Record<string, unknown> = {};
    for (const c of this.columns) out[c] = (row as Record<string, unknown>)[c];
    return out;
  }

  /** `.single()` — insert path only; throws (as the real client does) on no row. */
  async single(): Promise<Resolved> {
    const result = await this.resolve();
    if (!result.data) return { data: null, error: { message: "no rows returned" } };
    return result;
  }

  /** `.maybeSingle()` — select/update/delete paths; null data is a valid, non-error result. */
  async maybeSingle(): Promise<Resolved> {
    return this.resolve();
  }

  private async resolve(): Promise<Resolved> {
    if (this.pendingInsert) {
      const at = this.clock().toISOString();
      const row: Row = {
        id: crypto.randomUUID(),
        name: this.pendingInsert.name ?? "Untitled chart",
        data: this.pendingInsert.data ?? { v: 1, palette: [], stitches: [] },
        rev: crypto.randomUUID(),
        created_at: at,
        updated_at: at,
      };
      this.table.rows.set(row.id, row);
      return { data: this.project(row), error: null };
    }

    const matching = [...this.table.rows.values()].filter((r) => this.matches(r));

    if (this.pendingDelete) {
      const row = matching[0];
      if (!row) return { data: null, error: null };
      this.table.rows.delete(row.id);
      return { data: this.project(row), error: null };
    }

    if (this.pendingPatch) {
      const row = matching[0];
      if (!row) return { data: null, error: null };
      const updated: Row = {
        ...row,
        ...this.pendingPatch,
        rev: crypto.randomUUID(),
        updated_at: this.clock().toISOString(),
      };
      this.table.rows.set(row.id, updated);
      return { data: this.project(updated), error: null };
    }

    // Plain select.
    if (this.orderCol) {
      const col = this.orderCol;
      matching.sort((a, b) => {
        const av = String((a as Record<string, unknown>)[col]);
        const bv = String((b as Record<string, unknown>)[col]);
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return { data: matching.map((r) => this.project(r)), error: null };
    }

    const row = matching[0];
    return { data: row ? this.project(row) : null, error: null };
  }

  // Awaiting the builder itself (no terminal call) resolves a bare select-many.
  then<T>(onfulfilled: (value: Resolved) => T) {
    return this.resolve().then(onfulfilled);
  }
}

/** Enough of `SupabaseClient` for `createSupabaseDocStore` to run against. */
export function createFakeSupabaseClient(
  table: FakeTable,
  clock: () => Date = () => new Date(),
) {
  return {
    from: (_table: string) => new Builder(table, clock),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
