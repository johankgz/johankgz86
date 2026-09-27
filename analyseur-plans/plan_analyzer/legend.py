"""Détection de la légende et construction de la signature de chaque symbole.

Principe : une ligne de légende est un libellé texte précédé, à sa gauche,
d'un petit groupe de primitives vectorielles (le symbole). Plusieurs lignes
alignées verticalement sur le même bord gauche forment une légende.

La signature d'un symbole est invariante par translation, par échelle et par
rotation : elle mémorise une primitive d'ancrage (le plus grand élément fermé)
et, pour chaque autre élément, sa distance relative au centre de l'ancre et sa
taille relative.
"""

from __future__ import annotations

import itertools
import math
from dataclasses import dataclass, field

import pymupdf

from .geometry import Primitive
from .textlayer import TextLine, looks_like_label

IGNORED_COLORS = {"white", "none"}


@dataclass
class Element:
    kind: str
    color: str
    rel_dist: float
    rel_size: float
    same_color_as_anchor: bool


@dataclass
class Signature:
    color: str
    kind: str
    aspect: float
    n_seg: int
    width: float
    size: float
    elements: list[Element] = field(default_factory=list)
    rel_pairs: list[float] = field(default_factory=list)

    @property
    def n_elements(self) -> int:
        return len(self.elements)


@dataclass
class LegendEntry:
    label: str
    line: TextLine
    box: pymupdf.Rect
    anchor: Primitive
    elements: list[Primitive]
    signature: Signature

    @property
    def color(self) -> str:
        return self.signature.color

    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "color": self.color,
            "anchor": self.anchor.to_dict(),
            "n_elements": self.signature.n_elements,
        }


def _is_table_rule(p: Primitive, h: float) -> bool:
    return p.kind == "line" and p.is_straight() and p.is_axis_aligned() and p.diag > 1.5 * h


def _anchor_key(p: Primitive):
    return (p.kind in ("circle", "closed", "fill"), p.diag)


def build_signature(anchor: Primitive, elements: list[Primitive]) -> Signature:
    size = anchor.size if anchor.size > 0 else 1.0
    els = []
    for e in elements:
        els.append(Element(
            kind=e.kind,
            color=e.color,
            rel_dist=anchor.dist(e) / size,
            rel_size=e.size / size,
            same_color_as_anchor=(e.color == anchor.color),
        ))
    centers = [(anchor.cx, anchor.cy)] + [(e.cx, e.cy) for e in elements]
    pairs = sorted(
        math.hypot(a[0] - b[0], a[1] - b[1]) / size
        for a, b in itertools.combinations(centers, 2)
    )
    return Signature(
        color=anchor.color,
        kind=anchor.kind,
        aspect=anchor.aspect,
        n_seg=anchor.n_seg,
        width=anchor.width,
        size=size,
        elements=els,
        rel_pairs=pairs,
    )


def detect_legend(lines: list[TextLine], prims: list[Primitive],
                  box_width_factor: float = 8.0) -> tuple[list[LegendEntry], list[pymupdf.Rect], list[str]]:
    """Retourne (entrées de légende, zones de légende à exclure, avertissements)."""
    warnings: list[str] = []
    candidates: list[LegendEntry] = []
    prim_rects = [(p, p.rect) for p in prims if p.color not in IGNORED_COLORS]
    for t in lines:
        if not looks_like_label(t):
            continue
        h = t.h
        if h < 3 or h > 40:
            continue
        box = t.symbol_box(box_width_factor)
        core = t.core_box(box)
        if any(o is not t and o.rect.intersects(core) for o in lines):
            continue
        inside = [p for p, r in prim_rects if box.contains(r) and not _is_table_rule(p, h) and p.size >= 0.08 * h]
        if not inside:
            continue
        gx0 = min(p.x0 for p in inside)
        gx1 = max(p.x1 for p in inside)
        gy0 = min(p.y0 for p in inside)
        gy1 = max(p.y1 for p in inside)
        if gx1 - gx0 > 4.5 * h or gy1 - gy0 > 2.4 * h:
            continue
        anchor = max(inside, key=_anchor_key)
        if anchor.kind == "line" and anchor.n_seg < 2 and len(inside) == 1:
            # un simple trait isolé n'est pas un symbole de légende
            continue
        elements = [p for p in inside if p is not anchor]
        candidates.append(LegendEntry(t.text.strip(), t, box, anchor, elements,
                                      build_signature(anchor, elements)))

    # Regroupement des candidats en colonnes alignées
    candidates.sort(key=lambda c: (c.line.dir, c.line.across[0], c.line.along))
    groups: list[list[LegendEntry]] = []
    for c in candidates:
        placed = False
        for g in groups:
            ref = g[-1]
            if ref.line.dir != c.line.dir:
                continue
            tol = 0.4 * max(ref.line.h, c.line.h)
            gap = c.line.across[0] - ref.line.across[1]
            if abs(ref.line.along - c.line.along) <= tol and -0.5 * ref.line.h <= gap <= 6 * ref.line.h:
                g.append(c)
                placed = True
                break
        if not placed:
            groups.append([c])
    good = [g for g in groups if len(g) >= 3] or [g for g in groups if len(g) >= 2]
    entries: list[LegendEntry] = []
    zones: list[pymupdf.Rect] = []
    for g in good:
        entries.extend(g)
        z = pymupdf.Rect(g[0].box)
        for e in g:
            z |= e.box
            z |= e.line.rect
        zones.append(z + (-5, -5, 5, 5))
    if not entries:
        warnings.append("Aucune légende détectée : aucun symbole compté.")
    # Libellés en double
    seen = {}
    for e in entries:
        seen.setdefault(e.label, 0)
        seen[e.label] += 1
    for label, n in seen.items():
        if n > 1:
            warnings.append(f"Libellé de légende présent {n} fois : « {label} ».")
    return entries, zones, warnings
