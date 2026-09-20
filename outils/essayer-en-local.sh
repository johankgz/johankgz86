#!/bin/bash
# =====================================================================
#  LANCER LE SITE SUR VOTRE ORDINATEUR  (macOS, Linux)
#  -------------------------------------------------------------------
#  Double-cliquez ce fichier, ou dans un terminal :
#      bash outils/essayer-en-local.sh
#
#  Le site s'ouvre dans le navigateur. Ctrl+C dans le terminal l'arrête.
#  Les données restent dans le dossier donnees/, à côté du site.
# =====================================================================
set -e
cd "$(dirname "$0")/.."

if ! command -v node > /dev/null 2>&1; then
  echo "Node.js n'est pas installé."
  echo "Installez-le depuis https://nodejs.org (version 20 ou plus), puis relancez."
  exit 1
fi

VERSION="$(node -v | sed 's/v//' | cut -d. -f1)"
if [ "$VERSION" -lt 20 ]; then
  echo "Node $(node -v) est trop ancien : il faut la version 20 ou plus."
  echo "Mettez-le à jour depuis https://nodejs.org, puis relancez."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Première fois : installation de la dépendance…"
  npm install --omit=dev --no-audit --no-fund
fi

PORT="${PORT:-8080}"
echo ""
echo "Le site démarre sur http://localhost:$PORT"
echo "Connexion : société tle, identifiant johan"
echo "Pour arrêter : Ctrl+C"
echo ""

( sleep 2
  if command -v open > /dev/null 2>&1; then open "http://localhost:$PORT"
  elif command -v xdg-open > /dev/null 2>&1; then xdg-open "http://localhost:$PORT"
  fi ) &

PORT="$PORT" npm start
