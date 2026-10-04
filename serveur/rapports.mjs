import { getStore } from "./magasin.mjs";
import { PROPRIETAIRE, SOCIETE_DEPART, SOCIETE_DEMO } from "./equipe.mjs";
import { DEMO } from "./demo.mjs";
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { lireIcs, occupations, creneauxLibres, ics as ecrireIcs, versUtc, champs as champsZone, PARIS } from "./agenda.mjs";
import { clesVapid, prevenirPush, lireAbonne, cleAbonne, repererRappelsDus, PREFS_DEFAUT, maintenantParis, nomDuCompte, envoyerAttentes } from "./notifications.mjs";
/* le jour à Paris (et non en heure universelle : passé minuit, c'était encore la veille) */
function jourParis() { return maintenantParis().slice(0, 10); }

const INDEX = "_index";


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
    entree.type === "schema" ? "Schéma unifilaire" + (entree.etape ? " — " + entree.etape : "")
    : entree.type === "commande" ? "Commande et reste à faire"
    : entree.type === "suivi" ? (entree.visite ? "Suivi de chantier — visite n° " + entree.visite : (entree.titre || "Suivi de chantier"))
    : entree.type === "reportage" ? "Reportage photo" + (entree.visite ? " — " + entree.visite : "")
    : entree.type === "autocontrole" ? "Fiche autocontrôle et mise en service"
    : entree.type === "carnet" ? "Carnet d'échantillons"
    : entree.type === "memoire" ? "Mémoire technique"
    : entree.type === "doe" ? "Dossier des ouvrages exécutés"
    : entree.type === "point" ? (entree.titre || "Le point de chantier")
    : entree.type === "technique" ? "Document technique" + (entree.visite ? " — " + entree.visite : "")
    : entree.type === "sav" ? (entree.fiche === "appel" ? "Réception d'appel SAV" : entree.demandeClient ? (entree.titre || "Demande d'intervention du client") : entree.brouillon ? "Intervention SAV à terminer" : "Intervention SAV")
    : entree.type === "reception" ? "Procès-verbal de réception"
    : entree.type === "etiquettes" ? "Étiquettes de tableau"
    : entree.type === "photos" ? "Photos du chantier"
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
/* Les TS pas encore chiffrés du dernier suivi de chaque chantier, pour
   le tableau de bord : relire toutes les fiches (photos comprises) à
   chaque ouverture serait lourd ; on les garde tant que la fiche ne
   change pas. */
const CACHE_TS = new Map();
let DERNIERE_PURGE = 0;
const DUREE_DEMANDES = 3 * 365.25 * 24 * 3600 * 1000;
export async function purgerDemandesAcces(maintenant) {
  const t = maintenant || Date.now();
  const store = getStore("rapports");
  const res = await store.list({ prefix: "demandes/" });
  let n = 0;
  for (const b of (res.blobs || [])) {
    const quand = Number((/^demandes\/(\d{12,})-/.exec(b.key) || [])[1]);
    if (quand && t - quand > DUREE_DEMANDES) { try { await store.delete(b.key); n++; } catch { /* suivante */ } }
  }
  return n;
}
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
        try { lots.push({ store, dus: await repererRappelsDus(store), code: soc.code }); } catch { /* société suivante */ }
      }
    } catch { /* on réessaiera */ }
    /* les demandes d'accès s'effacent 3 ans après leur arrivée (politique de confidentialité) ;
       la date est au début de la clé, une fois par jour suffit */
    if (Date.now() - DERNIERE_PURGE > 24 * 3600 * 1000) {
      DERNIERE_PURGE = Date.now();
      try { await purgerDemandesAcces(); } catch { /* demain */ }
      try { for (const soc of await lireSocietes()) await purgerContacts(magasinSociete(soc.code)); } catch { /* demain */ }
    }
  });
  let n = 0;
  /* la fin du silence de la nuit : ce qui a attendu part maintenant */
  for (const l of lots) { try { n += await envoyerAttentes(l.store, annuaire, contactPush("")); } catch { /* minute suivante */ } }
  for (const l of lots) {
    let comptes = [];
    if (l.dus.length) { try { comptes = await lireComptes(l.code); } catch { comptes = []; } }
    for (const r of l.dus) {
      try { n += (await prevenirPush(l.store, annuaire, [r.qui], "rappels", r.charge, contactPush(""), { comptes })).length; } catch { /* suivant */ }
    }
  }
  return n;
}
/* plus d'e-mails : on prévient sur le téléphone (notifications) et dans l'appli */
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
    /* la société de départ portait le nom d'un employeur sans rapport avec le
       site : elle reprend celui du site, sans ville ni métier imposés */
    const dep = liste.find((x) => x.code === SOCIETE_DEPART.code);
    if (dep && /trichet|lou[eé]\s*[eé]nergies/i.test(dep.nom || "")) {
      dep.nom = SOCIETE_DEPART.nom; dep.metier = SOCIETE_DEPART.metier; dep.ville = SOCIETE_DEPART.ville;
      corrige = true;
    }
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
/* version des conditions générales d'utilisation (cgu.html) : la changer
   quand le texte change, chacun les réacceptera à sa prochaine visite */
const CGU_VERSION = "2026-10-03";
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
/* ---------- l'outil KNX, réservé ----------
   Son code est dans prive/, que le serveur ne sert jamais tel quel. Il ne
   le livre qu'à l'administrateur, ou à une personne qui a son code
   d'accès : un code par personne, tiré au sort par l'administrateur, dont
   la base ne garde que l'empreinte. L'appareil qui l'a ouvert reçoit une
   clé qui lui évite de retaper le code, et qui cesse de valoir dès que
   l'administrateur en tire un nouveau ou le retire. */
const ESSAIS_KNX = new Map();
function codeKnx() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";          /* ni 0/O ni 1/I */
  const b = randomBytes(8);
  let t = "";
  for (let i = 0; i < 8; i++) t += alphabet[b[i] % alphabet.length];
  return "KNX-" + t.slice(0, 4) + "-" + t.slice(4);
}
function cleKnx(societe, id, compte) {
  return createHmac("sha256", compte.knx.empreinte).update("knx|" + societe + "|" + id).digest("hex").slice(0, 32);
}
async function scriptKnx() {
  const lire = (f) => readFile(new URL("../prive/" + f, import.meta.url), "utf8");
  return (await lire("knx-liaisons.js")) + "\n" + (await lire("knx-outil.js"));
}

/* ---------- applis du site et droits d'accès ---------- */
/* Une liste vide vaut « toutes les applis ». L'administrateur et le
   propriétaire gardent tout, quoi qu'on leur attribue. */
const APPLIS = ["releve", "suivi", "commande", "reception", "autocontrole", "sav", "etiquettes", "photos", "carnet", "technique", "schema"];
const APPLI_DU_TYPE = {
  releve: "releve", suivi: "suivi", commande: "commande", reception: "reception",
  autocontrole: "autocontrole", sav: "sav", etiquettes: "etiquettes", reportage: "photos",
  carnet: "carnet", memoire: "carnet", doe: "carnet", technique: "technique",
  point: "commande", schema: "schema"
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
   ce qui marche sur n'importe quel hébergement, et ne peut pas
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
/* Le photovoltaïque d'un relevé, en trois chiffres pour la fiche du
   chantier : nombre de panneaux, puissance crête, batterie ou non. Le
   nombre de panneaux se déduit de la puissance et de celle d'un panneau,
   sinon des implantations dessinées sur la toiture. */
function resumePv(fiche) {
  const pv = fiche && fiche.pv;
  if (!pv || pv.actif !== "oui") return null;
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(",", ".")); return isFinite(n) && n > 0 ? n : 0; };
  const wc = num(pv.wc) || 500;
  let kwc = num(pv.kwc);
  let panneaux = kwc ? Math.round(kwc * 1000 / wc) : 0;
  if (!panneaux) {
    panneaux = (Array.isArray(pv.simuls) ? pv.simuls : []).reduce((t, x) => t + (parseInt(x && x.nb, 10) || 0), 0);
    if (panneaux && !kwc) kwc = Math.round(panneaux * wc / 10) / 100;
  }
  const batteries = parseInt(pv.nbBat, 10) || 0;
  return { panneaux, kwc, wc, batteries, backup: String(pv.backup || ""),
           irve: !!(pv.irve && pv.irve.actif) };
}
const CACHE_PV = new Map();

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
    aChanger, cgu: (u.cgu && u.cgu.version) || "" };
}
function personneDuProprietaire(code) {
  /* le secours entre avec le mot de passe écrit dans le code : la
     première chose à faire est d'en poser un vrai. */
  return { nom: PROPRIETAIRE.nom, role: "admin", proprietaire: true, societe: code,
    email: PROPRIETAIRE.email, applis: [], identifiant: PROPRIETAIRE.identifiant,
    aChanger: true, cgu: "" };
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

/* deux écritures d'un même nom : sans accents, sans majuscules, sans ponctuation */
function memeNom(a, b) {
  const p = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return !!a && p(a) === p(b);
}
/* Le reste à faire du chantier : les tâches de tous ses points, au même
   endroit. Chaque tâche a son identifiant ; un point la reprend, la coche,
   la corrige — la version la plus récente (maj) l'emporte. Sur la page du
   chantier, on la coche aussi directement. */
const ID_TACHE = /^[A-Za-z0-9_-]{1,40}$/;
function fusionnerReste(c, liste, retires, origine) {
  const reste = Array.isArray(c.reste) ? c.reste : [];
  const maintenant = new Date().toISOString();
  for (const t of (Array.isArray(liste) ? liste : [])) {
    const id = String((t && t.id) || "");
    const texte = String((t && t.texte) || "").trim().slice(0, 400);
    if (!ID_TACHE.test(id) || !texte) continue;
    const maj = String(t.maj || maintenant).slice(0, 30);
    const fait = !!t.fait;
    const champs = { texte, prio: String(t.prio || "").slice(0, 20), qui: String(t.qui || "").trim().slice(0, 80),
      quand: /^\d{4}-\d{2}-\d{2}$/.test(String(t.quand || "")) ? t.quand : "" };
    const ancien = reste.find((x) => x.id === id);
    if (!ancien) {
      reste.push({ id, ...champs, fait, maj, cree: maintenant, point: origine.titre, pointId: origine.pointId, auteur: origine.auteur,
        ...(fait ? { faitPar: origine.auteur, faitLe: maintenant, faitDans: origine.titre } : {}) });
      continue;
    }
    if (maj < String(ancien.maj || "")) continue;           /* déjà plus récent sur le site */
    Object.assign(ancien, champs, { maj });
    if (fait && !ancien.fait) Object.assign(ancien, { fait: true, faitPar: origine.auteur, faitLe: maintenant, faitDans: origine.titre });
    if (!fait && ancien.fait) { ancien.fait = false; delete ancien.faitPar; delete ancien.faitLe; delete ancien.faitDans; }
  }
  const sortis = new Set((Array.isArray(retires) ? retires : []).map(String).filter((x) => ID_TACHE.test(x)));
  let garde = reste.filter((x) => !sortis.has(x.id));
  /* au plus 300 : les plus anciennes faites partent d'abord */
  if (garde.length > 300) {
    const faites = garde.filter((x) => x.fait).sort((a, b) => String(a.faitLe || "").localeCompare(String(b.faitLe || "")));
    const trop = new Set(faites.slice(0, garde.length - 300).map((x) => x.id));
    garde = garde.filter((x) => !trop.has(x.id)).slice(-300);
  }
  c.reste = garde;
}
async function rappelFait(store, ref, id, qui) {
  const cleR = "taches/point-" + slug(ref) + "-" + slug(id) + ".json";
  try {
    const t = await store.get(cleR, { type: "json" });
    if (t && !t.faite) { t.faite = true; t.faitePar = qui; t.faiteLe = new Date().toISOString(); await store.setJSON(cleR, t); }
  } catch { /* pas de rappel pour cette tâche */ }
}
function voit(personne, fichier, chantier) {
  /* un rapport appartient à son auteur, à ses destinataires,
     et à l'équipe du chantier constituée lors de la publication du relevé */
  if (!personne) return false;
  const moi = (n) => n === personne.nom || memeNom(n, personne.nom);
  if (moi(fichier.auteur)) return true;
  if ((fichier.destinataires || []).some(moi)) return true;
  return !!chantier && (chantier.equipe || []).some(moi);
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
  if (f.type === "schema") return 450 + Number(new Date(f.publie || 0)) / 1e10;
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
/* =====================================================================
   LIENS PUBLICS : le lien du client et le QR code du tableau
   ---------------------------------------------------------------------
   Un jeton de 20 caractères, tiré au hasard, ouvre client.html sans
   compte : la page n'y voit que ce dossier, et seulement les documents
   faits pour le client (PV, DOE, schéma, étiquettes, mise en service,
   documents techniques, interventions SAV). Le lien du client permet en
   plus de déposer des fichiers (sa courbe de charge, des photos). Le QR
   du tableau, lui, n'ouvre rien du dossier : il sert à joindre
   l'entreprise. Les deux permettent d'envoyer une demande (dépannage,
   devis, information) : elle arrive au bureau comme une fiche de
   réception d'appel SAV, à prendre. Un jeton se révoque ; celui d'un
   tableau ne change jamais tant qu'on ne le révoque pas (il est imprimé).
   ===================================================================== */
const JETON_LIEN = /^[A-Za-z0-9_-]{16,40}$/;
const QR_CONTACT = "qr-contact.json";
/* le lien du client (sa page à lui, par dossier) : coupé tant que l'administrateur ne l'ouvre pas */
const REGLAGES_CLIENTS = "reglages-clients.json";
async function lienClientActif(st) {
  let r = null; try { r = await st.get(REGLAGES_CLIENTS, { type: "json" }); } catch { r = null; }
  return !!(r && r.lienClient);
}       /* le jeton du QR « Nous contacter » de la société */
/* =====================================================================
   LES RÉFÉRENCES DE L'ENTREPRISE (onglet Outils)
   ---------------------------------------------------------------------
   La base d'articles de l'entreprise, venue de son fichier Excel : les
   colonnes du fichier telles quelles, la colonne de la référence (celle
   qu'on copie dans Batigest) et celle de la désignation. Tout le monde la
   lit ; l'administrateur l'importe (en mettant à jour ou en remplaçant),
   ajoute, modifie et retire des références.
   ===================================================================== */
const REFERENCES = "references.json";
const REFS_MAX_LIGNES = 30000, REFS_MAX_COLONNES = 60, REFS_MAX_CASE = 1000;
function cleRef(v) { return String(v == null ? "" : v).trim().toUpperCase(); }
async function lireRefs(st) {
  let r = null; try { r = await st.get(REFERENCES, { type: "json" }); } catch { r = null; }
  if (!r || !Array.isArray(r.colonnes)) r = { colonnes: [], lignes: [], cle: 0, des: 1 };
  if (!Array.isArray(r.lignes)) r.lignes = [];
  return r;
}
/* des colonnes et des lignes propres : des textes courts, autant de cases que de colonnes */
function nettoyerRefs(colonnes, lignes) {
  const cols = (Array.isArray(colonnes) ? colonnes : []).slice(0, REFS_MAX_COLONNES).map((c, i) => String(c == null ? "" : c).trim().slice(0, 120) || "Colonne " + (i + 1));
  const out = [];
  for (const l of (Array.isArray(lignes) ? lignes : [])) {
    if (!Array.isArray(l)) continue;
    const r = cols.map((_, i) => String(l[i] == null ? "" : l[i]).trim().slice(0, REFS_MAX_CASE));
    if (r.some((x) => x)) out.push(r);
    if (out.length > REFS_MAX_LIGNES) break;
  }
  return { cols, lignes: out };
}
const DOCS_CLIENT = ["reception", "doe", "schema", "etiquettes", "autocontrole", "technique", "sav", "reportage"];
/* le QR collé sur le tableau n'ouvre aucun document du dossier : il sert à joindre l'entreprise */
const DOCS_TABLEAU = [];
async function lireLien(jeton) {
  if (!JETON_LIEN.test(String(jeton || ""))) return null;
  let l = null;
  try { l = await magasinAnnuaire().get("liens/" + jeton + ".json", { type: "json" }); } catch { l = null; }
  return l && l.actif !== false ? l : null;
}
/* ---------- les demandes reçues par le QR code « Nous contacter » ----------
   Pas de SAV, pas de dossier : une demande, rangée à part (contacts/), pour la
   personne choisie dans Équipe (le secrétariat…), à défaut les administrateurs.
   Elle la lit dans « Demandes de contact » et la marque traitée. */
const CONTACTS = "contacts/";
const SORTES_CONTACT = { sav: "Dépannage", devis: "Demande de devis", info: "Question" };
async function destinatairesContact(st, societe) {
  let qc = null; try { qc = await st.get(QR_CONTACT, { type: "json" }); } catch { qc = null; }
  const comptes = await lireComptes(societe);
  const choisi = qc && qc.destinataire ? comptes.find((u) => u.nom === qc.destinataire) : null;
  return { comptes, qui: choisi ? [choisi] : comptes.filter((u) => u.role === "admin"), choisi: choisi ? choisi.nom : "" };
}
async function demandeDeContact(st, lien, jeton, d, req, url) {
  const net = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
  if (d.site) return json({ ok: true });                                  /* champ piège : un robot l'a rempli */
  const sorte = SORTES_CONTACT[d.sorte] ? d.sorte : "sav";
  const nom = net(d.nom, 80), adresse = net(d.adresse, 200), tel = net(d.tel, 40), email = net(d.email, 120);
  const message = String(d.message || "").trim().slice(0, 1500);
  if (!message) return json({ erreur: sorte === "sav" ? "Décrivez en quelques mots ce qui se passe." : "Écrivez votre demande en quelques mots." }, 400);
  if (!nom) return json({ erreur: "Indiquez votre nom." }, 400);
  if (sorte !== "info" && !adresse) return json({ erreur: "Indiquez l'adresse où intervenir." }, 400);
  if (!tel && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erreur: "Laissez un téléphone ou un e-mail pour qu'on vous rappelle." }, 400);
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!envoiPermis(jeton + "-" + ip, 5) || !envoiPermis("contact-" + lien.societe, 40)) {
    return json({ erreur: "Plusieurs demandes viennent d'être envoyées. Appelez directement l'entreprise." }, 429);
  }
  const photos = (Array.isArray(d.photos) ? d.photos : []).slice(0, 4)
    .filter((ph) => ph && typeof ph.data === "string" && /^data:image\/jpeg;base64,/.test(ph.data) && ph.data.length < 1400000)
    .map((ph) => ({ data: ph.data, w: Number(ph.w) || 0, h: Number(ph.h) || 0 }));
  const recue = new Date().toISOString(), id = recue.replace(/[^\d]/g, "").slice(0, 14) + "-" + randomBytes(4).toString("hex");
  const urgent = sorte === "sav" && !!d.urgent;
  const dem = { id, sorte, urgent, nom, tel, email, adresse, message, dispo: net(d.dispo, 300), photos, recue, traitee: null };
  await st.setJSON(CONTACTS + id + ".json", dem);
  const { comptes, qui } = await destinatairesContact(st, lien.societe);
  const quoi = SORTES_CONTACT[sorte] + (urgent ? " urgent" : "");
  prevenirPush(st, magasinAnnuaire(), qui.map((u) => u.nom), "documents", {
    titre: "Demande de contact — " + quoi, texte: nom + " : " + message.replace(/\s+/g, " ").slice(0, 120),
    url: "./demandes.html?id=" + encodeURIComponent(id), tag: "contact-" + id
  }, contactPush(url.origin), { comptes }).catch(() => {});
  return json({ ok: true });
}
/* les demandes traitées depuis plus d'un an s'effacent */
async function purgerContacts(st, maintenant) {
  const t = maintenant || Date.now();
  const res = await st.list({ prefix: CONTACTS });
  let n = 0;
  for (const b of (res.blobs || [])) {
    let x = null; try { x = await st.get(b.key, { type: "json" }); } catch { x = null; }
    const quand = x && x.traitee && Date.parse(x.traitee.le);
    if (quand && t - quand > 365 * 24 * 3600 * 1000) { try { await st.delete(b.key); n++; } catch { /* suivante */ } }
  }
  return n;
}

