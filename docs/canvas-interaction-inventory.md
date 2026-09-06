# Canvas interaction inventory

This is an implementation-level inventory of the interactions that currently
run on the chart canvas. It is deliberately organized by *trigger* and
*precedence*, so a proposed interaction change can identify the rule it should
replace rather than accidentally adding another competing path.

## Interaction table

| Interaction | Shortcut / event that evokes it | What it does now | Current precedence / notes |
| --- | --- | --- | --- |
| Hover a cell | Move the pointer over the grid | Updates the hovered cell and its row/stitch context. Moving the pointer clears keyboard-selection focus. | Does not alter the chart. Rulers are excluded. |
| Arm a stitch | Click a glossary stitch; press `1`–`5` for an occupied quick slot | Makes the stitch the active Draw symbol and returns to Draw. | The number keys do nothing for an empty slot. Picker search owns printable keys while it is open. |
| Open the stitch picker | Click an empty cell with no stitch armed; press `/` while hovering; click a single existing stitch | Opens a contextual picker at the target cell. On an existing stitch it is a replacement picker. | Space-pan is blocked so typing works; middle-button and trackpad panning remain available and close the picker. An outside canvas click closes it before performing a normal canvas action. |
| Place one stitch | Draw tool + armed stitch + click an empty cell | Places the armed stitch. | Cannot start if an existing selection must first be cleared; that click only clears selection. |
| Paint freehand | Draw tool + armed stitch + pointer drag | Places the armed stitch in every crossed cell. Suggest, confirm, and dismiss reuse this stroke engine. | Existing symbols are painted over during a stroke; only the initial filled-cell click has selection behavior. |
| Draw a constrained line | Draw tool + armed stitch + hold `Shift` **before** pointerdown, then drag | Paints a straight row or column from the gesture’s start cell. The first meaningful movement chooses the dominant axis. | A `Shift` click without movement is held provisionally for gap fill. |
| Fill a gap | Place/paint a stitch, then hold `Shift` before clicking another cell | Fills the orthogonal cells from the most recently drawn cell to the click. | If the pointer moves after that press, the gesture becomes a new constrained line instead. Only applies when the active stroke mode is unchanged. |
| Suggest stitches from reference | Draw tool + `Q` to arm Suggest + click/drag over calibrated reference image | Matches the image crop and places a pending suggested stitch, or marks the cell unreadable. | `Q` avoids the former `G` / `Cmd/Ctrl+G` repeat collision. |
| Confirm a pending suggestion | `Cmd/Ctrl` + click/drag a suggested stitch | Turns the suggestion into a confirmed stitch. | Intended to override temporary Select, selection drag, and image manipulation **when the pointer is on a suggested placement**. |
| Confirm and override a suggestion | Arm a real stitch, then `Cmd/Ctrl` + click/drag a suggested stitch | Replaces the suggestion with the armed stitch and confirms it in the same action. | This is the interaction currently reported as being overridden by Select; see conflict C1. |
| Dismiss a pending suggestion | `Alt/Option` + click/drag a suggested stitch | Removes the pending suggested stitch. | Only has effect on suggestions. Elsewhere Alt supports duplicate-drag. |
| Select one stitch | Select tool + click an existing stitch; temporary Select (`Cmd/Ctrl`) + click | Selects the whole group containing the stitch. A single selection opens the replacement picker. | `Cmd/Ctrl` is global temporary Select except on a suggestion, where it is intended to confirm/override. |
| Add/remove from a selection | `Shift` + click an existing stitch | Adds the stitch’s complete group to selection, or removes it if already wholly selected. | Does not open the picker. |
| Marquee select | Select tool, or temporary Select (`Cmd/Ctrl`), + drag from any cell | Selects all placements/groups within the rectangular drag area. `Shift` preserves the existing selection and adds the marquee result. | Does not place or edit stitches. |
| Clear selection | Click empty canvas with a selection; `Escape` | Clears selection without placing or erasing on the same click. The real Select tool remains selected. | `Cmd/Ctrl+Z` restores the last cleared selection before undoing document history. |
| Select by keyboard | `Tab` / `Shift+Tab` with a selection | Selects the next stitch in the same row, right / left, and opens its picker. | Pointer hover is suppressed until the pointer moves again. |
| Move selection | Drag within a current selection, from any tool | Moves selected stitches by the drag delta if destination cells are free. | Takes precedence over tool-specific draw/erase/insert after suggestion review. |
| Duplicate selection by drag | `Alt/Option` + drag within a current selection | Copies selected stitches at the drop location and selects the copies. | Alt is read live, so it can be pressed/released mid-drag. Invalid drops show blocked state. |
| Duplicate selection in-row | `Cmd/Ctrl+D` | Inserts a duplicate next to the selection according to row direction and selects the new stitches. | Does not depend on the pointer. |
| Copy selection | `Cmd/Ctrl+C` | Copies selected placements to the app clipboard. | Clipboard persists until a later Copy or Cut. |
| Cut selection | `Cmd/Ctrl+X` | Copies selected placements, erases them, then clears selection. | Clipboard persists after the cut. |
| Paste selection | `Cmd/Ctrl+V` while hovering a cell, or with exactly one selected placement | Places clipboard geometry with its top-left origin at the hovered cell; if no cell is hovered, uses the single selected placement as target. | Requires an app clipboard. It does not use insert/duplicate placement rules. |
| Create repeat | `Cmd/Ctrl+G` with a selection | Groups selected placements into a repeatable sequence. | A bare `G` arms/disarms Suggest instead. |
| Erase one or many stitches | Erase tool + click/drag; `Delete`/`Backspace` with a selection | Removes the stitch(es) under the stroke, or removes the full selection. | Erase tool’s drag is freehand; suggestions are handled by Alt review instead. |
| Insert a stitch | Insert tool + click valid gap | Inserts armed stitch at the gap and shifts the row; no armed stitch opens picker at the insertion point. | Click-only; invalid gaps and multi-cell splits do nothing. |
| Pan with pointer | Hold `Space` + drag; middle-button drag; two-finger scroll | Moves the camera. | While the contextual picker is open, Space-pan is blocked but middle-button and trackpad panning remain available; camera movement closes the picker. Space is ignored while typing into a form field. |
| Zoom with pointer | `Cmd/Ctrl` + wheel / pinch | Zooms at pointer position. | Still available when picker is open. |
| Zoom with keys | `Cmd/Ctrl` + `+` / `−`; `Cmd/Ctrl+0` | Zooms at viewport center; `0` resets to 100%. | Any camera move closes the contextual picker. |
| Edit reference-image geometry | Open reference-image panel, then drag image / image edge / corner | Moves or resizes visible reference image. `Shift` preserves aspect ratio when resizing. | Intended to win only for the image hit area. Pending suggestions on that area should yield to review actions. |
| Calibrate reference scale | Reference panel: Set reference / calibration mode, then drag a box | Scales image so the marked box represents one stitch. | Calibration drag owns the canvas while armed. |
| Mark reference stitches | Reference panel: marking mode, then click/drag on image | Adds or moves calibration marks; arrow keys nudge active mark or image (`Shift` = a cell). | Marking mode owns clicks on the image. |
| Undo / redo | `Cmd/Ctrl+Z`; `Shift+Cmd/Ctrl+Z` | Restores a cleared selection first, then document changes; redo reverses undo. | Selection clear has a one-level special case before document history. |

