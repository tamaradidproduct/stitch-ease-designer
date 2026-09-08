import { describe, expect, it } from "vitest";
import {
  type BinaryGrid,
  MAX_EXEMPLARS_PER_SYMBOL,
  binarizeCrop,
  computeGridSimilarity,
  isCellBlank,
  matchCandidateStitch,
  selectDiverseExemplars,
} from "./templateMatch";

/**
 * A duck-typed stand-in for an `HTMLCanvasElement`, supplying exactly the
 * pixel data `binarizeCrop` reads (`getContext("2d").getImageData(...)`).
 * There's no real canvas in this test environment, but `binarizeCrop` only
 * ever calls that one method, so a plain object satisfies it at runtime -
 * the cast past the real type is deliberate.
 */
function fakeCanvas(width: number, height: number, pixels: (x: number, y: number) => number): HTMLCanvasElement {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const lum = pixels(x, y);
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = lum;
      data[i + 3] = 255;
    }
  }
  return {
    width,
    height,
    getContext: () => ({ getImageData: () => ({ data }) }),
  } as unknown as HTMLCanvasElement;
}

function createGrid(width: number, height: number, pattern: string[]): BinaryGrid {
  const data = new Uint8Array(width * height);
  let inkCount = 0;
  for (let y = 0; y < height; y++) {
    const row = pattern[y] || "";
    for (let x = 0; x < width; x++) {
      if (row[x] === "#") {
        data[y * width + x] = 1;
        inkCount++;
      }
    }
  }
  return { width, height, data, inkCount, inkRatio: inkCount / (width * height) };
}

