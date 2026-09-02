import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { ChartEditor } from "./ui/ChartEditor";
import { ChartList } from "./ui/ChartList";

/**
 * Hash routing, not browser history: GitHub Pages serves static files with no
 * server-side rewrites, so a deep link like /c/abc would 404 on refresh.
 * `#/c/abc` is always served by index.html.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<ChartList />} />
        <Route path="/c/:id" element={<ChartEditor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
