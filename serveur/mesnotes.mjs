/* =====================================================================
   mesnotes.mjs — l'onglet « Notes » de la To-do list (mesnotes.html)
   ---------------------------------------------------------------------
   Des notes personnelles, comme l'app Notes d'Apple : du texte mis en
   forme, des cases à cocher, des photos et l'écriture au stylet par-dessus,
   sur un papier blanc, ligné ou quadrillé ; rangées dans des dossiers,
   épinglées, mises à la corbeille (30 jours). Chacun ne voit que les
   siennes. Une note se range dans le dossier d'un chantier quand on le
   décide (son PDF, sous « Notes ») : c'est rapports.mjs qui l'y pose,
   puis note ici où elle est.

   Une note verrouillée (option) : son contenu est chiffré sur l'appareil
   (AES-GCM, clé tirée du code de la personne) ; le site n'en garde que le
   chiffré, le titre restant lisible dans la liste. Le code n'est jamais
   envoyé : seuls son sel et un petit témoin chiffré sont gardés, pour
   vérifier le code sur l'appareil.

   Rangement, dans le magasin de la société, par personne (<u>) :
     mesnotes/<u>/index.json   {notes: [{id, titre, apercu, dossier, epingle,
                               papier, cree, maj, vignette, encre, photos,
                               chantier?, corbeille?}], dossiers: [{id, nom}]}
     mesnotes/<u>/n/<id>.json  le contenu : {id, html, encre: [traits], papier, maj}
                               ou, verrouillée, {id, chiffre: {iv, data}, papier, maj}
     (index.json porte aussi code: {sel, verif: {iv, data}} une fois le code choisi)
     mesnotes/<u>/p/<id>       une photo (JPEG ou PNG), telle qu'envoyée
   ===================================================================== */

