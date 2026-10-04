import { StopIcon } from "./icons";
import { tapActivate } from "./tapActivate";

/** The "stop drawing" button shown wherever a stitch is armed. */
export function DisarmDrawingButton({ className, onActivate }: { className: string; onActivate: () => void }) {
  return (
    <button
      type="button"
      className={className}
      {...tapActivate(onActivate)}
      aria-label="Stop drawing"
      title="Stop drawing (Esc)"
    >
      <StopIcon />
    </button>
  );
}
