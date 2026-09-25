// Analyse de plan électrique — relais vers l'application Python « Plan- ».
//
// Le navigateur n'envoie jamais le plan directement à l'analyseur : il le
// dépose ici, avec son jeton de session. On vérifie que la personne est
// connectée, puis on transmet le PDF à l'analyseur avec la clé partagée.
// Personne d'autre ne peut ainsi faire tourner l'analyseur.
//
// Réglages (variables d'environnement de l'application du site) :
//   PLAN_ANALYSE_URL   adresse de l'analyseur, ex. https://plan.votre-domaine.fr
//   PLAN_ANALYSE_CLE   la même clé que PLAN_ANALYZER_KEY côté analyseur
//
// GET  /api/plan?etat=1   dit si l'analyseur est branché et joignable
// POST /api/plan          multipart, champ « file » (PDF) ; options en
//                         paramètres : page, zoom, images, variants

import { sessionValide } from "./rapports.mjs";

const MAX_MO = 30;
const DELAI = 170000;          /* un gros plan peut prendre du temps */

function json(corps, statut) {
  return new Response(JSON.stringify(corps), {
    status: statut || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function reglages() {
  return {
    base: String(process.env.PLAN_ANALYSE_URL || "").trim().replace(/\/+$/, ""),
    cle: String(process.env.PLAN_ANALYSE_CLE || "")
  };
}
async function avecDelai(url, options, ms) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(minuteur); }
}

export default async (req) => {
  const url = new URL(req.url);
  const personne = await sessionValide(req.headers.get("x-auth") || url.searchParams.get("auth"));
  if (!personne) return json({ erreur: "Session expirée. Reconnectez-vous." }, 401);
  const { base, cle } = reglages();

  if (req.method === "GET") {
    if (!base) return json({ branche: false, joignable: false });
    try {
      const r = await avecDelai(base + "/health", { headers: { Accept: "application/json" } }, 15000);
      const d = await r.json().catch(() => ({}));
      return json({ branche: true, joignable: r.ok && d.status === "ok", version: d.version || "",
        cleCoteAnalyseur: !!d.cle, cleCoteSite: !!cle });
    } catch (e) {
      return json({ branche: true, joignable: false, erreur: String((e && e.message) || e) });
    }
  }

  if (req.method !== "POST") return json({ erreur: "Méthode non prise en charge." }, 405);
  if (!base) return json({ erreur: "L'analyse de plan n'est pas encore installée sur ce site." }, 503);
  const taille = Number(req.headers.get("content-length") || 0);
  if (taille > MAX_MO * 1024 * 1024) return json({ erreur: "Plan trop lourd (" + MAX_MO + " Mo au plus)." }, 413);

  let formulaire;
  try { formulaire = await req.formData(); } catch { return json({ erreur: "Envoi illisible." }, 400); }
  const fichier = formulaire.get("file");
  if (!fichier || typeof fichier === "string") return json({ erreur: "Aucun plan reçu." }, 400);

  const envoi = new FormData();
  envoi.append("file", fichier, fichier.name || "plan.pdf");
  const params = new URLSearchParams();
  for (const k of ["page", "zoom", "images", "variants"]) {
    const v = url.searchParams.get(k);
    if (v !== null && /^[0-9a-z.]{1,8}$/i.test(v)) params.set(k, v);
  }
  try {
    const r = await avecDelai(base + "/api/analyze" + (params.toString() ? "?" + params : ""),
      { method: "POST", body: envoi, headers: cle ? { "X-Plan-Cle": cle } : {} }, DELAI);
    const texte = await r.text();
    let d = null;
    try { d = JSON.parse(texte); } catch { /* pas du JSON */ }
    if (!r.ok) {
      const raison = (d && (d.detail || d.erreur)) || ("HTTP " + r.status);
      return json({ erreur: r.status === 401 ? "L'analyseur refuse la clé : vérifiez PLAN_ANALYSE_CLE." : String(raison) },
        r.status === 401 ? 502 : r.status);
    }
    if (!d) return json({ erreur: "Réponse de l'analyseur illisible." }, 502);
    return new Response(texte, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return json({ erreur: e && e.name === "AbortError" ? "L'analyse a pris trop de temps." : "Analyseur injoignable : " + String((e && e.message) || e) }, 502);
  }
};

export const config = { path: "/api/plan" };