const MAX_HTML = 600000;              /* le texte d'une note (sans les photos, gardées à part) */
const MAX_ENCRE = 2500000;          /* les traits, en texte */
const MAX_PHOTO = 8 * 1024 * 1024;
const JOURS_CORBEILLE = 30;
const PAPIERS = ["blanc", "ligné", "quadrillé"];

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
function dossierDe(u) { return "mesnotes/" + u + "/"; }
function slugNom(n) {
  return String(n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "sans-nom";
}
const b64Valide = (t, max) => typeof t === "string" && t.length > 0 && t.length <= max && /^[A-Za-z0-9+/=]+$/.test(t);
const chiffreValide = (c, max) => !!c && b64Valide(c.iv, 40) && b64Valide(c.data, max);
/* les photos citées par une note : <figure data-photo="…"> */
function photosDe(html) {
  const out = new Set(); const re = /data-photo="([a-z0-9]{6,32})"/g; let m;
  while ((m = re.exec(String(html || "")))) out.add(m[1]);
  return [...out];
}

export async function lireIndexNotes(store, u) {
  try { const x = await store.get(dossierDe(u) + "index.json", { type: "json" }); if (x && Array.isArray(x.notes)) { if (!Array.isArray(x.dossiers)) x.dossiers = []; return x; } } catch { /* vide */ }
  return { notes: [], dossiers: [] };
}
/* rapports.mjs, une fois le PDF posé dans le dossier du chantier */
export async function noterChantier(store, personne, id, info) {
  const u = slugNom(personne.nom);
  return enFile(personne.societe + "/" + u, async () => {
    const x = await lireIndexNotes(store, u);
    const e = x.notes.find((n) => n.id === id);
    if (!e) return false;
    e.chantier = info;
    await store.setJSON(dossierDe(u) + "index.json", x);
    return true;
  });
}

export async function mesnotes(action, o) {
  const { req, url, store, personne, json } = o;
  const u = slugNom(personne.nom), base = dossierDe(u);
  const lire = () => lireIndexNotes(store, u);
  const ecrire = (x) => store.setJSON(base + "index.json", x);
  const modifier = (fn) => enFile(personne.societe + "/" + u, async () => { const x = await lire(); const r = await fn(x); await ecrire(x); return r; });
  async function corps() { try { return await req.json(); } catch { return null; } }
  async function effacerNote(e) {
    let contenu = null;
    try { contenu = await store.get(base + "n/" + e.id + ".json", { type: "json" }); } catch { contenu = null; }
    const ph = new Set([...(e.photos || []), ...photosDe(contenu && contenu.html)]);
    for (const p of ph) { try { await store.delete(base + "p/" + p); } catch { /* déjà partie */ } }
    try { await store.delete(base + "n/" + e.id + ".json"); } catch { /* déjà parti */ }
  }
  async function purger(x) {
    const limite = Date.now() - JOURS_CORBEILLE * 864e5;
    const vieux = x.notes.filter((e) => e.corbeille && Date.parse(e.corbeille.le) < limite);
    if (!vieux.length) return false;
    for (const e of vieux) await effacerNote(e);
    x.notes = x.notes.filter((e) => vieux.indexOf(e) < 0);
    return true;
  }

  /* ---------- la liste : les notes (sans leur contenu) et les dossiers ---------- */
  if (action === "mesnotes-liste") {
    const x = await lire();
    if (await purger(x)) await enFile(personne.societe + "/" + u, () => ecrire(x));
    return json({ notes: x.notes, dossiers: x.dossiers, code: x.code || null });
  }

  /* ---------- le code des notes verrouillées : choisi une fois (son sel et un témoin chiffré) ---------- */
  if (action === "mesnotes-code") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    if (!b64Valide(d.sel, 64) || !chiffreValide(d.verif, 400)) return json({ erreur: "Code illisible." }, 400);
    return modifier(async (x) => {
      /* changer de code effacerait l'accès aux notes déjà verrouillées : refusé tant qu'il y en a */
      if (x.code && x.notes.some((n) => n.verrou)) return json({ erreur: "Un code existe déjà, et des notes l'utilisent : retirez d'abord leur verrou." }, 409);
      x.code = { sel: d.sel, verif: { iv: d.verif.iv, data: d.verif.data }, le: new Date().toISOString() };
      return json({ ok: true, code: x.code });
    });
  }

  /* ---------- une note : son contenu ---------- */
  if (action === "mesnote") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Note introuvable." }, 404);
    const x = await lire(), e = x.notes.find((n) => n.id === id);
    if (!e) return json({ erreur: "Note introuvable." }, 404);
    let c = null;
    try { c = await store.get(base + "n/" + id + ".json", { type: "json" }); } catch { c = null; }
    return json({ note: e, contenu: c || { id, html: "", encre: [], papier: e.papier || "ligné", maj: e.maj } });
  }

  /* ---------- une photo de note ---------- */
  if (action === "mesnote-photo-lire") {
    const id = url.searchParams.get("id") || "";
    if (!idValide(id)) return json({ erreur: "Photo introuvable." }, 404);
    const b = await store.get(base + "p/" + id, { type: "arrayBuffer" });
    if (!b) return json({ erreur: "Photo introuvable." }, 404);
    const debut = Buffer.from(b).subarray(0, 4).toString("hex");
    return new Response(b, { headers: { "content-type": debut.startsWith("89504e47") ? "image/png" : "image/jpeg",
      "cache-control": "private, max-age=2592000, immutable", "x-content-type-options": "nosniff" } });
  }
  if (action === "mesnote-photo") {
    const lu = Buffer.from(await req.arrayBuffer());
    if (!lu.length) return json({ erreur: "Photo vide." }, 400);
    if (lu.length > MAX_PHOTO) return json({ erreur: "Photo trop lourde (8 Mo au plus)." }, 413);
    const t = lu.subarray(0, 4).toString("hex");
    if (!t.startsWith("ffd8ff") && t !== "89504e47") return json({ erreur: "Ce n'est pas une photo (JPEG ou PNG)." }, 415);
    const id = nouvelId();
    await store.set(base + "p/" + id, lu, { metadata: { type: t === "89504e47" ? "image/png" : "image/jpeg" } });
    return json({ ok: true, id });
  }

  /* ---------- enregistrer une note (la créer au besoin) ---------- */
  if (action === "mesnote-enregistrer") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    if (!idValide(d.id)) return json({ erreur: "Note illisible." }, 400);
    const verrou = !!d.chiffre;
    if (verrou && !chiffreValide(d.chiffre, Math.round((MAX_HTML + MAX_ENCRE) * 1.4))) return json({ erreur: "Note verrouillée illisible." }, 400);
    const html = verrou ? "" : String(d.html || "");
    if (html.length > MAX_HTML) return json({ erreur: "Note trop longue : coupez-la en deux." }, 413);
    const encre = verrou ? [] : (Array.isArray(d.encre) ? d.encre : []);
    if (JSON.stringify(encre).length > MAX_ENCRE) return json({ erreur: "Trop d'écriture dans une seule note : commencez-en une autre." }, 413);
    const maj = /^\d{4}-\d\d-\d\dT/.test(String(d.maj || "")) ? String(d.maj) : new Date().toISOString();
    return modifier(async (x) => {
      let e = x.notes.find((n) => n.id === d.id);
      /* déjà plus récente ici (un autre appareil) : on garde celle-ci, l'appareil se met à jour */
      if (e && e.maj && e.maj > maj) {
        let c = null; try { c = await store.get(base + "n/" + e.id + ".json", { type: "json" }); } catch { c = null; }
        return json({ ok: false, plusRecente: true, note: e, contenu: c }, 409);
      }
      if (!e) { e = { id: d.id, cree: maj, dossier: "", epingle: false }; x.notes.unshift(e); }
      if (e.corbeille) delete e.corbeille;
      const papier = PAPIERS.indexOf(d.papier) >= 0 ? d.papier : (e.papier || "ligné");
      /* verrouillée : le site ne lit pas le contenu, l'appareil lui dit quelles photos il cite */
      const photos = verrou ? (Array.isArray(d.photos) ? d.photos.filter(idValide).slice(0, 200) : []) : photosDe(html);
      if (verrou && !x.code) return json({ erreur: "Choisissez d'abord le code des notes verrouillées." }, 400);
      Object.assign(e, {
        titre: court(d.titre, 120) || "Nouvelle note", apercu: verrou ? "" : court(d.apercu, 160), papier, maj,
        vignette: verrou ? "" : (photos[0] || (encre.length ? "encre" : "")), encre: !verrou && encre.length > 0, verrou,
        photos: [...new Set([...(e.photos || []), ...photos])].slice(-200)
      });
      if (d.dossier !== undefined) e.dossier = x.dossiers.some((f) => f.id === d.dossier) ? d.dossier : "";
      if (d.epingle !== undefined) e.epingle = d.epingle === true;
      await store.setJSON(base + "n/" + e.id + ".json", verrou ? { id: e.id, chiffre: { iv: d.chiffre.iv, data: d.chiffre.data }, papier, maj } : { id: e.id, html, encre, papier, maj });
      return json({ ok: true, note: e });
    });
  }

  /* ---------- les dossiers ---------- */
  if (action === "mesnotes-dossiers") {
    const d = await corps(); if (!d || !Array.isArray(d.dossiers)) return json({ erreur: "Requête illisible." }, 400);
    return modifier(async (x) => {
      const vus = new Set();
      x.dossiers = d.dossiers.slice(0, 60).map((f) => ({ id: idValide(f.id) ? f.id : nouvelId(), nom: court(f.nom, 50) }))
        .filter((f) => f.nom && !vus.has(f.nom.toLowerCase()) && vus.add(f.nom.toLowerCase()));
      const ids = new Set(x.dossiers.map((f) => f.id));
      x.notes.forEach((e) => { if (e.dossier && !ids.has(e.dossier)) e.dossier = ""; });
      return json({ ok: true, dossiers: x.dossiers, notes: x.notes });
    });
  }

  /* ---------- épingler, ranger, corbeille ---------- */
  const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
  if (!idValide(d.id)) return json({ erreur: "Note introuvable." }, 404);
  return modifier(async (x) => {
    const e = x.notes.find((n) => n.id === d.id);
    if (!e) return json({ erreur: "Note introuvable." }, 404);
    if (action === "mesnote-ranger") {
      if (d.epingle !== undefined) e.epingle = d.epingle === true;
      if (d.dossier !== undefined) e.dossier = x.dossiers.some((f) => f.id === d.dossier) ? d.dossier : "";
      return json({ ok: true, note: e });
    }
    if (action === "mesnote-supprimer") { e.corbeille = { le: new Date().toISOString() }; e.epingle = false; return json({ ok: true, note: e }); }
    if (action === "mesnote-restaurer") { delete e.corbeille; return json({ ok: true, note: e }); }
    if (action === "mesnote-effacer") {
      if (!e.corbeille) return json({ erreur: "Mettez-la d'abord dans « Supprimées récemment »." }, 400);
      await effacerNote(e);
      x.notes = x.notes.filter((n) => n !== e);
      return json({ ok: true });
    }
    return json({ erreur: "Action inconnue." }, 400);
  });
}
