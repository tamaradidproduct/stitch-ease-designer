import { useEffect, useRef, useState } from "react";
import { CELL } from "../canvas/camera";
import { MAX_CONTRAST, MIN_CONTRAST, effectiveContrast } from "../canvas/referenceImageContrast";
import {
  scaleFromCalibrationMarks,
  withoutCalibrationMark,
} from "../model/referenceCalibration";
import { markCentre } from "../model/types";
import type { ReferenceImage } from "../model/types";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { resolveReferenceImageUrl, uploadReferenceImage } from "../storage/referenceImages";
import { newUuid } from "../uuid";
import { tapActivate } from "./tapActivate";
import { useDismissOnOutsideOrEscape } from "./useDismissOnOutsideOrEscape";
import { Button, IconButton } from "./Button";
import { Popover } from "./Popover";
import { BringFrontSmallIcon, EditIcon, EyeOffSmallIcon, EyeSmallIcon, OpacityIcon, PaletteDotsIcon, PlusIcon, ReplaceImageIcon, SendBehindSmallIcon, TrashIcon } from "./icons";
import { tokens } from "../design/tokens";
import { Checkbox, Slider } from "./Field";

/** Stitch-highlight presets offered in the trace-colors popover. */
const TRACE_COLORS = [tokens.highlight, tokens["trace-pink"], tokens["trace-violet"], tokens["trace-green"], tokens.accent];

/**
 * Upload + transform controls for the chart's reference images. A chart can
 * hold more than one (e.g. one per scanned page); the image list lets a
 * designer add, switch between, and remove them, while everything below it
 * - opacity, calibration, etc. - always acts on whichever one is active.
 *
 * Opening this panel is also what arms drag-to-move/resize on the canvas
 * itself (see `useReferenceImageTool`) - there's no separate "position"
 * tool to switch to, since this panel is the only place that transform is
 * ever relevant. Selecting an image only ever happens here, in the list -
 * clicking one on the canvas never changes which is active.
 */
