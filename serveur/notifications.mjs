/* =====================================================================
   NOTIFICATIONS SUR LE TÉLÉPHONE (Web Push)
   ---------------------------------------------------------------------
   Le téléphone sonne comme pour un SMS, même site fermé :
     - un message dans la discussion d'un dossier ;
     - un document déposé pour soi ;
     - un rappel (point bloquant d'un suivi, tâche datée) à son heure.

   Sans bibliothèque : le chiffrement du message (RFC 8291, aes128gcm)
   et la signature du serveur (RFC 8292, VAPID) tiennent dans le module
   crypto de Node. Rien à installer sur l'hébergement.

   Les clés du serveur sont fabriquées au premier usage et rangées dans
   l'annuaire : un déménagement de données les emporte avec lui, et les
   téléphones déjà abonnés continuent de recevoir.

   Chaque personne a sa fiche, dans le magasin de sa société :
       push/<NOM>.json  { abonnements:[{endpoint, keys, appareil, le}],
                          prefs:{messages, documents, rappels} }
   ===================================================================== */

import { createECDH, createHmac, createCipheriv, createPrivateKey, createSign,
  generateKeyPairSync, randomBytes } from "node:crypto";

const CLE_VAPID = "push-vapid.json";
/* la nuit, silence : de 19 h à 7 h (heure de Paris), rien ne sonne ; ce qui arrive
   attend, et part en un seul résumé à la fin du silence. Réglable dans « Mon compte ». */
export const PREFS_DEFAUT = { messages: true, documents: true, rappels: true, silence: true, silenceDebut: "19:00", silenceFin: "07:00",
  /* des jours entiers de silence (1 = lundi … 7 = dimanche), et le mode vacances (du … au …, au vide : jusqu'à ce qu'on le coupe) */
  silenceJours: [], vacances: false, vacancesDu: "", vacancesAu: "" };
/* la raison du silence à cet instant (« vacances », « jour », « nuit »), ou false */
export function enSilence(prefs, d = new Date()) {
  if (!prefs) return false;
  const paris = maintenantParis(d), jour = paris.slice(0, 10), hm = paris.slice(11);
  if (prefs.vacances === true) {
    const du = /^\d{4}-\d\d-\d\d$/.test(prefs.vacancesDu || "") ? prefs.vacancesDu : "";
    const au = /^\d{4}-\d\d-\d\d$/.test(prefs.vacancesAu || "") ? prefs.vacancesAu : "";
    if ((!du || jour >= du) && (!au || jour <= au)) return "vacances";
  }
  const js = Array.isArray(prefs.silenceJours) ? prefs.silenceJours : [];
  if (js.length) {
    const [y, m, j] = jour.split("-").map(Number);
    const n = new Date(Date.UTC(y, m - 1, j)).getUTCDay() || 7;          /* 1 = lundi … 7 = dimanche */
    if (js.indexOf(n) >= 0) return "jour";
  }
  if (prefs.silence === false) return false;
  const a = /^\d\d:\d\d$/.test(prefs.silenceDebut || "") ? prefs.silenceDebut : "19:00";
  const b = /^\d\d:\d\d$/.test(prefs.silenceFin || "") ? prefs.silenceFin : "07:00";
  if (a === b) return false;
  return (a < b ? (hm >= a && hm < b) : (hm >= a || hm < b)) ? "nuit" : false;
}
const cleAttente = (nom) => "push/attente/" + nomDeCle(nom) + ".json";

