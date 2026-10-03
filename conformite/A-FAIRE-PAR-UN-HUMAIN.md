# À faire par un humain avant la mise en ligne

Le site affiche chaque information manquante en **surligné jaune** : `[À COMPLÉTER]`,
`[À VÉRIFIER]`, `[À FAIRE]`. Pour toutes les retrouver :
`grep -n "À COMPLÉTER\|À VÉRIFIER\|À FAIRE" *.html`

## 1. Votre identité d'éditeur (mentions légales, CGU, conditions d'abonnement, sous-traitance)
- [ ] Prénom NOM, adresse de l'établissement (ou de domiciliation)
- [ ] SIRET, immatriculation au RNE (et RCS si activité commerciale)
- [ ] TVA : numéro intracommunautaire, ou « TVA non applicable, article 293 B du CGI »
- [ ] Une adresse e-mail de contact à vous (pas l'adresse @tlenergies.com d'un abonné)
- [ ] Directeur de la publication (vous, en tant qu'EI)

## 2. Prestataires
- [ ] o2switch : dénomination, adresse, téléphone ; durée de conservation des journaux ; sauvegardes et leur rotation
- [ ] Certificat HTTPS actif sur le domaine (cPanel o2switch → SSL/TLS, AutoSSL)
- [ ] Resend (États-Unis) : vérifier les clauses contractuelles types / Data Privacy Framework et la durée des journaux,
      ou passer à un prestataire d'e-mails européen
- [ ] Open-Meteo et CARTO : pays des serveurs

## 3. Contrats avec les abonnés
- [ ] Conditions d'abonnement : prix, périodicité, délai de paiement, durée, préavis, délai de restitution, assistance
- [ ] Tribunal compétent (clause valable seulement entre commerçants — à faire valider)
- [ ] Faire signer l'accord de sous-traitance (sous-traitance.html) par chaque entreprise abonnée, ou l'annexer au devis
- [ ] Tenir le registre : conformite/registre-des-traitements.md (une ligne par abonné, partie 2)

## 4. Réglages dans le site
- [ ] Fiche société de l'abonné « tle » (page Équipe) : son nom est aujourd'hui « SUIVI TRAVAUX 360 » ;
      y mettre le vrai nom de l'entreprise, son adresse, ses mentions et son médiateur de la consommation
- [ ] Mot de passe du compte propriétaire posé (le secours écrit dans serveur/equipe.mjs se referme alors),
      ou variable d'environnement MOTDEPASSE_PROPRIETAIRE définie sur o2switch
- [ ] LibreDWG (GPL 3.0) : le lien vers le code source et la licence sont dans les mentions légales ;
      si vous modifiez cette bibliothèque, publier aussi vos modifications

## 5. Relecture
- [ ] Faire relire l'ensemble (CGU, conditions d'abonnement, accord de sous-traitance, confidentialité) par un avocat
      avant la mise en ligne commerciale
- [ ] Changer `CGU_VERSION` dans serveur/rapports.mjs et la date de cgu.html à chaque modification importante des CGU :
      chacun les réacceptera à sa prochaine visite
