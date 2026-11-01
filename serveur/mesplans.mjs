/* =====================================================================
   mesplans.mjs — les plans du module Plan (dwg.html), enregistrés sur le site
   ---------------------------------------------------------------------
   Un plan commencé (page vierge, ou DWG / DXF / PDF / image importé, avec
   ce qu'on y a dessiné et posé) s'enregistre ici : on le rouvre plus tard,
   sur n'importe quel appareil, pour le reprendre. Les plans sont ceux de
   la société : chacun les voit et les reprend.

   Rangement, dans le magasin de la société :
     plans/index.json    {plans: [{id, nom, type, source?, maj, auteur, cree, creePar, taille}]}
                         type « vierge » (dessiné de zéro) ou « fichier » (importé) ;
                         source : {nom, taille, ext, cle, page} du fichier importé
                         (cle : son nom sur l'appareil, « plan.pdf#p2 » pour une page de PDF)
     plans/c/<id>.json   le contenu : {dessin, symb, echelle, calques, mep, vue, fond?}
     plans/f/<id>        le fichier importé, tel quel (DWG, DXF, PDF, image)
   ===================================================================== */

const MAX_CONTENU = 12 * 1024 * 1024;      /* le dessin et les symboles, en texte */
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
const BASE = "plans/";

async function lireIndex(store) {
  try { const x = await store.get(BASE + "index.json", { type: "json" }); if (x && Array.isArray(x.plans)) return x; } catch { /* vide */ }
  return { plans: [] };
}

export async function mesplans(action, o) {
  const { req, url, store, personne, json } = o;
  const modifier = (fn) => enFile(personne.societe || "societe", async () => { const x = await lireIndex(store); const r = await fn(x); return r; });
  const ecrire = (x) => store.setJSON(BASE + "index.json", x);

  /* ---------- la liste ---------- */
  if (action === "plans-liste") {
    const x = await lireIndex(store);
    return json({ plans: x.plans.slice().sort((a, b) => String(b.maj).localeCompare(String(a.maj))) });
  }

  /* ---------- un plan : sa fiche et son contenu ---------- */
  if (action === "plan-lire") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Plan introuvable." }, 404);
    const x = await lireIndex(store), e = x.plans.find((p) => p.id === id);
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
    if (texte.length > MAX_CONTENU) return json({ erreur: "Plan trop lourd pour être enregistré (12 Mo de dessin au plus)." }, 413);
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
    const contenu = {
      dessin: d.dessin, symb: d.symb,
      echelle: d.echelle && typeof d.echelle === "object" ? { mm: Number(d.echelle.mm) || 1, src: court(d.echelle.src, 30) } : { mm: 1, src: "vierge" },
      calques: d.calques && typeof d.calques === "object" ? d.calques : {},
      mep: d.mep && typeof d.mep === "object" ? d.mep : null,
      vue: d.vue && typeof d.vue === "object" ? d.vue : null,
      /* le fond d'une page vierge (PDF ou photo du plan, en JPEG) */
      fond: typeof d.fond === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d.fond) ? d.fond : null
    };
    const quand = new Date().toISOString();
    return modifier(async (x) => {
      let e = x.plans.find((p) => p.id === id);
      if (!e) { e = { id, cree: quand, creePar: personne.nom }; x.plans.unshift(e); }
      Object.assign(e, { nom: court(d.nom, 120) || "Plan", type, maj: quand, auteur: personne.nom, taille: texte.length });
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
