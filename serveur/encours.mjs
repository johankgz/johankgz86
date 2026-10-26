/* =====================================================================
   encours.mjs — la fiche en cours suit la personne d'un appareil à l'autre
   ---------------------------------------------------------------------
   Un relevé commencé sur l'iPhone se poursuit sur l'iPad ou l'ordinateur :
   chaque appli garde sa fiche en cours sur l'appareil (encours.js), et en
   envoie ici une copie à chaque changement. Ouverte ailleurs, l'appli
   reprend la copie la plus récente.

   Chacun ne voit que les siennes. Les photos (et tout ce qui est en
   data:…) sont gardées à part, une fois, sous leur empreinte SHA-1 :
   une fiche réenvoyée ne renvoie que ce qui a changé.

   Rangement, dans le magasin de la société, par personne (<u>) :
     encours/<u>/index.json   {fiches: {<clé>: {maj, appareil, blobs: [h], efface?}}}
     encours/<u>/f/<sha1 de la clé>.json   la fiche, telle qu'écrite par l'appli
     encours/<u>/b/<h>        une photo ou un document, en data:… (texte)
   La clé est celle de l'appli sur l'appareil : « suivi:courant »,
   « releve:courant@DUPONT », « point:courant#brouillons »…
   L'heure d'une version (maj) est celle du site, jamais celle de
   l'appareil : deux appareils mal réglés ne se trompent pas d'ordre.
   ===================================================================== */

import { createHash } from "node:crypto";

const MAX_FICHE = 6 * 1024 * 1024;       /* la fiche sans ses photos */
const MAX_BLOB = 40 * 1024 * 1024;       /* une photo, un plan, un PDF, en data:… */
const JOURS_EFFACE = 30;                 /* une fiche effacée est oubliée au bout d'un mois */

