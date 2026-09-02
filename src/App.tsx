import { CanvasView } from "./canvas/CanvasView";
import { StatusBar } from "./ui/StatusBar";
import { StitchPicker } from "./ui/StitchPicker";
import { Toolbar } from "./ui/Toolbar";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__title">Stitch Ease Designer</span>
      </header>
      <Toolbar />
      <main className="stage">
        <CanvasView />
        <StitchPicker />
      </main>
      <StatusBar />
    </div>
  );
}
