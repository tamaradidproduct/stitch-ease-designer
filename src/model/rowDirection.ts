export type RowDirection = "rtl" | "ltr";

/**
 * Which way a row is read/knit, for anything that needs to shift stitches
 * "along" a row - currently just Insert.
 *
 * Every row is right-to-left for now, matching the fixed assumption
 * `stitchNumbers.ts` also makes (`roundStitchNumbers` numbers right to
 * left). This is the one seam to change when a designer can set direction
 * per row: swap the constant return for a lookup keyed on `row`, and both
 * `insertPlacement`'s shift math and the numbering in `stitchNumbers.ts`
 * should read from it instead of assuming right-to-left.
 */
export function rowDirectionAt(_row: number): RowDirection {
  return "rtl";
}
