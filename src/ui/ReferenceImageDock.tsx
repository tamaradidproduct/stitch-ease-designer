import { useLayoutEffect, useRef, useState } from "react";
import { scaleFromCalibrationMarks } from "../model/referenceCalibration";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { tapActivate } from "./tapActivate";

/**
 * The small, canvas-adjacent toolset used while a reference image is being
 * edited.  It deliberately contains only actions that affect the canvas in
 * the moment; detailed opacity and resize controls stay in the side panel.
 */
export function ReferenceImageDock() {
  const activeImageId = useUiStore((s) => s.activeReferenceImageId);
  const image = useDocStore((s) => s.referenceImages.find((img) => img.id === activeImageId) ?? null);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const marking = useUiStore((s) => s.referenceImageMarking);
  const setMarking = useUiStore((s) => s.setReferenceImageMarking);
  const setActiveMark = useUiStore((s) => s.setReferenceImageActiveMark);
  const setCalibrating = useUiStore((s) => s.setReferenceImageCalibrating);
  const setGridAlignmentStatus = useUiStore((s) => s.setReferenceImageGridAlignmentStatus);
  const setCalibrationRejected = useUiStore((s) => s.setReferenceImageCalibrationRejected);
  const setPanelOpen = useUiStore((s) => s.setReferenceImagePanelOpen);
  const rightPanelWidth = useUiStore((s) => s.rightPanelWidth);
  const quickDockRef = useRef<HTMLDivElement>(null);
  const [availableLane, setAvailableLane] = useState<{ left: number; width: number } | null>(null);
  const hasImage = image !== null;

  // The reference scale controls share the bottom edge with the persistent
  // Pan button and the image quick actions. Measure those two neighbours so
  // the scale dock is centered in the *actual* clear space between them,
  // instead of merely centered in the whole canvas.
  useLayoutEffect(() => {
    if (!hasImage || typeof document === "undefined") return;

    const stage = document.querySelector<HTMLElement>(".stage");
    const panDock = document.querySelector<HTMLElement>(".panDock");
    const quickDock = quickDockRef.current;
    if (!stage || !quickDock) return;

    const updateLane = () => {
      const stageRect = stage.getBoundingClientRect();
      const panRect = panDock?.getBoundingClientRect();
      const quickRect = quickDock.getBoundingClientRect();
      const panelBoundary = stageRect.width - rightPanelWidth;
      const left = Math.max(16, (panRect?.right ?? stageRect.left) - stageRect.left + 16);
      const right = Math.min(panelBoundary - 16, quickRect.left - stageRect.left - 16);
      const next = { left: Math.round(left), width: Math.max(0, Math.round(right - left)) };
      setAvailableLane((current) =>
        current?.left === next.left && current.width === next.width ? current : next,
      );
    };

    updateLane();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateLane);
    observer?.observe(stage);
    observer?.observe(quickDock);
    if (panDock) observer?.observe(panDock);
    window.addEventListener("resize", updateLane);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateLane);
    };
  }, [hasImage, rightPanelWidth]);

  if (!image) return null;

  const points = image.calibrationMarks ?? [];
  const fit = marking ? scaleFromCalibrationMarks(image, points) : null;
  // The first boxed stitch already establishes the initial image scale and
  // snaps it to the canvas. More numbered points improve that scale, but
  // should not be required before the designer can confirm the first pass.
  const canApply = !!fit || (points.length > 0 && !!image.stitchPin);

  const toggleMarking = () => {
    setActiveMark(null);
    setCalibrating(false);
    setGridAlignmentStatus("idle");
    setCalibrationRejected(false);
    setMarking(!marking);
  };

  const refine = () => {
    if (!canApply) return;
    // Keep the numbered reference points after applying. They are useful
    // calibration data, not disposable UI, and make it possible to reopen
    // setup later, correct a number, and refine the same image again.
    if (fit) updateReferenceImage(image.id, fit);
    setActiveMark(null);
    setMarking(false);
  };

  const stopCanvasGesture = (event: React.PointerEvent | React.MouseEvent) => event.stopPropagation();

  return (
    <>
      <div
        className="referenceDockPositioner"
        style={availableLane ? { left: availableLane.left, width: availableLane.width, right: "auto" } : undefined}
      >
        <div
          className="referenceDock"
          aria-label="Reference scale tools"
          // These controls float above the canvas. Keep their gestures out of
          // the canvas listeners so a tap cannot also start a mark or image drag.
          onPointerDown={stopCanvasGesture}
          onClick={stopCanvasGesture}
        >
      <button
        type="button"
        className={marking ? "toolDock__button referenceDock__cancel" : "toolDock__button"}
        aria-pressed={false}
        {...tapActivate(toggleMarking)}
        title={marking ? "Leave scale setup and keep these reference points" : "Set reference scale"}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 4.5h5v5H3zM12 10.5h5v5h-5z" />
          <path d="M8 7 12 11M6 11v5m-2.5-2.5h5" />
        </svg>
        <span>{marking ? "Cancel" : "Set scale"}</span>
      </button>
      {marking && (
        <>
          <button
            type="button"
            className="toolDock__button referenceDock__apply"
            disabled={!canApply}
            {...tapActivate(refine)}
            title={fit
              ? "Apply the refined scale from numbered reference points"
              : canApply
                ? "Keep the initial scale from this reference point"
                : "Box a reference stitch to set the initial scale"}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 10 4 4 8-8" />
            </svg>
            <span>Apply scale</span>
          </button>
          <button
            type="button"
            className="toolDock__button"
            disabled={points.length === 0}
            {...tapActivate(() => {
              updateReferenceImage(image.id, { calibrationMarks: [] });
              setActiveMark(null);
            })}
            title="Clear reference points"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
            <span>Clear points</span>
          </button>
        </>
      )}
        </div>
        <div
          className="referenceDock referenceDock--save"
          aria-label="Save reference image changes"
          onPointerDown={stopCanvasGesture}
          onClick={stopCanvasGesture}
        >
          <button
            type="button"
            className="toolDock__button"
            {...tapActivate(() => setPanelOpen(false))}
            title="Save reference image changes"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 10 4 4 8-8" />
            </svg>
            <span>Save changes</span>
          </button>
        </div>
      </div>
      <div
        className="referenceImageQuickDock"
        ref={quickDockRef}
        // 24px clear of the panel's own (now resizable) left edge, matching
        // the fixed gap the CSS default (328px = 304px panel + 24px) used to
        // hardcode for the panel's old fixed width.
        style={{ right: rightPanelWidth + 24 }}
        aria-label="Reference image visibility and layer controls"
        onPointerDown={stopCanvasGesture}
        onClick={stopCanvasGesture}
      >
        <button
          type="button"
          className="toolDock__button"
          aria-pressed={image.visible}
          {...tapActivate(() => updateReferenceImage(image.id, { visible: !image.visible }))}
          title={image.visible ? "Hide reference image" : "Show reference image"}
        >
          {image.visible ? (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2 10s2.7-5 8-5 8 5 8 5-2.7 5-8 5-8-5-8-5Z" />
              <circle cx="10" cy="10" r="2" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M2 10s2.7-5 8-5c1.2 0 2.2.2 3.1.6M18 10s-2.7 5-8 5c-1.2 0-2.2-.2-3.1-.6" />
              <path d="m3 3 14 14" />
            </svg>
          )}
          <span>{image.visible ? "Hide" : "Show"}</span>
        </button>
        <button
          type="button"
          className="toolDock__button"
          aria-pressed={!!image.inFront}
          {...tapActivate(() => updateReferenceImage(image.id, { inFront: !image.inFront }))}
          title={image.inFront ? "Send reference image behind stitches" : "Bring reference image in front of stitches"}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            {image.inFront ? (
              <path d="M10 3v14m0 0-3-3m3 3 3-3" />
            ) : (
              <path d="M10 17V3m0 0-3 3m3-3 3 3" />
            )}
          </svg>
          <span>{image.inFront ? "Send behind" : "Bring to front"}</span>
        </button>
      </div>
    </>
  );
}
