/* =====================================================================
   reseau.js — tenir bon sur un réseau mobile faible
   ---------------------------------------------------------------------
   En 3G, après un long moment sur une fiche, la publication échouait ou
   restait « en cours » sans fin alors que le réseau était là : la
   connexion gardée ouverte par le téléphone avait été coupée pendant
   la veille, sans qu'il le sache, et la demande partait dans le vide.
   Fermer et rouvrir l'appli arrangeait tout, parce que ça rouvrait une
   connexion neuve.

   Ce fichier fait la même chose, tout seul :
   - aucune demande au site n'attend sans fin : sans réponse dans un
     délai raisonnable (plus long pour un envoi lourd, en 3G), elle est
     abandonnée et renvoyée ;
   - chaque nouvel essai passe par une connexion neuve : le site n'a pas
     besoin de cookies, on alterne donc entre les deux réserves de
     connexions du navigateur (avec et sans cookies), ce qui écarte
     celle qui est morte ;
   - après un long moment sans échange, ou au retour de veille, un appel
     léger (avec son propre délai) vérifie la connexion avant un envoi ;
   - un serveur qui se réveille (page d'erreur du relais) : on attend un
     peu et on renvoie, jusqu'à trois fois ;
   - hors connexion pour de bon, un envoi (publier, déposer, enregistrer)
     attend le retour du réseau aussi longtemps qu'il faut, page ouverte,
     puis part tout seul : le retour est guetté par l'événement du
     navigateur, au retour à l'appli, et par un essai régulier, car un
     téléphone qui sort de veille ne prévient pas toujours ;
   - une page restée ouverte avec une ancienne session (reconnecté
     ailleurs depuis) reprend la session à jour au lieu d'être refusée.
   Un petit bandeau dit ce qui se passe. Les vraies réponses du serveur
   (refus, erreur de saisie) passent telles quelles ; les lectures hors
   connexion sont servies par sw.js.
   ===================================================================== */
