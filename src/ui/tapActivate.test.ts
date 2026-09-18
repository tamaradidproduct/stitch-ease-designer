import { describe, expect, it, vi } from "vitest";
import { tapActivate } from "./tapActivate";

describe("tapActivate", () => {
  it("contains touch pointer-up activation so it cannot reach canvas gestures", () => {
    const activate = vi.fn();
    const event = {
      pointerType: "touch",
      currentTarget: {},
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    tapActivate(activate).onPointerUp(event as never);

    expect(activate).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });

  it("leaves mouse pointer-up to the click handler", () => {
    const activate = vi.fn();
    const event = {
      pointerType: "mouse",
      currentTarget: {},
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };

    tapActivate(activate).onPointerUp(event as never);

    expect(activate).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("contains click activation and invokes the action for desktop input", () => {
    const activate = vi.fn();
    const event = {
      currentTarget: {},
      stopPropagation: vi.fn(),
    };

    tapActivate(activate).onClick(event as never);

    expect(activate).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
  });
});
