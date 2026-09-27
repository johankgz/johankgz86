"""Lanceur de l'analyse de plan pour Suivi travaux 360.

Le serveur du site (netlify/functions/plan.mjs) l'appelle directement,
sans passer par un sous-domaine :

    python analyser.py plan.pdf --nom "Plan RDC.pdf" [--page 2] [--zoom 3]
                       [--sans-images] [--sans-variantes]

Il écrit sur la sortie standard le même JSON que l'ancienne API web :
le résultat de l'analyse, avec pour chaque page son tableau Markdown et
ses images annotées en data URL. En cas d'échec : {"erreur": "..."} et
un code de sortie non nul.

« python analyser.py --verifier » dit seulement si les bibliothèques
(PyMuPDF, Pillow) sont installées.
"""

import argparse
import base64
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Ce fichier doit rester lisible par un vieux Python : c'est lui qui dit,
# clairement, qu'il en faut un plus récent (le python3 de base d'o2switch
# est un 3.6).
if sys.version_info < (3, 9):
    print(json.dumps({"pret": False, "erreur": "Python " + ".".join(map(str, sys.version_info[:3]))
                      + " trop ancien : il faut 3.9 ou plus. Lancez installer.sh.",
                      "ancien": True}, ensure_ascii=False))
    raise SystemExit(3)


def _images(chemins):
    sortie = {}
    for niveau, chemin in chemins.items():
        with open(chemin, "rb") as f:
            sortie[niveau] = "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    return sortie


def main():
    p = argparse.ArgumentParser()
    p.add_argument("pdf", nargs="?")
    p.add_argument("--nom", default=None)
    p.add_argument("--page", type=int, default=None)
    p.add_argument("--zoom", type=float, default=3.0)
    p.add_argument("--sans-images", action="store_true")
    p.add_argument("--sans-variantes", action="store_true")
    p.add_argument("--verifier", action="store_true")
    a = p.parse_args()

    if a.verifier:
        try:
            import pymupdf  # noqa: F401
            import PIL  # noqa: F401
            from plan_analyzer import __version__
        except Exception as exc:  # bibliothèques absentes
            print(json.dumps({"pret": False, "erreur": str(exc)}, ensure_ascii=False))
            return 1
        print(json.dumps({"pret": True, "version": __version__}))
        return 0

    from plan_analyzer.analyzer import analyze
    from plan_analyzer.matcher import MatchConfig
    from plan_analyzer.report import to_markdown

    zoom = min(8.0, max(1.0, a.zoom))
    images = not a.sans_images
    with tempfile.TemporaryDirectory() as td:
        try:
            res = analyze(a.pdf, out_dir=td, page_number=a.page, zoom=zoom, render=images,
                          cfg=MatchConfig(allow_variants=not a.sans_variantes))
        except Exception as exc:  # dépend du PDF
            print(json.dumps({"erreur": "Analyse impossible : " + str(exc)}, ensure_ascii=False))
            return 2
        pages = res["pages"] if "pages" in res else [res]
        for pg in pages:
            if a.nom:
                pg["file"] = a.nom
            pg["markdown"] = to_markdown(pg)
            pg["annotated_images"] = _images(pg.get("annotated_images", {})) if images else {}
        if a.nom and "pages" in res:
            res["file"] = a.nom
    sys.stdout.write(json.dumps(res, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
