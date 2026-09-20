/* =====================================================================
   RAPATRIER LES DONNÉES DE NETLIFY
   ---------------------------------------------------------------------
   Copie tout ce que le site a stocké chez Netlify — dossiers, documents,
   comptes, listes, tâches — dans le dossier de données du nouveau
   serveur. À lancer une fois, au moment du déménagement.

   Il faut deux informations, prises sur netlify.com :
     NETLIFY_SITE_ID     Site configuration > General > Site ID
     NETLIFY_AUTH_TOKEN  votre avatar > User settings > Applications >
                         Personal access tokens > New access token

   Puis, depuis le dossier du site :

     NETLIFY_SITE_ID=xxx NETLIFY_AUTH_TOKEN=yyy npm run export-netlify

   Rien n'est modifié chez Netlify : on ne fait que lire.
   ===================================================================== */

import { getStore, listStores } from "@netlify/blobs";
import { promises as fs } from "node:fs";
import path from "node:path";

const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
const token = (process.env.NETLIFY_AUTH_TOKEN || "").trim();
const SORTIE = path.resolve(process.env.DONNEES_DOSSIER || "./donnees");

if (!siteID || !token) {
  console.error("Il manque NETLIFY_SITE_ID ou NETLIFY_AUTH_TOKEN.");
  console.error("Voyez l'en-tête de ce fichier pour savoir où les prendre.");
  process.exit(1);
}

async function nomsDesMagasins() {
  try {
    const r = await listStores({ siteID, token });
    if (r && Array.isArray(r.stores) && r.stores.length) return r.stores;
  } catch {
    console.log("La liste des magasins n'est pas accessible : on prend les noms connus.");
  }
  /* repli : l'annuaire donne les sociétés, donc les magasins */
  const noms = ["annuaire", "rapports"];
  try {
    const a = getStore({ name: "annuaire", siteID, token, consistency: "strong" });
    const societes = (await a.get("societes.json", { type: "json" })) || [];
    for (const s of societes) if (s.code && s.code !== "tle") noms.push("rapports-" + s.code);
  } catch { /* on exporte au moins les deux magasins de base */ }
  return noms;
}

async function ecrire(fichier, octets) {
  await fs.mkdir(path.dirname(fichier), { recursive: true });
  await fs.writeFile(fichier, octets);
}

const magasins = await nomsDesMagasins();
console.log("Magasins à rapatrier : " + magasins.join(", "));
let total = 0, poids = 0;

for (const nom of magasins) {
  const magasin = getStore({ name: nom, siteID, token, consistency: "strong" });
  let blobs = [];
  try { blobs = (await magasin.list()).blobs || []; }
  catch (e) { console.log("  " + nom + " : illisible (" + e.message + ")"); continue; }
  console.log("  " + nom + " : " + blobs.length + " élément(s)");
  for (const b of blobs) {
    const brut = await magasin.get(b.key, { type: "arrayBuffer" });
    if (brut === null) continue;
    const octets = Buffer.from(brut);
    await ecrire(path.join(SORTIE, nom, ...b.key.split("/")), octets);
    total++; poids += octets.length;
  }
}

console.log("");
console.log(total + " fichier(s) rapatriés, " + Math.round(poids / 1024) + " Ko, dans " + SORTIE);
console.log("Lancez le site avec npm start : il repart sur ces données.");
