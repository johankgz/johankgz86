"""Recherche des occurrences de chaque symbole de légende sur le plan.

Étapes :
1. pour chaque symbole de légende et chaque primitive candidate de même
   nature (cercle, forme fermée, surface pleine, trait), on vérifie que tous
   les éléments du symbole sont présents autour de la candidate, aux bonnes
   distances et tailles relatives (invariant par rotation et par échelle) ;
2. la candidate ne doit rien contenir d'autre de sa couleur (spécificité) ;
3. les propositions sont acceptées des plus spécifiques aux moins
   spécifiques, chaque primitive ne servant qu'une fois ;
4. les symboles sans élément interne (cercle vide...) ne sont acceptés qu'à
   l'échelle de consensus des symboles riches déjà reconnus ;
5. un second passage repère les mêmes formes dans une autre couleur
   (variantes hors légende) ;
6. les formes colorées restantes sont listées « à vérifier ».
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass

import pymupdf

from .geometry import Primitive, SpatialIndex
from .legend import IGNORED_COLORS, LegendEntry

NEUTRAL_COLORS = {"gray", "black", "white", "none"}


@dataclass
class Occurrence:
    entry: LegendEntry
    anchor: Primitive
    matched: list[Primitive]
    scale: float
    score: float
    variant: bool = False
    tag: str = ""

    @property
    def cx(self) -> float:
        return self.anchor.cx

    @property
    def cy(self) -> float:
        return self.anchor.cy

    @property
    def size(self) -> float:
        return self.anchor.size

    @property
    def confidence(self) -> str:
        if self.score < 0.06:
            return "haute"
        if self.score < 0.14:
            return "moyenne"
        return "à vérifier"


@dataclass
class Unrecognized:
    prim: Primitive
    inside: int
    attached: int
    hint: str


@dataclass
class MatchConfig:
    scale_min: float = 0.25
    scale_max: float = 4.0
    dist_tol: float = 0.12
    line_dist_tol: float = 0.2
    size_tol: float = 0.35
    aspect_tol: float = 0.25
    width_ratio_max: float = 1.6
    consensus_tol: float = 0.35
    allow_variants: bool = True


def _kind_class(kind: str) -> str:
    return "loop" if kind in ("circle", "closed") else kind


def _anchor_kind_ok(cand: Primitive, sig_kind: str) -> bool:
    if cand.kind == sig_kind:
        return True
    if sig_kind == "circle" and cand.kind == "closed":
        return cand.roundness < 0.3 and abs(cand.aspect - 1) < 0.15
    return False


def _aspect_ok(a: float, ref: float, tol: float) -> bool:
    if ref <= 0 or a <= 0:
        return False
    return min(abs(a - ref), abs(1 / a - ref)) / ref <= tol


def _width_ok(p: Primitive, ref_width: float, cfg: MatchConfig) -> bool:
    """Les câbles sont tracés plus épais que les symboles : on les ignore."""
    if p.kind == "fill" or ref_width <= 0 or p.width <= 0:
        return True
    ratio = p.width / ref_width
    return 1 / cfg.width_ratio_max <= ratio <= cfg.width_ratio_max


def _radial_lines(cand: Primitive, lines: list[Primitive]) -> list[Primitive]:
    """Traits partant du bord du cercle vers l'extérieur (traits d'interrupteur)."""
    R = cand.size / 2
    out = []
    for l in lines:
        if not l.points:
            continue
        d0 = math.hypot(l.points[0][0] - cand.cx, l.points[0][1] - cand.cy)
        d1 = math.hypot(l.points[-1][0] - cand.cx, l.points[-1][1] - cand.cy)
        near, far = min(d0, d1), max(d0, d1)
        if 0.6 * R <= near <= 1.6 * R and far - near >= 0.4 * R:
            out.append(l)
    return out


def _inside(cand: Primitive, prims: list[Primitive]) -> list[Primitive]:
    r = cand.rect
    return [p for p in prims
            if r.contains(pymupdf.Point(p.cx, p.cy)) and p.size <= 1.05 * cand.size
            and (p.kind != "line" or r.contains(p.rect))]


def _match_candidate(entry: LegendEntry, cand: Primitive, idx: SpatialIndex,
                     cfg: MatchConfig, variant: bool):
    sig = entry.signature
    s = cand.size / sig.size
    if not (cfg.scale_min <= s <= cfg.scale_max):
        return None
    if sig.kind in ("closed", "line") and not _aspect_ok(cand.aspect, sig.aspect, cfg.aspect_tol):
        return None
    if sig.kind == "line" and sig.n_seg > 0:
        ratio = cand.n_seg / sig.n_seg
        if not (0.5 <= ratio <= 2.0):
            return None
    if sig.kind == "fill" and not _aspect_ok(cand.aspect, sig.aspect, 0.4):
        return None
    radius = (max((e.rel_dist for e in sig.elements), default=0.0) + 2.2) * cand.size
    wide = [p for p in idx.near(cand.cx, cand.cy, radius)
            if p is not cand and p.color not in IGNORED_COLORS and _width_ok(p, cand.width, cfg)]
    matched = []
    residuals = []
    used = set()
    for e in sorted(sig.elements, key=lambda e: -e.rel_size):
        want_color = cand.color if (variant and e.same_color_as_anchor) else e.color
        best = None
        for p in wide:
            if p.id in used or _kind_class(p.kind) != _kind_class(e.kind) or p.color != want_color:
                continue
            rd = abs(cand.dist(p) / cand.size - e.rel_dist)
            rs = abs(p.size / cand.size - e.rel_size)
            tol_d = cfg.line_dist_tol if e.kind == "line" else cfg.dist_tol
            if rd > tol_d or rs > cfg.size_tol * e.rel_size + 0.03:
                continue
            r = rd + rs
            if best is None or r < best[0]:
                best = (r, p)
        if best is None:
            return None
        used.add(best[1].id)
        matched.append(best[1])
        residuals.append(best[0])
    # Spécificité : rien d'autre de la même couleur à l'intérieur ni accroché
    same = [p for p in wide if p.id not in used and p.color == cand.color]
    if sig.kind in ("circle", "closed", "fill"):
        if _inside(cand, same):
            return None
        if sig.kind == "circle" and _radial_lines(cand, [p for p in same if p.kind == "line"]):
            return None
    if not sig.elements and sig.width > 0 and cand.width > 0:
        ratio = cand.width / sig.width
        if not (0.45 <= ratio <= 2.2):
            return None
    score = (sum(residuals) / len(residuals)) if residuals else 0.0
    return Occurrence(entry, cand, matched, s, score, variant=variant)


def find_occurrences(prims: list[Primitive], entries: list[LegendEntry],
                     exclude: list[pymupdf.Rect], cfg: MatchConfig | None = None
                     ) -> tuple[list[Occurrence], list[Unrecognized], dict]:
    cfg = cfg or MatchConfig()
    usable = [p for p in prims if not any(z.contains(pymupdf.Point(p.cx, p.cy)) for z in exclude)]
    idx = SpatialIndex(usable)
    proposals: list[Occurrence] = []
    for variant in (False, True):
        if variant and not cfg.allow_variants:
            break
        for entry in entries:
            sig = entry.signature
            for cand in usable:
                if not _anchor_kind_ok(cand, sig.kind):
                    continue
                if variant:
                    if cand.color == sig.color or cand.color in NEUTRAL_COLORS:
                        continue
                elif cand.color != sig.color:
                    continue
                occ = _match_candidate(entry, cand, idx, cfg, variant)
                if occ is not None:
                    proposals.append(occ)
    proposals.sort(key=lambda o: (o.variant, -o.entry.signature.n_elements, o.score))

    consumed: set[int] = set()
    occurrences: list[Occurrence] = []

    def accept(o: Occurrence) -> None:
        ids = {o.anchor.id} | {p.id for p in o.matched}
        if ids & consumed:
            return
        consumed.update(ids)
        occurrences.append(o)

    # 1) symboles riches (>= 2 éléments) : ils fixent l'échelle de consensus
    for o in proposals:
        if o.entry.signature.n_elements >= 2:
            accept(o)
    # Échelles « soutenues » : regroupement des échelles des symboles riches
    # (les symboles d'un même plan n'ont pas forcément tous la même échelle
    # par rapport à la légende, ex. interrupteurs redessinés plus grands).
    rich = sorted(o.scale for o in occurrences if o.entry.signature.n_elements >= 2 and not o.variant)
    supported: list[float] = []
    bin_: list[float] = []
    for sc in rich:
        if bin_ and math.log(sc / bin_[0]) > math.log(1 + cfg.consensus_tol / 2):
            if len(bin_) >= 2:
                supported.append(statistics.median(bin_))
            bin_ = []
        bin_.append(sc)
    if len(bin_) >= 2:
        supported.append(statistics.median(bin_))
    consensus = statistics.median(rich) if rich else None

    def scale_ok(o: Occurrence, tol: float) -> bool:
        if not supported:
            return True
        return any(abs(math.log(o.scale / sc)) <= math.log(1 + tol) for sc in supported)

    # 2) symboles à un élément puis symboles nus, à l'échelle de consensus
    for o in proposals:
        if o.entry.signature.n_elements == 1 and scale_ok(o, 2 * cfg.consensus_tol):
            accept(o)
    for o in proposals:
        if o.entry.signature.n_elements == 0 and scale_ok(o, cfg.consensus_tol):
            accept(o)

    unrecognized = _unrecognized(usable, entries, consumed, idx, cfg)
    stats = {"consensus_scale": round(consensus, 4) if consensus else None,
             "supported_scales": [round(x, 4) for x in supported],
             "proposals": len(proposals)}
    return occurrences, unrecognized, stats


def _unrecognized(usable, entries, consumed, idx, cfg) -> list[Unrecognized]:
    if not entries:
        return []
    sizes = [e.signature.size for e in entries]
    smin, smax = 0.3 * min(sizes), 1.5 * max(sizes)
    out = []
    for p in usable:
        if p.id in consumed or p.kind not in ("circle", "closed") or p.color in NEUTRAL_COLORS:
            continue
        if not (smin <= p.size <= smax):
            continue
        neigh = [q for q in idx.near(p.cx, p.cy, 2.2 * p.size)
                 if q is not p and q.color == p.color and _width_ok(q, p.width, cfg)]
        inside = _inside(p, neigh)
        attached = _radial_lines(p, [q for q in neigh if q.kind == "line"])
        shape = "cercle" if p.kind == "circle" else "forme fermée"
        if inside:
            hint = f"{shape} {p.color} avec {len(inside)} élément(s) interne(s)"
        elif attached:
            hint = f"{shape} {p.color} vide avec {len(attached)} trait(s) accroché(s) (interrupteur ?)"
        else:
            hint = f"{shape} {p.color} vide"
        if inside and any(q.kind == "fill" and q.size > 0.6 * p.size for q in inside):
            hint = f"point plein {p.color} (attente / sortie de câble ?)"
        out.append(Unrecognized(p, len(inside), len(attached), hint))
    return out
