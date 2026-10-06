/* =====================================================================
   cloud.mjs — le Cloud : un espace de rangement, comme iCloud Drive
   ---------------------------------------------------------------------
   Chacun a le sien : des dossiers, des fichiers (photos, PDF, plans,
   tout et n'importe quoi), des notes de texte, des croquis. On y dépose
   depuis le téléphone, on reprend depuis l'ordinateur.
   Un dossier se partage avec des collègues (ou pas) : ils le voient,
   y ajoutent, renomment, rangent, comme dans un dossier partagé
   OneDrive. Seul celui à qui appartient le dossier partagé choisit
   avec qui il l'est, et seul lui le supprime.

   Rangement, dans le magasin de la société :
     cloud/index.json      les éléments : {id, type: dossier|fichier|note,
                           nom, parent, proprio, partage[], taille, mime,
                           cree, maj, par, corbeille?}
     cloud/f/<id>          le contenu d'un fichier ou d'une note
     cloud/m/<id>          sa vignette (images), faite par le téléphone

   Supprimer met à la corbeille (30 jours), d'où l'on restaure.
   ===================================================================== */

const INDEX = "cloud/index.json";
const MAX_FICHIER = 25 * 1024 * 1024;     /* 25 Mo par fichier */
const MAX_MINI = 400 * 1024;
const MAX_NOTE = 200000;
const JOURS_CORBEILLE = 30;
const EXT_TYPE = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", md: "text/plain; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  dwg: "application/acad", dxf: "application/dxf", zip: "application/zip", mp4: "video/mp4", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4"
};
/* ce qu'on montre dans un onglet sans risque ; le reste se télécharge */
const AFFICHABLES = /^(application\/pdf|image\/(jpeg|png|webp|gif)|text\/plain|video\/(mp4|quicktime)|audio\/(mpeg|mp4))/;

/* une écriture de l'index à la fois, par société : deux envois en même temps ne s'effacent pas */
const FILES = new Map();
function enFile(cle, fn) {
  const avant = FILES.get(cle) || Promise.resolve();
  const p = avant.then(fn, fn);
  FILES.set(cle, p.catch(() => {}));
  return p;
}

function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function idValide(id) { return /^[a-z0-9]{6,30}$/.test(String(id || "")); }
function nomPropre(t, n) {
  return String(t || "").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 120);
}
function extDe(nom) { const m = /\.([a-z0-9]{1,5})$/i.exec(nom || ""); return m ? m[1].toLowerCase() : ""; }

