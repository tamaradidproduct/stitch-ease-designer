import { useRef, useState } from "react";
import { CELL } from "../canvas/camera";
import {
  scaleFromCalibrationMarks,
  withoutCalibrationMark,
} from "../model/referenceCalibration";
import { resizeReferenceImageAround, stitchBoxRect } from "../model/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { removeReferenceImageFile, uploadReferenceImage } from "../storage/referenceImages";

/**
 * Upload + transform controls for the chart's one reference image.
 *
 * Opening this panel is also what arms drag-to-move/resize on the canvas
 * itself (see `useReferenceImageTool`) - there's no separate "position"
 * tool to switch to, since this panel is the only place that transform is
 * ever relevant.
 */
export function ReferenceImagePanel() {
  const open = useUiStore((s) => s.referenceImagePanelOpen);
  const setOpen = useUiStore((s) => s.setReferenceImagePanelOpen);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const setCalibrating = useUiStore((s) => s.setReferenceImageCalibrating);
  const setCalibrationBox = useUiStore((s) => s.setReferenceImageCalibrationBox);
  const calibrationRejected = useUiStore((s) => s.referenceImageCalibrationRejected);
  const marking = useUiStore((s) => s.referenceImageMarking);
  const setMarking = useUiStore((s) => s.setReferenceImageMarking);
  const setActiveMark = useUiStore((s) => s.setReferenceImageActiveMark);
  const activeMark = useUiStore((s) => s.referenceImageActiveMark);
  const setCalibrationRejected = useUiStore((s) => s.setReferenceImageCalibrationRejected);

  const meta = useDocStore((s) => s.meta);
  const image = useDocStore((s) => s.referenceImage);
  const setReferenceImage = useDocStore((s) => s.setReferenceImage);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const removeReferenceImage = useDocStore((s) => s.removeReferenceImage);

  // Recomputed as the numbers are typed, so "Refine scale" is only live once
  // the marks actually determine a scale - which is also the clearest way to
  // say that two of them naming the same row pins nothing down.
  const points = image?.calibrationMarks ?? [];
  const labelled = points.filter((p) => p.stitch !== null && p.row !== null);
  const fit = image && marking ? scaleFromCalibrationMarks(image, points) : null;
  const hasSpread =
    new Set(labelled.map((point) => point.stitch)).size >= 2 &&
    new Set(labelled.map((point) => point.row)).size >= 2;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Each axis's size as a percentage of its uploaded pixel dimensions - 100%
  // means one world unit per source pixel, same "how zoomed in is it"
  // reading a percentage has anywhere else in an image editor. Independent
  // per axis so a source chart with non-square stitches can be stretched to
  // match the app's square grid, not just scaled uniformly.
  const widthPercent = image ? Math.round((image.width / image.naturalWidth) * 100) : 100;
  const heightPercent = image ? Math.round((image.height / image.naturalHeight) * 100) : 100;

  // Steps off the rounded, displayed percentage (not the raw float) by
  // exactly one point per click - stepping off the underlying value would
  // drift away from whole percentages after repeated rounding.
  const applyScale = (axis: "width" | "height", direction: 1 | -1) => {
    if (!image) return;
    const currentPercent = axis === "width" ? widthPercent : heightPercent;
    const nextPercent = Math.max(1, currentPercent + direction);
    // Anchored on the calibrated stitch's bottom-left corner once there is
    // one, so nudging the size never undoes the alignment that "Set stitch
    // size" established. Before calibration there's no such reference
    // point, so it falls back to the image's own centre - which at least
    // keeps a resize from shoving the image off in some direction.
    const stitch = stitchBoxRect(image);
    const anchor = stitch
      ? { x: stitch.x, y: stitch.y }
      : { x: image.x + image.width / 2, y: image.y + image.height / 2 };
    const width =
      axis === "width" ? Math.max(CELL, image.naturalWidth * (nextPercent / 100)) : image.width;
    const height =
      axis === "height" ? Math.max(CELL, image.naturalHeight * (nextPercent / 100)) : image.height;
    updateReferenceImage(resizeReferenceImageAround(image, width, height, anchor));
  };

  const onFile = async (file: File) => {
    if (!meta) return;
    setBusy(true);
    setError(null);
    try {
      const previousRef = image?.ref;
      const uploaded = await uploadReferenceImage(meta.id, file);
      if (previousRef && previousRef !== uploaded.ref) await removeReferenceImageFile(previousRef);
      // Land it centred in the current view, sized to a comfortable fraction
      // of what's visible - close enough that the first thing a designer
      // does isn't hunt for a speck or a poster-sized image off-screen.
      // Starts aspect-locked to the source file; width/height can then
      // diverge via the stepper or the resize handle.
      const width = Math.max(CELL * 4, (viewport.width / camera.zoom) * 0.6);
      const height = width * (uploaded.naturalHeight / uploaded.naturalWidth);
      setReferenceImage({
        ref: uploaded.ref,
        naturalWidth: uploaded.naturalWidth,
        naturalHeight: uploaded.naturalHeight,
        width,
        height,
        x: camera.x - width / 2,
        y: camera.y - height / 2,
        opacity: 0.5,
        visible: true,
        locked: false,
      });
      // A successful upload immediately enters editing, so the newly placed
      // image and its controls are visible without an extra click.
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sideModule refpanel" data-editing={open && !!image}>
      <div className="sideModule__header refpanel__moduleHeader">
        <div>
          <h2>Reference image</h2>
          <span>{image ? (image.visible ? "Visible on canvas" : "Hidden") : "No image added"}</span>
        </div>
        {image ? (
          <button
            type="button"
            className="btn btn--quiet refpanel__headerAction"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
          >
            {open ? "Save changes" : "Edit reference"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--quiet refpanel__headerAction"
            disabled={busy || !meta}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? "Uploading…" : "Upload image"}
          </button>
        )}
      </div>

      {image && !open && (
        <div className="refpanel__quickControls" role="group" aria-label="Reference image quick controls">
          <button
            type="button"
            className="btn refpanel__iconButton"
            aria-label={image.visible ? "Hide reference image" : "Show reference image"}
            aria-pressed={image.visible}
            title={image.visible ? "Hide reference image" : "Show reference image"}
            onClick={() => updateReferenceImage({ visible: !image.visible })}
          >
            {image.visible ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 8s2.1-4 6.5-4 6.5 4 6.5 4-2.1 4-6.5 4S1.5 8 1.5 8Z" />
                <circle cx="8" cy="8" r="1.8" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M1.5 8s2.1-4 6.5-4c1 0 1.9.2 2.7.5M14.5 8s-2.1 4-6.5 4c-1 0-1.9-.2-2.7-.5" />
                <path d="m2.5 2.5 11 11" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="btn refpanel__iconButton refpanel__layerButton"
            aria-label={image.inFront ? "Send reference image behind stitches" : "Bring reference image in front of stitches"}
            aria-pressed={!!image.inFront}
            title={image.inFront ? "Send behind stitches" : "Bring in front of stitches"}
            onClick={() => updateReferenceImage({ inFront: !image.inFront })}
          >
            {image.inFront ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 2.5v11m0 0-3-3m3 3 3-3" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 13.5v-11m0 0-3 3m3-3 3 3" />
              </svg>
            )}
            <span>{image.inFront ? "Send behind" : "Bring to front"}</span>
          </button>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onFile(file);
        }}
      />

      {open && (
      <div className="refpanel__body">
        {image && (
          <>
            <p
              className={
                marking && calibrationRejected
                  ? "refpanel__hint refpanel__hint--warn"
                  : "refpanel__hint"
              }
            >
              {marking
                ? points.length === 0
                  ? calibrationRejected
                    ? "That box was too small to read. Zoom in and draw around one whole corner stitch."
                    : "Box a corner stitch to set the image's initial scale. Then add other corners to refine it."
                  : calibrationRejected
                    ? "That box was too small to read. Zoom in and drag across one whole stitch."
                    : "Add corner stitches and type their printed stitch and row numbers to refine the scale. Drag a box to move it onto the right stitch."
                : image.stitchPin
                  ? "Dragging it snaps the boxed stitch onto a grid cell (hold Alt to place it freely); arrow keys nudge it a step at a time. Any corner or edge resizes around that stitch \u2014 or drag the green box's own corners to re-fit it to one stitch."
                  : "Drag it on the canvas to move, or nudge it with the arrow keys (Shift for a whole stitch); drag any corner to resize, or an edge to stretch one way (hold Shift to keep its proportions)."}
            </p>
            <button
              type="button"
              className={marking ? "btn btn--quiet refpanel__setScale" : "btn btn--primary refpanel__setScale"}
              data-on={marking}
              disabled={!image.visible}
              title="Box a corner stitch to set the initial scale, then add others to refine it from their printed numbers"
              onClick={() => {
                // Leaving the mode drops the marks; coming back to a photo
                // half-marked from some earlier session, with no memory of
                // which stitch was which, is worse than starting over.
                if (marking) updateReferenceImage({ calibrationMarks: [] });
                setActiveMark(null);
                setCalibrating(false);
                setCalibrationRejected(false);
                setMarking(!marking);
              }}
            >
              {marking ? "Cancel scale setup" : "Set reference scale"}
            </button>
            <label className="refpanel__row">
              <span>Opacity</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={image.opacity}
                onChange={(e) => updateReferenceImage({ opacity: Number(e.target.value) })}
              />
            </label>
            <label className="refpanel__row" title="Stretch the image horizontally. Once a stitch is boxed, it stretches around that stitch's bottom-left corner.">
              <span>Width</span>
              <div className="refpanel__stepper">
                <button
                  type="button"
                  className="refpanel__stepBtn"
                  aria-label="Shrink image width"
                  onClick={() => applyScale("width", -1)}
                >
                  −
                </button>
                <span className="refpanel__stepValue">{widthPercent}%</span>
                <button
                  type="button"
                  className="refpanel__stepBtn"
                  aria-label="Enlarge image width"
                  onClick={() => applyScale("width", 1)}
                >
                  +
                </button>
              </div>
            </label>
            <label className="refpanel__row" title="Stretch the image vertically. Once a stitch is boxed, it stretches around that stitch's bottom-left corner.">
              <span>Height</span>
              <div className="refpanel__stepper">
                <button
                  type="button"
                  className="refpanel__stepBtn"
                  aria-label="Shrink image height"
                  onClick={() => applyScale("height", -1)}
                >
                  −
                </button>
                <span className="refpanel__stepValue">{heightPercent}%</span>
                <button
                  type="button"
                  className="refpanel__stepBtn"
                  aria-label="Enlarge image height"
                  onClick={() => applyScale("height", 1)}
                >
                  +
                </button>
              </div>
            </label>
            {marking && (
              <div className="refpanel__marks">
                {points.length === 0 ? (
                  <p className="refpanel__hint">No stitches boxed yet.</p>
                ) : (
                  <ul className="refpanel__markList">
                    {points.map((point, i) => {
                      const named = point.stitch !== null && point.row !== null;
                      return (
                        <li key={point.id}>
                          {/* Selecting here opens that mark's popover on the
                              canvas, so the panel stays a summary and there
                              is only ever one place to type. */}
                          <button
                            type="button"
                            className="refpanel__markRow"
                            data-active={point.id === activeMark}
                            onClick={() => setActiveMark(point.id)}
                          >
                            <span className="refpanel__markIndex" data-labelled={named}>
                              {i + 1}
                            </span>
                            <span className="refpanel__markNumbers" data-unset={!named}>
                              {point.stitch === null && point.row === null
                                ? "not numbered"
                                : `st ${point.stitch ?? "?"} · row ${point.row ?? "?"}`}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="refpanel__markRemove"
                            title="Remove this box"
                            onClick={() => {
                              updateReferenceImage({
                                calibrationMarks: withoutCalibrationMark(
                                  image.calibrationMarks,
                                  point.id,
                                ),
                              });
                              if (point.id === activeMark) setActiveMark(null);
                            }}
                          >
                            &times;
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="refpanel__hint">
                  {fit
                    ? `${labelled.length} numbered — ready to refine the scale.`
                    : labelled.length < 2
                      ? points.length === 0
                        ? ""
                        : "Add and number another corner stitch to refine the scale."
                      : !hasSpread
                        ? "Needs two different stitch numbers and two different row numbers."
                        : "The numbers imply an invalid or unsupported scale."}
                </p>
                <div className="refpanel__markActions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={!fit}
                    title={
                      fit
                        ? "Scale the image so the boxed stitches land the right distance apart"
                        : "Box at least two stitches with different stitch numbers and different row numbers"
                    }
                    onClick={() => {
                      if (!fit) return;
                      updateReferenceImage({ ...fit, calibrationMarks: [] });
                      setActiveMark(null);
                      setMarking(false);
                    }}
                  >
                    Refine scale
                  </button>
                  <button
                    type="button"
                    className="btn btn--quiet"
                    onClick={() => {
                      updateReferenceImage({ calibrationMarks: [] });
                      setActiveMark(null);
                    }}
                  >
                    Clear boxes
                  </button>
                </div>
              </div>
            )}
            <div className="refpanel__actions">
              <button
                type="button"
                className="btn btn--quiet"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                Replace
              </button>
              <button
                type="button"
                className="btn btn--quiet btn--danger"
                onClick={() => {
                  if (!image) return;
                  setBusy(true);
                  setError(null);
                  void removeReferenceImageFile(image.ref)
                    .then(() => {
                      removeReferenceImage();
                      setOpen(false);
                      setCalibrating(false);
                      setCalibrationBox(null);
                    })
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : "Could not remove reference image"),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Remove
              </button>
            </div>
          </>
        )}

      </div>
      )}
      {error && <p className="refpanel__error">{error}</p>}
    </section>
  );
}
