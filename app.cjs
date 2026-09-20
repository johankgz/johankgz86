/* Même point d'entrée que app.js, en JavaScript classique, pour les
   gestionnaires cPanel qui refusent les modules. Voir app.js. */
const path = require("node:path");

if (!process.env.DONNEES_DOSSIER) {
  process.env.DONNEES_DOSSIER = path.join(__dirname, "..", "outils-donnees");
}

import("./serveur.mjs").catch((e) => {
  console.error("Le site n'a pas pu démarrer :", e);
  process.exit(1);
});
