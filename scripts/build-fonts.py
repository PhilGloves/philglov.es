#!/usr/bin/env python3
"""
Rebuilds the two self-hosted fonts in public/_assets/fonts/ from their source.
Run by hand, only when the fonts change (the output is committed):

    python -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools==4.68.0 brotli
    .venv-fonts/bin/python scripts/build-fonts.py [--cache DIR] [--system-fonts DIR]

Source: github.com/google/fonts at the commit pinned below (never `main`), each
file checked against a SHA-256, so the same inputs always give the same fonts.
Nothing here runs in CI or at build time, and no font is fetched by a visitor's
browser from anywhere but philglov.es.

One family, Crimson Pro (SIL OFL 1.1), two files:
  crimson-pro.woff2         upright, variable weight 300-600
  crimson-pro-italic.woff2  italic, variable weight 300-400

Steps (see docs/decisions/0015):
  1. instancer: narrow the weight axis to what the design uses
  2. subsetter: Latin (English and Italian: à è é ì ò ù, curly quotes, dashes,
     the middle dot, the euro sign, Latin Extended-A), only the layout features
     in use (kerning, ligatures, tabular figures), no hinting
  3. save as WOFF2
Crimson Pro declares no Reserved Font Name (checked in OFL.txt and in the
font's own name table, nameID 0), so the family name stays "Crimson Pro". Had
it reserved one, the subsets would have to be renamed, as Source Serif 4 was in
decision 0014. The copyright (nameID 0), trademark (7) and licence (13, 14)
strings are kept as they were.
Crimson Pro has no arrow glyphs: interface arrows are an inline SVG
(src/components/Arrow.astro).
Then it prints the sizes and the metric-matched fallback values for site.css.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

COMMIT = "c30b221beb0c1da59d563feb91ec8656a1fa972a"  # google/fonts, 2026-11-11
RAW = f"https://raw.githubusercontent.com/google/fonts/{COMMIT}/ofl"

# source file -> (path in google/fonts, sha256)
SOURCES = {
    "CrimsonPro.ttf": ("crimsonpro/CrimsonPro[wght].ttf", "16aa9fb7300a93637da51fac03a071b2ff08b6bbf65f99c794c25f040b58af6a"),
    "CrimsonPro-Italic.ttf": ("crimsonpro/CrimsonPro-Italic[wght].ttf", "a74dc11dcf2fbb1452064e42395a40a907ca630b49cff86012223785e52b2559"),
    "crimsonpro-OFL.txt": ("crimsonpro/OFL.txt", "1820869bd5baa1c2d88fa87c89eea532cf9442d841008acab720654b7f82823d"),
}

# Latin + Latin Extended-A (covers à è é ì ò ù and more), the punctuation the
# design uses (dashes, quotes, ellipsis, thin spaces, middle dot, ×), minus, euro, ™.
UNICODES = "U+0020-007E,U+00A0-017F,U+02C6,U+02DC,U+2009,U+200A,U+202F,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2212"

# kerning, ligatures (fi fl), composed characters, language forms, tabular figures
FEATURES = ["kern", "liga", "ccmp", "locl", "tnum"]

# name IDs kept: copyright, family, subfamily, unique id, full, version, PostScript,
# trademark, licence, licence URL, typographic family/subfamily, variations prefix
KEEP_NAMES = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 16, 17, 25]

# output name -> (source, axis limits)
FONTS = {
    "crimson-pro.woff2": ("CrimsonPro.ttf", {"wght": (300, 600)}),
    "crimson-pro-italic.woff2": ("CrimsonPro-Italic.ttf", {"wght": (300, 400)}),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    for name, (remote, digest) in SOURCES.items():
        target = cache / name
        if not target.exists():
            url = f"{RAW}/{urllib.parse.quote(remote, safe='/')}"
            print(f"download {url}")
            urllib.request.urlretrieve(url, target)
        if sha256(target) != digest:
            sys.exit(f"{name}: SHA-256 mismatch (expected {digest}); delete it and retry")


def build(name: str, cache: Path, out: Path) -> Path:
    source, axes = FONTS[name]
    font = instancer.instantiateVariableFont(TTFont(cache / source), axes, inplace=False)
    # round-trip through bytes so the subsetter sees plain, fully loaded tables
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)
    opts = subset.Options()
    opts.layout_features = FEATURES
    opts.hinting = False
    opts.name_IDs = KEEP_NAMES
    opts.name_legacy = False
    opts.glyph_names = False
    opts.notdef_outline = True
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    font.flavor = "woff2"
    target = out / name
    font.save(target)
    return target


# English letter frequencies (per mille) plus the space, for a weighted average advance
FREQ = dict(zip("etaoinshrdlcumwfgypbvkjxqz", [127, 91, 82, 75, 70, 67, 63, 61, 60, 43, 40, 28, 28, 24, 24, 22, 20, 20, 19, 15, 10, 8, 2, 2, 1, 1]))
FREQ[" "] = 180


def average_width(font: TTFont) -> float:
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    upm = font["head"].unitsPerEm
    total = sum(FREQ.values())
    return sum(hmtx[cmap[ord(c)]][0] * w for c, w in FREQ.items() if ord(c) in cmap) / total / upm


def metrics(web: Path, system: Path, weight: int) -> None:
    if not system.exists():
        print(f"  (no {system.name}: not measured)")
        return
    f = instancer.instantiateVariableFont(TTFont(web), {"wght": weight}, inplace=False) if "fvar" in TTFont(web) else TTFont(web)
    upm = f["head"].unitsPerEm
    asc, desc, gap = f["hhea"].ascent / upm, -f["hhea"].descent / upm, f["hhea"].lineGap / upm
    adjust = average_width(f) / average_width(TTFont(system))
    print(
        f"  {web.name} wght {weight} vs {system.name}: size-adjust {adjust * 100:.1f}% ascent-override {asc / adjust * 100:.1f}% "
        f"descent-override {desc / adjust * 100:.1f}% line-gap-override {gap / adjust * 100:.1f}%"
    )


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=root / ".fonts-cache", help="where the source fonts are kept (not committed)")
    ap.add_argument("--system-fonts", type=Path, default=Path("C:/Windows/Fonts"), help="folder with pala.ttf, georgia.ttf")
    args = ap.parse_args()
    out = root / "public" / "_assets" / "fonts"
    out.mkdir(parents=True, exist_ok=True)
    fetch(args.cache)
    total = 0
    for name in FONTS:
        path = build(name, args.cache, out)
        size = path.stat().st_size
        total += size
        print(f"{name}: {size:,} bytes")
    print(f"total: {total:,} bytes ({total / 1024:.1f} KiB), budget 80 KiB")
    (out / "crimson-pro-OFL.txt").write_bytes((args.cache / "crimsonpro-OFL.txt").read_bytes())
    print("fallback metrics (paste into site.css), from the upright at weight 400:")
    sf = args.system_fonts
    metrics(args.cache / "CrimsonPro.ttf", sf / "pala.ttf", 400)
    metrics(args.cache / "CrimsonPro.ttf", sf / "georgia.ttf", 400)


if __name__ == "__main__":
    main()
