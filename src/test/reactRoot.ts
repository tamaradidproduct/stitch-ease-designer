import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach } from "vitest";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

// Needed for React 18/19's act() to run without its "not configured to
// support act(...)" warning outside of a testing-library-managed environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialDocState = useDocStore.getState();
const initialUiState = useUiStore.getState();

/**
 * Registers beforeEach/afterEach hooks that reset both stores to their
 * pristine state and mount a fresh React root in a detached-then-attached
 * container. Call at the top of a `describe` (or file); the caller's own
 * `beforeEach` runs after this one, so it can seed store state and then
 * `render()`.
 */
export function setupReactRoot() {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  beforeEach(() => {
    useDocStore.setState(initialDocState, true);
    useUiStore.setState(initialUiState, true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => root.unmount());
    }
    container?.remove();
  });

  return {
    get container() {
      return container;
    },
    render(element: ReactElement) {
      act(() => root.render(element));
    },
  };
}