describe("templateMatch", () => {
  const slash = createGrid(8, 8, [
    "      ##",
    "     ## ",
    "    ##  ",
    "   ##   ",
    "  ##    ",
    " ##     ",
    "##      ",
    "#       ",
  ]);

  const slashShifted = createGrid(8, 8, [
    "       #",
    "      ##",
    "     ## ",
    "    ##  ",
    "   ##   ",
    "  ##    ",
    " ##     ",
    "##      ",
  ]);

  const backslash = createGrid(8, 8, [
    "##      ",
    " ##     ",
    "  ##    ",
    "   ##   ",
    "    ##  ",
    "     ## ",
    "      ##",
    "       #",
  ]);

  const dash = createGrid(8, 8, [
    "        ",
    "        ",
    "        ",
    " ###### ",
    " ###### ",
    "        ",
    "        ",
    "        ",
  ]);

  const empty = createGrid(8, 8, [
    "        ",
    "        ",
    "        ",
    "        ",
    "        ",
    "        ",
    "        ",
    "        ",
  ]);

  describe("isCellBlank", () => {
    it("recognizes empty grid as blank", () => {
      expect(isCellBlank(empty)).toBe(true);
    });

    it("recognizes marked grid as not blank", () => {
      expect(isCellBlank(slash)).toBe(false);
      expect(isCellBlank(dash)).toBe(false);
    });
  });

  describe("computeGridSimilarity", () => {
    it("returns 1.0 for identical shapes", () => {
      expect(computeGridSimilarity(slash, slash)).toBe(1.0);
      expect(computeGridSimilarity(dash, dash)).toBe(1.0);
      expect(computeGridSimilarity(empty, empty)).toBe(1.0);
    });

    it("absorbs 1-2px translation shifts", () => {
      const score = computeGridSimilarity(slash, slashShifted, 2);
      expect(score).toBeGreaterThan(0.85);
    });

    it("has very low similarity between opposing symbols", () => {
      const slashVsBackslash = computeGridSimilarity(slash, backslash, 2);
      expect(slashVsBackslash).toBeLessThan(0.25);

      const slashVsDash = computeGridSimilarity(slash, dash, 2);
      expect(slashVsDash).toBeLessThan(0.35);
    });
  });

  describe("matchCandidateStitch", () => {
    const exemplars = new Map<string, BinaryGrid[]>([
      ["k2tog", [slash]],
      ["skpo", [backslash]],
      ["purl", [dash]],
    ]);

    it("correctly identifies slash as k2tog even with slight shift", () => {
      const result = matchCandidateStitch(slashShifted, exemplars, 0.6);
      expect(result.symbolId).toBe("k2tog");
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.isBlank).toBe(false);
    });

    it("correctly identifies backslash as skpo", () => {
      const result = matchCandidateStitch(backslash, exemplars, 0.6);
      expect(result.symbolId).toBe("skpo");
      expect(result.confidence).toBe(1.0);
    });

    it("defaults an unmatched empty cell to Knit", () => {
      // Knit is the standard blank chart cell. A confirmed blank sample for
      // another stitch overrides this below, but no samples is not a reason
      // to make tracing an otherwise empty chart stall.
      const result = matchCandidateStitch(empty, exemplars, 0.6);
      expect(result.symbolId).toBe("knit");
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result.isBlank).toBe(true);
    });

    it("keeps the Knit fallback when Knit has been sampled", () => {
      // The Knit exemplar can be imperfect (here, visibly marked), yet an
      // otherwise empty square still follows the usual chart convention.
      const withKnit = new Map<string, BinaryGrid[]>([...exemplars, ["knit", [slash]]]);
      const result = matchCandidateStitch(empty, withKnit, 0.6);
      expect(result.symbolId).toBe("knit");
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result.isBlank).toBe(true);
    });

    it("matches an empty cell to whichever symbol was confirmed blank", () => {
      // A chart where purl, not knit, is the blank square - the mapping is
      // learned from what the designer actually confirmed, never assumed.
      const withBlankPurl = new Map<string, BinaryGrid[]>([...exemplars, ["purl", [dash, empty]]]);
      const result = matchCandidateStitch(empty, withBlankPurl, 0.6);
      expect(result.symbolId).toBe("purl");
      expect(result.confidence).toBe(1.0);
    });

    it("lets an explicit non-Knit blank sample override the Knit default", () => {
      const withKnitAndBlankPurl = new Map<string, BinaryGrid[]>([
        ...exemplars,
        ["knit", [slash]],
        ["purl", [dash, empty]],
      ]);
      const result = matchCandidateStitch(empty, withKnitAndBlankPurl, 0.6);
      expect(result.symbolId).toBe("purl");
      expect(result.confidence).toBe(1.0);
    });

    it("matches a genuinely faint real symbol instead of assuming knit", () => {
      // A real exemplar sparse enough to read as "blank" on its own ink
      // ratio - a lightly-drawn yarn over on a washed-out photo, say.
      // Deciding "blank" before ever comparing against what's been taught
      // used to make this an automatic, falsely-confident knit; matching
      // has to get first look at a candidate, with blank only as the
      // fallback for when nothing else fits.
      const faintMark = createGrid(8, 8, [
        "        ",
        "        ",
        "        ",
        "   #    ",
        "    #   ",
        "        ",
        "        ",
        "        ",
      ]);
      expect(isCellBlank(faintMark)).toBe(true);

      const withFaintExemplar = new Map<string, BinaryGrid[]>([
        ...exemplars,
        ["yarn_over", [faintMark]],
      ]);
      const result = matchCandidateStitch(faintMark, withFaintExemplar);
      expect(result.symbolId).toBe("yarn_over");
      expect(result.isBlank).toBe(false);
    });

    it("uses the Knit fallback when no exemplars exist yet", () => {
      // A blank chart can be traced before any teaching samples have been
      // placed; Knit is the safe default until a confirmed blank sample says
      // otherwise.
      const result = matchCandidateStitch(empty, new Map());
      expect(result.symbolId).toBe("knit");
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result.isBlank).toBe(true);
    });

    it("withholds a guess when two different symbols score nearly identically", () => {
      // Two exemplars for different symbols that happen to look the same -
      // the tie a real chart produces when SKPO and K2TOG are drawn as
      // mirror-image diagonals. A coin flip here is worse than asking.
      const tied = new Map<string, BinaryGrid[]>([
        ["k2tog", [slash]],
        ["skpo", [slash]],
      ]);
      const result = matchCandidateStitch(slash, tied, 0.6);
      expect(result.symbolId).toBeNull();
      expect(result.confidence).toBe(1.0);
    });

    it("still commits when the runner-up is a clear step behind", () => {
      const result = matchCandidateStitch(slashShifted, exemplars, 0.6);
      expect(result.symbolId).toBe("k2tog");
    });

    it("returns null symbolId when no template matches above threshold", () => {
      const unknownCross = createGrid(8, 8, [
        "   ##   ",
        "   ##   ",
        "########",
        "########",
        "   ##   ",
        "   ##   ",
        "   ##   ",
        "   ##   ",
      ]);
      const result = matchCandidateStitch(unknownCross, exemplars, 0.7);
      expect(result.symbolId).toBeNull();
      expect(result.confidence).toBeLessThan(0.7);
    });
  });
});

