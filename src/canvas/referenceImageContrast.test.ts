import { describe, expect, it } from "vitest";
import { applyContrastToPixels, effectiveContrast } from "./referenceImageContrast";

describe("applyContrastToPixels", () => {
  it("pushes channels away from mid-grey, clamps, and leaves alpha alone", () => {
    const px = new Uint8ClampedArray([100, 128, 200, 77, 10, 250, 128, 255]);
    applyContrastToPixels(px, 2);
    expect(Array.from(px)).toEqual([72, 128, 255, 77, 0, 255, 128, 255]);
  });

  it("is a no-op at 1", () => {
    const px = new Uint8ClampedArray([1, 2, 3, 4]);
    applyContrastToPixels(px, 1);
    expect(Array.from(px)).toEqual([1, 2, 3, 4]);
  });
});

describe("effectiveContrast", () => {
  it("treats absent or invalid values as unchanged and clamps the rest", () => {
    expect(effectiveContrast({})).toBe(1);
    expect(effectiveContrast({ contrast: NaN })).toBe(1);
    expect(effectiveContrast({ contrast: 9 })).toBe(3);
  });
});
