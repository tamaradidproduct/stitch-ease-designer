import { describe, expect, it } from "vitest";
import { useUiStore } from "../state/uiStore";
import { pickRenderUiFields, RENDER_UI_FIELDS } from "./canvasRenderFields";

describe("pickRenderUiFields", () => {
  it("extracts exactly the RENDER_UI_FIELDS keys, with their live values", () => {
    const state = useUiStore.getState();
    const picked = pickRenderUiFields(state);

    expect(Object.keys(picked).sort()).toEqual([...RENDER_UI_FIELDS].sort());
    for (const key of RENDER_UI_FIELDS) {
      expect(picked[key]).toBe(state[key]);
    }
  });

  it("picks up a field's current value rather than a stale snapshot", () => {
    useUiStore.getState().setSelectHeld(true);
    try {
      expect(pickRenderUiFields(useUiStore.getState()).selectHeld).toBe(true);
    } finally {
      useUiStore.getState().setSelectHeld(false);
    }
  });
});

// CanvasView.tsx's dirty-check subscription and its render() call both
// derive from RENDER_UI_FIELDS (see canvasRenderFields.ts's compile-time
// guard against RenderState), so the actual "can these three drift apart
// again" protection lives at the type level - this file only exercises the
// runtime extraction on top of that list.
