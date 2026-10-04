import { describe, expect, it, vi } from "vitest";
import { isOutsidePointerdown } from "./useDismissOnOutsideOrEscape";

describe("isOutsidePointerdown", () => {
  const inside = { contains: () => true };
  const outside = { contains: () => false };

  it.each([
    ["inside the container", inside, false],
    ["outside the container", outside, true],
    ["with no container (null)", null, true],
    ["with no container (undefined)", undefined, true],
  ] as const)("classifies a click %s", (_label, container, expected) => {
    expect(isOutsidePointerdown({} as EventTarget, container)).toBe(expected);
  });

  // StitchPicker and SuggestReviewMenu both exempt clicks on the canvas: the
  // canvas already closes the panel itself as part of handling that same
  // click (so it can start a fresh stroke there instead of one landing on a
  // dismissal), and this hook dismissing it too would just double up.
  it("exempts an ignored target even when it's outside the container", () => {
    const container = { contains: () => false };
    const canvasTarget = {} as EventTarget;
    const ignoreTarget = (target: EventTarget | null) => target === canvasTarget;
    expect(isOutsidePointerdown(canvasTarget, container, ignoreTarget)).toBe(false);
  });

  it("does not exempt a target the ignoreTarget predicate rejects", () => {
    const container = { contains: () => false };
    const ignoreTarget = vi.fn().mockReturnValue(false);
    expect(isOutsidePointerdown({} as EventTarget, container, ignoreTarget)).toBe(true);
    expect(ignoreTarget).toHaveBeenCalledOnce();
  });

  it("checks ignoreTarget before the container, so it can exempt a target the container also considers outside", () => {
    const contains = vi.fn().mockReturnValue(false);
    const container = { contains };
    const ignoreTarget = () => true;
    expect(isOutsidePointerdown({} as EventTarget, container, ignoreTarget)).toBe(false);
    expect(contains).not.toHaveBeenCalled();
  });

  // A pointerdown's target is always a real Node in a browser, but this
  // guards against `contains` throwing a TypeError if it were ever anything
  // else - a null target, in particular, is worth covering explicitly since
  // `contains(null)` is well-defined (false) but not every environment
  // honors that.
  it("treats a null target as outside without throwing", () => {
    const container = { contains: () => true };
    expect(() => isOutsidePointerdown(null, container)).not.toThrow();
    expect(isOutsidePointerdown(null, container)).toBe(true);
  });

  // vite.config.ts runs tests with no DOM, so the `typeof Node ===
  // "undefined"` fallback is the path every case above exercises; this pins
  // that assumption so the inside case isn't passing by accident.
  it("runs with no global Node, the fallback path the cases above rely on", () => {
    expect(typeof Node).toBe("undefined");
  });
});
