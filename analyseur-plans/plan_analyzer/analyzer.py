"""Orchestration : PDF -> résultat structuré."""

from __future__ import annotations

import os

import pymupdf

from .geometry import extract_primitives
from .layout import Layout, detect_floors, detect_rooms, load_rooms_file
from .legend import detect_legend
from .matcher import MatchConfig, find_occurrences
from .report import render_annotated, summarize
from .textlayer import extract_text_lines


def _assign_tags(lines, occurrences, factor: float = 3.0) -> dict:
    """Associe à chaque variante le texte court le plus proche (un texte par symbole)."""
    pairs = []
    for i, o in enumerate(occurrences):
        if not o.variant:
            continue
        for j, t in enumerate(lines):
            s = t.text.strip()
            if len(s) > 14 or t.color == "gray" or s.upper().startswith("HSP"):
                continue
            d = ((t.cx - o.cx) ** 2 + (t.cy - o.cy) ** 2) ** 0.5
            if d <= factor * o.size:
                pairs.append((d, i, j))
    pairs.sort()
    tags, used_t = {}, set()
    for d, i, j in pairs:
        if i in tags or j in used_t:
            continue
        tags[i] = lines[j].text.strip()
        used_t.add(j)
    return tags


def analyze_page(page: pymupdf.Page, rooms_file: str | None = None,
                 cfg: MatchConfig | None = None) -> dict:
    lines = extract_text_lines(page)
    prims = extract_primitives(page)
    entries, zones, warnings = detect_legend(lines, prims)
    occurrences, unrecognized, stats = find_occurrences(prims, entries, zones, cfg)
    tags = _assign_tags(lines, occurrences)

    layout = Layout(floors=detect_floors(lines))
    if rooms_file:
        layout.rooms = load_rooms_file(rooms_file)
    else:
        layout.rooms = detect_rooms(lines, layout)
        if not layout.rooms:
            warnings.append("Aucun nom de pièce trouvé sur le plan : colonne « Pièce » vide "
                            "(fournir un fichier de pièces pour l'attribution).")
    floors = [f.name for f in layout.floors]
    if len(floors) > 1:
        # ordre gauche -> droite
        floors = [f.name for f in sorted(layout.floors, key=lambda f: (f.cx, f.cy))]

    labels = [e.label for e in entries]
    items = []
    for i, o in enumerate(occurrences):
        fl = layout.floor_of(o.cx, o.cy)
        tag = tags.get(i, "")
        items.append({
            "label": o.entry.label,
            "variant": o.variant,
            "color": o.anchor.color,
            "floor": fl,
            "room": layout.room_of(o.cx, o.cy, fl),
            "x": round(o.cx, 1),
            "y": round(o.cy, 1),
            "size": round(o.size, 2),
            "scale": round(o.scale, 3),
            "score": round(o.score, 4),
            "confidence": o.confidence,
            "tag": tag,
        })
    order = {lab: i for i, lab in enumerate(labels)}
    items.sort(key=lambda it: (floors.index(it["floor"]) if it["floor"] in floors else 99,
                               it["variant"], order.get(it["label"], 99), it["y"], it["x"]))
    counters = {}
    for it in items:
        key = it["floor"] or "P"
        counters[key] = counters.get(key, 0) + 1
        it["id"] = f"{key}-{counters[key]:02d}"

    unrec = []
    for u in unrecognized:
        fl = layout.floor_of(u.prim.cx, u.prim.cy)
        unrec.append({
            "floor": fl,
            "x": round(u.prim.cx, 1),
            "y": round(u.prim.cy, 1),
            "size": round(u.prim.size, 2),
            "color": u.prim.color,
            "kind": u.prim.kind,
            "inside": u.inside,
            "attached": u.attached,
            "hint": u.hint,
        })
    unrec.sort(key=lambda u: (floors.index(u["floor"]) if u["floor"] in floors else 99, u["y"], u["x"]))

    n_var = sum(1 for it in items if it["variant"])
    if n_var:
        warnings.append(f"{n_var} symbole(s) ont la forme d'un symbole de légende mais une autre couleur "
                        "(variantes hors légende, comptés à part).")
    if unrec:
        warnings.append(f"{len(unrec)} forme(s) colorée(s) non reconnue(s) à vérifier manuellement.")
    if not floors:
        warnings.append("Aucun libellé de niveau (RDC, R+1...) détecté : tout est compté sur un seul niveau.")

    return {
        "page": page.number + 1,
        "page_size_pt": [round(page.rect.width, 1), round(page.rect.height, 1)],
        "legend": [dict(e.to_dict(), count=sum(1 for it in items if it["label"] == e.label and not it["variant"]),
                        count_variants=sum(1 for it in items if it["label"] == e.label and it["variant"]))
                   for e in entries],
        "floors": floors,
        "rooms": sorted({r.name for r in layout.rooms}),
        "items": items,
        "summary": summarize(items, floors, labels),
        "unrecognized": unrec,
        "warnings": warnings,
        "stats": dict(stats, primitives=len(prims), text_lines=len(lines)),
    }


def analyze(pdf_path: str, out_dir: str | None = None, page_number: int | None = None,
            rooms_file: str | None = None, zoom: float = 4.0, render: bool = True,
            cfg: MatchConfig | None = None) -> dict:
    """Analyse un PDF et retourne le résultat (une entrée par page analysée).

    Par défaut, toutes les pages sont analysées ; ``page_number`` (1-based)
    restreint à une page. Si ``out_dir`` est fourni et ``render`` vrai, des
    images annotées sont écrites.
    """
    from . import __version__

    doc = pymupdf.open(pdf_path)
    pages = [doc[page_number - 1]] if page_number else list(doc)
    results = []
    for page in pages:
        res = analyze_page(page, rooms_file=rooms_file, cfg=cfg)
        res["file"] = os.path.basename(pdf_path)
        res["version"] = __version__
        res["annotated_images"] = {}
        if out_dir and render:
            page_dir = out_dir if len(pages) == 1 else os.path.join(out_dir, f"page_{page.number + 1}")
            res["annotated_images"] = render_annotated(page, res, page_dir, zoom=zoom)
        results.append(res)
    return results[0] if len(results) == 1 else {"file": os.path.basename(pdf_path), "pages": results}
