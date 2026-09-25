import { getStore } from "./magasin.mjs";
import { PROPRIETAIRE, SOCIETE_DEPART, SOCIETE_DEMO } from "./equipe.mjs";
import { DEMO } from "./demo.mjs";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { clesVapid, prevenirPush, lireAbonne, cleAbonne, repererRappelsDus, PREFS_DEFAUT } from "./notifications.mjs";

const INDEX = "_index";

/* ---------------- notification par e-mail (Resend) ---------------- */
const CLE_RESEND = process.env.RESEND_API_KEY || "";
const EXPEDITEUR = process.env.EXPEDITEUR || "Outils de travaux <onboarding@resend.dev>";

function echappe(t) {
  return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function frDate(d) {
  if (!d) return "";
  const a = String(d).slice(0, 10).split("-");
  return a[2] + "/" + a[1] + "/" + a[0];
}
function libelleDocument(entree) {
  return (
    entree.type === "commande" ? "Commande et reste à faire"
    : entree.type === "suivi" ? (entree.visite ? "Suivi de chantier — visite n° " + entree.visite : (entree.titre || "Suivi de chantier"))
    : entree.type === "reportage" ? "Reportage photo" + (entree.visite ? " — " + entree.visite : "")
    : entree.type === "autocontrole" ? "Fiche autocontrôle et mise en service"
    : entree.type === "carnet" ? "Carnet d'échantillons"
    : entree.type === "memoire" ? "Mémoire technique"
    : entree.type === "doe" ? "Dossier des ouvrages exécutés"
    : entree.type === "point" ? "Le point de chantier"
    : entree.type === "technique" ? "Document technique" + (entree.visite ? " — " + entree.visite : "")
    : "Relevé technique"
  );
}
/* qui une publication concerne : les personnes désignées, sinon toute
   l'équipe du chantier sauf l'auteur */
function concernes(entree, chantier, auteur) {
  const vises = entree.destinataires || [];
  return (vises.length ? vises : ((chantier && chantier.equipe) || [])).filter((n) => n && n !== auteur);
}
/* ce qui signe les notifications : l'adresse du site en https, sinon
   une adresse de contact (exigée par les services de notification) */
function contactPush(origine) {
  if (process.env.PUSH_CONTACT) return process.env.PUSH_CONTACT;
  return /^https:\/\//.test(origine || "") ? origine : "mailto:contact@exemple.fr";
}
/* Les rappels partent à leur heure : vérifiés chaque minute par le
   serveur, et à chaque appel du site (au plus une fois par minute),
   au cas où l'hébergeur aurait endormi le serveur entre-temps. */
let DERNIER_TIC = 0;
async function tic(force) {
  if (!force && Date.now() - DERNIER_TIC < 50000) return 0;
  DERNIER_TIC = Date.now();
  const annuaire = magasinAnnuaire();
  const lots = [];
  await sousVerrou("ecritures", async () => {
    try {
      for (const soc of await lireSocietes()) {
        if (soc.actif === false) continue;
        const store = magasinSociete(soc.code);
        try { lots.push({ store, dus: await repererRappelsDus(store) }); } catch { /* société suivante */ }
      }
    } catch { /* on réessaiera */ }
  });
  let n = 0;
  for (const l of lots) {
    for (const r of l.dus) {
      try { n += (await prevenirPush(l.store, annuaire, [r.qui], "rappels", r.charge, contactPush(""))).length; } catch { /* suivant */ }
    }
  }
  return n;
}
async function prevenir(entree, chantier, auteur, origine, comptes) {
  if (!CLE_RESEND) return [];
  /* Qui prévenir ? Les personnes désignées quand il y en a. Sinon —
     publication « dans le dossier » — toute l'équipe du chantier, sauf
     celui qui vient de publier : il sait déjà. */
  const vises = entree.destinataires || [];
  const noms = vises.length
    ? vises
    : ((chantier && chantier.equipe) || []).filter((n) => n && n !== auteur);
  const cibles = (comptes || []).filter(
    (u) => noms.indexOf(u.nom) >= 0 && u.email && u.email.indexOf("@") > 0
  );
  if (!cibles.length) return [];

  const quoi = libelleDocument(entree);
  const titre = chantier.client || chantier.ref;
  const lien = origine + "/rapports.html";

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#121821;line-height:1.5">' +
    '<p style="margin:0 0 14px"><b>' + echappe(quoi) + '</b> déposé par ' + echappe(auteur) + '.</p>' +
    '<table style="border-collapse:collapse;margin:0 0 18px">' +
    '<tr><td style="padding:3px 18px 3px 0;color:#6B7583">Chantier</td><td><b>' + echappe(titre) + '</b></td></tr>' +
    '<tr><td style="padding:3px 18px 3px 0;color:#6B7583">Référence</td><td>' + echappe(chantier.ref) + '</td></tr>' +
    (chantier.adresse ? '<tr><td style="padding:3px 18px 3px 0;color:#6B7583">Adresse</td><td>' + echappe(chantier.adresse) + '</td></tr>' : '') +
    '<tr><td style="padding:3px 18px 3px 0;color:#6B7583">Date</td><td>' + echappe(frDate(entree.date)) + '</td></tr>' +
    (entree.etape ? '<tr><td style="padding:3px 18px 3px 0;color:#6B7583">Détail</td><td>' + echappe(entree.etape) + '</td></tr>' : '') +
    '</table>' +
    '<p style="margin:0 0 20px"><a href="' + lien + '" style="display:inline-block;background:#1B57D6;color:#fff;' +
    'text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">Ouvrir le rapport</a></p>' +
    '<p style="margin:0;color:#98A1AE;font-size:12.5px">Message automatique du site de suivi de travaux.<br>' +
    '© 2026 Johan Klughertz. Tous droits réservés.</p></div>';

  const texte = quoi + " déposé par " + auteur + ".\n"
    + "Travaux : " + titre + " (" + chantier.ref + ")\n"
    + "Date : " + frDate(entree.date) + "\n\n" + lien;

  const envois = cibles.map((u) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + CLE_RESEND },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: [u.email],
        subject: quoi + " — " + titre + (chantier.ref ? " (" + chantier.ref + ")" : ""),
        html,
        text: texte
      })
    }).then((r) => (r.ok ? u.nom : null)).catch(() => null)
  );
  const resultats = await Promise.all(envois);
  return resultats.filter(Boolean);
}


