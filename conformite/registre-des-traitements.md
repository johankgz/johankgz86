# Registre des activités de traitement — Suivi travaux 360

Article 30 du RGPD. Document interne : à tenir à jour et à présenter à la CNIL sur demande.
Il n'est pas publié : le serveur refuse de servir le dossier `conformite/` (liste INTERDITS de `serveur.mjs`).

- Responsable : **[À COMPLÉTER : Prénom NOM]**, entrepreneur individuel, « Suivi travaux 360 »,
  SIRET [À COMPLÉTER], [adresse], [e-mail de contact].
- Pas de délégué à la protection des données (non obligatoire : pas de suivi à grande échelle,
  pas de données sensibles à grande échelle).
- Dernière mise à jour : 3 octobre 2026.

## Partie 1 — Traitements dont l'éditeur est responsable (art. 30.1)

| # | Traitement | Personnes | Données | Finalité / base légale | Destinataires | Durée | Où dans le code |
|---|---|---|---|---|---|---|---|
| 1 | Demandes d'accès | Prospects | Nom, e-mail, fonction, téléphone, message | Répondre / mesures précontractuelles (6.1.b) | Éditeur ; Resend (e-mail d'alerte) | 3 ans puis purge automatique | `index.html` (formulaire), `serveur/rapports.mjs` action `demande-acces`, purge dans `tic` |
| 2 | Comptes et authentification | Utilisateurs des abonnés | Identifiant, nom, rôle, société, e-mail, téléphone, empreinte du mot de passe, date de changement, acceptation des CGU (version, date) | Fournir le service et le sécuriser (6.1.b, 6.1.f) | Éditeur, administrateur de l'abonné | Vie du compte ; fin d'abonnement | `serveur/rapports.mjs` (`connexion`, `comptes`, `compte-*`, `cgu-accepter`), `serveur/equipe.mjs` |
| 3 | Notifications push | Utilisateurs | Adresse d'abonnement, préférences, journal des 60 derniers envois | Prévenir l'utilisateur (consentement 6.1.a) | Services push des navigateurs | Jusqu'à désactivation | `serveur/notifications.mjs`, `compte.html` |
| 4 | E-mails du service | Utilisateurs, clients des abonnés | Adresse, contenu | Exécution du contrat (6.1.b) | Resend (États-Unis) | Le temps de l'envoi [À VÉRIFIER chez Resend] | `envoyerMail` dans `serveur/rapports.mjs` |
| 5 | Gestion des abonnés | Interlocuteurs des entreprises | Coordonnées, contrat, factures | Contrat (6.1.b), obligations comptables (6.1.c) | Éditeur, comptable | Contrat + 5 ans ; pièces comptables 10 ans | Hors site |
| 6 | Journaux techniques | Visiteurs | IP, date, URL | Sécurité (6.1.f), obligation légale | o2switch | [À VÉRIFIER auprès d'o2switch], 12 mois au plus | Hébergeur |

Transferts hors UE : Resend (États-Unis) — garanties [À VÉRIFIER : CCT / DPF].

## Partie 2 — Traitements effectués pour le compte des abonnés (art. 30.2)

Pour chaque entreprise abonnée (responsable de traitement), tenir une ligne :

| Abonné (nom, adresse, contact) | Accord de sous-traitance signé le | Catégories de traitements |
|---|---|---|
| [À COMPLÉTER : par exemple l'entreprise du code société `tle`] | [date] | Suivi de chantiers et de la relation client : dossiers, clients, photos, signatures, PRM et courbe de charge, demandes reçues par lien client / QR code, rendez-vous en ligne, échanges d'équipe |

- Sous-traitants ultérieurs : o2switch (France, hébergement), Resend (États-Unis, e-mails),
  services push des navigateurs.
- Transferts hors UE : Resend (voir partie 1).
- Mesures de sécurité : voir `sous-traitance.html`, section 5.

## Partie 3 — Journal des violations de données (art. 33.5)

| Date | Nature | Données / personnes | Conséquences | Mesures | Notifiée à l'abonné / CNIL |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