## Precedence rules (highest first)

1. Active pan (Space-drag or middle-drag) claims the pointer.
2. Reference calibration / marking modes claim their designated image gestures.
3. A `Cmd/Ctrl`-click on a pending suggestion with a real armed stitch is intended to override it with that stitch.
4. Picker-specific handling runs while a contextual picker is open.
5. `Cmd/Ctrl` temporary Select or the Select tool starts a selection/marquee gesture.
6. Dragging inside an existing selection moves it; `Alt/Option` duplicates.
7. Tool-specific Erase and Insert logic runs.
8. Draw selects an existing stitch; otherwise it opens the picker or paints the armed stitch.

## Conflicts and ambiguities to resolve

| ID | Conflict | Why it matters | Recommended resolution |
| --- | --- | --- | --- |
| C1 | **Cmd/Ctrl means both temporary Select and “confirm/override suggestion.”** | This is the currently reported issue. If selection starts first, the armed stitch cannot replace a suggested stitch. | **Implemented:** suggestion review is a top-level canvas rule. `Cmd/Ctrl` confirms/overrides pending suggestions—also an unreadable Suggest cell—before Select, selection movement, or reference-image manipulation. |
| C2 | Select tool formerly fell back to Draw when clicking empty space. | It made Select non-persistent and could unexpectedly place or open a picker. | **Implemented:** an empty click only clears selection; the real Select tool remains selected until the user chooses another tool. |
| C3 | `Shift` means additive selection, constrained drawing, gap fill, image aspect-ratio lock, and image/mark nudge size. | Its meaning depends on both active tool and whether a previous stroke exists, which is powerful but hard to discover. | (skip for now) Keep it, but show an in-canvas mode cue for whichever interpretation will apply before pointerdown. |
| C4 | Bare `G` toggled Suggest while `Cmd/Ctrl+G` creates a repeat. | It was technically distinguishable but easy to misread. | **Implemented:** `Q` now toggles Suggest; `Cmd/Ctrl+G` remains Create Repeat. Help and tooltip copy use `Q`. |
| C5 | `Cmd/Ctrl` also drives browser/OS commands and pinch-to-zoom wheel semantics. | A Cmd-click on macOS is generally safe for app-specific behavior, but Ctrl-click is commonly interpreted as a secondary click on macOS and `Ctrl`+wheel means browser zoom/pinch on many systems. The app must suppress native behavior on handled canvas gestures and never promise identical physical behavior across platforms. | (still don't understand this) Continue showing `⌘/Ctrl` in product copy, but verify Cmd-click on macOS and Ctrl-click on Windows/Linux manually. Keep Cmd/Ctrl+wheel exclusively for zoom; do not overload it with canvas actions. |
| C6 | `Tab` overrides ordinary focus navigation whenever the picker is open. | When the picker search is focused, Tab navigates chart stitches instead of moving focus. That is efficient for the canvas but differs from normal form behavior. | **Implemented:** arrow keys browse picker results. Tab/Shift+Tab is intercepted only from the picker search field (or the canvas); it remains normal focus navigation in reference calibration and all other fields. |
| C7 | Arrow keys move the reference image while it is being edited. | The expanded reference panel is the explicit edit state: it has a visible “Save changes” exit, image transform handles, and calibration tools. | **Implemented:** arrow nudging is scoped to that edit state; the canvas status line now says whether arrows nudge the image or the active reference mark. Closing the panel ends the edit state and returns arrows to normal behavior. |
| C8 | Panning was disabled whenever the contextual picker was open. | This protected text entry but made the picker a hard navigation lock. | **Implemented:** Space remains available to type in picker fields. Middle-button and trackpad pan work while picker is open; moving the camera closes it so it cannot detach from its target. |
| C9 | Paste formerly required a live hover rather than a selected target. | Keyboard-only users could not paste after keyboard selection suppressed hover. | **Implemented:** paste at hover when present; otherwise, paste at the single selected placement. Multiple/no selection still requires hover. |
| C10 | A click on a single selected stitch has dual intent: edit vs move. | Opening the picker immediately makes moving difficult; delaying it until pointerup distinguishes the two but can feel slightly slow. | **Implemented model:** first click selects and opens the picker. Press-drag the already-selected stitch (including while its picker is open) to move it. This makes edit the primary single-click action and preserves direct movement as the deliberate second gesture. |

## Micro-flows

These are the main user journeys composed from the interactions above. They are useful when changing a flow without accidentally changing an unrelated gesture.

| Micro-flow | Steps | Result | Conflict watch | Recommendation |
| --- | --- | --- | --- | --- |
| Start drawing | Choose a glossary stitch or press its quick number → click/drag empty cells | The stitch is armed and placed as individual stitches or a freehand stroke. | **C3:** Shift changes drawing into a constrained line or gap fill. | Keep Draw as the default. Surface the constrained-line cursor whenever Shift is held with a stitch armed. |
| Find and use a stitch | Click an empty cell with nothing armed → type in the picker → use arrows to choose a result → `Enter` or click it | The selected stitch is placed at the target and becomes armed for continued drawing. | **C6:** Tab behavior must remain scoped to picker search, not other form fields. **C8:** panning closes the picker. | Keep search keyboard-first: arrows select, Enter chooses, Esc closes. Reopen the picker at the new target after navigation rather than trying to preserve its old position. |
| Make a straight run | Arm a stitch → hold `Shift` before pressing the canvas → drag horizontally or vertically | Every cell on one straight row/column is filled with the armed stitch. | **C3:** Shift also has selection and reference-image meanings. | Keep the dominant-axis rule, but show a ghost line from pointerdown before the first cell is committed. |
| Fill a skipped stretch | Place a stitch → hold `Shift` → click another cell without dragging | The gap between the last placement and the clicked cell is filled. | **C3:** must remain distinct from a Shift-drag straight run. | Keep the current click-versus-drag split; add a short line preview on Shift hover to announce the fill anchor. |
| Edit one stitch | Click an existing stitch → picker opens → choose a replacement or delete | The stitch remains visibly selected while its picker provides replacement and delete actions. | **C10:** click is edit; movement requires the subsequent press-drag. | Preserve single-click edit. Ensure the selected outline remains visible under the picker so the affected stitch is unambiguous. |
| Move one stitch after editing | Click a stitch to select/open picker → press and drag the selected stitch | The picker gives way to a move gesture; release to drop the stitch if destination is free. | **C10:** preserve the press-drag distinction; **C8:** panning closes picker. | Keep the second-gesture move model and grab cursor. A blocked drop should never dismiss the selection or picker. |
| Select and transform several stitches | Choose Select / hold `Cmd/Ctrl` → click with `Shift` or marquee → drag selection; hold `Alt/Option` to duplicate | One or more groups are selected, moved, or copied as a unit. | **C1:** Cmd/Ctrl over a suggestion reviews it instead of selecting. **C3:** Shift is additive selection. **C5:** modifier behavior varies by platform. | Treat suggestion review as the only exception to temporary Select. Include a visible review cursor so the exception is apparent before clicking. |
| Copy and paste a motif | Select cells → `Cmd/Ctrl+C` or `X` → hover a target (or retain one selected target) → `Cmd/Ctrl+V` | The copied geometry is placed at the target and becomes the current selection. | **C9:** hover wins; selection is only the fallback target. **C5:** platform shortcut verification. | Keep hover as the primary destination. Add a paste-preview footprint before committing, especially for multi-cell motifs. |
| Duplicate or repeat a motif | Select cells → `Cmd/Ctrl+D` to duplicate in-row, or `Cmd/Ctrl+G` to create a repeat | A duplicate is inserted and selected, or the selection becomes a reusable repeat component. | **C4 resolved:** Suggest now uses `Q`, so it no longer overlaps with repeat. | Keep the shortcut separation. After either action, focus and visually pulse the newly created copy/repeat. |
| Insert within a row | Choose Insert → point at a valid gap → click; choose a stitch if none is armed | The row shifts around the new stitch; invalid gaps stay inert. | Selection movement can win if the gesture begins inside a current selection. | Keep Insert click-only and retain the blue insertion line. When a selection exists, require the user to click outside it or choose Insert explicitly before shifting a row. |
| Review reference suggestions | Arm Suggest with `Q` → paint reference cells → `Cmd/Ctrl`-click to accept/override, or `Alt/Option`-click to dismiss | Suggested stitches are reviewed one-by-one or in strokes; an armed real stitch replaces a suggestion rather than selecting it. | **C1:** review must stay ahead of Select and reference editing. **C3:** Shift can change the stroke into a line/gap fill. **C5:** Cmd/Ctrl needs platform verification. | Make review state highly visible: use distinct confirm/dismiss/override cursors and retain the armed stitch icon in override mode. |
| Align a reference image | Edit reference → drag image/handles or use arrows → use Set reference scale to box a stitch → add/label marks if needed → Save changes | The image is positioned and scaled to the chart; closing the panel ends reference editing. | **C3:** Shift locks aspect ratio / changes nudge size. **C7:** arrows belong only to explicit reference editing. | Keep this as an explicit, modal editing session with the status-bar ownership cue. Consider an undoable “Save changes” checkpoint later. |
| Navigate the chart | Space-drag, middle-drag, or trackpad scroll to pan → Cmd/Ctrl+wheel or `+`/`−` to zoom → `Cmd/Ctrl+0` to reset | The camera moves without altering stitches; camera movement closes any detached contextual picker. | **C5:** Cmd/Ctrl wheel is browser-sensitive. **C8:** camera movement intentionally dismisses picker. | Continue allowing trackpad/middle-pan during picker use; ensure browser zoom never occurs when the pointer is over the canvas. |
## Change checklist

For an interaction update, record:

1. Which table row changes.
2. Its intended precedence position.
3. The affected cursor/hover state.
4. Whether it alters the stroke, selection, clipboard, reference-image, or picker state.
5. A test covering the conflict it replaces.
