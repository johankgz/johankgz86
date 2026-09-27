#!/bin/bash
# Installe l'analyseur de plans sur le serveur, une fois pour toutes :
#   bash ~/VOTREDOSSIER/analyseur-plans/installer.sh
#
# Le « python3 » de base d'o2switch est trop ancien (3.6). Ce script cherche
# un Python récent (3.9 ou plus, le plus récent d'abord, dont ceux
# d'o2switch rangés dans /opt/alt), crée l'environnement .venv avec lui et
# y installe PyMuPDF et Pillow. On peut le relancer sans risque.
cd "$(dirname "$0")" || exit 1

assez_recent() {
  "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1
}

PY=""
for c in python3.13 python3.12 python3.11 python3.10 python3.9 \
         /opt/alt/python313/bin/python3.13 /opt/alt/python312/bin/python3.12 \
         /opt/alt/python311/bin/python3.11 /opt/alt/python310/bin/python3.10 \
         /opt/alt/python39/bin/python3.9 /usr/local/bin/python3 python3; do
  if command -v "$c" >/dev/null 2>&1 && assez_recent "$c"; then PY="$(command -v "$c")"; break; fi
done

if [ -z "$PY" ]; then
  echo "Aucun Python 3.9 ou plus trouvé sur ce serveur."
  echo "Pythons présents :"
  ls -d /opt/alt/python3*/bin/python3.* 2>/dev/null
  command -v python3 && python3 --version
  echo "Dans cPanel > Setup Python App, créez une application avec une version récente"
  echo "(3.11 ou 3.12), puis relancez ce script."
  exit 1
fi

echo "Python choisi : $PY ($("$PY" --version 2>&1))"
rm -rf .venv
if ! "$PY" -m venv .venv; then
  echo "Impossible de créer l'environnement avec $PY."
  exit 1
fi
.venv/bin/python -m pip install --upgrade pip >/dev/null 2>&1
if ! .venv/bin/python -m pip install -r requirements.txt; then
  echo "L'installation de PyMuPDF ou de Pillow a échoué (voir ci-dessus)."
  exit 1
fi
echo
.venv/bin/python analyser.py --verifier && echo "Prêt : rechargez la page « Analyse de plan »."
