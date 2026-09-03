import { describe, expect, it } from "vitest";
import { DocIndex } from "../model/docIndex";
import type { Placement } from "../model/types";
import { getSymbol } from "../symbols/registry";
import {
  ChartFormatError,
  STORED_VERSION,
  decode,
  emptyChart,
  encode,
  type StoredChart,
} from "./serialize";

const known = (id: string) => !!getSymbol(id);

const CABLE = "3_3_left_cable"; // 6 cells
const WIDE = "4_4_left_cable_hr"; // 12 cells

const place = (symbolId: string, col: number, row: number, id = `seed_${col}_${row}`) =>
  ({ id, symbolId, col, row }) as Placement;

describe("encode", () => {
  it("stores stitches as integer tuples against a palette, without ids", () => {
    const stored = encode([place("knit", 0, 0), place("purl", 1, 0), place("knit", 2, 0)]);

    expect(stored).toEqual({
      v: STORED_VERSION,
      palette: ["knit", "purl"],
      stitches: [
        [0, 0, 0],
        [1, 0, 1],
        [2, 0, 0],
      ],
      groups: [],
      repeats: [],
    });
    // No trace of the runtime ids anywhere in the output.
    expect(JSON.stringify(stored)).not.toContain("seed_");
  });

  it("is a pure function of contents, not of input order", () => {
    const a = encode([place("knit", 5, 2), place("purl", 0, 0), place(CABLE, 3, 1)]);
    const b = encode([place(CABLE, 3, 1), place("knit", 5, 2), place("purl", 0, 0)]);
    expect(a).toEqual(b);
    // Identical bytes, so autosave can cheaply skip a no-op write.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("handles an empty chart", () => {
    expect(encode([])).toEqual(emptyChart());
  });
});

describe("round trip", () => {
  it("preserves group membership and chart-local repeats", () => {
    const placements = [
      { ...place("knit", 0, 0), groupId: "group-a" },
      { ...place("purl", 1, 0), groupId: "group-a" },
    ];
    const repeats = [
      {
        id: "repeat-a",
        name: "Repeat 1",
        width: 2,
        height: 1,
        stitches: [
          { symbolId: "knit", col: 0, row: 0 },
          { symbolId: "purl", col: 1, row: 0 },
        ],
      },
    ];
    const decoded = decode(encode(placements, repeats), known);
    expect(decoded.placements.map((placement) => placement.groupId)).toEqual([
      "group-a",
      "group-a",
    ]);
    expect(decoded.repeats).toEqual(repeats);
  });

  const cases: Record<string, Placement[]> = {
    empty: [],
    "single stitch": [place("knit", 0, 0)],
    "multi-cell cable": [place(CABLE, 0, 0), place(WIDE, 0, 2)],
    "negative coordinates": [place("purl", -7, -3), place(CABLE, -20, -1)],
    "mixed field": [
      place("knit", 0, 0),
      place("purl", 1, 0),
      place(CABLE, 2, 0),
      place("yarn_over", 0, 1),
      place(WIDE, -5, 4),
    ],
  };

  for (const [name, placements] of Object.entries(cases)) {
    it(`survives encode → decode → encode unchanged: ${name}`, () => {
      const once = encode(placements);
      const { placements: back } = decode(once, known);
      const twice = encode(back);

      expect(twice).toEqual(once);
      expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
      expect(back).toHaveLength(placements.length);
    });
  }

  it("mints fresh unique ids rather than restoring the originals", () => {
    const placements = [place("knit", 0, 0), place("knit", 1, 0), place("knit", 2, 0)];
    const { placements: back } = decode(encode(placements), known);

    const ids = back.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).not.toMatch(/^seed_/);
  });

  it("rebuilds occupancy identically, spans included", () => {
    const placements = [place(CABLE, 0, 0), place("knit", 10, 0), place(WIDE, 0, 3)];
    const before = DocIndex.from(placements);
    const after = DocIndex.from(decode(encode(placements), known).placements);

    expect(after.size).toBe(before.size);
    expect(after.occupancy.size).toBe(before.occupancy.size);

    // The cable still claims all six of its cells after a round trip.
    for (let col = 0; col <= 5; col++) {
      expect(after.placementAt(col, 0)?.symbolId).toBe(CABLE);
    }
    expect(after.placementAt(6, 0)).toBeUndefined();
    expect(after.placementAt(11, 3)?.symbolId).toBe(WIDE);
  });
});

describe("unknown symbols", () => {
  const stored: StoredChart = {
    v: STORED_VERSION,
    palette: ["knit", "a_symbol_that_no_longer_exists"],
    stitches: [
      [0, 0, 0],
      [1, 0, 1],
    ],
  };

  it("reports them instead of failing", () => {
    const { unknownSymbolIds } = decode(stored, known);
    expect(unknownSymbolIds).toEqual(["a_symbol_that_no_longer_exists"]);
  });

  it("keeps the placements rather than silently dropping the data", () => {
    const { placements } = decode(stored, known);
    expect(placements).toHaveLength(2);
    expect(placements[1]!.symbolId).toBe("a_symbol_that_no_longer_exists");
  });

  it("reports nothing for a chart the library fully covers", () => {
    expect(decode(encode([place(CABLE, 0, 0)]), known).unknownSymbolIds).toEqual([]);
  });
});

describe("validation", () => {
  // Stored data comes from browser storage, an imported file, or the network —
  // all of it editable by someone. Malformed input must fail loudly.
  const bad: Record<string, unknown> = {
    null: null,
    "a string": "nope",
    "no version": { palette: [], stitches: [] },
    "future version": { v: 99, palette: [], stitches: [] },
    "palette not strings": { v: 1, palette: [1, 2], stitches: [] },
    "stitches not an array": { v: 1, palette: [], stitches: "no" },
    "stitch too short": { v: 1, palette: ["knit"], stitches: [[0, 0]] },
    "non-integer coordinate": { v: 1, palette: ["knit"], stitches: [[0.5, 0, 0]] },
    "palette index out of range": { v: 1, palette: ["knit"], stitches: [[0, 0, 3]] },
    "negative palette index": { v: 1, palette: ["knit"], stitches: [[0, 0, -1]] },
    "duplicate cell": { v: 1, palette: ["knit"], stitches: [[0, 0, 0], [0, 0, 0]] },
    "overlap within a cable span": {
      v: 1,
      palette: [CABLE, "knit"],
      stitches: [[0, 0, 0], [4, 0, 1]],
    },
  };

  for (const [name, input] of Object.entries(bad)) {
    it(`rejects ${name}`, () => {
      expect(() => decode(input, known)).toThrow(ChartFormatError);
    });
  }

  it("accepts a chart it just produced", () => {
    expect(() => decode(encode([place("knit", 0, 0)]), known)).not.toThrow();
  });

  it("survives a JSON string round trip, which is how imports arrive", () => {
    const stored = encode([place(CABLE, -2, 5), place("purl", 0, 0)]);
    const reparsed = JSON.parse(JSON.stringify(stored));
    expect(encode(decode(reparsed, known).placements)).toEqual(stored);
  });
});