/* envoi simple, pour les messages qui ne concernent pas un rapport */
async function envoyerMail(destinataire, sujet, texte) {
  if (!CLE_RESEND || !destinataire) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer " + CLE_RESEND },
      body: JSON.stringify({
        from: EXPEDITEUR, to: [destinataire], subject: sujet, text: texte,
        html: '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial;font-size:15px;color:#121821">'
          + echappe(texte).replace(/\n/g, "<br>") + "</div>"
      })
    });
    return r.ok;
  } catch { return false; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function slug(t) {
  return (t || "sans-reference").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase().slice(0, 40) || "SANS-REFERENCE";
}
/* =================== sociétés et comptes =================== */
const ANNUAIRE = "annuaire";                 /* magasin commun à toutes les sociétés */
function magasinAnnuaire() { return getStore({ name: ANNUAIRE, consistency: "strong" }); }
/* Les opérations sur les listes d'une même personne passent une par
   une : une suppression et un enregistrement partis ensemble liraient
   la même version, et le second à écrire ferait revenir la liste que
   le premier venait de retirer. */
const VERROUS_NOTES = new Map();
function sousVerrou(cle, fn) {
  const avant = VERROUS_NOTES.get(cle) || Promise.resolve();
  const suite = avant.catch(() => {}).then(fn);
  const garde = suite.catch(() => {});
  VERROUS_NOTES.set(cle, garde);
  garde.then(() => { if (VERROUS_NOTES.get(cle) === garde) VERROUS_NOTES.delete(cle); });
  return suite;
}
function magasinSociete(code) {
  /* la première société garde son magasin d'origine, pour ne rien perdre */
  return getStore({ name: code === SOCIETE_DEPART.code ? "rapports" : "rapports-" + code, consistency: "strong" });
}
function ligneSociete(s) {
  return { code: s.code, nom: s.nom, metier: s.metier, ville: s.ville,
    cree: new Date().toISOString(), actif: true, demo: s.code === "demo" };
}
async function lireSocietes() {
  const a = magasinAnnuaire();
  let liste = null;
  try { liste = await a.get("societes.json", { type: "json" }); } catch { liste = null; }

  /* réparation : la société de départ et la démonstration existent toujours */
  if (Array.isArray(liste) && liste.length) {
    let corrige = false;
    for (const s of [SOCIETE_DEPART, SOCIETE_DEMO]) {
      if (!liste.some((x) => x.code === s.code)) { liste.push(ligneSociete(s)); corrige = true; }
    }
    if (corrige) { try { await a.setJSON("societes.json", liste); } catch { /* on continue */ } }
    return liste;
  }
  if (!liste) {
    /* premier démarrage : on installe la société de départ et la démonstration */
    liste = [SOCIETE_DEPART, SOCIETE_DEMO].map((s) => ({
      code: s.code, nom: s.nom, metier: s.metier, ville: s.ville,
      cree: new Date().toISOString(), actif: true, demo: s.code === "demo"
    }));
    await a.setJSON("societes.json", liste);
    for (const s of [SOCIETE_DEPART, SOCIETE_DEMO]) {
      await a.setJSON("comptes-" + s.code + ".json", s.utilisateurs);
    }
  }
  return liste;
}
async function lireComptes(code) {
  const a = magasinAnnuaire();
  let liste = null;
  try { liste = await a.get("comptes-" + code + ".json", { type: "json" }); } catch { liste = null; }
  if (Array.isArray(liste) && liste.length) return liste;

  /* réparation : on réinstalle les comptes de départ plutôt que de bloquer tout le monde */
  const modele = [SOCIETE_DEPART, SOCIETE_DEMO].find((s) => s.code === code);
  if (modele) {
    try { await a.setJSON("comptes-" + code + ".json", modele.utilisateurs); } catch { /* on continue */ }
    return modele.utilisateurs;
  }
  return liste || [];
}
async function ecrireComptes(code, comptes) {
  await magasinAnnuaire().setJSON("comptes-" + code + ".json", comptes);
}
const DUREE_SESSION = 3 * 24 * 60 * 60 * 1000;   /* trois jours : deux reconnexions par semaine */

/* =====================================================================
   MOTS DE PASSE
   ---------------------------------------------------------------------
   Personne ne lit le mot de passe de personne, pas même l'administrateur
   et pas même le propriétaire du site : la base ne garde qu'une
   empreinte scrypt, dont on ne revient pas au mot de passe.
   L'administrateur peut seulement remettre un compte à zéro, ce qui lui
   donne un code provisoire à transmettre ; la personne choisit ensuite
   le sien, et la date de ce choix reste affichée — une reprise en main
   du compte ne peut donc pas passer inaperçue.
   ===================================================================== */
const SCRYPT = { N: 16384, r: 8, p: 1, octets: 32 };
function empreinteDe(mdp, sel) {
  const s = sel || randomBytes(16).toString("hex");
  const h = scryptSync(String(mdp), s, SCRYPT.octets, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, s, h.toString("hex")].join("$");
}
function empreinteJuste(mdp, empreinte) {
  const m = String(empreinte || "").split("$");
  if (m.length !== 6 || m[0] !== "scrypt") return false;
  let attendu;
  try {
    attendu = scryptSync(String(mdp), m[4], m[5].length / 2,
      { N: Number(m[1]), r: Number(m[2]), p: Number(m[3]) });
  } catch { return false; }
  const donne = Buffer.from(m[5], "hex");
  return attendu.length === donne.length && timingSafeEqual(attendu, donne);
}
/* un compte d'avant l'empreinte garde son mot de passe en clair : il
   reste accepté une fois, le temps que la personne en choisisse un. */
function motDePasseJuste(compte, mdp) {
  if (!compte || !mdp) return false;
  if (compte.empreinte) return empreinteJuste(mdp, compte.empreinte);
  return typeof compte.motdepasse === "string" && compte.motdepasse.length > 0
    && compte.motdepasse === String(mdp);
}
function sansMotDePasse(compte) {
  return !compte || (!compte.empreinte && !compte.motdepasse);
}
/* un code provisoire lisible : deux syllabes et quatre chiffres */
function codeProvisoire() {
  const mots = ["Chantier", "Tableau", "Armoire", "Cable", "Disjoncteur", "Prise",
    "Goulotte", "Borne", "Compteur", "Gaine", "Moteur", "Ventouse"];
  const m = mots[randomBytes(1)[0] % mots.length];
  return m + "-" + String(1000 + (randomBytes(2).readUInt16BE(0) % 9000));
}

/* ---------- jetons de session ----------
   Le jeton ne transporte plus le mot de passe : il porte la société,
   l'identifiant, l'heure d'ouverture et une signature. La signature est
   calculée avec l'empreinte du compte comme clé, donc elle ne quitte
   jamais le serveur — et changer de mot de passe ferme du même coup
   toutes les sessions ouvertes ailleurs. */
function clefDeSignature(compte) {
  return compte.empreinte || ("clair:" + (compte.motdepasse || ""));
}
function signer(code, id, date, compte) {
  return createHmac("sha256", clefDeSignature(compte))
    .update(code + "|" + id + "|" + date).digest("hex").slice(0, 32);
}
function jetonPour(code, id, compte, date) {
  const t = date || Date.now();
  return Buffer.from(code + "|" + id + "|" + t + "|" + signer(code, id, t, compte), "utf8")
    .toString("base64");
}
/* ---------- applis du site et droits d'accès ---------- */
/* Une liste vide vaut « toutes les applis ». L'administrateur et le
   propriétaire gardent tout, quoi qu'on leur attribue. */
const APPLIS = ["releve", "suivi", "commande", "reception", "autocontrole", "sav", "etiquettes", "photos", "carnet", "technique"];
const APPLI_DU_TYPE = {
  releve: "releve", suivi: "suivi", commande: "commande", reception: "reception",
  autocontrole: "autocontrole", sav: "sav", etiquettes: "etiquettes", reportage: "photos",
  carnet: "carnet", memoire: "carnet", doe: "carnet", technique: "technique",
  point: "commande"
};
function applisValides(liste) {
  if (!Array.isArray(liste)) return [];
  const propres = liste.map((a) => String(a).trim().toLowerCase()).filter((a) => APPLIS.indexOf(a) >= 0);
  return Array.from(new Set(propres));
}
function aAcces(personne, appli) {
  if (!personne) return false;
  if (personne.role === "admin" || personne.proprietaire) return true;
  const siennes = applisValides(personne.applis);
  return !siennes.length || siennes.indexOf(appli) >= 0;
}

/* =====================================================================
   DOSSIERS EN ATTENTE DE RÉPONSE
   ---------------------------------------------------------------------
   Un chiffrage part chez le client, et puis plus rien. Le dossier n'est
   pas mort, mais il n'est pas en travaux non plus : il encombre la liste
   des chantiers et on finit par l'oublier. On le met de côté, et le site
   se charge de le ressortir au bout d'un mois pour demander ce qu'il
   devient.
   Aucune tâche planifiée là-dedans : l'échéance se calcule à la lecture,
   ce qui marche aussi bien sur o2switch que sur Netlify, et ne peut pas
   se gripper en silence.
   ===================================================================== */
const RELANCE_JOURS = 30;
function joursDepuis(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return 0;
  return Math.floor((Date.now() - t) / 86400000);
}
/* C'est le relevé technique qui dit où en est une affaire : son onglet
   Conclusion porte « Devis accepté », « En attente de réponse » ou « En
   attente de rendez-vous », et ce statut voyage avec le document. Un
   chiffrage parti chez le client n'a donc pas à être rangé une seconde
   fois à la main : le dossier suit son relevé. */
function statutAttendu(etape) {
  const t = String(etape || "").toLowerCase();
  if (/accept/.test(t)) return "actif";
  if (/en attente/.test(t)) return "attente";
  return "";
}
function dernierReleve(c) {
  let vu = null;
  for (const f of (c && c.fichiers) || []) {
    if (f.type !== "releve" || f.brouillon) continue;
    const quand = f.publie || f.date || "";
    if (!vu || String(quand) >= String(vu.publie || vu.date || "")) vu = f;
  }
  return vu;
}
/* l'avancement d'un chantier, en pourcentage, posé à la main par son
   chargé d'affaires */
function avancementDe(c) {
  const n = parseInt(c && c.avancement, 10);
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
}

function etatDossier(c) {
  if (!c) return { etat: "actif" };
  let etat = c.etat === "attente" ? "attente" : (c.etat === "actif" ? "actif" : "");
  let depuis = c.attenteDepuis || "";
  let note = c.attenteNote || "";
  let par = c.attentePar || "";
  let auto = false;
  /* rien de posé à la main : c'est le relevé qui décide */
  if (!etat) {
    const r = dernierReleve(c);
    const dit = statutAttendu(r && r.etape);
    if (dit === "attente") {
      etat = "attente"; auto = true;
      depuis = r.publie || r.date || c.maj || "";
      note = String(r.etape || "");
      par = r.auteur || "";
    } else {
      etat = "actif";
    }
  }
  if (etat !== "attente") return { etat: "actif" };
  depuis = depuis || c.maj || "";
  return {
    etat: "attente",
    attenteDepuis: depuis,
    attenteNote: note,
    attentePar: par,
    attenteAuto: auto,
    joursAttente: joursDepuis(depuis),
    /* la relance repart de la dernière réponse, pas de la mise en attente :
       « toujours en attente » vaut un mois de tranquillité de plus. */
    relanceDue: joursDepuis(c.relanceLe || depuis) >= RELANCE_JOURS
  };
}

/* une position de chantier : deux nombres plausibles, ou rien */
function positionValide(lat, lon) {
  const a = Number(lat), b = Number(lon);
  if (!isFinite(a) || !isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lon: Math.round(b * 1e6) / 1e6 };
}

/* le compte propriétaire, tel qu'il est écrit dans le code, ne sert plus
   qu'au tout premier accès ou au sauvetage : dès qu'un mot de passe est
   posé sur son compte, c'est l'annuaire qui décide, et lui seul. */
function personneDuCompte(code, u) {
  const proprio = code === SOCIETE_DEPART.code
    && String(u.identifiant).trim().toLowerCase() === PROPRIETAIRE.identifiant.trim().toLowerCase();
  /* Un compte encore sur un mot de passe en clair doit en choisir un :
     ces mots de passe-là ont été distribués, écrits, recopiés. La
     démonstration est publique, elle garde le sien. */
  const aChanger = code === SOCIETE_DEMO.code
    ? false
    : (!!u.aChanger || (!u.empreinte && !!u.motdepasse));
  return { nom: u.nom, role: proprio ? "admin" : u.role, email: u.email || "",
    societe: code, proprietaire: proprio, applis: applisValides(u.applis),
    identifiant: String(u.identifiant).trim().toLowerCase(),
    aChanger };
}
function personneDuProprietaire(code) {
  /* le secours entre avec le mot de passe écrit dans le code : la
     première chose à faire est d'en poser un vrai. */
  return { nom: PROPRIETAIRE.nom, role: "admin", proprietaire: true, societe: code,
    email: PROPRIETAIRE.email, applis: [], identifiant: PROPRIETAIRE.identifiant,
    aChanger: true };
}
/* le secours du propriétaire : ouvert tant que son compte n'existe pas,
   ou existe sans aucun mot de passe. Un mot de passe posé le referme. */
function secoursProprietaire(comptes, id, mdp) {
  if (id !== PROPRIETAIRE.identifiant || mdp !== PROPRIETAIRE.motdepasse) return false;
  const sien = comptes.find((c) =>
    String(c.identifiant).trim().toLowerCase() === PROPRIETAIRE.identifiant.trim().toLowerCase());
  return !sien || sansMotDePasse(sien);
}

/* vérification d'un couple identifiant / mot de passe, à la connexion */
async function verifier(code, id, mdp) {
  await lireSocietes();
  const comptes = await lireComptes(code);
  const u = comptes.find((c) => String(c.identifiant).trim().toLowerCase() === id);
  if (u && motDePasseJuste(u, mdp)) {
    return { personne: personneDuCompte(code, u), compte: u };
  }
  if (secoursProprietaire(comptes, id, mdp)) {
    return { personne: personneDuProprietaire(code), compte: { motdepasse: PROPRIETAIRE.motdepasse } };
  }
  return null;
}

/* reconnaissance d'un jeton déjà émis : aucune empreinte à recalculer,
   une signature à comparer. */
async function identifier(auth) {
  const a = (auth || "").trim();
  if (!a) return null;
  let clair = "";
  try { clair = Buffer.from(a, "base64").toString("utf8"); } catch { return null; }
  const p = clair.split("|");
  if (p.length !== 4) return null;
  const code = p[0].trim().toLowerCase();
  const id = p[1].trim().toLowerCase();
  const ouverte = Number(p[2]);
  const signature = p[3];
  if (!/^\d{10,}$/.test(p[2])) return null;
  if (!ouverte || Date.now() - ouverte > DUREE_SESSION) return "perimee";

  await lireSocietes();
  const comptes = await lireComptes(code);
  const u = comptes.find((c) => String(c.identifiant).trim().toLowerCase() === id);
  if (u && signer(code, id, ouverte, u) === signature) return personneDuCompte(code, u);
  /* le propriétaire de secours : son jeton est signé avec le mot de
     passe du code, et seulement tant que ce secours reste ouvert. */
  if (id === PROPRIETAIRE.identifiant.trim().toLowerCase()
      && (!u || sansMotDePasse(u))
      && signer(code, id, ouverte, { motdepasse: PROPRIETAIRE.motdepasse }) === signature) {
    return personneDuProprietaire(code);
  }
  return null;
}

/* Pour les autres fonctions du site (analyse de plan…) : la personne
   derrière un jeton, ou null si le jeton ne vaut rien ou a expiré. */
export async function sessionValide(auth) {
  const p = await identifier(auth);
  return p && p !== "perimee" && !p.aChanger ? p : null;
}

/* la société de démonstration est remplie au premier accès */
async function garnirDemo(st) {
  /* listes d'exemple, rangées comme les listes ordinaires de la société */
  try {
    for (const u of SOCIETE_DEMO.utilisateurs) {
      if (u.role === "technicien") continue;
      const cleN = "notes/" + slug(u.nom) + ".json";
      const deja = await st.get(cleN, { type: "json" });
      if (!deja) await st.setJSON(cleN, DEMO.listes);
    }
  } catch { /* sans listes, la démonstration reste utilisable */ }

  const idx = (await st.get(INDEX, { type: "json" })) || null;
  if (idx && idx.chantiers && Object.keys(idx.chantiers).length) return;
  const neuf = { chantiers: {} };
  for (const d of DEMO.dossiers) {
    const fichiers = [];
    for (const f of d.fichiers) {
      const cle = d.ref + "/" + slug(f.titre) + ".pdf";
      await st.set(cle, Buffer.from(f.pdf, "base64"), { metadata: { type: "application/pdf" } });
      fichiers.push({
        cle, titre: f.titre, type: f.type, visite: f.visite || "", etape: f.etape || "",
        date: f.date, auteur: f.auteur, destinataires: f.destinataires || [],
        publie: new Date(f.date + "T09:00:00Z").toISOString(),
        taille: Math.round((f.pdf.length * 3) / 4), versions: 1, lectures: {}
      });
    }
    neuf.chantiers[d.ref] = { ref: d.ref, client: d.client, adresse: d.adresse,
      fichiers, maj: new Date().toISOString() };
  }
  await st.setJSON(INDEX, neuf);
  try {
    const a = magasinAnnuaire();
    for (const u of SOCIETE_DEMO.utilisateurs) {
      const cle = "notes-" + slug(u.nom) + ".json";
      const deja = await a.get(cle, { type: "json" });
      if (!deja && u.role !== "technicien") await a.setJSON(cle, DEMO.listes);
    }
  } catch { /* les listes viendront plus tard */ }
}

function voit(personne, fichier, chantier) {
  /* un rapport appartient à son auteur, à ses destinataires,
     et à l'équipe du chantier constituée lors de la publication du relevé */
  if (!personne) return false;
  if (fichier.auteur === personne.nom) return true;
  if ((fichier.destinataires || []).indexOf(personne.nom) >= 0) return true;
  return !!chantier && (chantier.equipe || []).indexOf(personne.nom) >= 0;
}
function chantierDe(idx, cle) {
  return idx.chantiers[String(cle).split("/")[0]] || null;
}
/* le type d'un document d'après son extension : un plan peut être une
   image, un PDF reste un PDF, un lot de photos reste un ZIP. */
const TYPES_FICHIER = { pdf: "application/pdf", zip: "application/zip", jpg: "image/jpeg",
                        jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
function typeDuFichier(cle) {
  const ext = String(cle).split(".").pop().toLowerCase();
  return TYPES_FICHIER[ext] || "application/pdf";
}
function rang(f) {
  if (f.type === "releve") return -1;
  if (f.type === "commande") return 1000 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "point") return 1100 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "photos") return 2000 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "reportage") return 2200 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "autocontrole") return 2700 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "technique") return 500 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "carnet") return 800 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "memoire") return 900 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "doe") return 3200 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "reception") return 3000;
  if (f.type === "etiquettes") return 2500;
  if (f.type === "sav") return 1500 + Number(new Date(f.publie || 0)) / 1e10;
  const n = parseInt(f.visite, 10);
  return isNaN(n) ? 0 : n;
}

