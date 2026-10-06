/* =====================================================================
   discussions.mjs — les discussions de l'équipe
   ---------------------------------------------------------------------
   Des fils de discussion propres à la société, hors des chantiers : un
   nom (« Pôle électricité », « Johan et Sophie »…), des membres choisis
   parmi les comptes (chargés d'affaires, techniciens, administrateurs),
   et des messages : du texte, une photo, un croquis ou un fichier.

   Rangement, dans le magasin de la société :
     discussions/liste.json         les fils (nom, membres, dernier message)
     discussions/fils/<id>.json     les messages et qui a lu jusqu'où
     discussions/pieces/<id>/<m>.x  les photos, croquis et fichiers

   Seuls les membres d'un fil le voient, le lisent, y écrivent. Qui l'a
   créé (ou un administrateur) peut le renommer, retirer quelqu'un, le
   supprimer ; chacun peut ajouter un collègue ou quitter le fil.
   ===================================================================== */

const LISTE = "discussions/liste.json";
const MAX_MESSAGES = 1000;
const MAX_PIECE = 10 * 1024 * 1024;           /* 10 Mo par fichier */
const MAX_TEXTE = 4000;
const TYPES_IMAGE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const EXT_TYPE = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  dwg: "application/acad", dxf: "application/dxf", zip: "application/zip", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime"
};
/* ce qu'un navigateur peut montrer sans risque dans un onglet ; le reste se télécharge */
const AFFICHABLES = /^(application\/pdf|image\/(jpeg|png|webp)|text\/plain|video\/(mp4|quicktime))/;

function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function idValide(id) { return /^[a-z0-9]{6,30}$/.test(String(id || "")); }
function propre(t, n) { return String(t || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n); }
function nomFichier(t) {
  const n = String(t || "fichier").normalize("NFC").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return n || "fichier";
}
function extDe(nom) { const m = /\.([a-z0-9]{1,5})$/i.exec(nom || ""); return m ? m[1].toLowerCase() : ""; }
function apercu(m) {
  if (m.supprime) return "Message supprimé";
  if (m.texte) return m.texte.slice(0, 140);
  const p = m.piece || {};
  return p.genre === "photo" ? "Photo" : p.genre === "croquis" ? "Croquis" : p.genre === "fichier" ? "Fichier : " + (p.nom || "") : "";
}