describe("binarizeCrop", () => {
  const W = 32;
  const WHITE = 250;
  const INK = 20;

  it("reads a centred blob's ink ratio correctly on a clean white margin", () => {
    // A 10x10 dark square in the middle of an otherwise untouched crop -
    // the margin this samples from is pure background, so mean and median
    // agree and this is really a sanity check on the ink count itself.
    const grid = binarizeCrop(
      fakeCanvas(W, W, (x, y) => (x >= 11 && x < 21 && y >= 11 && y < 21 ? INK : WHITE)),
    );
    expect(grid.inkRatio).toBeCloseTo(100 / (W - 2 * 4) ** 2, 2);
    expect(isCellBlank(grid)).toBe(false);
  });

  it("still finds a diagonal's soft anti-aliased edge, even with a heavily contaminated border", () => {
    // The real bug, reproduced at the scale actually measured: a diagonal
    // stitch (SKPO, K2tog) reaches this crop's own margin, and on a real
    // photographed chart that margin also picks up a sliver of grid line
    // and, sometimes, the edge of a neighbouring stitch - on real exported
    // chart crops, up to 36% of the sampled margin came back reading dark.
    // A mean over a margin that contaminated is pulled far enough down to
    // shrink the contrast threshold and misread a diagonal's own softer,
    // anti-aliased edge pixels as background - which is most of a thin
    // line's total area, not just its hard core. That dropped SKPO, K2tog
    // and Yarn over below the blank cutoff outright; only Purl, whose ink
    // sits away from any edge, was unaffected.
    const insetX = 4;
    const isBorder = (x: number, y: number) =>
      x < insetX || x >= W - insetX || y < insetX || y >= W - insetX;
    const grid = binarizeCrop(
      fakeCanvas(W, W, (x, y) => {
        // 40% of the border reads dark - matches the measured contamination.
        if (isBorder(x, y)) return (x + y) % 5 < 2 ? 120 : WHITE;
        // A diagonal core plus its anti-aliased edge: the edge sits right at
        // the boundary a contaminated threshold misses and a clean one
        // doesn't - the actual, measurable effect of the bug.
        const d = Math.abs(x - y);
        if (d <= 1) return INK;
        if (d <= 3) return 145;
        return WHITE;
      }),
    );
    expect(isCellBlank(grid)).toBe(false);
    expect(grid.inkRatio).toBeGreaterThan(0.15);
  });
});

describe("selectDiverseExemplars", () => {
  it("keeps everything when there's no more than the cap", () => {
    const items = [{ col: 0, row: 0 }, { col: 5, row: 5 }];
    expect(selectDiverseExemplars(items, 5)).toEqual(items);
  });

  it("prefers points spread apart over a tight cluster", () => {
    // Three points crammed into one corner and one far away in the other -
    // capping to 2 should keep the far one, not two from the cluster.
    const cluster = [
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
    ];
    const far = { col: 100, row: 100 };
    const chosen = selectDiverseExemplars([...cluster, far], 2);
    expect(chosen).toHaveLength(2);
    expect(chosen).toContainEqual(far);
  });

  it("never returns more than the cap even with many candidates", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ col: i, row: i * 2 }));
    expect(selectDiverseExemplars(many, MAX_EXEMPLARS_PER_SYMBOL)).toHaveLength(
      MAX_EXEMPLARS_PER_SYMBOL,
    );
  });

  it("spreads selections across the full range rather than growing outward from one end", () => {
    // A line of 20 evenly-spaced points - a good cap-of-4 selection should
    // land roughly at the ends and the middle, not cluster near wherever
    // the first pick happened to be.
    const line = Array.from({ length: 20 }, (_, i) => ({ col: i, row: 0 }));
    const chosen = selectDiverseExemplars(line, 4)
      .map((p) => p.col)
      .sort((a, b) => a - b);
    // The two extremes are always worth keeping - they're never closer to
    // an already-chosen point than something nearer the middle is.
    expect(chosen[0]).toBeLessThan(3);
    expect(chosen[chosen.length - 1]).toBeGreaterThan(16);
  });
});
