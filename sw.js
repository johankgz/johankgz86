/* =====================================================================
   sw.js — le facteur des notifications, et le site hors connexion
   ---------------------------------------------------------------------
   1. Les notifications : recevoir celle que le serveur envoie et
      l'afficher, même site fermé ; un appui ouvre la bonne page.
   2. Hors connexion (au fond d'un sous-sol, en zone blanche) : les pages,
      les fichiers du site et les bibliothèques (PDF, 3D, DWG) sont gardés
      sur l'appareil, et les données déjà vues (dossiers, chantiers,
      documents, équipe) restent lisibles. Avec du réseau, tout vient
      d'abord du site : rien n'est figé. Les envois (publier, déposer) ne
      passent jamais par ici : reseau.js les fait patienter jusqu'au retour
      du réseau.
   La mise en cache ne s'allume que si une page le demande (horsligne.js) :
   les essais automatiques, eux, gardent un site sans cache.
   ===================================================================== */
var COQUILLE = "coquille-1", CDN = "bibliotheques-1", DONNEES = "donnees-1", REGLAGES = "reglages";
var PAGES = ["/aide.html", "/autocontrole.html", "/carnet.html", "/chantier.html", "/client.html", "/rdv.html", "/demandes.html", "/commande.html", "/compte.html", "/dwg.html",
  "/equipe.html", "/etiquettes.html", "/index.html", "/knx.html", "/notes.html", "/photos.html", "/plans.html", "/point.html",
  "/discussions.html", "/rapports.html", "/reception.html", "/releve.html", "/sav.html", "/schema.html", "/suivi.html", "/tableau.html",
  "/technique.html", "/utilitaires.html",
  "/mentions-legales.html", "/confidentialite.html", "/cgu.html", "/conditions-abonnement.html", "/sous-traitance.html"];
var FICHIERS = ["/annotation.js", "/cartouche.js", "/clavier.js", "/courbe-charge.js", "/qr.js", "/dates.js", "/dossier.js", "/fond.js", "/theme.js", "/horsligne.js",
  "/notifications.js", "/reseau.js", "/sobre.js", "/finitions.js", "/palette.js", "/carte.js", "/vitrine.js", "/vitrine.css", "/symboles-elec.js", "/une-page.js", "/visionneuse.js", "/sobre.css", "/pied.js", "/legal.css",
  "/manifest.webmanifest", "/polices/jakarta-var.woff2", "/icone-120.png", "/icone-152.png", "/icone-167.png",
  "/icone-180.png", "/icone-192.png", "/icone-512.png", "/entete-contact.png", "/entete-societe.png"];
