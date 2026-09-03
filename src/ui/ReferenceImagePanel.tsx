import { useRef, useState } from "react";
import { CELL } from "../canvas/camera";
import { resizeReferenceImageAround } from "../model/types";
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
  const calibrating = useUiStore((s) => s.referenceImageCalibrating);
  const setCalibrating = useUiStore((s) => s.setReferenceImageCalibrating);
  const setCalibrationBox = useUiStore((s) => s.setReferenceImageCalibrationBox);

  const meta = useDocStore((s) => s.meta);
  const image = useDocStore((s) => s.referenceImage);
  const setReferenceImage = useDocStore((s) => s.setReferenceImage);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const removeReferenceImage = useDocStore((s) => s.removeReferenceImage);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

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
    // Anchored on the image's own current centre, so nudging the size
    // doesn't also shove the image off in some direction.
    const center = { x: image.x + image.width / 2, y: image.y + image.height / 2 };
    const width =
      axis === "width" ? Math.max(CELL, image.naturalWidth * (nextPercent / 100)) : image.width;
    const height =
      axis === "height" ? Math.max(CELL, image.naturalHeight * (nextPercent / 100)) : image.height;
    updateReferenceImage(resizeReferenceImageAround(image, width, height, center));
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="refpanel">
      <div className="refpanel__header">
        <span className="refpanel__title">Reference image</span>
        <button
          type="button"
          className="picker__close"
          onClick={() => setOpen(false)}
          aria-label="Close"
          title="Close"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3.5 3.5l9 9m0-9l-9 9"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="refpanel__body">
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

        {!image ? (
          <>
            <p className="refpanel__hint">
              A pattern screenshot, placed behind your chart to trace against.
            </p>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !meta}
              onClick={() => fileInput.current?.click()}
            >
              {busy ? "Uploading…" : "Upload image"}
            </button>
          </>
        ) : (
          <>
            <p className="refpanel__hint">
              {calibrating
                ? "Draw a box around one stitch in the image."
                : "Drag it on the canvas to move; drag its bottom-right corner to resize (hold Shift to keep its proportions)."}
            </p>
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
            <label className="refpanel__row" title="Stretch the image horizontally, around its own centre">
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
            <label className="refpanel__row" title="Stretch the image vertically, around its own centre">
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
            <button
              type="button"
              className="btn btn--quiet"
              data-on={calibrating}
              disabled={!image.visible}
              title="Draw a box around one stitch in the image to scale it to match your chart"
              onClick={() => {
                if (calibrating) setCalibrationBox(null);
                setCalibrating(!calibrating);
              }}
            >
              {calibrating ? "Cancel" : "Set stitch size"}
            </button>
            <div className="refpanel__actions">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => updateReferenceImage({ visible: !image.visible })}
              >
                {image.visible ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => updateReferenceImage({ locked: !image.locked })}
              >
                {image.locked ? "Unlock" : "Lock"}
              </button>
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

        {error && <p className="refpanel__error">{error}</p>}
      </div>
    </div>
  );
}
