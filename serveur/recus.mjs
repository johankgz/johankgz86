/* =====================================================================
   recus.mjs — les fichiers partagés depuis le téléphone, à ranger
   ---------------------------------------------------------------------
   Une photo reçue dans Messages ou WhatsApp, un PDF reçu par mail : on le
   partage vers Suivi travaux 360, puis on choisit le chantier où le ranger
   (importer.html, transfert.js).
   - Android : le site installé est dans le menu Partager (manifest,
     share_target) ; sw.js garde les fichiers et ouvre importer.html.
   - iPhone : Safari ne laisse pas un site entrer dans le menu Partager. Un
     Raccourci (app Raccourcis) le fait : il envoie chaque fichier ici, avec
     la clé de partage de la personne (Mon compte), puis ouvre le site. Les
     fichiers attendent dans sa boîte de réception, sept jours au plus.

   Rangement, dans le magasin de la société, par personne (<u>) :
     recus/<u>/index.json  {items: [{id, nom, type, taille, le}]}
     recus/<u>/f/<id>      le fichier, tel qu'envoyé
   La clé de partage : annuaire clespartage/<sha256 de la clé>.json
   {societe, identifiant} ; le compte garde l'empreinte de la sienne
   (clePartage), une nouvelle clé efface l'ancienne.
   ===================================================================== */

import { createHash, randomBytes } from "node:crypto";

const MAX_FICHIER = 25 * 1024 * 1024;
const MAX_ITEMS = 60;
const JOURS = 7;
const FORMATS = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heic",
  "application/pdf": "pdf"
};