/* au plus quelques envois par heure et par lien : une page ouverte à tous ne doit pas inonder le bureau */
const ENVOIS_LIEN = new Map();
function envoiPermis(jeton, max) {
  const t = Date.now(), l = (ENVOIS_LIEN.get(jeton) || []).filter((x) => t - x < 3600000);
  if (l.length >= max) { ENVOIS_LIEN.set(jeton, l); return false; }
  l.push(t); ENVOIS_LIEN.set(jeton, l); return true;
}
/* qui prend les rendez-vous de ce dossier : quelqu'un de son équipe, sinon quelqu'un du bureau */
async function rdvDuDossier(societe, c) {
  let carte = {}; try { carte = (await magasinAnnuaire().get("rdv-societe/" + societe + ".json", { type: "json" })) || {}; } catch { carte = {}; }
  const actifs = Object.keys(carte).filter((n) => carte[n] && carte[n].actif);
  const eq = ((c && c.equipe) || []).find((n) => actifs.some((a) => a === n || memeNom(a, n)));
  const qui = eq ? actifs.find((a) => a === eq || memeNom(a, eq)) : actifs.find((n) => carte[n].role === "bureau" || carte[n].role === "admin") || actifs[0];
  return qui ? carte[qui].jeton : "";
}
function docVisible(f, lien) {
  if (f.brouillon || f.fiche === "appel") return false;
  return (lien.genre === "tableau" ? DOCS_TABLEAU : DOCS_CLIENT).indexOf(f.type) >= 0;
}

/* =====================================================================
   RENDEZ-VOUS EN LIGNE, branchés sur l'agenda Outlook
   ---------------------------------------------------------------------
   Chacun peut ouvrir sa prise de rendez-vous (Mon compte) : ses jours et
   heures, la durée d'un rendez-vous, et le lien ICS de son agenda Outlook
   publié en « occupé / libre ». Le client voit les créneaux libres (son
   agenda Outlook et les rendez-vous déjà pris sur le site, ôtés), en
   choisit un : l'invitation part par e-mail, le rendez-vous entre dans le
   calendrier du site et dans le flux ICS auquel Outlook est abonné.
   ===================================================================== */
const JETON_RDV = /^[A-Za-z0-9_-]{16,40}$/;
const CACHE_AGENDA = new Map();                  /* lien ICS -> {t, evs} : 5 minutes */
async function lireAgenda(lienIcs, force) {
  const u = String(lienIcs || "").trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https?:\/\//i.test(u)) return { evs: [], erreur: "" };
  const vu = CACHE_AGENDA.get(u);
  if (!force && vu && Date.now() - vu.t < 300000) return vu;
  let r = { t: Date.now(), evs: [], erreur: "" };
  try {
    const ctl = new AbortController(), minuterie = setTimeout(() => ctl.abort(), 9000);
    const rep = await fetch(u, { signal: ctl.signal, headers: { accept: "text/calendar, text/plain, */*" } });
    clearTimeout(minuterie);
    if (!rep.ok) throw new Error("L'agenda répond " + rep.status + ".");
    const txt = await rep.text();
    if (txt.length > 8 * 1024 * 1024) throw new Error("Agenda trop lourd.");
    if (!/BEGIN:VCALENDAR/i.test(txt)) throw new Error("Ce lien ne donne pas un agenda ICS.");
    r.evs = lireIcs(txt);
  } catch (e) {
    r.erreur = e && e.name === "AbortError" ? "L'agenda ne répond pas." : (e && e.message) || "Agenda illisible.";
    if (vu && vu.evs && vu.evs.length) r.evs = vu.evs;          /* l'agenda boude : on garde la dernière lecture */
  }
  CACHE_AGENDA.set(u, r);
  return r;
}
async function lireRdv(jeton) {
  if (!JETON_RDV.test(String(jeton || ""))) return null;
  try { return await magasinAnnuaire().get("rdv/" + jeton + ".json", { type: "json" }); } catch { return null; }
}
async function reservationsDe(st, jeton) {
  try { return (await st.get("rdv/reservations-" + jeton + ".json", { type: "json" })) || []; } catch { return []; }
}
/* les créneaux libres : l'agenda Outlook et les rendez-vous du site ôtés */
async function creneauxDe(R, st) {
  const maintenant = Date.now(), fin = maintenant + (Math.min(90, +R.horizon || 21) + 2) * 864e5;
  const ag = await lireAgenda(R.ics);
  const occ = occupations(ag.evs || [], maintenant - 864e5, fin);
  (await reservationsDe(st, R.jeton)).filter((x) => !x.annule).forEach((x) => occ.push({ debut: x.debut, fin: x.fin }));
  return { jours: creneauxLibres({ maintenant, occupes: occ, reglages: R }), erreur: ag.erreur };
}
function texteRdv(t) {
  const c = champsZone(PARIS, t);
  const JS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"], MS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  return JS[c.wd] + " " + c.d + " " + MS[c.m - 1] + " " + c.y + " à " + String(c.h).padStart(2, "0") + " h " + String(c.mi).padStart(2, "0");
}

const LECTURES = new Set(["push-journal", "contacts", "contact", "liste", "fichier", "fiche", "fiches", "dossiers", "equipe", "equipe-dossier", "moi",
  "mon-compte", "notes", "notes-corbeille", "taches", "messages-non-lus", "comptes", "demandes", "societes",
  "societes-publiques", "push-cle", "push-etat", "tableau-bord", "knx-outil", "societe-fiche", "lien", "lien-fichier",
  "liens", "depots-client", "depot-client", "espaces", "rdv-public", "rdv-ics", "rdv-reglages"]);
