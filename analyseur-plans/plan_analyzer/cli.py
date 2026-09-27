"""Ligne de commande : ``plan-analyzer analyze plan.pdf -o sortie/``."""

from __future__ import annotations

import argparse
import json
import os
import sys

from .analyzer import analyze
from .report import to_markdown


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="plan-analyzer",
                                     description="Comptage des symboles d'un plan électrique PDF à partir de sa légende.")
    sub = parser.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("analyze", help="analyser un PDF")
    a.add_argument("pdf")
    a.add_argument("-o", "--out", default=None, help="dossier de sortie (JSON, Markdown, PNG annotés)")
    a.add_argument("-p", "--page", type=int, default=None, help="numéro de page (défaut : toutes)")
    a.add_argument("--rooms", default=None, help="fichier JSON des pièces (polygones ou points)")
    a.add_argument("--zoom", type=float, default=4.0, help="résolution des images annotées")
    a.add_argument("--no-images", action="store_true")
    a.add_argument("--no-variants", action="store_true", help="ne pas chercher les variantes de couleur")
    args = parser.parse_args(argv)

    from .matcher import MatchConfig
    cfg = MatchConfig(allow_variants=not args.no_variants)
    result = analyze(args.pdf, out_dir=args.out, page_number=args.page, rooms_file=args.rooms,
                     zoom=args.zoom, render=not args.no_images, cfg=cfg)
    pages = result["pages"] if "pages" in result else [result]
    if args.out:
        os.makedirs(args.out, exist_ok=True)
        with open(os.path.join(args.out, "resultat.json"), "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        with open(os.path.join(args.out, "resultat.md"), "w", encoding="utf-8") as f:
            for p in pages:
                f.write(to_markdown(p))
    for p in pages:
        sys.stdout.write(to_markdown(p))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
