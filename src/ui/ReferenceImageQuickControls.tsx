import { useRef, useState } from "react";
import { useDocStore } from "../state/docStore";
import { IconButton } from "./Button";
import { Slider } from "./Field";
import { BringFrontSmallIcon, EditIcon, EyeOffSmallIcon, EyeSmallIcon, OpacityIcon, SendBehindSmallIcon } from "./icons";
import { useDismissOnOutsideOrEscape } from "./useDismissOnOutsideOrEscape";

/**
 * The reference panel's collapsed view: one row per image (edit, show/hide)
 * plus shared hide-all, opacity and front/behind controls for every image.
 */
export function ReferenceImageQuickControls({
  thumbUrls,
  onEdit,
}: {
  thumbUrls: Record<string, string>;
  onEdit: (imageId: string) => void;
}) {
  const images = useDocStore((s) => s.referenceImages);
  const updateReferenceImage = useDocStore((s) => s.updateReferenceImage);
  const [opacityOpen, setOpacityOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  // The shared front/behind toggle reads as "on" only once every image
  // actually is in front - otherwise it offers "Bring to front" for the
  // ones that aren't, rather than claiming a mixed state is already done.
  // Hide/show-all follows the same rule.
  const allInFront = images.length > 0 && images.every((img) => img.inFront);
  const allHidden = images.length > 0 && images.every((img) => !img.visible);

  useDismissOnOutsideOrEscape({
    enabled: opacityOpen,
    containerRef: ref,
    onDismiss: () => setOpacityOpen(false),
    captureOutsidePointerdown: false,
    stopEscapePropagation: true,
  });

  return (
    <div ref={ref} className="refpanel__quickControls" role="group" aria-label="Reference image quick controls">
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
              onClick={() => onEdit(img.id)}
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
        <div className="inset refpanel__quickOpacity">
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
  );
}
