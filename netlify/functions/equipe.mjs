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

/* Propriétaire du site : crée les sociétés et leur compte administrateur. */
export const PROPRIETAIRE = {
  identifiant: "johan",
  motdepasse: "Johan-4712",
  nom: "Johan Klughertz",
  email: "Jklughertz@tlenergies.com"
};

/* Société installée au premier démarrage, avec ses comptes.
   Rôles possibles : "admin" (gère les comptes), "bureau", "technicien". */
export const SOCIETE_DEPART = {
  code: "tle",
  nom: "TRICHET LOUÉ ÉNERGIES",
  metier: "Génie électrique & climatique",
  ville: "Les Achards (85150)",
  utilisateurs: [
    { identifiant: "johan",       motdepasse: "Johan-4712",     nom: "Johan",         role: "admin",      email: "Jklughertz@tlenergies.com" },
    { identifiant: "rodolphe",    motdepasse: "Rodolphe-2856",  nom: "Rodolphe",      role: "bureau",     email: "" },
    { identifiant: "mickael",     motdepasse: "Mickael-9134",   nom: "Mickaël",       role: "bureau",     email: "" },
    { identifiant: "anthony",     motdepasse: "Anthony-5067",   nom: "Anthony",       role: "bureau",     email: "" },
    { identifiant: "charline",    motdepasse: "Charline-7328",  nom: "Charline",      role: "bureau",     email: "" },
    { identifiant: "camille",     motdepasse: "Camille-1495",   nom: "Camille",       role: "bureau",     email: "" },
    { identifiant: "jeanfrancois",motdepasse: "JeanF-6210",     nom: "Jean-François", role: "bureau",     email: "" },
    { identifiant: "rodrigue",    motdepasse: "Rodrigue-3874",  nom: "Rodrigue",      role: "bureau",     email: "" },
    { identifiant: "christophe",  motdepasse: "Christophe-2941",nom: "Christophe",    role: "technicien", email: "" },
    { identifiant: "brian",       motdepasse: "Brian-6183",     nom: "Brian",         role: "technicien", email: "" },
    { identifiant: "mathieu",     motdepasse: "Mathieu-4520",   nom: "Mathieu",       role: "technicien", email: "" },
    { identifiant: "alban",       motdepasse: "Alban-8317",     nom: "Alban",         role: "technicien", email: "" },
    { identifiant: "adrien",      motdepasse: "Adrien-7052",    nom: "Adrien",        role: "technicien", email: "" },
    { identifiant: "thomas",      motdepasse: "Thomas-3698",    nom: "Thomas",        role: "technicien", email: "" }
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