export function ReferenceImagePanel() {
  const [traceMenuOpen, setTraceMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const referenceImagePanelRef = useRef<HTMLElement | null>(null);
  const isAdmin = useUiStore((s) => s.role === "admin");
  const open = useUiStore((s) => s.referenceImagePanelOpen);
  const setOpen = useUiStore((s) => s.setReferenceImagePanelOpen);
  const camera = useUiStore((s) => s.camera);
  const viewport = useUiStore((s) => s.viewport);
  const setCalibrating = useUiStore((s) => s.setReferenceImageCalibrating);
  const setMarking = useUiStore((s) => s.setReferenceImageMarking);
  const gridAlignmentStatus = useUiStore((s) => s.referenceImageGridAlignmentStatus);
  const setGridAlignmentStatus = useUiStore((s) => s.setReferenceImageGridAlignmentStatus);
  const setCalibrationBox = useUiStore((s) => s.setReferenceImageCalibrationBox);
  const calibrationRejected = useUiStore((s) => s.referenceImageCalibrationRejected);
  const marking = useUiStore((s) => s.referenceImageMarking);
  const setActiveMark = useUiStore((s) => s.setReferenceImageActiveMark);
  const activeMark = useUiStore((s) => s.referenceImageActiveMark);
  const stitchHighlightColor = useUiStore((s) => s.stitchHighlightColor);
  const stitchHighlightOpacity = useUiStore((s) => s.stitchHighlightOpacity);
  const setStitchHighlight = useUiStore((s) => s.setStitchHighlight);
  const setStitchHighlightOpacity = useUiStore((s) => s.setStitchHighlightOpacity);
  const activeImageId = useUiStore((s) => s.activeReferenceImageId);
  const setActiveImageId = useUiStore((s) => s.setActiveReferenceImageId);
  const centerCameraAt = useUiStore((s) => s.centerCameraAt);

  const meta = useDocStore((s) => s.meta);
  const images = useDocStore((s) => s.referenceImages);
  const addReferenceImage = useDocStore((s) => s.addReferenceImage);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const removeReferenceImage = useDocStore((s) => s.removeReferenceImage);
  const image = images.find((img) => img.id === activeImageId) ?? null;

  // Thumbnails for the image list. Resolved once per distinct ref set,
  // rather than reusing the canvas's own ReferenceImageCache, so a panel
  // thumbnail never depends on whether that image happens to be visible or
  // in the current viewport.
  // Keeps the active image pointed at something real whenever the array
  // changes out from under it in a way this component didn't itself drive -
  // undo/redo (docStore's own history has no notion of uiStore's active-id)
  // being the main case, restoring a removed image without also restoring
  // who's "active" would otherwise leave every per-image control pointed at
  // nothing until the designer clicks a row by hand.
  useEffect(() => {
    if (activeImageId && images.some((img) => img.id === activeImageId)) return;
    setActiveImageId(images[0]?.id ?? null);
  }, [images, activeImageId, setActiveImageId]);

  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const refsKey = images.map((img) => `${img.id}:${img.ref}`).join(",");
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      images.map(async (img) => {
        try {
          return [img.id, await resolveReferenceImageUrl(img.ref)] as const;
        } catch {
          return [img.id, ""] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setThumbUrls(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refsKey]);

  // Recomputed as the numbers are typed, so "Refine scale" is only live once
  // the marks actually determine a scale - which is also the clearest way to
  // say that two of them naming the same row pins nothing down.
  const points = image?.calibrationMarks ?? [];
  const labelled = points.filter((p) => p.stitch !== null && p.row !== null);
  const fit = image ? scaleFromCalibrationMarks(image, points) : null;
  const hasSpread =
    new Set(labelled.map((point) => point.stitch)).size >= 2 &&
    new Set(labelled.map((point) => point.row)).size >= 2;
  // The shared front/behind toggle reads as "on" only once every image
  // actually is in front - otherwise it offers "Bring to front" for the
  // ones that aren't, rather than claiming a mixed state is already done.
  const allInFront = images.length > 0 && images.every((img) => img.inFront);
  // Same "reads as on only once it's uniformly true" logic as allInFront,
  // for the shared hide/show-all toggle.
  const allHidden = images.length > 0 && images.every((img) => !img.visible);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Which upload the file input's change handler should perform - set right
  // before it's clicked, since "Add" and "Replace" share one hidden input.
  const uploadMode = useRef<"add" | "replace">("add");

  useDismissOnOutsideOrEscape({
    enabled: traceMenuOpen,
    containerRef: referenceImagePanelRef,
    onDismiss: () => setTraceMenuOpen(false),
    captureOutsidePointerdown: false,
    stopEscapePropagation: true,
  });
  useDismissOnOutsideOrEscape({
    enabled: helpOpen,
    containerRef: referenceImagePanelRef,
    onDismiss: () => setHelpOpen(false),
    captureOutsidePointerdown: false,
    stopEscapePropagation: true,
  });
  useDismissOnOutsideOrEscape({
    enabled: opacityOpen,
    containerRef: referenceImagePanelRef,
    onDismiss: () => setOpacityOpen(false),
    captureOutsidePointerdown: false,
    stopEscapePropagation: true,
  });

  const onFile = async (file: File) => {
    if (!meta) return;
    const mode = uploadMode.current;
    const replacing = mode === "replace" ? image : null;
    setBusy(true);
    setError(null);
    try {
      const id = newUuid();
      const uploaded = await uploadReferenceImage(meta.id, file, id);
      // Land it centred in the current view, sized to a comfortable fraction
      // of what's visible - close enough that the first thing a designer
      // does isn't hunt for a speck or a poster-sized image off-screen.
      // Starts aspect-locked to the source file; width/height can then
      // diverge via the stepper or the resize handle. Replacing starts over
      // with these same defaults, since the new file's calibration can't
      // carry over from the old one either way.
      const width = Math.max(CELL * 4, (viewport.width / camera.zoom) * 0.6);
      const height = width * (uploaded.naturalHeight / uploaded.naturalWidth);
      // Replacing keeps the same number - it's still "Image N" in the same
      // spot, just pointing at a new file. A fresh add always gets a number
      // higher than any currently on the chart, so deleting one never frees
      // its number up for reuse by whatever's added next.
      const number = replacing
        ? replacing.number
        : Math.max(0, ...images.map((img) => img.number)) + 1;
      // Capture the replaced image's slot before removing it - array order is
      // manual z-order (FR-52), so the new image needs to land back in that
      // same slot rather than at the end. Removing first, then inserting at
      // that same index into the now-shrunk array, puts it exactly where the
      // old one was.
      const replacingIndex = replacing ? images.findIndex((img) => img.id === replacing.id) : -1;
      const newImage: ReferenceImage = {
        id,
        number,
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
        // Crop-to-calibration is on by default for new images (#266):
        // positional error from the calibration fit grows with distance
        // from the named marks, so both rendering and Suggest's matching
        // trust only the region the designer actually calibrated against.
        cropToCalibration: true,
        ...(replacing?.inFront ? { inFront: true } : {}),
      };
      // The replaced image's old file is deliberately left in Storage
      // rather than deleted here - both this add and the remove below are
      // undoable, and deleting the file immediately would leave Undo
      // pointing at a 404 if the designer brings it back.
      if (replacing) removeReferenceImage(replacing.id);
      if (replacingIndex !== -1) {
        addReferenceImage(newImage, replacingIndex);
      } else {
        addReferenceImage(newImage);
      }
      setActiveImageId(id);
      // A successful upload immediately enters editing, so the newly placed
      // image and its controls are visible without an extra click.
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload that image");
    } finally {
      setBusy(false);
    }
  };

  // Removing is undoable (see docStore's removeReferenceImage), so the
  // underlying Storage file is deliberately left alone here rather than
  // deleted - doing so immediately would leave a later Undo pointing at a
  // 404. It only actually goes away if the chart itself is deleted (see
  // ChartList.tsx), which accepts a removed-but-never-undone image's file
  // going briefly unreferenced in exchange for Undo never showing a broken
  // image.
  const removeImage = (img: ReferenceImage) => {
    removeReferenceImage(img.id);
    if (img.id !== activeImageId) return;
    const remaining = images.filter((other) => other.id !== img.id);
    setActiveImageId(remaining[0]?.id ?? null);
    if (!remaining.length) {
      setOpen(false);
      setCalibrating(false);
      setGridAlignmentStatus("idle");
      setCalibrationBox(null);
    }
  };

  // Defensive re-check: RightPanel already doesn't render this component for
  // a non-admin, but this keeps it inert on its own too, in case something
  // else ever mounts it directly.
  if (!isAdmin) return null;

  return (
    <section ref={referenceImagePanelRef} className="sideModule refpanel" data-editing={open && !!image}>
      <div className="sideModule__header refpanel__moduleHeader">
        <div>
          <h2>Reference image{images.length > 1 ? "s" : ""}</h2>
          <span>
            {images.length === 0
              ? "No image added"
              : images.length === 1
                ? image?.visible
                  ? "Visible on canvas"
                  : "Hidden"
                : `${images.length} images`}
          </span>
        </div>
        <div className="refpanel__headerControls">
          {images.length > 0 ? (
            // Editing a specific image starts from its own row below, not a
            // single global button here - opening the panel just to see
            // that list needs no separate action. Once open, this becomes
            // the panel's own Save changes, alongside the dock's copy on
            // the canvas, so either is in reach depending on where the eye
            // already is. Closed, it's instead where "Add" lives - moved up
            // here from its own full-width row so the collapsed list reads
            // tighter.
            (open ? (
              <Button
                variant="quiet"
                className="refpanel__headerAction"
                onClick={() => setOpen(false)}
              >
                Save changes
              </Button>
            ) : (
              <Button variant="unstyled"
                className="refpanel__paletteButton"
                disabled={busy || !meta}
                aria-label="Add another reference image"
                title="Add another reference image"
                onClick={() => {
                  uploadMode.current = "add";
                  fileInput.current?.click();
                }}
              >
                <PlusIcon />
              </Button>
            ))
          ) : (
            <Button
              variant="primary"
              className="refpanel__headerAction"
              disabled={busy || !meta}
              onClick={() => {
                uploadMode.current = "add";
                fileInput.current?.click();
              }}
            >
              {busy ? "Uploading…" : "Upload image"}
            </Button>
          )}
          <Button variant="unstyled"
            className="refpanel__paletteButton"
            data-on={traceMenuOpen || stitchHighlightOpacity > 0}
            {...tapActivate(() => setTraceMenuOpen((isOpen) => !isOpen))}
            aria-expanded={traceMenuOpen}
            aria-label="Canvas stitch colors"
            title="Canvas stitch colors"
          >
            <PaletteDotsIcon />
          </Button>
        </div>
      </div>
      {traceMenuOpen && (
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
      )}

      {images.length > 0 && !open && (
        <div className="refpanel__quickControls" role="group" aria-label="Reference image quick controls">
          <ul className="refpanel__quickList">
            {images.map((img) => (
              <li key={img.id} className="refpanel__quickRow">
                {/* Identification only, not a control - editing and
                    visibility each get their own explicit button to the
                    right, rather than overloading a click on the label. */}
                <span className="refpanel__quickLabel">
                  {thumbUrls[img.id] ? (
                    <img className="refpanel__imageThumb" src={thumbUrls[img.id]} alt="" />
                  ) : (
                    <span className="refpanel__imageThumb refpanel__imageThumb--empty" aria-hidden="true" />
                  )}
                  <span>Image {img.number}</span>
                </span>
                <IconButton
                  className="refpanel__iconButton"
                  label={`Edit image ${img.number}`}
                  tooltip="Edit"
                  onClick={() => {
                    setActiveImageId(img.id);
                    setOpen(true);
                  }}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  className="refpanel__iconButton"
                  label={img.visible ? `Hide image ${img.number}` : `Show image ${img.number}`}
                  aria-pressed={img.visible}
                  tooltip={img.visible ? "Hide" : "Show"}
                  onClick={() => updateReferenceImage(img.id, { visible: !img.visible })}
                >
                  {img.visible ? (
                    <EyeSmallIcon />
                  ) : (
                    <EyeOffSmallIcon />
                  )}
                </IconButton>
              </li>
            ))}
          </ul>
          <div className="refpanel__quickBottomRow">
            {/* One shared hide/show-all toggle, same "reads as on only once
                uniform" logic as the front/behind toggle below - per-image
                visibility stays reachable on each row for the common single-
                image tweak. */}
            <IconButton
              className="refpanel__iconButton"
              label={allHidden ? "Show all reference images" : "Hide all reference images"}
              aria-pressed={allHidden}
              tooltip={allHidden ? "Show all" : "Hide all"}
              onClick={() => images.forEach((img) => updateReferenceImage(img.id, { visible: allHidden }))}
            >
              {allHidden ? (
                <EyeOffSmallIcon />
              ) : (
                <EyeSmallIcon />
              )}
            </IconButton>
            <IconButton
              className="refpanel__iconButton"
              label="Adjust opacity"
              aria-expanded={opacityOpen}
              tooltip="Opacity"
              onClick={() => setOpacityOpen((isOpen) => !isOpen)}
            >
              <OpacityIcon />
            </IconButton>
            {/* One shared front/behind toggle for every image at once - unlike
                visibility and editing, which stay per-image, stacking order
                relative to the chart is a single yes/no the designer thinks
                about for the whole reference photo set, not image by image. */}
            <IconButton
              className="refpanel__iconButton refpanel__layerButton"
              label={allInFront ? "Send reference images behind stitches" : "Bring reference images in front of stitches"}
              aria-pressed={allInFront}
              tooltip={allInFront ? "Send behind stitches" : "Bring in front of stitches"}
              onClick={() => images.forEach((img) => updateReferenceImage(img.id, { inFront: !allInFront }))}
            >
              {allInFront ? (
                <SendBehindSmallIcon />
              ) : (
                <BringFrontSmallIcon />
              )}
              <span>{allInFront ? "Send behind" : "Bring to front"}</span>
            </IconButton>
          </div>
          {opacityOpen && (
            <div className="refpanel__quickOpacityPopover">
              <label className="refpanel__row">
                <span>Opacity</span>
                <Slider
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={images[0]?.opacity ?? 0.5}
                  onChange={(e) => {
                    const opacity = Number(e.target.value);
                    images.forEach((img) => updateReferenceImage(img.id, { opacity }));
                  }}
                />
              </label>
            </div>
          )}
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
        {images.length > 0 && (
          <div className="refpanel__images">
            <ul className="refpanel__imageList">
              {images.map((img) => (
                <li key={img.id}>
                  <Button variant="unstyled"
                    className="refpanel__imageRow"
                    data-active={img.id === activeImageId}
                    onClick={() => setActiveImageId(img.id)}
                  >
                    {thumbUrls[img.id] ? (
                      <img className="refpanel__imageThumb" src={thumbUrls[img.id]} alt="" />
                    ) : (
                      <span className="refpanel__imageThumb refpanel__imageThumb--empty" aria-hidden="true" />
                    )}
                    <span>Image {img.number}</span>
                  </Button>
                  <Button variant="unstyled"
                    className="refpanel__imageAction"
                    title="Replace this image"
                    disabled={busy}
                    onClick={() => {
                      setActiveImageId(img.id);
                      uploadMode.current = "replace";
                      fileInput.current?.click();
                    }}
                  >
                    <ReplaceImageIcon />
                  </Button>
                  <Button variant="unstyled"
                    className="refpanel__imageAction refpanel__imageAction--danger"
                    title="Remove this image"
                    disabled={busy}
                    onClick={() => removeImage(img)}
                  >
                    <TrashIcon />
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="unstyled"
              className="glossary__item glossary__item--empty refpanel__addImage"
              disabled={busy || !meta}
              title="Add another reference image"
              onClick={() => {
                uploadMode.current = "add";
                fileInput.current?.click();
              }}
            >
              <span className="glossary__emptyGlyph" aria-hidden="true">+</span>
              <span className="glossary__label">{busy ? "Uploading…" : "Add image"}</span>
            </Button>
          </div>
        )}
        {image && (
          <label className="refpanel__row">
            <span>Opacity</span>
            <Slider
              min={0.1}
              max={1}
              step={0.05}
              value={image.opacity}
              onChange={(e) => updateReferenceImage(image.id, { opacity: Number(e.target.value) })}
            />
          </label>
        )}
        {image && (
          <>
            <label className="refpanel__row">
              <span>Contrast</span>
              <Slider
                min={MIN_CONTRAST}
                max={MAX_CONTRAST}
                step={0.05}
                value={effectiveContrast(image)}
                title="Boost or soften this image's contrast. Calibration and stitch suggestions read the adjusted image."
                onChange={(e) => updateReferenceImage(image.id, { contrast: Number(e.target.value) })}
                onDoubleClick={() => updateReferenceImage(image.id, { contrast: 1 })}
              />
            </label>
            {marking && (
            <p
              className={
                calibrationRejected || gridAlignmentStatus === "failed"
                  ? "refpanel__hint refpanel__hint--warn"
                  : "refpanel__hint"
              }
            >
              {gridAlignmentStatus === "detecting"
                  ? "Tightening that reference point to the nearby chart lines…"
                  : gridAlignmentStatus === "failed"
                    ? "Those lines were too blurry to detect, so the drawn box was used. Add more numbered reference points for precision."
                    : points.length === 0
                      ? calibrationRejected
                        ? "That box was too small to read. Zoom in and draw around one whole corner stitch."
                        : "Box a corner stitch roughly; nearby grid lines will refine it. Then add 2–3 more numbered points for precision."
                      : calibrationRejected
                        ? "That box was too small to read. Zoom in and drag across one whole stitch."
                        : "Add 2–3 more reference points and enter their printed stitch and row numbers to refine the scale."}
            </p>
            )}
            <div className="refpanel__helpRow">
              <Button variant="unstyled"
                className="refpanel__paletteButton refpanel__helpButton"
                data-on={helpOpen}
                aria-expanded={helpOpen}
                aria-label="How to use these controls"
                title="How to use these controls"
                {...tapActivate(() => setHelpOpen((isOpen) => !isOpen))}
              >
                ?
              </Button>
            </div>
            {helpOpen && (
              <div className="refpanel__helpPopover">
                {!marking && (
                  <p className="refpanel__hint">
                    {image.stitchPin
                      ? "Dragging it snaps the boxed stitch onto a grid cell (hold Alt to place it freely); arrow keys nudge it a step at a time. Any corner or edge resizes around that stitch — or drag the green box's own corners to re-fit it to one stitch."
                      : "Drag it on the canvas to move, or nudge it with the arrow keys (Shift for a whole stitch); drag any corner to resize, or an edge to stretch one way (hold Shift to keep its proportions)."}
                  </p>
                )}
                <p className="refpanel__dockHint">
                  Use the reference tools at the bottom of the canvas to set and refine scale points.
                </p>
              </div>
            )}
            {(marking || points.length > 0) && (
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
                              is only ever one place to type. Also re-centres
                              the camera on the mark, since a calibration
                              point on a large reference image is often
                              scrolled well out of view by the time it's
                              picked from this list. */}
                          <Button variant="unstyled"
                            className="refpanel__markRow"
                            data-active={point.id === activeMark}
                            onClick={() => {
                              setMarking(true);
                              setActiveMark(point.id);
                              if (!image) return;
                              const centre = markCentre(point);
                              const desiredScreenX = Math.max(92, Math.min(viewport.width * 0.28, viewport.width - 340));
                              const desiredScreenY = Math.max(96, Math.min(viewport.height * 0.24, viewport.height - 180));
                              centerCameraAt(
                                image.x + centre.u * image.width - (desiredScreenX - viewport.width / 2) / camera.zoom,
                                image.y + centre.v * image.height + (desiredScreenY - viewport.height / 2) / camera.zoom,
                              );
                            }}
                          >
                            <span className="refpanel__markIndex" data-labelled={named}>
                              {i + 1}
                            </span>
                            <span className="refpanel__markNumbers" data-unset={!named}>
                              {point.stitch === null && point.row === null
                                ? "not numbered"
                                : `st ${point.stitch ?? "?"} · row ${point.row ?? "?"}`}
                            </span>
                          </Button>
                          <Button variant="unstyled"
                            className="refpanel__markRemove"
                            title="Remove this box"
                            aria-label="Remove this box"
                            onClick={() => {
                              updateReferenceImage(image.id, {
                                calibrationMarks: withoutCalibrationMark(
                                  image.calibrationMarks,
                                  point.id,
                                ),
                              });
                              if (point.id === activeMark) setActiveMark(null);
                            }}
                          >
                            &times;
                          </Button>
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
              </div>
            )}
            <Checkbox
              labelClassName="refpanel__checkbox"
              title="Hide the parts of this image outside the stitches you've boxed and named on it, and exclude that same region from Suggest's matching. Fully reversible - never trims the image itself, and does nothing until at least one mark is named. On by default for new images."
              checked={!!image.cropToCalibration}
              onChange={(e) => updateReferenceImage(image.id, { cropToCalibration: e.target.checked })}
            >
              Crop to calibrated stitches
            </Checkbox>
          </>
        )}

      </div>
      )}
      {error && <p className="refpanel__error">{error}</p>}
    </section>
  );
}
