/* =====================================================================
   POINT D'ENTRÉE POUR LES HÉBERGEURS cPanel (o2switch et compagnie)
   ---------------------------------------------------------------------
   Le gestionnaire d'applications Node de cPanel — Passenger — démarre
   un fichier unique. Celui-ci ne fait que deux choses : ranger les
   données hors du dossier du site, puis lancer le serveur.

   Dans cPanel > Setup Node.js App :
     Application root      le dossier du site
     Application startup   app.js   (ou app.cjs si celui-ci est refusé)
     Application URL       votre domaine ou sous-domaine

   Les réglages passent par les variables d'environnement de la même
   page : DONNEES_DOSSIER, RESEND_API_KEY, EXPEDITEUR. Passenger fournit
   PORT tout seul.
   ===================================================================== */

import path from "node:path";
import { fileURLToPath } from "node:url";

/* les données hors du dossier du site : personne ne doit pouvoir les
   télécharger par le web, même si le site est servi depuis public_html */
if (!process.env.DONNEES_DOSSIER) {
  const ici = path.dirname(fileURLToPath(import.meta.url));
  process.env.DONNEES_DOSSIER = path.join(ici, "..", "outils-donnees");
}

await import("./serveur.mjs");
