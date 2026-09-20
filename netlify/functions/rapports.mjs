import { getStore } from "./magasin.mjs";
import { PROPRIETAIRE, SOCIETE_DEPART, SOCIETE_DEMO } from "./equipe.mjs";
import { DEMO } from "./demo.mjs";

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
async function prevenir(entree, chantier, auteur, origine, comptes) {
  if (!CLE_RESEND) return [];
  const cibles = (comptes || []).filter(
    (u) => (entree.destinataires || []).indexOf(u.nom) >= 0 && u.email && u.email.indexOf("@") > 0
  );
  if (!cibles.length) return [];

  const quoi =
    entree.type === "commande" ? "Commande et reste à faire"
    : entree.type === "suivi" ? "Suivi de chantier" + (entree.visite ? " — visite n° " + entree.visite : "")
    : entree.type === "reportage" ? "Reportage photo" + (entree.visite ? " — " + entree.visite : "")
    : entree.type === "autocontrole" ? "Fiche autocontrôle et mise en service"
    : entree.type === "carnet" ? "Carnet d'échantillons"
    : entree.type === "memoire" ? "Mémoire technique"
    : "Relevé technique";
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
function jetonDe(code, identifiant, motdepasse) {
  return Buffer.from(code + "|" + identifiant + ":" + motdepasse, "utf8").toString("base64");
}
const DUREE_SESSION = 3 * 24 * 60 * 60 * 1000;   /* trois jours : deux reconnexions par semaine */
function jetonAvecDate(code, id, mdp) {
  return Buffer.from(code + "|" + id + ":" + mdp + "|" + Date.now(), "utf8").toString("base64");
}
/* ---------- applis du site et droits d'accès ---------- */
/* Une liste vide vaut « toutes les applis ». L'administrateur et le
   propriétaire gardent tout, quoi qu'on leur attribue. */
const APPLIS = ["releve", "suivi", "commande", "reception", "autocontrole", "sav", "etiquettes", "photos", "carnet"];
const APPLI_DU_TYPE = {
  releve: "releve", suivi: "suivi", commande: "commande", reception: "reception",
  autocontrole: "autocontrole", sav: "sav", etiquettes: "etiquettes", reportage: "photos",
  carnet: "carnet", memoire: "carnet"
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

async function identifier(auth) {
  const a = (auth || "").trim();
  if (!a) return null;
  let clair = "";
  try { clair = Buffer.from(a, "base64").toString("utf8"); } catch { return null; }
  /* la date d'ouverture est collée en fin de jeton */
  let ouverte = 0;
  const dernier = clair.lastIndexOf("|");
  if (dernier > 0 && /^\d{10,}$/.test(clair.slice(dernier + 1))) {
    ouverte = Number(clair.slice(dernier + 1));
    clair = clair.slice(0, dernier);
  }
  if (!ouverte || Date.now() - ouverte > DUREE_SESSION) return "perimee";
  let code = SOCIETE_DEPART.code, reste = clair;
  const b = clair.indexOf("|");
  if (b > 0) { code = clair.slice(0, b).trim().toLowerCase(); reste = clair.slice(b + 1); }
  const i = reste.indexOf(":");
  if (i < 0) return null;
  const id = reste.slice(0, i).trim().toLowerCase();
  const mdp = reste.slice(i + 1);

  await lireSocietes();
  const comptes = await lireComptes(code);
  const u = comptes.find((c) => String(c.identifiant).trim().toLowerCase() === id && c.motdepasse === mdp);

  /* le compte de la société passe en premier : on garde le nom que l'équipe connaît */
  if (u) {
    const proprio = id === PROPRIETAIRE.identifiant && mdp === PROPRIETAIRE.motdepasse;
    return { nom: u.nom, role: proprio ? "admin" : u.role, email: u.email || "",
      societe: code, proprietaire: proprio, applis: applisValides(u.applis) };
  }
  /* sinon, le propriétaire entre quand même, dans n'importe quelle société */
  if (id === PROPRIETAIRE.identifiant && mdp === PROPRIETAIRE.motdepasse) {
    return { nom: PROPRIETAIRE.nom, role: "admin", proprietaire: true, societe: code,
      email: PROPRIETAIRE.email, applis: [] };
  }
  return null;
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

function jeton(u) {
  return Buffer.from(u.identifiant + ":" + u.motdepasse, "utf8").toString("base64");
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
function rang(f) {
  if (f.type === "releve") return -1;
  if (f.type === "commande") return 1000 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "photos") return 2000 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "reportage") return 2200 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "autocontrole") return 2700 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "carnet") return 800 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "memoire") return 900 + Number(new Date(f.publie || 0)) / 1e10;
  if (f.type === "reception") return 3000;
  if (f.type === "etiquettes") return 2500;
  if (f.type === "sav") return 1500 + Number(new Date(f.publie || 0)) / 1e10;
  const n = parseInt(f.visite, 10);
  return isNaN(n) ? 0 : n;
}

