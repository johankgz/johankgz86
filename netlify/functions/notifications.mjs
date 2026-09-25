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
export const PREFS_DEFAUT = { messages: true, documents: true, rappels: true };

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

/* Prévenir des personnes, selon ce qu'elles ont choisi de recevoir.
   genre : "messages" | "documents" | "rappels" | "essai" */
export async function prevenirPush(store, annuaire, noms, genre, charge, contact) {
  const vises = [...new Set((noms || []).filter(Boolean))];
  if (!vises.length) return [];
  const vapid = await clesVapid(annuaire);
  const prevenus = [];
  await Promise.all(vises.map(async (nom) => {
    const f = await lireAbonne(store, nom);
    if (!f.abonnements.length) return;
    if (genre !== "essai" && f.prefs[genre] === false) return;
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
    if (recu) prevenus.push(nom);
  }));
  return prevenus;
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
    const quoi = t.client || t.chantier || "";
    aEnvoyer.push({ qui: t.qui, charge: {
      titre: (t.rappel ? "Rappel" : "À faire aujourd'hui") + (quoi ? " — " + quoi : ""),
      texte: String(t.texte || "").slice(0, 180),
      url: t.chantier ? "./chantier.html?ref=" + encodeURIComponent(t.chantier) : "./index.html",
      tag: "rappel-" + b.key, urgent: true
    } });
  }
  return aEnvoyer;
}
