/* =====================================================================
   mesplans.mjs — les plans du module Plan (dwg.html), enregistrés sur le site
   ---------------------------------------------------------------------
   Un plan commencé (page vierge, ou DWG / DXF / PDF / image importé, avec
   ce qu'on y a dessiné et posé) s'enregistre ici : on le rouvre plus tard,
   sur n'importe quel appareil, pour le reprendre. Chacun a les siens.
   Un plan peut aussi être déposé dans le dossier d'un chantier, côté
   « Réservé chargés d'affaires » (rapports.mjs, action plan-chantier) :
   son PDF y est rangé, et les chargés d'affaires du chantier le
   reprennent (rapports.mjs vérifie leur accès, puis passe « proprio »).

   Rangement, dans le magasin de la société, par personne (<u>) :
     plans/<u>/index.json    {plans: [{id, nom, type, source?, maj, auteur, cree, creePar, taille, chantier?}]}
                         type « vierge » (dessiné de zéro) ou « fichier » (importé) ;
                         source : {nom, taille, ext, cle, page} du fichier importé
                         (cle : son nom sur l'appareil, « plan.pdf#p2 » pour une page de PDF)
     plans/<u>/c/<id>.json   le contenu : {dessin, symb, echelle, calques, mep, vue, fond?, fondPdf?}
     plans/<u>/f/<id>        le fichier importé, tel quel (DWG, DXF, PDF, image)
   ===================================================================== */

const MAX_CONTENU = 24 * 1024 * 1024;      /* le dessin et les symboles, en texte (et le fond, avec son PDF) */
const MAX_FICHIER = 40 * 1024 * 1024;      /* le fichier importé */
const EXTS = ["dwg", "dxf", "pdf", "png", "jpg", "jpeg", "webp"];

const FILES = new Map();
function enFile(cle, fn) {
  const avant = FILES.get(cle) || Promise.resolve();
  const p = avant.then(fn, fn);
  FILES.set(cle, p.catch(() => {}));
  return p;
}
const idValide = (id) => /^[a-z0-9]{6,32}$/.test(String(id || ""));
const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const court = (t, n) => String(t || "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export function slugNom(n) {
  return String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sans-nom";
}
const baseDe = (u) => "plans/" + u + "/";

async function lireIndex(store, u) {
  try { const x = await store.get(baseDe(u) + "index.json", { type: "json" }); if (x && Array.isArray(x.plans)) return x; } catch { /* vide */ }
  return { plans: [] };
}
/* rapports.mjs : le plan existe-t-il, et le noter déposé dans un chantier */
export async function planDe(store, u, id) { const x = await lireIndex(store, u); return x.plans.find((p) => p.id === id) || null; }
export async function noterChantierPlan(store, societe, u, id, info) {
  return enFile(societe + "/" + u, async () => {
    const x = await lireIndex(store, u), e = x.plans.find((p) => p.id === id);
    if (!e) return false;
    e.chantier = info; await store.setJSON(baseDe(u) + "index.json", x);
    return true;
  });
}