const FILES = new Map();
function enFile(cle, fn) {
  const avant = FILES.get(cle) || Promise.resolve();
  const p = avant.then(fn, fn);
  FILES.set(cle, p.catch(() => {}));
  return p;
}
export const empreinteCle = (cle) => createHash("sha256").update(String(cle || "")).digest("hex");
export const nouvelleCle = () => randomBytes(24).toString("base64url");
function slugNom(n) {
  return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sans-nom";
}
const idValide = (id) => /^[a-z0-9]{8,40}$/.test(String(id || ""));
/* le type d'un fichier : son en-tête d'abord (un raccourci n'envoie pas toujours le bon) */
function typeDe(octets, annonce) {
  const t = octets.subarray(0, 12);
  if (t[0] === 0xff && t[1] === 0xd8) return "image/jpeg";
  if (t.subarray(0, 4).toString("hex") === "89504e47") return "image/png";
  if (t.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (t.subarray(0, 4).toString() === "RIFF" && t.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (t.subarray(4, 8).toString() === "ftyp" && /^(heic|heix|mif1|msf1|hevc)/.test(t.subarray(8, 12).toString())) return "image/heic";
  return FORMATS[String(annonce || "").split(";")[0].trim().toLowerCase()] ? String(annonce).split(";")[0].trim().toLowerCase() : "";
}
function nomPropre(nom, type) {
  const ext = FORMATS[type] || "bin";
  let n = String(nom || "").replace(/[\u0000-\u001f\/\\:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!n) {
    const d = new Date();
    n = (type === "application/pdf" ? "Document " : "Photo ") + d.toISOString().slice(0, 10) + " " + String(d.getHours()).padStart(2, "0") + "h" + String(d.getMinutes()).padStart(2, "0");
  }
  if (!new RegExp("\\." + ext + "$", "i").test(n)) n = n.replace(/\.[a-z0-9]{2,5}$/i, "") + "." + ext;
  return n;
}

export async function recus(action, o) {
  const { req, url, store, personne, json } = o;
  const u = slugNom(personne.nom), base = "recus/" + u + "/";
  async function lire() {
    let x = null;
    try { x = await store.get(base + "index.json", { type: "json" }); } catch { x = null; }
    if (!x || !Array.isArray(x.items)) x = { items: [] };
    return x;
  }
  const modifier = (fn) => enFile(personne.societe + "/" + u, async () => {
    const x = await lire();
    /* au-delà de sept jours, un fichier pas rangé s'en va */
    const limite = Date.now() - JOURS * 864e5;
    for (const it of x.items.filter((i) => Date.parse(i.le) < limite)) {
      try { await store.delete(base + "f/" + it.id); } catch { /* déjà parti */ }
    }
    x.items = x.items.filter((i) => Date.parse(i.le) >= limite);
    const r = await fn(x);
    await store.setJSON(base + "index.json", x);
    return r;
  });

  /* ---------- déposer un ou plusieurs fichiers (le raccourci, ou le site) ---------- */
  if (action === "recu-depot") {
    const reçus = [];
    const ct = String(req.headers.get("content-type") || "");
    if (/multipart\/form-data/i.test(ct)) {
      let fd;
      try { fd = await req.formData(); } catch { return json({ erreur: "Envoi illisible." }, 400); }
      for (const [, v] of fd.entries()) {
        if (v && typeof v === "object" && typeof v.arrayBuffer === "function") {
          reçus.push({ octets: Buffer.from(await v.arrayBuffer()), nom: v.name || "", annonce: v.type || "" });
        }
      }
    } else {
      const octets = Buffer.from(await req.arrayBuffer());
      let nom = "";
      try { nom = decodeURIComponent(req.headers.get("x-nom") || url.searchParams.get("nom") || ""); } catch { nom = ""; }
      reçus.push({ octets, nom, annonce: ct });
    }
    if (!reçus.length || reçus.every((r) => !r.octets.length)) return json({ erreur: "Aucun fichier reçu." }, 400);
    const lien = url.origin + "/importer.html?recus=1";
    return modifier(async (x) => {
      let n = 0;
      const refuses = [];
      for (const r of reçus) {
        if (!r.octets.length) continue;
        if (r.octets.length > MAX_FICHIER) { refuses.push((r.nom || "un fichier") + " (plus de 25 Mo)"); continue; }
        const type = typeDe(r.octets, r.annonce);
        if (!type) { refuses.push((r.nom || "un fichier") + " (ni photo ni PDF)"); continue; }
        if (x.items.length >= MAX_ITEMS) { refuses.push("boîte pleine : rangez d'abord ce qui attend"); break; }
        const id = Date.now().toString(36) + randomBytes(5).toString("hex");
        await store.set(base + "f/" + id, r.octets, { metadata: { type } });
        x.items.push({ id, nom: nomPropre(r.nom, type), type, taille: r.octets.length, le: new Date().toISOString() });
        n++;
      }
      if (!n) return json({ erreur: "Rien n'a été reçu : " + refuses.join(", ") + "." }, 400);
      return json({ ok: true, n, refuses, attente: x.items.length, lien });
    });
  }

  /* ---------- ce qui attend d'être rangé ---------- */
  if (action === "recus-liste") {
    const x = await modifier(async (x) => x);
    return json({ items: x.items.map((i) => ({ id: i.id, nom: i.nom, type: i.type, taille: i.taille, le: i.le })) });
  }

  /* ---------- un fichier ---------- */
  if (action === "recu-fichier") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Fichier introuvable." }, 404);
    const x = await lire(), it = x.items.find((i) => i.id === id);
    if (!it) return json({ erreur: "Fichier introuvable." }, 404);
    let b = null;
    try { b = await store.get(base + "f/" + id, { type: "arrayBuffer" }); } catch { b = null; }
    if (!b) return json({ erreur: "Fichier introuvable." }, 404);
    return new Response(b, { headers: { "content-type": it.type, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  }

  /* ---------- rangés (ou jetés) : ils quittent la boîte ---------- */
  if (action === "recus-retirer") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ids = new Set((Array.isArray(d.ids) ? d.ids : []).filter(idValide));
    return modifier(async (x) => {
      for (const it of x.items.filter((i) => ids.has(i.id))) {
        try { await store.delete(base + "f/" + it.id); } catch { /* déjà parti */ }
      }
      x.items = x.items.filter((i) => !ids.has(i.id));
      return json({ ok: true, attente: x.items.length });
    });
  }

  return json({ erreur: "Action inconnue." }, 400);
}
