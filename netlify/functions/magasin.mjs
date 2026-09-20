/* =====================================================================
   OÙ SONT RANGÉES LES DONNÉES
   ---------------------------------------------------------------------
   Le site sait vivre à deux endroits, sans rien changer à son code :

     - sur Netlify, dans les « blobs » de la plateforme, comme depuis
       le premier jour ;
     - sur n'importe quel serveur Node, dans un dossier de fichiers,
       dès que la variable DONNEES_DOSSIER est renseignée.

   C'est la seule pièce à connaître pour déménager le site.
   ===================================================================== */

import { getStore as magasinNetlify } from "@netlify/blobs";
import { magasinFichiers } from "./magasin-fichiers.mjs";

const SUR_FICHIERS = !!(process.env.DONNEES_DOSSIER || "").trim();

export function getStore(options) {
  return SUR_FICHIERS ? magasinFichiers(options) : magasinNetlify(options);
}
export const surFichiers = SUR_FICHIERS;
