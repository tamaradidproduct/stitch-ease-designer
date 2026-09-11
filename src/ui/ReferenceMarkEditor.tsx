import { useEffect, useRef, useState } from "react";
import { worldToScreen } from "../canvas/camera";
import { patchCalibrationMark, withoutCalibrationMark } from "../model/referenceCalibration";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { redoLatest, undoLatest } from "../state/editorHistory";
import { tapActivate } from "./tapActivate";

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
/** Gap between a marked reference stitch and its editor. */
const GAP = 14;

export function ReferenceMarkEditor() {
  const activeId = useUiStore((s) => s.referenceImageActiveMark);
  const setActive = useUiStore((s) => s.setReferenceImageActiveMark);
  const marking = useUiStore((s) => s.referenceImageMarking);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const image = useDocStore((s) => s.referenceImage);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const rowInput = useRef<HTMLButtonElement | null>(null);
  const stitchInput = useRef<HTMLButtonElement | null>(null);
  const [fieldState, setFieldState] = useState<{
    pointId: string | null;
    field: "row" | "stitch";
  }>({ pointId: null, field: "row" });

  const points = image?.calibrationMarks ?? [];
  const index = points.findIndex((p) => p.id === activeId);
  const point = index === -1 ? null : points[index]!;
  const activePointId = point?.id;
  // A newly placed mark always starts with Row. Keeping the field choice
  // associated with the mark id avoids a stale stitch-field focus when an
  // iPad opens a new overlay while the previous one was on Stitch.
  const activeField = fieldState.pointId === activePointId ? fieldState.field : "row";

  useEffect(() => {
    if (!activePointId) return;
    // On a touch-only device, focusing a field can make Safari scroll its
    // visual viewport even though this is a custom keypad, leaving the
    // canvas seemingly cut in half. The Row field is still active by state;
    // a tap selects either field, while keyboard-equipped devices retain
    // automatic focus and ordinary Tab navigation.
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    requestAnimationFrame(() => (activeField === "row" ? rowInput : stitchInput).current?.focus());
  }, [activeField, activePointId]);

  if (!marking || !image || !point) return null;

  const squareTopLeft = worldToScreen(
    image.x + point.u * image.width,
    image.y + (point.v + point.h) * image.height,
    camera,
    viewport,
  );
  const squareRight = worldToScreen(
    image.x + (point.u + point.w) * image.width,
    image.y + point.v * image.height,
    camera,
    viewport,
  );
  // Point selection deliberately pans the mark left enough for this editor,
  // so it can always open on the mark's right rather than unexpectedly
  // jumping sides.
  const left = squareRight.x + GAP;

  const set = (patch: { stitch?: number | null; row?: number | null }) =>
    updateReferenceImage({
      calibrationMarks: patchCalibrationMark(image.calibrationMarks, point.id, patch),
    });

  const remove = () => {
    updateReferenceImage({
      calibrationMarks: withoutCalibrationMark(image.calibrationMarks, point.id),
    });
    setActive(null);
  };

  const close = () => setActive(null);

  const complete = point.row !== null && point.stitch !== null;
  const confirm = () => {
    if (complete) setActive(null);
  };

  const focusField = (field: "row" | "stitch") => {
    setFieldState({ pointId: activePointId ?? null, field });
  };

  const appendDigit = (digit: number) => {
    const current = point[activeField];
    // Values are one-based. Keeping an empty field empty on 0 prevents a
    // dead-looking "0" that will immediately be rejected by the model.
    if (current === null && digit === 0) return;
    const next = Number(`${current ?? ""}${digit}`);
    if (!Number.isSafeInteger(next) || next < 1) return;
    set(activeField === "row" ? { row: next } : { stitch: next });
  };

  const backspace = () => {
    const current = point[activeField];
    if (current === null) return;
    const remaining = String(current).slice(0, -1);
    set(activeField === "row"
      ? { row: remaining ? Number(remaining) : null }
      : { stitch: remaining ? Number(remaining) : null });
  };

  const nextField = () => focusField(activeField === "row" ? "stitch" : "row");

  // Start with 1 — the most common edge label — then offer every number
  // already entered for this photo. One shared row keeps the prompt compact;
  // it fills whichever field the designer most recently focused.
  const quickValues = [...new Set([1, ...points.flatMap((candidate) =>
    [candidate.row, candidate.stitch].flatMap((value) => (value === null ? [] : [value])),
  )])].sort((a, b) => a - b);

  const valueShortcuts = (
    <div className="markpop__shortcuts" aria-label={`${activeField} shortcuts`}>
      {quickValues.map((value) => (
        <button
          key={value}
          type="button"
          className="markpop__shortcut"
          data-active={point[activeField] === value}
          title={`Use ${activeField === "row" ? "row" : "stitch"} ${value}`}
          onClick={() => {
            set(activeField === "row" ? { row: value } : { stitch: value });
            // A quick value completes the field the designer was reading.
            // Move straight to the next field in the transcription order so
            // they can continue without an extra click. Stitch is the last
            // field, so its shortcuts deliberately keep focus there.
            if (activeField === "row") {
              focusField("stitch");
            } else {
              focusField("stitch");
            }
          }}
        >
          {value}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="markpop"
      // Offset clear of the marked square so the popover never covers the
      // stitch whose printed numbers are being read.
      style={{ left: Math.max(GAP, left), top: Math.max(GAP, squareTopLeft.y) }}
      // The canvas listens on the window for marking clicks; without this a
      // click on the popover would drop another mark behind it.
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Tab is a global shortcut in this app, and Escape clears the armed
        // stitch. Inside this popover they have to mean "next field" and
        // "give up on this mark".
        e.stopPropagation();
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) redoLatest();
          else undoLatest();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          if (point.stitch === null && point.row === null) remove();
          else setActive(null);
        }
        if (e.key === "Enter") {
          e.preventDefault();
          confirm();
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          backspace();
        }
        if (
          (e.key === "Tab" || e.key === "ArrowRight" || e.key === "ArrowLeft") &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey
        ) {
          e.preventDefault();
          nextField();
        }
        if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          appendDigit(Number(e.key));
        }
      }}
    >
      <span className="markpop__index">{index + 1}</span>
      <div className="markpop__fields">
        <div className="markpop__field">
          <label>
            <span>row</span>
            <button
              ref={rowInput}
              type="button"
              className="markpop__input"
              data-active={activeField === "row"}
              aria-label="Row number"
              onFocus={() => focusField("row")}
              onClick={() => focusField("row")}
            >
              {point.row ?? ""}
            </button>
          </label>
        </div>
        <div className="markpop__field">
          <label>
            <span>st</span>
            <button
              ref={stitchInput}
              type="button"
              className="markpop__input"
              data-active={activeField === "stitch"}
              aria-label="Stitch number"
              onFocus={() => focusField("stitch")}
              onClick={() => focusField("stitch")}
            >
              {point.stitch ?? ""}
            </button>
          </label>
        </div>
        {valueShortcuts}
        <div className="markpop__keypad" aria-label="Number keypad">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button key={digit} type="button" {...tapActivate(() => appendDigit(digit))}>
              {digit}
            </button>
          ))}
          <button type="button" aria-label="Delete last digit" {...tapActivate(backspace)}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m8 5-5 5 5 5h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H8Zm2.5 3 4 4m0-4-4 4" />
            </svg>
          </button>
          <button type="button" {...tapActivate(() => appendDigit(0))}>0</button>
          <button
            type="button"
            className="markpop__keypadNext"
            {...tapActivate(() => focusField(activeField === "row" ? "stitch" : "row"))}
          >
            Next
          </button>
        </div>
        <div className="markpop__actions">
          <button type="button" className="markpop__clear" {...tapActivate(remove)}>
            Clear point
          </button>
          <button
            type="button"
            className="markpop__confirm"
            disabled={!complete}
            {...tapActivate(confirm)}
          >
            Confirm
          </button>
        </div>
      </div>
      <button type="button" className="markpop__remove" title="Close point editor" onClick={close}>
        &times;
      </button>
    </div>
  );
}