const FILES = new Map();
function enFile(cle, fn) {
  const avant = FILES.get(cle) || Promise.resolve();
  const p = avant.then(fn, fn);
  FILES.set(cle, p.catch(() => {}));
  return p;
}
const sha1 = (t) => createHash("sha1").update(t).digest("hex");
const cleValide = (k) => typeof k === "string" && k.length <= 160
  && /^[a-z]+:[a-z]+(?:[@#][^\u0000-\u001f/\\]{0,120})?$/.test(k);
const hValide = (h) => /^[0-9a-f]{40}$/.test(String(h || ""));
const court = (t, n) => String(t || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);
/* ce que l'accueil en dit : le client, la référence, et s'il reste à enregistrer */
function resumeDe(r) {
  if (!r || typeof r !== "object") return null;
  return { client: court(r.client, 80), ref: court(r.ref, 60), aEnregistrer: !!r.aEnregistrer };
}
function slugNom(n) {
  return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sans-nom";
}

export async function encours(action, o) {
  const { req, url, store, personne, json } = o;
  const u = slugNom(personne.nom), base = "encours/" + u + "/";
  async function lire() {
    let x = null;
    try { x = await store.get(base + "index.json", { type: "json" }); } catch { x = null; }
    if (!x || typeof x.fiches !== "object" || !x.fiches) x = { fiches: {} };
    return x;
  }
  const modifier = (fn) => enFile(personne.societe + "/" + u, async () => {
    const x = await lire();
    const r = await fn(x);
    await store.setJSON(base + "index.json", x);
    return r;
  });
  /* les photos que plus aucune fiche ne cite s'en vont */
  async function ranger(x, avant) {
    const gardees = new Set();
    Object.values(x.fiches).forEach((e) => (e.blobs || []).forEach((h) => gardees.add(h)));
    for (const h of avant) {
      if (!gardees.has(h)) { try { await store.delete(base + "b/" + h); } catch { /* déjà partie */ } }
    }
  }
  async function corps() { try { return await req.json(); } catch { return null; } }

  /* ---------- ce qui est en cours, sans le contenu ---------- */
  if (action === "encours-liste") {
    const x = await lire();
    const limite = Date.now() - JOURS_EFFACE * 864e5;
    const fiches = {};
    Object.entries(x.fiches).forEach(([k, e]) => {
      if (e.efface && Date.parse(e.maj) < limite) return;
      fiches[k] = { maj: e.maj, appareil: e.appareil || "", efface: !!e.efface, resume: e.resume || null };
    });
    return json({ fiches });
  }

  /* ---------- oubliées sur le téléphone ou la tablette, pas encore publiées (l'accueil de l'ordinateur) ---------- */
  if (action === "encours-oublis") {
    const x = await lire();
    return json({ fiches: fichesOubliees(x).map((f) => ({ ...f, laisse: laisseSur(f) })) });
  }

  /* ---------- une fiche ---------- */
  if (action === "encours-lire") {
    const k = url.searchParams.get("k") || "";
    if (!cleValide(k)) return json({ erreur: "Fiche introuvable." }, 404);
    const x = await lire(), e = x.fiches[k];
    if (!e || e.efface) return json({ erreur: "Fiche introuvable." }, 404);
    let v = null;
    try { v = await store.get(base + "f/" + sha1(k) + ".json", { type: "text" }); } catch { v = null; }
    if (v == null) return json({ erreur: "Fiche introuvable." }, 404);
    return json({ k, v, maj: e.maj, appareil: e.appareil || "" });
  }

  /* ---------- une photo d'une fiche, en data:… ---------- */
  if (action === "encours-blob-lire") {
    const h = url.searchParams.get("h") || "";
    if (!hValide(h)) return json({ erreur: "Photo introuvable." }, 404);
    let t = null;
    try { t = await store.get(base + "b/" + h, { type: "text" }); } catch { t = null; }
    if (t == null) return json({ erreur: "Photo introuvable." }, 404);
    return new Response(t, { headers: { "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, max-age=2592000, immutable", "x-content-type-options": "nosniff" } });
  }

  /* ---------- parmi ces photos, celles que le site n'a pas encore ---------- */
  if (action === "encours-manque") {
    const d = await corps(); if (!d || !Array.isArray(d.h)) return json({ erreur: "Requête illisible." }, 400);
    const x = await lire();
    const connues = new Set();
    Object.values(x.fiches).forEach((e) => (e.blobs || []).forEach((h) => connues.add(h)));
    const manque = [];
    for (const h of d.h.slice(0, 2000)) {
      if (!hValide(h) || manque.indexOf(h) >= 0) continue;
      if (connues.has(h)) continue;
      let t = null;
      try { t = await store.get(base + "b/" + h, { type: "text" }); } catch { t = null; }
      if (t == null) manque.push(h);
    }
    return json({ manque });
  }

  /* ---------- envoyer une photo : son empreinte est vérifiée ---------- */
  if (action === "encours-blob") {
    const h = url.searchParams.get("h") || "";
    if (!hValide(h)) return json({ erreur: "Empreinte illisible." }, 400);
    const t = await req.text();
    if (!t || !t.startsWith("data:")) return json({ erreur: "Contenu illisible." }, 400);
    if (t.length > MAX_BLOB) return json({ erreur: "Trop lourd pour suivre d'un appareil à l'autre." }, 413);
    if (sha1(t) !== h) return json({ erreur: "Contenu altéré en route : réessayez." }, 400);
    await store.set(base + "b/" + h, t, { metadata: { type: "text/plain" } });
    return json({ ok: true });
  }

  /* ---------- enregistrer la fiche en cours (la dernière écrite l'emporte) ---------- */
  if (action === "encours-ecrire") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    const k = String(d.k || "");
    if (!cleValide(k)) return json({ erreur: "Fiche illisible." }, 400);
    if (typeof d.v !== "string") return json({ erreur: "Fiche illisible." }, 400);
    if (d.v.length > MAX_FICHE) return json({ erreur: "Fiche trop lourde pour suivre d'un appareil à l'autre." }, 413);
    const blobs = Array.from(new Set((Array.isArray(d.blobs) ? d.blobs : []).filter(hValide)));
    return modifier(async (x) => {
      const e = x.fiches[k], maj = new Date().toISOString();
      await store.set(base + "f/" + sha1(k) + ".json", d.v, { metadata: { type: "application/json" } });
      const avant = (e && e.blobs) || [];
      x.fiches[k] = { maj, appareil: court(d.appareil, 40), blobs, resume: resumeDe(d.resume) };
      await ranger(x, avant);
      return json({ ok: true, maj });
    });
  }

  /* ---------- la fiche n'est plus en cours (publiée, jetée…) ---------- */
  if (action === "encours-effacer") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    const k = String(d.k || "");
    if (!cleValide(k)) return json({ erreur: "Fiche illisible." }, 400);
    return modifier(async (x) => {
      const e = x.fiches[k], maj = new Date().toISOString();
      try { await store.delete(base + "f/" + sha1(k) + ".json"); } catch { /* déjà partie */ }
      const avant = (e && e.blobs) || [];
      x.fiches[k] = { maj, appareil: court(d.appareil, 40), blobs: [], efface: true };
      await ranger(x, avant);
      return json({ ok: true, maj });
    });
  }

  return json({ erreur: "Action inconnue." }, 400);
}

