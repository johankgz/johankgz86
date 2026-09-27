"""Extraction des primitives vectorielles d'une page PDF.

Toutes les coordonnées sont exprimées dans le repère *affiché* de la page
(rotation appliquée), en points PDF (1 pt = 1/72 pouce).

Primitives produites :
- ``circle`` : boucle fermée quasi circulaire (cercle des prises, boutons...)
- ``closed`` : autre boucle fermée (carré RJ45, demi-cercle DCL mur...)
- ``line``   : polyligne ouverte (trait d'interrupteur, croix, flèche...)
- ``fill``   : groupe de surfaces pleines contiguës (points pleins des prises)
"""

from __future__ import annotations

import collections
import math
from dataclasses import dataclass, field

import pymupdf

# Pas de fusion des sommets (en points). Deux extrémités plus proches que cela
# sont considérées comme le même sommet.
VERTEX_TOL = 0.06
# Écart maximal admis entre rayons pour qu'une boucle fermée soit un cercle.
CIRCLE_TOL = 0.2


def color_name(rgb) -> str:
    """Nom de famille de couleur, tolérant aux petites variations."""
    if rgb is None:
        return "none"
    r, g, b = rgb
    if abs(r - g) < 0.08 and abs(g - b) < 0.08:
        if r < 0.2:
            return "black"
        if r > 0.92:
            return "white"
        return "gray"
    if r > 0.85 and g < 0.25 and b < 0.25:
        return "red"
    if r > 0.85 and 0.25 <= g < 0.7 and b < 0.3:
        return "orange"
    if r > 0.85 and g >= 0.7 and b < 0.4:
        return "yellow"
    if b > 0.6 and r < 0.4 and g < 0.6:
        return "blue"
    if g > 0.55 and r < 0.45 and b < 0.55:
        return "green"
    if r > 0.6 and b > 0.6 and g < 0.45:
        return "magenta"
    if g > 0.6 and b > 0.6 and r < 0.45:
        return "cyan"
    if r > 0.4 and g < 0.35 and b < 0.35:
        return "brown"
    return f"rgb({r:.2f},{g:.2f},{b:.2f})"


@dataclass
class Primitive:
    kind: str
    color: str
    rgb: tuple | None
    x0: float
    y0: float
    x1: float
    y1: float
    n_seg: int = 0
    width: float = 0.0
    points: list = field(default_factory=list)
    id: int = -1
    roundness: float = 1.0

    @property
    def loop(self) -> bool:
        return self.kind in ("circle", "closed")

    @property
    def w(self) -> float:
        return self.x1 - self.x0

    @property
    def h(self) -> float:
        return self.y1 - self.y0

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def size(self) -> float:
        return max(self.w, self.h)

    @property
    def diag(self) -> float:
        return math.hypot(self.w, self.h)

    @property
    def aspect(self) -> float:
        return self.w / self.h if self.h > 1e-9 else 1e9

    @property
    def rect(self) -> pymupdf.Rect:
        return pymupdf.Rect(self.x0, self.y0, self.x1, self.y1)

    def dist(self, other: "Primitive") -> float:
        return math.hypot(self.cx - other.cx, self.cy - other.cy)

    def is_straight(self) -> bool:
        if self.kind != "line" or len(self.points) < 2:
            return False
        path = sum(
            math.hypot(b[0] - a[0], b[1] - a[1])
            for a, b in zip(self.points, self.points[1:])
        )
        chord = math.hypot(
            self.points[-1][0] - self.points[0][0],
            self.points[-1][1] - self.points[0][1],
        )
        return path > 0 and chord / path > 0.97

    def is_axis_aligned(self) -> bool:
        return self.w < 0.3 or self.h < 0.3

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "color": self.color,
            "x": round(self.cx, 2),
            "y": round(self.cy, 2),
            "w": round(self.w, 2),
            "h": round(self.h, 2),
            "n_seg": self.n_seg,
            "width": round(self.width, 2),
        }


# --------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------

def _bezier(p0, p1, p2, p3, n=8):
    pts = []
    for i in range(n + 1):
        t = i / n
        mt = 1 - t
        x = mt**3 * p0.x + 3 * mt**2 * t * p1.x + 3 * mt * t**2 * p2.x + t**3 * p3.x
        y = mt**3 * p0.y + 3 * mt**2 * t * p1.y + 3 * mt * t**2 * p2.y + t**3 * p3.y
        pts.append(pymupdf.Point(x, y))
    return pts