function b64u(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64u(t) {
  return Buffer.from(String(t || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function hmac(cle, donnees) { return createHmac("sha256", cle).update(donnees).digest(); }
function nomDeCle(nom) {
  return String(nom || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase().slice(0, 60) || "INCONNU";
}
export function cleAbonne(nom) { return "push/" + nomDeCle(nom) + ".json"; }

/* ---------- les clés du serveur ---------- */
let VAPID = null;
export async function clesVapid(annuaire) {
  if (VAPID) return VAPID;
  let k = null;
  try { k = await annuaire.get(CLE_VAPID, { type: "json" }); } catch { k = null; }
  if (!k || !k.d || !k.x || !k.y) {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = privateKey.export({ format: "jwk" });
    k = { d: jwk.d, x: jwk.x, y: jwk.y, cree: new Date().toISOString() };
    await annuaire.setJSON(CLE_VAPID, k);
  }
  const publique = Buffer.concat([Buffer.from([4]), deB64u(k.x), deB64u(k.y)]);
  VAPID = {
    publique: b64u(publique),
    privee: createPrivateKey({ key: { kty: "EC", crv: "P-256", d: k.d, x: k.x, y: k.y }, format: "jwk" })
  };
  return VAPID;
}

/* ---------- la signature VAPID : « ce message vient bien de ce site » ---------- */
function jetonVapid(vapid, endpoint, contact) {
  const aud = new URL(endpoint).origin;
  const tete = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const corps = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact }));
  const s = createSign("SHA256");
  s.update(tete + "." + corps);
  const sig = s.sign({ key: vapid.privee, dsaEncoding: "ieee-p1363" });
  return tete + "." + corps + "." + b64u(sig);
}

/* ---------- le chiffrement : seul ce téléphone peut lire ---------- */
export function chiffrer(abonnement, texte) {
  const uaPublique = deB64u(abonnement.keys && abonnement.keys.p256dh);
  const secret = deB64u(abonnement.keys && abonnement.keys.auth);
  if (uaPublique.length !== 65 || secret.length < 16) throw new Error("Abonnement illisible.");
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const asPublique = ecdh.getPublicKey();
  const partage = ecdh.computeSecret(uaPublique);
  const prkCle = hmac(secret, partage);
  const infoCle = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublique, asPublique, Buffer.from([1])]);
  const ikm = hmac(prkCle, infoCle);
  const sel = randomBytes(16);
  const prk = hmac(sel, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const c = createCipheriv("aes-128-gcm", cek, nonce);
  const chiffre = Buffer.concat([c.update(Buffer.concat([Buffer.from(texte, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const tete = Buffer.alloc(21);
  sel.copy(tete, 0);
  tete.writeUInt32BE(4096, 16);
  tete.writeUInt8(asPublique.length, 20);
  return Buffer.concat([tete, asPublique, chiffre]);
}

/* un envoi : true reçu, false échec passager, "perime" abonnement à oublier */
export async function envoyerA(vapid, abonnement, charge, contact) {
  let corps;
  try { corps = chiffrer(abonnement, JSON.stringify(charge)); } catch { return "perime"; }
  try {
    const r = await fetch(abonnement.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "content-encoding": "aes128gcm",
        ttl: "86400",
        urgency: charge.urgent ? "high" : "normal",
        authorization: "vapid t=" + jetonVapid(vapid, abonnement.endpoint, contact) + ", k=" + vapid.publique
      },
      body: corps,
      signal: AbortSignal.timeout(8000)
    });
    if (r.status === 404 || r.status === 410) return "perime";
    return r.ok;
  } catch { return false; }
}

export async function lireAbonne(store, nom) {
  let f = null;
  try { f = await store.get(cleAbonne(nom), { type: "json" }); } catch { f = null; }
  f = f || {};
  return { abonnements: Array.isArray(f.abonnements) ? f.abonnements : [],
    prefs: { ...PREFS_DEFAUT, ...(f.prefs || {}) } };
}

/* Un nom tel qu'il est écrit sur une fiche (« Johan », « JOHAN K. »,
   l'identifiant…) renvoie au nom exact du compte : c'est sous ce nom
   que le téléphone est abonné. Sans compte qui corresponde, le nom
   reste tel quel. */
function plat(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function nomDuCompte(nom, comptes) {
  const s = String(nom || "").trim();
  if (!s || !Array.isArray(comptes) || !comptes.length) return s;
  const p = plat(s), prem = p.split(" ")[0];
  const exact = comptes.find((c) => c.nom === s) || comptes.find((c) => plat(c.nom) === p)
    || comptes.find((c) => plat(c.identifiant) === p);
  if (exact) return exact.nom;
  /* le début du nom (« Johan K » pour « Johan Klughertz »), puis le seul prénom, s'il n'y a pas d'ambiguïté */
  const debut = comptes.filter((c) => p.length >= 3 && plat(c.nom).startsWith(p.replace(/\s+\S$/, "")) && plat(c.nom).split(" ")[0] === prem);
  if (debut.length === 1) return debut[0].nom;
  const memePrenom = comptes.filter((c) => plat(c.nom).split(" ")[0] === prem || plat(c.identifiant) === prem);
  if (memePrenom.length === 1) return memePrenom[0].nom;
  return s;
}

/* Prévenir des personnes, selon ce qu'elles ont choisi de recevoir.
   genre : "messages" | "documents" | "rappels" | "essai"
   o.comptes : les comptes de la société (pour retrouver les noms) ;
   o.exclure : qui ne doit pas être prévenu (l'auteur). Chaque envoi
   est noté dans le journal (push/journal.json, les 60 derniers). */
export async function prevenirPush(store, annuaire, noms, genre, charge, contact, o = {}) {
  const exclure = new Set((o.exclure || []).map((n) => nomDuCompte(n, o.comptes)));
  const ecrits = new Map();
  (noms || []).filter(Boolean).forEach((n) => { const c = nomDuCompte(n, o.comptes); if (!exclure.has(c) && !ecrits.has(c)) ecrits.set(c, n); });
  const vises = [...ecrits.keys()];
  if (!vises.length) return [];
  const vapid = await clesVapid(annuaire);
  const prevenus = [], journal = [];
  await Promise.all(vises.map(async (nom) => {
    const f = await lireAbonne(store, nom);
    const note = (resultat) => journal.push({ le: new Date().toISOString(), genre, pour: nom, ecrit: ecrits.get(nom), titre: String(charge.titre || "").slice(0, 120), resultat, appareils: f.abonnements.length });
    if (!f.abonnements.length) { note("pas-abonne"); return; }
    if (genre !== "essai" && f.prefs[genre] === false) { note("coupe"); return; }
    const motif = genre !== "essai" && enSilence(f.prefs, o.maintenant || new Date());
    if (motif) {
      /* la nuit, un jour de silence, les vacances : on garde, ça partira à la fin du silence */
      try {
        const k = cleAttente(nom);
        let at = null; try { at = await store.get(k, { type: "json" }); } catch { at = null; }
        at = at && Array.isArray(at.liste) ? at : { nom, liste: [] };
        at.motif = motif === "vacances" || at.motif === "vacances" ? "vacances" : (motif === "jour" || at.motif === "jour" ? "jour" : "nuit");
        at.liste.push({ titre: String(charge.titre || "").slice(0, 120), texte: String(charge.texte || "").slice(0, 200),
          url: charge.url || "./index.html", tag: charge.tag || "", le: new Date().toISOString() });
        at.liste = at.liste.slice(motif === "vacances" ? -200 : -40);
        await store.setJSON(k, at);
      } catch { /* tant pis */ }
      note(motif === "nuit" ? "nuit" : motif === "jour" ? "silence" : "vacances"); return;
    }
    let recu = false, oublies = 0;
    const gardes = [];
    for (const a of f.abonnements) {
      const r = await envoyerA(vapid, a, charge, a.contact || contact);
      if (r === "perime") { oublies++; continue; }
      gardes.push(a);
      if (r === true) recu = true;
    }
    if (oublies) {
      try { await store.setJSON(cleAbonne(nom), { abonnements: gardes, prefs: f.prefs }); } catch { /* tant pis */ }
    }
    note(recu ? "envoye" : (gardes.length ? "echec" : "perime"));
    if (recu) prevenus.push(nom);
  }));
  if (journal.length) {
    try {
      const avant = (await store.get("push/journal.json", { type: "json" })) || [];
      await store.setJSON("push/journal.json", journal.concat(Array.isArray(avant) ? avant : []).slice(0, 60));
    } catch { /* le journal n'empêche rien */ }
  }
  return prevenus;
}

/* ---------- la fin du silence : ce qui a attendu part en une notification ---------- */
export async function envoyerAttentes(store, annuaire, contact, maintenant = new Date()) {
  let res = null;
  try { res = await store.list({ prefix: "push/attente/" }); } catch { return 0; }
  let n = 0;
  for (const b of (res.blobs || [])) {
    let at = null; try { at = await store.get(b.key, { type: "json" }); } catch { at = null; }
    if (!at || !at.nom || !Array.isArray(at.liste) || !at.liste.length) { try { await store.delete(b.key); } catch { /* rien */ } continue; }
    const f = await lireAbonne(store, at.nom);
    if (enSilence(f.prefs, maintenant)) continue;                  /* encore la nuit, son jour de silence ou ses vacances */
    try { await store.delete(b.key); } catch { /* on enverra quand même */ }
    if (!f.abonnements.length) continue;
    const l = at.liste;
    const charge = l.length === 1 ? { titre: l[0].titre, texte: l[0].texte, url: l[0].url, tag: l[0].tag }
      : { titre: (at.motif === "vacances" ? "Pendant vos vacances : " : at.motif === "jour" ? "Pendant le silence : " : "Pendant la nuit : ") + l.length + " notifications",
          texte: l.slice(-3).reverse().map((x) => x.titre).join(" · ") + (l.length > 3 ? " …" : ""),
          url: "./index.html", tag: "nuit" };
    const vapid = await clesVapid(annuaire);
    for (const a of f.abonnements) { try { await envoyerA(vapid, a, charge, a.contact || contact); } catch { /* suivant */ } }
    n++;
    try {
      const avant = (await store.get("push/journal.json", { type: "json" })) || [];
      await store.setJSON("push/journal.json", [{ le: new Date().toISOString(), genre: "nuit", pour: at.nom, ecrit: at.nom,
        titre: charge.titre, resultat: "envoye", appareils: f.abonnements.length }].concat(Array.isArray(avant) ? avant : []).slice(0, 60));
    } catch { /* le journal n'empêche rien */ }
  }
  return n;
}

/* ---------- l'heure de Paris, pour les rappels ---------- */
export function maintenantParis(d = new Date()) {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (t) => (p.find((x) => x.type === t) || {}).value || "00";
  return v("year") + "-" + v("month") + "-" + v("day") + " " + v("hour") + ":" + v("minute");
}
function reculer(paris, heures) {
  /* « YYYY-MM-DD HH:MM » de Paris, moins quelques heures (assez juste
     pour une fenêtre de rattrapage : l'heure d'été ne change rien ici) */
  const d = new Date(paris.replace(" ", "T") + ":00Z");
  d.setUTCHours(d.getUTCHours() - heures);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* Les rappels arrivés à leur heure, dans un magasin de société. Un
   rappel n'est envoyé qu'une fois pour une date et une heure données :
   reporté, il repart. Ceux en retard de plus d'un jour et demi ne
   partent plus — on n'inonde pas un téléphone qui vient de s'abonner.
   Deux temps : on les repère et on les marque (sous le verrou des
   écritures), puis on les envoie (hors du verrou : un réseau lent ne
   doit pas faire attendre le site). */
export async function repererRappelsDus(store, maintenant = maintenantParis()) {
  const depuis = reculer(maintenant, 36);
  const aEnvoyer = [];
  let res;
  try { res = await store.list({ prefix: "taches/" }); } catch { return aEnvoyer; }
  for (const b of (res.blobs || [])) {
    let t = null;
    try { t = await store.get(b.key, { type: "json" }); } catch { t = null; }
    if (!t || t.faite || !t.qui || !/^\d{4}-\d{2}-\d{2}$/.test(t.quand || "")) continue;
    const heure = /^\d{2}:\d{2}$/.test(t.heure || "") ? t.heure : "08:00";
    const echeance = t.quand + " " + heure;
    if (echeance > maintenant || echeance < depuis || t.notifie === echeance) continue;
    /* marqué avant l'envoi : deux passages ne l'enverront jamais deux fois */
    t.notifie = echeance;
    try { await store.setJSON(b.key, t); } catch { continue; }
    const quoi = t.cal ? "" : t.todo ? (t.liste || "to-do list") : (t.client || t.chantier || "");
    aEnvoyer.push({ qui: t.qui, charge: {
      titre: (t.rappel ? "Rappel" : "À faire aujourd'hui") + (quoi ? " — " + quoi : ""),
      texte: String(t.texte || "").slice(0, 180),
      url: t.cal ? "./index.html?calendrier=" + t.quand : t.todo ? "./notes.html" : t.chantier ? "./chantier.html?ref=" + encodeURIComponent(t.chantier) : "./index.html",
      tag: "rappel-" + b.key, urgent: true
    } });
  }
  return aEnvoyer;
}