export async function cloud(action, o) {
  const { req, url, store, personne, json, lireComptes, notifier, zipFlux } = o;
  const moi = personne.nom;
  const admin = personne.role === "admin" || !!personne.proprietaire;

  async function lire() {
    try { const x = await store.get(INDEX, { type: "json" }); if (x && Array.isArray(x.elements)) return x; } catch { /* vide */ }
    return { elements: [] };
  }
  const ecrire = (x) => store.setJSON(INDEX, x);
  /* tout changement passe par ici : lu, modifié, écrit, sans se croiser */
  const modifier = (fn) => enFile(personne.societe, async () => { const x = await lire(); const r = await fn(x); await ecrire(x); return r; });

  function parId(x) { const m = new Map(); x.elements.forEach((e) => m.set(e.id, e)); return m; }
  /* la chaîne des dossiers, de l'élément à la racine */
  function chaine(e, m) { const out = []; let c = e, k = 0; while (c && k++ < 60) { out.push(c); c = c.parent ? m.get(c.parent) : null; } return out; }
  /* qui y a accès : le propriétaire de la racine, et ceux avec qui un dossier de la chaîne est partagé */
  function acces(e, m) {
    const ch = chaine(e, m), racine = ch[ch.length - 1];
    if (racine.proprio === moi) return "proprio";
    if (ch.some((d) => d.type === "dossier" && (d.partage || []).indexOf(moi) >= 0)) return "partage";
    return "";
  }
  function enCorbeille(e, m) { return chaine(e, m).some((d) => d.corbeille); }
  /* la liste des personnes avec qui l'élément est partagé (héritée des dossiers parents) */
  function partageDe(e, m) {
    const s = new Set(); let proprio = "";
    chaine(e, m).forEach((d) => { (d.type === "dossier" ? d.partage || [] : []).forEach((n) => s.add(n)); proprio = d.proprio; });
    s.add(proprio); return [...s];
  }
  function vue(e, m) {
    const v = { id: e.id, type: e.type, nom: e.nom, parent: e.parent || null, proprio: e.proprio, par: e.par || e.proprio,
      taille: e.taille || 0, mime: e.mime || "", cree: e.cree, maj: e.maj, mini: !!e.mini };
    if (e.type === "dossier") {
      v.partage = e.partage || [];
      v.nb = m ? [...m.values()].filter((x) => x.parent === e.id && !x.corbeille).length : 0;
    }
    if (m) { v.acces = acces(e, m); v.avec = partageDe(e, m).filter((n) => n !== moi); }
    if (e.corbeille) v.corbeille = e.corbeille;
    return v;
  }
  async function corps() { try { return await req.json(); } catch { return null; } }
  async function personnes() { return (await lireComptes()).filter((c) => c.nom).map((c) => ({ nom: c.nom, role: c.role || "" })); }
  function nomLibre(x, parent, nom, sauf) {
    const pris = new Set(x.elements.filter((e) => (e.parent || null) === (parent || null) && !e.corbeille && e.id !== sauf).map((e) => e.nom.toLowerCase()));
    if (!pris.has(nom.toLowerCase())) return nom;
    const m = /^(.*?)(\.[a-z0-9]{1,5})?$/i.exec(nom); let k = 2, n;
    do { n = m[1] + " (" + (k++) + ")" + (m[2] || ""); } while (pris.has(n.toLowerCase()));
    return n;
  }
  /* un dossier où l'on peut ranger (ou la racine, null) */
  function dossierCible(x, m, id) {
    if (!id) return { ok: true, id: null };
    const d = m.get(id);
    if (!d || d.type !== "dossier" || enCorbeille(d, m)) return { ok: false, err: json({ erreur: "Dossier introuvable." }, 404) };
    if (!acces(d, m)) return { ok: false, err: json({ erreur: "Ce dossier ne vous est pas partagé." }, 403) };
    return { ok: true, id: d.id };
  }
  /* la corbeille se vide seule au bout de 30 jours */
  async function purger(x) {
    const limite = Date.now() - JOURS_CORBEILLE * 864e5;
    const vieux = x.elements.filter((e) => e.corbeille && new Date(e.corbeille.le).getTime() < limite);
    if (!vieux.length) return false;
    const m = parId(x), partent = new Set();
    vieux.forEach((v) => { x.elements.forEach((e) => { if (chaine(e, m).indexOf(v) >= 0) partent.add(e); }); });
    for (const e of partent) { await effacerContenu(e); }
    x.elements = x.elements.filter((e) => !partent.has(e));
    return true;
  }
  async function effacerContenu(e) {
    if (e.type === "dossier") return;
    try { await store.delete("cloud/f/" + e.id); } catch { /* déjà parti */ }
    if (e.mini) { try { await store.delete("cloud/m/" + e.id); } catch { /* déjà parti */ } }
  }

  /* ---------- lister un dossier (ou la racine : mes éléments et ce qu'on me partage) ---------- */
  if (action === "cloud-liste") {
    const x = await lire();
    if (await purger(x)) await enFile(personne.societe, () => ecrire(x));
    const m = parId(x);
    const id = url.searchParams.get("dossier") || "";
    const vues = url.searchParams.get("vue") || "";
    let elements, chemin = [], dossier = null;
    if (vues === "corbeille") {
      /* ce que j'ai jeté (ou jeté dans mes dossiers), pas ce qui est dedans */
      elements = x.elements.filter((e) => e.corbeille && acces(e, m) && !(e.parent && m.get(e.parent) && enCorbeille(m.get(e.parent), m)));
    } else if (vues === "recents") {
      elements = x.elements.filter((e) => e.type !== "dossier" && !enCorbeille(e, m) && acces(e, m))
        .sort((a, b) => String(b.maj).localeCompare(String(a.maj))).slice(0, 60);
    } else if (vues === "partages") {
      elements = x.elements.filter((e) => e.type === "dossier" && !enCorbeille(e, m) && (e.partage || []).length
        && (e.proprio === moi || (e.partage || []).indexOf(moi) >= 0)
        && !(e.parent && m.get(e.parent) && acces(m.get(e.parent), m) === "partage"));
    } else if (id) {
      const d = m.get(id);
      if (!idValide(id) || !d || d.type !== "dossier" || enCorbeille(d, m)) return json({ erreur: "Dossier introuvable." }, 404);
      if (!acces(d, m)) return json({ erreur: "Ce dossier ne vous est pas partagé." }, 403);
      dossier = vue(d, m);
      chemin = chaine(d, m).reverse().filter((c) => acces(c, m)).map((c) => ({ id: c.id, nom: c.nom }));
      elements = x.elements.filter((e) => e.parent === id && !e.corbeille);
    } else {
      /* la racine : les miens, et les dossiers partagés avec moi dont je ne vois pas déjà le parent */
      elements = x.elements.filter((e) => !e.corbeille && (
        (!e.parent && e.proprio === moi) ||
        (e.type === "dossier" && (e.partage || []).indexOf(moi) >= 0 && !(e.parent && m.get(e.parent) && acces(m.get(e.parent), m)))));
    }
    const miens = x.elements.filter((e) => e.type !== "dossier" && e.proprio === moi && !e.corbeille);
    return json({ moi, dossier, chemin, elements: elements.map((e) => vue(e, m)),
      utilise: miens.reduce((s, e) => s + (e.taille || 0), 0), personnes: await personnes() });
  }

  /* ---------- créer un dossier ---------- */
  if (action === "cloud-dossier") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    const nom = nomPropre(d.nom, 80);
    if (!nom) return json({ erreur: "Donnez un nom au dossier." }, 400);
    return modifier(async (x) => {
      const m = parId(x), c = dossierCible(x, m, d.parent);
      if (!c.ok) return c.err;
      const quand = new Date().toISOString();
      const e = { id: nouvelId(), type: "dossier", nom: nomLibre(x, c.id, nom), parent: c.id, proprio: c.id ? m.get(c.id).proprio : moi, par: moi, partage: [], cree: quand, maj: quand };
      x.elements.push(e);
      return json({ ok: true, element: vue(e, parId(x)) });
    });
  }

  /* ---------- déposer un fichier (le corps de la requête, tel quel) ---------- */
  if (action === "cloud-envoyer") {
    const parent = url.searchParams.get("dossier") || "";
    let nom = nomPropre(url.searchParams.get("nom"), 140) || "fichier";
    const lu = Buffer.from(await req.arrayBuffer());
    if (!lu.length) return json({ erreur: "Fichier vide." }, 400);
    if (lu.length > MAX_FICHIER) return json({ erreur: "Fichier trop lourd : 25 Mo au plus." }, 413);
    const ext = extDe(nom);
    const mime = EXT_TYPE[ext] || "application/octet-stream";
    return modifier(async (x) => {
      const m = parId(x), c = dossierCible(x, m, parent);
      if (!c.ok) return c.err;
      const quand = new Date().toISOString();
      const e = { id: nouvelId(), type: "fichier", nom: nomLibre(x, c.id, nom), parent: c.id, proprio: c.id ? m.get(c.id).proprio : moi, par: moi,
        taille: lu.length, mime, cree: quand, maj: quand };
      await store.set("cloud/f/" + e.id, lu, { metadata: { type: mime } });
      x.elements.push(e);
      prevenirPartage(c.id, m, e);
      return json({ ok: true, element: vue(e, parId(x)) });
    });
  }
  /* la vignette d'une image, faite par le téléphone (JPEG) */
  if (action === "cloud-mini") {
    const id = url.searchParams.get("id") || "";
    const lu = Buffer.from(await req.arrayBuffer());
    if (!lu.length || lu.length > MAX_MINI || lu.subarray(0, 3).toString("hex") !== "ffd8ff") return json({ erreur: "Vignette refusée." }, 400);
    return modifier(async (x) => {
      const m = parId(x), e = m.get(id);
      if (!e || e.type !== "fichier" || !acces(e, m)) return json({ erreur: "Fichier introuvable." }, 404);
      await store.set("cloud/m/" + id, lu, { metadata: { type: "image/jpeg" } });
      e.mini = true;
      return json({ ok: true });
    });
  }

  /* ---------- une note de texte : créer, réécrire ---------- */
  if (action === "cloud-note") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    const texte = String(d.texte || "").replace(/\r\n?/g, "\n");
    if (texte.length > MAX_NOTE) return json({ erreur: "Note trop longue." }, 400);
    let nom = nomPropre(String(d.nom || "").replace(/\s*:\s*/g, " - "), 120) || nomPropre((texte.trim().split("\n")[0] || "Note").replace(/\s*:\s*/g, " - ").slice(0, 60), 60) || "Note";
    if (!/\.txt$/i.test(nom)) nom += ".txt";
    return modifier(async (x) => {
      const m = parId(x), quand = new Date().toISOString();
      let e;
      if (d.id) {
        e = m.get(d.id);
        if (!e || e.type !== "note" || enCorbeille(e, m) || !acces(e, m)) return json({ erreur: "Note introuvable." }, 404);
        if (d.nom) e.nom = nomLibre(x, e.parent, nom, e.id);
        e.maj = quand; e.par = moi;
      } else {
        const c = dossierCible(x, m, d.parent);
        if (!c.ok) return c.err;
        e = { id: nouvelId(), type: "note", nom: nomLibre(x, c.id, nom), parent: c.id, proprio: c.id ? m.get(c.id).proprio : moi, par: moi, cree: quand, maj: quand };
        x.elements.push(e);
        prevenirPartage(c.id, m, e);
      }
      const b = Buffer.from(texte, "utf8");
      e.taille = b.length; e.mime = "text/plain; charset=utf-8";
      await store.set("cloud/f/" + e.id, b, { metadata: { type: e.mime } });
      return json({ ok: true, element: vue(e, parId(x)) });
    });
  }

  /* ---------- lire un fichier, sa vignette, une note ---------- */
  if (action === "cloud-fichier" || action === "cloud-vignette") {
    const id = url.searchParams.get("id") || "";
    const x = await lire(), m = parId(x), e = m.get(id);
    if (!idValide(id) || !e || e.type === "dossier" || !acces(e, m)) return json({ erreur: "Fichier introuvable." }, 404);
    if (action === "cloud-vignette") {
      if (!e.mini) return json({ erreur: "Pas de vignette." }, 404);
      const v = await store.get("cloud/m/" + id, { type: "arrayBuffer" });
      if (!v) return json({ erreur: "Pas de vignette." }, 404);
      return new Response(v, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=604800", "x-content-type-options": "nosniff" } });
    }
    const brut = await store.get("cloud/f/" + id, { type: "arrayBuffer" });
    if (!brut) return json({ erreur: "Fichier introuvable." }, 404);
    const type = e.mime || "application/octet-stream";
    const voir = AFFICHABLES.test(type) && url.searchParams.get("telecharger") !== "1";
    const nom = e.nom || "fichier";
    return new Response(brut, { headers: {
      "content-type": type,
      "content-disposition": (voir ? "inline" : "attachment") + "; filename=\"" + nom.replace(/["\\]/g, "_").replace(/[^\x20-\x7e]/g, "_") + "\"; filename*=UTF-8''" + encodeURIComponent(nom),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, no-cache"
    } });
  }

  /* ---------- un dossier entier, en ZIP ---------- */
  if (action === "cloud-zip") {
    const id = url.searchParams.get("id") || "";
    const x = await lire(), m = parId(x), d = m.get(id);
    if (!idValide(id) || !d || d.type !== "dossier" || enCorbeille(d, m) || !acces(d, m)) return json({ erreur: "Dossier introuvable." }, 404);
    const entrees = [];
    (function marcher(dos, chemin) {
      x.elements.filter((e) => e.parent === dos.id && !e.corbeille).sort((a, b) => a.nom.localeCompare(b.nom)).forEach((e) => {
        if (e.type === "dossier") marcher(e, chemin + e.nom + "/");
        else entrees.push({ nom: chemin + e.nom, quand: e.maj, lire: async () => { const b = await store.get("cloud/f/" + e.id, { type: "arrayBuffer" }); return b ? Buffer.from(b) : null; } });
      });
    })(d, d.nom + "/");
    const nomZip = d.nom.replace(/[^A-Za-z0-9 _.-]+/g, "_") + ".zip";
    return new Response(zipFlux(entrees), { status: 200, headers: {
      "content-type": "application/zip", "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"" + nomZip + "\"; filename*=UTF-8''" + encodeURIComponent(d.nom + ".zip")
    } });
  }

  /* ---------- renommer, déplacer, partager, jeter, restaurer, effacer ---------- */
  const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
  if (!idValide(d.id)) return json({ erreur: "Élément introuvable." }, 404);
  return modifier(async (x) => {
    const m = parId(x), e = m.get(d.id);
    if (!e || !acces(e, m)) return json({ erreur: "Élément introuvable." }, 404);
    const quand = new Date().toISOString();

    if (action === "cloud-renommer") {
      if (enCorbeille(e, m)) return json({ erreur: "Restaurez-le d'abord." }, 400);
      let nom = nomPropre(d.nom, 140);
      if (!nom) return json({ erreur: "Donnez un nom." }, 400);
      if (e.type === "note" && !/\.txt$/i.test(nom)) nom += ".txt";
      if (e.type === "fichier" && extDe(e.nom) && !extDe(nom)) nom += "." + extDe(e.nom);
      e.nom = nomLibre(x, e.parent, nom, e.id); e.maj = quand; e.par = moi;
      if (e.type === "fichier") e.mime = EXT_TYPE[extDe(e.nom)] || "application/octet-stream";
      return json({ ok: true, element: vue(e, m) });
    }

    if (action === "cloud-deplacer") {
      if (enCorbeille(e, m)) return json({ erreur: "Restaurez-le d'abord." }, 400);
      const c = dossierCible(x, m, d.vers);
      if (!c.ok) return c.err;
      /* un dossier partagé avec moi n'est pas à moi : il reste chez son propriétaire */
      if (e.type === "dossier" && e.proprio !== moi && (e.partage || []).indexOf(moi) >= 0 && acces(e, m) === "partage" && !c.id) return json({ erreur: "Ce dossier est à " + e.proprio + " : il ne peut pas aller dans votre Cloud." }, 403);
      if (c.id && (c.id === e.id || chaine(m.get(c.id), m).indexOf(e) >= 0)) return json({ erreur: "Un dossier ne va pas dans lui-même." }, 400);
      e.parent = c.id; e.nom = nomLibre(x, c.id, e.nom, e.id); e.maj = quand; e.par = moi;
      /* il appartient maintenant à celui du dossier où il arrive (ou à moi, à la racine) */
      const nouveau = c.id ? m.get(c.id).proprio : moi;
      x.elements.forEach((y) => { if (chaine(y, m).indexOf(e) >= 0) y.proprio = nouveau; });
      return json({ ok: true, element: vue(e, m) });
    }

    if (action === "cloud-partager") {
      if (e.type !== "dossier") return json({ erreur: "On partage un dossier : rangez-y le fichier." }, 400);
      if (e.proprio !== moi && !admin) return json({ erreur: "Seul " + e.proprio + " choisit avec qui ce dossier est partagé." }, 403);
      const connus = new Set((await personnes()).map((p) => p.nom));
      const avant = new Set(e.partage || []);
      e.partage = [...new Set((Array.isArray(d.avec) ? d.avec : []).map((n) => String(n || "").trim()).filter((n) => connus.has(n) && n !== e.proprio))];
      e.maj = quand;
      const nouveaux = e.partage.filter((n) => !avant.has(n));
      if (nouveaux.length) notifier(nouveaux, { titre: "Cloud — " + e.nom, texte: moi + " partage le dossier « " + e.nom + " » avec vous.", url: "./cloud.html?dossier=" + e.id, tag: "cloud-" + e.id });
      return json({ ok: true, element: vue(e, m) });
    }

    if (action === "cloud-supprimer") {
      if (e.corbeille) return json({ ok: true });
      /* un dossier partagé avec moi n'est pas à moi : je ne le jette pas, je peux seulement m'en retirer */
      if (e.type === "dossier" && (e.partage || []).indexOf(moi) >= 0 && e.proprio !== moi && !admin) return json({ erreur: "Ce dossier est à " + e.proprio + " : demandez-lui, ou retirez-vous du partage." }, 403);
      e.corbeille = { le: quand, par: moi };
      return json({ ok: true });
    }
    if (action === "cloud-quitter") {
      if (e.type !== "dossier" || (e.partage || []).indexOf(moi) < 0) return json({ erreur: "Ce dossier ne vous est pas partagé." }, 400);
      e.partage = e.partage.filter((n) => n !== moi);
      return json({ ok: true });
    }
    if (action === "cloud-restaurer") {
      if (!e.corbeille) return json({ ok: true, element: vue(e, m) });
      delete e.corbeille;
      /* son dossier d'origine n'existe plus : il revient à la racine de son propriétaire */
      if (e.parent && (!m.get(e.parent) || enCorbeille(m.get(e.parent), m))) { e.parent = null; }
      e.nom = nomLibre(x, e.parent, e.nom, e.id);
      return json({ ok: true, element: vue(e, m) });
    }
    if (action === "cloud-effacer") {
      if (!e.corbeille) return json({ erreur: "Mettez-le d'abord à la corbeille." }, 400);
      const partent = x.elements.filter((y) => chaine(y, m).indexOf(e) >= 0);
      for (const y of partent) await effacerContenu(y);
      x.elements = x.elements.filter((y) => partent.indexOf(y) < 0);
      return json({ ok: true, effaces: partent.length });
    }
    return json({ erreur: "Action inconnue." }, 400);
  });

  /* les membres d'un dossier partagé sont prévenus de ce qui y arrive (sans attendre) */
  function prevenirPartage(parentId, m, e) {
    if (!parentId) return;
    const p = m.get(parentId); if (!p) return;
    const avec = partageDe(p, m).filter((n) => n !== moi);
    if (!avec.length) return;
    notifier(avec, { titre: "Cloud — " + p.nom, texte: moi + " a ajouté « " + e.nom + " ».", url: "./cloud.html?dossier=" + p.id, tag: "cloud-" + p.id });
  }
}