export async function mesplans(action, o) {
  const { req, url, store, personne, json } = o;
  /* le plan d'un autre, ouvert depuis un chantier : rapports.mjs a vérifié l'accès */
  const u = o.proprio || slugNom(personne.nom), BASE = baseDe(u);
  const modifier = (fn) => enFile((personne.societe || "societe") + "/" + u, async () => { const x = await lireIndex(store, u); const r = await fn(x); return r; });
  const ecrire = (x) => store.setJSON(BASE + "index.json", x);

  /* ---------- la liste ---------- */
  if (action === "plans-liste") {
    let x = await lireIndex(store, u);
    /* le chantier d'où vient un plan (ouvert depuis ses documents) : lu une fois dans son contenu, puis gardé dans l'index */
    if (x.plans.some((p) => !p.origineLue)) {
      x = await modifier(async (y) => {
        for (const p of y.plans) {
          if (p.origineLue) continue;
          let ref = "";
          try { const c = await store.get(BASE + "c/" + p.id + ".json", { type: "json" }); ref = (c && c.dessin && c.dessin.chantierDoc && c.dessin.chantierDoc.ref) || ""; } catch { ref = ""; }
          if (!ref && p.source && /^[^/]{3,60}\//.test(String(p.source.cle || ""))) ref = String(p.source.cle).split("/")[0];
          if (ref) p.origine = { ref: court(ref, 60) };
          p.origineLue = true;
        }
        await ecrire(y);
        return y;
      });
    }
    return json({ plans: x.plans.slice().sort((a, b) => String(b.maj).localeCompare(String(a.maj))) });
  }

  /* ---------- un plan : sa fiche et son contenu ---------- */
  if (action === "plan-lire") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Plan introuvable." }, 404);
    const x = await lireIndex(store, u), e = x.plans.find((p) => p.id === id);
    if (!e) return json({ erreur: "Plan introuvable." }, 404);
    let c = null;
    try { c = await store.get(BASE + "c/" + id + ".json", { type: "json" }); } catch { c = null; }
    if (!c) return json({ erreur: "Le contenu de ce plan est introuvable." }, 404);
    return json({ plan: e, contenu: c });
  }

  /* ---------- le fichier importé ---------- */
  if (action === "plan-fichier") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Fichier introuvable." }, 404);
    const b = await store.get(BASE + "f/" + id, { type: "arrayBuffer" });
    if (!b) return json({ erreur: "Fichier introuvable." }, 404);
    return new Response(b, { headers: { "content-type": "application/octet-stream", "cache-control": "private, no-cache", "x-content-type-options": "nosniff" } });
  }

  /* ---------- enregistrer (le créer au besoin) ---------- */
  if (action === "plan-enregistrer") {
    let texte = "";
    try { texte = await req.text(); } catch { texte = ""; }
    if (texte.length > MAX_CONTENU) return json({ erreur: "Plan trop lourd pour être enregistré (24 Mo au plus, fond compris)." }, 413);
    let d = null;
    try { d = JSON.parse(texte); } catch { d = null; }
    if (!d || typeof d !== "object") return json({ erreur: "Requête illisible." }, 400);
    if (!d.dessin || typeof d.dessin !== "object" || !Array.isArray(d.symb)) return json({ erreur: "Plan illisible." }, 400);
    const type = d.type === "fichier" ? "fichier" : "vierge";
    let source = null;
    if (type === "fichier") {
      const s = d.source || {}, ext = String(s.ext || "").toLowerCase();
      if (EXTS.indexOf(ext) < 0) return json({ erreur: "Type de fichier non pris en charge." }, 400);
      const taille = Math.round(Number(s.taille));
      if (!(taille > 0 && taille <= MAX_FICHIER)) return json({ erreur: "Fichier trop lourd (40 Mo au plus)." }, 413);
      source = { nom: court(s.nom, 160) || ("plan." + ext), taille, ext, cle: court(s.cle, 240) || court(s.nom, 160), page: Math.max(0, Math.min(9999, Math.round(Number(s.page) || 0))) };
    }
    const id = d.id == null || d.id === "" ? nouvelId() : String(d.id);
    if (!idValide(id)) return json({ erreur: "Plan illisible." }, 400);
    if (o.proprio && id !== url.searchParams.get("id")) return json({ erreur: "Plan illisible." }, 400);
    const contenu = {
      dessin: d.dessin, symb: d.symb,
      echelle: d.echelle && typeof d.echelle === "object" ? { mm: Number(d.echelle.mm) || 1, src: court(d.echelle.src, 30) } : { mm: 1, src: "vierge" },
      calques: d.calques && typeof d.calques === "object" ? d.calques : {},
      mep: d.mep && typeof d.mep === "object" ? d.mep : null,
      vue: d.vue && typeof d.vue === "object" ? d.vue : null,
      /* le fond d'une page vierge (PDF ou photo du plan, en JPEG) */
      fond: typeof d.fond === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d.fond) ? d.fond : null,
      /* et, s'il vient d'un PDF, le PDF lui-même (redessiné net quand on zoome) */
      fondPdf: d.fondPdf && typeof d.fondPdf.data === "string" && /^data:application\/pdf;base64,/.test(d.fondPdf.data)
        ? { data: d.fondPdf.data, page: Math.max(1, Math.min(9999, Math.round(Number(d.fondPdf.page) || 1))) } : null
    };
    const quand = new Date().toISOString();
    return modifier(async (x) => {
      let e = x.plans.find((p) => p.id === id);
      if (!e) { if (o.proprio) return json({ erreur: "Plan introuvable." }, 404); e = { id, cree: quand, creePar: personne.nom }; x.plans.unshift(e); }
      Object.assign(e, { nom: court(d.nom, 120) || "Plan", type, maj: quand, auteur: personne.nom, taille: texte.length });
      const refDoc = d.dessin && d.dessin.chantierDoc && d.dessin.chantierDoc.ref;
      if (refDoc) e.origine = { ref: court(refDoc, 60) };
      e.origineLue = true;
      if (source) {
        /* un autre fichier qu'avant : l'ancien ne vaut plus */
        if (e.source && (e.source.taille !== source.taille || e.source.nom !== source.nom)) { e.fichier = false; try { await store.delete(BASE + "f/" + id); } catch { /* déjà parti */ } }
        e.source = source;
      } else { delete e.source; e.fichier = false; }
      await store.setJSON(BASE + "c/" + id + ".json", contenu);
      await ecrire(x);
      return json({ ok: true, plan: e, fichierManquant: type === "fichier" && !e.fichier });
    });
  }

  /* ---------- le fichier importé, envoyé une fois ---------- */
  if (action === "plan-fichier-envoyer") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Plan introuvable." }, 404);
    const lu = Buffer.from(await req.arrayBuffer());
    if (!lu.length) return json({ erreur: "Fichier vide." }, 400);
    if (lu.length > MAX_FICHIER) return json({ erreur: "Fichier trop lourd (40 Mo au plus)." }, 413);
    return modifier(async (x) => {
      const e = x.plans.find((p) => p.id === id);
      if (!e || e.type !== "fichier") return json({ erreur: "Plan introuvable." }, 404);
      if (e.source && e.source.taille !== lu.length) return json({ erreur: "Ce n'est pas le fichier de ce plan." }, 409);
      await store.set(BASE + "f/" + id, lu, { metadata: { type: "application/octet-stream" } });
      e.fichier = true;
      await ecrire(x);
      return json({ ok: true, plan: e });
    });
  }

  /* ---------- renommer, supprimer ---------- */
  let d = null;
  try { d = await req.json(); } catch { d = null; }
  if (!d || !idValide(d.id)) return json({ erreur: "Plan introuvable." }, 404);
  return modifier(async (x) => {
    const e = x.plans.find((p) => p.id === d.id);
    if (!e) return json({ erreur: "Plan introuvable." }, 404);
    if (action === "plan-renommer") {
      const nom = court(d.nom, 120);
      if (!nom) return json({ erreur: "Donnez un nom au plan." }, 400);
      e.nom = nom; await ecrire(x);
      return json({ ok: true, plan: e });
    }
    /* copier un plan déjà fait, pour en repartir : le dessin, les symboles, le fond et le fichier importé ;
       la copie n'est rattachée à aucun chantier */
    if (action === "plan-dupliquer") {
      let c = null;
      try { c = await store.get(BASE + "c/" + e.id + ".json", { type: "json" }); } catch { c = null; }
      if (!c) return json({ erreur: "Le contenu de ce plan est introuvable." }, 404);
      const id = nouvelId(), quand = new Date().toISOString();
      const copie = { id, nom: court(d.nom, 120) || court(e.nom + " (copie)", 120), type: e.type, maj: quand, auteur: personne.nom,
        cree: quand, creePar: personne.nom, taille: e.taille || 0 };
      if (e.source) copie.source = Object.assign({}, e.source);
      if (e.origine) copie.origine = Object.assign({}, e.origine);
      copie.origineLue = true;
      await store.setJSON(BASE + "c/" + id + ".json", c);
      if (e.type === "fichier" && e.fichier) {
        let b = null;
        try { b = await store.get(BASE + "f/" + e.id, { type: "arrayBuffer" }); } catch { b = null; }
        if (b) { await store.set(BASE + "f/" + id, Buffer.from(b), { metadata: { type: "application/octet-stream" } }); copie.fichier = true; }
        else copie.fichier = false;
      }
      x.plans.unshift(copie);
      await ecrire(x);
      return json({ ok: true, plan: copie });
    }
    if (action === "plan-supprimer") {
      try { await store.delete(BASE + "c/" + e.id + ".json"); } catch { /* déjà parti */ }
      try { await store.delete(BASE + "f/" + e.id); } catch { /* déjà parti */ }
      x.plans = x.plans.filter((p) => p !== e);
      await ecrire(x);
      return json({ ok: true });
    }
    return json({ erreur: "Action inconnue." }, 400);
  });
}
