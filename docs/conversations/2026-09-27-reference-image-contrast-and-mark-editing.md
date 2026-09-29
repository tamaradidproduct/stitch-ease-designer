# Reference image contrast, granular calibration points, responsive dock

**Date:** 2026-09-27

## Decisions

- **Contrast, not tone curves.** Faded/low-contrast photos made grid lines
  hard to see and detect. A single contrast slider per image was added, and
  calibration + Suggest read the adjusted pixels. A whites/highlights/
  shadows/blacks control was built next and rejected ("not helping"), so it
  was removed and contrast kept.
- **Calibration points editable like the green stitch box.** Points could
  only be moved. They can now be resized by corner/side handles and
  Alt+arrows, and clicking a point in the panel list opens editing.
- **QA #246** (Save changes separate, right, hidden during Apply scale):
  already largely landed on main (#276); verified.
- **QA #253** (narrow screens): secondary actions collapse to icons, then
  stack above Save changes; Set scale group is primary. Thresholds (900/640px)
  are estimates to tune.
- **Out of scope by choice:** the right panel's own Save changes button stays
  visible during scale setup.