export default async (req) => {
  let action = "";
  try { action = new URL(req.url).searchParams.get("action") || ""; } catch { action = ""; }
  /* le téléphone réveille le serveur et rouvre une connexion neuve avant
     de renvoyer une publication qui a échoué : rien à lire, rien à écrire */
  if (action === "ping") return json({ ok: true });
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
    } catch { /* tant pis */ }
    /* le gestionnaire la voit sur son accueil (« Demandes d'accès ») et reçoit une notification */
    try {
      prevenirPush(magasinSociete(SOCIETE_DEPART.code), magasinAnnuaire(), [PROPRIETAIRE.nom], "documents", {
        titre: "Demande d'accès au site", texte: nom + (demande.fonction ? " (" + demande.fonction + ")" : "") + " — " + email,
        url: "./index.html", tag: "acces-" + Date.now() }, contactPush(url.origin), { comptes: await lireComptes(SOCIETE_DEPART.code) }).catch(() => {});
    } catch { /* la demande est gardée */ }
    return json({ ok: true });
  }

  if (action === "societes-publiques") {
    /* liste des sociétés proposées à la connexion */
    const liste = await lireSocietes();
    /* la démonstration est fermée : elle n'est plus proposée */
    return json({ societes: liste.filter((s) => s.actif !== false && !s.demo && s.code !== SOCIETE_DEMO.code)
      .map((s) => ({ code: s.code, nom: s.nom, demo: false })) });
  }

  if (action === "connexion") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const code = String(d.societe || SOCIETE_DEPART.code).trim().toLowerCase();
    const id = String(d.identifiant || "").trim().toLowerCase();
    const mdp = String(d.motdepasse || "");
    /* l'accès de démonstration est fermé : ses identifiants étaient publics */
    if (code === SOCIETE_DEMO.code) return json({ erreur: "L'accès de démonstration est fermé. Demandez un accès." }, 403);
    const v = await verifier(code, id, mdp);
    if (!v) return json({ erreur: "Identifiant ou mot de passe incorrect." }, 401);
    const p = v.personne;
    const liste = await lireSocietes();
    const soc = liste.find((x) => x.code === code) || {};
    return json({ jeton: jetonPour(code, id, v.compte), nom: p.nom, role: p.role, applis: p.applis || [],
      societe: code, societeNom: soc.nom || "", metier: soc.metier || "", ville: soc.ville || "",
      proprietaire: !!p.proprietaire, demo: !!soc.demo, aChanger: !!p.aChanger,
      cguVersion: CGU_VERSION, cguAJour: p.cgu === CGU_VERSION });
  }

  /* ---------- liens publics : la page du client, le QR du tableau ---------- */
  if (action === "lien" || action === "lien-fichier" || action === "lien-demande" || action === "lien-depot") {
    let d = {};
    if (req.method === "POST") { try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); } }
    const jeton = String(url.searchParams.get("j") || d.j || "");
    const lien = await lireLien(jeton);
    if (!lien) return json({ erreur: "Ce lien n'est plus valable. Demandez-en un nouveau à l'entreprise." }, 404);
    const st = magasinSociete(lien.societe);
    const idx = (await st.get(INDEX, { type: "json" })) || { chantiers: {} };
    let c = idx.chantiers[lien.ref];
    /* un lien n'ouvre que le dossier pour lequel il a été fait : si la référence a resservi, il n'y voit rien */
    if (c && !(c.liens || []).some((l) => l.jeton === jeton)) c = null;
    const tableau = lien.genre === "tableau";
    /* le QR code de contact de l'entreprise : le même pour tous ses clients, il n'ouvre aucun dossier ;
       une demande envoyée par lui crée un dossier neuf au nom du client */
    const contact = lien.genre === "societe";
    if (lien.genre === "client" && !(await lienClientActif(st))) {
      return json({ erreur: "Ce lien n'est plus valable. Contactez directement l'entreprise." }, 404);
    }
    if (contact) {
      let qc = null;
      try { qc = await st.get(QR_CONTACT, { type: "json" }); } catch { qc = null; }
      if (!qc || qc.jeton !== jeton) return json({ erreur: "Ce QR code n'est plus valable. Appelez directement l'entreprise." }, 404);
      if (action === "lien-fichier") return json({ erreur: "Document introuvable." }, 404);
      if (action === "lien-depot") return json({ erreur: "Écrivez-nous plutôt par le formulaire, en joignant vos photos." }, 409);
      if (action === "lien-demande") return await demandeDeContact(st, lien, jeton, d, req, url);
    }
    /* le dossier est archivé : son espace client, gardé à part, reste ouvert (documents du client,
       sans dépôt de fichiers) ; à défaut, le QR du tableau garde la demande (dépannage, devis, information) */
    let espace = null;
    if (lien.espace) { try { espace = await st.get("espaces/" + lien.espace + ".json", { type: "json" }); } catch { espace = null; } }
    const archive = !c && tableau && lien.archive ? lien.archive : null;
    if (!c && !espace && !archive && !contact) return json({ erreur: "Ce dossier n'existe plus. Contactez l'entreprise qui a fait les travaux." }, 404);
    const docsEspace = espace ? (espace.documents || []).filter((f) => docVisible(f, lien)) : [];
    /* une demande ou un envoi sur un dossier archivé : le dossier renaît pour les recevoir
       (sous une autre référence si la sienne a resservi), avec tous les liens de l'espace */
    if (!c && action === "lien-depot") return json({ erreur: "Votre dossier est archivé : envoyez plutôt le fichier à l'entreprise par e-mail." }, 409);
    if (!c && action === "lien-demande" && !contact) {
      const ref0 = idx.chantiers[lien.ref] ? (lien.ref + "-" + jeton.slice(0, 4)).toUpperCase() : lien.ref;
      const src = espace || archive || {};
      c = idx.chantiers[ref0] = idx.chantiers[ref0] || { ref: ref0, client: src.client || "", adresse: src.adresse || "", fichiers: [], equipe: [],
        liens: [], maj: new Date().toISOString() };
      const jetons = espace && Array.isArray(espace.liens) ? espace.liens : [jeton];
      for (const jt of jetons) {
        const l0 = jt === jeton ? lien : await lireLien(jt);
        if (!l0) continue;
        if (!c.liens.some((x) => x.jeton === jt)) c.liens.push({ jeton: jt, genre: l0.genre, tableau: l0.tableau || "", cree: l0.cree, par: l0.par });
        if (l0.ref !== ref0) await magasinAnnuaire().setJSON("liens/" + jt + ".json", Object.assign(l0, { ref: ref0 }));
      }
    }
    let fiche = null;
    try { fiche = await magasinAnnuaire().get("fiches/" + lien.societe + ".json", { type: "json" }); } catch { fiche = null; }

    if (action === "lien") {
      const soc = (await lireSocietes()).find((x) => x.code === lien.societe) || {};
      const docs = (c ? c.fichiers.filter((f) => docVisible(f, lien))
        .map((f) => ({ cle: f.cle, titre: libelleDocument(f), type: f.type, date: f.date || "", etape: f.etape || "" })) : [])
        .concat(docsEspace.map((f) => ({ cle: f.cle, titre: f.titre, type: f.type, date: f.date || "", etape: f.etape || "" })));
      /* le QR du tableau ne montre rien du dossier (ni circuits, ni documents) : il sert à joindre l'entreprise */
      const circuits = null;
      const k = c || espace || {};
      return json({
        genre: lien.genre, tableau: lien.tableau || "", archive: !c && !contact,
        societe: { nom: (fiche && fiche.nom) || soc.nom || "", tel: (fiche && fiche.tel) || "", web: (fiche && fiche.web) || "",
          adresse: (fiche && fiche.adresse) || "", mentions: (fiche && fiche.mentions) || "",
          mediateur: (fiche && fiche.mediateur) || "", logo: (fiche && fiche.logo) || null },
        /* le QR du tableau est collé chez le client, à la vue de tous : ni nom ni adresse */
        dossier: contact ? null : tableau ? { ref: k.ref || lien.ref } : { ref: k.ref || lien.ref, client: k.client || "", adresse: k.adresse || "",
          avancement: c ? avancementDe(c) : 100, etat: c ? etatDossier(c).etat : "archive" },
        circuits, documents: docs,
        depots: tableau || !c ? [] : (c.depots || []).map((x) => ({ genre: x.genre, nom: x.nom, le: x.le, resume: x.resume || "" })),
        rdv: await rdvDuDossier(lien.societe, c)
      });
    }

    if (action === "lien-fichier") {
      const cle = String(url.searchParams.get("cle") || "");
      const f = (c && cle.startsWith(c.ref + "/") ? c.fichiers.find((x) => x.cle === cle && docVisible(x, lien)) : null)
        || docsEspace.find((x) => x.cle === cle);
      if (!f) return json({ erreur: "Document introuvable." }, 404);
      const blob = await st.get(cle, { type: "arrayBuffer" });
      if (!blob) return json({ erreur: "Document introuvable." }, 404);
      return new Response(blob, { headers: { "content-type": typeDuFichier(cle),
        "content-disposition": 'inline; filename="' + cle.split("/").pop() + '"', "cache-control": "no-store" } });
    }

    const court = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
    const comptes = await lireComptes(lien.societe);
    /* qui prévenir : l'équipe du chantier et le bureau */
    const prevenus = Array.from(new Set((c.equipe || []).map((n) => nomDuCompte(n, comptes))
      .concat(comptes.filter((u) => u.role === "bureau" || u.role === "admin").map((u) => u.nom)))).filter(Boolean);

    if (action === "lien-demande") {
      if (d.site) return json({ ok: true });                                /* champ piège : un robot l'a rempli */
      const message = court(d.message, 1500), tel = court(d.tel, 40), nom = court(d.nom, 80);
      /* ce que demande le client : un dépannage (SAV), un devis, ou une information */
      const sorte = d.sorte === "devis" ? "devis" : d.sorte === "info" ? "info" : "sav";
      const SORTES = { sav: { nature: "Dépannage", titre: "Demande d'intervention du client", push: "Demande d'intervention" },
        devis: { nature: "Demande de devis", titre: "Demande de devis du client", push: "Demande de devis" },
        info: { nature: "Information", titre: "Demande d'information du client", push: "Demande d'information" } }[sorte];
      if (!message) return json({ erreur: sorte === "sav" ? "Décrivez en quelques mots ce qui se passe." : "Écrivez votre demande en quelques mots." }, 400);
      if (!tel && !/@/.test(String(d.email || ""))) return json({ erreur: "Laissez un téléphone ou un e-mail pour qu'on vous rappelle." }, 400);
      if (!envoiPermis(jeton, 5)) return json({ erreur: "Plusieurs demandes viennent d'être envoyées. Appelez directement l'entreprise." }, 429);
      const photos = (Array.isArray(d.photos) ? d.photos : []).slice(0, 4)
        .filter((ph) => ph && typeof ph.data === "string" && /^data:image\/jpeg;base64,/.test(ph.data) && ph.data.length < 1400000)
        .map((ph) => ({ data: ph.data, w: Number(ph.w) || 0, h: Number(ph.h) || 0, legende: "Envoyée par le client" }));
      const id = "dc" + randomBytes(6).toString("hex");
      const cle = c.ref + "/sav-a-terminer-" + id + ".json", maintenant = new Date().toISOString(), jour = jourParis();
      const urgent = sorte === "sav" && !!d.urgent;
      const fiche = {
        etape: "appel", id, brouillon: "", appelPublie: "", confie: null,
        appel: { par: "Demande en ligne", le: maintenant },
        chantier: { client: c.client || "", ref: c.ref, adresse: c.adresse || "", tel, contact: "", lat: c.lat ?? null, lon: c.lon ?? null },
        inter: { date: jour, arr: "", dep: "", numero: "", trajet: "", nature: SORTES.nature, charge: "", urgence: urgent ? "Urgente" : "Normale",
          motif: message, constat: "", travaux: "" },
        materiel: [], photos, suite: { etat: "", action: "", detail: "", retour: "" },
        sig: { client: null, tech: null, nomClient: "", nomTech: "", horodatage: "" }, destinataires: [], dest: "",
        demande: { appelant: nom, qualite: tableau ? "" : "Client", tel, symptomes: [], equipement: tableau ? "Tableau " + (lien.tableau || "électrique") : "",
          marque: "", detail: [d.email ? "E-mail : " + court(d.email, 120) : "", tableau ? "Demande faite depuis le QR code du tableau." : "Demande faite depuis le lien client."].filter(Boolean).join("\n"),
          date: "", heure: "", creneau: "", dispo: court(d.dispo, 300), acces: "" }
      };
      await st.set(cle, JSON.stringify(fiche), { metadata: { type: "application/json" } });
      const entree = { cle, titre: SORTES.titre, type: "sav", visite: "", etape: SORTES.nature, date: jour, demandeSorte: sorte,
        auteur: "Demande en ligne", destinataires: [], publie: maintenant, donnees: true, brouillon: true, demandeClient: true,
        lectures: {}, appel: fiche.appel, urgence: fiche.inter.urgence, motif: court(message, 160), confiePar: "" };
      c.fichiers.push(entree); c.maj = maintenant;
      await st.setJSON(INDEX, idx);
      prevenirPush(st, magasinAnnuaire(), prevenus, "documents", {
        titre: SORTES.push + (urgent ? " — urgente" : ""),
        texte: (c.client || c.ref) + " : " + court(message, 120),
        url: "./sav.html?terminer=" + encodeURIComponent(cle), tag: "sav-" + id
      }, contactPush(url.origin), { comptes }).catch(() => {});
      return json({ ok: true });
    }

    if (action === "lien-depot") {
      if (tableau) return json({ erreur: "Ce lien ne reçoit pas de fichiers." }, 403);
      if (!envoiPermis("depot-" + jeton, 12)) return json({ erreur: "Trop d'envois d'un coup. Réessayez dans une heure." }, 429);
      const genre = d.genre === "courbe" ? "courbe" : d.genre === "photo" ? "photo" : "fichier";
      const nom = court(d.nom, 100).replace(/[\\/]/g, "-") || genre;
      const id = new Date().toISOString().slice(0, 10) + "-" + randomBytes(4).toString("hex");
      let cle, octets, type, resume = "";
      if (genre === "courbe") {
        const k = d.courbe;
        if (!k || !Array.isArray(k.valeurs) || !(k.pas > 0) || !(k.debut > 0) || k.valeurs.length > 120000) return json({ erreur: "Courbe illisible." }, 400);
        const propre = { debut: Number(k.debut), pas: Number(k.pas), valeurs: k.valeurs.map((v) => (v == null || !isFinite(v) ? null : Math.round(v))),
          prm: /^\d{14}$/.test(String(k.prm || "")) ? String(k.prm) : "", unite: court(k.unite, 6), nom, lu: new Date().toISOString() };
        octets = Buffer.from(JSON.stringify(propre)); type = "application/json";
        cle = c.ref + "/client/courbe-" + id + ".json"; resume = court(d.resume, 120);
      } else {
        const m = /^data:([\w/.+-]+);base64,(.+)$/.exec(String(d.data || ""));
        if (!m) return json({ erreur: "Fichier illisible." }, 400);
        octets = Buffer.from(m[2], "base64"); type = m[1];
        if (octets.length > 4.5 * 1024 * 1024) return json({ erreur: "Fichier trop lourd (4,5 Mo au plus)." }, 413);
        if (!/^(image\/(jpeg|png)|application\/pdf|text\/(csv|plain)|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/.test(type)) return json({ erreur: "Type de fichier non accepté (photo, PDF, CSV ou Excel)." }, 415);
        const ext = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf", "text/csv": "csv", "text/plain": "txt" }[type] || "xlsx";
        cle = c.ref + "/client/" + genre + "-" + id + "." + ext;
      }
      await st.set(cle, octets, { metadata: { type } });
      c.depots = (c.depots || []).concat([{ cle, genre, nom, le: new Date().toISOString(), resume, taille: octets.length, type }]).slice(-60);
      c.maj = new Date().toISOString();
      await st.setJSON(INDEX, idx);
      prevenirPush(st, magasinAnnuaire(), (c.equipe || []).map((n) => nomDuCompte(n, comptes)), "documents", {
        titre: genre === "courbe" ? "Courbe de charge reçue" : "Fichier reçu du client",
        texte: (c.client || c.ref) + " : " + nom + (resume ? " (" + resume + ")" : ""),
        url: "./chantier.html?ref=" + encodeURIComponent(c.ref), tag: "depot-" + c.ref
      }, contactPush(url.origin), { comptes }).catch(() => {});
      return json({ ok: true });
    }
  }

  /* ---------- rendez-vous en ligne : les créneaux, la réservation, l'annulation, le flux ICS ---------- */
  if (action === "rdv-public" || action === "rdv-reserver" || action === "rdv-annuler" || action === "rdv-ics") {
    let d = {};
    if (req.method === "POST") { try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); } }
    if (action === "rdv-ics") {
      /* le flux auquel Outlook s'abonne : jeton secret, distinct du lien public */
      const k = String(url.searchParams.get("k") || "");
      let ref0 = null; try { ref0 = JETON_RDV.test(k) ? await magasinAnnuaire().get("rdv-flux/" + k + ".json", { type: "json" }) : null; } catch { ref0 = null; }
      const R0 = ref0 && await lireRdv(ref0.jeton);
      if (!R0) return new Response("Flux inconnu", { status: 404 });
      const liste = (await reservationsDe(magasinSociete(R0.societe), R0.jeton)).filter((x) => x.fin > Date.now() - 60 * 864e5);
      const corps = ecrireIcs(liste.map((x) => ({ uid: x.id + "@suivi-travaux-360", debut: x.debut, fin: x.fin, annule: !!x.annule, sequence: x.annule ? 1 : 0,
        titre: "RDV " + x.nom + (x.motif ? " — " + x.motif.slice(0, 60) : ""), lieu: x.adresse || R0.lieu || "",
        description: [x.motif, "Tél. " + (x.tel || "—"), x.email ? "E-mail " + x.email : "", x.ref ? "Dossier " + x.ref : ""].filter(Boolean).join("\n") })),
        { nom: "Rendez-vous du site — " + R0.nom });
      return new Response(corps, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
    }
    const jr = String(url.searchParams.get("r") || d.r || "");
    const R = await lireRdv(jr);
    if (!R || !R.actif) return json({ erreur: "La prise de rendez-vous en ligne n'est pas ouverte. Appelez directement l'entreprise." }, 404);
    const st = magasinSociete(R.societe);
    let fiche = null;
    try { fiche = await magasinAnnuaire().get("fiches/" + R.societe + ".json", { type: "json" }); } catch { fiche = null; }
    const soc = (await lireSocietes()).find((x) => x.code === R.societe) || {};
    const societe = { nom: (fiche && fiche.nom) || soc.nom || "", tel: (fiche && fiche.tel) || "", logo: (fiche && fiche.logo) || null,
      adresse: (fiche && fiche.adresse) || "", web: (fiche && fiche.web) || "", mentions: (fiche && fiche.mentions) || "",
      mediateur: (fiche && fiche.mediateur) || "" };
    /* ouvert depuis le lien du client : son dossier, son nom, son adresse */
    let dossier = null;
    const jl = String(url.searchParams.get("j") || d.j || "");
    if (jl) {
      const l = await lireLien(jl);
      if (l && l.societe === R.societe) {
        const idx = (await st.get(INDEX, { type: "json" })) || { chantiers: {} };
        const c = idx.chantiers[l.ref];
        if (c && (c.liens || []).some((x) => x.jeton === jl)) dossier = l.genre === "client" ? { ref: c.ref, client: c.client || "", adresse: c.adresse || "" } : { ref: c.ref, client: "", adresse: "" };
      }
    }
    if (action === "rdv-public") {
      const cr = await creneauxDe(R, st);
      return json({ nom: R.nom, societe, duree: R.duree, lieu: R.lieu || "", intro: R.intro || "", jours: cr.jours, dossier });
    }
    const court = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
    const liste = await reservationsDe(st, R.jeton);
    if (action === "rdv-annuler") {
      const x = liste.find((y) => y.id === d.id && y.cle === d.k);
      if (!x) return json({ erreur: "Rendez-vous introuvable." }, 404);
      if (x.annule) return json({ ok: true, deja: true, debut: x.debut });
      x.annule = true; x.annuleLe = new Date().toISOString(); x.annulePar = "le client";
      await st.setJSON("rdv/reservations-" + R.jeton + ".json", liste);
      if (x.rappel) { try { await st.delete(x.rappel); } catch { /* déjà parti */ } }
      const comptes = await lireComptes(R.societe);
      prevenirPush(st, magasinAnnuaire(), [R.nom], "documents", { titre: "Rendez-vous annulé", texte: x.nom + " — " + texteRdv(x.debut), url: "./compte.html#rdv", tag: "rdv-" + x.id },
        contactPush(url.origin), { comptes }).catch(() => {});
      return json({ ok: true, debut: x.debut });
    }
    /* ----- réserver ----- */
    if (d.site) return json({ ok: true });                                  /* champ piège */
    if (!envoiPermis("rdv-" + R.jeton + "-" + (req.headers.get("x-forwarded-for") || ""), 6)) return json({ erreur: "Plusieurs rendez-vous viennent d'être pris d'ici. Appelez l'entreprise." }, 429);
    const nom = court(d.nom, 80), tel = court(d.tel, 40), email = court(d.email, 120), adresse = court(d.adresse, 200), motif = court(d.motif, 600);
    if (!nom) return json({ erreur: "Indiquez votre nom." }, 400);
    if (!tel && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erreur: "Laissez un téléphone ou un e-mail." }, 400);
    const date = String(d.date || ""), heure = String(d.heure || "");
    const cr = await creneauxDe(R, st);
    const jour = cr.jours.find((j) => j.date === date);
    if (!jour || jour.creneaux.indexOf(heure) < 0) return json({ erreur: "Ce créneau vient d'être pris. Choisissez-en un autre.", jours: cr.jours }, 409);
    const [y, m, dd] = date.split("-").map(Number), [hh, mi] = heure.split(":").map(Number);
    const debut = versUtc(PARIS, y, m, dd, hh, mi), fin = debut + (+R.duree || 60) * 60000;
    const id = Date.now().toString(36) + randomBytes(4).toString("hex"), cle = randomBytes(12).toString("base64url");
    const x = { id, cle, debut, fin, nom, tel, email, adresse: adresse || (dossier && dossier.adresse) || "", motif, ref: dossier ? dossier.ref : "",
      origine: dossier ? "lien client" : "lien public", cree: new Date().toISOString() };
    /* le rendez-vous entre au calendrier du site, rappelé une heure avant */
    const avant = champsZone(PARIS, debut - 3600e3), jourR = champsZone(PARIS, debut);
    const rappel = "taches/cal-" + slug(R.nom) + "-rdv" + id + ".json";
    await st.setJSON(rappel, { texte: "RDV " + heure.replace(":", " h ") + " — " + nom + (tel ? " (" + tel + ")" : "") + (x.adresse ? " — " + x.adresse : "") + (motif ? " : " + motif.slice(0, 120) : ""),
      prio: "", qui: R.nom, quand: jourR.y + "-" + String(jourR.m).padStart(2, "0") + "-" + String(jourR.d).padStart(2, "0"),
      heure: String(avant.h).padStart(2, "0") + ":" + String(avant.mi).padStart(2, "0"), rappel: true, cal: true, rdv: id,
      auteur: "Prise de rendez-vous", cree: x.cree, faite: false, notifie: "" });
    x.rappel = rappel;
    liste.push(x);
    await st.setJSON("rdv/reservations-" + R.jeton + ".json", liste.filter((r) => r.fin > Date.now() - 400 * 864e5));
    const ev = { uid: id + "@suivi-travaux-360", debut, fin, titre: "RDV " + nom + (motif ? " — " + motif.slice(0, 60) : ""), lieu: x.adresse || R.lieu || "",
      description: [motif, "Tél. " + (tel || "—"), email ? "E-mail " + email : "", x.ref ? "Dossier " + x.ref : "", "Pris en ligne le " + new Date().toLocaleString("fr-FR", { timeZone: PARIS })].filter(Boolean).join("\n"),
      organisateur: null, participants: [] };
    const lienAnnul = url.origin + "/rdv.html?r=" + encodeURIComponent(R.jeton) + "&annuler=" + id + "&k=" + cle;
    const comptes = await lireComptes(R.societe);
    prevenirPush(st, magasinAnnuaire(), [R.nom], "documents", { titre: "Nouveau rendez-vous", texte: nom + " — " + texteRdv(debut), url: "./compte.html#rdv", tag: "rdv-" + id },
      contactPush(url.origin), { comptes }).catch(() => {});
    return json({ ok: true, debut, fin, texte: texteRdv(debut), annulation: lienAnnul,
      ics: ecrireIcs([Object.assign({}, ev, { organisateur: null, participants: [] })], { methode: "PUBLISH" }) });
  }

  const personne = await identifier(req.headers.get("x-auth") || url.searchParams.get("auth"));
  if (personne === "perimee") {
    return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  }
  if (!personne) return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  /* une session de démonstration encore ouverte ne vaut plus rien */
  if (personne.societe === SOCIETE_DEMO.code) return json({ erreur: "L'accès de démonstration est fermé." }, 401);
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
      metier: "", ville: "", societe: personne.societe,
      cguVersion: CGU_VERSION, cguAJour: personne.cgu === CGU_VERSION });
  }

  /* ---------- conditions d'utilisation : acceptées une fois par version ----------
     La case est cochée par la personne elle-même, jamais d'avance ; on garde
     la version et la date, qui suivent le compte (même remis à zéro). */
  if (action === "cgu-accepter") {
    if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (d.accepte !== true || d.version !== CGU_VERSION) {
      return json({ erreur: "Cochez la case pour accepter les conditions en vigueur.", cguVersion: CGU_VERSION }, 400);
    }
    const comptes = await lireComptes(personne.societe);
    const i = comptes.findIndex((x) => String(x.identifiant).trim().toLowerCase() === personne.identifiant);
    if (i < 0) return json({ erreur: "Compte introuvable." }, 404);
    comptes[i] = { ...comptes[i], cgu: { version: CGU_VERSION, le: new Date().toISOString() } };
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true, cguVersion: CGU_VERSION });
  }

  if (action === "equipe") {
    const comptes = await lireComptes(personne.societe);
    /* e-mail et téléphone : l'annuaire de la société, pour remplir les
       coordonnées du chargé d'affaires sur le relevé */
    return json({ personnes: comptes.map((p) => ({ nom: p.nom, role: p.role,
      email: p.email || "", tel: p.tel || "", ...(p.nom === personne.nom || memeNom(p.nom, personne.nom) || (personne.identifiant && String(p.identifiant || "").trim().toLowerCase() === personne.identifiant) ? { moi: true } : {}) })) });
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
      knx: c.knx ? (c.knx.cree || "oui") : "",
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

  /* l'outil KNX : l'administrateur tire au sort le code d'une personne,
     montré une seule fois, ou le retire */
  if (action === "knx-code" || action === "knx-retirer") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    const id = String(url.searchParams.get("identifiant") || "").trim().toLowerCase();
    const comptes = await lireComptes(personne.societe);
    const i = comptes.findIndex((c) => String(c.identifiant).toLowerCase() === id);
    if (i < 0) return json({ erreur: "Compte inconnu." }, 404);
    if (action === "knx-retirer") {
      delete comptes[i].knx;
      await ecrireComptes(personne.societe, comptes);
      return json({ ok: true });
    }
    const code = codeKnx();
    comptes[i] = { ...comptes[i], knx: { empreinte: empreinteDe(code), cree: new Date().toISOString(), par: personne.nom } };
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true, identifiant: id, nom: comptes[i].nom, code });
  }
  if (action === "knx-outil") {
    let d = {};
    try { d = await req.json(); } catch { d = {}; }
    if (admin) return json({ script: await scriptKnx() });
    const comptes = await lireComptes(personne.societe);
    const compte = comptes.find((c) => String(c.identifiant).trim().toLowerCase() === personne.identifiant);
    if (!compte || !compte.knx || !compte.knx.empreinte) {
      return json({ erreur: "Outil réservé : demandez votre code d'accès à l'administrateur.", sansCode: true }, 403);
    }
    const attendue = cleKnx(personne.societe, personne.identifiant, compte);
    const cle = String(d.cle || "");
    if (cle && cle.length === attendue.length && timingSafeEqual(Buffer.from(cle), Buffer.from(attendue))) {
      return json({ script: await scriptKnx() });
    }
    if (!d.code) return json({ erreur: "Code d'accès nécessaire.", code: true }, 403);
    /* cinq essais, puis un quart d'heure d'attente */
    const k = personne.societe + "|" + personne.identifiant, now = Date.now();
    const e = ESSAIS_KNX.get(k);
    if (e && e.n >= 5 && now - e.depuis < 15 * 60 * 1000) {
      return json({ erreur: "Trop d'essais : réessayez dans un quart d'heure." }, 429);
    }
    const code = String(d.code).trim().toUpperCase().replace(/\s+/g, "");
    if (!empreinteJuste(code, compte.knx.empreinte)) {
      ESSAIS_KNX.set(k, e && now - e.depuis < 15 * 60 * 1000 ? { n: e.n + 1, depuis: e.depuis } : { n: 1, depuis: now });
      return json({ erreur: "Code d'accès incorrect." }, 403);
    }
    ESSAIS_KNX.delete(k);
    return json({ script: await scriptKnx(), cle: attendue });
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

  /* ---------- la fiche de la société : l'en-tête des documents ----------
     Nom, téléphone, site, adresse, mentions et logo : réglés une fois par
     l'administrateur, repris tout seuls par le relevé (et, à travers lui,
     par les autres applis) de chaque personne de la société. */
  if (action === "societe-fiche") {
    const a = magasinAnnuaire();
    let f = null;
    try { f = await a.get("fiches/" + personne.societe + ".json", { type: "json" }); } catch { f = null; }
    const soc = (await lireSocietes()).find((x) => x.code === personne.societe) || {};
    return json({ fiche: f, nom: soc.nom || "", metier: soc.metier || "", ville: soc.ville || "" });
  }
  if (action === "societe-fiche-enregistrer") {
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const txt = (v, n) => String(v || "").trim().slice(0, n);
    const fiche = { nom: txt(d.nom, 120), tel: txt(d.tel, 60), web: txt(d.web, 160), adresse: txt(d.adresse, 200),
      mentions: txt(d.mentions, 300), mediateur: txt(d.mediateur, 300), maj: new Date().toISOString(), par: personne.nom, logo: null };
    if (d.logo && typeof d.logo.data === "string" && /^data:image\/(png|jpeg);base64,/.test(d.logo.data)) {
      if (d.logo.data.length > 400000) return json({ erreur: "Logo trop lourd." }, 400);
      fiche.logo = { data: d.logo.data, w: Number(d.logo.w) || 0, h: Number(d.logo.h) || 0 };
    }
    await magasinAnnuaire().setJSON("fiches/" + personne.societe + ".json", fiche);
    return json({ ok: true, fiche });
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
    const schema = d.type === "schema";

    /* l'appli doit être attribuée au compte : refus côté serveur, pas seulement à l'écran */
    const appliVisee = APPLI_DU_TYPE[d.type] || "";
    if (appliVisee && !aAcces(personne, appliVisee)) {
      return json({ erreur: "Cette appli ne vous est pas attribuée. Voyez avec votre administrateur." }, 403);
    }

    /* un technicien crée un suivi de chantier et le transmet, mais ne modifie rien */
    const versDossier = d.dossier === true || d.dossier === "oui";
    if (!bureau) {
      if (!suivi && !commande && !photos && !reception && !etiquettes && !sav && !reportage && !autocontrole && !carnet && !memoire && !doe && !technique && !point && !schema) return json({ erreur: "Le relevé technique est réservé au bureau." }, 403);
      const vises = Array.isArray(d.destinataires) ? d.destinataires : [];
      const comptesSoc = await lireComptes(personne.societe);
      const idxV = await lireIndex();
      const equipeDossier = ((idxV.chantiers[ref] || {}).equipe) || [];
      const concernes = versDossier ? equipeDossier : vises;
      /* le nom écrit sur la fiche renvoie au compte (« MICKAEL K. » → Mickaël) */
      const auMoinsUnBureau = concernes.some((n) => {
        const nom = nomDuCompte(n, comptesSoc);
        return comptesSoc.some((u) => u.nom === nom && (u.role === "bureau" || u.role === "admin"));
      });
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
      ? String(d.ext || "pdf").toLowerCase() : "pdf";
    if (technique && !String(d.titre || "").trim()) return json({ erreur: "Donnez un titre au document." }, 400);

    const nomFichier = schema
      /* un fichier par tableau et par indice : l'indice A reste quand le B arrive */
      ? "schema-" + slug(d.etape || "tableau") + "-indice-" + slug(d.visite || "A") + ".pdf"
      : technique
      ? "technique-" + slug(d.titre) + "-" + slug(d.date || jourParis()) + "." + ext
      : (carnet || memoire || doe)
      ? (carnet ? "carnet-echantillons-" : doe ? "doe-" : "memoire-technique-")
        + slug(d.visite || d.date || jourParis()) + ".pdf"
      : autocontrole
      ? "autocontrole-" + slug(d.date || jourParis()) + "-" + slug(d.visite || personne.nom) + ".pdf"
      : sav
      /* SAV : la fiche de réception d'appel (une par appel) et la fiche d'intervention */
      ? (d.savFiche === "appel"
          ? "sav-appel-" + slug(d.date || jourParis()) + "-" + slug(d.savId || personne.nom) + ".pdf"
          : "sav-" + slug(d.date || jourParis()) + "-" + slug(d.visite || personne.nom) + ".pdf")
      : reportage
      ? "reportage-" + slug(d.date || jourParis()) + "-" + slug(d.visite || personne.nom) + ".pdf"
      : etiquettes
      ? "etiquettes-" + slug(d.etape || "tableau") + ".pdf"
      : reception
      ? "reception-" + slug(d.date || jourParis()) + ".pdf"
      : point
      /* chaque point a son identifiant : deux points le même jour ne
         s'écrasent plus ; republier le même point le met à jour. Les
         anciens, sans identifiant, gardent un point par jour et par personne. */
      ? "point-" + slug(d.date || jourParis()) + "-" + slug(d.pointId || personne.nom) + ".pdf"
      : photos
      ? "photos-" + slug(d.date || jourParis()) + "-" + slug(d.suiviId || personne.nom) + ".zip"
      : commande
        ? "commande-" + slug(d.date || jourParis()) + "-" + slug(personne.nom) + ".pdf"
        : suivi
          /* chaque suivi est indépendant : un fichier par suivi, sans
             numéro de visite. Les anciens gardaient un seul rapport. */
          ? (d.suiviId
              ? "suivi-" + slug(d.date || jourParis()) + "-" + slug(d.suiviId) + ".pdf"
              : "suivi-de-travaux.pdf")
          : "releve.pdf";
    const cle = ref + "/" + nomFichier;

    const octets = Buffer.from(d.pdf, "base64");
    if (octets.length > 5.5 * 1024 * 1024) return json({ erreur: "Rapport trop lourd pour la publication." }, 413);
    await store.set(cle, octets, { metadata: { type: typeDuFichier(cle) } });

    const idx = await lireIndex();
    const nouveauDossier = !idx.chantiers[ref];
    const c = idx.chantiers[ref] || { ref, client: "", adresse: "", fichiers: [] };
    if (d.client && !c.clientFixe) c.client = d.client;     /* un nom changé sur le site n'est plus écrasé */
    if (d.adresse) c.adresse = d.adresse;
    /* un dossier archivé qu'on restaure (depuis son ZIP) retrouve les liens de son espace client :
       le client et les QR des tableaux rouvrent le dossier complet, l'espace mis de côté n'a plus lieu d'être */
    /* seulement pour une vraie restauration : une autre affaire qui reprendrait la même référence n'hérite de rien */
    if (nouveauDossier && d.restauration === true && bureau) {
      try {
        const ie = (await store.get("espaces/_index.json", { type: "json" })) || {};
        for (const id of Object.keys(ie).filter((k) => ie[k].ref === ref)) {
          const e = await store.get("espaces/" + id + ".json", { type: "json" });
          for (const jt of ((e && e.liens) || [])) {
            const l = await lireLien(jt);
            if (!l || l.espace !== id) continue;
            c.liens = (c.liens || []).filter((x) => x.jeton !== jt).concat([{ jeton: jt, genre: l.genre, tableau: l.tableau || "", cree: l.cree, par: l.par }]);
            delete l.espace; l.ref = ref;
            await magasinAnnuaire().setJSON("liens/" + jt + ".json", l);
          }
          try { const res = await store.list({ prefix: "espaces/" + id + "/" }); for (const b of (res.blobs || [])) await store.delete(b.key); } catch { /* rien */ }
          try { await store.delete("espaces/" + id + ".json"); } catch { /* déjà parti */ }
          delete ie[id];
        }
        await store.setJSON("espaces/_index.json", ie);
      } catch { /* pas d'espace gardé */ }
    }
    const pos = positionValide(d.lat, d.lon);
    if (pos) { c.lat = pos.lat; c.lon = pos.lon; }

    const ancien = c.fichiers.find((f) => f.cle === cle);
    if (ancien && !bureau && ancien.auteur !== personne.nom) {
      return json({ erreur: "Ce document a déjà été publié par " + ancien.auteur + "." }, 409);
    }
    const entree = {
      cle,
      titre: d.titre || (schema ? "Schéma unifilaire" : point ? "Le point de chantier" : technique ? "Document technique" : carnet ? "Carnet d'échantillons" : doe ? "Dossier des ouvrages exécutés" : memoire ? "Mémoire technique" : autocontrole ? "Fiche autocontrôle et mise en service" : reportage ? "Reportage photo" : sav ? "Intervention SAV" : etiquettes ? "Étiquettes de tableau" : reception ? "Procès-verbal de réception" : photos ? "Photos du chantier" : commande ? "Commande et reste à faire" : suivi ? "Suivi de chantier" : "Relevé technique"),
      type: schema ? "schema" : point ? "point" : technique ? "technique" : carnet ? "carnet" : doe ? "doe" : memoire ? "memoire" : autocontrole ? "autocontrole" : reportage ? "reportage" : sav ? "sav" : etiquettes ? "etiquettes" : reception ? "reception" : photos ? "photos" : commande ? "commande" : suivi ? "suivi" : "releve",
      visite: d.visite || "",
      etape: d.etape || "",
      date: d.date || jourParis(),
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
    if (sav && d.savFiche === "appel") entree.fiche = "appel";
    c.fichiers = c.fichiers.filter((f) => f.cle !== cle);
    /* une intervention SAV confiée, une fois publiée, n'est plus « à terminer »
       (la fiche d'appel, elle, la laisse en attente) */
    if (sav && d.savFiche !== "appel" && typeof d.brouillon === "string" && /^[^/]+\/sav-a-terminer-[a-z0-9-]+\.json$/i.test(d.brouillon)) {
      const refB = d.brouillon.split("/")[0], cB = idx.chantiers[refB];
      const fB = cB && cB.fichiers.find((f) => f.cle === d.brouillon);
      if (fB && (fB.auteur === personne.nom || (fB.destinataires || []).indexOf(personne.nom) >= 0 || bureau)) {
        cB.fichiers = cB.fichiers.filter((f) => f.cle !== d.brouillon);
        if (refB !== ref && !cB.fichiers.length && !(cB.liens || []).length) delete idx.chantiers[refB];
        try { await store.delete(d.brouillon); } catch { /* rien à retirer */ }
        entree.appel = fB.appel || null;
      }
    }
    /* un relevé publié n'est plus un relevé en cours */
    if (entree.type === "releve") {
      const brouillon = ref + "/releve-a-poursuivre.json";
      if (c.fichiers.some((f) => f.cle === brouillon)) {
        c.fichiers = c.fichiers.filter((f) => f.cle !== brouillon);
        try { await store.delete(brouillon); } catch { /* rien à retirer */ }
      }
    }
    if (entree.type === "releve") {
      /* le relevé publié constitue l'équipe du chantier, sous les noms
         des comptes (le chargé d'affaires d'un relevé est tapé à la main) */
      let comptesEq = [];
      try { comptesEq = await lireComptes(personne.societe); } catch { comptesEq = []; }
      const equipe = new Set((c.equipe || []).map((n) => nomDuCompte(n, comptesEq)));
      equipe.add(nomDuCompte(entree.auteur, comptesEq));
      (entree.destinataires || []).forEach((n) => equipe.add(nomDuCompte(n, comptesEq)));
      c.equipe = Array.from(equipe).filter(Boolean);
    } else if (!c.equipe || !c.equipe.length) {
      /* premier document d'un dossier sans relevé : son auteur en est
         responsable, sous le nom de son compte */
      let comptesEq = [];
      try { comptesEq = await lireComptes(personne.societe); } catch { comptesEq = []; }
      c.equipe = [nomDuCompte(entree.auteur, comptesEq)].filter(Boolean);
    }
    c.fichiers.push(entree);
    c.fichiers.sort((a, b) => rang(b) - rang(a));
    if (point && (Array.isArray(d.reste) || Array.isArray(d.retires))) {
      fusionnerReste(c, d.reste, d.retires, { titre: entree.titre, pointId: String(d.pointId || ""), auteur: personne.nom });
    }
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
      /* et sur le téléphone, sans faire attendre la publication */
      lireComptes(personne.societe).then((comptes) => prevenirPush(store, magasinAnnuaire(), concernes(entree, c, entree.auteur), "documents", {
        titre: libelleDocument(entree),
        texte: (c.client || ref) + " — déposé par " + entree.auteur,
        url: "./chantier.html?ref=" + encodeURIComponent(ref),
        tag: "doc-" + cle
      }, contactPush(url.origin), { comptes, exclure: [personne.nom, entree.auteur] })).catch(() => {});
    }

    /* tâches datées : une entrée par tâche, pour les notifications */
    if (Array.isArray(d.taches)) {
      for (const t of d.taches) {
        const qui = String(t.qui || "").trim();
        const quand = String(t.quand || "").slice(0, 10);
        if (!qui || !quand) continue;                    /* sans qui ni quand, pas de rappel */
        /* une tâche du point a son identifiant : un seul rappel, repris d'un point à l'autre */
        const stable = point && ID_TACHE.test(String(t.id || ""));
        const id = stable
          ? "taches/point-" + slug(ref) + "-" + slug(t.id) + ".json"
          : "taches/" + quand + "-" + slug(qui) + "-" + slug(String(t.texte || "").slice(0, 40))
            + "-" + Date.now().toString(36) + ".json";
        let avant = null;
        if (stable) { try { avant = await store.get(id, { type: "json" }); } catch { avant = null; } }
        if (avant && avant.faite) continue;              /* cochée ailleurs entre-temps */
        try {
          await store.setJSON(id, {
            texte: String(t.texte || ""), prio: t.prio || "", qui, quand,
            chantier: ref, client: d.client || "", auteur: personne.nom,
            cree: (avant && avant.cree) || new Date().toISOString(), faite: false,
            ...(stable ? { reste: { ref, id: String(t.id) }, notifie: (avant && avant.quand === quand && avant.notifie) || "" } : {})
          });
        } catch { /* la publication reste valable */ }
      }
    }

    /* une tâche cochée dans le point : son rappel s'arrête */
    if (point && Array.isArray(d.reste)) {
      for (const t of d.reste) {
        if (!t || !t.fait || !ID_TACHE.test(String(t.id || ""))) continue;
        await rappelFait(store, ref, t.id, personne.nom);
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
    if (f) {
      f.donnees = true; f.ficheMaj = new Date().toISOString();
      if (f.type === "releve") { try { f.pv = resumePv(JSON.parse(donnees)); } catch { delete f.pv; } }
      await store.setJSON(INDEX, idx);
    }
    return json({ ok: true });
  }

  const deposerBrouillonSav = async (d) => {
    /* SAV : le bureau prend l'appel et commence la fiche, un technicien la
       termine sur place. Pas de PDF : la fiche, le technicien, et qui a
       pris l'appel. Une fiche confiée par intervention (plusieurs SAV
       peuvent attendre sur le même dossier). */
    if (!d.fiche) return json({ erreur: "Fiche vide." }, 400);
    if (!aAcces(personne, APPLI_DU_TYPE.sav || "sav")) return json({ erreur: "Cette appli ne vous est pas attribuée. Voyez avec votre administrateur." }, 403);
    const dest = Array.isArray(d.destinataires) ? d.destinataires.filter(Boolean).slice(0, 1) : [];
    if (!dest.length) return json({ erreur: "Choisissez le technicien qui termine l'intervention." }, 400);
    const id = String(d.id || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || Date.now().toString(36);
    const ref = slug(d.chantier || d.client || "sans-ref").toUpperCase();
    const cle = ref + "/sav-a-terminer-" + id + ".json";
    const idx = await lireIndex();
    /* une fiche déjà confiée ailleurs (le dossier a changé de référence) : on la déplace */
    Object.values(idx.chantiers).forEach((c0) => {
      const avant = (c0.fichiers || []).find((f) => f.brouillon && f.type === "sav" && f.cle !== cle && f.cle.endsWith("/sav-a-terminer-" + id + ".json"));
      if (avant) { c0.fichiers = c0.fichiers.filter((f) => f !== avant); store.delete(avant.cle).catch(() => {}); if (!c0.fichiers.length && !(c0.liens || []).length) delete idx.chantiers[c0.ref]; }
    });
    await store.set(cle, d.fiche, { metadata: { type: "application/json" } });
    const c = idx.chantiers[ref] || { ref, client: d.client || "", adresse: d.adresse || "", fichiers: [] };
    if (d.client && !c.clientFixe) c.client = d.client;     /* un nom changé sur le site n'est plus écrasé */
    if (d.adresse && !c.adresse) c.adresse = d.adresse;
    /* un dossier né de l'appel : celui qui l'a pris en est le responsable,
       le technicien pourra publier « dans le dossier » */
    if (!c.equipe || !c.equipe.length) c.equipe = [nomDuCompte(personne.nom, await lireComptes(personne.societe))].filter(Boolean);
    const avant = c.fichiers.find((f) => f.cle === cle);
    c.fichiers = c.fichiers.filter((f) => f.cle !== cle);
    const court = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
    /* l'heure de l'appel et qui l'a pris, tels que notés sur la fiche */
    const appelDe = (a) => {
      const le = a && typeof a.le === "string" && !isNaN(Date.parse(a.le)) ? new Date(a.le).toISOString() : new Date().toISOString();
      return { par: court(a && a.par, 80) || personne.nom, le };
    };
    const entree = {
      cle, titre: "Intervention SAV à terminer", type: "sav", visite: "", etape: court(d.nature, 60),
      date: d.date || jourParis(),
      auteur: avant ? avant.auteur : personne.nom, destinataires: dest, publie: new Date().toISOString(),
      donnees: true, brouillon: true, lectures: {},
      appel: d.appel ? appelDe(d.appel) : (avant && avant.appel) || appelDe(null),
      urgence: court(d.urgence, 40), motif: court(d.motif, 160), rdv: court(d.rdv, 80), confiePar: personne.nom
    };
    c.fichiers.push(entree);
    c.maj = new Date().toISOString();
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    let prevenus = [];
    const comptes = await lireComptes(personne.societe);
    prevenirPush(store, magasinAnnuaire(), dest, "documents", {
      titre: "SAV à terminer" + (entree.urgence && entree.urgence !== "Normale" ? " — " + entree.urgence : ""),
      texte: (c.client || ref) + (entree.motif ? " : " + entree.motif : "") + " — confié par " + personne.nom,
      url: "./sav.html?terminer=" + encodeURIComponent(cle),
      tag: "sav-" + id
    }, contactPush(url.origin), { comptes, exclure: [personne.nom] }).catch(() => {});
    return json({ ok: true, ref, cle, prevenus });
  };

  if (action === "sav-a-terminer") {
    /* les interventions confiées : au technicien celles qu'il doit terminer,
       à celui qui a pris l'appel celles qui attendent encore */
    const idx = await lireIndex();
    const moi = (n) => n === personne.nom || memeNom(n, personne.nom);
    const out = [];
    Object.values(idx.chantiers).forEach((c) => {
      (c.fichiers || []).forEach((f) => {
        if (f.type !== "sav" || !f.brouillon) return;
        const pourMoi = (f.destinataires || []).some(moi), deMoi = moi(f.auteur) || moi(f.confiePar);
        /* une demande faite en ligne par le client : pour le bureau et l'équipe du chantier */
        const equipe = f.demandeClient && (c.equipe || []).some(moi);
        if (!pourMoi && !deMoi && !bureau && !equipe) return;
        out.push({ cle: f.cle, ref: c.ref, client: c.client, adresse: c.adresse || "", date: f.date, publie: f.publie,
          technicien: (f.destinataires || [])[0] || "", appel: f.appel || null, urgence: f.urgence || "", motif: f.motif || "", rdv: f.rdv || "",
          nature: f.etape || "", pourMoi, deMoi, demandeClient: !!f.demandeClient, demandeSorte: f.demandeSorte || (f.demandeClient ? "sav" : "") });
      });
    });
    out.sort((a, b) => (a.pourMoi === b.pourMoi ? 0 : a.pourMoi ? -1 : 1) || (b.publie || "").localeCompare(a.publie || ""));
    return json({ interventions: out });
  }

  if (action === "deposer-brouillon") {
    /* relevé transmis à poursuivre : pas de PDF, juste la fiche et ses destinataires */
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (d.type === "sav") return await deposerBrouillonSav(d);
    if (!d.fiche) return json({ erreur: "Relevé vide." }, 400);
    const ref = slug(d.chantier || d.client || "sans-ref").toUpperCase();
    const dest = Array.isArray(d.destinataires) ? d.destinataires.filter(Boolean) : [];
    if (!dest.length) return json({ erreur: "Choisissez au moins une personne." }, 400);
    const cle = ref + "/releve-a-poursuivre.json";
    await store.set(cle, d.fiche, { metadata: { type: "application/json" } });
    const idx = await lireIndex();
    const c = idx.chantiers[ref] || { ref, client: d.client || "", adresse: "", fichiers: [] };
    if (d.client && !c.clientFixe) c.client = d.client;     /* un nom changé sur le site n'est plus écrasé */
    c.fichiers = c.fichiers.filter((f) => f.cle !== cle);
    c.fichiers.push({
      cle, titre: d.titre || "Relevé à poursuivre", type: "releve", visite: "", etape: "",
      date: d.date || jourParis(),
      auteur: personne.nom, destinataires: dest, publie: new Date().toISOString(),
      donnees: true, brouillon: true, lectures: {}
    });
    c.maj = new Date().toISOString();
    idx.chantiers[ref] = c;
    await store.setJSON(INDEX, idx);
    let prevenus = [];
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
  /* Le rappel posé sur une ligne de to-do list (un jour, une heure) : une
     tâche datée par ligne, pour celui qui l'a posé. Elle part en
     notification à l'heure dite, comme les rappels du suivi, et revient
     sur l'accueil. Une ligne cochée, supprimée ou sans rappel retire la
     sienne. Seules les listes envoyées sont revues : une liste absente de
     l'envoi n'a rien dit de ses rappels. */
  async function synchroRappelsTodo(listes) {
    const pre = "taches/todo-" + slug(personne.nom) + "-";
    const gardes = new Set(), vues = [];
    for (const l of (Array.isArray(listes) ? listes : [])) {
      if (!l || !l.id) continue;
      vues.push(slug(String(l.id)) + "-");
      for (const it of (Array.isArray(l.items) ? l.items : [])) {
        const r = it && it.rappel;
        if (!r || it.fait || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.quand || ""))) continue;
        /* sur une liste partagée, chacun envoie les rappels de tous : on ne garde que les siens
           (le nom du compte, ou le nom affiché de la session, plus long) */
        const q = String(r.qui || "");
        if (q && q !== personne.nom && !memeNom(q, personne.nom) && !memeNom(q.split(/\s+/)[0], personne.nom)) continue;
        const cleR = pre + slug(String(l.id)) + "-" + slug(String(it.id)) + ".json";
        gardes.add(cleR);
        let avant = null;
        try { avant = await store.get(cleR, { type: "json" }); } catch { avant = null; }
        const t = {
          texte: String(it.texte || "").trim().slice(0, 300) || "Tâche de la to-do list", prio: "", qui: personne.nom,
          quand: r.quand, heure: /^\d{2}:\d{2}$/.test(String(r.heure || "")) ? r.heure : "08:00",
          rappel: true, todo: String(l.id), item: String(it.id), liste: String(l.titre || "").trim().slice(0, 80),
          auteurListe: l.auteur || personne.nom, cree: (avant && avant.cree) || new Date().toISOString(), faite: false,
          notifie: (avant && avant.notifie) || ""
        };
        if (!avant || JSON.stringify(avant) !== JSON.stringify(t)) await store.setJSON(cleR, t);
      }
    }
    try {
      const res = await store.list({ prefix: pre });
      for (const b of (res.blobs || [])) {
        if (gardes.has(b.key)) continue;
        const reste = b.key.slice(pre.length);
        if (!vues.some((v) => reste.startsWith(v))) continue;
        try { await store.delete(b.key); } catch { /* déjà parti */ }
      }
    } catch { /* rien à retirer */ }
  }
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
    const jour = jourParis();
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
      try { await synchroRappelsTodo(d.listes); } catch { /* les rappels suivront au prochain envoi */ }
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
          /* ses rappels ne sonneront plus, chez personne */
          try {
            const res = await store.list({ prefix: "taches/todo-" });
            for (const b of (res.blobs || [])) if (b.key.indexOf("-" + slug(id) + "-") > 0) await store.delete(b.key);
          } catch { /* rien à retirer */ }
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

  /* ---------- le calendrier de l'accueil : un rappel à un jour, une heure ----------
     « Téléphoner à M. Dupont » le 5 octobre à 9 h : une tâche datée, pour
     soi seul, notifiée à l'heure dite comme les autres rappels. */
  if (action === "rappel-creer") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const texte = String(d.texte || "").trim().slice(0, 300);
    const quand = String(d.quand || "").slice(0, 10);
    if (!texte) return json({ erreur: "Écrivez le rappel." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quand)) return json({ erreur: "Choisissez le jour." }, 400);
    const heure = /^\d{2}:\d{2}$/.test(String(d.heure || "")) ? d.heure : "09:00";
    const id = Date.now().toString(36) + randomBytes(3).toString("hex");
    const cle = "taches/cal-" + slug(personne.nom) + "-" + id + ".json";
    const t = { texte, prio: "", qui: personne.nom, quand, heure, rappel: true, cal: true,
      auteur: personne.nom, cree: new Date().toISOString(), faite: false, notifie: "" };
    await store.setJSON(cle, t);
    return json({ ok: true, tache: { cle, ...t } });
  }
  if (action === "rappel-supprimer") {
    const cle = url.searchParams.get("cle") || "";
    if (cle.indexOf("taches/cal-") !== 0) return json({ erreur: "Rappel introuvable." }, 404);
    let t = null;
    try { t = await store.get(cle, { type: "json" }); } catch { t = null; }
    if (!t) return json({ ok: true });
    if (t.qui !== personne.nom) return json({ erreur: "Ce rappel est à quelqu'un d'autre." }, 403);
    try { await store.delete(cle); } catch { /* déjà parti */ }
    return json({ ok: true });
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
    /* le rappel d'une tâche d'un point : cochée aussi dans le reste à faire du chantier */
    if (t.reste && t.reste.ref && t.reste.id) {
      try {
        const idx = await lireIndex();
        const c = idx.chantiers[t.reste.ref];
        const it = c && (c.reste || []).find((x) => x.id === t.reste.id);
        if (it && !it.fait) {
          Object.assign(it, { fait: true, faitPar: personne.nom, faitLe: t.faiteLe, faitDans: "accueil", maj: t.faiteLe });
          await store.setJSON(INDEX, idx);
        }
      } catch { /* la tâche est faite, la liste suivra */ }
    }
    /* un rappel de to-do list : « Fait » coche aussi la ligne dans sa liste */
    if (t.todo && t.item) {
      const cleL = cleNotes(t.auteurListe || t.qui);
      try {
        await sousVerrou(personne.societe + ":" + cleL, async () => {
          const l = await lireNotes(cleL);
          const liste = l.find((n) => n.id === t.todo);
          const it = liste && (liste.items || []).find((x) => x.id === t.item);
          if (!it || it.fait) return;
          const maj = new Date().toISOString();
          it.fait = true; it.maj = maj; liste.maj = maj;
          await store.setJSON(cleL, l);
        });
      } catch { /* la tâche est faite, la liste suivra */ }
    }
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
    /* les points déjà publiés : le suivant prend le numéro d'après */
    const pts = c.fichiers.filter((f) => f.type === "point");
    const numeroSuivant = Math.max(pts.length, ...pts.map((f) => parseInt(f.visite, 10) || 0)) + 1;
    const points = pts.filter((f) => voit(personne, f, c))
      .map((f) => ({ titre: f.titre || "", numero: f.visite || "", date: f.date || "", auteur: f.auteur || "" }))
      .sort((x, y) => (parseInt(x.numero, 10) || 0) - (parseInt(y.numero, 10) || 0) || String(x.date).localeCompare(String(y.date)));
    return json({
      ref, client: c.client || "", equipe, points, numeroSuivant, reste: c.reste || [],
      auteur: (c.fichiers[0] || {}).auteur || "",
      personnes: comptes.map((u) => ({ nom: u.nom, role: u.role })),
      peutModifier: bureau
    });
  }

  /* ---------- le reste à faire du chantier : cocher, décocher ---------- */
  if (action === "reste-cocher") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ref = slug(d.ref || "").toUpperCase();
    const id = String(d.id || "");
    if (!ID_TACHE.test(id)) return json({ erreur: "Tâche introuvable." }, 404);
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    const membre = (c.equipe || []).indexOf(personne.nom) >= 0 || bureau
      || c.fichiers.some((f) => voit(personne, f, c));
    if (!membre) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const it = (c.reste || []).find((x) => x.id === id);
    if (!it) return json({ erreur: "Tâche introuvable." }, 404);
    const maintenant = new Date().toISOString();
    if (d.fait) Object.assign(it, { fait: true, faitPar: personne.nom, faitLe: maintenant, faitDans: "chantier" });
    else { it.fait = false; delete it.faitPar; delete it.faitLe; delete it.faitDans; }
    it.maj = maintenant;
    await store.setJSON(INDEX, idx);
    if (it.fait) await rappelFait(store, ref, id, personne.nom);
    else {
      /* décochée : son rappel repart */
      const cleR = "taches/point-" + slug(ref) + "-" + slug(id) + ".json";
      try { const t = await store.get(cleR, { type: "json" }); if (t && t.faite) { t.faite = false; delete t.faitePar; delete t.faiteLe; await store.setJSON(cleR, t); } } catch { /* pas de rappel */ }
    }
    return json({ ok: true, tache: it });
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
      for (const k of Object.keys(PREFS_DEFAUT)) {
        if (typeof PREFS_DEFAUT[k] === "boolean" && typeof d[k] === "boolean") f.prefs[k] = d[k];
        if (typeof PREFS_DEFAUT[k] === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d[k] || ""))) f.prefs[k] = d[k];
      }
    }
    await store.setJSON(cleAbonne(personne.nom), f);
    return json({ ok: true, prefs: f.prefs, appareils: f.abonnements.length });
  }
  if (action === "push-journal") {
    /* les dernières notifications : les siennes, ou toutes pour l'administrateur */
    let j = [];
    try { j = (await store.get("push/journal.json", { type: "json" })) || []; } catch { j = []; }
    const tout = admin && url.searchParams.get("tout") === "1";
    return json({ journal: (Array.isArray(j) ? j : []).filter((e) => tout || e.pour === personne.nom).slice(0, 30) });
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

  /* ---------- ma prise de rendez-vous : réglages, essai de l'agenda, mes rendez-vous ---------- */
  if (action === "rdv-reglages" || action === "rdv-reglages-enregistrer" || action === "rdv-tester" || action === "rdv-annuler-pro") {
    const a = magasinAnnuaire(), cleDe = "rdv-de/" + personne.societe + "/" + personne.identifiant + ".json";
    let ptr = null; try { ptr = await a.get(cleDe, { type: "json" }); } catch { ptr = null; }
    let R = ptr ? await lireRdv(ptr.jeton) : null;
    const comptes = await lireComptes(personne.societe);
    const moi = comptes.find((x) => String(x.identifiant).trim().toLowerCase() === personne.identifiant) || {};
    const vue = async () => {
      if (!R) return { reglages: { actif: false, ics: "", email: moi.email || "", jours: [1, 2, 3, 4, 5], debut: "08:30", fin: "17:30", pauseDebut: "12:00", pauseFin: "13:30",
        duree: 60, pas: 30, delai: 24, horizon: 21, marge: 0, lieu: "", intro: "" }, rendezvous: [] };
      const liste = (await reservationsDe(store, R.jeton)).filter((x) => x.fin > Date.now() - 864e5).sort((x, y) => x.debut - y.debut)
        .map((x) => ({ id: x.id, debut: x.debut, fin: x.fin, nom: x.nom, tel: x.tel, email: x.email, adresse: x.adresse, motif: x.motif, ref: x.ref, annule: !!x.annule, texte: texteRdv(x.debut) }));
      const { societe: _s, identifiant: _i, ...publics } = R;
      return { reglages: publics, lien: url.origin + "/rdv.html?r=" + R.jeton, flux: url.origin + "/api/rapports?action=rdv-ics&k=" + R.flux, rendezvous: liste };
    };
    if (action === "rdv-reglages") return json(await vue());
    let d; try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (action === "rdv-tester") {
      const ag = await lireAgenda(d.ics, true);
      if (ag.erreur) return json({ erreur: ag.erreur }, 400);
      const t0 = Date.now(), occ = occupations(ag.evs, t0, t0 + 21 * 864e5);
      return json({ ok: true, evenements: ag.evs.length, occupes: occ.length, prochain: occ[0] ? texteRdv(occ[0].debut) : "" });
    }
    if (action === "rdv-annuler-pro") {
      if (!R) return json({ erreur: "Aucun rendez-vous." }, 404);
      const liste = await reservationsDe(store, R.jeton), x = liste.find((y) => y.id === d.id);
      if (!x) return json({ erreur: "Rendez-vous introuvable." }, 404);
      x.annule = true; x.annuleLe = new Date().toISOString(); x.annulePar = personne.nom;
      await store.setJSON("rdv/reservations-" + R.jeton + ".json", liste);
      if (x.rappel) { try { await store.delete(x.rappel); } catch { /* déjà parti */ } }
      return json(Object.assign({ ok: true }, await vue()));
    }
    /* enregistrer */
    const txt = (v, n) => String(v || "").trim().slice(0, n), hm = (v, def) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? v : def);
    const email = txt(d.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ erreur: "Cette adresse e-mail n'a pas l'air complète." }, 400);
    const icsLien = txt(d.ics, 1000);
    if (icsLien && !/^(https?|webcal):\/\//i.test(icsLien)) return json({ erreur: "Le lien de l'agenda doit commencer par https:// (ou webcal://)." }, 400);
    const jours = (Array.isArray(d.jours) ? d.jours : []).map(Number).filter((x) => x >= 1 && x <= 7);
    const nv = Object.assign(R || { jeton: randomBytes(15).toString("base64url"), flux: randomBytes(18).toString("base64url"), cree: new Date().toISOString() }, {
      societe: personne.societe, identifiant: personne.identifiant, nom: personne.nom, actif: !!d.actif, ics: icsLien, email: email || moi.email || "",
      jours: jours.length ? jours : [1, 2, 3, 4, 5], debut: hm(d.debut, "08:30"), fin: hm(d.fin, "17:30"),
      pauseDebut: d.pauseDebut ? hm(d.pauseDebut, "") : "", pauseFin: d.pauseFin ? hm(d.pauseFin, "") : "",
      duree: [30, 45, 60, 90, 120, 180].indexOf(+d.duree) >= 0 ? +d.duree : 60, pas: [15, 30, 60].indexOf(+d.pas) >= 0 ? +d.pas : 30,
      delai: [0, 2, 4, 24, 48, 72].indexOf(+d.delai) >= 0 ? +d.delai : 24, horizon: [7, 14, 21, 28, 42, 60].indexOf(+d.horizon) >= 0 ? +d.horizon : 21,
      marge: [0, 15, 30, 45, 60].indexOf(+d.marge) >= 0 ? +d.marge : 0, lieu: txt(d.lieu, 120), intro: txt(d.intro, 400), maj: new Date().toISOString() });
    if (nv.debut >= nv.fin) return json({ erreur: "L'heure de fin doit suivre l'heure de début." }, 400);
    R = nv;
    await a.setJSON("rdv/" + R.jeton + ".json", R);
    await a.setJSON("rdv-flux/" + R.flux + ".json", { jeton: R.jeton });
    await a.setJSON(cleDe, { jeton: R.jeton });
    let carte = {}; try { carte = (await a.get("rdv-societe/" + personne.societe + ".json", { type: "json" })) || {}; } catch { carte = {}; }
    carte[personne.nom] = { jeton: R.jeton, actif: R.actif, role: personne.role };
    await a.setJSON("rdv-societe/" + personne.societe + ".json", carte);
    return json(Object.assign({ ok: true }, await vue()));
  }

  /* ---------- les espaces clients gardés après l'archivage d'un dossier ---------- */
  if (action === "espaces" || action === "espace-fermer") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    let ie = {}; try { ie = (await store.get("espaces/_index.json", { type: "json" })) || {}; } catch { ie = {}; }
    if (action === "espace-fermer") {
      let d; try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
      const id = String(d.id || "");
      if (!ie[id]) return json({ erreur: "Espace inconnu." }, 404);
      let e = null; try { e = await store.get("espaces/" + id + ".json", { type: "json" }); } catch { e = null; }
      for (const jt of ((e && e.liens) || [])) {
        const l = await lireLien(jt);
        /* un lien rattaché depuis à un dossier vivant (demande, restauration) n'est pas coupé */
        if (!l || l.espace !== id) continue;
        const idx0 = await lireIndex();
        if (idx0.chantiers[l.ref] && (idx0.chantiers[l.ref].liens || []).some((x) => x.jeton === jt)) { delete l.espace; }
        else { l.actif = false; l.revoque = new Date().toISOString(); l.revoquePar = personne.nom + " (espace fermé)"; }
        await magasinAnnuaire().setJSON("liens/" + jt + ".json", l);
      }
      try { const res = await store.list({ prefix: "espaces/" + id + "/" }); for (const b of (res.blobs || [])) { try { await store.delete(b.key); } catch { /* suivant */ } } } catch { /* rien */ }
      try { await store.delete("espaces/" + id + ".json"); } catch { /* déjà parti */ }
      delete ie[id];
      await store.setJSON("espaces/_index.json", ie);
      return json({ ok: true });
    }
    const out = [];
    for (const id of Object.keys(ie)) {
      let e = null; try { e = await store.get("espaces/" + id + ".json", { type: "json" }); } catch { e = null; }
      if (!e) continue;
      const liens = [];
      for (const jt of (e.liens || [])) { const l = await lireLien(jt); if (l) liens.push({ genre: l.genre, tableau: l.tableau || "", url: url.origin + "/client.html?j=" + jt }); }
      out.push({ id, ref: e.ref, client: e.client, cree: e.cree, par: e.par, documents: (e.documents || []).length, liens });
    }
    out.sort((x, y) => String(y.cree).localeCompare(String(x.cree)));
    return json({ espaces: out });
  }

  /* ---------- liens publics : créer, lister, révoquer ; ce que le client a déposé ---------- */
  /* ---------- le QR code « Nous contacter » de l'entreprise ----------
     Un seul pour tous les clients : collé sur les tableaux, imprimé sur les devis ou
     le véhicule. Il ouvre client.html sans rien d'un dossier, pour une demande de
     dépannage, de devis ou d'information. Renouveler coupe l'ancien. */
  if (action === "qr-contact" || action === "qr-contact-renouveler") {
    const a = magasinAnnuaire();
    let qc = null;
    try { qc = await store.get(QR_CONTACT, { type: "json" }); } catch { qc = null; }
    if (action === "qr-contact-renouveler") {
      if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
      if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
      if (qc && qc.jeton) {
        const ancien = await lireLien(qc.jeton);
        if (ancien) await a.setJSON("liens/" + qc.jeton + ".json", Object.assign(ancien, { actif: false, revoque: new Date().toISOString(), revoquePar: personne.nom }));
      }
      qc = null;
    }
    if (!qc || !qc.jeton || !(await lireLien(qc.jeton))) {
      const jeton = randomBytes(15).toString("base64url"), cree = new Date().toISOString();
      await a.setJSON("liens/" + jeton + ".json", { jeton, societe: personne.societe, genre: "societe", cree, par: personne.nom, actif: true });
      qc = { jeton, cree, par: personne.nom };
      await store.setJSON(QR_CONTACT, qc);
    }
    return json({ ok: true, lien: { jeton: qc.jeton, genre: "societe", cree: qc.cree, par: qc.par, url: url.origin + "/client.html?j=" + qc.jeton },
      destinataire: qc.destinataire || "" });
  }
  /* ---------- les références de l'entreprise ---------- */
  if (action === "references") {
    const r = await lireRefs(store);
    return json({ colonnes: r.colonnes, lignes: r.lignes, cle: r.cle || 0, des: r.des != null ? r.des : 1, maj: r.maj || null, par: r.par || "", source: r.source || "", modifiable: !!admin });
  }
  if (action === "references-importer" || action === "references-ligne" || action === "references-supprimer" || action === "references-colonnes") {
    if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    let d; try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const r = await lireRefs(store), maintenant = new Date().toISOString();
    if (action === "references-importer") {
      const n = nettoyerRefs(d.colonnes, d.lignes);
      if (!n.cols.length) return json({ erreur: "Aucune colonne dans le fichier." }, 400);
      if (n.lignes.length > REFS_MAX_LIGNES) return json({ erreur: "Trop de lignes (" + REFS_MAX_LIGNES + " au plus)." }, 413);
      const cle = Math.max(0, Math.min(n.cols.length - 1, parseInt(d.cle, 10) || 0));
      const des = d.des === -1 || d.des === "-1" ? -1 : Math.max(0, Math.min(n.cols.length - 1, parseInt(d.des, 10) || 0));
      const stats = { ajoutees: 0, modifiees: 0, identiques: 0, retirees: 0, sansReference: 0 };
      let colonnes = n.cols, lignes;
      if (d.mode === "fusionner" && r.colonnes.length) {
        /* mettre à jour : les colonnes des deux bases (par leur nom), les références nouvelles ajoutées, les autres complétées */
        colonnes = r.colonnes.slice();
        n.cols.forEach((c) => { if (!colonnes.some((x) => x.toLowerCase() === c.toLowerCase()) && colonnes.length < REFS_MAX_COLONNES) colonnes.push(c); });
        const ou = n.cols.map((c) => colonnes.findIndex((x) => x.toLowerCase() === c.toLowerCase()));
        const ancienneCle = r.colonnes[r.cle || 0], iCle = colonnes.findIndex((x) => x.toLowerCase() === String(n.cols[cle]).toLowerCase());
        const kCle = iCle >= 0 ? iCle : colonnes.indexOf(ancienneCle);
        lignes = r.lignes.map((l) => colonnes.map((_, i) => l[i] != null ? l[i] : ""));
        const index = new Map(); lignes.forEach((l, i) => { const k = cleRef(l[kCle]); if (k) index.set(k, i); });
        for (const l of n.lignes) {
          const k = cleRef(l[cle]);
          if (!k) { stats.sansReference++; continue; }
          const neuve = colonnes.map(() => ""); l.forEach((v, j) => { if (ou[j] >= 0) neuve[ou[j]] = v; });
          if (index.has(k)) {
            const a = lignes[index.get(k)], m = a.map((v, i) => (neuve[i] !== "" ? neuve[i] : v));
            if (m.join("\u0001") === a.join("\u0001")) stats.identiques++; else { stats.modifiees++; lignes[index.get(k)] = m; }
          } else { index.set(k, lignes.length); lignes.push(neuve); stats.ajoutees++; }
        }
        r.cle = kCle; r.des = des >= 0 ? colonnes.findIndex((x) => x.toLowerCase() === String(n.cols[des]).toLowerCase()) : -1;
      } else {
        /* remplacer : la base devient le fichier ; on compte ce qui change par rapport à l'ancienne */
        const avant = new Map(); r.lignes.forEach((l) => { const k = cleRef(l[r.cle || 0]); if (k) avant.set(k, l.join("\u0001")); });
        const vus = new Set(); lignes = [];
        for (const l of n.lignes) {
          const k = cleRef(l[cle]);
          if (!k) { stats.sansReference++; lignes.push(l); continue; }
          vus.add(k); lignes.push(l);
          if (!avant.has(k)) stats.ajoutees++; else if (avant.get(k) === l.join("\u0001")) stats.identiques++; else stats.modifiees++;
        }
        avant.forEach((_, k) => { if (!vus.has(k)) stats.retirees++; });
        r.cle = cle; r.des = des;
      }
      if (lignes.length > REFS_MAX_LIGNES) return json({ erreur: "Trop de lignes (" + REFS_MAX_LIGNES + " au plus)." }, 413);
      Object.assign(r, { colonnes, lignes, maj: maintenant, par: personne.nom, source: String(d.source || "").slice(0, 200) });
      await store.setJSON(REFERENCES, r);
      return json({ ok: true, total: lignes.length, stats });
    }
    if (action === "references-colonnes") {
      const nc = r.colonnes.length;
      r.cle = Math.max(0, Math.min(nc - 1, parseInt(d.cle, 10) || 0));
      r.des = d.des === -1 || d.des === "-1" ? -1 : Math.max(0, Math.min(nc - 1, parseInt(d.des, 10) || 0));
      await store.setJSON(REFERENCES, r);
      return json({ ok: true, cle: r.cle, des: r.des });
    }
    const kc = r.cle || 0;
    if (action === "references-ligne") {
      /* ajouter une référence, ou modifier celle qui avait la référence « ancienne » */
      if (!r.colonnes.length) {
        const cols = nettoyerRefs(d.colonnes || ["Référence", "Désignation"], []).cols;
        Object.assign(r, { colonnes: cols, lignes: [], cle: 0, des: cols.length > 1 ? 1 : -1 });
      }
      const ligne = r.colonnes.map((_, i) => String((d.ligne || [])[i] == null ? "" : d.ligne[i]).trim().slice(0, REFS_MAX_CASE));
      const k = cleRef(ligne[r.cle || 0]);
      if (!k) return json({ erreur: "La référence est obligatoire." }, 400);
      const ia = d.ancienne ? r.lignes.findIndex((l) => cleRef(l[r.cle || 0]) === cleRef(d.ancienne)) : -1;
      const doublon = r.lignes.findIndex((l) => cleRef(l[r.cle || 0]) === k);
      if (doublon >= 0 && doublon !== ia) return json({ erreur: "La référence « " + ligne[r.cle || 0] + " » existe déjà." }, 409);
      if (d.ancienne && ia < 0) return json({ erreur: "Référence introuvable (modifiée entre-temps ?)." }, 404);
      if (ia >= 0) r.lignes[ia] = ligne; else { if (r.lignes.length >= REFS_MAX_LIGNES) return json({ erreur: "Base pleine." }, 413); r.lignes.push(ligne); }
      Object.assign(r, { maj: maintenant, par: personne.nom });
      await store.setJSON(REFERENCES, r);
      return json({ ok: true, total: r.lignes.length, ajoutee: ia < 0 });
    }
    /* retirer une référence */
    const avantN = r.lignes.length;
    r.lignes = r.lignes.filter((l) => cleRef(l[kc]) !== cleRef(d.reference));
    if (r.lignes.length === avantN) return json({ erreur: "Référence introuvable." }, 404);
    Object.assign(r, { maj: maintenant, par: personne.nom });
    await store.setJSON(REFERENCES, r);
    return json({ ok: true, total: r.lignes.length });
  }
  /* ---------- réglages des pages clients (administrateur) ---------- */
  if (action === "reglages-clients") return json({ lienClient: await lienClientActif(store) });
  if (action === "reglages-clients-enregistrer") {
    if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    let d; try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const r = { lienClient: d.lienClient === true, maj: new Date().toISOString(), par: personne.nom };
    await store.setJSON(REGLAGES_CLIENTS, r);
    return json({ ok: true, lienClient: r.lienClient });
  }
  if (action === "qr-contact-destinataire") {
    if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
    if (!admin) return json({ erreur: "Réservé à l'administrateur." }, 403);
    let d; try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const nom = String(d.nom || "").trim();
    if (nom && !(await lireComptes(personne.societe)).some((u) => u.nom === nom)) return json({ erreur: "Compte inconnu." }, 400);
    let qc = null; try { qc = await store.get(QR_CONTACT, { type: "json" }); } catch { qc = null; }
    if (!qc) return json({ erreur: "Ouvrez d'abord le QR code." }, 404);
    qc.destinataire = nom;
    await store.setJSON(QR_CONTACT, qc);
    return json({ ok: true, destinataire: nom });
  }

  /* ---------- les demandes de contact : pour la personne choisie, et les administrateurs ---------- */
  if (action === "contacts" || action === "contact" || action === "contact-traitee") {
    const { choisi } = await destinatairesContact(store, personne.societe);
    const sienne = choisi ? (choisi === personne.nom || memeNom(choisi, personne.nom)) : false;
    if (!admin && !sienne) return json({ erreur: "Les demandes de contact vont à " + (choisi || "l'administrateur") + "." }, 403);
    if (action === "contacts") {
      const out = [];
      try {
        const res = await store.list({ prefix: CONTACTS });
        for (const b of (res.blobs || [])) {
          let x = null; try { x = await store.get(b.key, { type: "json" }); } catch { x = null; }
          if (x) out.push({ ...x, photos: (x.photos || []).length });
        }
      } catch { /* aucune */ }
      out.sort((a, b) => String(b.recue).localeCompare(String(a.recue)));
      return json({ demandes: out, aTraiter: out.filter((x) => !x.traitee).length, destinataire: choisi });
    }
    const id = String(url.searchParams.get("id") || "").replace(/[^\w-]/g, "");
    let x = null; try { x = id ? await store.get(CONTACTS + id + ".json", { type: "json" }) : null; } catch { x = null; }
    if (!x) return json({ erreur: "Demande introuvable." }, 404);
    if (action === "contact") return json({ demande: x });
    if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
    let d = {}; try { d = await req.json(); } catch { d = {}; }
    x.traitee = d.traitee === false ? null : { le: new Date().toISOString(), par: personne.nom };
    await store.setJSON(CONTACTS + id + ".json", x);
    return json({ ok: true, traitee: x.traitee });
  }

  if (action === "lien-creer" || action === "liens" || action === "lien-revoquer" || action === "depots-client" || action === "depot-client") {
    let d = {};
    if (req.method === "POST") { try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); } }
    const ref = String(d.ref || url.searchParams.get("ref") || "").trim();
    const idx = await lireIndex();
    let c = idx.chantiers[ref] || idx.chantiers[slug(ref).toUpperCase()];
    /* le QR d'un tableau s'imprime souvent avant la première publication : le dossier naît avec lui */
    if (!c && action === "lien-creer" && slug(ref)) {
      const k = slug(ref).toUpperCase();
      c = idx.chantiers[k] = { ref: k, client: String(d.client || "").trim().slice(0, 120), adresse: "", fichiers: [],
        equipe: [nomDuCompte(personne.nom, await lireComptes(personne.societe))].filter(Boolean), maj: new Date().toISOString() };
    }
    if (!c) return json({ erreur: "Dossier introuvable : publiez d'abord un document dans ce dossier." }, 404);
    if (!bureau && !membreDe(c)) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const urlDe = (j) => url.origin + "/client.html?j=" + j;
    const liste = () => (c.liens || []).map((l) => ({ jeton: l.jeton, genre: l.genre, tableau: l.tableau || "", cree: l.cree, par: l.par, url: urlDe(l.jeton) }));
    if (action === "liens") return json({ liens: liste(), lienClient: await lienClientActif(store) });
    if (action === "lien-creer") {
      const genre = d.genre === "tableau" ? "tableau" : "client";
      if (genre === "client" && !(await lienClientActif(store))) {
        return json({ erreur: "Le lien du client n'est pas activé : l'administrateur peut l'ouvrir dans Équipe.", lienClient: false }, 403);
      }
      const tab = String(d.tableau || "").replace(/\s+/g, " ").trim().slice(0, 60);
      const deja = (c.liens || []).find((l) => l.genre === genre && (genre === "client" || slug(l.tableau || "") === slug(tab)));
      if (deja) return json({ ok: true, lien: { jeton: deja.jeton, genre, tableau: deja.tableau || "", url: urlDe(deja.jeton) }, liens: liste() });
      const jeton = randomBytes(15).toString("base64url");
      const l = { jeton, societe: personne.societe, ref: c.ref, genre, tableau: genre === "tableau" ? tab : "", cree: new Date().toISOString(), par: personne.nom, actif: true };
      await magasinAnnuaire().setJSON("liens/" + jeton + ".json", l);
      c.liens = (c.liens || []).concat([{ jeton, genre, tableau: l.tableau, cree: l.cree, par: l.par }]);
      await store.setJSON(INDEX, idx);
      return json({ ok: true, lien: { jeton, genre, tableau: l.tableau, url: urlDe(jeton) }, liens: liste() });
    }
    if (action === "lien-revoquer") {
      const l = (c.liens || []).find((x) => x.jeton === d.jeton);
      if (!l) return json({ erreur: "Lien inconnu." }, 404);
      const a = magasinAnnuaire(), stocke = await lireLien(l.jeton);
      if (stocke) await a.setJSON("liens/" + l.jeton + ".json", Object.assign(stocke, { actif: false, revoque: new Date().toISOString(), revoquePar: personne.nom }));
      c.liens = c.liens.filter((x) => x.jeton !== l.jeton);
      await store.setJSON(INDEX, idx);
      return json({ ok: true, liens: liste() });
    }
    if (action === "depots-client") return json({ depots: (c.depots || []).slice().reverse() });
    if (action === "depot-client") {
      const cle = String(url.searchParams.get("cle") || "");
      const x = (c.depots || []).find((y) => y.cle === cle);
      if (!x) return json({ erreur: "Fichier introuvable." }, 404);
      const blob = await store.get(cle, { type: "arrayBuffer" });
      if (!blob) return json({ erreur: "Fichier introuvable." }, 404);
      return new Response(blob, { headers: { "content-type": x.type || typeDuFichier(cle),
        "content-disposition": 'inline; filename="' + cle.split("/").pop() + '"', "cache-control": "no-store" } });
    }
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

    const comptes = await lireComptes(personne.societe);
    const prevenus = [];
    prevenirPush(store, magasinAnnuaire(), c.equipe || [], "messages", {
      titre: "Message — " + (c.client || ref),
      texte: personne.nom + " : " + (texte ? texte.slice(0, 160) : "une photo"),
      url: "./rapports.html?discussion=" + encodeURIComponent(ref),
      tag: "discu-" + ref
    }, contactPush(url.origin), { comptes, exclure: [personne.nom] }).catch(() => {});
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
    /* le PV d'un dossier au devis accepté : lu dans la fiche du relevé,
       gardé tant qu'elle ne change pas (elle porte les photos, on ne la
       relit pas à chaque ouverture) */
    const pvDe = async (c) => {
      const r = dernierReleve(c);
      if (!r || statutAttendu(r.etape) !== "actif" || !r.donnees) return null;
      if (r.pv !== undefined) return r.pv;
      const k = personne.societe + "/" + r.cle, v = r.ficheMaj || r.publie || "";
      const vu = CACHE_PV.get(k);
      if (vu && vu.v === v) return vu.pv;
      let fiche = null;
      try { fiche = JSON.parse(await store.get(r.cle.replace(/\.pdf$/, ".json"), { type: "text" })); } catch { fiche = null; }
      const pv = resumePv(fiche);
      CACHE_PV.set(k, { v, pv });
      return pv;
    };
    for (const c of Object.values(idx.chantiers)) {
      const fichiers = c.fichiers.filter((f) => voit(personne, f, c));
      const visibles = fichiers.filter((f) => !f.brouillon);
      let pv = null;
      if (visibles.length) { try { pv = await pvDe(c); } catch { pv = null; } }
      if (visibles.length) chantiers.push({ ref: c.ref, client: c.client, adresse: c.adresse, maj: c.maj, pv,
        lat: typeof c.lat === "number" ? c.lat : null,
        lon: typeof c.lon === "number" ? c.lon : null,
        ...etatDossier(c),
        avancement: avancementDe(c),
        avancementPar: c.avancementPar || "",
        avancementLe: c.avancementLe || "",
        equipe: c.equipe || [],
        reste: c.reste || [],
        note: c.note || null,
        fichiers: visibles });
    }
    chantiers.sort((a, b) => (b.maj || "").localeCompare(a.maj || ""));
    return json({ chantiers, moi: { nom: personne.nom, role: personne.role } });
  }


  /* =====================================================================
     LE TABLEAU DE BORD DU BUREAU
     ---------------------------------------------------------------------
     Tout ce qui attend, sur une page : TS pas encore chiffrés (repris du
     dernier suivi de chaque chantier), commandes pas saisies, points
     bloquants, dossiers à relancer ; l'avancement des chantiers en cours
     et ce qui s'est passé dernièrement. « Mes dossiers » par défaut ;
     « Tout le bureau » pour l'administrateur, en vue d'ensemble.
     ===================================================================== */
  async function tsDuSuivi(f) {
    const k = personne.societe + "/" + f.cle;
    const v = f.ficheMaj || f.publie || "";
    const vu = CACHE_TS.get(k);
    if (vu && vu.v === v) return vu.ts;
    let fiche = null;
    try { fiche = JSON.parse(await store.get(f.cle.replace(/\.pdf$/, ".json"), { type: "text" })); } catch { fiche = null; }
    const date = (fiche && fiche.visite && fiche.visite.date) || (fiche && fiche.date) || f.date || "";
    /* un point de chantier : ses « Demande client », les modifications vues sur place avec le client */
    const liste = f.type === "point"
      ? (fiche && Array.isArray(fiche.demandes) ? fiche.demandes.map((t) => ({ ...t, qui: t.qui || fiche.auteur || f.auteur || "" })) : [])
      : (fiche && fiche.version === 2 && Array.isArray(fiche.ts) ? fiche.ts : []);
    const ts = liste.filter((t) => !t.fait && String(t.texte || "").trim())
      .map((t) => ({ id: String(t.id || ""), texte: String(t.texte), qui: t.qui || "", depuis: t.depuis || date }));
    CACHE_TS.set(k, { v, ts });
    return ts;
  }

  if (action === "tableau-bord") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const tout = !!admin && url.searchParams.get("portee") === "tout";
    const idx = await lireIndex();
    const maintenant = maintenantParis();
    const mois = maintenant.slice(0, 7);
    const chantiers = Object.values(idx.chantiers)
      .filter((c) => (c.fichiers || []).some((f) => !f.brouillon) && (tout || membreDe(c)));
    const aTraiter = [], avancement = [], activite = [];
    const n = { enCours: 0, finisMois: 0, ts: 0, tsChantiers: 0, commandes: 0, commandeJours: 0,
      points: 0, pointsRetard: 0, relances: 0, attente: 0 };
    const parRef = {};
    for (const c of chantiers) {
      const chez = { ref: c.ref, client: c.client || c.ref, equipe: c.equipe || [], mien: membreDe(c) };
      parRef[c.ref] = chez;
      const visibles = c.fichiers.filter((f) => !f.brouillon);
      const etat = etatDossier(c);
      for (const f of visibles) {
        activite.push({ genre: "document", quand: f.publie || f.date || "", qui: f.auteur || "", titre: f.titre || "",
          type: f.type || "", ref: c.ref, client: chez.client });
      }
      try {
        const m = await lireMessages(c.ref);
        const der = m.messages[m.messages.length - 1];
        if (der) activite.push({ genre: "message", quand: der.quand, qui: der.auteur, ref: c.ref, client: chez.client });
      } catch { /* pas de discussion */ }
      if (etat.etat === "attente") {
        n.attente++;
        if (etat.relanceDue) {
          n.relances++;
          aTraiter.push({ genre: "relance", ...chez, titre: etat.attenteNote || "En attente de réponse",
            jours: etat.joursAttente || 0, depuis: etat.attenteDepuis || "" });
        }
        continue;                       /* un devis qui attend : ni commande ni TS à suivre */
      }
      const a = avancementDe(c);
      if (c.avancementLe && c.avancementPar) {
        activite.push({ genre: "avancement", quand: c.avancementLe, qui: c.avancementPar, valeur: a, ref: c.ref, client: chez.client });
      }
      const suivis = visibles.filter((f) => f.type === "suivi").sort((x, y) =>
        String(y.date || "").localeCompare(String(x.date || "")) || String(y.publie || "").localeCompare(String(x.publie || "")));
      if (a >= 100) {
        if (String(c.avancementLe || "").slice(0, 7) === mois) n.finisMois++;
      } else {
        n.enCours++;
        const dernier = suivis[0] ? (suivis[0].date || String(suivis[0].publie || "").slice(0, 10)) : "";
        avancement.push({ ...chez, avancement: a, dernierSuivi: dernier, joursSansSuivi: dernier ? joursDepuis(dernier) : null });
      }
      for (const f of visibles) {
        if (f.type !== "commande" || f.saisie) continue;
        const j = joursDepuis(f.publie || f.date);
        n.commandes++; n.commandeJours = Math.max(n.commandeJours, j);
        aTraiter.push({ genre: "commande", ...chez, cle: f.cle, titre: f.titre || "Commande", qui: f.auteur || "",
          date: f.date || "", jours: j });
      }
      const suiviFiche = suivis.find((f) => f.donnees);
      let tsIci = 0;
      if (suiviFiche) {
        const ts = await tsDuSuivi(suiviFiche);
        for (const t of ts) {
          n.ts++; tsIci++;
          aTraiter.push({ genre: "ts", ...chez, cle: suiviFiche.cle, id: t.id, titre: t.texte, qui: t.qui,
            depuis: t.depuis, jours: joursDepuis(t.depuis), source: "suivi" });
        }
      }
      /* les « Demande client » de chaque point de chantier, tant qu'elles ne sont pas chiffrées */
      for (const pf of visibles.filter((f) => f.type === "point" && f.donnees)) {
        for (const t of await tsDuSuivi(pf)) {
          n.ts++; tsIci++;
          aTraiter.push({ genre: "ts", ...chez, cle: pf.cle, id: t.id, titre: t.texte, qui: t.qui,
            depuis: t.depuis, jours: joursDepuis(t.depuis), source: "point", origine: pf.titre || "Point de chantier" });
        }
      }
      if (tsIci) n.tsChantiers++;
    }
    /* les points bloquants des suivis, avec leur rappel */
    try {
      const res = await store.list({ prefix: "taches/" });
      for (const b of (res.blobs || [])) {
        let t = null;
        try { t = await store.get(b.key, { type: "json" }); } catch { t = null; }
        if (!t || !t.rappel || t.faite) continue;
        const chez = parRef[t.chantier];
        if (!chez && t.qui !== personne.nom) continue;
        const heure = /^\d{2}:\d{2}$/.test(t.heure || "") ? t.heure : "08:00";
        const retard = (t.quand + " " + heure) < maintenant;
        n.points++; if (retard) n.pointsRetard++;
        aTraiter.push({ genre: "point", ref: t.chantier || "", client: (chez && chez.client) || t.client || t.chantier || "",
          equipe: (chez && chez.equipe) || [], mien: t.qui === personne.nom || !!(chez && chez.mien),
          cle: b.key, titre: String(t.texte || ""), qui: t.qui || "", quand: t.quand, heure, retard,
          jours: retard ? joursDepuis(t.quand) : 0 });
      }
    } catch { /* aucun point */ }
    const prio = (x) => (x.genre === "point" && x.retard ? 0 : x.genre === "relance" ? 1 : x.genre === "point" ? 3 : 2);
    aTraiter.sort((x, y) => prio(x) - prio(y) || (y.jours || 0) - (x.jours || 0));
    avancement.sort((x, y) => x.avancement - y.avancement || String(x.client).localeCompare(String(y.client)));
    activite.sort((x, y) => String(y.quand || "").localeCompare(String(x.quand || "")));
    return json({ portee: tout ? "tout" : "mes", peutTout: !!admin, maintenant, compteurs: n,
      aTraiter, avancement, activite: activite.slice(0, 10) });
  }

  /* Un TS chiffré depuis le tableau de bord : coché dans la fiche du
     suivi où il figure, il ne passera plus au suivi suivant. */
  if (action === "ts-chiffre") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const cle = String(d.cle || "");
    const idx = await lireIndex();
    const f = trouver(idx, cle);
    if (!f || (f.type !== "suivi" && f.type !== "point")) return json({ erreur: "Suivi introuvable." }, 404);
    if (!membreDe(chantierDe(idx, cle))) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const cleFiche = cle.replace(/\.pdf$/, ".json");
    let fiche = null;
    try { fiche = JSON.parse(await store.get(cleFiche, { type: "text" })); } catch { fiche = null; }
    const liste = fiche && (f.type === "point" ? fiche.demandes : fiche.ts);
    const t = Array.isArray(liste) ? liste.find((x) => String(x.id) === String(d.id)) : null;
    if (!t) return json({ erreur: "Travaux supplémentaire introuvable." }, 404);
    t.fait = d.fait !== false;
    if (t.fait) { t.chiffrePar = personne.nom; t.chiffreLe = new Date().toISOString(); }
    else { delete t.chiffrePar; delete t.chiffreLe; }
    await store.set(cleFiche, JSON.stringify(fiche), { metadata: { type: "application/json" } });
    f.ficheMaj = new Date().toISOString();
    await store.setJSON(INDEX, idx);
    return json({ ok: true, fait: t.fait });
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

  /* ---------- changer la référence d'un dossier ----------
     La référence est la clé du dossier : ses documents, ses fiches, sa
     discussion et ses rappels sont rangés dessous. On déplace donc tout
     d'un bloc. Depuis la page du chantier, seulement tant qu'aucun relevé
     technique n'est publié (son PDF porte l'ancienne référence) ; depuis
     le relevé lui-même (avecReleve), qui va être republié avec la
     nouvelle, c'est permis. */
  /* ---------- changer le nom du chantier (le client) ----------
     Le nom affiché partout sur le site : listes, page du chantier, page du
     client. Il ne bouge plus ensuite quand une appli republie avec l'ancien :
     les PDF déjà faits gardent le nom qu'ils portaient. */
  if (action === "renommer-client") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const idx = await lireIndex();
    const c = idx.chantiers[String(d.ref || "").trim()];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    if (!bureau && !membreDe(c)) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const nom = String(d.client || "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!nom) return json({ erreur: "Donnez le nom du chantier." }, 400);
    if (nom !== c.client) {
      c.ancienNom = c.client || "";
      c.client = nom;
      c.clientFixe = { le: new Date().toISOString(), par: personne.nom };
      c.maj = new Date().toISOString();
      await store.setJSON(INDEX, idx);
    }
    return json({ ok: true, client: c.client });
  }

  /* une note courte sous l'adresse : « pas d'électricité sur place », « parking au fond à gauche »… */
  if (action === "note-chantier") {
    if (req.method !== "POST") return json({ erreur: "Méthode non permise." }, 405);
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const idx = await lireIndex();
    const c = idx.chantiers[String(d.ref || "").trim()];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    if (!bureau && !membreDe(c)) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    const texte = String(d.note || "").replace(/\s+/g, " ").trim();
    if (texte.length > 150) return json({ erreur: "150 caractères au plus." }, 400);
    if (texte) c.note = { texte, le: new Date().toISOString(), par: personne.nom };
    else delete c.note;
    await store.setJSON(INDEX, idx);
    return json({ ok: true, note: c.note || null });
  }

  if (action === "renommer-chantier") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    const ancienne = String(d.ref || "").trim();
    const brute = String(d.nouvelle || "").trim();
    if (!brute) return json({ erreur: "Donnez la nouvelle référence." }, 400);
    const nouvelle = slug(brute);
    const idx = await lireIndex();
    const c = idx.chantiers[ancienne];
    if (!c) return json({ erreur: "Dossier introuvable." }, 404);
    if (!bureau && !membreDe(c)) return json({ erreur: "Ce dossier ne vous est pas attribué." }, 403);
    if (nouvelle === ancienne) return json({ ok: true, ref: ancienne, inchange: true });
    if (idx.chantiers[nouvelle]) return json({ erreur: "La référence " + nouvelle + " est déjà celle d'un autre dossier." }, 409);
    const aUnReleve = c.fichiers.some((f) => f.type === "releve" && !f.brouillon);
    if (aUnReleve && !(d.avecReleve && bureau)) {
      return json({ erreur: "Un relevé technique est publié sur ce dossier : changez la référence depuis le relevé (Reprendre, modifier, republier)." }, 409);
    }

    /* 1. les fichiers du dossier : copier, puis effacer l'ancien */
    const prefixe = ancienne + "/";
    let deplaces = 0;
    const res = await store.list({ prefix: prefixe });
    for (const b of (res.blobs || [])) {
      const lu = await store.getWithMetadata(b.key, { type: "arrayBuffer" });
      if (!lu) continue;
      await store.set(nouvelle + "/" + b.key.slice(prefixe.length), lu.data, lu.metadata ? { metadata: lu.metadata } : undefined);
      deplaces++;
    }
    /* 2. l'index : on rebaptise le dossier et chaque clé */
    const renomme = (cle) => (String(cle).startsWith(prefixe) ? nouvelle + "/" + String(cle).slice(prefixe.length) : cle);
    c.ref = nouvelle;
    c.fichiers.forEach((f) => { f.cle = renomme(f.cle); });
    (c.depots || []).forEach((x) => { x.cle = renomme(x.cle); });
    /* les liens du client et les QR codes imprimés suivent le dossier */
    for (const l of (c.liens || [])) {
      try { const st0 = await lireLien(l.jeton); if (st0) await magasinAnnuaire().setJSON("liens/" + l.jeton + ".json", Object.assign(st0, { ref: nouvelle })); } catch { /* lien suivant */ }
    }
    c.ancienneRef = ancienne;
    c.maj = new Date().toISOString();
    delete idx.chantiers[ancienne];
    idx.chantiers[nouvelle] = c;
    await store.setJSON(INDEX, idx);
    for (const b of (res.blobs || [])) { try { await store.delete(b.key); } catch { /* déjà parti */ } }

    /* 3. la discussion du dossier */
    try {
      const fil = await store.get(cleMessages(ancienne), { type: "json" });
      if (fil) { await store.setJSON(cleMessages(nouvelle), fil); await store.delete(cleMessages(ancienne)); }
    } catch { /* pas de discussion */ }

    /* 4. les tâches et les rappels qui pointent vers le dossier */
    try {
      const lt = await store.list({ prefix: "taches/" });
      const avant = "taches/rappel-" + slug(ancienne) + "-";
      for (const b of (lt.blobs || [])) {
        let t = null;
        try { t = await store.get(b.key, { type: "json" }); } catch { t = null; }
        if (!t || t.chantier !== ancienne) continue;
        t.chantier = nouvelle;
        if (t.suivi) t.suivi = renomme(t.suivi);
        const cleT = b.key.startsWith(avant) ? "taches/rappel-" + slug(nouvelle) + "-" + b.key.slice(avant.length) : b.key;
        await store.setJSON(cleT, t);
        if (cleT !== b.key) { try { await store.delete(b.key); } catch { /* tant pis */ } }
      }
    } catch { /* pas de tâches */ }

    return json({ ok: true, ref: nouvelle, ancienne, deplaces });
  }

  /* archivage : suppression de tout un chantier après export */
  if (action === "supprimer-chantier") {
    if (!bureau) return json({ erreur: "Réservé au bureau." }, 403);
    const ref = (url.searchParams.get("ref") || "").trim();
    const idx = await lireIndex();
    const c = idx.chantiers[ref];
    if (!c) return json({ erreur: "Chantier introuvable." }, 404);
    /* « Garder l'espace du client » : ses documents (PV, DOE, schéma, étiquettes, mise en service,
       documents techniques, SAV, reportages) sont mis de côté, et tous ses liens restent ouverts.
       Sinon : le lien du client s'éteint ; le QR collé sur le tableau reste valable, il garde les
       demandes (dépannage, devis, information), sans rien du dossier. */
    const a = magasinAnnuaire();
    const garder = url.searchParams.get("garder") === "1" && (c.liens || []).length > 0;
    let qrGardes = 0, liensCoupes = 0, espaceId = "";
    if (garder) {
      espaceId = slug(ref).toLowerCase() + "-" + randomBytes(4).toString("hex");
      const docs = [];
      for (const f of c.fichiers) {
        if (f.brouillon || f.fiche === "appel" || DOCS_CLIENT.indexOf(f.type) < 0) continue;
        const blob = await store.get(f.cle, { type: "arrayBuffer" });
        if (!blob) continue;
        const cle2 = "espaces/" + espaceId + "/" + f.cle.split("/").pop();
        await store.set(cle2, blob, { metadata: { type: typeDuFichier(f.cle) } });
        docs.push({ cle: cle2, titre: libelleDocument(f), type: f.type, date: f.date || "", etape: f.etape || "" });
      }
      await store.setJSON("espaces/" + espaceId + ".json", { id: espaceId, ref: c.ref, client: c.client || "", adresse: c.adresse || "",
        cree: new Date().toISOString(), par: personne.nom, documents: docs, liens: (c.liens || []).map((l) => l.jeton) });
      let ie = {}; try { ie = (await store.get("espaces/_index.json", { type: "json" })) || {}; } catch { ie = {}; }
      ie[espaceId] = { ref: c.ref, client: c.client || "", cree: new Date().toISOString(), par: personne.nom, documents: docs.length };
      await store.setJSON("espaces/_index.json", ie);
    }
    for (const l of (c.liens || [])) {
      const st0 = await lireLien(l.jeton);
      if (!st0) continue;
      if (garder) { st0.espace = espaceId; qrGardes++; }
      else if (st0.genre === "tableau") {
        st0.archive = { client: c.client || "", adresse: c.adresse || "", le: new Date().toISOString(), par: personne.nom,
          };
        qrGardes++;
      } else { st0.actif = false; st0.revoque = new Date().toISOString(); st0.revoquePar = personne.nom + " (dossier supprimé)"; liensCoupes++; }
      if (st0.genre === "tableau" && !st0.archive) st0.archive = { client: c.client || "", adresse: c.adresse || "", le: new Date().toISOString(), par: personne.nom };
      await a.setJSON("liens/" + l.jeton + ".json", st0);
    }
    let n = 0;
    for (const f of c.fichiers) {
      await store.delete(f.cle);
      await store.delete(f.cle.replace(/\.pdf$/, ".json"));
      n++;
    }
    /* ce que le client a envoyé, et tout ce qui reste rangé sous la référence */
    try {
      const res = await store.list({ prefix: ref + "/" });
      for (const b of (res.blobs || [])) { try { await store.delete(b.key); } catch { /* suivant */ } }
    } catch { /* rien d'autre */ }
    delete idx.chantiers[ref];
    await store.setJSON(INDEX, idx);
    return json({ ok: true, supprimes: n, qrGardes, liensCoupes, espace: espaceId });
  }

  if (action === "brouillon-supprimer" && url.searchParams.get("cle")) {
    /* reprendre ou annuler une intervention SAV confiée, jamais publiée */
    const cle = String(url.searchParams.get("cle") || "");
    if (!/^[^/]+\/sav-a-terminer-[a-z0-9-]+\.json$/i.test(cle)) return json({ erreur: "Fiche inconnue." }, 400);
    const idx = await lireIndex();
    const c = idx.chantiers[cle.split("/")[0]];
    const f = c && c.fichiers.find((x) => x.cle === cle);
    if (!f) return json({ erreur: "Cette intervention n'est plus à terminer." }, 404);
    if (!bureau && f.auteur !== personne.nom && (f.destinataires || []).indexOf(personne.nom) < 0) {
      return json({ erreur: "Cette intervention ne vous est pas confiée." }, 403);
    }
    c.fichiers = c.fichiers.filter((x) => x.cle !== cle);
    if (!c.fichiers.length && !(c.liens || []).length) delete idx.chantiers[c.ref];
    await store.setJSON(INDEX, idx);
    try { await store.delete(cle); } catch { /* rien à retirer */ }
    return json({ ok: true });
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
    if (!c.fichiers.length && !(c.liens || []).length) delete idx.chantiers[ref];
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
      if (!idx.chantiers[ref].fichiers.length && !(idx.chantiers[ref].liens || []).length) delete idx.chantiers[ref];
      await store.setJSON(INDEX, idx);
    }
    return json({ ok: true });
  }

  return json({ erreur: "Action inconnue." }, 400);
}

export const config = { path: "/api/rapports" };
