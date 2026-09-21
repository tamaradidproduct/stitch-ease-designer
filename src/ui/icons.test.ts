import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DragHandleIcon } from "./icons";

describe("DragHandleIcon", () => {
  it("renders the six-dot handle and forwards optional dimensions", () => {
    const defaultMarkup = renderToStaticMarkup(createElement(DragHandleIcon));
    expect(defaultMarkup.match(/<circle/g)?.length).toBe(6);
    expect(defaultMarkup).toContain('aria-hidden="true"');
    expect(defaultMarkup).not.toContain("width=");
    expect(defaultMarkup).not.toContain("height=");

    const sizedMarkup = renderToStaticMarkup(createElement(DragHandleIcon, { width: 12, height: 14 }));
    expect(sizedMarkup).toContain('width="12"');
    expect(sizedMarkup).toContain('height="14"');
  });
});