def extract_primitives(page: pymupdf.Page) -> list[Primitive]:
    """Extrait toutes les primitives vectorielles de la page (repère affiché)."""
    M = page.rotation_matrix
    segs = []  # (colorkey, (x,y), (x,y), width, rgb)
    fills = []  # (colorkey, Rect, rgb)
    for d in page.get_drawings():
        t = d.get("type")
        if t in ("s", "fs") and d.get("color") is not None:
            rgb = tuple(d["color"])
            ck = color_name(rgb)
            w = float(d.get("width") or 0.0)
            for it in d["items"]:
                op = it[0]
                if op == "l":
                    pts = [it[1], it[2]]
                elif op == "c":
                    pts = _bezier(it[1], it[2], it[3], it[4])
                elif op == "re":
                    r = it[1]
                    pts = [r.tl, r.tr, r.br, r.bl, r.tl]
                elif op == "qu":
                    q = it[1]
                    pts = [q.ul, q.ur, q.lr, q.ll, q.ul]
                else:
                    continue
                pts = [p * M for p in pts]
                for a, b in zip(pts, pts[1:]):
                    if abs(a.x - b.x) < 1e-6 and abs(a.y - b.y) < 1e-6:
                        continue
                    segs.append((ck, (a.x, a.y), (b.x, b.y), w, rgb))
        if t in ("f", "fs") and d.get("fill") is not None:
            rgb = tuple(d["fill"])
            ck = color_name(rgb)
            r = pymupdf.Rect(d["rect"]) * M
            r.normalize()
            fills.append((ck, r, rgb))
    prims = _polylines(segs) + _fill_clusters(fills)
    for i, p in enumerate(prims):
        p.id = i
    return prims


# --------------------------------------------------------------------------
# Polylignes : graphe de sommets, extraction des branches puis des boucles
# --------------------------------------------------------------------------

class _VertexIndex:
    """Fusionne les points plus proches que VERTEX_TOL en un même sommet."""

    def __init__(self):
        self.cells = collections.defaultdict(list)
        self.coords = []
        self.cell = 0.25

    def get(self, ck, x, y) -> int:
        kx, ky = int(math.floor(x / self.cell)), int(math.floor(y / self.cell))
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for vid in self.cells.get((ck, kx + dx, ky + dy), ()):
                    px, py = self.coords[vid]
                    if abs(px - x) < VERTEX_TOL and abs(py - y) < VERTEX_TOL:
                        return vid
        vid = len(self.coords)
        self.coords.append((x, y))
        self.cells[(ck, kx, ky)].append(vid)
        return vid


def _polylines(segs) -> list[Primitive]:
    vidx = _VertexIndex()
    adj = collections.defaultdict(set)
    edge_width = {}
    vcolor = {}
    for ck, a, b, w, rgb in segs:
        u = vidx.get(ck, *a)
        v = vidx.get(ck, *b)
        if u == v:
            continue
        adj[u].add(v)
        adj[v].add(u)
        key = (min(u, v), max(u, v))
        edge_width[key] = max(w, edge_width.get(key, 0.0))
        vcolor[u] = (ck, rgb)
        vcolor[v] = (ck, rgb)
    coords = vidx.coords

    seen = set()
    prims = []
    for start in list(adj.keys()):
        if start in seen:
            continue
        comp = []
        stack = [start]
        seen.add(start)
        while stack:
            v = stack.pop()
            comp.append(v)
            for n in adj[v]:
                if n not in seen:
                    seen.add(n)
                    stack.append(n)
        ck, rgb = vcolor[start]
        prims.extend(_decompose(comp, adj, coords, edge_width, ck, rgb))
    return prims


def _line_prim(chain, coords, edge_width, ck, rgb) -> Primitive:
    pts = [coords[v] for v in chain]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w = max(edge_width.get((min(a, b), max(a, b)), 0.0) for a, b in zip(chain, chain[1:]))
    return Primitive("line", ck, rgb, min(xs), min(ys), max(xs), max(ys),
                     n_seg=len(chain) - 1, width=w, points=pts)


def _closed_prim(vertices, edges, coords, edge_width, ck, rgb) -> Primitive:
    pts = [coords[v] for v in vertices]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    w, h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    kind = "closed"
    roundness = 1.0
    if len(pts) >= 5 and max(w, h) > 0:
        radii = [math.hypot(p[0] - cx, p[1] - cy) for p in pts]
        mean = sum(radii) / len(radii)
        if mean > 0:
            roundness = (max(radii) - min(radii)) / mean
        squareness = abs(w - h) / max(w, h)
        # tolérance élargie pour les tout petits cercles (points des prises)
        tol = CIRCLE_TOL if max(w, h) >= 3 else CIRCLE_TOL * 2
        if squareness < 0.15 * (2 if max(w, h) < 3 else 1) and roundness < tol:
            kind = "circle"
    width = max((edge_width.get(e, 0.0) for e in edges), default=0.0)
    return Primitive(kind, ck, rgb, x0, y0, x1, y1, n_seg=len(edges), width=width, points=pts,
                     roundness=roundness)


