/* =====================================================================
   MAGASIN SUR FICHIERS
   ---------------------------------------------------------------------
   La même poignée d'opérations que Netlify Blobs — get, set, setJSON,
   delete, list — mais rangées dans un dossier ordinaire.

   Chaque magasin est un sous-dossier, chaque clé un fichier. Les
   « dossiers » du site apparaissent donc tels quels :

       donnees/annuaire/societes.json
       donnees/rapports/C2451/releve.pdf
       donnees/rapports/taches/2026-09-25-brian-....json

   Pour sauvegarder, on copie le dossier. Pour repartir de zéro, on le
   vide. Rien d'autre à savoir.
   ===================================================================== */

import { promises as fs } from "node:fs";
import path from "node:path";

const RACINE = process.env.DONNEES_DOSSIER || "./donnees";

/* une clé ne sort jamais de son magasin */
function chemin(magasin, cle) {
  const morceaux = String(cle).split("/").map((m) => m.trim()).filter(Boolean);
  if (!morceaux.length) throw new Error("Clé vide.");
  for (const m of morceaux) {
    if (m === "." || m === ".." || m.includes("\\")) throw new Error("Clé refusée : " + cle);
  }
  return path.join(RACINE, magasin, ...morceaux);
}
function cleDepuisChemin(magasin, fichier) {
  return path.relative(path.join(RACINE, magasin), fichier).split(path.sep).join("/");
}

/* écriture en deux temps : un fichier à moitié écrit ne remplace jamais l'ancien */
async function ecrire(fichier, contenu) {
  await fs.mkdir(path.dirname(fichier), { recursive: true });
  const provisoire = fichier + ".en-cours-" + process.pid + "-" + Date.now();
  await fs.writeFile(provisoire, contenu);
  await fs.rename(provisoire, fichier);
}
async function lire(fichier) {
  try { return await fs.readFile(fichier); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}
async function parcourir(dossier, sortie) {
  let entrees;
  try { entrees = await fs.readdir(dossier, { withFileTypes: true }); }
  catch (e) { if (e.code === "ENOENT") return sortie; throw e; }
  for (const e of entrees) {
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) await parcourir(complet, sortie);
    else if (!e.name.includes(".en-cours-") && !e.name.endsWith(".metadonnees.json")) sortie.push(complet);
  }
  return sortie;
}

export function magasinFichiers(options) {
  const magasin = typeof options === "string" ? options : (options && options.name) || "defaut";

  return {
    async get(cle, opts) {
      const brut = await lire(chemin(magasin, cle));
      if (brut === null) return null;
      const type = (opts && opts.type) || "text";
      if (type === "json") return JSON.parse(brut.toString("utf8"));
      if (type === "arrayBuffer") return brut.buffer.slice(brut.byteOffset, brut.byteOffset + brut.byteLength);
      if (type === "stream" || type === "blob") return new Blob([brut]);
      return brut.toString("utf8");
    },

    async getWithMetadata(cle, opts) {
      const data = await this.get(cle, opts);
      if (data === null) return null;
      const m = await lire(chemin(magasin, cle) + ".metadonnees.json");
      let metadata = {};
      if (m) { try { metadata = JSON.parse(m.toString("utf8")); } catch { metadata = {}; } }
      return { data, metadata, etag: "" };
    },

    async set(cle, valeur, opts) {
      const contenu = Buffer.isBuffer(valeur) ? valeur
        : (valeur instanceof ArrayBuffer ? Buffer.from(valeur)
        : (ArrayBuffer.isView(valeur) ? Buffer.from(valeur.buffer, valeur.byteOffset, valeur.byteLength)
        : Buffer.from(String(valeur), "utf8")));
      await ecrire(chemin(magasin, cle), contenu);
      if (opts && opts.metadata) {
        await ecrire(chemin(magasin, cle) + ".metadonnees.json",
          Buffer.from(JSON.stringify(opts.metadata), "utf8"));
      }
    },

    async setJSON(cle, valeur, opts) {
      return this.set(cle, JSON.stringify(valeur), opts);
    },

    async delete(cle) {
      for (const f of [chemin(magasin, cle), chemin(magasin, cle) + ".metadonnees.json"]) {
        try { await fs.unlink(f); } catch (e) { if (e.code !== "ENOENT") throw e; }
      }
    },

    async list(opts) {
      const prefixe = (opts && opts.prefix) || "";
      const fichiers = await parcourir(path.join(RACINE, magasin), []);
      const blobs = fichiers
        .map((f) => ({ key: cleDepuisChemin(magasin, f), etag: "" }))
        .filter((b) => b.key.startsWith(prefixe))
        .sort((a, b) => a.key.localeCompare(b.key));
      return { blobs, directories: [] };
    }
  };
}

export function dossierDonnees() { return path.resolve(RACINE); }
