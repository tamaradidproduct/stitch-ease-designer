// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { Popover } from "./Popover";

const dom = setupReactRoot();

describe("Popover", () => {
  it("forwards its ref to the underlying surface", () => {
    const ref = React.createRef<HTMLDivElement>();
    dom.render(<Popover ref={ref} className="custom" />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe("DIV");
    expect(ref.current?.className).toContain("popover");
    expect(ref.current?.className).toContain("custom");
  });
});
