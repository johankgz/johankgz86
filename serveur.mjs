/* =====================================================================
   LE SITE, SUR UN SERVEUR ORDINAIRE
   ---------------------------------------------------------------------
   Sert les pages du site et les deux fonctions (rapports et PVGIS),
   sans Netlify. Les données sont rangées dans un dossier de fichiers.

   Sur votre ordinateur :        npm start
   puis ouvrez                   http://localhost:8080

   Réglages, tous facultatifs :
     PORT              port d'écoute, 8080 par défaut
     DONNEES_DOSSIER   où ranger les données, ./donnees par défaut
     RESEND_API_KEY    clé Resend, pour les e-mails de publication
     EXPEDITEUR        expéditeur des e-mails
   ===================================================================== */

process.env.DONNEES_DOSSIER = process.env.DONNEES_DOSSIER || "./donnees";

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import rapports from "./netlify/functions/rapports.mjs";
import pvgis from "./netlify/functions/pvgis.mjs";
import { dossierDonnees } from "./netlify/functions/magasin-fichiers.mjs";

const RACINE = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "8080", 10);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp"
};

/* les deux fonctions du site, à leur adresse */
const ROUTES = [
  { chemins: ["/api/rapports", "/.netlify/functions/rapports"], fonction: rapports },
  { chemins: ["/api/pvgis", "/.netlify/functions/pvgis"], fonction: pvgis }
];

/* jamais de fichier hors du site, ni le dossier des données, ni le dépôt */
const INTERDITS = [".git", "node_modules", "donnees", "netlify", "serveur.mjs", "package-lock.json"];

function fichierDemande(chemin) {
  const propre = decodeURIComponent(chemin.split("?")[0]);
  const relatif = propre === "/" ? "index.html" : propre.replace(/^\/+/, "");
  if (relatif.split("/").some((m) => m === ".." || INTERDITS.includes(m))) return null;
  const complet = path.join(RACINE, relatif);
  return complet.startsWith(RACINE) ? complet : null;
}

/* Node -> Request du standard Web, que les fonctions attendent */
function versRequete(req) {
  const url = "http://" + (req.headers.host || "localhost:" + PORT) + req.url;
  const entetes = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => entetes.append(k, x));
    else if (v != null) entetes.set(k, v);
  }
  const corps = (req.method === "GET" || req.method === "HEAD") ? undefined : req;
  return new Request(url, { method: req.method, headers: entetes, body: corps, duplex: "half" });
}
async function repondre(res, reponse) {
  const entetes = {};
  reponse.headers.forEach((v, k) => { entetes[k] = v; });
  res.writeHead(reponse.status, entetes);
  if (reponse.body) {
    const octets = Buffer.from(await reponse.arrayBuffer());
    res.end(octets);
  } else res.end();
}

const serveur = http.createServer(async (req, res) => {
  const chemin = (req.url || "/").split("?")[0];
  try {
    const route = ROUTES.find((r) => r.chemins.includes(chemin));
    if (route) return repondre(res, await route.fonction(versRequete(req)));

    const fichier = fichierDemande(req.url || "/");
    if (!fichier) { res.writeHead(403).end("Interdit"); return; }
    let contenu;
    try { contenu = await fs.readFile(fichier); }
    catch { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Page introuvable"); return; }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(fichier).toLowerCase()] || "application/octet-stream",
      "cache-control": path.extname(fichier) === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(contenu);
  } catch (e) {
    console.error("Erreur sur " + chemin + " :", e);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" })
       .end(JSON.stringify({ erreur: "Erreur du serveur." }));
  }
});

serveur.listen(PORT, () => {
  console.log("Outils de chantier");
  console.log("  site      http://localhost:" + PORT);
  console.log("  données   " + dossierDonnees());
  console.log("  e-mails   " + (process.env.RESEND_API_KEY ? "activés" : "désactivés (RESEND_API_KEY absente)"));
  console.log("Arrêter : Ctrl+C");
});
