import { CanvasView } from "./canvas/CanvasView";
import { StatusBar } from "./ui/StatusBar";

export default function App() {
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
