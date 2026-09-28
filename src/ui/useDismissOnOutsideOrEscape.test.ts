import { describe, expect, it, vi } from "vitest";
import { isOutsidePointerdown } from "./useDismissOnOutsideOrEscape";

describe("isOutsidePointerdown", () => {
  it("treats a click inside the container as not outside", () => {
    const container = { contains: () => true };
    expect(isOutsidePointerdown({} as EventTarget, container)).toBe(false);
  });

  it("treats a click outside the container as outside", () => {
    const container = { contains: () => false };
    expect(isOutsidePointerdown({} as EventTarget, container)).toBe(true);
  });

  it("treats every click as outside when there is no container to check against", () => {
    expect(isOutsidePointerdown({} as EventTarget, null)).toBe(true);
    expect(isOutsidePointerdown({} as EventTarget, undefined)).toBe(true);
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

  // This project's Vitest config runs in a plain Node.js environment with no
  // DOM at all (see vite.config.ts's `test.environment: "node"`), so the
  // global `Node` constructor this function guards with doesn't exist here -
  // exactly the case its `typeof Node === "undefined"` fallback is for. This
  // documents that assumption and confirms the container is still consulted
  // normally when it holds, rather than every target silently short-
  // circuiting to "outside" in this test environment.
  it("still consults the container when the environment has no global Node", () => {
    expect(typeof Node).toBe("undefined");
    const container = { contains: () => true };
    expect(isOutsidePointerdown({} as EventTarget, container)).toBe(false);
  });
});
