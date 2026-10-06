import { tokens } from "../design/tokens";
import { useUiStore } from "../state/uiStore";
import { Button } from "./Button";
import { Slider } from "./Field";
import { Popover } from "./Popover";

/** Stitch-highlight presets offered in the trace-colors popover. */
const TRACE_COLORS = [tokens.highlight, tokens["trace-pink"], tokens["trace-violet"], tokens["trace-green"], tokens.accent];

/**
 * The reference panel's "Canvas stitch colors" popover: tints placed
 * stitches so they read against a reference photo while tracing.
 */
export function TraceColorsPopover() {
  const stitchHighlightColor = useUiStore((s) => s.stitchHighlightColor);
  const stitchHighlightOpacity = useUiStore((s) => s.stitchHighlightOpacity);
  const setStitchHighlight = useUiStore((s) => s.setStitchHighlight);
  const setStitchHighlightOpacity = useUiStore((s) => s.setStitchHighlightOpacity);
  return (
    <Popover className="traceColors refpanel__traceColors">
      <div className="traceColors__label">
        <span>Canvas stitch color</span>
        <Button variant="unstyled" onClick={() => setStitchHighlightOpacity(0)}>Off</Button>
      </div>
      <div className="traceColors__presets" aria-label="Stitch highlight color">
        {TRACE_COLORS.map((color) => (
          <Button variant="unstyled"
            key={color}
            style={{ background: color }}
            data-on={stitchHighlightColor === color && stitchHighlightOpacity > 0}
            onClick={() => setStitchHighlight(color, stitchHighlightOpacity || 0.22)}
            aria-label={`Use ${color} stitch highlight`}
          />
        ))}
        <label className="traceColors__custom" title="Choose a custom color">
          <input
            type="color"
            value={stitchHighlightColor}
            onChange={(event) => setStitchHighlight(event.target.value, stitchHighlightOpacity || 0.22)}
            aria-label="Custom stitch highlight color"
          />
        </label>
      </div>
      <label className="traceColors__intensity">
        <span>Intensity</span>
        <Slider
          min="0"
          max="0.5"
          step="0.05"
          value={stitchHighlightOpacity}
          onChange={(event) => setStitchHighlightOpacity(Number(event.target.value))}
        />
      </label>
    </Popover>
  );
}
