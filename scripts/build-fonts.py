#!/usr/bin/env python3
"""
Rebuilds the four self-hosted fonts in public/_assets/fonts/ from their sources.
Run by hand, only when the fonts change (the output is committed):

    python -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools==4.68.0 brotli
    .venv-fonts/bin/python scripts/build-fonts.py [--cache DIR] [--system-fonts DIR]

Sources: github.com/google/fonts at the commit pinned below (never `main`),
each file checked against a SHA-256, so the same inputs always give the same
fonts. Nothing here runs in CI or at build time, and no font is fetched by a
visitor's browser from anywhere but philglov.es.

What it does to each font (the exact steps; see docs/decisions/0013):
  1. instancer: pin or narrow the variable axes (Archivo width, Source Serif
     optical size pinned; weights narrowed to what the design uses)
  2. subsetter: Latin + Latin Extended-A + the punctuation and arrows the
     design uses, only the layout features in use, no hinting
  3. rename (Source Serif 4 only): the font's own copyright line reserves the
     font name "Source", so the modified files are named "PG Serif" inside the
     file. The copyright (nameID 0), trademark (7) and licence (13, 14) strings
     are left exactly as they were.
  4. save as WOFF2
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
    "Archivo.ttf": ("archivo/Archivo[wdth,wght].ttf", "0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053"),
    "SourceSerif4.ttf": ("sourceserif4/SourceSerif4[opsz,wght].ttf", "97b2d4da6e3cb494b5a1e66ae176914d852ccabef49e0c02c0df25f3e39aca0b"),
    "SourceSerif4-Italic.ttf": ("sourceserif4/SourceSerif4-Italic[opsz,wght].ttf", "15fbc7e4679489a501998c3669272637a6646388ef7e4bd77eebb5bf967a1f42"),
    "JetBrainsMono.ttf": ("jetbrainsmono/JetBrainsMono[wght].ttf", "48715a42ec242c21e9f02692891e147d022299a52e48d5e413e1a942193ffeda"),
    "archivo-OFL.txt": ("archivo/OFL.txt", "108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b"),
    "sourceserif4-OFL.txt": ("sourceserif4/OFL.txt", "5f94c3fd3a23131a417ab5a0c8452de57e70c3cfb9f604d88241f7065ebf9fd9"),
    "jetbrainsmono-OFL.txt": ("jetbrainsmono/OFL.txt", "b2fe5e8987594e9ffd1d2ca52a2f5d73eb8335243893c5d6254b5ad69269591d"),
}

# Latin + Latin Extended-A (covers à è é ì ò ù and more), the punctuation the
# design uses (dashes, quotes, ellipsis, thin spaces), arrows ← ↑ → ↓, minus, euro, ™.
UNICODES = "U+0020-007E,U+00A0-017F,U+02C6,U+02DC,U+2009,U+200A,U+202F,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2032-2033,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212"

TEXT_FEATURES = ["kern", "liga", "ccmp", "locl", "tnum"]
SANS_FEATURES = ["kern", "ccmp", "locl", "tnum"]
MONO_FEATURES = ["ccmp", "locl"]

# ARCHIVO'S WIDTH AXIS IS WHAT DECIDES THE FONT BUDGET (measured, bytes; total of
# the four files). The owner chose the middle row on 2026-11-12 and set the budget
# to 135 KB (decision 0014, TICKETS.md O2):
#   wdth pinned 100, wght 400-700 ........  ~35 000   total ~106 KB
#   wdth 100-110,   wght 400-700 ........  ~60 000   total ~131 KB   <- shipped
#   wdth 75-110,    wght 400-700 ........  ~85 000   total ~157 KB (also the 75 %
#                                                      condensed numerals)
# Changing it: edit ARCHIVO_WDTH, rebuild, update the Archivo `font-stretch`
# descriptor and the fallback faces in site.css, and the budget in the tests.
ARCHIVO_WDTH = (100, 110)

# name IDs kept: copyright, family, subfamily, unique id, full, version, PostScript,
# trademark, licence, licence URL, typographic family/subfamily, variations prefix
KEEP_NAMES = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 16, 17, 25]

# output name -> (source, axis limits, features, rename)
FONTS = {
    "archivo.woff2": ("Archivo.ttf", {"wdth": ARCHIVO_WDTH, "wght": (400, 700)}, SANS_FEATURES, None),
    "source-serif-4.woff2": ("SourceSerif4.ttf", {"wght": (400, 600), "opsz": 20}, TEXT_FEATURES, "PG Serif"),
    "source-serif-4-italic.woff2": ("SourceSerif4-Italic.ttf", {"wght": 400, "opsz": 20}, TEXT_FEATURES, "PG Serif"),
    "jetbrains-mono.woff2": ("JetBrainsMono.ttf", {"wght": (400, 500)}, MONO_FEATURES, None),
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


def rename(font: TTFont, family: str, source_family: str, source_ps: str) -> None:
    """Replace the family name everywhere except the copyright, trademark and licence strings."""
    ps = family.replace(" ", "")
    for record in font["name"].names:
        if record.nameID in (0, 7, 13, 14):
            continue
        text = record.toUnicode()
        text = text.replace(source_family, family).replace(source_ps, ps)
        record.string = text


def build(name: str, cache: Path, out: Path) -> Path:
    source, axes, features, new_family = FONTS[name]
    font = TTFont(cache / source)
    font = instancer.instantiateVariableFont(font, axes, inplace=False)
    # round-trip through bytes so the subsetter sees plain, fully loaded tables
    buffer = io.BytesIO()
    font.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)
    opts = subset.Options()
    opts.layout_features = features
    opts.hinting = False
    opts.name_IDs = KEEP_NAMES
    opts.name_legacy = False
    opts.glyph_names = False
    opts.notdef_outline = True
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    if new_family:
        rename(font, new_family, "Source Serif 4", "SourceSerif4")
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


def metrics(web: Path, system: Path | None, limits: dict | None = None) -> None:
    f = TTFont(web)
    upm = f["head"].unitsPerEm
    asc, desc, gap = f["hhea"].ascent / upm, -f["hhea"].descent / upm, f["hhea"].lineGap / upm
    line = f"  {web.name}: ascent {asc:.3f} descent {desc:.3f} lineGap {gap:.3f}"
    if system and system.exists():
        sw = average_width(TTFont(system))
        adjust = average_width(f) / sw
        line += (
            f" | vs {system.name}: size-adjust {adjust * 100:.1f}% ascent-override {asc / adjust * 100:.1f}%"
            f" descent-override {desc / adjust * 100:.1f}% line-gap-override {gap / adjust * 100:.1f}%"
        )
    print(line)


def archivo_fallbacks(cache: Path, system: Path) -> None:
    """Fallback metrics at each end of the shipped width range, for one fallback face per width."""
    lo, hi = ARCHIVO_WDTH if isinstance(ARCHIVO_WDTH, tuple) else (ARCHIVO_WDTH, ARCHIVO_WDTH)
    if not system.exists():
        return
    arial = average_width(TTFont(system))
    for wdth in sorted({lo, hi}):
        font = instancer.instantiateVariableFont(TTFont(cache / "Archivo.ttf"), {"wdth": wdth, "wght": 500}, inplace=False)
        upm = font["head"].unitsPerEm
        adjust = average_width(font) / arial
        asc, desc = font["hhea"].ascent / upm, -font["hhea"].descent / upm
        print(f"  Archivo wdth {wdth} wght 500: size-adjust {adjust * 100:.1f}% ascent-override {asc / adjust * 100:.1f}% descent-override {desc / adjust * 100:.1f}%")


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", type=Path, default=root / ".fonts-cache", help="where the source fonts are kept (not committed)")
    ap.add_argument("--system-fonts", type=Path, default=Path("C:/Windows/Fonts"), help="folder with arial.ttf, georgia.ttf, consola.ttf")
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
    print(f"total: {total:,} bytes ({total / 1024:.1f} KiB), budget 135 KiB")
    for src, dest in (("archivo-OFL.txt", "archivo-OFL.txt"), ("sourceserif4-OFL.txt", "source-serif-4-OFL.txt"), ("jetbrainsmono-OFL.txt", "jetbrains-mono-OFL.txt")):
        (out / dest).write_bytes((args.cache / src).read_bytes())
    print("fallback metrics (paste into site.css):")
    sf = args.system_fonts
    archivo_fallbacks(args.cache, sf / "arial.ttf")
    metrics(out / "source-serif-4.woff2", sf / "georgia.ttf")
    metrics(out / "jetbrains-mono.woff2", sf / "consola.ttf")


if __name__ == "__main__":
    main()
