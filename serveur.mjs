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
     PLAN_ANALYSE_URL  adresse de l'analyseur de plans (facultatif)
     PLAN_ANALYSE_CLE  sa clé partagée
     PUSH_CONTACT      contact signé dans les notifications (facultatif :
                       l'adresse du site par défaut)
   ===================================================================== */

process.env.DONNEES_DOSSIER = process.env.DONNEES_DOSSIER || "./donnees";

import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import rapports from "./netlify/functions/rapports.mjs";
import pvgis from "./netlify/functions/pvgis.mjs";
import plan from "./netlify/functions/plan.mjs";
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
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webp": "image/webp",
  ".woff2": "font/woff2", ".woff": "font/woff"
};

/* les fonctions du site, à leur adresse */
const ROUTES = [
  { chemins: ["/api/rapports", "/.netlify/functions/rapports"], fonction: rapports },
  { chemins: ["/api/pvgis", "/.netlify/functions/pvgis"], fonction: pvgis },
  { chemins: ["/api/plan"], fonction: plan }
];

/* jamais de fichier hors du site, ni le dossier des données, ni le dépôt */
const INTERDITS = [".git", ".claude", "node_modules", "donnees", "netlify", "prive", "analyseur-plans", "serveur.mjs", "package-lock.json"];

function fichierDemande(chemin) {
  let propre;
  try { propre = decodeURIComponent(chemin.split("?")[0]); } catch { return null; }   /* « % » isolé : adresse illisible */
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
/* Compresser le texte : sur un réseau mobile, une page de 300 Ko en
   pèse 60. Les images, PDF et ZIP sont déjà compressés, on n'y touche pas. */
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg)/;
function accepteGzip(req) { return /\bgzip\b/.test(String(req.headers["accept-encoding"] || "")); }
async function repondre(req, res, reponse) {
  const entetes = {};
  reponse.headers.forEach((v, k) => { entetes[k] = v; });
  if (reponse.body) {
    let octets = Buffer.from(await reponse.arrayBuffer());
    if (octets.length > 1400 && accepteGzip(req) && COMPRESSIBLE.test(entetes["content-type"] || "") && !entetes["content-encoding"]) {
      octets = zlib.gzipSync(octets, { level: 6 });
      entetes["content-encoding"] = "gzip"; entetes["vary"] = "Accept-Encoding";
      delete entetes["content-length"];
    }
    res.writeHead(reponse.status, entetes);
    res.end(octets);
  } else { res.writeHead(reponse.status, entetes); res.end(); }
}
/* Les pages du site, gardées en mémoire toutes prêtes (brutes et
   compressées), relues seulement si le fichier change. L'étiquette (ETag)
   permet au navigateur de redemander une page sans la retélécharger :
   « pas changé » tient en quelques octets. */
const CACHE_FICHIERS = new Map();
async function fichierPret(fichier) {
  const st = await fs.stat(fichier);
  if (!st.isFile()) throw Object.assign(new Error("dossier"), { code: "ENOENT" });
  const cle = st.size + "-" + Math.round(st.mtimeMs);
  const c = CACHE_FICHIERS.get(fichier);
  if (c && c.cle === cle) return c;
  const brut = await fs.readFile(fichier);
  const type = TYPES[path.extname(fichier).toLowerCase()] || "application/octet-stream";
  const pret = { cle, brut, type, etag: 'W/"' + cle + '"', gz: (brut.length > 1400 && COMPRESSIBLE.test(type)) ? zlib.gzipSync(brut, { level: 9 }) : null };
  if (brut.length < 8 * 1024 * 1024) CACHE_FICHIERS.set(fichier, pret);
  return pret;
}

const serveur = http.createServer(async (req, res) => {
  const chemin = (req.url || "/").split("?")[0];
  try {
    const route = ROUTES.find((r) => r.chemins.includes(chemin));
    if (route) return repondre(req, res, await route.fonction(versRequete(req)));

    const fichier = fichierDemande(req.url || "/");
    if (!fichier) { res.writeHead(403).end("Interdit"); return; }
    let f;
    try { f = await fichierPret(fichier); }
    catch { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Page introuvable"); return; }
    const entetes = {
      "content-type": f.type,
      /* les pages et le service des notifications sont toujours revérifiés (l'ETag évite de les retélécharger) */
      "cache-control": (path.extname(fichier) === ".html" || path.basename(fichier) === "sw.js")
        ? "no-cache" : "public, max-age=3600",
      "etag": f.etag
    };
    if (f.gz) entetes["vary"] = "Accept-Encoding";
    if (String(req.headers["if-none-match"] || "").split(/\s*,\s*/).includes(f.etag)) { res.writeHead(304, entetes); res.end(); return; }
    const gz = f.gz && accepteGzip(req);
    if (gz) entetes["content-encoding"] = "gzip";
    const corps = gz ? f.gz : f.brut;
    entetes["content-length"] = corps.length;
    res.writeHead(200, entetes);
    res.end(req.method === "HEAD" ? undefined : corps);
  } catch (e) {
    console.error("Erreur sur " + chemin + " :", e);
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" })
       .end(JSON.stringify({ erreur: "Erreur du serveur." }));
  }
});

/* Sur un réseau mobile lent, envoyer un relevé chargé de photos peut
   prendre plusieurs minutes : Node coupait au bout de 5 minutes et le
   téléphone affichait « pas de réseau ». On laisse 20 minutes. Les
   connexions gardées ouvertes vivent plus longtemps que celles des
   relais (sinon le serveur ferme au moment où le téléphone renvoie). */
serveur.requestTimeout = 20 * 60 * 1000;
serveur.headersTimeout = 70 * 1000;
serveur.keepAliveTimeout = 65 * 1000;

/* les rappels partent à leur heure : un coup d'œil chaque minute */
setInterval(() => {
  rapports(new Request("http://localhost/api/rapports?action=tic")).catch(() => {});
}, 60000).unref();

serveur.listen(PORT, () => {
  console.log("Outils de chantier");
  console.log("  site      http://localhost:" + PORT);
  console.log("  données   " + dossierDonnees());
  console.log("  e-mails   " + (process.env.RESEND_API_KEY ? "activés" : "désactivés (RESEND_API_KEY absente)"));
  console.log("Arrêter : Ctrl+C");
});
