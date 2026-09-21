/* Même point d'entrée que app.js, en JavaScript classique, pour les
   gestionnaires cPanel qui refusent les modules. Voir app.js. */
const path = require("node:path");

if (!process.env.DONNEES_DOSSIER) {
  process.env.DONNEES_DOSSIER = path.join(__dirname, "..", "outils-donnees");
}

import("./serveur.mjs").catch((e) => {
  if (e && e.code === "ERR_MODULE_NOT_FOUND") {
    console.error([
      "",
      "  Le site n'a pas pu démarrer : les dépendances ne sont pas installées.",
      "",
      "  Dans cPanel > Setup Node.js App : touchez « Run NPM Install »,",
      "  puis « RESTART ».",
      "",
      "  Ou depuis le Terminal, après être entré dans l'environnement virtuel :",
      "",
      "      cd " + __dirname,
      "      npm install --omit=dev",
      ""
    ].join("\n"));
    process.exit(1);
  }
  console.error("Le site n'a pas pu démarrer :", e);
  process.exit(1);
});
