/* =====================================================================
   courbe-charge.js — la courbe de charge du compteur du client
   ---------------------------------------------------------------------
   Le client télécharge sa courbe de charge dans son espace Enedis (ou
   chez son fournisseur) : un fichier CSV ou Excel, une valeur toutes les
   30 minutes. On le lit tel quel, quel que soit son habillage (séparateur,
   date ISO ou française, date et heure dans une colonne ou deux, W, kW,
   Wh ou kWh, horodate en fin d'intervalle comme chez Enedis), on le pose
   sur une grille régulière, puis on en tire ce qui sert au chantier :
   consommation annuelle, pointe, talon, profil d'une journée, part en
   heures creuses, marge sur l'abonnement (borne de recharge, clim), et
   l'autoconsommation réelle d'une installation solaire.

   CourbeCharge.lire(fichier)            -> Promise({debut, pas, valeurs, prm, unite, nom})
   CourbeCharge.lireTexte(texte, nom)    -> la même chose, depuis un texte CSV
   CourbeCharge.analyser(courbe, o)      -> les chiffres (o : souscrite kVA, hcDebut, hcFin)
   CourbeCharge.autoconso(courbe, mois, lat, lon) -> {taux, couverture, auto, prod, conso}
   CourbeCharge.dessinerProfil(canvas, a, o) / dessinerJours(canvas, a, o)
   CourbeCharge.pdfProfil(doc, x, y, l, h, a, o) / pdfJours(doc, x, y, l, h, a, o)

   valeurs : la puissance moyenne de chaque intervalle, en W (null : pas de
   mesure). debut : l'instant du premier intervalle (ms). pas : en minutes.
   ===================================================================== */
