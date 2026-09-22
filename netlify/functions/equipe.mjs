/* =====================================================================
   COMPTES DE DÉPART
   ---------------------------------------------------------------------
   Ce fichier ne contient plus que deux choses :
     1. le compte propriétaire du site (vous) ;
     2. les comptes de départ de la première société, recopiés dans la
        base au premier démarrage.
   Ensuite, tout se gère depuis la page Équipe du site : chaque société
   crée et modifie ses propres utilisateurs, sans toucher au code.
   ===================================================================== */

/* Propriétaire du site : crée les sociétés et leur compte administrateur.
   Ce mot de passe n'est qu'un secours de premier démarrage : il cesse de
   valoir dès qu'un mot de passe est posé sur le compte. Sur un serveur,
   on le remplace en posant la variable d'environnement
   MOTDEPASSE_PROPRIETAIRE. */
export const PROPRIETAIRE = {
  identifiant: "johan",
  motdepasse: process.env.MOTDEPASSE_PROPRIETAIRE || "premier-acces",
  nom: "Johan Klughertz",
  email: "Jklughertz@tlenergies.com"
};

/* Société installée au premier démarrage, avec ses comptes.
   Rôles possibles : "admin" (gère les comptes), "bureau", "technicien".
   Ces comptes arrivent SANS mot de passe : personne ne peut s'en servir
   tant que l'administrateur n'a pas cliqué « Réinitialiser » sur la page
   Comptes, ce qui lui donne un code provisoire à transmettre. La
   personne choisit ensuite le sien, que personne d'autre ne connaît.
   Un compte peut être limité à certaines applis en ajoutant par exemple
   applis: ["reception", "suivi"] sur sa ligne. Sans ce champ, il les a
   toutes. Applis connues : releve, suivi, commande, reception,
   autocontrole, sav, etiquettes, photos. Cela se règle ensuite depuis la
   page Comptes du site, sans toucher à ce fichier. */
export const SOCIETE_DEPART = {
  code: "tle",
  nom: "TRICHET LOUÉ ÉNERGIES",
  metier: "Génie électrique & climatique",
  ville: "Les Achards (85150)",
  utilisateurs: [
    { identifiant: "johan",        motdepasse: "", nom: "Johan",          role: "admin",       email: "Jklughertz@tlenergies.com" },
    { identifiant: "rodolphe",     motdepasse: "", nom: "Rodolphe",       role: "bureau",      email: "" },
    { identifiant: "mickael",      motdepasse: "", nom: "Mickaël",        role: "bureau",      email: "" },
    { identifiant: "anthony",      motdepasse: "", nom: "Anthony",        role: "bureau",      email: "" },
    { identifiant: "charline",     motdepasse: "", nom: "Charline",       role: "bureau",      email: "" },
    { identifiant: "camille",      motdepasse: "", nom: "Camille",        role: "bureau",      email: "" },
    { identifiant: "jeanfrancois", motdepasse: "", nom: "Jean-François",  role: "bureau",      email: "" },
    { identifiant: "rodrigue",     motdepasse: "", nom: "Rodrigue",       role: "bureau",      email: "" },
    { identifiant: "christophe",   motdepasse: "", nom: "Christophe",     role: "technicien",  email: "" },
    { identifiant: "brian",        motdepasse: "", nom: "Brian",          role: "technicien",  email: "" },
    { identifiant: "mathieu",      motdepasse: "", nom: "Mathieu",        role: "technicien",  email: "" },
    { identifiant: "alban",        motdepasse: "", nom: "Alban",          role: "technicien",  email: "" },
    { identifiant: "adrien",       motdepasse: "", nom: "Adrien",         role: "technicien",  email: "" },
    { identifiant: "thomas",       motdepasse: "", nom: "Thomas",         role: "technicien",  email: "" }
  ]
};

/* Société de démonstration, ouverte à tous depuis la page de connexion. */
export const SOCIETE_DEMO = {
  code: "demo",
  nom: "Société de démonstration",
  metier: "Tous corps d'état",
  ville: "France",
  utilisateurs: [
    { identifiant: "demo",  motdepasse: "demo", nom: "Visiteur",   role: "bureau",     email: "" },
    { identifiant: "tech",  motdepasse: "demo", nom: "Technicien", role: "technicien", email: "" }
  ]
};

/* Compatibilité : certaines pages lisent encore ces deux noms. */
export const UTILISATEURS = SOCIETE_DEPART.utilisateurs;
export const SOCIETE = {
  metier: SOCIETE_DEPART.metier,
  ville: SOCIETE_DEPART.ville,
  gestionnaire: PROPRIETAIRE.nom,
  emailGestionnaire: PROPRIETAIRE.email
};
