// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { Popover } from "./Popover";

const dom = setupReactRoot();

describe("Popover", () => {
  it("renders the shared surface with the caller's class and attributes", () => {
    dom.render(
      <Popover className="glossary__menu" role="menu" aria-label="Row actions">
        <button type="button">Rename</button>
      </Popover>,
    );
    const el = dom.container.querySelector('[role="menu"]')!;
    expect(el.className).toBe("popover glossary__menu");
    expect(el.getAttribute("aria-label")).toBe("Row actions");
  });
});