export default async (req) => {
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
    const p = await identifier(jetonAvecDate(code, id, mdp));
    if (!p) return json({ erreur: "Identifiant ou mot de passe incorrect." }, 401);
    const liste = await lireSocietes();
    const soc = liste.find((x) => x.code === code) || {};
    return json({ jeton: jetonAvecDate(code, id, mdp), nom: p.nom, role: p.role, applis: p.applis || [],
      societe: code, societeNom: soc.nom || "", metier: soc.metier || "", ville: soc.ville || "",
      proprietaire: !!p.proprietaire, demo: !!soc.demo });
  }

  const personne = await identifier(req.headers.get("x-auth") || url.searchParams.get("auth"));
  if (personne === "perimee") {
    return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  }
  if (!personne) return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  const bureau = personne.role === "bureau" || personne.role === "admin";
  const admin = personne.role === "admin" || personne.proprietaire;
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
      proprietaire: !!personne.proprietaire,
      metier: "", ville: "", societe: personne.societe });
  }

  if (action === "equipe") {
    const comptes = await lireComptes(personne.societe);
    return json({ personnes: comptes.map((p) => ({ nom: p.nom, role: p.role })) });
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
    return json({ comptes: comptes.map((c) => ({ identifiant: c.identifiant, nom: c.nom,
      role: c.role, email: c.email || "", motdepasse: c.motdepasse,
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
    const mdp = String(d.motdepasse || "").trim();
    const applis = applisValides(d.applis);
    if (i >= 0) {
      comptes[i] = { ...comptes[i], nom, role, email: String(d.email || "").trim(),
        motdepasse: mdp || comptes[i].motdepasse, applis };
    } else {
      if (!mdp) return json({ erreur: "Donnez un mot de passe." }, 400);
      comptes.push({ identifiant: id, motdepasse: mdp, nom, role,
        email: String(d.email || "").trim(), applis });
    }
    await ecrireComptes(personne.societe, comptes);
    return json({ ok: true, comptes: comptes.length });
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
    const mdpAdmin = String(d.adminMotdepasse || "").trim();
    if (!mdpAdmin) return json({ erreur: "Donnez le mot de passe de l'administrateur." }, 400);
    await ecrireComptes(code, [{ identifiant: idAdmin, motdepasse: mdpAdmin,
      nom: String(d.adminNom || "Administrateur"), role: "admin", email: String(d.adminEmail || "") }]);
    return json({ ok: true, code, identifiant: idAdmin });
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

    /* l'appli doit être attribuée au compte : refus côté serveur, pas seulement à l'écran */
    const appliVisee = APPLI_DU_TYPE[d.type] || "";
    if (appliVisee && !aAcces(personne, appliVisee)) {
      return json({ erreur: "Cette appli ne vous est pas attribuée. Voyez avec votre administrateur." }, 403);
    }

    /* un technicien crée un suivi de chantier et le transmet, mais ne modifie rien */
    const versDossier = d.dossier === true || d.dossier === "oui";
    if (!bureau) {
      if (!suivi && !commande && !photos && !reception && !etiquettes && !sav && !reportage && !autocontrole && !carnet && !memoire) return json({ erreur: "Le relevé technique est réservé au bureau." }, 403);
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
    const nomFichier = (carnet || memoire)
      ? (carnet ? "carnet-echantillons-" : "memoire-technique-")
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
      : photos
      ? "photos-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(personne.nom) + ".zip"
      : commande
        ? "commande-" + slug(d.date || new Date().toISOString().slice(0, 10)) + "-" + slug(personne.nom) + ".pdf"
        : suivi
          ? "suivi-de-travaux.pdf"        /* un seul rapport, enrichi à chaque visite */
          : "releve.pdf";
    const cle = ref + "/" + nomFichier;

    const octets = Buffer.from(d.pdf, "base64");
    if (octets.length > 5.5 * 1024 * 1024) return json({ erreur: "Rapport trop lourd pour la publication." }, 413);
    await store.set(cle, octets, { metadata: { type: photos ? "application/zip" : "application/pdf" } });

    const idx = await lireIndex();
    const c = idx.chantiers[ref] || { ref, client: "", adresse: "", fichiers: [] };
    if (d.client) c.client = d.client;
    if (d.adresse) c.adresse = d.adresse;

    const ancien = c.fichiers.find((f) => f.cle === cle);
    if (ancien && !bureau && ancien.auteur !== personne.nom) {
      return json({ erreur: "Ce document a déjà été publié par " + ancien.auteur + "." }, 409);
    }
    const entree = {
      cle,
      titre: d.titre || (carnet ? "Carnet d'échantillons" : memoire ? "Mémoire technique" : autocontrole ? "Fiche autocontrôle et mise en service" : reportage ? "Reportage photo" : sav ? "Intervention SAV" : etiquettes ? "Étiquettes de tableau" : reception ? "Procès-verbal de réception" : photos ? "Photos du chantier" : commande ? "Commande et reste à faire" : suivi ? "Suivi de chantier" : "Relevé technique"),
      type: carnet ? "carnet" : memoire ? "memoire" : autocontrole ? "autocontrole" : reportage ? "reportage" : sav ? "sav" : etiquettes ? "etiquettes" : reception ? "reception" : photos ? "photos" : commande ? "commande" : suivi ? "suivi" : "releve",
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

    let prevenus = [];
    if (!photos) {
      try { prevenus = await prevenir(entree, c, entree.auteur, url.origin, await lireComptes(personne.societe)); } catch { prevenus = []; }
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

    return json({ ok: true, ref, cle, remplace: !!ancien, versions: entree.versions, prevenus });
  }

  /* dépôt du contenu de la fiche, pour pouvoir la rouvrir plus tard dans l'appli */
  if (action === "deposer-fiche") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (!d.cle || !d.donnees) return json({ erreur: "Fiche incomplète." }, 400);
    const idx = await lireIndex();
    const f = trouver(idx, d.cle);
    if (!bureau && (!f || f.auteur !== personne.nom)) return json({ erreur: "Modification interdite." }, 403);
    await store.set(d.cle.replace(/\.pdf$/, ".json"), d.donnees, { metadata: { type: "application/json" } });
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

  /* ---------- listes personnelles ---------- */
  if (action === "notes") {
    const cle = "notes/" + slug(personne.nom) + ".json";
    let mien = [];
    try { mien = (await store.get(cle, { type: "json" })) || []; } catch { mien = []; }
    /* on ajoute les listes que d'autres m'ont attribuées */
    const out = mien.slice();
    try {
      const res = await store.list({ prefix: "notes/" });
      for (const b of (res.blobs || [])) {
        if (b.key === cle) continue;
        const l = (await store.get(b.key, { type: "json" })) || [];
        l.forEach((n) => { if (n.pour && n.pour === personne.nom) out.push(n); });
      }
    } catch { /* rien d'autre */ }
    return json({ listes: out });
  }

  if (action === "notes-enregistrer") {
    let d;
    try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
    if (!Array.isArray(d.listes)) return json({ erreur: "Listes attendues." }, 400);
    const cle = "notes/" + slug(personne.nom) + ".json";
    /* on ne garde que les listes dont je suis l'auteur ou qui n'en ont pas */
    const miennes = d.listes
      .filter((n) => !n.auteur || n.auteur === personne.nom)
      .map((n) => ({ ...n, auteur: personne.nom }))
      .slice(0, 300);
    await store.setJSON(cle, miennes);

    /* les cases cochées sur une liste reçue remontent chez son auteur */
    const recues = d.listes.filter((n) => n.auteur && n.auteur !== personne.nom);
    for (const n of recues) {
      const autre = "notes/" + slug(n.auteur) + ".json";
      try {
        const l = (await store.get(autre, { type: "json" })) || [];
        const i = l.findIndex((x) => x.id === n.id);
        if (i >= 0 && (n.maj || "") > (l[i].maj || "")) { l[i] = n; await store.setJSON(autre, l); }
      } catch { /* l'auteur n'a rien encore */ }
    }
    return json({ ok: true, enregistrees: miennes.length });
  }

  if (action === "note-supprimer") {
    const id = url.searchParams.get("id") || "";
    const cle = "notes/" + slug(personne.nom) + ".json";
    try {
      const l = (await store.get(cle, { type: "json" })) || [];
      await store.setJSON(cle, l.filter((n) => n.id !== id));
    } catch { /* rien à retirer */ }
    return json({ ok: true });
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
      if (visibles.length) chantiers.push({ ref: c.ref, client: c.client, adresse: c.adresse, maj: c.maj, fichiers: visibles });
    });
    chantiers.sort((a, b) => (b.maj || "").localeCompare(a.maj || ""));
    return json({ chantiers, moi: { nom: personne.nom, role: personne.role } });
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
        "content-type": zip ? "application/zip" : "application/pdf",
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
};

export const config = { path: "/api/rapports" };
