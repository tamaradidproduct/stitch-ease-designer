import { useEffect, useRef } from "react";
import { worldToScreen } from "../canvas/camera";
import { patchCalibrationPoint, withoutCalibrationPoint } from "../model/referenceCalibration";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";

/**
 * The stitch/row prompt for the mark just placed, anchored to it on the
 * canvas.
 *
 * Asking here rather than in a list in the panel is the difference between
 * reading a number off the photo and *transcribing* one: the numbers sit at
 * the edges of the chart, several stitches from the mark, and pairing four
 * of them up afterwards against a list means looking away and counting
 * rows to check you matched the right one.
 */
/** Roughly the popover's rendered width, for deciding which side to open on. */
const POPOVER_WIDTH = 210;
const GAP = 26;

export function ReferenceMarkEditor() {
  const activeId = useUiStore((s) => s.referenceImageActiveMark);
  const setActive = useUiStore((s) => s.setReferenceImageActiveMark);
  const marking = useUiStore((s) => s.referenceImageMarking);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const image = useDocStore((s) => s.referenceImage);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const stitchInput = useRef<HTMLInputElement | null>(null);

  const points = image?.calibrationPoints ?? [];
  const index = points.findIndex((p) => p.id === activeId);
  const point = index === -1 ? null : points[index]!;
  const activePointId = point?.id;

  // Keyed on the id alone, not the point: re-focusing whenever its numbers
  // change would fight the caret while they are being typed.
  useEffect(() => {
    if (activePointId) stitchInput.current?.focus();
  }, [activePointId]);

  if (!marking || !image || !point) return null;

  const at = worldToScreen(
    image.x + point.u * image.width,
    image.y + point.v * image.height,
    camera,
    viewport,
  );
  // Flip to the mark's left in the right-hand third, where the reference
  // panel lives - a popover that opens underneath the panel is a popover
  // you can't type into.
  const flip = at.x > viewport.width - POPOVER_WIDTH - GAP * 2;
  const left = flip ? at.x - POPOVER_WIDTH - GAP : at.x + GAP;

  const set = (patch: { stitch?: number | null; row?: number | null }) =>
    updateReferenceImage({
      calibrationPoints: patchCalibrationPoint(image.calibrationPoints, point.id, patch),
    });

  const remove = () => {
    updateReferenceImage({
      calibrationPoints: withoutCalibrationPoint(image.calibrationPoints, point.id),
    });
    setActive(null);
  };

  const parse = (value: string) => (value === "" ? null : Number(value));

  return (
    <div
      className="markpop"
      // Offset clear of the reticle so the popover never covers the stitch
      // whose numbers are being read.
      style={{ left: Math.max(GAP, left), top: Math.max(GAP, at.y - 16) }}
      // The canvas listens on the window for marking clicks; without this a
      // click on the popover would drop another mark behind it.
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Tab is a global shortcut in this app, and Escape clears the armed
        // stitch. Inside this popover they have to mean "next field" and
        // "give up on this mark".
        e.stopPropagation();
        if (e.key === "Escape") {
          if (point.stitch === null && point.row === null) remove();
          else setActive(null);
        }
        if (e.key === "Enter") setActive(null);
      }}
    >
      <span className="markpop__index">{index + 1}</span>
      <label>
        <span>st</span>
        <input
          ref={stitchInput}
          type="number"
          value={point.stitch ?? ""}
          onChange={(e) => set({ stitch: parse(e.target.value) })}
        />
      </label>
      <label>
        <span>row</span>
        <input
          type="number"
          value={point.row ?? ""}
          onChange={(e) => set({ row: parse(e.target.value) })}
        />
      </label>
      <button type="button" className="markpop__remove" title="Remove this mark" onClick={remove}>
        &times;
      </button>
    </div>
  );
}
