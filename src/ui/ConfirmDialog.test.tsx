// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { setupReactRoot } from "../test/reactRoot";
import { ConfirmDialog } from "./ConfirmDialog";

const dom = setupReactRoot();

describe("ConfirmDialog", () => {
  it("focuses the confirm button and offers the extra actions", () => {
    const detach = vi.fn();
    dom.render(
      <ConfirmDialog
        message="Delete motif?"
        confirmLabel="Delete copies"
        extraActions={[{ label: "Detach copies", onClick: detach }]}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(document.activeElement?.textContent).toBe("Delete copies");
    expect(dom.container.querySelector('[role="alertdialog"]')?.getAttribute("aria-label")).toBe("Delete motif?");
    const detachButton = [...dom.container.querySelectorAll("button")].find((b) => b.textContent === "Detach copies")!;
    act(() => detachButton.click());
    expect(detach).toHaveBeenCalledOnce();
  });

  it("cancels on Escape and on a backdrop press", () => {
    const cancel = vi.fn();
    dom.render(<ConfirmDialog message="Delete?" onConfirm={() => {}} onCancel={cancel} />);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    const overlay = dom.container.querySelector(".confirmDialog__overlay")!;
    act(() => {
      overlay.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