(function(racine){
  "use strict";
  var MIN = 60000, JOUR = 864e5;
  var ABONNEMENTS = [3, 6, 9, 12, 15, 18, 24, 30, 36];
  /* part de chaque mois dans une année de consommation résidentielle (relevé, PV) */
  var PROFIL = [0.128,0.112,0.098,0.077,0.061,0.048,0.043,0.044,0.055,0.077,0.105,0.152];

  /* ---------- lecture des cellules ---------- */
  function nombre(c){
    if(typeof c === "number") return isFinite(c) ? c : null;
    var s = String(c == null ? "" : c).replace(/[\s  ]/g, "").replace(",", ".");
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }
  function heure(c){
    var m = /^(\d{1,2})[:h](\d{2})(?::(\d{2}))?$/.exec(String(c == null ? "" : c).trim());
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3] || "0", 10)] : null;
  }
  /* une date : texte ISO (avec ou sans fuseau), texte français, ou nombre de série Excel */
  function date(c, excel){
    if(typeof c === "number"){
      if(!excel || c < 20000 || c > 80000) return null;
      var j = Math.floor(c), f = c - j, base = new Date(1899, 11, 30);
      var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + j);
      return {t: d.getTime() + Math.round(f * 1440) * MIN, avecHeure: f > 1e-9};
    }
    var s = String(c == null ? "" : c).trim(), m;
    if((m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(s))){
      var y = +m[1], mo = +m[2] - 1, dd = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0), se = +(m[6] || 0);
      var t;
      if(m[7]){
        var off = 0;
        if(m[7] !== "Z"){ var z = m[7].replace(":", ""); off = (z[0] === "-" ? -1 : 1) * (parseInt(z.slice(1, 3), 10) * 60 + parseInt(z.slice(3, 5), 10)); }
        t = Date.UTC(y, mo, dd, h, mi, se) - off * MIN;
      } else t = new Date(y, mo, dd, h, mi, se).getTime();
      return {t: t, avecHeure: m[4] != null};
    }
    if((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2})[:h](\d{2})(?::(\d{2}))?)?$/.exec(s))){
      return {t: new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)).getTime(), avecHeure: m[4] != null};
    }
    return null;
  }

  /* ---------- des lignes aux mesures ---------- */
  function versCourbe(lignes, nom, excel){
    var pts = [], entete = [], prm = "";
    lignes.forEach(function(l){
      var trouve = null, k = -1;
      for(var i = 0; i < l.length && i < 4; i++){ trouve = date(l[i], excel); if(trouve){ k = i; break; } }
      var p = l.map(function(c){ return String(c == null ? "" : c).trim(); });
      p.forEach(function(c){ if(!prm && /^\d{14}$/.test(c)) prm = c; });
      /* la ligne d'identification Enedis (PRM, dates de début et de fin…) n'est pas une mesure */
      if(!trouve || p.some(function(c){ return /^\d{14}$/.test(c); })){ entete.push(p.join(" ")); return; }
      var j = k + 1, h = heure(l[j]);
      if(h && !trouve.avecHeure){ var d0 = new Date(trouve.t); trouve.t = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), h[0], h[1], h[2]).getTime(); j++; }
      var v = nombre(l[j]);
      if(v === null && String(l[j] == null ? "" : l[j]).trim() === "") v = nombre(l[j + 1]);
      if(v === null) return;
      pts.push([trouve.t, v]);
    });
    if(pts.length < 2) throw new Error("Aucune mesure reconnue dans ce fichier. Il faut la courbe de charge (consommation horaire ou par demi-heure).");
    pts.sort(function(a, b){ return a[0] - b[0]; });
    /* le pas : l'écart le plus fréquent entre deux mesures */
    var compte = {};
    for(var i = 1; i < pts.length; i++){
      var e = Math.round((pts[i][0] - pts[i - 1][0]) / MIN);
      if(e > 0) compte[e] = (compte[e] || 0) + 1;
    }
    var pas = +Object.keys(compte).sort(function(a, b){ return compte[b] - compte[a]; })[0] || 30;
    if(pas >= 1380 && pas <= 1500) pas = 1440;
    var texte = entete.join(" ").toLowerCase();
    var unite = /\bkwh\b/.test(texte) ? "kWh" : /\bwh\b/.test(texte) ? "Wh"
      : /\bkw\b|\(kw\)/.test(texte) ? "kW" : /(^|[^a-z])w([^a-z]|$)|puissance/.test(texte) ? "W" : "";
    var maxi = 0, frac = false;
    pts.forEach(function(q){ if(q[1] > maxi) maxi = q[1]; if(q[1] % 1) frac = true; });
    if(!unite) unite = pas >= 1440 ? (maxi > 200 ? "Wh" : "kWh") : (maxi < 60 && frac ? "kW" : "W");
    var versW = unite === "W" ? 1 : unite === "kW" ? 1000 : unite === "Wh" ? 60 / pas : 60000 / pas;
    /* Enedis date chaque mesure à la fin de son intervalle : on la ramène au début */
    var finIntervalle = pas < 1440 && (/horodate/.test(texte) || !!prm);
    var pasMs = pas * MIN, debut = pts[0][0] - (finIntervalle ? pasMs : 0);
    /* deux ans au plus : on garde les plus récents */
    var limite = pts[pts.length - 1][0] - 731 * JOUR;
    if(debut < limite){ pts = pts.filter(function(q){ return q[0] >= limite; }); debut = pts[0][0] - (finIntervalle ? pasMs : 0); }
    var n = Math.round((pts[pts.length - 1][0] - pts[0][0]) / pasMs) + 1;
    var som = new Array(n), nb = new Array(n);
    pts.forEach(function(q){
      var t = q[0] - (finIntervalle ? pasMs : 0), i = Math.round((t - debut) / pasMs);
      if(i < 0 || i >= n) return;
      som[i] = (som[i] || 0) + q[1] * versW; nb[i] = (nb[i] || 0) + 1;     /* l'heure du changement d'heure : moyenne */
    });
    var valeurs = som.map(function(s, i){ return nb[i] ? Math.round(s / nb[i]) : null; });
    for(var z = 0; z < n; z++) if(valeurs[z] === undefined) valeurs[z] = null;
    var c = {debut: debut, pas: pas, valeurs: valeurs, prm: prm, unite: unite, nom: nom || "", lu: new Date().toISOString()};
    /* plus fin que la demi-heure (relevés au pas de 10 min) : ramené à 30 min */
    if(pas < 30 && 30 % pas === 0) c = regrouper(c, 30);
    return c;
  }
  function regrouper(c, pas){
    var r = pas / c.pas, out = [];
    for(var i = 0; i < c.valeurs.length; i += r){
      var s = 0, k = 0;
      for(var j = i; j < i + r && j < c.valeurs.length; j++) if(c.valeurs[j] != null){ s += c.valeurs[j]; k++; }
      out.push(k ? Math.round(s / k) : null);
    }
    return Object.assign({}, c, {pas: pas, valeurs: out});
  }

  /* ---------- CSV ---------- */
  function lireTexte(txt, nom){
    var lignes = String(txt).replace(/^﻿/, "").split(/\r\n|\n|\r/).filter(function(l){ return l.trim(); });
    var sep = [";", "\t", ","].map(function(s){ return [s, lignes.slice(0, 60).reduce(function(t, l){ return t + l.split(s).length - 1; }, 0)]; })
      .sort(function(a, b){ return b[1] - a[1]; })[0][0];
    return versCourbe(lignes.map(function(l){ return l.split(sep).map(function(c){ return c.replace(/^"(.*)"$/, "$1"); }); }), nom, false);
  }

  /* ---------- Excel (.xlsx) : un zip de XML, ouvert sans bibliothèque ---------- */
  function u16(b, o){ return b[o] | (b[o + 1] << 8); }
  function u32(b, o){ return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function inflate(octets){
    if(typeof DecompressionStream === "undefined") return Promise.reject(new Error("Ce navigateur n'ouvre pas les fichiers Excel : enregistrez-le en CSV."));
    return new Response(new Blob([octets]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()
      .then(function(ab){ return new Uint8Array(ab); });
  }
  function fichiersZip(b, veut){
    var e = -1;
    for(var i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if(u32(b, i) === 0x06054b50){ e = i; break; }
    if(e < 0) return Promise.reject(new Error("Fichier Excel illisible."));
    var n = u16(b, e + 10), o = u32(b, e + 16), noms = {}, attente = [];
    for(var k = 0; k < n && u32(b, o) === 0x02014b50; k++){
      var meth = u16(b, o + 10), taille = u32(b, o + 20), ln = u16(b, o + 28), lx = u16(b, o + 30), lc = u16(b, o + 32), loc = u32(b, o + 42);
      var nom = new TextDecoder().decode(b.subarray(o + 46, o + 46 + ln));
      if(veut(nom)){
        var d = loc + 30 + u16(b, loc + 26) + u16(b, loc + 28), brut = b.subarray(d, d + taille);
        attente.push((meth === 8 ? inflate(brut) : Promise.resolve(brut)).then((function(nm){ return function(x){ noms[nm] = new TextDecoder().decode(x); }; })(nom)));
      }
      o += 46 + ln + lx + lc;
    }
    return Promise.all(attente).then(function(){ return noms; });
  }
  function entites(s){
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function(_, d){ return String.fromCharCode(+d); }).replace(/&amp;/g, "&");
  }
  function lireXlsx(octets, nom){
    return fichiersZip(octets, function(n){ return n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n); })
      .then(function(f){
        var partages = [];
        (f["xl/sharedStrings.xml"] || "").replace(/<si>([\s\S]*?)<\/si>/g, function(_, si){
          var t = ""; si.replace(/<t[^>]*>([\s\S]*?)<\/t>/g, function(__, x){ t += x; }); partages.push(entites(t));
        });
        var feuilles = Object.keys(f).filter(function(n){ return /worksheets/.test(n); }).sort();
        if(!feuilles.length) throw new Error("Fichier Excel sans feuille.");
        var lignes = [];
        f[feuilles[0]].replace(/<row[^>]*>([\s\S]*?)<\/row>/g, function(_, r){
          var l = [];
          r.replace(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, function(__, at, corps){
            var ref = /r="([A-Z]+)\d+"/.exec(at), col = 0;
            if(ref) for(var i = 0; i < ref[1].length; i++) col = col * 26 + ref[1].charCodeAt(i) - 64;
            col = col ? col - 1 : l.length;
            var ty = (/t="(\w+)"/.exec(at) || [])[1], v = (/<v>([\s\S]*?)<\/v>/.exec(corps || "") || [])[1], val;
            if(ty === "s") val = partages[+v];
            else if(ty === "inlineStr"){ val = ""; (corps || "").replace(/<t[^>]*>([\s\S]*?)<\/t>/g, function(___, x){ val += entites(x); }); }
            else if(ty === "str" || ty === "b") val = v == null ? "" : entites(v);
            else val = v == null ? "" : parseFloat(v);
            l[col] = val;
          });
          for(var j = 0; j < l.length; j++) if(l[j] === undefined) l[j] = "";
          lignes.push(l);
        });
        return versCourbe(lignes, nom, true);
      });
  }

  function lire(fichier){
    var nom = (fichier && fichier.name) || "";
    if(/\.xls$/i.test(nom)) return Promise.reject(new Error("Ancien format Excel (.xls) : enregistrez-le en .xlsx ou en CSV."));
    return fichier.arrayBuffer().then(function(ab){
      var b = new Uint8Array(ab);
      if(b[0] === 0x50 && b[1] === 0x4b) return lireXlsx(b, nom);
      var txt;
      try{ txt = new TextDecoder("utf-8", {fatal: true}).decode(b); }catch(e){ txt = new TextDecoder("windows-1252").decode(b); }
      return lireTexte(txt, nom);
    });
  }

  /* ---------- analyse ---------- */
  function cleJour(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function minutes(t){ var m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; }
  function dansPlage(mn, a, b){ return a <= b ? (mn >= a && mn < b) : (mn >= a || mn < b); }
  function joursDuMois(y, m){ return new Date(y, m + 1, 0).getDate(); }
  function analyser(c, o){
    o = o || {};
    var pasMs = c.pas * MIN, h = c.pas / 60, parJour = Math.round(1440 / c.pas), fin = c.pas < 1440;
    var hcA = minutes(o.hcDebut || "22:00"), hcB = minutes(o.hcFin || "06:00");
    var va = (parseFloat(String(o.souscrite || "").replace(",", ".")) || 0) * 1000;
    var jours = {}, mois = {}, energie = 0, hc = 0, pointe = null, pointeNuit = 0, mesures = 0, depasse = 0;
    var prof = {tous: [], semaine: [], weekend: [], hiver: []}, cpt = {tous: [], semaine: [], weekend: [], hiver: []};
    Object.keys(prof).forEach(function(k){ for(var s = 0; s < 48; s++){ prof[k][s] = 0; cpt[k][s] = 0; } });
    for(var i = 0; i < c.valeurs.length; i++){
      var v = c.valeurs[i]; if(v == null) continue;
      var t = c.debut + i * pasMs, d = new Date(t), e = v * h / 1000;
      mesures++; energie += e;
      var kj = cleJour(d), J = jours[kj] || (jours[kj] = {e: 0, n: 0, max: 0, min: Infinity, m: d.getMonth(), y: d.getFullYear(), wd: d.getDay()});
      J.e += e; J.n++; if(v > J.max) J.max = v; if(v < J.min) J.min = v;
      var km = kj.slice(0, 7), Mo = mois[km] || (mois[km] = {e: 0, n: 0, m: d.getMonth(), y: d.getFullYear()});
      Mo.e += e; Mo.n++;
      if(!pointe || v > pointe.w) pointe = {w: v, t: t};
      if(va && v > 0.9 * va) depasse++;
      if(fin){
        var mn = d.getHours() * 60 + d.getMinutes();
        if(dansPlage(mn, hcA, hcB)){ hc += e; if(v > pointeNuit) pointeNuit = v; }
        var we = d.getDay() === 0 || d.getDay() === 6, hiv = d.getMonth() >= 10 || d.getMonth() <= 2;
        /* au pas d'une heure, la mesure vaut pour les deux demi-heures */
        for(var s = Math.floor(mn / 30), k2 = 0; k2 < Math.max(1, c.pas / 30) && s < 48; s++, k2++){
          prof.tous[s] += v; cpt.tous[s]++;
          prof[we ? "weekend" : "semaine"][s] += v; cpt[we ? "weekend" : "semaine"][s]++;
          if(hiv){ prof.hiver[s] += v; cpt.hiver[s]++; }
        }
      }
    }
    if(!mesures) return null;
    var listeJours = Object.keys(jours).sort().map(function(k){ var J = jours[k]; J.cle = k; J.complet = J.n >= parJour * 0.9; return J; });
    /* la consommation d'une année : chaque jour mesuré pèse sa part de l'année type */
    var poids = 0;
    listeJours.forEach(function(J){ poids += PROFIL[J.m] / joursDuMois(J.y, J.m) * Math.min(1, J.n / parJour); });
    var couvreAn = listeJours.length >= 360;
    var annuel = couvreAn ? energie / listeJours.length * 365 : (poids > 0 ? energie / poids : 0);
    /* les douze mois : mesurés quand ils sont complets, estimés sinon (le plus récent l'emporte) */
    var douze = [], mesure = [];
    for(var m = 0; m < 12; m++){ douze[m] = Math.round(annuel * PROFIL[m]); mesure[m] = false; }
    Object.keys(mois).sort().forEach(function(km){
      var Mo = mois[km], attendu = joursDuMois(Mo.y, Mo.m) * parJour;
      if(Mo.n >= attendu * 0.9){ douze[Mo.m] = Math.round(Mo.e * attendu / Mo.n); mesure[Mo.m] = true; }
    });
    var minis = listeJours.filter(function(J){ return J.complet; }).map(function(J){ return J.min; }).sort(function(a, b){ return a - b; });
    var talon = fin && minis.length ? minis[Math.floor(minis.length / 2)] : null;
    function moy(k){ return prof[k].map(function(s, i){ return cpt[k][i] ? Math.round(s / cpt[k][i]) : null; }); }
    var conseil = null, pk = pointe.w / 1000;
    if(fin){
      /* une mesure de 30 min lisse les appels de quelques secondes : on garde 30 % de marge */
      var besoin = pk * 1.3;
      conseil = ABONNEMENTS.filter(function(a){ return a >= besoin; })[0] || null;
    }
    var dispoNuit = va && fin ? va - pointeNuit : null, dispo = va && fin ? va - pointe.w : null;
    return {
      debut: c.debut, fin: c.debut + (c.valeurs.length - 1) * pasMs, pas: c.pas, detail: fin,
      jours: listeJours.length, mesures: mesures, couverture: mesures / c.valeurs.length,
      energie: energie, annuel: annuel, couvreAn: couvreAn, parJour: energie / Math.max(1, listeJours.reduce(function(t, J){ return t + Math.min(1, J.n / parJour); }, 0)),
      douze: douze, douzeMesure: mesure, listeJours: listeJours,
      pointe: pointe, pointeNuit: pointeNuit, talon: talon,
      partHc: fin && energie ? hc / energie : null, hcDebut: o.hcDebut || "22:00", hcFin: o.hcFin || "06:00",
      profil: moy("tous"), profilSemaine: moy("semaine"), profilWeekend: moy("weekend"), profilHiver: moy("hiver"),
      souscrite: va / 1000, depassements: depasse, depassementsH: depasse * h,
      dispo: dispo, dispoNuit: dispoNuit, abonnementConseille: conseil, pointeKw: pk
    };
  }
  /* la borne que l'abonnement laisse passer la nuit, sans délestage */
  function borne(a){
    if(!a || a.dispoNuit == null) return null;
    var w = a.dispoNuit;
    return w >= 11000 ? "11 kW (triphasé)" : w >= 7400 ? "7,4 kW" : w >= 3700 ? "3,7 kW" : "";
  }

  /* ---------- autoconsommation : la production solaire posée sur la courbe ----------
     La production d'un mois (PVGIS) est répartie jour par jour, puis du lever au
     coucher du soleil en cloche, autour du midi solaire du lieu. Chaque
     demi-heure, on consomme sur place le plus petit des deux. */
  function autoconso(c, moisKwh, lat, lon){
    if(!c || !moisKwh || moisKwh.length !== 12 || c.pas >= 1440) return null;
    lat = isFinite(lat) ? lat : 46.7; lon = isFinite(lon) ? lon : -1.5;
    var pasMs = c.pas * MIN, h = c.pas / 60, R = Math.PI / 180, cache = {};
    function jour(d){
      var k = cleJour(d); if(cache[k]) return cache[k];
      var doy = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 0)) / JOUR);
      var dec = 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365) * R;
      var x = -Math.tan(lat * R) * Math.tan(dec), ha = Math.acos(Math.max(-1, Math.min(1, x))) / R;
      var duree = 2 * ha / 15, midi = 12 - lon / 15 - d.getTimezoneOffset() / 60, lever = midi - duree / 2;
      var w = function(hh){ var u = (hh - lever) / duree; return u > 0 && u < 1 ? Math.pow(Math.sin(Math.PI * u), 1.4) : 0; };
      var z = 0; for(var s = 0; s < 1440; s += c.pas) z += w((s + c.pas / 2) / 60);
      var J = {w: w, z: z || 1, kwh: (moisKwh[d.getMonth()] || 0) / joursDuMois(d.getFullYear(), d.getMonth())};
      cache[k] = J; return J;
    }
    var auto = 0, prod = 0, conso = 0;
    for(var i = 0; i < c.valeurs.length; i++){
      var v = c.valeurs[i]; if(v == null) continue;
      var d = new Date(c.debut + i * pasMs), J = jour(d), mn = d.getHours() * 60 + d.getMinutes();
      var p = J.kwh * J.w((mn + c.pas / 2) / 60) / J.z, q = v * h / 1000;
      prod += p; conso += q; auto += Math.min(p, q);
    }
    if(!prod || !conso) return null;
    return {taux: auto / prod * 100, couverture: auto / conso * 100, auto: auto, prod: prod, conso: conso};
  }

  /* ---------- dessins ---------- */
  var COUL = {semaine: "#B4621A", weekend: "#1E60AA", barre: "#B4621A", pointe: "#A6291F", grille: "rgba(128,128,128,.28)", texte: "#8A8478"};
  function preparer(cv, hauteur){
    var r = (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1, l = cv.clientWidth || cv.parentNode.clientWidth || 320;
    cv.width = Math.round(l * r); cv.height = Math.round(hauteur * r); cv.style.height = hauteur + "px";
    var x = cv.getContext("2d"); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, l, hauteur);
    x.font = "11px system-ui, -apple-system, sans-serif"; return {x: x, l: l, h: hauteur};
  }
  function echelle(maxi){
    var pas = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].filter(function(p){ return maxi / p <= 5; })[0] || 1000;
    return {haut: Math.ceil(maxi / pas) * pas || pas, pas: pas};
  }
  function kw(n){ return (Math.round(n * 10) / 10).toString().replace(".", ","); }
  function dessinerProfil(cv, a, o){
    o = o || {};
    var C = preparer(cv, o.hauteur || 196), x = C.x, g = 34, dr = 8, hautP = 18, bas = C.h - 22;
    var series = [[a.profilWeekend, COUL.weekend], [a.profilSemaine, COUL.semaine]];      /* la semaine par-dessus */
    var maxi = 0; series.forEach(function(s){ s[0].forEach(function(v){ if(v > maxi) maxi = v; }); });
    var E = echelle(maxi / 1000 * 1.08), yv = function(kwv){ return bas - (bas - hautP) * kwv / E.haut; }, xs = function(s){ return g + (C.l - g - dr) * s / 48; };
    x.fillStyle = COUL.texte; x.strokeStyle = COUL.grille; x.lineWidth = 1;
    for(var k = 0; k <= E.haut / E.pas + 1e-9; k++){
      var yy = Math.round(yv(k * E.pas)) + 0.5; x.beginPath(); x.moveTo(g, yy); x.lineTo(C.l - dr, yy); x.stroke();
      x.textAlign = "right"; x.fillText(kw(k * E.pas), g - 5, yy + 4);
    }
    x.textAlign = "center";
    for(var hh = 0; hh <= 24; hh += 6){ x.textAlign = hh === 0 ? "left" : hh === 24 ? "right" : "center"; x.fillText(hh + " h", hh === 0 ? g - 4 : xs(hh * 2), C.h - 6); }
    /* heures creuses en fond */
    var a1 = minutes(a.hcDebut), b1 = minutes(a.hcFin);
    if(a1 != null && b1 != null){
      x.fillStyle = "rgba(30,96,170,.08)";
      var plage = function(p, q){ x.fillRect(xs(p / 30), hautP, xs(q / 30) - xs(p / 30), bas - hautP); };
      if(a1 <= b1) plage(a1, b1); else { plage(a1, 1440); plage(0, b1); }
    }
    series.forEach(function(s){
      x.strokeStyle = s[1]; x.lineWidth = 2.2; x.lineJoin = "round"; x.beginPath();
      var deb = false;
      s[0].forEach(function(v, i){ if(v == null){ deb = false; return; } var X = xs(i + 0.5), Y = yv(v / 1000); if(!deb){ x.moveTo(X, Y); deb = true; } else x.lineTo(X, Y); });
      x.stroke();
    });
    x.fillStyle = COUL.texte; x.textAlign = "left"; x.fillText("kW", 2, 10);
  }
  function dessinerJours(cv, a, o){
    o = o || {};
    var C = preparer(cv, o.hauteur || 158), x = C.x, g = 34, dr = 8, hautP = 18, bas = C.h - 22, J = a.listeJours;
    var maxi = 0; J.forEach(function(j){ if(j.e > maxi) maxi = j.e; });
    var E = echelle(maxi * 1.08), yv = function(v){ return bas - (bas - hautP) * v / E.haut; };
    var n = J.length, lb = (C.l - g - dr) / Math.max(1, n);
    x.fillStyle = COUL.texte; x.strokeStyle = COUL.grille; x.lineWidth = 1;
    for(var k = 0; k <= E.haut / E.pas + 1e-9; k++){
      var yy = Math.round(yv(k * E.pas)) + 0.5; x.beginPath(); x.moveTo(g, yy); x.lineTo(C.l - dr, yy); x.stroke();
      x.textAlign = "right"; x.fillText(String(Math.round(k * E.pas * 10) / 10).replace(".", ","), g - 5, yy + 4);
    }
    x.fillStyle = COUL.barre;
    J.forEach(function(j, i){ var Y = yv(j.e); x.globalAlpha = j.complet ? 1 : 0.45; x.fillRect(g + i * lb + (lb > 3 ? 0.5 : 0), Y, Math.max(1, lb - (lb > 3 ? 1 : 0)), bas - Y); });
    x.globalAlpha = 1;
    /* un repère par mois */
    x.fillStyle = COUL.texte; x.textAlign = "left";
    var dernier = -1, MO = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"], ecart = 0;
    J.forEach(function(j, i){ if(j.m !== dernier){ dernier = j.m; var X = g + i * lb; if(X - ecart > 30 || !ecart){ x.fillText(MO[j.m], X, C.h - 6); ecart = X; } } });
    x.fillText("kWh par jour", 2, 10);
  }
  /* les mêmes, en traits vectoriels dans un PDF jsPDF (mm) */
  function pdfAxes(doc, x0, y0, l, h, E, gris, unite){
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    for(var k = 0; k <= E.haut / E.pas + 1e-9; k++){
      var yy = y0 + h - h * k * E.pas / E.haut;
      doc.setFillColor(232, 228, 220); doc.rect(x0, yy, l, 0.2, "F");
      doc.setTextColor(gris[0], gris[1], gris[2]); doc.text(kw(k * E.pas), x0 - 1.8, yy + 1, {align: "right"});
    }
    doc.text(unite, x0 - 1.8, y0 - 2.2, {align: "right"});
  }
  function pdfProfil(doc, x0, y0, l, h, a, o){
    o = o || {};
    var gris = o.gris || [110, 103, 92], c1 = o.c1 || [180, 98, 26], c2 = o.c2 || [30, 96, 170];
    var maxi = 0; [a.profilSemaine, a.profilWeekend].forEach(function(s){ s.forEach(function(v){ if(v > maxi) maxi = v; }); });
    var E = echelle(maxi / 1000 * 1.08), xs = function(s){ return x0 + l * s / 48; }, yv = function(v){ return y0 + h - h * v / 1000 / E.haut; };
    var a1 = minutes(a.hcDebut), b1 = minutes(a.hcFin);
    if(a1 != null && b1 != null){
      doc.setFillColor(232, 240, 250);
      var plage = function(p, q){ doc.rect(xs(p / 30), y0, xs(q / 30) - xs(p / 30), h, "F"); };
      if(a1 <= b1) plage(a1, b1); else { plage(a1, 1440); plage(0, b1); }
    }
    pdfAxes(doc, x0, y0, l, h, E, gris, "kW");
    [[a.profilWeekend, c2], [a.profilSemaine, c1]].forEach(function(s){
      doc.setDrawColor(s[1][0], s[1][1], s[1][2]); doc.setLineWidth(0.6);
      for(var i = 0; i < 47; i++){ var p = s[0][i], q = s[0][i + 1]; if(p == null || q == null) continue; doc.line(xs(i + 0.5), yv(p), xs(i + 1.5), yv(q)); }
    });
    doc.setLineWidth(0.2); doc.setTextColor(gris[0], gris[1], gris[2]); doc.setFontSize(6.5);
    for(var hh = 0; hh <= 24; hh += 3) doc.text(hh + " h", xs(hh * 2), y0 + h + 3.6, {align: "center"});
  }
  function pdfJours(doc, x0, y0, l, h, a, o){
    o = o || {};
    var gris = o.gris || [110, 103, 92], c1 = o.c1 || [180, 98, 26], J = a.listeJours;
    var maxi = 0; J.forEach(function(j){ if(j.e > maxi) maxi = j.e; });
    var E = echelle(maxi * 1.08), lb = l / Math.max(1, J.length);
    pdfAxes(doc, x0, y0, l, h, E, gris, "kWh/j");
    J.forEach(function(j, i){
      var hb = h * j.e / E.haut;
      if(j.complet) doc.setFillColor(c1[0], c1[1], c1[2]); else doc.setFillColor(226, 196, 170);
      doc.rect(x0 + i * lb, y0 + h - hb, Math.max(0.15, lb * 0.82), hb, "F");
    });
    var MO = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"], dernier = -1, ecart = -99;
    doc.setTextColor(gris[0], gris[1], gris[2]); doc.setFontSize(6.5);
    J.forEach(function(j, i){ if(j.m !== dernier){ dernier = j.m; var X = x0 + i * lb; if(X - ecart > 9){ doc.text(MO[j.m], X, y0 + h + 3.6); ecart = X; } } });
  }

  racine.CourbeCharge = {lire: lire, lireTexte: lireTexte, lireXlsx: lireXlsx, analyser: analyser, autoconso: autoconso, borne: borne,
    dessinerProfil: dessinerProfil, dessinerJours: dessinerJours, pdfProfil: pdfProfil, pdfJours: pdfJours,
    ABONNEMENTS: ABONNEMENTS, PROFIL: PROFIL};
})(typeof window !== "undefined" ? window : globalThis);
