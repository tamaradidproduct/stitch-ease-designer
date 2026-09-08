import { describe, expect, it } from "vitest";
import { detectGridCell } from "./referenceGridDetection";

function gridImage(width = 80, height = 80): ImageData {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = x % 20 === 0 || y % 20 === 0 ? 35 : 245;
    const i = (y * width + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("detectGridCell", () => {
  it("snaps a rough box to nearby chart lines", () => {
    const result = detectGridCell(gridImage(), { left: 18, top: 21, right: 43, bottom: 39 });
    expect(result).toMatchObject({ left: 20, top: 20, right: 40, bottom: 40 });
  });

  it("rejects a flat image without confident edges", () => {
    const data = new Uint8ClampedArray(40 * 40 * 4).fill(255);
    expect(detectGridCell({ data, width: 40, height: 40, colorSpace: "srgb" } as ImageData,
      { left: 10, top: 10, right: 30, bottom: 30 })).toBeNull();
  });
});
