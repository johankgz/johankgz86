/* =====================================================================
   analyse-tableau.mjs — la photo du tableau, lue au regard de la NF C 15-100
   ---------------------------------------------------------------------
   La fiche d'autocontrôle envoie la photo du tableau ouvert ; Claude la
   lit et rend, en JSON :
     - le nombre de circuits derrière chaque interrupteur différentiel,
       son type, sa sensibilité, son calibre ;
     - les couleurs des conducteurs ;
     - le taux d'occupation des rangées et la réserve ;
     - les écarts à la NF C 15-100, chacun repéré sur la photo (x, y de
       0 à 1), avec l'article, la gravité et la correction à faire.

   Une lecture prend une à deux minutes : on ne fait pas attendre la
   requête (un hébergeur coupe souvent avant). « analyse-tableau »
   répond tout de suite avec un numéro, la lecture continue, et son
   résultat est rangé dans le magasin de la société :
     analyses-tableau/<id>.json   {etat: en-cours|faite|erreur, resultat?, erreur?, par, le}
   La fiche le relit avec « analyse-tableau-etat ».

   Il faut la clé ANTHROPIC_API_KEY dans les variables de l'appli Node
   (cPanel › Setup Node.js App), et le module @anthropic-ai/sdk
   (Run NPM Install). Sans eux, la fiche le dit et s'enregistre quand même.
   ===================================================================== */

const MODELE = "claude-opus-5-5";
const MAX_IMAGE = 4 * 1024 * 1024;        /* l'image, une fois décodée */
const DOSSIER = "analyses-tableau/";

const SYSTEME = `Tu es électricien expert, formateur et vérificateur d'installations électriques en France. Tu lis la photo d'un tableau électrique (tableau de répartition, logement) prise ouvert par un technicien pendant l'autocontrôle de fin de chantier, et tu vérifies ce que la photo permet de vérifier au regard de la norme NF C 15-100 (édition en vigueur ; si une exigence a changé entre l'édition 2002/A5 de 2015 et celle de 2024, dis-le et classe le point « a_verifier »).

Ce que tu dois vérifier en priorité :
1. Les interrupteurs différentiels (et disjoncteurs différentiels) : pour chacun, son repère ou sa position, son type (AC, A, F, B, ou « illisible »), sa sensibilité (mA), son calibre (A), et le nombre de circuits (disjoncteurs divisionnaires) qu'il protège. La NF C 15-100 limite à 8 le nombre de circuits en aval d'un interrupteur différentiel 30 mA ; signale aussi les circuits qui exigent un type A (plaque de cuisson, lave-linge, borne de recharge selon sa protection…) quand ils semblent sous un type AC, et un nombre de différentiels insuffisant pour le type de logement si tu peux en juger.
2. Les couleurs des conducteurs : vert/jaune réservé exclusivement au conducteur de protection ; bleu (clair) réservé au neutre ; phase dans une autre couleur (ni vert/jaune, ni bleu). Signale tout conducteur visible dont la couleur ne convient pas à son usage, et les conducteurs de phase et de neutre mélangés sur un même peigne.
3. Le taux d'occupation : compte les modules (emplacements de 18 mm) des rangées et les modules occupés. La NF C 15-100 impose une réserve d'au moins 20 % d'emplacements libres. Donne le pourcentage d'occupation (modules occupés / modules total × 100, arrondi à l'entier) et dis si la réserve est respectée.

Vérifie aussi, quand la photo le montre : adéquation calibre / section (1,5 mm² ≤ 16 A, 2,5 mm² ≤ 20 A, 4 mm² ≤ 25 A, 6 mm² ≤ 32 A, 10 mm² ≤ 40 A en cuivre), repérage des circuits, obturateurs sur les emplacements vides, peignes d'alimentation et leur protection, conducteurs dénudés ou cuivre visible, serrage apparent, cheminement et maintien des câbles, borne principale de terre, parafoudre s'il est présent, disjoncteur de branchement s'il est visible.

Règles :
- Ne relève que ce que tu vois. Ce que la photo ne permet pas de trancher (marquage illisible, zone hors champ, câble masqué) est classé « a_verifier », jamais affirmé.
- Pour chaque anomalie et chaque différentiel, donne sa position sur la photo : x et y, de 0 à 1, depuis le coin haut gauche de l'image (x vers la droite, y vers le bas), au centre de l'élément concerné.
- « reference_norme » cite la partie ou l'article de la NF C 15-100 quand tu le connais avec certitude (par exemple « NF C 15-100, partie 7-771 » ou « § 771.314.2.1 ») ; sinon une formulation courte de la règle, sans inventer de numéro.
- « correction » dit concrètement ce que le technicien doit faire sur place.
- Si la photo ne montre pas un tableau électrique, ou qu'elle est trop floue, sombre ou lointaine pour être lue, mets lisible à false, explique pourquoi dans motif_illisible, et laisse les listes vides.
- Rédige en français, phrases courtes, vocabulaire d'électricien.`;