(function(){
  if(window.__reseauFiable || !window.fetch) return;
  window.__reseauFiable = true;
  var brut = window.fetch;
  var ATTENTES = [1500, 4000, 8000];
  /* les délais (les essais automatiques les raccourcissent) */
  var R = Object.assign({
    lecture: 20000,           /* sans réponse d'une lecture au bout de 20 s : la connexion est morte */
    envoi: 35000,             /* un envoi : 35 s… */
    octetsParSeconde: 20000,  /* … plus le temps de monter ses données en 3G lente */
    envoiMax: 300000,         /* au plus 5 min */
    sonde: 6000,              /* l'appel de vérification */
    calme: 45000,             /* sans échange depuis 45 s : on vérifie avant un envoi */
    essaiHorsLigne: 15000     /* « hors ligne » : on essaie quand même toutes les 15 s */
  }, window.__reseauReglages || {});

  /* la réserve de connexions en service ; un nouvel essai change de réserve */
  var MODE = "same-origin";
  function autreMode(){ MODE = MODE === "omit" ? "same-origin" : "omit"; }
  var dernierEchange = Date.now(), aVerifier = false, cacheDepuis = 0;

  function adresse(entree){ return typeof entree === "string" ? entree : (entree && entree.url) || String(entree); }
  function versLeSite(entree){
    try{
      var u = new URL(adresse(entree), location.href);
      return u.origin === location.origin && /^\/api\//.test(u.pathname)
        && !/[?&]action=ping(&|$)/.test(u.search);
    }catch(e){ return false; }
  }
  /* on ne renvoie que ce qu'on sait renvoyer à l'identique */
  function renvoyable(entree, options){
    if(entree && typeof entree !== "string" && entree.body) return false;   /* une Request déjà lue */
    var b = options && options.body;
    return b == null || typeof b === "string" || (typeof Blob !== "undefined" && b instanceof Blob)
      || (typeof FormData !== "undefined" && b instanceof FormData)
      || (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams);
  }
  /* une réponse de relais ou de serveur qui se réveille, pas du site */
  function reponseDeRelais(r){
    if(r.status === 408 || r.status === 502 || r.status === 503 || r.status === 504) return true;
    if(r.status >= 500){
      var t = (r.headers && r.headers.get("content-type")) || "";
      return t.indexOf("json") < 0;
    }
    return false;
  }
  function estEnvoi(entree, options){
    var m = (options && options.method) || (entree && typeof entree !== "string" && entree.method) || "GET";
    return String(m).toUpperCase() !== "GET";
  }
  function taille(options){
    var b = options && options.body;
    if(typeof b === "string") return b.length;
    if(b && typeof b.size === "number") return b.size;
    return 0;
  }
  function delaiPour(entree, options){
    if(!estEnvoi(entree, options)) return R.lecture;
    return Math.min(R.envoiMax, R.envoi + Math.round(taille(options) / R.octetsParSeconde * 1000));
  }

  /* une demande, avec son délai : passé ce délai sans réponse, elle est abandonnée */
  function avecDelai(soi, entree, options, ms){
    var o = Object.assign({}, options || {});
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var sien = o.signal, depasse = false, minuterie = null;
    if(ctl){
      if(sien){
        if(sien.aborted) ctl.abort();
        else sien.addEventListener("abort", function(){ ctl.abort(); });
      }
      o.signal = ctl.signal;
    }
    if(!o.credentials) o.credentials = MODE;
    return new Promise(function(ok, ko){
      if(ctl) minuterie = setTimeout(function(){ depasse = true; ctl.abort(); }, ms);
      brut.call(soi, entree, o).then(function(r){
        clearTimeout(minuterie); dernierEchange = Date.now(); ok(r);
      }, function(e){
        clearTimeout(minuterie);
        if(depasse){ var x = new Error("Le site ne répond pas."); x.name = "DelaiDepasse"; ko(x); }
        else ko(e);
      });
    });
  }

  /* l'appel léger : vérifie (et rouvre) la connexion, sans jamais rester bloqué */
  function sonder(){
    var o = {cache:"no-store", credentials:MODE}, ctl = null, minuterie = null;
    if(typeof AbortController !== "undefined"){ ctl = new AbortController(); o.signal = ctl.signal; }
    return new Promise(function(ok){
      if(ctl) minuterie = setTimeout(function(){ ctl.abort(); }, R.sonde);
      brut(location.origin + "/api/rapports?action=ping&t=" + Date.now(), o).then(function(r){
        clearTimeout(minuterie); dernierEchange = Date.now(); aVerifier = false; ok(r.ok);
      }, function(){
        clearTimeout(minuterie); autreMode(); ok(false);    /* cette réserve ne répond plus : l'autre */
      });
    });
  }
  function reveiller(){ return sonder().then(function(){}); }

  /* le retour du réseau : l'événement du navigateur, le retour à l'appli, ou un essai régulier */
  function guetterReseau(fini, maxi){
    var fait = false, t1 = null, t2 = null, t3 = null;
    function finir(){
      if(fait) return; fait = true;
      window.removeEventListener("online", vu); document.removeEventListener("visibilitychange", vu);
      clearInterval(t1); clearInterval(t2); clearTimeout(t3);
      setTimeout(fini, 800);
    }
    function vu(){ if(navigator.onLine !== false && !document.hidden) finir(); }
    window.addEventListener("online", vu);
    document.addEventListener("visibilitychange", vu);
    t1 = setInterval(vu, 4000);
    /* le téléphone peut se croire hors ligne à tort après la veille : on essaie quand même */
    t2 = setInterval(function(){ if(!document.hidden) sonder().then(function(ok){ if(ok) finir(); }); }, R.essaiHorsLigne);
    if(maxi) t3 = setTimeout(finir, maxi);
  }
  function attendre(ms){
    return new Promise(function(ok){
      /* hors ligne pour de bon : on attend le retour du réseau (au plus 20 s) */
      if(navigator.onLine === false) guetterReseau(ok, Math.max(ms, 20000));
      else setTimeout(ok, ms);
    });
  }
  /* sans limite : le temps qu'il faut pour que le réseau revienne */
  function attendreReseau(){
    return new Promise(function(ok){
      if(navigator.onLine !== false){ ok(); return; }
      guetterReseau(ok, 0);
    });
  }

  /* la veille : au retour, la connexion d'avant est peut-être morte */
  document.addEventListener("visibilitychange", function(){
    if(document.hidden){ cacheDepuis = Date.now(); return; }
    if(cacheDepuis && Date.now() - cacheDepuis > 20000) aVerifier = true;
    cacheDepuis = 0;
  });
  window.addEventListener("pageshow", function(e){ if(e.persisted) aVerifier = true; });

  /* la session à jour : une page ouverte avant une reconnexion garde l'ancien jeton */
  function jetonActuel(){
    try{ var s = JSON.parse(localStorage.getItem("outils:session") || "null"); return s && s.jeton ? s.jeton : ""; }catch(e){ return ""; }
  }
  function jetonDe(options){
    var h = options && options.headers;
    if(!h) return "";
    if(typeof Headers !== "undefined" && h instanceof Headers) return h.get("x-auth") || "";
    for(var k in h) if(k.toLowerCase() === "x-auth") return h[k];
    return "";
  }
  function avecJeton(options, jeton){
    var o = Object.assign({}, options), h = o.headers;
    if(typeof Headers !== "undefined" && h instanceof Headers){ h = new Headers(h); h.set("x-auth", jeton); }
    else {
      var n = {};
      for(var k in h) if(k.toLowerCase() !== "x-auth") n[k] = h[k];
      n["x-auth"] = jeton; h = n;
    }
    o.headers = h;
    return o;
  }

  /* le bandeau : discret, en bas, le temps des nouveaux essais */
  var bandeau = null;
  function dire(t){
    try{
      if(!t){ if(bandeau){ bandeau.remove(); bandeau = null; } return; }
      if(!bandeau){
        bandeau = document.createElement("div");
        bandeau.id = "bandeauReseau";
        bandeau.setAttribute("role", "status");
        bandeau.style.cssText = "position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);"
          + "z-index:2147483000;max-width:min(92vw,420px);padding:9px 14px;border-radius:999px;background:#1F2933;color:#F2F5F9;"
          + "font:600 13px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);text-align:center";
        (document.body || document.documentElement).appendChild(bandeau);
      }
      bandeau.textContent = t;
    }catch(e){}
  }

  /* ---------- les envois en cours ----------
     window.__envoisEnCours : combien d'envois au site ne sont pas finis.
     « Tout publier » attend qu'il retombe à zéro (le PDF, puis les photos)
     avant de dire que c'est fait et de fermer la fiche.
     Une publication déjà en route (même chantier, même type, même titre,
     même suivi) n'est pas envoyée une seconde fois : un double appui sur
     « Publier » reçoit la réponse de la première. */
  window.__envoisEnCours = 0;
  var EN_ROUTE = {};
  function clePublication(entree, options){
    try{
      if(!/[?&]action=publier(&|$)/.test(adresse(entree))) return "";
      var b = options && options.body; if(typeof b !== "string") return "";
      var d = JSON.parse(b);
      return [d.chantier, d.type, d.titre, d.suiviId, d.visite, d.date, (d.destinataires || []).join(","), d.dossier ? 1 : 0].join("|");
    }catch(e){ return ""; }
  }

  window.fetch = function(entree, options){
    if(!versLeSite(entree) || !renvoyable(entree, options)) return brut.apply(this, arguments);
    var cle = clePublication(entree, options);
    if(cle && EN_ROUTE[cle]) return EN_ROUTE[cle].then(function(r){ return r.clone(); });
    var envoi = estEnvoi(entree, options);
    if(envoi) window.__envoisEnCours++;
    var p = envoyer(this, entree, options).then(function(r){
      if(envoi) window.__envoisEnCours = Math.max(0, window.__envoisEnCours - 1);
      if(cle) delete EN_ROUTE[cle];
      return r;
    }, function(e){
      if(envoi) window.__envoisEnCours = Math.max(0, window.__envoisEnCours - 1);
      if(cle) delete EN_ROUTE[cle];
      throw e;
    });
    /* la réponse d'origine n'est jamais lue : chacun en reçoit sa copie */
    if(cle){ EN_ROUTE[cle] = p; return p.then(function(r){ return r.clone(); }); }
    return p;
  };

  function envoyer(soi, entree, options){
    var essai = 0, attendu = false, rejeton = false;
    var envoi = estEnvoi(entree, options), delai = delaiPour(entree, options);
    function tenter(){
      return avecDelai(soi, entree, options, delai).then(function(r){
        if(reponseDeRelais(r) && essai < ATTENTES.length) return encore(r);
        /* refusé avec un ancien jeton alors qu'une session plus récente est là : on la reprend */
        if(r.status === 401 && !rejeton){
          var vieux = jetonDe(options), neuf = jetonActuel();
          if(vieux && neuf && vieux !== neuf){ rejeton = true; options = avecJeton(options, neuf); return tenter(); }
        }
        if(essai || attendu) dire("");
        return r;
      }, function(err){
        if(err && err.name === "AbortError") throw err;             /* annulé exprès */
        if(navigator.onLine === false && envoi){
          dire("Hors ligne : l'envoi partira dès le retour du réseau. Gardez l'appli ouverte.");
          attendu = true;
          return attendreReseau().then(reveiller).then(function(){ essai = 0; dire("Réseau revenu : envoi en cours…"); return tenter(); });
        }
        if(essai < ATTENTES.length) return encore(null, err);
        dire("");
        throw err;
      });
    }
    function encore(r, err){
      var n = essai + 1;
      autreMode();                                     /* une connexion neuve pour le nouvel essai */
      dire((err && err.name === "DelaiDepasse" ? "Le site ne répond pas" : "Connexion faible") + "… nouvel essai (" + n + "/" + ATTENTES.length + ")");
      return attendre(ATTENTES[essai]).then(reveiller).then(function(){ essai = n; return tenter(); })
        .catch(function(e){ dire(""); if(r) return r; throw e || err; });
    }
    /* longtemps sans échange, ou retour de veille : on vérifie la connexion avant d'envoyer */
    if(envoi && (aVerifier || Date.now() - dernierEchange > R.calme)) return sonder().then(tenter);
    return tenter();
  }
})();
