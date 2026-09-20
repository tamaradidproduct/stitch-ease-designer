import { FeedbackProvider } from "@fasterfixes/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useDocStore } from "./state/docStore";
import { useUiStore } from "./state/uiStore";
import "./styles.css";

// Dev-only handle for driving the canvas deterministically from the console or
// a test harness, where synthesised wheel events are awkward to aim.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__stitchEase = {
    ui: useUiStore,
    doc: useDocStore,
    setCamera: (x: number, y: number, zoom: number) =>
      useUiStore.setState({ camera: { x, y, zoom } }),
  };
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

const app = <App />;
const isStaging = window.location.hostname === "staging.designer.stitch-ease.com";

createRoot(root).render(
  <StrictMode>
    {isStaging ? (
      <FeedbackProvider projectId="proj_c7111083a19bec66c299f6ff">{app}</FeedbackProvider>
    ) : (
      app
    )}
  </StrictMode>,
);
