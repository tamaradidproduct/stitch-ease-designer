import { useLayoutEffect, useRef } from "react";
import type { StitchSymbol } from "../symbols/types";

/**
 * A symbol drawn as it appears on the chart: bordered cells, any meaningful
 * cell tint, and the glyph across the whole span. Used by the picker and
 * toolbar so what you choose looks like what you'll get.
 *
 * The markup comes from our own build-time Figma export, not from user input.
 */
export function SymbolGlyph({
  symbol,
  cell = 22,
  chrome = true,
}: {
  symbol: StitchSymbol;
  /** Size of one cell in px. Cables shrink this to fit their tile. */
  cell?: number;
  chrome?: boolean;
}) {
  const width = cell * symbol.span;
  const svgRef = useRef<HTMLSpanElement>(null);

  // The source library uses a shared cell-sized artboard, but several of its
  // paths are slightly off-centre inside that artboard. Centre the actual
  // vector bounds rather than the artboard so every preview sits cleanly in
  // the same visual column (without changing its chart geometry).
  useLayoutEffect(() => {
    const svg = svgRef.current?.querySelector("svg");
    if (!svg) return;

    svg.style.transform = "translate(0, 0)";
    try {
      const viewBox = svg.viewBox.baseVal;
      const bounds = svg.getBBox();
      if (!bounds.width || !bounds.height || !viewBox.width || !viewBox.height) return;
      const x = ((viewBox.width / 2 - (bounds.x + bounds.width / 2)) / viewBox.width) * 100;
      const y = ((viewBox.height / 2 - (bounds.y + bounds.height / 2)) / viewBox.height) * 100;
      svg.style.transform = `translate(${x}%, ${y}%)`;
    } catch {
      // A glyph may be empty (for example Knit); it needs no adjustment.
    }
  }, [symbol.glyph]);

  return (
    <span className="glyph" style={{ width, height: cell }}>
      {chrome &&
        Array.from({ length: symbol.span }, (_, i) => (
          <span
            key={i}
            className="glyph__cell"
            style={{
              left: i * cell,
              width: cell,
              height: cell,
              ...(symbol.cellFills?.[i]
                ? { background: symbol.cellFills[i] as string }
                : null),
            }}
          />
        ))}
      <span
        ref={svgRef}
        className="glyph__svg"
        style={{ width, height: cell }}
        dangerouslySetInnerHTML={{ __html: symbol.glyph }}
      />
    </span>
  );
}
