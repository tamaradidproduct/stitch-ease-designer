import { calculateViewportShift } from "./fasterFixesViewport";

const viewport = { top: 0, right: 1000, bottom: 800, left: 0 };

describe("calculateViewportShift", () => {
  it("moves a popover down when its top is clipped", () => {
    expect(
      calculateViewportShift({ top: -90, right: 660, bottom: 70, left: 340 }, viewport),
    ).toEqual({ x: 0, y: 102 });
  });

  it("moves a popover up when its bottom is clipped", () => {
    expect(
      calculateViewportShift({ top: 700, right: 980, bottom: 860, left: 660 }, viewport),
    ).toEqual({ x: 0, y: -72 });
  });

  it("does not move a popover already inside the safe area", () => {
    expect(
      calculateViewportShift({ top: 200, right: 660, bottom: 360, left: 340 }, viewport),
    ).toEqual({ x: 0, y: 0 });
  });

  it("aligns an oversized popover to the safe top-left edge", () => {
    expect(
      calculateViewportShift({ top: -20, right: 1100, bottom: 900, left: -100 }, viewport),
    ).toEqual({ x: 112, y: 32 });
  });
});
