# Analyseur de plans — intégré à Suivi travaux 360

Copie du paquet `plan_analyzer` du dépôt GitHub **johankgz/plan-** (comptage
des symboles d'un plan électrique PDF vectoriel à partir de sa légende),
sans sa partie API web : ici, c'est le serveur du site qui l'appelle.

- `analyser.py` : le lanceur appelé par `netlify/functions/plan.mjs`. Il
  écrit sur la sortie standard le même JSON que l'ancienne API (résultat,
  tableau Markdown, images annotées en data URL).
- `requirements.txt` : PyMuPDF et Pillow, à installer une fois sur le
  serveur dans `analyseur-plans/.venv` (voir `DEPLOIEMENT-O2SWITCH.md`).

Ce dossier n'est jamais servi aux visiteurs (liste `INTERDITS` de
`serveur.mjs`). Pour reprendre une nouvelle version de l'analyseur :
recopier `plan_analyzer/` depuis le dépôt Plan-, sauf `api.py` et `static/`.
