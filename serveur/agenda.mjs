/* =====================================================================
   agenda.mjs — l'agenda Outlook, lu et écrit sans API Microsoft
   ---------------------------------------------------------------------
   Lire : Outlook publie un calendrier sous forme de lien ICS (« Publier
   un calendrier », en « occupé / libre » seulement). On le lit, on en
   déroule les récurrences (tous les lundis, le 2e mardi du mois…) et on
   en tire les plages occupées, à l'heure de Paris.
   Écrire : chaque rendez-vous pris sur le site part en invitation .ics
   (à ouvrir dans Outlook) et vit dans un flux ICS auquel Outlook
   s'abonne : les rendez-vous du site y apparaissent seuls.

   lireIcs(texte)                       -> événements
   occupations(événements, debut, fin)  -> [{debut, fin}] (ms), récurrences déroulées
   creneauxLibres(o)                    -> [{date, creneaux:["09:00", …]}]
   ics(événements, o)                   -> texte VCALENDAR
   ===================================================================== */
export const PARIS = "Europe/Paris";
const JOUR = 864e5;

/* ---------- fuseaux : ceux de Windows (« Romance Standard Time ») comme les IANA ---------- */
function zoneValide(tz) { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }
export function zoneDe(tzid) {
  const t = String(tzid || "").replace(/^"|"$/g, "").trim();
  if (!t) return PARIS;
  if (/^(utc|z|etc\/utc|gmt|coordinated universal time|\(utc\)\s*coordinated)/i.test(t) || /^UTC$/i.test(t)) return "UTC";
  if (/romance|w\. europe|central europe|central european|paris|brussels|madrid|amsterdam|berlin|rome|stockholm|vienna/i.test(t)) return PARIS;
  if (/gmt standard|london|dublin|lisbon/i.test(t)) return "Europe/London";
  if (zoneValide(t)) return t;
  return PARIS;
}
const FMT = new Map();
function format(tz) {
  if (!FMT.has(tz)) FMT.set(tz, new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }));
  return FMT.get(tz);
}
const JOURS_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function champs(tz, t) {
  const p = {}; format(tz).formatToParts(new Date(t)).forEach((x) => { p[x.type] = x.value; });
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second, wd: JOURS_EN[p.weekday] };
}
function decalage(tz, t) {
  const c = champs(tz, t);
  return (Date.UTC(c.y, c.m - 1, c.d, c.h, c.mi, c.s) - Math.floor(t / 1000) * 1000) / 60000;
}
/* une heure murale d'un fuseau -> l'instant (ms) ; suit le passage à l'heure d'été */
export function versUtc(tz, y, m, d, h = 0, mi = 0, s = 0) {
  if (tz === "UTC") return Date.UTC(y, m - 1, d, h, mi, s);
  const g = Date.UTC(y, m - 1, d, h, mi, s);
  const o1 = decalage(tz, g), t = g - o1 * 60000, o2 = decalage(tz, t);
  return o2 === o1 ? t : g - o2 * 60000;
}

