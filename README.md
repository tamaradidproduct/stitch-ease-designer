# Stitch Ease Designer

A desktop web app for knitting designers. The core of it is a chart editor:
an infinite canvas that is itself a grid of square cells, where each cell can
hold a stitch and some stitches span several cells. Click any cell to place a
stitch from the [Figma symbol library](https://www.figma.com/design/GbPB2zQhf8S2qepHye9S2J/StitchEase-designer-library).

v1 is the working drawing interface only — no chart frames, RS/WS handling,
repeat boxes, stitch counts, or project management yet. See
`.claude/plans/` for the original design plan.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test            # vitest
npm run typecheck
```

Refreshing the stitch symbol library from Figma needs a personal access
token:

```bash
export FIGMA_TOKEN=figd_...      # or put it in .env (gitignored)
python3 scripts/sync-symbols.py
```

The generated output (`src/symbols/symbols.generated.ts` and
`src/symbols/assets/*.svg`) is committed, so the app builds and runs without
a token — the script is only for pulling in library changes.

## Terminology

Terms used consistently across the code and this doc.

### Canvas & grid

| Term | Meaning |
|---|---|
| **Cell** | One square in the grid, addressed by `(col, row)`. `+row` points up — row 0 is the bottom, matching how a knitting chart is read. |
| **Chrome** | The plain background + border drawn around every cell, independent of whatever glyph is inside it. |
| **Span** | How many cells wide a stitch is. Most are 1; cables run 2–12. |
| **Camera** | The pan/zoom state (`x`, `y`, `zoom`) that maps world coordinates to screen pixels (`src/canvas/camera.ts`). |
| **World / screen / cell space** | The three coordinate systems the app converts between — see the doc comment at the top of `camera.ts`. |

### Symbols & stitches

| Term | Meaning |
|---|---|
| **Symbol** | A stitch *type* from the Figma library (e.g. `k2tog`, `3_3_left_cable`) — the definition, not a placed instance. |
| **Glyph** | The inline SVG artwork for a symbol, with no cell chrome baked in (the renderer draws that separately). |
| **Placement** | One instance of a symbol actually sitting on the grid at a specific `(col, row)`. |
| **Slug** | The machine-readable id for a symbol (`k2tog`, `2_2_left_cable_hr`), derived from the Figma component name — see `scripts/sync-symbols.py`. |

### Tools & interaction state

| Term | Meaning |
|---|---|
| **Armed** | A symbol is "armed" when it's loaded into the cursor, ready to place on click (`uiStore.armedSymbolId`). |
| **Tool** | Either `stitch` (place/paint) or `eraser`. |
| **Stroke** | One continuous drag-paint gesture, coalesced into a single undo entry. |
| **Hover** | The cell currently under the cursor. |

### Hover states

The cursor shows one of three distinct visuals, depending on what's armed and what's already there:

| State | When it shows | What it looks like |
|---|---|---|
| **Add state** | Empty cell, nothing armed | Dashed border + small "+" badge in the corner |
| **Armed preview** | Empty cell, a symbol armed | A translucent rendition of the real stitch — its actual chrome and glyph, faded, inside a dashed outline |
| **Edit highlight** | Occupied cell, nothing armed | Solid highlight box over the existing stitch — clicking opens the picker to replace it |

Dashed = not committed yet (add state, armed preview). Solid = something real
is there (a placed stitch, or the edit highlight sitting on top of one).

### The picker

| Term | Meaning |
|---|---|
| **Picker** | The popover for choosing a stitch. |
| **Target** | Which cell the picker is anchored to, plus its screen position (`PickerTarget`). |
| **Current symbol** | The stitch already occupying the target cell, if editing rather than adding. |
| **Recents** | The row of recently-armed symbols, shown in both the picker and the toolbar. |
| **Active** | Which item in the picker list is keyboard-highlighted right now. |

## Architecture

- **`src/canvas/`** — the camera, grid, renderer, and sprite cache. A single
  `<canvas>`, redrawn on a dirty flag rather than every React render.
- **`src/model/`** — the sparse placement map plus two derived indexes
  (cell occupancy and viewport-culling chunks). All mutation goes through
  `ops.ts`, which returns an inverse for undo.
- **`src/state/`** — Zustand stores: `docStore` (placements + history),
  `uiStore` (camera, tool, picker).
- **`src/symbols/`** — the generated symbol registry and lookup helpers.
- **`src/ui/`** — React chrome: toolbar, picker, status bar.
- **`scripts/sync-symbols.py`** — pulls the symbol library from Figma.

The one invariant worth knowing before touching `model/`: a stitch is
indivisible. Placing over any cell of a multi-cell stitch removes the whole
thing, never leaves orphaned cells. Covered by `src/model/ops.test.ts`.
