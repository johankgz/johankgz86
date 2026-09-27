"""Attribution des symboles aux niveaux et aux pièces."""

from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field

from .textlayer import TextLine, median_font_size

DEFAULT_ROOM_REGEX = (
    r"\b(CHAMBRE|CH\.?\s?\d|S[EÉ]JOUR|SALON|CUISINE|SALLE\s+(?:DE\s+BAIN|D'EAU|A\s+MANGER|À\s+MANGER)|"
    r"SDB|S\.D\.B|WC|W\.C|TOILETTES?|BUREAU|ENTR[EÉ]E|D[EÉ]GAGEMENT|PALIER|CELLIER|BUANDERIE|GARAGE|"
    r"DRESSING|TERRASSE|HALL|COULOIR|MEZZANINE|LINGERIE|CAVE|LOCAL\s+TECH\w*|VESTIBULE)\b"
)


@dataclass
class FloorLabel:
    name: str
    cx: float
    cy: float


@dataclass
class Room:
    name: str
    floor: str | None
    polygon: list[tuple[float, float]] | None = None
    cx: float | None = None
    cy: float | None = None


@dataclass
class Layout:
    floors: list[FloorLabel] = field(default_factory=list)
    rooms: list[Room] = field(default_factory=list)
    room_max_dist: float = 150.0

    def floor_of(self, x: float, y: float) -> str:
        if not self.floors:
            return ""
        return min(self.floors, key=lambda f: (abs(f.cx - x), abs(f.cy - y))).name

    def room_of(self, x: float, y: float, floor: str) -> str:
        best, best_d = "", None
        for r in self.rooms:
            if r.floor and floor and r.floor != floor:
                continue
            if r.polygon:
                if _point_in_polygon(x, y, r.polygon):
                    return r.name
                continue
            if r.cx is None:
                continue
            d = math.hypot(r.cx - x, r.cy - y)
            if d <= self.room_max_dist and (best_d is None or d < best_d):
                best, best_d = r.name, d
        return best


def detect_floors(lines: list[TextLine]) -> list[FloorLabel]:
    """Les niveaux sont les très grands textes courts (RDC, R+1, ETAGE...)."""
    med = median_font_size(lines)
    big = [t for t in lines if t.size >= max(4 * med, 24) and len(t.text.strip()) <= 12]
    labels = [FloorLabel(t.text.strip(), t.cx, t.cy) for t in big]
    # dédoublonnage par nom : on garde le plus grand
    uniq = {}
    for t, lab in zip(big, labels):
        if lab.name not in uniq or t.size > uniq[lab.name][0]:
            uniq[lab.name] = (t.size, lab)
    return [v[1] for v in uniq.values()]


def detect_rooms(lines: list[TextLine], layout: Layout, regex: str = DEFAULT_ROOM_REGEX) -> list[Room]:
    rx = re.compile(regex, re.IGNORECASE)
    rooms = []
    for t in lines:
        s = t.text.strip()
        if len(s) > 40 or not rx.search(s):
            continue
        if t.size > 3 * median_font_size(lines):
            continue
        rooms.append(Room(s, layout.floor_of(t.cx, t.cy) or None, cx=t.cx, cy=t.cy))
    return rooms


def load_rooms_file(path: str) -> list[Room]:
    """Fichier JSON : [{"name": "Cuisine", "floor": "RDC", "polygon": [[x, y], ...]}]"""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("rooms", [])
    rooms = []
    for r in data:
        poly = [(float(x), float(y)) for x, y in r.get("polygon", [])] or None
        rooms.append(Room(r["name"], r.get("floor"), polygon=poly,
                          cx=r.get("x"), cy=r.get("y")))
    return rooms


def _point_in_polygon(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if xin > x:
                inside = not inside
    return inside
