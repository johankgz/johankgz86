/* =====================================================================
   photos-seules.mjs — chaque photo déposée, aussi rangée seule
   ---------------------------------------------------------------------
   Les photos d'un reportage, d'un suivi, d'un relevé ou d'un point
   arrivent en un lot (un ZIP), que la galerie du dossier ouvre d'un
   coup. On range en plus chaque photo à part, en JPEG, dans le dossier
   du chantier :
       <REF>/Photos/<date> <titre>/01-tableau.jpg
   pour n'avoir que les photos, telles quelles, dans les données du
   serveur et dans « Télécharger toutes les données ».

   extrairePhotos(octets) -> [{nom, octets}]   (ZIP stocké ou compressé)
   rangerPhotos(store, ref, octets, entree, prises, dossiersPris) -> [clés écrites]
   (les lots d'un même reportage partagent un dossier ; un autre reportage a le sien)
   ===================================================================== */

import zlib from "node:zlib";

const IMAGE = /\.(jpe?g|png|webp)$/i;

export function extrairePhotos(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const out = [];
  /* la fin du ZIP : le répertoire central */
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) return out;
  const n = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  for (let k = 0; k < n && p + 46 <= b.length; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const methode = b.readUInt16LE(p + 10), taille = b.readUInt32LE(p + 20);
    const lnom = b.readUInt16LE(p + 28), lextra = b.readUInt16LE(p + 30), lcom = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nom = b.subarray(p + 46, p + 46 + lnom).toString("utf8");
    p += 46 + lnom + lextra + lcom;
    if (!IMAGE.test(nom) || local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) continue;
    const debut = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const brut = b.subarray(debut, debut + taille);
    let octets = null;
    try { octets = methode === 0 ? Buffer.from(brut) : methode === 8 ? zlib.inflateRawSync(brut) : null; } catch { octets = null; }
    if (octets && octets.length) out.push({ nom: nom.split("/").pop(), octets });
  }
  return out;
}

function propre(t, n) {
  return String(t || "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
}

/* le dossier d'un lot : la date, puis le titre sans « · partie 2/3 » ni le nombre de photos */
export function dossierPhotos(ref, entree) {
  const titre = propre(String(entree.titre || "Photos").replace(/\s*·\s*partie\s+\d+\s*\/\s*\d+\s*$/i, "").replace(/\s*\(\d+\)\s*$/, ""), 70) || "Photos";
  return ref + "/Photos/" + propre(entree.date || "", 10) + (entree.date ? " " : "") + titre;
}

/* écrit chaque photo du lot ; « prises » : les clés déjà utilisées par d'autres lots */
export async function rangerPhotos(store, ref, octets, entree, prises, dossiersPris) {
  const photos = extrairePhotos(octets);
  /* un autre reportage du même jour, au même titre : son propre dossier, « (2) » */
  let dossier = entree._dossier || dossierPhotos(ref, entree), base = dossier, n = 2;
  const occupes = new Set(dossiersPris || []);
  while (occupes.has(dossier)) dossier = base + " (" + (n++) + ")";
  const pris = new Set(prises || []);
  const ecrites = [];
  for (const ph of photos) {
    let nom = propre(ph.nom, 120) || "photo.jpg";
    let cle = dossier + "/" + nom, k = 2;
    while (pris.has(cle)) { cle = dossier + "/" + nom.replace(/(\.[a-z0-9]+)?$/i, " (" + (k++) + ")$1"); }
    pris.add(cle);
    const type = /\.png$/i.test(nom) ? "image/png" : /\.webp$/i.test(nom) ? "image/webp" : "image/jpeg";
    await store.set(cle, ph.octets, { metadata: { type } });
    ecrites.push(cle);
  }
  return ecrites;
}
