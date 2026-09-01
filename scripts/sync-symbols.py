#!/usr/bin/env python3
"""
Sync the stitch symbol library out of Figma into src/symbols/.

Source of truth is the Figma file; this script is the only way symbols enter
the app. Run it whenever the library changes:

    export FIGMA_TOKEN=...            # or put it in .env (gitignored)
    python3 scripts/sync-symbols.py

Outputs:
    src/symbols/assets/<slug>.svg     cleaned glyphs, for diffing by eye
    src/symbols/symbols.generated.ts  the registry the app imports

Two things it does beyond a plain export:

1. Strips the cell chrome. Every component draws its own 24x24 cell background
   and border, once per cell it spans. The renderer draws cell chrome itself,
   so those rects have to go or every cell is painted twice and the highlight
   states can't work. `knit` and `empty` are *only* chrome, so they correctly
   come out as empty glyphs.

2. Rewrites baked colours to currentColor, so a glyph can be recoloured for
   hover, selection and the current-row highlight without a second asset set.

It fails loudly rather than guessing: an unparseable name, a width that isn't a
whole number of cells, or a duplicate slug stops the run and prints what it
found. Silent guesswork in chart data is exactly the kind of error that is
invisible until a garment is knitted wrong.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

FILE_KEY = "GbPB2zQhf8S2qepHye9S2J"

# Frames holding the component sets, and the category bucket for anything in
# them that isn't classified more specifically below.
FRAMES = {
    "1:35": "basic",
    "1:146": "cable",
}

# World units per cell. Must match CELL in src/canvas/camera.ts.
CELL = 24

ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = ROOT / "src" / "symbols" / "assets"
OUT_TS = ROOT / "src" / "symbols" / "symbols.generated.ts"

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

CATEGORY = {
    "decrease": {
        "k2tog", "k2tog_alt", "ssk_alt", "skpo", "ssp", "p2tog", "p3tog",
        "central_double_decrease", "sk2po", "tk2tog", "tssk",
    },
    "increase": {"yarn_over", "m1", "m1l", "m1r", "m1lp", "m1rp"},
    "brioche": {"brk", "brp"},
    "special": {
        "empty", "marker", "repeated", "row_number", "pull_up_stitch",
        "ghost_purl",
    },
}

# Human labels for the picker. Anything absent falls back to a tidied slug.
LABELS = {
    "knit": "Knit",
    "purl": "Purl",
    "yarn_over": "Yarn over",
    "k2tog": "K2tog",
    "k2tog_alt": "K2tog (alt)",
    "skpo": "SKPO / SSK",
    "ssk_alt": "SSK (alt)",
    "repeated": "Repeat",
    "ghost_purl": "Ghost purl",
    "empty": "No stitch",
    "p2tog": "P2tog",
    "row_number": "Row number",
    "m1": "M1",
    "m1l": "M1L",
    "m1r": "M1R",
    "m1lp": "M1Lp",
    "m1rp": "M1Rp",
    "central_double_decrease": "Central double decrease",
    "ssp": "SSP",
    "marker": "Marker",
    "brk": "Brioche knit",
    "brp": "Brioche purl",
    "sk2po": "SK2PO",
    "ktbl": "KTBL",
    "ptbl": "PTBL",
    "tk2tog": "TK2TOG",
    "tssk": "TSSK",
    "p3tog": "P3tog",
    "p3": "K3/P3 (WS)",
    "pull_up_stitch": "Pull up stitch",
}


def die(msg: str, detail: list[str] | None = None) -> "NoReturn":  # type: ignore[valid-type]
    print(f"error: {msg}", file=sys.stderr)
    for line in detail or []:
        print(f"  {line}", file=sys.stderr)
    sys.exit(1)


# --------------------------------------------------------------------------
# token


def load_token() -> str:
    token = os.environ.get("FIGMA_TOKEN")
    if token:
        return token.strip()

    env = ROOT / ".env"
    if env.exists():
        for raw in env.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() == "FIGMA_TOKEN":
                return value.strip().strip('"').strip("'")

    die(
        "no Figma token found",
        [
            "Set one for this shell:  export FIGMA_TOKEN=...",
            f"or create {env} containing:  FIGMA_TOKEN=...",
            "(.env is gitignored; never commit or paste a token)",
        ],
    )


def figma_get(path: str, token: str) -> dict:
    req = urllib.request.Request(
        f"https://api.figma.com{path}", headers={"X-Figma-Token": token}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        if e.code in (401, 403):
            die(f"Figma rejected the token ({e.code}). Is it valid and does it have file read scope?", [body])
        die(f"Figma API {e.code} for {path}", [body])
    except urllib.error.URLError as e:
        die(f"could not reach the Figma API: {e.reason}")


# --------------------------------------------------------------------------
# names -> slugs


def snake(text: str) -> str:
    s = re.sub(r"[^0-9a-zA-Z]+", "_", text.strip().lower())
    return re.sub(r"_+", "_", s).strip("_")


def parse_name(name: str) -> tuple[str, dict[str, str]]:
    """
    'type=3_3 Cable, Orientation=Left, HR=true'
        -> ('3_3 Cable', {'orientation': 'left', 'hr': 'true'})
    """
    props: dict[str, str] = {}
    kind = None
    for part in name.split(","):
        key, sep, value = part.partition("=")
        if not sep:
            raise ValueError(f"no '=' in component name segment {part!r}")
        key, value = key.strip().lower(), value.strip()
        if key == "type":
            kind = value
        else:
            props[key] = value.lower()
    if not kind:
        raise ValueError("no 'type=' segment")
    return kind, props


def make_slug(kind: str, props: dict[str, str], bucket: str) -> str:
    base = snake(kind)
    if bucket == "cable":
        # Some are named '1_1 Purl' rather than '1_1 Purl cable'; normalise so
        # every cable slug reads the same way.
        if not base.endswith("cable"):
            base = f"{base}_cable"
        orientation = props.get("orientation")
        if orientation not in ("left", "right"):
            raise ValueError(f"cable is missing Orientation (got {props!r})")
        base = f"{base}_{orientation}"
        if props.get("hr") == "true":
            base = f"{base}_hr"
    return base


def categorise(slug: str, bucket: str) -> str:
    if bucket == "cable":
        return "cable"
    for name, members in CATEGORY.items():
        if slug in members:
            return name
    return "basic"


# --------------------------------------------------------------------------
# svg cleaning


def is_cell_chrome(el: ET.Element) -> bool:
    """A rect covering a whole cell is background or border, not a glyph."""
    if el.tag != f"{{{SVG_NS}}}rect":
        return False
    try:
        w = float(el.get("width", "0"))
        h = float(el.get("height", "0"))
    except ValueError:
        return False
    return w >= CELL - 1.5 and h >= CELL - 1.5


COLOUR_ATTRS = ("fill", "stroke")


def clean_svg(svg_text: str, slug: str) -> tuple[str, int]:
    try:
        root = ET.fromstring(svg_text)
    except ET.ParseError as e:
        die(f"{slug}: Figma returned SVG that would not parse ({e})")

    view_box = root.get("viewBox")
    if not view_box:
        die(f"{slug}: exported SVG has no viewBox")

    parts = view_box.split()
    if len(parts) != 4:
        die(f"{slug}: unexpected viewBox {view_box!r}")
    width = float(parts[2])

    if abs(width / CELL - round(width / CELL)) > 0.02:
        die(
            f"{slug}: width {width} is not a whole number of {CELL}px cells",
            ["A stitch must occupy a whole number of grid cells."],
        )
    span = int(round(width / CELL))

    # Drop cell chrome anywhere in the tree, and recolour what's left.
    for parent in root.iter():
        for child in list(parent):
            if is_cell_chrome(child):
                parent.remove(child)

    for el in root.iter():
        for attr in COLOUR_ATTRS:
            value = el.get(attr)
            if value and value != "none" and not value.startswith("url("):
                el.set(attr, "currentColor")

    # The app sizes the glyph itself; a fixed width/height would fight it.
    for attr in ("width", "height"):
        root.attrib.pop(attr, None)

    body = ET.tostring(root, encoding="unicode")
    body = body.replace(f' xmlns:ns0="{SVG_NS}"', "").replace("ns0:", "")
    return body, span


# --------------------------------------------------------------------------


def chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file-key", default=FILE_KEY)
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="list what was found and validate, without downloading or writing",
    )
    args = ap.parse_args()

    token = load_token()

    ids = ",".join(FRAMES)
    print(f"reading {args.file_key} frames {ids} ...", file=sys.stderr)
    doc = figma_get(f"/v1/files/{args.file_key}/nodes?ids={ids}", token)

    nodes = doc.get("nodes") or {}
    found: list[dict] = []
    problems: list[str] = []
    seen: dict[str, str] = {}

    for frame_id, bucket in FRAMES.items():
        entry = nodes.get(frame_id) or nodes.get(frame_id.replace(":", "-"))
        if not entry:
            die(f"frame {frame_id} not found in {args.file_key}")
        # Descriptions live in a sibling map keyed by node id, when set at all.
        descriptions = {
            k: (v or {}).get("description", "") for k, v in (entry.get("components") or {}).items()
        }

        for child in (entry.get("document") or {}).get("children") or []:
            if child.get("type") != "COMPONENT":
                continue
            name = child.get("name", "")
            node_id = child["id"]

            # An explicit description wins, so a symbol can be renamed in Figma
            # without breaking documents that already reference its slug.
            description = (descriptions.get(node_id) or "").strip()
            try:
                if description:
                    slug = snake(description)
                    kind, props = description, {}
                else:
                    kind, props = parse_name(name)
                    slug = make_slug(kind, props, bucket)
            except ValueError as e:
                problems.append(f"{node_id} {name!r}: {e}")
                continue

            box = child.get("absoluteBoundingBox") or {}
            width = box.get("width")
            if not width:
                problems.append(f"{node_id} {name!r}: no width")
                continue

            if slug in seen:
                problems.append(
                    f"{node_id} {name!r}: slug {slug!r} already used by {seen[slug]!r}"
                )
                continue
            seen[slug] = name

            found.append(
                {
                    "id": node_id,
                    "slug": slug,
                    "name": name,
                    "label": LABELS.get(slug) or kind.strip(),
                    "category": categorise(slug, bucket),
                    "reportedWidth": width,
                }
            )

    if problems:
        die(
            f"{len(problems)} component(s) could not be mapped",
            problems + ["", "Fix the names in Figma, or set each component's description."],
        )
    if not found:
        die("no components found - are the frame ids still right?")

    found.sort(key=lambda s: (s["category"], s["slug"]))
    print(f"found {len(found)} symbols", file=sys.stderr)

    if args.dry_run:
        for s in found:
            cells = s["reportedWidth"] / CELL
            print(f"  {s['slug']:<34} {s['category']:<9} ~{cells:g} cells  ({s['name']})")
        return

    # Export SVGs.
    urls: dict[str, str] = {}
    for batch in chunked([s["id"] for s in found], 40):
        query = ",".join(batch)
        res = figma_get(
            f"/v1/images/{args.file_key}?ids={query}&format=svg&svg_outline_text=false",
            token,
        )
        if res.get("err"):
            die(f"Figma image export failed: {res['err']}")
        urls.update({k: v for k, v in (res.get("images") or {}).items() if v})

    missing = [s["slug"] for s in found if s["id"] not in urls]
    if missing:
        die("Figma returned no SVG for some components", missing)

    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    for existing in ASSET_DIR.glob("*.svg"):
        existing.unlink()

    for i, s in enumerate(found, 1):
        with urllib.request.urlopen(urls[s["id"]], timeout=60) as resp:
            raw = resp.read().decode("utf-8")
        glyph, span = clean_svg(raw, s["slug"])

        expected = int(round(s["reportedWidth"] / CELL))
        if span != expected:
            die(
                f"{s['slug']}: canvas width says {expected} cells but the SVG viewBox says {span}"
            )

        s["span"] = span
        s["glyph"] = glyph
        (ASSET_DIR / f"{s['slug']}.svg").write_text(glyph + "\n")
        print(f"  [{i}/{len(found)}] {s['slug']} ({span} cell{'s' if span != 1 else ''})",
              file=sys.stderr)

    lines = [
        "// GENERATED BY scripts/sync-symbols.py - DO NOT EDIT BY HAND.",
        f"// Source: Figma file {args.file_key}",
        "",
        'import type { StitchSymbol } from "./types";',
        "",
        "export const SYMBOLS: StitchSymbol[] = [",
    ]
    for s in found:
        lines += [
            "  {",
            f'    id: {json.dumps(s["slug"])},',
            f'    label: {json.dumps(s["label"])},',
            f'    category: {json.dumps(s["category"])},',
            f'    span: {s["span"]},',
            f'    figmaNodeId: {json.dumps(s["id"])},',
            f'    glyph: {json.dumps(s["glyph"])},',
            "  },",
        ]
    lines += ["];", ""]
    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    OUT_TS.write_text("\n".join(lines))

    spans = sorted({s["span"] for s in found})
    print(
        f"wrote {OUT_TS.relative_to(ROOT)} ({len(found)} symbols, spans {spans})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
