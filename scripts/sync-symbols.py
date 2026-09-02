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

# Abbreviations the Figma description can't capture with the right casing.
# Anything not listed here takes its label from the component's description,
# which is where the prose ones live ("knit through back loop").
LABELS = {
    "knit": "Knit",
    "purl": "Purl",
    "yarn_over": "Yarn over",
    "k2tog": "K2tog",
    "k2tog_alt": "K2tog (alt)",
    "skpo": "SKPO / SSK",
    "ssk_alt": "SSK / SKPO (alt)",
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
    "brk": "Brioche knit",
    "brp": "Brioche purl",
    "sk2po": "SK2PO",
    "pull_up_stitch": "Pull up stitch",
}

# Symbols in the library that aren't placeable stitches.
EXCLUDE = {
    "marker": "a 3px gutter line between columns, not a cell-aligned stitch",
}


def die(msg: str, detail: list[str] | None = None) -> "NoReturn":  # type: ignore[valid-type]
    print(f"error: {msg}", file=sys.stderr)
    for line in detail or []:
        print(f"  {line}", file=sys.stderr)
    sys.exit(1)


# --------------------------------------------------------------------------
# token


def load_token() -> str:
    env = ROOT / ".env"
    hint = [
        "Set one for this shell:  export FIGMA_TOKEN=...",
        f"or put FIGMA_TOKEN=... in {env}",
        "(.env is gitignored; never commit or paste a token)",
    ]

    token = (os.environ.get("FIGMA_TOKEN") or "").strip()
    if token:
        return token

    if env.exists():
        for raw in env.read_text().splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            if key.strip() != "FIGMA_TOKEN":
                continue
            value = value.strip().strip('"').strip("'")
            # An empty value is its own failure: sending it to Figma just
            # returns a 403 that looks like a bad token rather than a missing one.
            if not value:
                die(f"{env} has FIGMA_TOKEN set to an empty value", hint)
            return value

    die("no Figma token found", hint)


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


def cable_parts(kind: str, props: dict[str, str]) -> tuple[str, str, str, bool, bool]:
    """('2_1 Purl cable', {...}) -> ('2', '1', 'left', purl=True, hr=False)"""
    m = re.match(r"\s*(\d+)_(\d+)\b", kind)
    if not m:
        raise ValueError(f"cable name has no leading 'a_b' counts: {kind!r}")
    orientation = props.get("orientation")
    if orientation not in ("left", "right"):
        raise ValueError(f"cable is missing Orientation=Left|Right (got {props!r})")
    return m.group(1), m.group(2), orientation, "purl" in kind.lower(), props.get("hr") == "true"


def make_slug(kind: str, props: dict[str, str], bucket: str) -> str:
    """
    Identity comes from the component NAME, which is structured and unique
    across the library. Descriptions are prose ('knit through back loop') and
    sometimes shared between two components, so they can't be identifiers.

    Cable slugs are assembled to match the convention already used in the
    library's own descriptions: 2_1_right_purl_cable_hr.
    """
    if bucket != "cable":
        return snake(kind)

    a, b, orientation, purl, hr = cable_parts(kind, props)
    parts = [f"{a}_{b}", orientation]
    if purl:
        parts.append("purl")
    parts.append("cable")
    if hr:
        parts.append("hr")
    return "_".join(parts)


def make_label(slug: str, kind: str, props: dict[str, str], bucket: str, description: str) -> str:
    if bucket == "cable":
        a, b, orientation, purl, hr = cable_parts(kind, props)
        return f"{a}/{b} {'purl ' if purl else ''}cable, {orientation}{' (HR)' if hr else ''}"
    if slug in LABELS:
        return LABELS[slug]
    # Descriptions carry the readable meaning, and a couple list two names on
    # separate lines ('ssk\nskpo').
    if description:
        text = " / ".join(part.strip() for part in description.splitlines() if part.strip())
        return text[:1].upper() + text[1:]
    return kind.strip()


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

# Rects inside these define geometry (a clip region, a mask) rather than paint.
# Stripping one leaves an empty clipPath, which clips away everything that
# references it - that silently blanks every cable.
GEOMETRY_SUBTREES = {
    f"{{{SVG_NS}}}defs",
    f"{{{SVG_NS}}}clipPath",
    f"{{{SVG_NS}}}mask",
    f"{{{SVG_NS}}}pattern",
}


def _walk_painted(parent: ET.Element, visit) -> None:
    """Depth-first over `parent`'s descendants, not descending into
    GEOMETRY_SUBTREES.

    `visit(parent, child)` is called for each non-geometry child; return True
    to stop recursing into that child (e.g. because it was just removed).
    Shared by strip_cell_chrome (mutates) and cell_fills (reads), so a future
    change to what counts as geometry only has to be made here once - the bug
    this fixed was exactly that: cell_fills had its own, subtly different
    copy of this skip logic that had fallen out of sync.
    """
    for child in list(parent):
        if child.tag in GEOMETRY_SUBTREES:
            continue
        if visit(parent, child):
            continue
        _walk_painted(child, visit)


def strip_cell_chrome(root: ET.Element) -> int:
    removed = 0

    def visit(parent: ET.Element, child: ET.Element) -> bool:
        nonlocal removed
        if not is_cell_chrome(child):
            return False
        parent.remove(child)
        removed += 1
        return True

    _walk_painted(root, visit)
    return removed


