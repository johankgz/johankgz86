"""Sorties : dictionnaire JSON, tableau Markdown, images annotées."""

from __future__ import annotations

import os
from collections import Counter, OrderedDict

import pymupdf

PALETTE = [
    (0, 150, 0), (200, 0, 200), (0, 120, 220), (230, 120, 0), (120, 60, 0),
    (0, 160, 160), (180, 0, 60), (90, 90, 200), (150, 150, 0), (0, 90, 60),
]


def label_colors(labels):
    return {lab: PALETTE[i % len(PALETTE)] for i, lab in enumerate(labels)}


def to_markdown(result: dict) -> str:
    labels = [e["label"] for e in result["legend"]]
    floors = result["floors"] or [""]
    lines = []
    lines.append(f"# Analyse du plan : {result['file']} (page {result['page']})")
    lines.append("")
    lines.append("## Synthèse par niveau")
    lines.append("")
    head = "| Niveau | " + " | ".join(labels) + " | Variantes hors légende | Total |"
    lines.append(head)
    lines.append("|" + "---|" * (len(labels) + 3))
    for fl in floors:
        row = result["summary"].get(fl, {})
        cells = [str(row.get(lab, 0)) for lab in labels]
        total = sum(row.get(lab, 0) for lab in labels) + row.get("_variants", 0)
        lines.append(f"| {fl or '(page)'} | " + " | ".join(cells) + f" | {row.get('_variants', 0)} | {total} |")
    lines.append("")
    lines.append("## Détail des symboles")
    lines.append("")
    lines.append("| N° | Niveau | Pièce | Symbole | Variante / étiquette | x | y | Confiance |")
    lines.append("|---|---|---|---|---|---|---|---|")
    for it in result["items"]:
        var = ("couleur " + it["color"] + (" · " + it["tag"] if it["tag"] else "")) if it["variant"] else (it["tag"] or "")
        lines.append(f"| {it['id']} | {it['floor']} | {it['room'] or '—'} | {it['label']} | {var} | {it['x']:.0f} | {it['y']:.0f} | {it['confidence']} |")
    if result["unrecognized"]:
        lines.append("")
        lines.append("## Formes non reconnues (à vérifier)")
        lines.append("")
        lines.append("| Niveau | Description | x | y |")
        lines.append("|---|---|---|---|")
        for u in result["unrecognized"]:
            lines.append(f"| {u['floor']} | {u['hint']} | {u['x']:.0f} | {u['y']:.0f} |")
    if result["warnings"]:
        lines.append("")
        lines.append("## Avertissements")
        lines.append("")
        for w in result["warnings"]:
            lines.append(f"- {w}")
    return "\n".join(lines) + "\n"


def render_annotated(page: pymupdf.Page, result: dict, out_dir: str, zoom: float = 4.0,
                     margin: float = 40.0) -> dict:
    """Une image PNG par niveau, symboles entourés et numérotés."""
    from PIL import Image, ImageDraw, ImageFont

    os.makedirs(out_dir, exist_ok=True)
    colors = label_colors([e["label"] for e in result["legend"]])
    floors = result["floors"] or [""]
    outputs = {}
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(7 * zoom))
    except Exception:  # pragma: no cover - police de secours
        font = ImageFont.load_default()
    for fl in floors:
        items = [it for it in result["items"] if it["floor"] == fl]
        unrec = [u for u in result["unrecognized"] if u["floor"] == fl]
        pts = [(it["x"], it["y"]) for it in items] + [(u["x"], u["y"]) for u in unrec]
        if not pts:
            continue
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        clip = pymupdf.Rect(min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin) & page.rect
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        draw = ImageDraw.Draw(img)
        for it in items:
            x = (it["x"] - clip.x0) * zoom
            y = (it["y"] - clip.y0) * zoom
            r = it["size"] / 2 * zoom + 2 * zoom
            col = (150, 0, 200) if it["variant"] else colors.get(it["label"], (0, 0, 0))
            draw.ellipse([x - r, y - r, x + r, y + r], outline=col, width=max(2, int(zoom)))
            short = it["id"].rsplit("-", 1)[-1]  # le niveau est déjà connu sur l'image
            tw = draw.textlength(short, font=font)
            draw.rectangle([x + r, y - r - 2, x + r + tw + 4, y - r + 7 * zoom + 2], fill=(255, 255, 255))
            draw.text((x + r + 2, y - r), short, fill=col, font=font)
        for u in unrec:
            x = (u["x"] - clip.x0) * zoom
            y = (u["y"] - clip.y0) * zoom
            r = u["size"] / 2 * zoom + 2 * zoom
            draw.rectangle([x - r, y - r, x + r, y + r], outline=(120, 120, 120), width=max(1, int(zoom / 2)))
        safe = "".join(c if c.isalnum() else "_" for c in (fl or "page")) or "page"
        path = os.path.join(out_dir, f"plan_annote_{safe}.png")
        img.save(path)
        outputs[fl] = path
    return outputs


def summarize(items: list[dict], floors: list[str], labels: list[str]) -> dict:
    summary = OrderedDict()
    for fl in floors or [""]:
        c = Counter()
        for it in items:
            if it["floor"] != fl:
                continue
            if it["variant"]:
                c["_variants"] += 1
            else:
                c[it["label"]] += 1
        summary[fl] = {lab: c.get(lab, 0) for lab in labels}
        summary[fl]["_variants"] = c.get("_variants", 0)
    total = Counter()
    for fl, row in summary.items():
        total.update(row)
    summary["TOTAL"] = dict(total)
    return summary