/* les bibliothèques sont servies par le site lui-même (vendor/), plus par des CDN */
var BIBLIOTHEQUES = [];
FICHIERS.push("/vendor/jspdf-2.5.1/jspdf.umd.min.js", "/vendor/pdfjs-3.11.174/pdf.min.js", "/vendor/pdfjs-3.11.174/pdf.worker.min.js");
var HOTES_CDN = /^(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/;
/* lectures du site qu'on garde (pas les appels de service) */
var SANS_CACHE = /^(ping|tic|push-cle|push-etat|push-journal)$/;
var MAX_DONNEES = 400, MAX_OCTETS = 12 * 1024 * 1024;

/* ---------- allumé ou non : la page le dit, on s'en souvient ---------- */
var ACTIF = null, LECTURE_ACTIF = null;
function lireActif(){
  if(ACTIF !== null) return Promise.resolve(ACTIF);
  if(!LECTURE_ACTIF) LECTURE_ACTIF = caches.open(REGLAGES)
    .then(function(c){ return c.match("/__horsligne"); })
    .then(function(r){ return r ? r.text() : "0"; })
    .then(function(t){ ACTIF = t === "1"; return ACTIF; })
    .catch(function(){ ACTIF = false; return false; });
  return LECTURE_ACTIF;
}
lireActif();
function ecrireActif(v){
  ACTIF = !!v;
  return caches.open(REGLAGES).then(function(c){ return c.put("/__horsligne", new Response(v ? "1" : "0")); });
}

/* ---------- installation : le site entier, une fois ---------- */
function garnir(){
  return caches.open(COQUILLE).then(function(c){
    return Promise.all(PAGES.concat(FICHIERS).map(function(u){
      return fetch(u, {cache:"no-cache"}).then(function(r){ if(r.ok) return c.put(u, r); }).catch(function(){});
    }));
  }).then(function(){
    /* les bibliothèques ensuite, sans retenir l'installation */
    caches.open(CDN).then(function(c){
      BIBLIOTHEQUES.forEach(function(u){
        c.match(u).then(function(deja){ if(deja) return; return fetch(u, {mode:"cors"}).then(function(r){ if(r.ok) return c.put(u, r); }); }).catch(function(){});
      });
    });
  });
}
self.addEventListener("install", function(e){
  self.skipWaiting();
  e.waitUntil(lireActif().then(function(a){ return a ? garnir() : null; }));
});
self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){ return [COQUILLE, CDN, DONNEES, REGLAGES].indexOf(k) < 0; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener("message", function(e){
  var d = e.data || {};
  if(d.type === "horsligne"){
    e.waitUntil(ecrireActif(d.actif).then(function(){
      if(!d.actif) return Promise.all([COQUILLE, CDN, DONNEES].map(function(k){ return caches.delete(k); }));
      return caches.open(COQUILLE).then(function(c){ return c.match("/index.html"); }).then(function(r){ if(!r) return garnir(); });
    }));
  }
  /* déconnecté : les données de l'ancien compte ne restent pas sur l'appareil */
  if(d.type === "oublier") e.waitUntil(Promise.all([caches.delete(DONNEES), ecrirePastille(0)]));
  /* l'accueil a compté sa cloche : la pastille de l'icône repart de là */
  if(d.type === "pastille") e.waitUntil(ecrirePastille(d.n));
});

/* ---------- la pastille de l'icône (écran d'accueil du téléphone) ---------- */
function lirePastille(){
  return caches.open(REGLAGES).then(function(c){ return c.match("/__pastille"); })
    .then(function(r){ return r ? r.text() : "0"; }).then(function(t){ return parseInt(t, 10) || 0; })
    .catch(function(){ return 0; });
}
function ecrirePastille(n){
  n = Math.max(0, parseInt(n, 10) || 0);
  return caches.open(REGLAGES).then(function(c){ return c.put("/__pastille", new Response(String(n))); }).catch(function(){});
}
function montrerPastille(n){
  try{
    var nav = self.navigator;
    if(n && nav.setAppBadge) return nav.setAppBadge(n).catch(function(){});
    if(!n && nav.clearAppBadge) return nav.clearAppBadge().catch(function(){});
  }catch(er){}
  return Promise.resolve();
}
/* une notification de plus, appli fermée : la pastille compte un de plus */
function pastillePlusUn(){
  return lirePastille().then(function(n){ n += 1; return ecrirePastille(n).then(function(){ return montrerPastille(n); }); });
}

/* ---------- les stratégies ---------- */
function avecDelai(p, ms){
  return new Promise(function(ok, ko){
    var t = setTimeout(function(){ ko(new Error("lent")); }, ms);
    p.then(function(r){ clearTimeout(t); ok(r); }, function(e){ clearTimeout(t); ko(e); });
  });
}
/* une page : le site d'abord (4 s au plus), sinon celle gardée */
function page(req){
  var u = new URL(req.url), cle = u.origin + u.pathname;
  var reseau = fetch(req).then(function(r){
    if(r.ok){ var copie = r.clone(); caches.open(COQUILLE).then(function(c){ return c.put(cle, copie); }); }
    return r;
  });
  return avecDelai(reseau, 4000).catch(function(){
    return caches.open(COQUILLE).then(function(c){
      return c.match(cle).then(function(r){ return r || c.match(req, {ignoreSearch:true}); });
    }).then(function(r){ return r || reseau.catch(function(){ return horsLignePage(); }); });
  });
}
function horsLignePage(){
  return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Hors ligne</title><body style="font-family:system-ui,sans-serif;padding:32px;color:#22201C;background:#F4F1EA">'
    + '<h2>Hors ligne</h2><p>Cette page n\'a pas encore été ouverte sur cet appareil. Elle sera disponible hors connexion '
    + 'dès que vous l\'aurez ouverte une fois avec du réseau.</p><p><a href="/index.html">Revenir à l\'accueil</a></p>',
    {status:200, headers:{"content-type":"text/html; charset=utf-8"}});
}
/* un fichier du site : versionné (?v=…), il ne change jamais — gardé ; sinon le site, et la copie en secours */
function fichier(req){
  var u = new URL(req.url), versionne = /[?&]v=/.test(u.search);
  return caches.open(COQUILLE).then(function(c){
    return c.match(req).then(function(garde){
      if(garde && versionne) return garde;
      var reseau = fetch(req).then(function(r){ if(r.ok) c.put(req, r.clone()); return r; });
      if(garde){ reseau.catch(function(){}); return garde; }       /* tout de suite, mis à jour derrière */
      return reseau.catch(function(){
        return c.match(req, {ignoreSearch:true}).then(function(r){ return r || Response.error(); });
      });
    });
  });
}
/* une bibliothèque (jsPDF, pdf.js, three.js…) : une version donnée ne change pas */
function bibliotheque(req){
  return caches.open(CDN).then(function(c){
    return c.match(req, {ignoreVary:true}).then(function(garde){
      if(garde) return garde;
      return fetch(req).then(function(r){ if(r.ok || r.type === "opaque") c.put(req, r.clone()); return r; });
    });
  });
}
/* une lecture du site : le site d'abord, sinon la dernière réponse vue sur cet appareil (par compte) */
function empreinte(t){ var h = 5381; for(var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function lecture(req, u){
  var jeton = req.headers.get("x-auth") || u.searchParams.get("auth") || "";
  if(!jeton) return fetch(req);
  var cle = u.origin + u.pathname + u.search + (u.search ? "&" : "?") + "__compte=" + empreinte(jeton);
  return fetch(req).then(function(r){
    var taille = Number(r.headers.get("content-length") || 0);
    if(r.ok && taille <= MAX_OCTETS){
      var copie = r.clone();
      caches.open(DONNEES).then(function(c){ return c.put(cle, copie).then(function(){ return elaguer(c); }); });
    }
    return r;
  }, function(err){
    return caches.open(DONNEES).then(function(c){ return c.match(cle); }).then(function(r){
      if(r){
        /* la réponse gardée, marquée comme telle */
        var h = new Headers(r.headers); h.set("x-hors-ligne", "1");
        return r.blob().then(function(b){ return new Response(b, {status:r.status, statusText:r.statusText, headers:h}); });
      }
      return new Response(JSON.stringify({erreur:"Hors ligne : ces données n'ont pas encore été ouvertes sur cet appareil.", horsLigne:true}),
        {status:500, headers:{"content-type":"application/json; charset=utf-8", "x-hors-ligne":"1"}});
    });
  });
}
function elaguer(c){
  return c.keys().then(function(ks){
    if(ks.length <= MAX_DONNEES) return;
    return Promise.all(ks.slice(0, ks.length - MAX_DONNEES).map(function(k){ return c.delete(k); }));
  });
}
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                          /* les envois passent tels quels */
  var u; try{ u = new URL(req.url); }catch(er){ return; }
  var navigation = req.mode === "navigate";
  if(ACTIF === false) return;
  if(ACTIF === null){
    /* pas encore relu (le service vient de se réveiller) : une page attend la réponse, le reste passe */
    if(navigation && u.origin === location.origin) e.respondWith(lireActif().then(function(a){ return a ? page(req) : fetch(req); }));
    return;
  }
  if(u.origin === location.origin){
    if(/^\/api\//.test(u.pathname)){
      if(SANS_CACHE.test(u.searchParams.get("action") || "")) return;
      e.respondWith(lecture(req, u)); return;
    }
    if(u.pathname === "/sw.js") return;
    if(navigation || /\.html?$/.test(u.pathname) || u.pathname === "/"){ e.respondWith(page(req)); return; }
    e.respondWith(fichier(req)); return;
  }
  if(HOTES_CDN.test(u.hostname)) e.respondWith(bibliotheque(req));
});

self.addEventListener("push", function(e){
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { texte: e.data ? e.data.text() : "" }; }
  var options = {
    body: d.texte || "",
    icon: "/icone-192.png",
    badge: "/icone-192.png",
    data: { url: d.url || "./index.html" },
    timestamp: Date.now()
  };
  /* même sujet (même discussion, même rappel) : la nouvelle remplace
     l'ancienne au lieu de s'empiler, et sonne quand même */
  if (d.tag) { options.tag = d.tag; options.renotify = true; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.titre || "Suivi travaux 360", options),
    pastillePlusUn()
  ]));
});

self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var cible = (e.notification.data && e.notification.data.url) || "./index.html";
  var url = new URL(cible, self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(fenetres){
    for (var i = 0; i < fenetres.length; i++) {
      var w = fenetres[i];
      if (w.navigate && w.focus) {
        return w.navigate(url).then(function(x){ return (x || w).focus(); })
          .catch(function(){ return self.clients.openWindow(url); });
      }
    }
    return self.clients.openWindow(url);
  }));
});
