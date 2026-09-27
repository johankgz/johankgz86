"""Lecture de la couche texte du PDF (repère affiché)."""

from __future__ import annotations

import re
import statistics
from dataclasses import dataclass

import pymupdf

from .geometry import color_name


@dataclass
class TextLine:
    text: str
    x0: float
    y0: float
    x1: float
    y1: float
    size: float
    horizontal: bool
    color: str
    dir: tuple = (1, 0)  # sens de lecture dans le repère affiché

    @property
    def h(self) -> float:
        """Hauteur du texte, mesurée perpendiculairement au sens de lecture."""
        return (self.y1 - self.y0) if self.horizontal else (self.x1 - self.x0)

    @property
    def axis_aligned(self) -> bool:
        return self.dir in ((1, 0), (-1, 0), (0, 1), (0, -1))

    def symbol_box(self, factor: float, margin: float = 0.45) -> pymupdf.Rect:
        """Zone située juste avant le début du texte (où se trouve le symbole)."""
        h = self.h
        if self.dir == (1, 0):
            return pymupdf.Rect(self.x0 - factor * h, self.y0 - margin * h, self.x0 - 0.1 * h, self.y1 + margin * h)
        if self.dir == (-1, 0):
            return pymupdf.Rect(self.x1 + 0.1 * h, self.y0 - margin * h, self.x1 + factor * h, self.y1 + margin * h)
        if self.dir == (0, 1):
            return pymupdf.Rect(self.x0 - margin * h, self.y0 - factor * h, self.x1 + margin * h, self.y0 - 0.1 * h)
        return pymupdf.Rect(self.x0 - margin * h, self.y1 + 0.1 * h, self.x1 + margin * h, self.y1 + factor * h)

    def core_box(self, box: pymupdf.Rect) -> pymupdf.Rect:
        """Le symbol_box réduit à l'emprise du texte (pour tester les chevauchements)."""
        h = self.h
        if self.horizontal:
            return pymupdf.Rect(box.x0, self.y0 + 0.1 * h, box.x1, self.y1 - 0.1 * h)
        return pymupdf.Rect(self.x0 + 0.1 * h, box.y0, self.x1 - 0.1 * h, box.y1)

    @property
    def along(self) -> float:
        """Coordonnée du début du texte le long du sens de lecture."""
        return {(1, 0): self.x0, (-1, 0): self.x1, (0, 1): self.y0, (0, -1): self.y1}.get(self.dir, self.x0)

    @property
    def across(self) -> tuple[float, float]:
        """Étendue du texte perpendiculairement au sens de lecture."""
        return (self.y0, self.y1) if self.horizontal else (self.x0, self.x1)

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def rect(self) -> pymupdf.Rect:
        return pymupdf.Rect(self.x0, self.y0, self.x1, self.y1)


def _srgb_to_rgb(v: int):
    return ((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255


def extract_text_lines(page: pymupdf.Page) -> list[TextLine]:
    M = page.rotation_matrix
    out = []
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            spans = [s for s in line["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = "".join(s["text"] for s in line["spans"]).strip()
            r = pymupdf.Rect(line["bbox"]) * M
            r.normalize()
            dx, dy = line["dir"]
            ddx = dx * M.a + dy * M.c
            ddy = dx * M.b + dy * M.d
            horizontal = abs(ddy) < 0.3 and abs(ddx) > 0.7
            if horizontal:
                d = (1, 0) if ddx > 0 else (-1, 0)
            elif abs(ddx) < 0.3 and abs(ddy) > 0.7:
                d = (0, 1) if ddy > 0 else (0, -1)
            else:
                d = (round(ddx, 2), round(ddy, 2))
            size = max(s["size"] for s in spans)
            col = color_name(_srgb_to_rgb(spans[0].get("color", 0)))
            out.append(TextLine(text, r.x0, r.y0, r.x1, r.y1, size, horizontal, col, d))
    return out


_NUMERIC = re.compile(r"^[\d\s.,x×/+=°%-]+$")


def looks_like_label(t: TextLine) -> bool:
    """Vrai si la ligne peut être un libellé de légende (texte, pas une cote)."""
    s = t.text.strip()
    if len(s) < 3 or _NUMERIC.match(s):
        return False
    if s.upper().startswith("HSP"):
        return False
    return t.axis_aligned


def median_font_size(lines: list[TextLine]) -> float:
    sizes = [t.size for t in lines if t.size > 0]
    return statistics.median(sizes) if sizes else 10.0