def _decompose(comp, adj, coords, edge_width, ck, rgb) -> list[Primitive]:
    active = {v: set(adj[v]) for v in comp}
    prims = []
    # 1) branches (chemins ouverts) : on part des feuilles
    while True:
        leaves = [v for v in comp if len(active[v]) == 1]
        if not leaves:
            break
        for leaf in leaves:
            if len(active[leaf]) != 1:
                continue
            chain = [leaf]
            cur, prev = leaf, None
            while True:
                nb = list(active[cur])
                if prev is not None and len(nb) != 1:
                    break
                if not nb:
                    break
                nxt = nb[0]
                active[cur].discard(nxt)
                active[nxt].discard(cur)
                chain.append(nxt)
                prev, cur = cur, nxt
            if len(chain) >= 2:
                prims.append(_line_prim(chain, coords, edge_width, ck, rgb))
    # 2) boucles restantes
    remaining = [v for v in comp if active[v]]
    seen = set()
    for s in remaining:
        if s in seen:
            continue
        piece = []
        stack = [s]
        seen.add(s)
        while stack:
            v = stack.pop()
            piece.append(v)
            for n in active[v]:
                if n not in seen:
                    seen.add(n)
                    stack.append(n)
        edges = {(min(u, v), max(u, v)) for u in piece for v in active[u]}
        if len(piece) >= 3:
            prims.append(_closed_prim(piece, edges, coords, edge_width, ck, rgb))
    return prims


# --------------------------------------------------------------------------
# Surfaces pleines
# --------------------------------------------------------------------------

def _fill_clusters(fills) -> list[Primitive]:
    """Regroupe les petites surfaces pleines contiguës de même couleur."""
    BIG = 40.0
    CELL = 4.0
    GAP = 0.3
    small = []
    prims = []
    for ck, r, rgb in fills:
        if r.width > BIG or r.height > BIG:
            prims.append(Primitive("fill", ck, rgb, r.x0, r.y0, r.x1, r.y1, n_seg=1))
        else:
            small.append((ck, r, rgb))
    parent = list(range(len(small)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    grid = collections.defaultdict(list)
    for i, (ck, r, rgb) in enumerate(small):
        for gx in range(int(math.floor(r.x0 / CELL)), int(math.floor(r.x1 / CELL)) + 1):
            for gy in range(int(math.floor(r.y0 / CELL)), int(math.floor(r.y1 / CELL)) + 1):
                grid[(ck, gx, gy)].append(i)
    for members in grid.values():
        for a_i in range(len(members)):
            ia = members[a_i]
            ra = small[ia][1]
            for b_i in range(a_i + 1, len(members)):
                ib = members[b_i]
                rb = small[ib][1]
                if (ra.x0 - GAP <= rb.x1 and rb.x0 - GAP <= ra.x1
                        and ra.y0 - GAP <= rb.y1 and rb.y0 - GAP <= ra.y1):
                    pa, pb = find(ia), find(ib)
                    if pa != pb:
                        parent[pa] = pb
    groups = collections.defaultdict(list)
    for i in range(len(small)):
        groups[find(i)].append(i)
    for members in groups.values():
        ck, r0, rgb = small[members[0]]
        r = pymupdf.Rect(r0)
        for m in members[1:]:
            r |= small[m][1]
        prims.append(Primitive("fill", ck, rgb, r.x0, r.y0, r.x1, r.y1, n_seg=len(members)))
    return prims


# --------------------------------------------------------------------------
# Index spatial simple
# --------------------------------------------------------------------------

class SpatialIndex:
    def __init__(self, prims: list[Primitive], cell: float = 20.0):
        self.cell = cell
        self.grid = collections.defaultdict(list)
        for p in prims:
            self.grid[(int(p.cx // cell), int(p.cy // cell))].append(p)

    def near(self, x: float, y: float, radius: float):
        c = self.cell
        r = int(math.ceil(radius / c))
        gx, gy = int(x // c), int(y // c)
        out = []
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                for p in self.grid.get((gx + dx, gy + dy), ()):
                    if math.hypot(p.cx - x, p.cy - y) <= radius:
                        out.append(p)
        return out
