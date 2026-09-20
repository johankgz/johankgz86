#!/bin/bash
# =====================================================================
#  INSTALLATION SUR o2switch (ou tout cPanel avec Node.js)
#  -------------------------------------------------------------------
#  À lancer depuis le Terminal de cPanel, une fois placé dans le
#  dossier du site :
#
#      bash outils/installer-o2switch.sh
#
#  Le script ne touche à rien d'autre : il installe la dépendance,
#  prépare le dossier des données, et affiche les valeurs à recopier
#  dans « Setup Node.js App ».
# =====================================================================
set -e

SITE="$(cd "$(dirname "$0")/.." && pwd)"
DONNEES="${DONNEES_DOSSIER:-$(dirname "$SITE")/outils-donnees}"

echo "Dossier du site    : $SITE"
echo "Dossier des données : $DONNEES"
echo ""

if ! command -v node > /dev/null 2>&1; then
  echo "Node n'est pas disponible dans ce terminal."
  echo "Dans cPanel, ouvrez « Setup Node.js App », créez l'application,"
  echo "puis copiez la ligne « Enter to the virtual environment » affichée"
  echo "en haut de la page, collez-la ici, et relancez ce script."
  exit 1
fi

VERSION="$(node -v)"
echo "Node présent : $VERSION"
case "$VERSION" in
  v1[0-7].*|v[0-9].*) echo "ATTENTION : il faut Node 20 ou plus. Changez la version dans cPanel." ;;
esac

echo ""
echo "Installation de la dépendance…"
npm install --omit=dev --no-audit --no-fund

mkdir -p "$DONNEES"
chmod 700 "$DONNEES"
echo "Dossier des données prêt."

echo ""
echo "====================================================================="
echo " À recopier dans cPanel > Setup Node.js App"
echo "---------------------------------------------------------------------"
echo " Application root     : ${SITE#"$HOME/"}"
echo " Application startup  : app.js        (ou app.cjs s'il est refusé)"
echo " Node.js version      : 20 ou plus"
echo ""
echo " Variables d'environnement :"
echo "   DONNEES_DOSSIER = $DONNEES"
echo "   RESEND_API_KEY  = (votre clé Resend, pour les e-mails)"
echo "   EXPEDITEUR      = Outils de travaux <contact@votredomaine.fr>"
echo "====================================================================="
echo ""
echo "Puis touchez RESTART sur la même page. Le site répond à l'adresse"
echo "indiquée dans « Application URL »."