const NOMBRE = { type: "number" };
const ENTIER = { type: "integer" };
const TEXTE = { type: "string" };
const OUINON = { type: "boolean" };
function objet(props) { return { type: "object", properties: props, required: Object.keys(props), additionalProperties: false }; }
const SCHEMA = objet({
  lisible: OUINON,
  motif_illisible: TEXTE,
  resume: TEXTE,
  occupation: objet({ modules_total: ENTIER, modules_occupes: ENTIER, pourcentage: ENTIER, reserve_conforme: OUINON, commentaire: TEXTE }),
  differentiels: { type: "array", items: objet({
    repere: TEXTE, type: TEXTE, sensibilite_ma: ENTIER, calibre_a: ENTIER, nb_circuits: ENTIER,
    conforme: OUINON, commentaire: TEXTE, x: NOMBRE, y: NOMBRE }) },
  couleurs: objet({ conforme: OUINON, commentaire: TEXTE }),
  anomalies: { type: "array", items: objet({
    titre: TEXTE, detail: TEXTE, reference_norme: TEXTE,
    gravite: { type: "string", enum: ["majeure", "mineure", "a_verifier"] },
    correction: TEXTE, x: NOMBRE, y: NOMBRE }) },
  points_conformes: { type: "array", items: TEXTE }
});

function nouvelId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const entre01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

/* le contexte saisi sur la fiche, en deux lignes */
function contexteTexte(c) {
  c = c && typeof c === "object" ? c : {};
  const l = [];
  if (c.travaux) l.push("Type de travaux : " + String(c.travaux).slice(0, 60));
  if (c.batiment) l.push("Type de bâtiment : " + String(c.batiment).slice(0, 60));
  if (c.remarque) l.push("Remarque du technicien : " + String(c.remarque).slice(0, 400));
  return l.length ? l.join("\n") + "\n\n" : "";
}

async function lire(image, mime, contexte) {
  let Anthropic;
  try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
  catch { throw Object.assign(new Error("Le module d'analyse n'est pas installé sur le serveur (cPanel › Setup Node.js App › Run NPM Install)."), { code: "sans-module" }); }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 4 * 60 * 1000, maxRetries: 2 });
  const reponse = await client.beta.messages.create({
    model: MODELE,
    max_tokens: 16000,
    /* lire un tableau mérite qu'on y réfléchisse : la réflexion adaptative est là d'office */
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    /* un refus des garde-fous passe la main à un autre modèle plutôt que de rendre rien */
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEME,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mime, data: image } },
      { type: "text", text: contexteTexte(contexte) + "Voici la photo du tableau ouvert. Analyse-la au regard de la NF C 15-100 et réponds selon le format demandé." }
    ] }]
  });
  if (reponse.stop_reason === "refusal") throw new Error("L'analyse a été refusée pour cette photo.");
  if (reponse.stop_reason === "max_tokens") throw new Error("L'analyse n'a pas pu aboutir (réponse trop longue).");
  const bloc = (reponse.content || []).filter((b) => b.type === "text").pop();
  if (!bloc) throw new Error("Réponse vide.");
  const r = JSON.parse(bloc.text);
  /* les positions restent sur la photo */
  (r.anomalies || []).forEach((a) => { a.x = entre01(a.x); a.y = entre01(a.y); });
  (r.differentiels || []).forEach((d) => { d.x = entre01(d.x); d.y = entre01(d.y); });
  return r;
}

function messageErreur(e) {
  if (e && e.code === "sans-module") return e.message;
  const s = e && e.status;
  if (s === 401 || s === 403) return "La clé d'analyse (ANTHROPIC_API_KEY) est refusée : vérifiez-la dans les variables de l'appli Node.";
  if (s === 429) return "Trop d'analyses en même temps : réessayez dans une minute.";
  if (s === 400) return "La photo n'a pas pu être lue : reprenez-la.";
  if (s >= 500) return "Le service d'analyse est momentanément indisponible : réessayez.";
  if (e instanceof SyntaxError) return "Réponse de l'analyse illisible : réessayez.";
  return (e && e.message) ? String(e.message).slice(0, 200) : "Analyse impossible.";
}

export async function analyseTableau(action, { req, url, store, personne, json }) {
  if (action === "analyse-tableau-etat") {
    const id = url.searchParams.get("id") || "";
    if (!/^[a-z0-9]{6,30}$/.test(id)) return json({ erreur: "Analyse introuvable." }, 404);
    let x = null;
    try { x = await store.get(DOSSIER + id + ".json", { type: "json" }); } catch { x = null; }
    if (!x) return json({ erreur: "Analyse introuvable." }, 404);
    return json(x);
  }

  /* action === "analyse-tableau" : on lance la lecture */
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ erreur: "L'analyse automatique du tableau n'est pas activée sur ce serveur (clé ANTHROPIC_API_KEY à ajouter).", code: "sans-cle" }, 503);
  }
  let d;
  try { d = await req.json(); } catch { return json({ erreur: "Requête illisible." }, 400); }
  const brut = String((d && d.image) || "").replace(/^data:[^,]*,/, "");
  const mime = /^image\/(jpeg|png|webp)$/.test(d && d.mime) ? d.mime : "image/jpeg";
  if (!brut || brut.length * 0.75 > MAX_IMAGE) return json({ erreur: "Photo absente ou trop lourde." }, 400);
  const id = nouvelId(), cle = DOSSIER + id + ".json";
  const base = { id, par: personne.nom, le: new Date().toISOString(), ref: String((d && d.ref) || "").slice(0, 60) };
  await store.setJSON(cle, { ...base, etat: "en-cours" });
  /* la lecture continue une fois la réponse partie */
  lire(brut, mime, d && d.contexte)
    .then((resultat) => store.setJSON(cle, { ...base, etat: "faite", fini: new Date().toISOString(), modele: MODELE, resultat }))
    .catch((e) => {
      console.error("Analyse du tableau :", e && (e.status || ""), e && e.message);
      return store.setJSON(cle, { ...base, etat: "erreur", fini: new Date().toISOString(), erreur: messageErreur(e) });
    })
    .catch(() => {});
  return json({ ok: true, id });
}