/* =====================================================================
   Oubliée sur le téléphone : un rappel sur l'ordinateur
   ---------------------------------------------------------------------
   Une fiche laissée sur l'iPhone ou l'iPad avec des changements pas
   encore publiés, et plus touchée depuis une heure : la personne en est
   prévenue sur son ordinateur (notification, et l'accueil). Une fois par
   version de la fiche : retouchée puis laissée de nouveau, elle revient.
   Ce qui a été rappelé est noté dans encours/<u>/oublis.json {<clé>: maj}.
   ===================================================================== */
export const OUBLI_APRES = 60 * 60 * 1000;            /* une heure sans y toucher */
const OUBLI_JUSQUA = 7 * 864e5;                       /* au-delà d'une semaine, on ne rappelle plus */
const MOBILE = /^(iPhone|iPad|téléphone Android|tablette Android)$/;
export const APPLIS_FICHE = {
  releve: ["un relevé", "./releve.html"], suivi: ["un suivi", "./suivi.html"], commande: ["une commande", "./commande.html"],
  point: ["un point de chantier", "./point.html"], autocontrole: ["un autocontrôle", "./autocontrole.html"],
  reception: ["une réception", "./reception.html"], sav: ["une intervention SAV", "./sav.html"],
  etiquettes: ["des étiquettes", "./etiquettes.html"], photos: ["un reportage photo", "./photos.html"],
  carnet: ["un carnet", "./carnet.html"], technique: ["des documents techniques", "./technique.html"], note: ["une note", "./note.html"]
};
/* les fiches d'un index qui attendent d'être publiées, laissées sur un téléphone ou une tablette */
export function fichesOubliees(x, maintenant = Date.now()) {
  const l = [];
  Object.keys((x && x.fiches) || {}).forEach((k) => {
    const e = x.fiches[k], m = /^([a-z]+):courante?(?:@(.+))?$/.exec(k);
    if (!m || !APPLIS_FICHE[m[1]] || !e || e.efface || !e.resume || !e.resume.aEnregistrer) return;
    if (!MOBILE.test(e.appareil || "")) return;
    const age = maintenant - Date.parse(e.maj);
    if (!(age >= OUBLI_APRES && age <= OUBLI_JUSQUA)) return;
    const ref = e.resume.ref || m[2] || "", client = e.resume.client || "";
    let page = APPLIS_FICHE[m[1]][1];
    /* mise de côté sous un autre chantier : on rouvre ce chantier, sa fiche revient */
    if (m[2] && ref) page += "?ref=" + encodeURIComponent(ref) + (client ? "&client=" + encodeURIComponent(client) : "");
    l.push({ k, appli: m[1], quoi: APPLIS_FICHE[m[1]][0], page, ref, client, maj: e.maj, appareil: e.appareil });
  });
  return l.sort((a, b) => String(b.maj).localeCompare(String(a.maj)));
}
/* pour une personne : les oublis pas encore rappelés, et de quoi noter qu'ils l'ont été */
export async function oublisARappeler(store, nom, maintenant = Date.now()) {
  const base = "encours/" + slugNom(nom) + "/";
  let x = null, vus = null;
  try { x = await store.get(base + "index.json", { type: "json" }); } catch { x = null; }
  if (!x || !x.fiches) return { liste: [], noter: async () => {} };
  try { vus = await store.get(base + "oublis.json", { type: "json" }); } catch { vus = null; }
  vus = vus && typeof vus === "object" ? vus : {};
  const liste = fichesOubliees(x, maintenant).filter((f) => vus[f.k] !== f.maj);
  return {
    liste,
    noter: async () => {
      const garde = {};
      Object.keys(vus).forEach((k) => { if (x.fiches[k] && !x.fiches[k].efface) garde[k] = vus[k]; });
      liste.forEach((f) => { garde[f.k] = f.maj; });
      try { await store.setJSON(base + "oublis.json", garde); } catch { /* au prochain passage */ }
    }
  };
}
/* « laissé sur l'iPhone à 14:32 » (heure de Paris) */
export function laisseSur(f) {
  let h = "";
  try { h = new Date(f.maj).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }); } catch { h = ""; }
  const ou = !f.appareil ? "" : /^tablette/.test(f.appareil) ? " sur la " : /^téléphone/.test(f.appareil) ? " sur le " : " sur l'";
  return "laissé" + (ou ? ou + f.appareil : "") + (h ? " à " + h : "");
}
