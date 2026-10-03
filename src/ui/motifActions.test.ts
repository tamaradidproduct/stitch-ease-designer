import { beforeEach, describe, expect, it } from "vitest";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { eraseKeepingMotifStitches } from "./motifActions";

const doc = () => useDocStore.getState();
const at = (col: number, row: number) => doc().index.placementAt(col, row);

describe("eraseKeepingMotifStitches", () => {
  beforeEach(() => {
    useDocStore.setState({ meta: null });
    doc().openChart({
      meta: { id: "c", name: "c", createdAt: "", updatedAt: "", rev: "r" },
      placements: [
        { id: "a", symbolId: "purl", col: 0, row: 0 },
        { id: "b", symbolId: "knit", col: 1, row: 0 },
        { id: "loose", symbolId: "purl", col: 5, row: 5 },
      ],
      unknownSymbolIds: [],
    });
    const motifId = doc().createRepeat(["a", "b"])!;
    doc().stampMotif(motifId, [{ col: 0, row: 2 }]);
  });

  it("keeps stitches from copies the selection only partly covers, and says so", () => {
    // "Select all purl": one purl in each copy plus the loose one.
    const purls = doc().index.toArray().filter((p) => p.symbolId === "purl").map((p) => p.id);
    expect(eraseKeepingMotifStitches(purls)).toBe(2);
    expect(at(5, 5)).toBeUndefined();
    expect(at(0, 0)!.symbolId).toBe("purl");
    expect(at(0, 2)!.symbolId).toBe("purl");
    expect(useUiStore.getState().motifNotice).toMatch(/^Kept 2 stitches inside Motif 1/);
  });

  it("deletes a whole selected copy, and a single stitch picked out on purpose", () => {
    const copy = doc().index.groupMembers(at(0, 2)!.groupId!).map((p) => p.id);
    expect(eraseKeepingMotifStitches(copy)).toBe(0);
    expect(at(0, 2)).toBeUndefined();

    expect(eraseKeepingMotifStitches([at(1, 0)!.id])).toBe(0);
    expect(at(1, 0)).toBeUndefined();
  });
});
