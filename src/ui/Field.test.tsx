// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { Checkbox, Slider, TextField } from "./Field";

const dom = setupReactRoot();

describe("form controls", () => {
  it("TextField applies the variant's classes and keeps the caller's", () => {
    dom.render(<TextField variant="rename" className="glossary__rename" aria-label="Rename" readOnly value="Knit" />);
    const input = dom.container.querySelector("input")!;
    expect(input.className).toBe("field field--rename glossary__rename");
    expect(input.type).toBe("text");
  });

  it("an unstyled TextField has no field chrome", () => {
    dom.render(<TextField variant="unstyled" type="search" aria-label="Search" />);
    const input = dom.container.querySelector("input")!;
    expect(input.hasAttribute("class")).toBe(false);
    expect(input.type).toBe("search");
  });

  it("Slider is a range input and Checkbox labels its box", () => {
    dom.render(
      <>
        <Slider aria-label="Opacity" min={0} max={1} step={0.1} readOnly value={0.5} />
        <Checkbox labelClassName="refpanel__checkbox" readOnly checked>
          Include reference image
        </Checkbox>
      </>,
    );
    expect(dom.container.querySelector<HTMLInputElement>("input.slider")!.type).toBe("range");
    const label = dom.container.querySelector("label")!;
    expect(label.className).toBe("checkbox refpanel__checkbox");
    expect(label.textContent).toContain("Include reference image");
    expect(label.querySelector<HTMLInputElement>("input")!.checked).toBe(true);
  });
});
