/* =====================================================================
   OÙ SONT RANGÉES LES DONNÉES
   ---------------------------------------------------------------------
   Dans un dossier de fichiers ordinaires (voir magasin-fichiers.mjs),
   celui que donne la variable DONNEES_DOSSIER : app.js et app.cjs le
   placent hors du dossier du site (../outils-donnees), serveur.mjs prend
   ./donnees à défaut. Pour sauvegarder, on copie ce dossier.
   ===================================================================== */

import { magasinFichiers } from "./magasin-fichiers.mjs";

export function getStore(options) {
  return magasinFichiers(options);
}
export const surFichiers = true;
