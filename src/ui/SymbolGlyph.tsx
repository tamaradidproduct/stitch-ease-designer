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
        className="glyph__svg"
        style={{ width, height: cell }}
        dangerouslySetInnerHTML={{ __html: symbol.glyph }}
      />
    </span>
  );
}