/* ---------- lecture du texte ICS ---------- */
function lignes(texte) {
  return String(texte || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
}
function propriete(l) {
  let i = 0, q = false;
  for (; i < l.length; i++) { const c = l[i]; if (c === '"') q = !q; else if (c === ":" && !q) break; }
  const tete = l.slice(0, i), valeur = l.slice(i + 1), morceaux = tete.split(";");
  const params = {};
  morceaux.slice(1).forEach((p) => { const k = p.indexOf("="); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, ""); });
  return { nom: morceaux[0].toUpperCase(), params, valeur };
}
function lireDate(valeur, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(valeur).trim());
  if (!m) return null;
  const journee = params.VALUE === "DATE" || m[4] == null;
  const tz = m[7] ? "UTC" : zoneDe(params.TZID);
  const L = { y: +m[1], m: +m[2], d: +m[3], h: journee ? 0 : +m[4], mi: journee ? 0 : +m[5], s: journee ? 0 : +(m[6] || 0) };
  return { t: versUtc(journee ? PARIS : tz, L.y, L.m, L.d, L.h, L.mi, L.s), tz: journee ? PARIS : tz, L, journee };
}
function lireDuree(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || "").trim());
  if (!m) return 0;
  return ((+m[2] || 0) * 7 * JOUR + (+m[3] || 0) * JOUR + (+m[4] || 0) * 3600e3 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000) * (m[1] === "-" ? -1 : 1);
}
function lireRegle(v) {
  const r = {};
  String(v || "").split(";").forEach((p) => { const k = p.indexOf("="); if (k > 0) r[p.slice(0, k).toUpperCase()] = p.slice(k + 1); });
  return r;
}
export function lireIcs(texte) {
  const evs = [];
  let ev = null, profondeur = 0;
  for (const l of lignes(texte)) {
    const p = propriete(l);
    if (p.nom === "BEGIN" && p.valeur.toUpperCase() === "VEVENT") { ev = { exdates: [], libre: false }; profondeur = 0; continue; }
    if (!ev) continue;
    if (p.nom === "BEGIN") { profondeur++; continue; }                /* VALARM… */
    if (p.nom === "END" && p.valeur.toUpperCase() !== "VEVENT") { profondeur--; continue; }
    if (p.nom === "END") { if (ev.debut) evs.push(ev); ev = null; continue; }
    if (profondeur > 0) continue;
    if (p.nom === "UID") ev.uid = p.valeur;
    else if (p.nom === "DTSTART") ev.debut = lireDate(p.valeur, p.params);
    else if (p.nom === "DTEND") ev.fin = lireDate(p.valeur, p.params);
    else if (p.nom === "DURATION") ev.duree = lireDuree(p.valeur);
    else if (p.nom === "RRULE") ev.regle = lireRegle(p.valeur);
    else if (p.nom === "EXDATE") p.valeur.split(",").forEach((x) => { const d = lireDate(x, p.params); if (d) ev.exdates.push(d.t); });
    else if (p.nom === "RECURRENCE-ID") ev.recurrence = lireDate(p.valeur, p.params);
    else if (p.nom === "STATUS" && /CANCELLED/i.test(p.valeur)) ev.libre = true;
    else if (p.nom === "TRANSP" && /TRANSPARENT/i.test(p.valeur)) ev.libre = true;
    else if ((p.nom === "X-MICROSOFT-CDO-BUSYSTATUS" || p.nom === "X-MICROSOFT-CDO-INTENDEDSTATUS") && /^FREE$/i.test(p.valeur.trim())) ev.libre = true;
  }
  evs.forEach((e) => {
    const fin = e.fin ? e.fin.t : e.debut.t + (e.duree || (e.debut.journee ? JOUR : 0));
    e.dureeMs = Math.max(0, fin - e.debut.t);
  });
  return evs;
}

