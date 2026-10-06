// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { requireSymbol } from "../symbols/registry";
import { setupReactRoot } from "../test/reactRoot";
import { QuickTile } from "./QuickTile";

const dom = setupReactRoot();

describe("QuickTile", () => {
  it("chooses its stitch and shows a color chip only while current", () => {
    const choose = vi.fn();
    const symbol = requireSymbol("k2tog");
    const tile = (active: boolean) => (
      <QuickTile entry={{ key: "k2tog", symbol }} active={active} onChoose={choose} onChooseColor={() => {}} getPopoverBoundaryRect={() => null} />
    );
    dom.render(tile(false));
    expect(dom.container.querySelector(".colorChip")).toBeNull();
    act(() => dom.container.querySelector<HTMLButtonElement>("button")!.click());
    expect(choose).toHaveBeenCalledWith(symbol, undefined);
    dom.render(tile(true));
    expect(dom.container.querySelector(".colorChip")).not.toBeNull();
  });
});
