// @vitest-environment jsdom
import { act, useState } from "react";
import { describe, expect, it } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { SideModule } from "./SideModule";

const dom = setupReactRoot();

function Collapsible() {
  const [open, setOpen] = useState(false);
  return (
    <SideModule title="Help" subtitle="Keyboard shortcuts" collapsible={{ open, onToggle: () => setOpen((v) => !v) }}>
      <p>Shortcuts</p>
    </SideModule>
  );
}

describe("SideModule", () => {
  it("shows its body only while a collapsible module is open", () => {
    dom.render(<Collapsible />);
    const toggle = dom.container.querySelector("button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(dom.container.querySelector(".sideModule__body")).toBeNull();
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(dom.container.querySelector(".sideModule__body")?.textContent).toBe("Shortcuts");
  });

  it("renders a static header with actions when not collapsible", () => {
    dom.render(
      <SideModule title="Navigator" subtitle="Move around the canvas" actions={<span className="x">act</span>}>
        body
      </SideModule>,
    );
    expect(dom.container.querySelector("h2")?.textContent).toBe("Navigator");
    expect(dom.container.querySelector(".sideModule__header .x")).not.toBeNull();
  });
});
