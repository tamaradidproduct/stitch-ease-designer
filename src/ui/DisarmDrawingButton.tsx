import { StopIcon } from "./icons";
import { tapActivate } from "./tapActivate";
import { IconButton } from "./Button";

/** The "stop drawing" button shown wherever a stitch is armed. */
export function DisarmDrawingButton({ className, onActivate }: { className: string; onActivate: () => void }) {
  return (
    <IconButton
      variant="unstyled"
      className={className}
      {...tapActivate(onActivate)}
      label="Stop drawing"
      tooltip="Stop drawing (Esc)"
    >
      <StopIcon />
    </IconButton>
  );
}
