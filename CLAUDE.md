# Suivi travaux 360 — consignes de travail

Le site de TRICHET LOUÉ ÉNERGIES, hébergé chez o2switch. Le propriétaire écrit en
français et lit les comptes rendus en français.

## Publier

- Le travail se fait sur la branche de la session, puis part **toujours dans `main`**
  (`git push origin <branche>:main`) : o2switch se met à jour depuis `main`.
- Après chaque envoi, dire quoi faire sur o2switch : cPanel › Git Version Control ›
  Manage › **Update from Remote**, et cPanel › Setup Node.js App › **Restart** quand
  un fichier du serveur a changé (`serveur.mjs`, `serveur/`, `prive/`).

## Les grosses modifications : des vues d'abord, publiées en Artifact

Demandé par le propriétaire : **avant de publier une grosse modification, lui en
montrer des vues sur un Artifact, et attendre son accord.**

- **Grosse modification** : une nouvelle fonction ou un nouvel outil, une page (ou un
  bloc) refaite ou réorganisée, un changement visible sur plusieurs pages, une
  nouvelle façon de travailler (droits, notifications, déroulé d'une fiche).
  Une petite correction (un bug, un mot, un réglage d'affichage ponctuel) part
  directement, comme avant.
- **Déroulé** :
  1. faire la modification et la tester ;
  2. prendre les vues dans le vrai site (serveur local et Playwright) : sur
     **téléphone** (390 px de large) et sur **ordinateur**, l'avant et l'après quand
     un écran existant change, chaque étape d'un nouveau déroulé, les fichiers
     produits (PDF…) ;
  3. publier ces vues sur un **Artifact** (outil Artifact) : une page avec une
     légende sous chaque vue, ce qui change, et ce qui reste à décider ;
  4. pousser sur la branche de la session seulement, **pas sur `main`**, et donner le
     lien de l'Artifact ;
  5. pousser sur `main` quand le propriétaire a dit oui (ou corriger d'après ses
     remarques, puis republier les vues sur le même Artifact).

## Écrire

- Messages de commit en français, terminés par les lignes d'attribution de la session.
- Les textes du site sont en français, phrases courtes, vocabulaire du métier.
