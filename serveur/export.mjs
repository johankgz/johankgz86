/* =====================================================================
   export.mjs — « Télécharger toutes les données »
   ---------------------------------------------------------------------
   Un ZIP fabriqué au fil de l'eau, fichier après fichier : le serveur
   n'a jamais tout en mémoire, même pour des centaines de photos.
   Les PDF, photos et ZIP déjà compressés sont rangés tels quels ; les
   fiches (JSON, texte) sont compressées. Noms en UTF-8, dates d'origine.

   zipFlux(entrees) -> ReadableStream
     entrees : [{nom, chemin} | {nom, contenu (Buffer ou texte)} | {nom, lire: async () => Buffer, quand}]
   fichiersDe(dossier, exclure) -> [{nom, chemin}] (récursif)
   ===================================================================== */

import { promises as fs } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function dateDos(d) {
  const a = Math.max(1980, d.getFullYear());
  return {
    heure: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    jour: ((a - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}
const COMPRESSER = /\.(json|txt|csv|ics|md|html?|xml|svg)$/i;

/* tous les fichiers d'un dossier, chemins relatifs avec des « / » */
export async function fichiersDe(dossier, exclure = () => false, prefixe = "") {
  const out = [];
  async function marcher(rel) {
    let ents = [];
    try { ents = await fs.readdir(path.join(dossier, rel), { withFileTypes: true }); } catch { return; }
    ents.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of ents) {
      const r = rel ? rel + "/" + e.name : e.name;
      if (exclure(r, e)) continue;
      if (e.isDirectory()) await marcher(r);
      else if (e.isFile()) out.push({ nom: prefixe + r, chemin: path.join(dossier, rel, e.name) });
    }
  }
  await marcher("");
  return out;
}

export function zipFlux(entrees) {
  let i = 0, decalage = 0;
  const central = [];
  let fini = false;
  return new ReadableStream({
    async pull(ctl) {
      try {
        if (fini) { ctl.close(); return; }
        if (i < entrees.length) {
          const e = entrees[i++];
          let brut, quand = new Date();
          if (e.chemin) {
            try { brut = await fs.readFile(e.chemin); quand = (await fs.stat(e.chemin)).mtime; }
            catch { return; }                                   /* effacé entre-temps : on passe */
          } else if (e.lire) {
            /* lu au moment de l'écrire : jamais tout en mémoire */
            try { brut = await e.lire(); } catch { brut = null; }
            if (!brut) return;
            brut = Buffer.isBuffer(brut) ? brut : Buffer.from(brut);
            if (e.quand) quand = new Date(e.quand);
          } else brut = Buffer.isBuffer(e.contenu) ? e.contenu : Buffer.from(String(e.contenu), "utf8");
          const nom = Buffer.from(e.nom.replace(/\\/g, "/"), "utf8");
          const crc = crc32(brut);
          let methode = 0, donnees = brut;
          if (COMPRESSER.test(e.nom) && brut.length > 64) {
            const z = zlib.deflateRawSync(brut, { level: 6 });
            if (z.length < brut.length) { methode = 8; donnees = z; }
          }
          if (decalage + 30 + nom.length + donnees.length > 0xFFFFFFF0 || central.length >= 0xFFFF) {
            throw new Error("Trop de données pour un seul ZIP : passez par la sauvegarde de l'hébergeur.");
          }
          const dd = dateDos(quand);
          const tete = Buffer.alloc(30);
          tete.writeUInt32LE(0x04034b50, 0); tete.writeUInt16LE(20, 4); tete.writeUInt16LE(0x0800, 6);
          tete.writeUInt16LE(methode, 8); tete.writeUInt16LE(dd.heure, 10); tete.writeUInt16LE(dd.jour, 12);
          tete.writeUInt32LE(crc, 14); tete.writeUInt32LE(donnees.length, 18); tete.writeUInt32LE(brut.length, 22);
          tete.writeUInt16LE(nom.length, 26); tete.writeUInt16LE(0, 28);
          central.push({ nom, crc, methode, dd, taille: donnees.length, brut: brut.length, decalage });
          decalage += 30 + nom.length + donnees.length;
          ctl.enqueue(new Uint8Array(Buffer.concat([tete, nom])));
          ctl.enqueue(new Uint8Array(donnees.buffer, donnees.byteOffset, donnees.length));
          return;
        }
        /* le répertoire central, puis la fin */
        const morceaux = [];
        let taille = 0;
        for (const c of central) {
          const h = Buffer.alloc(46);
          h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8);
          h.writeUInt16LE(c.methode, 10); h.writeUInt16LE(c.dd.heure, 12); h.writeUInt16LE(c.dd.jour, 14);
          h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.taille, 20); h.writeUInt32LE(c.brut, 24);
          h.writeUInt16LE(c.nom.length, 28); h.writeUInt32LE(c.decalage, 42);
          morceaux.push(h, c.nom); taille += 46 + c.nom.length;
        }
        const fin = Buffer.alloc(22);
        fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(central.length, 8); fin.writeUInt16LE(central.length, 10);
        fin.writeUInt32LE(taille, 12); fin.writeUInt32LE(decalage, 16);
        morceaux.push(fin);
        ctl.enqueue(new Uint8Array(Buffer.concat(morceaux)));
        fini = true;
        ctl.close();
      } catch (err) { ctl.error(err); }
    }
  });
}