/* ---------- les récurrences, à l'heure murale de l'événement ---------- */
const JOURS_ICS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function jourSemaine(y, m, d) { return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
function joursDuMois(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function ajouterJours(y, m, d, n) { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; }
function nieme(y, m, ord, wd) {           /* 2e mardi, dernier vendredi… */
  const n = joursDuMois(y, m);
  if (ord > 0) { const prem = (wd - jourSemaine(y, m, 1) + 7) % 7 + 1, d = prem + (ord - 1) * 7; return d <= n ? d : null; }
  const der = n - (jourSemaine(y, m, n) - wd + 7) % 7, d = der + (ord + 1) * 7; return d >= 1 ? d : null;
}
function joursDuMoisSelon(y, m, R, L) {
  const out = [];
  if (R.BYMONTHDAY) R.BYMONTHDAY.split(",").forEach((x) => { let n = +x; if (n < 0) n = joursDuMois(y, m) + n + 1; if (n >= 1 && n <= joursDuMois(y, m)) out.push(n); });
  else if (R.BYDAY) R.BYDAY.split(",").forEach((x) => {
    const mm = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(x.trim()); if (!mm) return;
    const wd = JOURS_ICS[mm[2]];
    if (mm[1]) { const d = nieme(y, m, +mm[1], wd); if (d) out.push(d); }
    else for (let d = 1; d <= joursDuMois(y, m); d++) if (jourSemaine(y, m, d) === wd) out.push(d);
  });
  else if (L.d <= joursDuMois(y, m)) out.push(L.d);
  return out.sort((a, b) => a - b);
}
function deroule(e, debutF, finF, exclus) {
  const out = [], R = e.regle, tz = e.debut.tz, L = e.debut.L, iv = Math.max(1, +R.INTERVAL || 1);
  const compte = R.COUNT ? +R.COUNT : Infinity;
  const jusqua = R.UNTIL ? (lireDate(R.UNTIL, {}) || { t: Infinity }).t : Infinity;
  let n = 0, garde = 0;
  const pousser = (y, m, d) => {
    const t = versUtc(tz, y, m, d, L.h, L.mi, L.s);
    if (t < e.debut.t) return true;
    n++;
    if (n > compte || t > jusqua || t > finF) return false;
    if (e.exdates.indexOf(t) < 0 && !exclus.has(t) && t + e.dureeMs > debutF) out.push({ debut: t, fin: t + e.dureeMs });
    return true;
  };
  const f = String(R.FREQ || "").toUpperCase();
  /* une longue série sans COUNT : on saute droit vers la fenêtre */
  const saut = (pasMs) => (compte === Infinity ? Math.max(0, Math.floor((debutF - e.debut.t) / pasMs) - 2) : 0);
  if (f === "DAILY") {
    /* « tous les jours ouvrés » : FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR */
    const seuls = R.BYDAY ? R.BYDAY.split(",").map((x) => JOURS_ICS[x.trim().slice(-2)]) : null;
    for (let k = saut(iv * JOUR); garde++ < 4000; k++) {
      const [y, m, d] = ajouterJours(L.y, L.m, L.d, k * iv);
      if (seuls && seuls.indexOf(jourSemaine(y, m, d)) < 0) continue;
      if (!pousser(y, m, d)) break;
    }
  } else if (f === "WEEKLY") {
    const jours = (R.BYDAY ? R.BYDAY.split(",").map((x) => JOURS_ICS[x.trim().slice(-2)]) : [jourSemaine(L.y, L.m, L.d)])
      .filter((x) => x != null).map((x) => (x + 6) % 7).sort((a, b) => a - b);    /* lundi = 0 */
    const lundi = ajouterJours(L.y, L.m, L.d, -((jourSemaine(L.y, L.m, L.d) + 6) % 7));
    sortie: for (let w = saut(iv * 7 * JOUR); garde++ < 2000; w++) {
      for (const j of jours) { const [y, m, d] = ajouterJours(lundi[0], lundi[1], lundi[2], w * 7 * iv + j); if (!pousser(y, m, d)) break sortie; }
    }
  } else if (f === "MONTHLY" || f === "YEARLY") {
    const mois = f === "YEARLY" && R.BYMONTH ? R.BYMONTH.split(",").map(Number) : null;
    sortie: for (let k = saut((f === "MONTHLY" ? 28 : 365) * iv * JOUR); garde++ < 1200; k++) {
      const pas = f === "MONTHLY" ? k * iv : k * iv * 12;
      const lesMois = mois ? mois.map((mm) => [L.y + Math.floor(pas / 12), mm]) : [[L.y + Math.floor((L.m - 1 + pas) / 12), (L.m - 1 + pas) % 12 + 1]];
      for (const [y, m] of lesMois) for (const d of joursDuMoisSelon(y, m, R, L)) if (!pousser(y, m, d)) break sortie;
    }
  } else if (e.debut.t + e.dureeMs > debutF && e.debut.t < finF) out.push({ debut: e.debut.t, fin: e.debut.t + e.dureeMs });
  return out;
}
export function occupations(evs, debutF, finF) {
  /* une occurrence déplacée (RECURRENCE-ID) remplace celle de la série */
  const exclus = new Map();
  evs.filter((e) => e.recurrence).forEach((e) => { if (!exclus.has(e.uid)) exclus.set(e.uid, new Set()); exclus.get(e.uid).add(e.recurrence.t); });
  const out = [];
  for (const e of evs) {
    if (e.libre) continue;
    if (e.regle && !e.recurrence) out.push(...deroule(e, debutF, finF, exclus.get(e.uid) || new Set()));
    else if (e.debut.t < finF && e.debut.t + e.dureeMs > debutF) out.push({ debut: e.debut.t, fin: e.debut.t + e.dureeMs });
  }
  return out.sort((a, b) => a.debut - b.debut);
}

/* ---------- les créneaux à proposer au client ---------- */
function minutes(t, defaut) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "")); return m ? +m[1] * 60 + +m[2] : defaut; }
export function creneauxLibres(o) {
  const R = o.reglages || {}, now = o.maintenant || Date.now();
  const duree = Math.max(15, +R.duree || 60), pas = Math.max(15, +R.pas || 30);
  const deb = minutes(R.debut, 510), fin = minutes(R.fin, 1050), pd = minutes(R.pauseDebut, null), pf = minutes(R.pauseFin, null);
  const jours = Array.isArray(R.jours) && R.jours.length ? R.jours.map(Number) : [1, 2, 3, 4, 5];
  const des = now + (Math.max(0, +R.delai || 0)) * 3600e3, horizon = Math.min(90, Math.max(1, +R.horizon || 21));
  const occ = (o.occupes || []).slice().sort((a, b) => a.debut - b.debut);
  const marge = (Math.max(0, +R.marge || 0)) * 60000;
  const auj = champs(PARIS, now), out = [];
  for (let i = 0; i <= horizon; i++) {
    const [y, m, d] = ajouterJours(auj.y, auj.m, auj.d, i);
    const wd = jourSemaine(y, m, d) || 7;                               /* lundi 1 … dimanche 7 */
    if (jours.indexOf(wd) < 0) continue;
    const libres = [];
    for (let mn = deb; mn + duree <= fin; mn += pas) {
      if (pd != null && pf != null && mn < pf && mn + duree > pd) continue;
      const t = versUtc(PARIS, y, m, d, Math.floor(mn / 60), mn % 60), tf = t + duree * 60000;
      if (t < des) continue;
      if (occ.some((b) => b.debut < tf + marge && b.fin > t - marge)) continue;
      libres.push(String(Math.floor(mn / 60)).padStart(2, "0") + ":" + String(mn % 60).padStart(2, "0"));
    }
    if (libres.length) out.push({ date: y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"), creneaux: libres });
  }
  return out;
}

/* ---------- écrire de l'ICS ---------- */
function echapper(t) { return String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
function utc(t) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function plier(l) {                                      /* 75 octets par ligne au plus */
  const out = []; let cur = "", taille = 0;
  for (const ch of l) {
    const n = Buffer.byteLength(ch);
    if (taille + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; taille = 0; }
    cur += ch; taille += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}
export function ics(evs, o = {}) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Suivi travaux 360//Rendez-vous//FR", "CALSCALE:GREGORIAN"];
  if (o.methode) L.push("METHOD:" + o.methode);
  if (o.nom) { L.push("X-WR-CALNAME:" + echapper(o.nom)); L.push("X-PUBLISHED-TTL:PT30M"); L.push("REFRESH-INTERVAL;VALUE=DURATION:PT30M"); }
  for (const e of evs) {
    L.push("BEGIN:VEVENT", "UID:" + e.uid, "DTSTAMP:" + utc(e.stamp || Date.now()), "DTSTART:" + utc(e.debut), "DTEND:" + utc(e.fin),
      "SUMMARY:" + echapper(e.titre), "SEQUENCE:" + (e.sequence || 0), "STATUS:" + (e.annule ? "CANCELLED" : "CONFIRMED"), "TRANSP:OPAQUE");
    if (e.lieu) L.push("LOCATION:" + echapper(e.lieu));
    if (e.description) L.push("DESCRIPTION:" + echapper(e.description));
    if (e.organisateur) L.push("ORGANIZER;CN=" + echapper(e.organisateur.nom || "") + ":mailto:" + e.organisateur.email);
    (e.participants || []).forEach((p) => L.push("ATTENDEE;CN=" + echapper(p.nom || "") + ";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED:mailto:" + p.email));
    if (!e.annule) L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + echapper(e.titre), "TRIGGER:-PT1H", "END:VALARM");
    L.push("END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.map(plier).join("\r\n") + "\r\n";
}
