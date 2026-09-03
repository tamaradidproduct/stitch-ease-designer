# Stitch Ease Designer

A desktop web app for knitting designers. The core of it is a chart editor:
an infinite canvas that is itself a grid of square cells, where each cell can
hold a stitch and some stitches span several cells. Click any cell to place a
stitch from the [Figma symbol library](https://www.figma.com/design/GbPB2zQhf8S2qepHye9S2J/StitchEase-designer-library).

v1 is the working drawing interface only — no chart frames, RS/WS handling,
repeat boxes, stitch counts, or project management yet. See
`.claude/plans/` for the original design plan.

**Live at <https://tamaradidproduct.github.io/stitch-ease-designer/>**

### Signing in

Invite-only while this is in testing — public signup is disabled at the
Supabase project level. Ask for an invite (Authentication → Users → Invite in
the Supabase dashboard) if you don't have one; requesting a sign-in link for
an uninvited email is rejected with a clear message rather than a silent
no-op.

Charts saved in this browser from before accounts existed aren't lost: the
first sign-in on a browser that has any offers to copy them into the account,
one time, only removing each from browser storage once it's confirmed written
to the account. Declining is safe — they just stay in browser storage, and
you're asked again next sign-in rather than the app quietly assuming you meant
to abandon them.

## Running it

Needs a Supabase project to sign in against — either your own (see
**Database**, further down) or the shared dev one; ask for its `.env` values
if you don't have them.

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                # http://localhost:5173
npm test                    # vitest
npm run typecheck
```

Both values are meant to be public — they ship in the built bundle
regardless of where they come from, and row-level security is what actually
protects the data, not secrecy of this key. The deploy workflow reads the
same two names from repo variables (Settings → Secrets and variables →
Actions → Variables), not repo secrets, for the same reason.

Set `VITE_DEV_SKIP_AUTH=true` in `.env` to skip the magic-link round trip
entirely while developing — charts save to browser storage instead of an
account, and there's no sign-out button since there's no session to end. Only
takes effect for `vite dev`; `vite build` hardcodes the flag to `false`, so
this state can never be produced in a deployed build regardless of what's in
`.env` (verified by grepping the built output for the flag and its UI string
— both are absent).

To check what actually deploys, build and preview it at the real base path:

```bash
npm run build
npm run preview    # http://localhost:4173/stitch-ease-designer/
```

Preview deliberately serves from `/stitch-ease-designer/`, the same prefix
GitHub Pages uses. Serving the build at the root instead makes every asset
miss and fall through to `index.html`, which the browser then refuses to
execute as a module — a failure that looks like a blank page with 200s in the
network tab, so it's worth catching here rather than after a deploy.

Refreshing the stitch symbol library from Figma needs a personal access
token:

```bash
export FIGMA_TOKEN=figd_...      # or put it in .env (gitignored)
python3 scripts/sync-symbols.py
```

The generated output (`src/symbols/symbols.generated.ts` and
`src/symbols/assets/*.svg`) is committed, so the app builds and runs without
a token — the script is only for pulling in library changes.

`FIGMA_TOKEN` is a local dev tool only. It must never gain a `VITE_` prefix
or reach the deploy workflow: this repo is public and the build output ships
to anyone who opens the site.

## Deploying

Every push to `main` builds and publishes to GitHub Pages via
`.github/workflows/deploy.yml`. The deploy is gated on typecheck and the test
suite — this is what the group uses, and a broken build reaching them is worse
than a late one.

Pages is configured with **Build type: GitHub Actions** (not the legacy
branch mode, which would publish the raw repository instead of `dist/`).

## Database

Supabase project `stitch-ease-designer` (ref `pfoxdauroxzkwrcmgoym`), **not**
the org's other Supabase project (`stitch-ease-app`, the unrelated live
row-tracker app) — a separate project specifically so that turning off public
signup here can't change sign-in behaviour there, since that setting is
project-wide rather than per-app.

One table, `public.charts` — id, owning `user_id` (defaults to `auth.uid()`,
never client-supplied), `name`, `data` (the `StoredChart` JSON from
`src/storage/serialize.ts`), `rev` (opaque token, regenerated server-side on
every update, for optimistic-concurrency conflict detection — deliberately
not `updated_at`, since two updates inside the same millisecond would compare
equal as timestamps and let a stale write through), `created_at`,
`updated_at`. Row-level security scopes every select/update/delete to
`auth.uid() = user_id`; a `before update` trigger pins `rev`/`updated_at`/
`user_id`/`created_at` against whatever a client update payload includes, so
ownership can't be transferred and the conflict token can't be forged.

**RLS is the only thing protecting one designer's charts from another's** —
this is a public URL serving a public bundle. Verify with two real accounts
after any policy change, not by reading the SQL.

One private Storage bucket, `reference-images` — the pattern screenshot a
designer places behind a chart to trace against (`src/storage/referenceImages.ts`).
One object per chart, at `{auth.uid()}/{chartId}/reference.<ext>` (PNG/JPG/WebP,
10 MB cap, both enforced by the bucket itself); storage policies scope every
select/insert/update/delete to the path's own `{auth.uid()}` segment, the same
ownership pattern as the `charts` table. The bucket is private — the app never
stores or hands out a bare URL, only the object path, resolved to a short-lived
signed URL at render time. Not signed in (`VITE_DEV_SKIP_AUTH`): there's no
account to own a Storage path, so the image is inlined as a `data:` URL in the
chart's own stored JSON instead — `ReferenceImage.ref` being a `data:` URL vs.
a bucket path is how the app (and this bucket) tell the two cases apart.

Inviting someone: Supabase dashboard → Authentication → Users → Invite user.
Public signup is off, so this is the only way an account gets created.

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
- **`src/state/`** — Zustand stores: `docStore` (placements + history + the
  open chart's save status), `uiStore` (camera, tool, picker).
- **`src/storage/`** — the `DocStore` interface and three implementations
  behind it (in-memory for tests, browser storage, Supabase), all held to one
  shared contract suite (`docStore.contract.ts`) so swapping the backend is a
  mechanical change. `serialize.ts` owns the compact stored format; a
  `Placement`'s id is never persisted, since it only keys the occupancy map
  and undo stack at runtime and is minted fresh on load.
- **`src/auth/`**, **`src/supabase/`** — the session hook and the one
  Supabase client instance (PKCE flow — required because the implicit flow's
  fragment-based redirect collides with `HashRouter`'s own use of the URL
  fragment for routing).
- **`src/symbols/`** — the generated symbol registry and lookup helpers.
- **`src/ui/`** — React chrome: toolbar, picker, status bar, chart list,
  sign-in, the local-to-account migration screen.
- **`scripts/sync-symbols.py`** — pulls the symbol library from Figma.

The one invariant worth knowing before touching `model/`: a stitch is
indivisible. Placing over any cell of a multi-cell stitch removes the whole
thing, never leaves orphaned cells. Covered by `src/model/ops.test.ts`.
