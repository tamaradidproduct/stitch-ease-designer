// @vitest-environment jsdom
import { act, useState } from "react";
import { describe, expect, it } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { SegmentedControl } from "./SegmentedControl";

const dom = setupReactRoot();

function Harness() {
  const [value, setValue] = useState<"flat" | "round">("flat");
  return (
    <SegmentedControl
      label="Worked"
      options={[
        { value: "flat", children: "Flat" },
        { value: "round", children: "Round" },
      ]}
      value={value}
      onChange={setValue}
    />
  );
}

const radios = () => [...dom.container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];

describe("SegmentedControl", () => {
  it("is a labelled radio group with one checked option and one tab stop", () => {
    dom.render(<Harness />);
    expect(dom.container.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("Worked");
    expect(radios().map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(radios().map((r) => r.tabIndex)).toEqual([0, -1]);
  });

  it("changes with a click and with the arrow keys", () => {
    dom.render(<Harness />);
    act(() => radios()[1]!.click());
    expect(radios()[1]!.dataset.on).toBe("true");
    act(() => {
      radios()[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(radios()[0]!.getAttribute("aria-checked")).toBe("true");
  });
});