/* Les actions qui écrivent passent une par une. Presque toutes relisent
   puis réécrivent l'index des chantiers : deux à la fois (un suivi et
   ses photos, une lecture et une publication) liraient la même version,
   et la seconde effacerait ce que la première venait d'ajouter. Les
   lectures, elles, ne s'attendent pas. */
const LECTURES = new Set(["liste", "fichier", "fiche", "fiches", "dossiers", "equipe", "equipe-dossier", "moi",
  "mon-compte", "notes", "notes-corbeille", "taches", "messages-non-lus", "comptes", "demandes", "societes",
  "societes-publiques", "push-cle", "push-etat"]);
export default async (req) => {
  let action = "";
  try { action = new URL(req.url).searchParams.get("action") || ""; } catch { action = ""; }
  if (action !== "tic") tic().catch(() => {});
  if (action === "tic") return json({ ok: true, envoyes: await tic(true) });
  if (LECTURES.has(action)) return traiter(req);
  return sousVerrou("ecritures", () => traiter(req));
};

async function traiter(req) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  let store = getStore({ name: "rapports", consistency: "strong" });

  /* connexion : seule action ouverte */
  if (action === "demande-acces") {
    /* demande d'accès : transmise au gestionnaire, sans authentification */
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const nom = String(d.nom || "").trim();
    const email = String(d.email || "").trim();
    if (!nom || !email) return json({ erreur: "Nom et adresse e-mail sont nécessaires." }, 400);
    const demande = {
      nom, email,
      fonction: String(d.fonction || "").trim(),
      tel: String(d.tel || "").trim(),
      message: String(d.message || "").slice(0, 2000),
      recue: new Date().toISOString()
    };
    try {
      const store = getStore("rapports");
      const cle = "demandes/" + Date.now() + "-" + slug(nom) + ".json";
      await store.setJSON(cle, demande);
    } catch { /* la demande part quand même par e-mail */ }
    const dest = PROPRIETAIRE.email || "";
    if (dest) {
      await envoyerMail(dest, "Demande d'accès au site — " + nom,
        [nom + (demande.fonction ? " (" + demande.fonction + ")" : ""),
         "E-mail : " + email,
         demande.tel ? "Téléphone : " + demande.tel : "",
         "", demande.message || "(pas de message)",
         "", "Pour créer le compte : ajoutez une ligne dans netlify/functions/equipe.mjs."
        ].filter(Boolean).join("\n"));
    }
    return json({ ok: true });
  }

  if (action === "societes-publiques") {
    /* liste des sociétés proposées à la connexion */
    const liste = await lireSocietes();
    return json({ societes: liste.filter((s) => s.actif !== false)
      .map((s) => ({ code: s.code, nom: s.nom, demo: !!s.demo })) });
  }

  if (action === "connexion") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const code = String(d.societe || SOCIETE_DEPART.code).trim().toLowerCase();
    const id = String(d.identifiant || "").trim().toLowerCase();
    const mdp = String(d.motdepasse || "");
    const v = await verifier(code, id, mdp);
    if (!v) return json({ erreur: "Identifiant ou mot de passe incorrect." }, 401);
    const p = v.personne;
    const liste = await lireSocietes();
    const soc = liste.find((x) => x.code === code) || {};
    return json({ jeton: jetonPour(code, id, v.compte), nom: p.nom, role: p.role, applis: p.applis || [],
      societe: code, societeNom: soc.nom || "", metier: soc.metier || "", ville: soc.ville || "",
      proprietaire: !!p.proprietaire, demo: !!soc.demo, aChanger: !!p.aChanger });
  }

  const personne = await identifier(req.headers.get("x-auth") || url.searchParams.get("auth"));
  if (personne === "perimee") {
    return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  }
  if (!personne) return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  const bureau = personne.role === "bureau" || personne.role === "admin";
  const admin = personne.role === "admin" || personne.proprietaire;

  /* ---------- chacun choisit son mot de passe ---------- */
  if (action === "motdepasse-changer") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ancien = String(d.ancien || "");
    const neuf = String(d.nouveau || "");
    if (neuf.length < 8) return json({ erreur: "Huit caractères au minimum." }, 400);
    if (neuf === ancien) return json({ erreur: "Le nouveau mot de passe doit changer de l'ancien." }, 400);
    const comptes = await lireComptes(personne.societe);
    const i = comptes.findIndex((c) =>
      String(c.identifiant).trim().toLowerCase() === personne.identifiant);
    if (i < 0) return json({ erreur: "Compte introuvable." }, 404);
    const parSecours = sansMotDePasse(comptes[i])
      && secoursProprietaire(comptes, personne.identifiant, ancien);
    if (!motDePasseJuste(comptes[i], ancien) && !parSecours) {
      return json({ erreur: "Mot de passe actuel incorrect." }, 403);
    }
    comptes[i] = { ...comptes[i], empreinte: empreinteDe(neuf),
      aChanger: false, mdpMaj: new Date().toISOString() };
    delete comptes[i].motdepasse;
    await ecrireComptes(personne.societe, comptes);
    /* le jeton est signé avec l'empreinte : il faut le refaire, et ceux
       ouverts ailleurs cessent de valoir. */
    return json({ ok: true, jeton: jetonPour(personne.societe, personne.identifiant, comptes[i]) });
  }

  /* Tant que le mot de passe est celui qu'on lui a donné, le compte ne
     fait rien d'autre que d'en choisir un. */
  if (personne.aChanger && action !== "moi") {
    return json({ erreur: "Choisissez d'abord votre mot de passe.", aChanger: true }, 403);
  }
  store = magasinSociete(personne.societe);
  if (personne.societe === "demo") { try { await garnirDemo(store); } catch { /* démo vide */ } }

  async function lireIndex() {
    return (await store.get(INDEX, { type: "json" })) || { chantiers: {} };
  }
  function trouver(idx, cle) {
    const ref = cle.split("/")[0];
    const c = idx.chantiers[ref];
    if (!c) return null;
    return c.fichiers.find((f) => f.cle === cle) || null;
  }

  if (action === "moi") {
    return json({ nom: personne.nom, role: personne.role, applis: personne.applis || [],
      proprietaire: !!personne.proprietaire, aChanger: !!personne.aChanger,
      metier: "", ville: "", societe: personne.societe });
  }

  if (action === "equipe") {
    const comptes = await lireComptes(personne.societe);
    /* e-mail et téléphone : l'annuaire de la société, pour remplir les
       coordonnées du chargé d'affaires sur le relevé */
    return json({ personnes: comptes.map((p) => ({ nom: p.nom, role: p.role,
      email: p.email || "", tel: p.tel || "" })) });
  }

  /* ---------- mon compte : chacun ses coordonnées ---------- */
  if (action === "mon-compte") {
    const comptes = await lireComptes(personne.societe);
    const c = comptes.find((x) => String(x.identifiant).trim().toLowerCase() === personne.identifiant) || {};
    const liste = await lireSocietes();
    const soc = liste.find((x) => x.code === personne.societe) || {};
    return json({ nom: personne.nom, identifiant: personne.identifiant, role: personne.role,
      email: c.email || personne.email || "", tel: c.tel || "",
      societe: personne.societe, societeNom: soc.nom || "", demo: !!soc.demo,
      mdpMaj: c.mdpMaj || "" });
  }

  if (action === "mon-compte-enregistrer") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const email = String(d.email || "").trim().slice(0, 120);
    const tel = String(d.tel || "").trim().slice(0, 40);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ erreur: "Cette adresse e-mail n'a pas l'air complète." }, 400);
    }
    const liste = await lireSocietes();
    const soc = liste.find((x) => x.code === personne.societe) || {};
    if (soc.demo || personne.societe === SOCIETE_DEMO.code) {
      return json({ erreur: "Démonstration : les coordonnées ne sont pas enregistrées." }, 403);
    }
    const comptes = await lireComptes(personne.societe);
    const i = comptes.findIndex((x) => String(x.identifiant).trim().toLowerCase() === personne.identifiant);
    if (i < 0) return json({ erreur: "Compte introuvable." }, 404);
    comptes[i] = { ...comptes[i], email, tel };
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true, email, tel });
  }

  if (action === "moi-societe") {
    const liste = await lireSocietes();
    const soc = liste.find((x) => x.code === personne.societe) || {};
    return json({ societe: soc.code || personne.societe, nom: soc.nom || "",
      metier: soc.metier || "", ville: soc.ville || "", demo: !!soc.demo,
      role: personne.role, admin, proprietaire: !!personne.proprietaire });
  }

  /* ---------- comptes de la société (réservé à l'administrateur) ---------- */
  if (action === "comptes") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    const comptes = await lireComptes(personne.societe);
    /* aucun mot de passe ne sort d'ici, seulement son état :
       « personnel » quand la personne l'a choisi elle-même,
       « provisoire » quand elle doit encore le faire,
       « ancien » pour un compte d'avant les empreintes. */
    return json({ comptes: comptes.map((c) => ({ identifiant: c.identifiant, nom: c.nom,
      role: c.role, email: c.email || "", tel: c.tel || "",
      etatMdp: c.empreinte ? (c.aChanger ? "provisoire" : "personnel")
             : (c.motdepasse ? "ancien" : "aucun"),
      mdpMaj: c.mdpMaj || "",
      applis: applisValides(c.applis) })) });
  }

  if (action === "compte-enregistrer") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const id = String(d.identifiant || "").trim().toLowerCase();
    const nom = String(d.nom || "").trim();
    if (!id || !nom) return json({ erreur: "Identifiant et nom sont nécessaires." }, 400);
    const role = ["admin", "bureau", "technicien"].indexOf(d.role) >= 0 ? d.role : "technicien";
    const comptes = await lireComptes(personne.societe);
    const i = comptes.findIndex((c) => String(c.identifiant).toLowerCase() === id);
    const applis = applisValides(d.applis);
    /* Modifier un compte ne touche jamais à son mot de passe : pour le
       reste à zéro, il y a « compte-reinitialiser », qui rend un code
       provisoire sans jamais montrer l'ancien. */
    if (i >= 0) {
      comptes[i] = { ...comptes[i], nom, role, email: String(d.email || "").trim(), applis };
      if (d.tel !== undefined) comptes[i].tel = String(d.tel || "").trim().slice(0, 40);
      await ecrireComptes(personne.societe, comptes);
      return json({ ok: true, comptes: comptes.length });
    }
    const code = codeProvisoire();
    comptes.push({ identifiant: id, empreinte: empreinteDe(code), aChanger: true, nom, role,
      email: String(d.email || "").trim(), tel: String(d.tel || "").trim().slice(0, 40), applis });
    await ecrireComptes(personne.societe, comptes);
    /* le code provisoire n'est montré qu'ici, une fois */
    return json({ ok: true, comptes: comptes.length, provisoire: code });
  }

  /* remettre un compte à zéro : un code provisoire à transmettre, et la
     personne choisit son mot de passe à la connexion suivante. */
  if (action === "compte-reinitialiser") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    const id = String(url.searchParams.get("identifiant") || "").trim().toLowerCase();
    const comptes = await lireComptes(personne.societe);
    const i = comptes.findIndex((c) => String(c.identifiant).toLowerCase() === id);
    if (i < 0) return json({ erreur: "Compte inconnu." }, 404);
    const code = codeProvisoire();
    comptes[i] = { ...comptes[i], empreinte: empreinteDe(code), aChanger: true, mdpMaj: "" };
    delete comptes[i].motdepasse;
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true, identifiant: id, nom: comptes[i].nom, provisoire: code });
  }

  /* toute l'équipe d'un coup : ce qu'il faut le jour où les mots de
     passe d'origine ont traîné quelque part. Sauf celui qui le demande :
     s'il fermait la page avant d'avoir noté son propre code, il resterait
     dehors, et le secours du code est refermé depuis longtemps. Le sien,
     il le change par « Mon mot de passe ». */
  if (action === "comptes-reinitialiser") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    const comptes = await lireComptes(personne.societe);
    const rendus = [];
    for (let k = 0; k < comptes.length; k++) {
      if (String(comptes[k].identifiant).trim().toLowerCase() === personne.identifiant) continue;
      const code = codeProvisoire();
      comptes[k] = { ...comptes[k], empreinte: empreinteDe(code), aChanger: true, mdpMaj: "" };
      delete comptes[k].motdepasse;
      rendus.push({ identifiant: comptes[k].identifiant, nom: comptes[k].nom, provisoire: code });
    }
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true, comptes: rendus, saufMoi: personne.identifiant });
  }

  if (action === "compte-supprimer") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    const id = String(url.searchParams.get("identifiant") || "").trim().toLowerCase();
    let comptes = await lireComptes(personne.societe);
    if (comptes.filter((c) => c.role === "admin").length <= 1
        && comptes.some((c) => String(c.identifiant).toLowerCase() === id && c.role === "admin")) {
      return json({ erreur: "Gardez au moins un administrateur." }, 400);
    }
    comptes = comptes.filter((c) => String(c.identifiant).toLowerCase() !== id);
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true });
  }

  /* ---------- sociétés (réservé au propriétaire) ---------- */
  if (action === "societes") {
    if (!personne.proprietaire) return json({ erreur: "Réservé au propriétaire." }, 403);
    return json({ societes: await lireSocietes() });
  }

  if (action === "societe-creer") {
    if (!personne.proprietaire) return json({ erreur: "Réservé au propriétaire." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const code = slug(String(d.code || d.nom || "")).toLowerCase();
    if (!code) return json({ erreur: "Donnez un code de société." }, 400);
    const liste = await lireSocietes();
    if (liste.some((x) => x.code === code)) return json({ erreur: "Ce code existe déjà." }, 400);
    liste.push({ code, nom: String(d.nom || code), metier: String(d.metier || ""),
      ville: String(d.ville || ""), cree: new Date().toISOString(), actif: true, demo: false });
    await magasinAnnuaire().setJSON("societes.json", liste);
    const idAdmin = String(d.adminIdentifiant || "admin").trim().toLowerCase();
    const mdpAdmin = String(d.adminMotdepasse || "").trim() || codeProvisoire();
    await ecrireComptes(code, [{ identifiant: idAdmin, empreinte: empreinteDe(mdpAdmin),
      aChanger: true, nom: String(d.adminNom || "Administrateur"), role: "admin",
      email: String(d.adminEmail || "") }]);
    /* code provisoire : l'administrateur de la nouvelle société choisira
       le sien en arrivant, et nous ne le connaîtrons pas. */
    return json({ ok: true, code, identifiant: idAdmin, provisoire: mdpAdmin });
  }

  if (action === "societe-etat") {
    if (!personne.proprietaire) return json({ erreur: "Réservé au propriétaire." }, 403);
    const code = String(url.searchParams.get("code") || "").toLowerCase();
    const actif = url.searchParams.get("actif") !== "non";
    const liste = await lireSocietes();
    const i = liste.findIndex((x) => x.code === code);
    if (i < 0) return json({ erreur: "Société inconnue." }, 404);
    liste[i].actif = actif;
    await magasinAnnuaire().setJSON("societes.json", liste);
    return json({ ok: true });
  }

  if (action === "publier") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (!d.pdf) return json({ erreur: "Aucun rapport reçu." }, 400);

    const ref = slug(d.chantier);
    const suivi = d.type === "suivi";
    const commande = d.type === "commande";
    const photos = d.type === "photos";
    const reception = d.type === "reception";
    const etiquettes = d.type === "etiquettes";
    const sav = d.type === "sav";
    const reportage = d.type === "reportage";
    const autocontrole = d.type === "autocontrole";
    const carnet = d.type === "carnet";
    const memoire = d.type === "memoire";
    const doe = d.type === "doe";
    const technique = d.type === "technique";
    const point = d.type === "point";

    /* l'appli doit être attribuée au compte : refus côté serveur, pas seulement à l'écran */
    const appliVisee = APPLI_DU_TYPE[d.type] || "";
    if (appliVisee && !aAcces(personne, appliVisee)) {
      return json({ erreur: "Cette appli ne vous est pas attribuée. Voyez avec votre administrateur." }, 403);
    }

    /* un technicien crée un suivi de chantier et le transmet, mais ne modifie rien */
    const versDossier = d.dossier === true || d.dossier === "oui";
    if (!bureau) {
      if (!suivi && !commande && !photos && !reception && !etiquettes && !sav && !reportage && !autocontrole && !carnet && !memoire && !doe && !technique && !point) return json({ erreur: "Le relevé technique est réservé au bureau." }, 403);
      const vises = Array.isArray(d.destinataires) ? d.destinataires : [];
      const comptesSoc = await lireComptes(personne.societe);
      const idxV = await lireIndex();
      const equipeDossier = ((idxV.chantiers[ref] || {}).equipe) || [];
      const concernes = versDossier ? equipeDossier : vises;
      const auMoinsUnBureau = concernes.some((n) =>
        comptesSoc.some((u) => u.nom === n && (u.role === "bureau" || u.role === "admin")));
      if (!auMoinsUnBureau) {
        return json({ erreur: versDossier
          ? "Ce dossier n'a pas encore de chargé d'affaires : choisissez la personne destinataire."
          : "Choisissez le chargé d'affaires destinataire." }, 400);
      }
    }
    /* un relevé technique remplace le précédent ; un suivi crée une version par visite */
    /* commande : une par jour et par personne ; suivi : une par visite ; relevé : une seule */
    /* un document technique n'est pas toujours un PDF : plan, photo, schéma.
       On ne garde que les formats qu'un navigateur sait rouvrir. */
    const FORMATS_TECHNIQUE = ["pdf", "jpg", "jpeg", "png", "webp"];
    const ext = technique && FORMATS_TECHNIQUE.indexOf(String(d.ext || "pdf").toLowerCase()) >= 0
      ? String(d.ext).toLowerCase() : "pdf";
    if (technique && !String(d.titre || "").trim()) return json({ erreur: "Donnez un titre au document." }, 400);

    const nomFichier = technique
      ? "technique-" + slug(d.titre) + "-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "." + ext
      : (carnet || memoire || doe)
      ? (carnet ? "carnet-echantillons-" : doe ? "doe-" : "memoire-technique-")
        + slug(d.visite || d.date || new Date().toISOString().slice(0, 10)) + ".pdf"
      : autocontrole
      ? "autocontrole-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(d.visite || personne.nom) + ".pdf"
      : sav
      ? "sav-" + slug(d.date || new Date().toISOString().slice(0,10)) + "-" + slug(d.visite || personne.nom) + ".pdf"
      : reportage
      ? "reportage-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(d.visite || personne.nom) + ".pdf"
      : etiquettes
      ? "etiquettes-" + slug(d.etape || "tableau") + ".pdf"
      : reception
      ? "reception-" + slug(d.date || new Date().toISOString().slice(0, 10)) + ".pdf"
      : point
      ? "point-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(personne.nom) + ".pdf"
      : photos
      ? "photos-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(d.suiviId || personne.nom) + ".zip"
      : commande
        ? "commande-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(personne.nom) + ".pdf"
        : suivi
          /* chaque suivi est indépendant : un fichier par suivi, sans
             numéro de visite. Les anciens gardaient un seul rapport. */
          ? (d.suiviId
              ? "suivi-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(d.suiviId) + ".pdf"
              : "suivi-de-travaux.pdf")
          : "releve.pdf";
    const cle = ref + "/" + nomFichier;

    const octets = Buffer.from(d.pdf, "base64");
    if (octets.length > 5.5 * 1024 * 1024) return json({ erreur: "Rapport trop lourd pour la publication." }, 413);
    await store.set(cle, octets, { metadata: { type: typeDuFichier(cle) } });

    const idx = await lireIndex();
    const c = idx.chantiers[ref] || { ref, client: "", adresse: "", fichiers: [] };
    if (d.client) c.client = d.client;
    if (d.adresse) c.adresse = d.adresse;
    const pos = positionValide(d.lat, d.lon);
    if (pos) { c.lat = pos.lat; c.lon = pos.lon; }

    const ancien = c.fichiers.find((f) => f.cle === cle);
    if (ancien && !bureau && ancien.auteur !== personne.nom) {
      return json({ erreur: "Ce document a déjà été publié par " + ancien.auteur + "." }, 409);
    }
    const entree = {
      cle,
      titre: d.titre || (point ? "Le point de chantier" : technique ? "Document technique" : carnet ? "Carnet d'échantillons" : doe ? "Dossier des ouvrages exécutés" : memoire ? "Mémoire technique" : autocontrole ? "Fiche autocontrôle et mise en service" : reportage ? "Reportage photo" : sav ? "Intervention SAV" : etiquettes ? "Étiquettes de tableau" : reception ? "Procès-verbal de réception" : photos ? "Photos du chantier" : commande ? "Commande et reste à faire" : suivi ? "Suivi de chantier" : "Relevé technique"),
      type: point ? "point" : technique ? "technique" : carnet ? "carnet" : doe ? "doe" : memoire ? "memoire" : autocontrole ? "autocontrole" : reportage ? "reportage" : sav ? "sav" : etiquettes ? "etiquettes" : reception ? "reception" : photos ? "photos" : commande ? "commande" : suivi ? "suivi" : "releve",
      visite: d.visite || "",
      etape: d.etape || "",
      date: d.date || new Date().toISOString().slice(0, 10),
      auteur: bureau ? (d.auteur || personne.nom) : personne.nom,
      destinataires: versDossier ? [] : (Array.isArray(d.destinataires) ? d.destinataires : []),
      versDossier,
      taille: octets.length,
      publie: new Date().toISOString(),
      donnees: ancien ? !!ancien.donnees : false,
      versions: ancien ? (ancien.versions || 1) + 1 : 1,
      /* on garde qui a déjà ouvert : le rapport de suivi vit plusieurs visites */
      lectures: (ancien && ancien.lectures) ? ancien.lectures : {}
    };
    c.fichiers = c.fichiers.filter((f) => f.cle !== cle);
    /* un relevé publié n'est plus un relevé en cours */
    if (entree.type === "releve") {
      const brouillon = ref + "/releve-a-poursuivre.json";
      if (c.fichiers.some((f) => f.cle === brouillon)) {
        c.fichiers = c.fichiers.filter((f) => f.cle !== brouillon);
        try { await store.delete(brouillon); } catch { /* rien à retirer */ }
      }
    }
    if (entree.type === "releve") {
      /* le relevé publié constitue l'équipe du chantier */
      const equipe = new Set(c.equipe || []);
      equipe.add(entree.auteur);
      (entree.destinataires || []).forEach((n) => equipe.add(n));
      c.equipe = Array.from(equipe).filter(Boolean);
    } else if (!c.equipe || !c.equipe.length) {
      /* premier document d'un dossier sans relevé : son auteur en est responsable */
      c.equipe = [entree.auteur].filter(Boolean);
    }
    c.fichiers.push(entree);
    c.fichiers.sort((a, b) => rang(b) - rang(a));
    c.maj = new Date().toISOString();
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);

    /* Publier un relevé, c'est redire où en est l'affaire : le statut de
       sa conclusion reprend la main sur une mise de côté faite à la main. */
    if (entree.type === "releve" && statutAttendu(entree.etape)) {
      delete c.etat; delete c.attenteDepuis; delete c.attenteNote;
      delete c.attentePar; delete c.relanceLe;
      idx.chantiers[ref] = c;
      await store.setJSON(INDEX, idx);
    }

    let prevenus = [];
    if (!photos) {
      try { prevenus = await prevenir(entree, c, entree.auteur, url.origin, await lireComptes(personne.societe)); } catch { prevenus = []; }
      /* et sur le téléphone, sans faire attendre la publication */
      prevenirPush(store, magasinAnnuaire(), concernes(entree, c, entree.auteur), "documents", {
        titre: libelleDocument(entree),
        texte: (c.client || ref) + " — déposé par " + entree.auteur,
        url: "./chantier.html?ref=" + encodeURIComponent(ref),
        tag: "doc-" + cle
      }, contactPush(url.origin)).catch(() => {});
    }

    /* tâches datées : une entrée par tâche, pour les notifications */
    if (Array.isArray(d.taches)) {
      for (const t of d.taches) {
        const qui = String(t.qui || "").trim();
        const quand = String(t.quand || "").slice(0, 10);
        if (!qui || !quand) continue;                    /* sans qui ni quand, pas de rappel */
        const id = "taches/" + quand + "-" + slug(qui) + "-" + slug(String(t.texte || "").slice(0, 40))
          + "-" + Date.now().toString(36) + ".json";
        try {
          await store.setJSON(id, {
            texte: String(t.texte || ""), prio: t.prio || "", qui, quand,
            chantier: ref, client: d.client || "", auteur: personne.nom,
            cree: new Date().toISOString(), faite: false
          });
        } catch { /* la publication reste valable */ }
      }
    }

    /* les rappels des points bloquants d'un suivi : pour le conducteur
       de travaux seul. Une clé stable par point, pour qu'un suivi
       republié mette ses rappels à jour au lieu de les doubler ; ceux
       qui ont disparu (point levé, rappel coupé) sont retirés. */
    let nbRappels = 0;
    if (suivi && d.suiviId) {
      /* une clé par point et par chantier : un point repris dans un
         nouveau suivi garde un seul rappel, celui du suivi le plus récent */
      const prefixe = "taches/rappel-" + slug(ref) + "-";
      /* le rappel va à un compte qui existe : le nom exact, sinon
         l'identifiant, sinon le prénom (une session peut garder un nom
         affiché plus long que celui du compte) */
      let pour = String(d.rappelPour || "").trim() || personne.nom;
      try {
        const gens = await lireComptes(personne.societe);
        const bas = pour.toLowerCase();
        const trouve = gens.find((u) => u.nom === pour)
          || gens.find((u) => String(u.identifiant || "").toLowerCase() === bas)
          || gens.find((u) => String(u.nom || "").toLowerCase() === bas.split(/\s+/)[0]);
        if (trouve) pour = trouve.nom;
      } catch { /* on garde le nom tel quel */ }
      const gardes = new Set();
      for (const r of (Array.isArray(d.rappels) ? d.rappels : [])) {
        const quand = String(r.quand || "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(quand) || !String(r.texte || "").trim()) continue;
        const cleR = prefixe + slug(String(r.id || r.texte).slice(0, 40)) + ".json";
        gardes.add(cleR);
        let avant = null;
        try { avant = await store.get(cleR, { type: "json" }); } catch { avant = null; }
        try {
          await store.setJSON(cleR, {
            texte: String(r.texte), prio: "", qui: pour, quand, heure: /^\d{2}:\d{2}$/.test(r.heure || "") ? r.heure : "08:00",
            rappel: true, suivi: cle, suiviId: String(d.suiviId), chantier: ref, client: d.client || "", auteur: personne.nom,
            cree: (avant && avant.cree) || new Date().toISOString(),
            faite: !!(avant && avant.faite && avant.quand === quand),
            notifie: (avant && avant.notifie) || ""
          });
          nbRappels++;
        } catch { /* la publication reste valable */ }
      }
      /* ce suivi-ci ne demande plus ce rappel (point levé, rappel coupé,
         point retiré) : il s'en va ; ceux des autres suivis restent */
      try {
        const res = await store.list({ prefix: prefixe });
        for (const b of (res.blobs || [])) {
          if (gardes.has(b.key)) continue;
          let t = null;
          try { t = await store.get(b.key, { type: "json" }); } catch { t = null; }
          if (t && t.suiviId === String(d.suiviId)) { try { await store.delete(b.key); } catch { /* tant pis */ } }
        }
      } catch { /* rien d'ancien */ }
    }

    return json({ ok: true, ref, cle, remplace: !!ancien, versions: entree.versions, prevenus, rappels: nbRappels });
  }

  /* dépôt du contenu de la fiche, pour pouvoir la rouvrir plus tard dans l'appli */
  if (action === "deposer-fiche") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (!d.cle || (!d.donnees && typeof d.morceau !== "string")) return json({ erreur: "Fiche incomplète." }, 400);
    const idx = await lireIndex();
    const f = trouver(idx, d.cle);
    if (!bureau && (!f || f.auteur !== personne.nom)) return json({ erreur: "Modification interdite." }, 403);
    const cleFiche = d.cle.replace(/\.pdf$/, ".json");
    let donnees = d.donnees;
    /* un relevé chargé de photos dépasse ce qu'une seule requête peut
       porter : il arrive en morceaux, dans l'ordre, et on le reconstitue
       à l'arrivée du dernier */
    if (typeof d.morceau === "string") {
      const n = parseInt(d.n, 10), total = parseInt(d.total, 10);
      if (!(total > 0 && total <= 60 && n >= 0 && n < total)) return json({ erreur: "Morceau invalide." }, 400);
      await store.set(cleFiche + ".morceau-" + n, d.morceau, { metadata: { type: "text/plain" } });
      if (n < total - 1) return json({ ok: true, recu: n });
      const morceaux = [];
      for (let k = 0; k < total; k++) {
        const m = await store.get(cleFiche + ".morceau-" + k, { type: "text" });
        if (m == null) return json({ erreur: "Fiche incomplète : un morceau manque." }, 400);
        morceaux.push(m);
      }
      donnees = morceaux.join("");
      for (let k = 0; k < total; k++) {
        try { await store.delete(cleFiche + ".morceau-" + k); } catch { /* déjà parti */ }
      }
      try { JSON.parse(donnees); } catch { return json({ erreur: "Fiche illisible une fois reconstituée." }, 400); }
    }
    await store.set(cleFiche, donnees, { metadata: { type: "application/json" } });
    if (f) { f.donnees = true; await store.setJSON(INDEX, idx); }
    return json({ ok: true });
  }

  if (action === "deposer-brouillon") {
    /* relevé transmis à poursuivre : pas de PDF, juste la fiche et ses destinataires */
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (!d.fiche) return json({ erreur: "Relevé vide." }, 400);
    const ref = slug(d.chantier || d.client || "sans-ref").toUpperCase();
    const dest = Array.isArray(d.destinataires) ? d.destinataires.filter(Boolean) : [];
    if (!dest.length) return json({ erreur: "Choisissez au moins une personne." }, 400);
    const cle = ref + "/releve-a-poursuivre.json";
    await store.set(cle, d.fiche, { metadata: { type: "application/json" } });
    const idx = await lireIndex();
    const c = idx.chantiers[ref] || { ref, client: d.client || "", adresse: "", fichiers: [] };
    if (d.client) c.client = d.client;
    c.fichiers = c.fichiers.filter((f) => f.cle !== cle);
    c.fichiers.push({
      cle, titre: d.titre || "Relevé à poursuivre", type: "releve", visite: "", etape: "",
      date: d.date || new Date().toISOString().slice(0, 10),
      auteur: personne.nom, destinataires: dest, publie: new Date().toISOString(),
      donnees: true, brouillon: true, lectures: {}
    });
    c.maj = new Date().toISOString();
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    let prevenus = [];
    try { prevenus = await prevenir(
      { titre: d.titre || "Relevé à poursuivre", destinataires: dest, date: d.date || "", type: "releve" },
      { ref, client: d.client || "" }, personne.nom, url.origin, await lireComptes(personne.societe)); } catch { prevenus = []; }
    return json({ ok: true, ref, cle, prevenus });
  }

  if (action === "dossiers") {
    /* un dossier par ligne, avec ce qu'on peut en reprendre */
    const idx = await lireIndex();
    const out = [];
    Object.values(idx.chantiers).forEach((c) => {
      const visibles = (c.fichiers || []).filter((f) => voit(personne, f, c));
      if (!visibles.length) return;
      const fiche = (type) => {
        const t = visibles
          .filter((f) => f.type === type && f.donnees
            && (!f.brouillon || (f.destinataires || []).indexOf(personne.nom) >= 0))
          .sort((a, b) => (b.publie || "").localeCompare(a.publie || ""))[0];
        return t ? { cle: t.cle, date: t.date, titre: t.titre, brouillon: !!t.brouillon } : null;
      };
      out.push({
        ref: c.ref, client: c.client, adresse: c.adresse || "", maj: c.maj,
        lat: typeof c.lat === "number" ? c.lat : null,
        lon: typeof c.lon === "number" ? c.lon : null,
        documents: visibles.length,
        types: Array.from(new Set(visibles.map((f) => f.type))),
        releve: fiche("releve"),
        suivi: fiche("suivi")
      });
    });
    out.sort((a, b) => (b.maj || "").localeCompare(a.maj || ""));
    return json({ dossiers: out });
  }

  if (action === "fiches") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const idx = await lireIndex();
    const out = [];
    Object.values(idx.chantiers).forEach((c) => {
      c.fichiers.forEach((f) => {
        if (!f.donnees) return;
        /* un relevé transmis à poursuivre n'apparaît que chez la personne visée */
        if (f.brouillon && (f.destinataires || []).indexOf(personne.nom) < 0) return;
        out.push({ ref: c.ref, client: c.client, cle: f.cle, titre: f.titre, type: f.type,
          visite: f.visite, date: f.date, publie: f.publie, brouillon: !!f.brouillon });
      });
    });
    out.sort((a, b) => (b.publie || "").localeCompare(a.publie || ""));
    return json({ fiches: out });
  }

  if (action === "fiche") {
    const cle = (url.searchParams.get("cle") || "").replace(/\.pdf$/, ".json");
    const d = await store.get(cle, { type: "text" });
    if (!d) return json({ erreur: "Fiche introuvable." }, 404);
    return new Response(d, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }

  /* =====================================================================
     TO DO LIST : la mienne, et celles qu'on partage
     ---------------------------------------------------------------------
     Une liste appartient à celui qui l'a faite et vit dans son fichier.
     « partage » porte les noms de ceux qui la voient et l'écrivent avec
     lui : c'est ce qui permet de se passer des choses hors chantier —
     un achat à faire, un rendez-vous, une info d'agence.
     Le champ « pour », plus ancien, reste compris : il vaut un partage
     avec une seule personne.
     ===================================================================== */
  function partageDe(n) {
    const noms = Array.isArray(n.partage) ? n.partage : [];
    return n.pour && noms.indexOf(n.pour) < 0 ? noms.concat([n.pour]) : noms;
  }
  function laVoit(n, nom) { return partageDe(n).indexOf(nom) >= 0; }

  /* Deux personnes peuvent cocher en même temps. On fusionne case par
     case, sur la date de chaque case, plutôt que de laisser le dernier
     qui enregistre écraser la liste entière. */
  function fusionnerListe(stockee, venue, gardePartage) {
    const par = new Map();
    (stockee.items || []).forEach((i) => par.set(i.id, i));
    const vues = new Set();
    (venue.items || []).forEach((i) => {
      vues.add(i.id);
      const a = par.get(i.id);
      if (!a || String(i.maj || "") >= String(a.maj || "")) par.set(i.id, i);
    });
    /* une case absente de l'envoi a été supprimée là-bas — sauf si elle
       est plus récente que l'envoi, donc ajoutée ici entre-temps */
    for (const [id, i] of Array.from(par)) {
      if (!vues.has(id) && String(i.maj || "") <= String(venue.maj || "")) par.delete(id);
    }
    const ordonnees = (venue.items || []).map((i) => par.get(i.id)).filter(Boolean);
    for (const [id, i] of par) if (!vues.has(id)) ordonnees.push(i);
    /* le reste de la liste — titre, couleur, partage — suit la version
       la plus récente, mais le partage reste la main de l'auteur */
    const recente = String(venue.maj || "") >= String(stockee.maj || "") ? venue : stockee;
    const fond = { ...recente, auteur: stockee.auteur, items: ordonnees };
    /* le partage est la main de l'auteur : lui seul le change */
    return gardePartage
      ? { ...fond, partage: stockee.partage, pour: stockee.pour }
      : fond;
  }

  /* ---------- la mémoire des listes ----------
     Trois garde-fous, depuis que des listes entières ont disparu :
       1. un enregistrement AJOUTE et MET À JOUR, il ne retire jamais.
          Un écran qui n'envoie qu'une liste (le « Tout cocher » de
          l'accueil) ou un téléphone dont la mémoire a été vidée ne peut
          plus effacer les autres. Retirer une liste passe uniquement
          par « note-supprimer ».
       2. une liste supprimée va à la corbeille (60 jours), d'où on la
          fait revenir ; son identifiant empêche aussi un vieil écran de
          la ressusciter sans le vouloir.
       3. chaque jour, avant la première écriture, une copie complète
          est gardée (14 jours), et elle se restaure depuis la page. */
  const cleNotes = (nom) => "notes/" + slug(nom) + ".json";
  const cleCorbeille = (nom) => "notes-corbeille/" + slug(nom) + ".json";
  const prefixeSauvegardes = (nom) => "notes-sauvegardes/" + slug(nom) + "/";
  /* une lecture qui échoue n'est pas une liste vide : on s'arrête là,
     plutôt que de repartir de rien et d'écraser ce qui existe */
  async function lireNotes(cle) {
    const v = await store.get(cle, { type: "json" });
    return Array.isArray(v) ? v : [];
  }
  async function lireCorbeille(nom) {
    let v = [];
    try { v = (await store.get(cleCorbeille(nom), { type: "json" })) || []; } catch { v = []; }
    const limite = new Date(Date.now() - 60 * 864e5).toISOString();
    return (Array.isArray(v) ? v : []).filter((n) => String(n.supprimeeLe || "") >= limite);
  }
  async function sauvegarderDuJour(nom, contenu) {
    if (!contenu.length) return;
    const jour = new Date().toISOString().slice(0, 10);
    const pre = prefixeSauvegardes(nom);
    try {
      const deja = await store.get(pre + jour + ".json", { type: "json" });
      if (deja) return;
      await store.setJSON(pre + jour + ".json", contenu);
      const res = await store.list({ prefix: pre });
      const cles = (res.blobs || []).map((b) => b.key).sort();
      for (const k of cles.slice(0, Math.max(0, cles.length - 14))) {
        try { await store.delete(k); } catch { /* tant pis */ }
      }
    } catch { /* la sauvegarde ne doit jamais bloquer l'enregistrement */ }
  }

  if (action === "notes") {
    const cle = cleNotes(personne.nom);
    let mien;
    try { mien = await lireNotes(cle); }
    catch { return json({ erreur: "Listes momentanément illisibles. Réessayez." }, 503); }
    /* on ajoute les listes que d'autres partagent avec moi */
    const out = mien.slice();
    try {
      const res = await store.list({ prefix: "notes/" });
      for (const b of (res.blobs || [])) {
        if (b.key === cle) continue;
        const l = (await store.get(b.key, { type: "json" })) || [];
        l.forEach((n) => { if (laVoit(n, personne.nom)) out.push(n); });
      }
    } catch { /* rien d'autre */ }
    const corbeille = await lireCorbeille(personne.nom);
    return json({ listes: out, supprimees: corbeille.map((n) => n.id), moi: personne.nom });
  }

  if (action === "notes-enregistrer") {
    return sousVerrou(personne.societe + ":" + cleNotes(personne.nom), async () => {
      let d;
      try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
      if (!Array.isArray(d.listes)) return json({ erreur: "Listes attendues." }, 400);
      const cle = cleNotes(personne.nom);
      /* Une liste reçue ne devient pas la mienne : si son identifiant vit
         déjà chez quelqu'un d'autre, elle reste à lui, quoi qu'on m'envoie.
         Sans cela, il suffirait de renvoyer une liste partagée à son nom
         pour s'en emparer et en exclure les autres. */
      const ailleurs = new Set();
      try {
        const res = await store.list({ prefix: "notes/" });
        for (const b of (res.blobs || [])) {
          if (b.key === cle) continue;
          const l = (await store.get(b.key, { type: "json" })) || [];
          l.forEach((n) => ailleurs.add(n.id));
        }
      } catch { /* rien d'autre */ }
      let stockees;
      try { stockees = await lireNotes(cle); }
      catch { return json({ erreur: "Listes momentanément illisibles : rien n'a été écrit." }, 503); }
      await sauvegarderDuJour(personne.nom, stockees);
      const jetees = new Set((await lireCorbeille(personne.nom)).map((n) => n.id));
      /* Les listes déjà là restent, dans leur ordre. Une liste reçue
         remplace la sienne si elle est au moins aussi récente ; une liste
         partagée se fusionne case par case, même chez son auteur : un
         écran un peu vieux effacerait sinon ce qu'un collègue vient
         d'ajouter. */
      const par = new Map(stockees.map((n) => [n.id, n]));
      const nouvelles = [];
      d.listes
        .filter((n) => n && n.id && (!n.auteur || n.auteur === personne.nom))
        .filter((n) => !ailleurs.has(n.id) && !jetees.has(n.id))
        .forEach((n) => {
          const vieille = par.get(n.id);
          if (!vieille) { const l = { ...n, auteur: personne.nom }; par.set(n.id, l); nouvelles.push(n.id); return; }
          if (partageDe(vieille).length) { par.set(n.id, { ...fusionnerListe(vieille, n, false), auteur: personne.nom }); return; }
          if (String(n.maj || "") >= String(vieille.maj || "")) par.set(n.id, { ...n, auteur: personne.nom });
        });
      const ordre = nouvelles.concat(stockees.map((n) => n.id));
      const miennes = ordre.map((id) => par.get(id)).filter(Boolean).slice(0, 500);
      await store.setJSON(cle, miennes);

      /* ce qu'on écrit sur une liste partagée remonte chez son auteur —
         et seulement si on fait bien partie du partage. */
      const recues = d.listes.filter((n) => n && n.auteur && n.auteur !== personne.nom);
      for (const n of recues) {
        const autre = cleNotes(n.auteur);
        try {
          const l = (await store.get(autre, { type: "json" })) || [];
          const i = l.findIndex((x) => x.id === n.id);
          if (i < 0 || !laVoit(l[i], personne.nom)) continue;
          l[i] = fusionnerListe(l[i], n, true);
          await store.setJSON(autre, l);
        } catch { /* l'auteur n'a rien encore */ }
      }
      return json({ ok: true, enregistrees: miennes.length });
    });
  }

  if (action === "note-supprimer") {
    return sousVerrou(personne.societe + ":" + cleNotes(personne.nom), async () => {
      const id = url.searchParams.get("id") || "";
      const cle = cleNotes(personne.nom);
      try {
        const l = await lireNotes(cle);
        const jetee = l.find((n) => n.id === id);
        if (jetee) {
          /* d'abord la corbeille, ensuite seulement le retrait */
          const corbeille = (await lireCorbeille(personne.nom)).filter((n) => n.id !== id);
          corbeille.unshift({ ...jetee, supprimeeLe: new Date().toISOString() });
          await store.setJSON(cleCorbeille(personne.nom), corbeille.slice(0, 100));
          await store.setJSON(cle, l.filter((n) => n.id !== id));
          return json({ ok: true });
        }
      } catch { return json({ erreur: "Suppression impossible pour le moment." }, 503); }
      /* la liste n'est pas la mienne : je me retire du partage, je ne la
         supprime pas chez son auteur. */
      try {
        const res = await store.list({ prefix: "notes/" });
        for (const b of (res.blobs || [])) {
          if (b.key === cle) continue;
          const l = (await store.get(b.key, { type: "json" })) || [];
          const i = l.findIndex((n) => n.id === id && laVoit(n, personne.nom));
          if (i < 0) continue;
          l[i] = { ...l[i],
            partage: partageDe(l[i]).filter((x) => x !== personne.nom),
            pour: l[i].pour === personne.nom ? "" : l[i].pour };
          await store.setJSON(b.key, l);
          return json({ ok: true, retire: true });
        }
      } catch { /* rien à faire */ }
      return json({ ok: true });
    });
  }

  /* la corbeille et les copies du jour, pour tout récupérer */
  if (action === "notes-corbeille") {
    const corbeille = await lireCorbeille(personne.nom);
    const sauvegardes = [];
    try {
      const res = await store.list({ prefix: prefixeSauvegardes(personne.nom) });
      for (const b of (res.blobs || [])) {
        const jour = b.key.slice(-15, -5);
        const l = (await store.get(b.key, { type: "json" })) || [];
        sauvegardes.push({ jour, listes: l.length,
          taches: l.reduce((a, n) => a + (n.items || []).length, 0),
          titres: l.slice(0, 6).map((n) => n.titre || "Sans titre") });
      }
    } catch { /* aucune */ }
    sauvegardes.sort((x, y) => y.jour.localeCompare(x.jour));
    return json({ corbeille: corbeille.map((n) => ({ id: n.id, titre: n.titre || "", supprimeeLe: n.supprimeeLe,
      taches: (n.items || []).length, couleur: n.couleur || "" })), sauvegardes });
  }

  if (action === "note-restaurer" || action === "notes-restaurer-jour") {
    return sousVerrou(personne.societe + ":" + cleNotes(personne.nom), async () => {
      const cle = cleNotes(personne.nom);
      let l;
      try { l = await lireNotes(cle); }
      catch { return json({ erreur: "Listes momentanément illisibles." }, 503); }
      const ids = new Set(l.map((n) => n.id));
      let corbeille = await lireCorbeille(personne.nom);
      let revenues = [];
      if (action === "note-restaurer") {
        const id = url.searchParams.get("id") || "";
        const n = corbeille.find((x) => x.id === id);
        if (!n) return json({ erreur: "Cette liste n'est plus dans la corbeille." }, 404);
        const { supprimeeLe, ...propre } = n;
        revenues = [{ ...propre, maj: new Date().toISOString() }];
      } else {
        const jour = String(url.searchParams.get("jour") || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return json({ erreur: "Jour attendu." }, 400);
        let copie = null;
        try { copie = await store.get(prefixeSauvegardes(personne.nom) + jour + ".json", { type: "json" }); } catch { copie = null; }
        if (!Array.isArray(copie)) return json({ erreur: "Pas de copie ce jour-là." }, 404);
        /* on rapporte ce qui manque aujourd'hui, sans toucher au reste */
        revenues = copie.filter((n) => !ids.has(n.id)).map((n) => ({ ...n, maj: new Date().toISOString() }));
      }
      revenues = revenues.filter((n) => !ids.has(n.id));
      const rid = new Set(revenues.map((n) => n.id));
      corbeille = corbeille.filter((n) => !rid.has(n.id));
      await sauvegarderDuJour(personne.nom, l);
      await store.setJSON(cle, revenues.concat(l));
      await store.setJSON(cleCorbeille(personne.nom), corbeille);
      return json({ ok: true, restaurees: revenues.length, ids: revenues.map((n) => n.id) });
    });
  }

  /* ---------- tâches datées ---------- */
  if (action === "taches") {
    const out = [];
    try {
      const res = await store.list({ prefix: "taches/" });
      for (const b of (res.blobs || [])) {
        const t = await store.get(b.key, { type: "json" });
        if (!t || t.faite) continue;
        if (!bureau && t.qui !== personne.nom) continue;   /* chacun voit les siennes */
        if (t.rappel && t.qui !== personne.nom) continue;  /* un rappel n'est qu'à son conducteur de travaux */
        out.push({ cle: b.key, ...t });
      }
    } catch { /* rien de stocké */ }
    out.sort((a, b) => (a.quand || "").localeCompare(b.quand || ""));
    return json({ taches: out });
  }

  if (action === "tache-faite") {
    const cle = url.searchParams.get("cle") || "";
    if (cle.indexOf("taches/") !== 0) return json({ erreur: "Tâche introuvable." }, 404);
    let t = null;
    try { t = await store.get(cle, { type: "json" }); } catch { /* absente */ }
    if (!t) return json({ erreur: "Tâche introuvable." }, 404);
    if (!bureau && t.qui !== personne.nom) return json({ erreur: "Tâche d'une autre personne." }, 403);
    t.faite = true;
    t.faitePar = personne.nom;
    t.faiteLe = new Date().toISOString();
    await store.setJSON(cle, t);
    return json({ ok: true });
  }

  if (action === "demandes") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const out = [];
    try {
      const res = await store.list({ prefix: "demandes/" });
      for (const b of (res.blobs || [])) {
        const d = await store.get(b.key, { type: "json" });
        if (d) out.push({ cle: b.key, ...d });
      }
    } catch { /* aucune demande */ }
    out.sort((a, b) => (b.recue || "").localeCompare(a.recue || ""));
    return json({ demandes: out });
  }

  if (action === "demande-traitee") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const cle = url.searchParams.get("cle") || "";
    if (cle.indexOf("demandes/") !== 0) return json({ erreur: "Demande introuvable." }, 404);
    try { await store.delete(cle); } catch { /* déjà retirée */ }
    return json({ ok: true });
  }

  /* ---------- équipe du dossier ---------- */
  if (action === "equipe-dossier") {
    const ref = slug(url.searchParams.get("ref") || "").toUpperCase();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    const equipe = c.equipe || [];
    const membre = equipe.indexOf(personne.nom) >= 0
      || c.fichiers.some((f) => voit(personne, f, c));
    if (!membre) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const comptes = await lireComptes(personne.societe);
    return json({
      ref, client: c.client || "", equipe,
      auteur: (c.fichiers[0] || {}).auteur || "",
      personnes: comptes.map((u) => ({ nom: u.nom, role: u.role })),
      peutModifier: bureau
    });
  }

  if (action === "equipe-dossier-enregistrer") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ref = slug(d.ref || "").toUpperCase();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    const comptes = await lireComptes(personne.societe);
    const connus = comptes.map((u) => u.nom);
    const equipe = (Array.isArray(d.equipe) ? d.equipe : []).filter((n) => connus.indexOf(n) >= 0);
    /* l'auteur des documents garde toujours son dossier */
    c.fichiers.forEach((f) => { if (f.auteur && equipe.indexOf(f.auteur) < 0) equipe.push(f.auteur); });
    c.equipe = equipe;
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    return json({ ok: true, equipe });
  }

  /* ---------- notifications sur le téléphone ---------- */
  if (action === "push-cle") {
    return json({ cle: (await clesVapid(magasinAnnuaire())).publique });
  }
  if (action === "push-etat") {
    const f = await lireAbonne(store, personne.nom);
    const ep = url.searchParams.get("endpoint") || "";
    return json({ prefs: f.prefs, appareils: f.abonnements.length,
      cetAppareil: !!ep && f.abonnements.some((a) => a.endpoint === ep) });
  }
  if (action === "push-abonner" || action === "push-desabonner" || action === "push-prefs") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const f = await lireAbonne(store, personne.nom);
    if (action === "push-abonner") {
      const a = d.abonnement || {};
      if (!/^https:\/\//.test(a.endpoint || "") || !a.keys || !a.keys.p256dh || !a.keys.auth) {
        return json({ erreur: "Abonnement illisible." }, 400);
      }
      f.abonnements = f.abonnements.filter((x) => x.endpoint !== a.endpoint);
      f.abonnements.push({ endpoint: a.endpoint, keys: { p256dh: a.keys.p256dh, auth: a.keys.auth },
        appareil: String(d.appareil || "").slice(0, 80), le: new Date().toISOString(),
        contact: contactPush(url.origin) });
      if (f.abonnements.length > 8) f.abonnements = f.abonnements.slice(-8);
    } else if (action === "push-desabonner") {
      f.abonnements = f.abonnements.filter((x) => x.endpoint !== d.endpoint);
    } else {
      for (const k of Object.keys(PREFS_DEFAUT)) if (typeof d[k] === "boolean") f.prefs[k] = d[k];
    }
    await store.setJSON(cleAbonne(personne.nom), f);
    return json({ ok: true, prefs: f.prefs, appareils: f.abonnements.length });
  }
  if (action === "push-essai") {
    const prevenus = await prevenirPush(store, magasinAnnuaire(), [personne.nom], "essai", {
      titre: "Notifications activées",
      texte: "C'est ici que vous serez prévenu : messages, documents et rappels.",
      url: "./index.html", tag: "essai"
    }, contactPush(url.origin));
    return json({ ok: prevenus.length > 0 });
  }

  /* ---------- discussion du dossier ---------- */
  function cleMessages(ref) { return "messages/" + ref + ".json"; }
  async function lireMessages(ref) {
    try { return (await store.get(cleMessages(ref), { type: "json" })) || { messages: [], lectures: {} }; }
    catch { return { messages: [], lectures: {} }; }
  }
  function membreDe(c) {
    return (c.equipe || []).indexOf(personne.nom) >= 0 || c.fichiers.some((f) => voit(personne, f, c));
  }

  if (action === "messages") {
    const ref = slug(url.searchParams.get("ref") || "").toUpperCase();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    if (!membreDe(c)) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const d = await lireMessages(ref);
    /* on note la lecture */
    const dernier = d.messages.length ? d.messages[d.messages.length - 1].id : "";
    if (dernier && d.lectures[personne.nom] !== dernier) {
      d.lectures[personne.nom] = dernier;
      await store.setJSON(cleMessages(ref), d);
    }
    return json({ ref, client: c.client || "", messages: d.messages,
      lectures: d.lectures, equipe: c.equipe || [] });
  }

  if (action === "message-envoyer") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ref = slug(d.ref || "").toUpperCase();
    const texte = String(d.texte || "").trim();
    const photo = typeof d.photo === "string" ? d.photo : "";
    if (!texte && !photo) return json({ erreur: "Message vide." }, 400);
    if (texte.length > 4000) return json({ erreur: "Message trop long." }, 400);
    if (photo && photo.length > 900000) return json({ erreur: "Photo trop lourde." }, 400);
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    if (!membreDe(c)) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);

    const fil = await lireMessages(ref);
    const message = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      auteur: personne.nom, texte, photo, quand: new Date().toISOString() };
    fil.messages.push(message);
    if (fil.messages.length > 200) fil.messages = fil.messages.slice(-200);
    fil.lectures[personne.nom] = message.id;
    await store.setJSON(cleMessages(ref), fil);

    /* on prévient l'équipe par e-mail */
    const comptes = await lireComptes(personne.societe);
    const vises = (c.equipe || []).filter((n) => n !== personne.nom);
    const cibles = comptes.filter((u) => vises.indexOf(u.nom) >= 0 && u.email && u.email.indexOf("@") > 0);
    let prevenus = [];
    if (cibles.length) {
      const lien = url.origin + "/rapports.html";
      const sujet = "Message — " + (c.client || ref);
      const corpsMail = personne.nom + " a écrit sur le chantier " + (c.client || ref) + " :\n\n"
        + (texte || "(photo)") + "\n\nRépondre ici : " + lien + "\n\nSuivi travaux 360";
      for (const u of cibles) {
        if (await envoyerMail(u.email, sujet, corpsMail)) prevenus.push(u.nom);
      }
    }
    prevenirPush(store, magasinAnnuaire(), vises, "messages", {
      titre: "Message — " + (c.client || ref),
      texte: personne.nom + " : " + (texte ? texte.slice(0, 160) : "une photo"),
      url: "./rapports.html?discussion=" + encodeURIComponent(ref),
      tag: "discu-" + ref
    }, contactPush(url.origin)).catch(() => {});
    return json({ ok: true, message, prevenus });
  }

  if (action === "messages-non-lus") {
    const idx = await lireIndex();
    const out = [];
    for (const c of Object.values(idx.chantiers)) {
      if (!membreDe(c)) continue;
      const d = await lireMessages(c.ref);
      if (!d.messages.length) continue;
      const vu = d.lectures[personne.nom] || "";
      let n = 0;
      for (let i = d.messages.length - 1; i >= 0; i--) {
        if (d.messages[i].id === vu) break;
        if (d.messages[i].auteur !== personne.nom) n++;
      }
      if (n) out.push({ ref: c.ref, client: c.client || c.ref, nb: n,
        dernier: d.messages[d.messages.length - 1] });
    }
    return json({ dossiers: out, total: out.reduce((a, x) => a + x.nb, 0) });
  }

  if (action === "liste") {
    const idx = await lireIndex();
    const chantiers = [];
    Object.values(idx.chantiers).forEach((c) => {
      const fichiers = c.fichiers.filter((f) => voit(personne, f, c));
      const visibles = fichiers.filter((f) => !f.brouillon);
      if (visibles.length) chantiers.push({ ref: c.ref, client: c.client, adresse: c.adresse, maj: c.maj,
        lat: typeof c.lat === "number" ? c.lat : null,
        lon: typeof c.lon === "number" ? c.lon : null,
        ...etatDossier(c),
        avancement: avancementDe(c),
        avancementPar: c.avancementPar || "",
        avancementLe: c.avancementLe || "",
        equipe: c.equipe || [],
        fichiers: visibles });
    });
    chantiers.sort((a, b) => (b.maj || "").localeCompare(a.maj || ""));
    return json({ chantiers, moi: { nom: personne.nom, role: personne.role } });
  }

  /* ---------- l'avancement du chantier ----------
     Seul un chargé d'affaires de l'équipe du dossier le règle : c'est lui
     qui suit l'affaire, pas le technicien ni un collègue d'un autre
     dossier. */
  if (action === "avancement") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ref = String(d.ref || "").trim();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    if (!bureau || (c.equipe || []).indexOf(personne.nom) < 0) {
      return json({ erreur: "Seul le chargé d'affaires du dossier règle l'avancement." }, 403);
    }
    const n = Math.round(Number(d.valeur));
    if (!isFinite(n) || n < 0 || n > 100) return json({ erreur: "Avancement entre 0 et 100 %." }, 400);
    c.avancement = n;
    c.avancementPar = personne.nom;
    c.avancementLe = new Date().toISOString();
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    return json({ ok: true, ref, avancement: n });
  }

  /* ---------- mettre un dossier de côté, ou le reprendre ---------- */
  if (action === "chantier-etat") {
    if (!bureau) return json({ erreur: "Seul le bureau met un dossier en attente." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ref = String(d.ref || "").trim();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    const maintenant = new Date().toISOString();
    if (d.etat === "attente") {
      /* remettre en attente un dossier déjà en attente, c'est répondre à
         la relance : la date d'origine ne bouge pas, le compteur repart. */
      if (c.etat !== "attente") { c.attenteDepuis = maintenant; c.attentePar = personne.nom; }
      c.etat = "attente";
      c.relanceLe = maintenant;
      if (typeof d.note === "string") c.attenteNote = d.note.trim().slice(0, 200);
    } else {
      /* on écrit « actif » au lieu d'effacer : sans cela le dossier
         retomberait aussitôt en attente, puisque le relevé, lui, dit
         toujours que le devis attend une réponse. */
      c.etat = "actif";
      delete c.attenteDepuis; delete c.attenteNote;
      delete c.attentePar; delete c.relanceLe;
    }
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    return json({ ok: true, ref, ...etatDossier(c) });
  }

  if (action === "commande-saisie") {
    /* Le bureau dit au technicien que la commande est passée chez le
       fournisseur. Une seule marque par commande, avec qui et quand,
       et un mot facultatif : « livrée mardi », « le 32A manque ». */
    if (!bureau) return json({ erreur: "Seul le bureau marque une commande saisie." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const cle = String(d.cle || "").trim();
    const idx = await lireIndex();
    const f = trouver(idx, cle);
    if (!f) return json({ erreur: "Commande introuvable." }, 404);
    if (f.type !== "commande") return json({ erreur: "Seule une commande se marque saisie." }, 400);
    if (!voit(personne, f, chantierDe(idx, cle))) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);

    if (d.saisie === false) delete f.saisie;
    else f.saisie = { par: personne.nom, le: new Date().toISOString(),
                      note: String(d.note || "").trim().slice(0, 200) };
    await store.setJSON(INDEX, idx);
    return json({ ok: true, saisie: f.saisie || null });
  }

  if (action === "position-enregistrer") {
    /* la carte des chantiers retient ici le point trouvé pour un dossier,
       qu'il vienne d'une recherche d'adresse ou d'un point posé à la main */
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ref = String(d.ref || "").trim();
    if (!ref) return json({ erreur: "Référence manquante." }, 400);
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Chantier introuvable." }, 404);
    if (!(c.fichiers || []).some((f) => voit(personne, f, c))) {
      return json({ erreur: "Ce chantier ne vous est pas attribué." }, 403);
    }
    if (d.lat === null && d.lon === null) {
      delete c.lat; delete c.lon;
      await store.setJSON(INDEX, idx);
      return json({ ok: true, lat: null, lon: null });
    }
    const pos = positionValide(d.lat, d.lon);
    if (!pos) return json({ erreur: "Position invalide." }, 400);
    c.lat = pos.lat; c.lon = pos.lon;
    if (d.adresse) c.adresse = String(d.adresse).slice(0, 300);
    await store.setJSON(INDEX, idx);
    return json({ ok: true, lat: c.lat, lon: c.lon, adresse: c.adresse || "" });
  }

  if (action === "sav-traite") {
    /* acquittement d'une intervention SAV : la suite a été traitée */
    const cle = url.searchParams.get("cle") || "";
    const idx = await lireIndex();
    const f = trouver(idx, cle);
    if (!f) return json({ erreur: "Fiche introuvable." }, 404);
    if (!voit(personne, f, chantierDe(idx, cle))) return json({ erreur: "Fiche non attribuée." }, 403);
    f.suiteTraitee = { par: personne.nom, le: new Date().toISOString() };
    await store.setJSON(INDEX, idx);
    return json({ ok: true, suiteTraitee: f.suiteTraitee });
  }

  if (action === "lu") {
    /* accusé de lecture explicite : la page l'appelle à l'ouverture du document,
       ce qui reste fiable même si le PDF sort du cache du navigateur */
    const cle = url.searchParams.get("cle") || "";
    const idx = await lireIndex();
    const f = trouver(idx, cle);
    if (!f) return json({ erreur: "Rapport introuvable." }, 404);
    if (!voit(personne, f, chantierDe(idx, cle))) return json({ erreur: "Ce rapport ne vous est pas attribué." }, 403);
    f.lectures = f.lectures || {};
    const deja = f.lectures[personne.nom];
    /* on note la lecture, et on la rafraîchit si le document a été mis à jour depuis */
    if (!deja || (f.publie && String(deja) < String(f.publie))) {
      f.lectures[personne.nom] = new Date().toISOString();
      await store.setJSON(INDEX, idx);
    }
    return json({ ok: true, lectures: f.lectures });
  }

  if (action === "fichier") {
    const cle = url.searchParams.get("cle") || "";
    const idx = await lireIndex();
    const f = trouver(idx, cle);
    if (!f) return json({ erreur: "Rapport introuvable." }, 404);
    if (!voit(personne, f, chantierDe(idx, cle))) return json({ erreur: "Ce rapport ne vous est pas attribué." }, 403);
    const blob = await store.get(cle, { type: "arrayBuffer" });
    if (!blob) return json({ erreur: "Rapport introuvable." }, 404);

    /* accusé de lecture : première ouverture par chaque personne */
    try {
      f.lectures = f.lectures || {};
      if (!f.lectures[personne.nom]) {
        f.lectures[personne.nom] = new Date().toISOString();
        await store.setJSON(INDEX, idx);
      }
    } catch { /* la lecture du document prime sur son suivi */ }

    const zip = cle.endsWith(".zip");
    return new Response(blob, {
      headers: {
        "content-type": typeDuFichier(cle),
        "content-disposition": (zip ? "attachment" : "inline") + '; filename="' + cle.split("/").pop() + '"',
        "cache-control": "no-store"
      }
    });
  }

  /* archivage : suppression de tout un chantier après export */
  if (action === "supprimer-chantier") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const ref = (url.searchParams.get("ref") || "").trim();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Chantier introuvable." }, 404);
    let n = 0;
    for (const f of c.fichiers) {
      await store.delete(f.cle);
      await store.delete(f.cle.replace(/\.pdf$/, ".json"));
      n++;
    }
    delete idx.chantiers[ref];
    await store.setJSON(INDEX, idx);
    return json({ ok: true, supprimes: n });
  }

  if (action === "brouillon-supprimer") {
    /* abandonner un relevé enregistré mais jamais publié */
    const ref = slug(url.searchParams.get("ref") || "").toUpperCase();
    const cle = ref + "/releve-a-poursuivre.json";
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    const f = c.fichiers.find((x) => x.cle === cle);
    if (!f) return json({ erreur: "Aucun relevé en cours sur ce dossier." }, 404);
    if (f.auteur !== personne.nom && (f.destinataires || []).indexOf(personne.nom) < 0) {
      return json({ erreur: "Ce relevé ne vous appartient pas." }, 403);
    }
    c.fichiers = c.fichiers.filter((x) => x.cle !== cle);
    if (!c.fichiers.length) delete idx.chantiers[ref];
    else idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    try { await store.delete(cle); } catch { /* rien à retirer */ }
    return json({ ok: true });
  }

  if (action === "supprimer") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const cle = url.searchParams.get("cle") || "";
    await store.delete(cle);
    await store.delete(cle.replace(/\.pdf$/, ".json"));
    const idx = await lireIndex();
    const ref = cle.split("/")[0];
    if (idx.chantiers[ref]) {
      idx.chantiers[ref].fichiers = idx.chantiers[ref].fichiers.filter((f) => f.cle !== cle);
      if (!idx.chantiers[ref].fichiers.length) delete idx.chantiers[ref];
      await store.setJSON(INDEX, idx);
    }
    return json({ ok: true });
  }

  return json({ erreur: "Action inconnue." }, 400);
}

export const config = { path: "/api/rapports" };