def to_rgba(fill: str | None, opacity: str | None) -> str | None:
    """'#191B1F' + '0.1' -> 'rgba(25, 27, 31, 0.1)'."""
    if not fill or fill == "none" or fill.startswith("url("):
        return None
    if not fill.startswith("#"):
        return fill
    h = fill.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        return None
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    try:
        a = float(opacity) if opacity is not None else 1.0
    except ValueError:
        a = 1.0
    return f"rgba({r}, {g}, {b}, {a:g})"


def cell_fills(root: ET.Element, span: int) -> list[str | None]:
    """
    The background colour of each cell, read before the chrome is stripped.

    The fill is not decoration: 'empty' (no stitch) is distinguished from
    'knit' purely by a grey tint, so discarding it would make the two
    indistinguishable on the canvas. A rect inside a clipPath/mask/defs
    defines geometry, not paint, so its 'fill' isn't a real cell background
    (Figma's clipPath rects are commonly fill="currentColor") - that's what
    _walk_painted's GEOMETRY_SUBTREES skip is for.
    """
    fills: list[str | None] = [None] * span

    def visit(_parent: ET.Element, child: ET.Element) -> bool:
        if not is_cell_chrome(child):
            return False
        fill = child.get("fill")
        if not fill or fill == "none":
            return False  # the border rect carries stroke only
        try:
            index = int(round(float(child.get("x", "0")) / CELL))
        except ValueError:
            return False
        if 0 <= index < span and fills[index] is None:
            fills[index] = to_rgba(fill, child.get("fill-opacity"))
        return False

    _walk_painted(root, visit)
    return fills


def clean_svg(svg_text: str, slug: str) -> tuple[str, int, list[str | None]]:
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

    # Read the cell backgrounds before discarding them, then drop the chrome
    # anywhere in the painted tree and recolour what's left.
    fills = cell_fills(root, span)
    strip_cell_chrome(root)

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
    return body, span, fills


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
    skipped: list[str] = []
    divergent: list[str] = []
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
            description = (descriptions.get(node_id) or "").strip()

            try:
                kind, props = parse_name(name)
                slug = make_slug(kind, props, bucket)
                label = make_label(slug, kind, props, bucket, description)
            except ValueError as e:
                problems.append(f"{node_id} {name!r}: {e}")
                continue

            if slug in EXCLUDE:
                skipped.append(f"{slug}: {EXCLUDE[slug]}")
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

            # Where a description also reads like a slug, it should agree with
            # the name. A mismatch is legitimate (k2tog alt is *described* as
            # k2tog) but worth surfacing so drift doesn't go unnoticed.
            if re.fullmatch(r"[a-z0-9_]+", description) and description != slug:
                divergent.append(f"{slug:<26} description says {description!r}")

            found.append(
                {
                    "id": node_id,
                    "slug": slug,
                    "name": name,
                    "label": label,
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

    for line in skipped:
        print(f"  skipped {line}", file=sys.stderr)
    if divergent:
        print("  name/description differ (not an error):", file=sys.stderr)
        for line in divergent:
            print(f"    {line}", file=sys.stderr)

    if args.dry_run:
        for s in found:
            cells = s["reportedWidth"] / CELL
            print(
                f"  {s['slug']:<26} {s['category']:<9} {cells:>4g} cells  {s['label']}"
            )
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
        glyph, span, fills = clean_svg(raw, s["slug"])

        expected = int(round(s["reportedWidth"] / CELL))
        if span != expected:
            die(
                f"{s['slug']}: canvas width says {expected} cells but the SVG viewBox says {span}"
            )

        s["span"] = span
        s["glyph"] = glyph
        s["cellFills"] = fills
        # knit/empty are pure cell chrome with nothing left to paint once
        # stripped; recorded explicitly so callers don't have to re-derive it
        # by sniffing the glyph markup themselves.
        s["hasGlyph"] = "<path" in glyph or "<rect" in glyph
        (ASSET_DIR / f"{s['slug']}.svg").write_text(glyph + "\n")
        print(f"  [{i}/{len(found)}] {s['slug']} ({span} cell{'s' if span != 1 else ''})",
              file=sys.stderr)

    # The library's most common cell background is the ordinary one; the app
    # theme owns that. Anything else is carrying meaning - the grey on 'empty'
    # is what distinguishes no-stitch from knit - so it is kept explicitly.
    counts: dict[str, int] = {}
    for s in found:
        for fill in s["cellFills"]:
            if fill:
                counts[fill] = counts.get(fill, 0) + 1
    neutral = max(counts, key=lambda k: counts[k]) if counts else None
    print(f"neutral cell fill: {neutral}", file=sys.stderr)

    for s in found:
        s["cellFills"] = [None if f == neutral else f for f in s["cellFills"]]

    tinted = [s["slug"] for s in found if any(s["cellFills"])]
    print(
        f"symbols with a meaningful cell tint: {', '.join(tinted) or 'none'}",
        file=sys.stderr,
    )

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
            f'    hasGlyph: {json.dumps(s["hasGlyph"])},',
        ]
        if any(s["cellFills"]):
            lines.append(f'    cellFills: {json.dumps(s["cellFills"])},')
        lines += [
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
