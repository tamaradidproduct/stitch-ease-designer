// @vitest-environment jsdom
import * as React from "react";
import { describe, expect, it } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { Button, IconButton } from "./Button";
import { buttonClassName } from "./buttonClassName";

const dom = setupReactRoot();
const button = () => dom.container.querySelector("button")!;

describe("buttonClassName", () => {
  it("composes variant, danger, size and extra classes", () => {
    expect(buttonClassName()).toBe("btn");
    expect(buttonClassName({ variant: "quiet", danger: true, size: "sm", className: "x" })).toBe(
      "btn btn--quiet btn--danger btn--sm x",
    );
  });
});

describe("Button", () => {
  it("defaults to type=button so it never submits a surrounding form", () => {
    dom.render(<Button>Save</Button>);
    expect(button().type).toBe("button");
    expect(button().className).toBe("btn");
  });

  it("reflects toggle state as data-on only when given", () => {
    dom.render(<Button on={false}>Grid</Button>);
    expect(button().dataset.on).toBe("false");
    dom.render(<Button>Grid</Button>);
    expect(button().hasAttribute("data-on")).toBe(false);
  });

  it("forwards its ref to the underlying button", () => {
    const ref = React.createRef<HTMLButtonElement>();
    dom.render(<Button ref={ref}>Save</Button>);
    expect(ref.current).toBe(button());
  });
});

describe("IconButton", () => {
  it("uses label as the accessible name and tooltip as the title", () => {
    dom.render(<IconButton label="Hide image 1" tooltip="Hide" aria-pressed={true} />);
    expect(button().getAttribute("aria-label")).toBe("Hide image 1");
    expect(button().title).toBe("Hide");
    expect(button().getAttribute("aria-pressed")).toBe("true");
  });

  it("forwards its ref through to the underlying button", () => {
    const ref = React.createRef<HTMLButtonElement>();
    dom.render(<IconButton ref={ref} label="Hide image 1" />);
    expect(ref.current).toBe(button());
  });
});