export async function discussions(action, o) {
  const { req, url, store, personne, json, lireComptes, notifier } = o;
  const admin = personne.role === "admin" || !!personne.proprietaire;
  const moi = personne.nom;

  async function lireListe() {
    try { const l = await store.get(LISTE, { type: "json" }); if (l && Array.isArray(l.fils)) return l; } catch { /* vide */ }
    return { fils: [] };
  }
  async function lireFil(id) {
    try { const f = await store.get("discussions/fils/" + id + ".json", { type: "json" }); if (f && Array.isArray(f.messages)) return f; } catch { /* vide */ }
    return { messages: [], lectures: {} };
  }
  const ecrireFil = (id, f) => store.setJSON("discussions/fils/" + id + ".json", f);
  const membre = (fil) => fil.membres.indexOf(moi) >= 0;
  const peutGerer = (fil) => fil.cree.par === moi || admin;
  function nonLus(fil, f) {
    const vu = (f.lectures || {})[moi] || "";
    let n = 0;
    for (let i = f.messages.length - 1; i >= 0; i--) {
      const m = f.messages[i];
      if (m.id === vu) break;
      if (m.auteur !== moi && !m.supprime) n++;
    }
    return n;
  }
  /* les noms des comptes de la société : seuls eux peuvent être membres */
  async function personnes() {
    const comptes = await lireComptes(personne.societe);
    return { comptes, liste: comptes.filter((c) => c.nom).map((c) => ({ nom: c.nom, role: c.role || "" })) };
  }
  function filtrerMembres(noms, connus) {
    const ok = new Set(connus.map((p) => p.nom));
    return [...new Set((Array.isArray(noms) ? noms : []).map((n) => String(n || "").trim()).filter((n) => ok.has(n)))];
  }
  async function corps() { try { return await req.json(); } catch { return null; } }
  const vueFil = (fil, n) => ({ id: fil.id, nom: fil.nom, membres: fil.membres, cree: fil.cree, maj: fil.maj, dernier: fil.dernier || null,
    nonLus: n || 0, gerer: peutGerer(fil) });

  /* ---------- mes discussions ---------- */
  if (action === "discu-liste" || action === "discu-non-lus") {
    const l = await lireListe();
    const miens = l.fils.filter(membre).sort((a, b) => String(b.maj || "").localeCompare(String(a.maj || "")));
    const vues = [];
    for (const fil of miens) vues.push(vueFil(fil, nonLus(fil, await lireFil(fil.id))));
    const total = vues.reduce((s, v) => s + v.nonLus, 0);
    if (action === "discu-non-lus") return json({ total, fils: vues.filter((v) => v.nonLus).map((v) => ({ id: v.id, nom: v.nom, nb: v.nonLus, dernier: v.dernier })) });
    return json({ moi, fils: vues, total, personnes: (await personnes()).liste });
  }

  /* ---------- créer une discussion ---------- */
  if (action === "discu-creer") {
    const d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400);
    const nom = propre(d.nom, 80);
    const { liste } = await personnes();
    const membres = filtrerMembres([moi].concat(d.membres || []), liste);
    if (membres.indexOf(moi) < 0) membres.unshift(moi);
    if (membres.length < 2) return json({ erreur: "Ajoutez au moins une autre personne." }, 400);
    const autres = membres.filter((n) => n !== moi);
    const fil = { id: nouvelId(), nom: nom || autres.join(", ").slice(0, 80), membres, cree: { par: moi, le: new Date().toISOString() },
      maj: new Date().toISOString(), dernier: null };
    const l = await lireListe();
    l.fils.push(fil);
    await store.setJSON(LISTE, l);
    await ecrireFil(fil.id, { messages: [], lectures: {} });
    notifier(autres, { titre: "Nouvelle discussion — " + fil.nom, texte: moi + " vous a ajouté à la discussion.", url: "./discussions.html?id=" + fil.id, tag: "fil-" + fil.id });
    return json({ ok: true, fil: vueFil(fil, 0) });
  }

  /* tout le reste porte sur un fil dont on est membre */
  let d = null;
  if (req.method === "POST") { d = await corps(); if (!d) return json({ erreur: "Requête illisible." }, 400); }
  const id = String((d && d.id) || url.searchParams.get("id") || "");
  if (!idValide(id)) return json({ erreur: "Discussion introuvable." }, 404);
  const l = await lireListe();
  const fil = l.fils.find((x) => x.id === id);
  if (!fil) return json({ erreur: "Cette discussion n'existe plus." }, 404);
  if (!membre(fil)) return json({ erreur: "Vous ne faites pas partie de cette discussion." }, 403);

  /* ---------- lire (et noter qu'on a lu) ---------- */
  if (action === "discu-lire") {
    const f = await lireFil(id);
    const dernier = f.messages.length ? f.messages[f.messages.length - 1].id : "";
    if (dernier && f.lectures[moi] !== dernier) { f.lectures[moi] = dernier; await ecrireFil(id, f); }
    const depuis = url.searchParams.get("depuis") || "";
    let messages = f.messages;
    if (depuis) { const i = messages.findIndex((m) => m.id === depuis); if (i >= 0) messages = messages.slice(i + 1); }
    return json({ fil: vueFil(fil, 0), messages, lectures: f.lectures, complet: !depuis, personnes: (await personnes()).liste });
  }

  /* ---------- une pièce jointe (photo, croquis, fichier) ---------- */
  if (action === "discu-piece") {
    const mid = url.searchParams.get("m") || "";
    const f = await lireFil(id);
    const m = f.messages.find((x) => x.id === mid);
    if (!m || !m.piece || m.supprime) return json({ erreur: "Pièce introuvable." }, 404);
    const brut = await store.get(m.piece.cle, { type: "arrayBuffer" });
    if (!brut) return json({ erreur: "Pièce introuvable." }, 404);
    const type = m.piece.type || "application/octet-stream";
    const voir = AFFICHABLES.test(type) && url.searchParams.get("telecharger") !== "1";
    const nom = m.piece.nom || "fichier";
    return new Response(brut, { headers: {
      "content-type": type,
      "content-disposition": (voir ? "inline" : "attachment") + "; filename=\"" + nom.replace(/["\\]/g, "_").replace(/[^\x20-\x7e]/g, "_") + "\"; filename*=UTF-8''" + encodeURIComponent(nom),
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "cache-control": "private, max-age=86400"
    } });
  }

  /* ---------- écrire ---------- */
  if (action === "discu-envoyer") {
    const texte = String(d.texte || "").replace(/\r\n?/g, "\n").trim();
    if (texte.length > MAX_TEXTE) return json({ erreur: "Message trop long (4 000 caractères au plus)." }, 400);
    let piece = null, octets = null;
    if (d.piece && typeof d.piece === "object") {
      const genre = ["photo", "croquis", "fichier"].indexOf(d.piece.genre) >= 0 ? d.piece.genre : "fichier";
      const b64 = String(d.piece.data || "").replace(/^data:[^,]*,/, "");
      if (!b64) return json({ erreur: "Fichier vide." }, 400);
      if (b64.length * 0.75 > MAX_PIECE + 4) return json({ erreur: "Fichier trop lourd : 10 Mo au plus." }, 413);
      octets = Buffer.from(b64, "base64");
      if (!octets.length) return json({ erreur: "Fichier vide." }, 400);
      if (octets.length > MAX_PIECE) return json({ erreur: "Fichier trop lourd : 10 Mo au plus." }, 413);
      let nom = nomFichier(d.piece.nom || (genre === "fichier" ? "fichier" : genre + ".jpg"));
      let ext = extDe(nom), type = "";
      if (genre !== "fichier") {
        type = TYPES_IMAGE[d.piece.type] ? d.piece.type : "image/jpeg";
        const e = TYPES_IMAGE[type];
        if (ext !== e) { nom = nom.replace(/\.[a-z0-9]{1,5}$/i, "") + "." + e; ext = e; }
        /* une image doit en être une : on regarde ses premiers octets */
        const sig = octets.subarray(0, 12).toString("hex");
        if (!/^ffd8ff|^89504e47|^52494646.{8}57454250/.test(sig)) return json({ erreur: "Image illisible." }, 400);
      } else {
        type = EXT_TYPE[ext] || "application/octet-stream";
      }
      piece = { genre, nom, type, taille: octets.length, w: +d.piece.w || 0, h: +d.piece.h || 0 };
    }
    if (!texte && !piece) return json({ erreur: "Message vide." }, 400);
    const message = { id: nouvelId(), auteur: moi, quand: new Date().toISOString(), texte };
    if (piece) {
      piece.cle = "discussions/pieces/" + id + "/" + message.id + (extDe(piece.nom) ? "." + extDe(piece.nom) : "");
      await store.set(piece.cle, octets);
      message.piece = piece;
    }
    const f = await lireFil(id);
    f.messages.push(message);
    if (f.messages.length > MAX_MESSAGES) {
      const partis = f.messages.slice(0, f.messages.length - MAX_MESSAGES);
      f.messages = f.messages.slice(-MAX_MESSAGES);
      for (const m of partis) if (m.piece && m.piece.cle) { try { await store.delete(m.piece.cle); } catch { /* déjà parti */ } }
    }
    f.lectures[moi] = message.id;
    await ecrireFil(id, f);
    /* la liste suit : dernier message, en tête */
    const l2 = await lireListe(), x = l2.fils.find((y) => y.id === id);
    if (x) { x.maj = message.quand; x.dernier = { auteur: moi, apercu: apercu(message), quand: message.quand }; await store.setJSON(LISTE, l2); }
    notifier(fil.membres.filter((n) => n !== moi), { titre: fil.nom, texte: moi + " : " + apercu(message), url: "./discussions.html?id=" + id, tag: "fil-" + id });
    return json({ ok: true, message });
  }

  /* ---------- retirer un de ses messages ---------- */
  if (action === "discu-message-supprimer") {
    const f = await lireFil(id);
    const m = f.messages.find((x) => x.id === String(d.m || ""));
    if (!m) return json({ erreur: "Message introuvable." }, 404);
    if (m.auteur !== moi && !admin) return json({ erreur: "Vous ne pouvez retirer que vos messages." }, 403);
    if (m.piece && m.piece.cle) { try { await store.delete(m.piece.cle); } catch { /* déjà parti */ } }
    m.supprime = { par: moi, le: new Date().toISOString() }; m.texte = ""; delete m.piece;
    await ecrireFil(id, f);
    if (f.messages[f.messages.length - 1] === m) {
      const l2 = await lireListe(), x = l2.fils.find((y) => y.id === id);
      if (x && x.dernier) { x.dernier.apercu = "Message supprimé"; await store.setJSON(LISTE, l2); }
    }
    return json({ ok: true, message: m });
  }

  /* ---------- membres, nom ---------- */
  if (action === "discu-modifier") {
    const { liste } = await personnes();
    const ajout = filtrerMembres(d.ajouter, liste).filter((n) => fil.membres.indexOf(n) < 0);
    const retrait = (Array.isArray(d.retirer) ? d.retirer : []).map(String).filter((n) => fil.membres.indexOf(n) >= 0);
    const quitter = retrait.length === 1 && retrait[0] === moi;
    if (retrait.length && !quitter && !peutGerer(fil)) return json({ erreur: "Seul " + fil.cree.par + " (qui a créé la discussion) ou un administrateur retire quelqu'un." }, 403);
    if (d.nom !== undefined && propre(d.nom, 80) !== fil.nom && !peutGerer(fil)) return json({ erreur: "Seul " + fil.cree.par + " ou un administrateur renomme la discussion." }, 403);
    const membres = fil.membres.filter((n) => retrait.indexOf(n) < 0).concat(ajout);
    if (membres.length < 1) return json({ erreur: "Une discussion garde au moins une personne : supprimez-la plutôt." }, 400);
    fil.membres = membres;
    if (d.nom !== undefined && propre(d.nom, 80)) fil.nom = propre(d.nom, 80);
    /* qui a créé la discussion la quitte : un autre membre la reprend */
    if (quitter && fil.cree.par === moi) fil.cree = { par: membres[0], le: fil.cree.le, repris: new Date().toISOString() };
    fil.maj = fil.maj || new Date().toISOString();
    await store.setJSON(LISTE, l);
    /* une trace dans le fil, comme une messagerie */
    const f = await lireFil(id), quand = new Date().toISOString();
    const traces = [];
    if (ajout.length) traces.push(moi + " a ajouté " + ajout.join(", ") + ".");
    if (quitter) traces.push(moi + " a quitté la discussion.");
    else if (retrait.length) traces.push(moi + " a retiré " + retrait.join(", ") + ".");
    if (d.nom !== undefined && propre(d.nom, 80) && traces.length === 0) traces.push(moi + " a renommé la discussion « " + fil.nom + " ».");
    traces.forEach((t) => f.messages.push({ id: nouvelId(), auteur: moi, quand, texte: t, info: true }));
    if (traces.length) await ecrireFil(id, f);
    if (ajout.length) notifier(ajout, { titre: "Nouvelle discussion — " + fil.nom, texte: moi + " vous a ajouté à la discussion.", url: "./discussions.html?id=" + id, tag: "fil-" + id });
    return json({ ok: true, fil: vueFil(fil, 0), quitte: quitter });
  }

  if (action === "discu-supprimer") {
    if (!peutGerer(fil)) return json({ erreur: "Seul " + fil.cree.par + " (qui a créé la discussion) ou un administrateur la supprime." }, 403);
    const f = await lireFil(id);
    for (const m of f.messages) if (m.piece && m.piece.cle) { try { await store.delete(m.piece.cle); } catch { /* déjà parti */ } }
    try { await store.delete("discussions/fils/" + id + ".json"); } catch { /* déjà parti */ }
    l.fils = l.fils.filter((x) => x.id !== id);
    await store.setJSON(LISTE, l);
    return json({ ok: true });
  }

  return json({ erreur: "Action inconnue." }, 400);
}
