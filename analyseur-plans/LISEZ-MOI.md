# Analyseur de plans — intégré à Suivi travaux 360

Copie du paquet `plan_analyzer` du dépôt GitHub **johankgz/plan-** (comptage
des symboles d'un plan électrique PDF vectoriel à partir de sa légende),
sans sa partie API web : ici, c'est le serveur du site qui l'appelle.

- `analyser.py` : le lanceur appelé par `netlify/functions/plan.mjs`. Il
  écrit sur la sortie standard le même JSON que l'ancienne API (résultat,
  tableau Markdown, images annotées en data URL).
- `installer.sh` : à lancer une fois sur le serveur. Il choisit un Python
  3.9 ou plus (le python3 de base d'o2switch est un 3.6), crée
  `analyseur-plans/.venv` et y installe `requirements.txt` (PyMuPDF,
  Pillow). Voir `DEPLOIEMENT-O2SWITCH.md`.

Ce dossier n'est jamais servi aux visiteurs (liste `INTERDITS` de
`serveur.mjs`). Pour reprendre une nouvelle version de l'analyseur :
recopier `plan_analyzer/` depuis le dépôt Plan-, sauf `api.py` et `static/`.
