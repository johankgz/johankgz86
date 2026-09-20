// Proxy PVGIS — évite le blocage CORS du navigateur.
// Netlify Functions v2 : appelé sur /.netlify/functions/pvgis?lat=...&lon=...
export default async (req) => {
  const qs = new URL(req.url).searchParams;
  const allowed = ["lat","lon","peakpower","loss","angle","aspect","pvtechchoice","mountingplace","raddatabase"];
  const out = new URLSearchParams();
  for (const k of allowed) if (qs.get(k)) out.set(k, qs.get(k));
  out.set("outputformat", "json");

  const target = "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?" + out.toString();
  try {
    const r = await fetch(target, { headers: { "Accept": "application/json" } });
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
