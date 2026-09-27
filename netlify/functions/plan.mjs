// Analyse de plan électrique — le comptage des symboles d'un plan PDF.
//
// L'analyseur (le code Python du dépôt « Plan- ») est rangé dans le site,
// dossier analyseur-plans/ : le serveur le lance lui-même, sur la même
// machine, sans sous-domaine ni seconde application. Le navigateur dépose
// le plan ici avec son jeton de session ; on vérifie que la personne est
// connectée, puis on fait tourner l'analyse et on renvoie son résultat.
//
// Réglages facultatifs (variables d'environnement de l'application) :
//   PLAN_PYTHON        le Python à utiliser ; par défaut celui de
//                      analyseur-plans/.venv s'il existe, sinon python3
//   PLAN_ANALYSE_URL   seulement pour garder un analyseur séparé : son
//   PLAN_ANALYSE_CLE   adresse et sa clé (PLAN_ANALYZER_KEY côté analyseur)
//
// GET  /api/plan?etat=1   dit si l'analyseur est branché et joignable
// POST /api/plan          multipart, champ « file » (PDF) ; options en
//                         paramètres : page, zoom, images, variants

import { sessionValide } from "./rapports.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/* l'analyseur rangé dans le site */
const DOSSIER = fileURLToPath(new URL("../../analyseur-plans/", import.meta.url));
const LANCEUR = join(DOSSIER, "analyser.py");
function python() {
  if (process.env.PLAN_PYTHON) return process.env.PLAN_PYTHON;
  const venv = join(DOSSIER, ".venv", "bin", "python");
  return existsSync(venv) ? venv : "python3";
}
/* lance le Python ; rend {code, sortie, erreurs} */
function lancer(args, ms) {
  return new Promise((resolve) => {
    let sortie = "", erreurs = "", fini = false;
    let p;
    try { p = spawn(python(), [LANCEUR, ...args], { cwd: DOSSIER, env: { ...process.env, PYTHONIOENCODING: "utf-8" } }); }
    catch (e) { resolve({ code: -1, sortie: "", erreurs: String((e && e.message) || e) }); return; }
    const minuteur = setTimeout(() => { if (!fini) { fini = true; p.kill("SIGKILL"); resolve({ code: -2, sortie, erreurs: "délai dépassé" }); } }, ms);
    p.stdout.setEncoding("utf8"); p.stderr.setEncoding("utf8");
    p.stdout.on("data", (d) => { sortie += d; });
    p.stderr.on("data", (d) => { if (erreurs.length < 20000) erreurs += d; });
    p.on("error", (e) => { if (!fini) { fini = true; clearTimeout(minuteur); resolve({ code: -1, sortie, erreurs: String((e && e.message) || e) }); } });
    p.on("close", (code) => { if (!fini) { fini = true; clearTimeout(minuteur); resolve({ code, sortie, erreurs }); } });
  });
}
/* l'état de l'installation, gardé une minute */
let ETAT = null, ETAT_LE = 0;
async function etatLocal() {
  if (ETAT && Date.now() - ETAT_LE < 60000) return ETAT;
  const r = await lancer(["--verifier"], 30000);
  let d = null;
  try { d = JSON.parse(r.sortie); } catch { /* rien */ }
  ETAT = d && d.pret
    ? { branche: true, joignable: true, local: true, version: d.version || "" }
    : { branche: true, joignable: false, local: true,
        erreur: (d && d.erreur) || (r.code === -1 ? "Python introuvable (" + python() + ")" : (r.erreurs || "").trim().split("\n").pop() || "bibliothèques absentes") };
  ETAT_LE = Date.now();
  return ETAT;
}
/* deux analyses à la fois au plus : la machine est partagée */
let EN_COURS = 0;
const EN_COURS_MAX = 2;
async function analyserIci(fichier, url) {
  if (EN_COURS >= EN_COURS_MAX) return json({ erreur: "Deux plans sont déjà en cours d'analyse. Réessayez dans un instant." }, 503);
  EN_COURS++;
  const dossier = await mkdtemp(join(tmpdir(), "plan-"));
  try {
    const octets = Buffer.from(await fichier.arrayBuffer());
    if (octets.subarray(0, 4).toString("latin1") !== "%PDF") return json({ erreur: "Le fichier n'est pas un PDF." }, 415);
    const chemin = join(dossier, "plan.pdf");
    await writeFile(chemin, octets);
    const args = [chemin, "--nom", String(fichier.name || "plan.pdf").slice(0, 200)];
    const page = url.searchParams.get("page"), zoom = url.searchParams.get("zoom");
    if (page && /^\d{1,4}$/.test(page)) args.push("--page", page);
    if (zoom && /^\d{1,2}(\.\d{1,2})?$/.test(zoom)) args.push("--zoom", zoom);
    if (/^(0|false|non)$/i.test(url.searchParams.get("images") || "")) args.push("--sans-images");
    if (/^(0|false|non)$/i.test(url.searchParams.get("variants") || "")) args.push("--sans-variantes");
    const r = await lancer(args, DELAI);
    if (r.code === -2) return json({ erreur: "L'analyse a pris trop de temps." }, 504);
    if (r.code === -1) return json({ erreur: "Analyse de plan pas encore installée : Python introuvable." }, 503);
    let d = null;
    try { d = JSON.parse(r.sortie); } catch { /* rien */ }
    if (r.code !== 0 || !d) {
      const raison = (d && d.erreur) || (r.erreurs || "").trim().split("\n").pop() || "Analyse impossible.";
      return json({ erreur: /No module named/.test(raison) ? "Analyse de plan pas encore installée : " + raison : raison }, r.code === 2 ? 422 : 500);
    }
    return new Response(r.sortie, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } finally {
    EN_COURS--;
    rm(dossier, { recursive: true, force: true }).catch(() => {});
  }
}

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
    if (!base) return json(await etatLocal());
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
  const taille = Number(req.headers.get("content-length") || 0);
  if (taille > MAX_MO * 1024 * 1024) return json({ erreur: "Plan trop lourd (" + MAX_MO + " Mo au plus)." }, 413);

  let formulaire;
  try { formulaire = await req.formData(); } catch { return json({ erreur: "Envoi illisible." }, 400); }
  const fichier = formulaire.get("file");
  if (!fichier || typeof fichier === "string") return json({ erreur: "Aucun plan reçu." }, 400);
  if (!base) return analyserIci(fichier, url);

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
