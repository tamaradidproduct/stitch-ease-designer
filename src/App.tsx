import { useEffect } from "react";
import { CanvasView } from "./canvas/CanvasView";
import { symbolSheet } from "./dev/symbolSheet";
import { useDocStore } from "./state/docStore";
import { StatusBar } from "./ui/StatusBar";

export default function App() {
  // Temporary: seed the symbol sheet so the Figma import can be eyeballed.
  const load = useDocStore((s) => s.load);
  useEffect(() => {
    load(symbolSheet());
  }, [load]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">Stitch Ease Designer</span>
      </header>
      <main className="stage">
        <CanvasView />
      </main>
      <StatusBar />
    </div>
  );
}
