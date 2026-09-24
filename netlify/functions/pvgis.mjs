// Proxy PVGIS — évite le blocage CORS du navigateur.
// Appelé sur /api/pvgis?lat=...&lon=... — comme /api/rapports. Pas
// d'adresse en /.netlify/… : chez o2switch, Apache refuse (403) tout
// chemin qui commence par un point, avant même d'atteindre le serveur Node.
//
// PVGIS change de version de temps en temps (5.2, puis 5.3…) et retire les
// anciennes : on essaie la plus récente d'abord, puis l'adresse sans
// version (toujours la dernière), puis l'ancienne. Une erreur de paramètre
// (point en mer, valeur hors limites) est rendue telle quelle, avec son
// message, sans insister ailleurs.
//
// /api/pvgis?diagnostic=1 dit, version par version, si le serveur joint
// PVGIS — pour vérifier depuis l'hébergement lui-même.

const VERSIONS = ["v5_3", "", "v5_2"];
const DELAI = 20000;

function adresse(version, params) {
  return "https://re.jrc.ec.europa.eu/api/" + (version ? version + "/" : "") + "PVcalc?" + params.toString();
}

async function interroger(url) {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI);
  const debut = Date.now();
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "Accept": "application/json", "User-Agent": "SuiviTravaux360/1.0 (releve technique)" }
    });
    const texte = await r.text();
    let json = null;
    try { json = JSON.parse(texte); } catch { /* pas du JSON */ }
    return { statut: r.status, json, texte, duree: Date.now() - debut };
  } catch (e) {
    return { statut: 0, erreur: e && e.name === "AbortError" ? "délai dépassé (" + DELAI / 1000 + " s)" : String(e && e.message || e),
             duree: Date.now() - debut };
  } finally {
    clearTimeout(minuteur);
  }
}

function reponse(corps, statut, cache) {
  return new Response(typeof corps === "string" ? corps : JSON.stringify(corps), {
    status: statut,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": cache ? "public, max-age=86400" : "no-store"
    }
  });
}

export default async (req) => {
  const qs = new URL(req.url).searchParams;

  if (qs.get("diagnostic")) {
    const essai = new URLSearchParams({ lat: "46.648", lon: "-1.658", peakpower: "3", loss: "14", angle: "30",
      aspect: "0", pvtechchoice: "crystSi", mountingplace: "building", outputformat: "json" });
    const lignes = [];
    for (const v of VERSIONS) {
      const r = await interroger(adresse(v, essai));
      lignes.push({ version: v || "(dernière)", statut: r.statut, ok: !!(r.json && r.json.outputs),
        duree_ms: r.duree, erreur: r.erreur || (r.json && r.json.message) || (r.statut && !(r.json && r.json.outputs) ? String(r.texte || "").slice(0, 200) : "") });
    }
    return reponse({ pvgis: lignes, noeud: process.version }, 200, false);
  }

  const allowed = ["lat","lon","peakpower","loss","angle","aspect","pvtechchoice","mountingplace","raddatabase"];
  const out = new URLSearchParams();
  for (const k of allowed) if (qs.get(k)) out.set(k, qs.get(k));
  out.set("outputformat", "json");

  const essais = [];
  for (const v of VERSIONS) {
    const r = await interroger(adresse(v, out));
    if (r.json && r.json.outputs) return reponse(r.texte, 200, true);
    /* PVGIS refuse les paramètres : inutile d'essayer une autre version */
    if (r.statut === 400 && r.json && r.json.message) {
      return reponse({ message: r.json.message, version: v || "(dernière)" }, 400, false);
    }
    essais.push((v || "(dernière)") + " : " + (r.erreur || ("HTTP " + r.statut)));
  }
  return reponse({ error: "PVGIS injoignable depuis le serveur.", essais }, 502, false);
};

export const config = { path: "/api/pvgis" };
