/* =====================================================================
   reseau.js — tenir bon sur un réseau mobile faible
   ---------------------------------------------------------------------
   En 3G, après un long moment sur une fiche, la première publication
   échouait souvent alors que le réseau était là : la connexion gardée
   ouverte par le téléphone avait été coupée en route, ou le serveur,
   endormi faute de visite, répondait par une page d'erreur le temps de
   se réveiller. Recharger la page arrangeait tout, parce que ça rouvrait
   une connexion neuve et réveillait le serveur.

   Ce fichier fait la même chose, tout seul : quand un appel au site
   échoue ainsi, il attend un peu, réveille le serveur par un appel
   léger (qui ouvre une connexion neuve), puis renvoie la même demande,
   jusqu'à trois fois. Un petit bandeau dit ce qui se passe. Les vraies
   réponses du serveur (refus, erreur de saisie) passent telles quelles.
   ===================================================================== */
(function(){
  if(window.__reseauFiable || !window.fetch) return;
  window.__reseauFiable = true;
  var brut = window.fetch;
  var ATTENTES = [1500, 4000, 8000];

  function adresse(entree){ return typeof entree === "string" ? entree : (entree && entree.url) || String(entree); }
  function versLeSite(entree){
    try{
      var u = new URL(adresse(entree), location.href);
      return u.origin === location.origin && /^\/(api|\.netlify\/functions)\//.test(u.pathname)
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
  function attendre(ms){
    return new Promise(function(ok){
      /* hors ligne pour de bon : on attend le retour du réseau (au plus 20 s) */
      if(navigator.onLine === false){
        var fini = false;
        var go = function(){ if(fini) return; fini = true; window.removeEventListener("online", go); setTimeout(ok, 800); };
        window.addEventListener("online", go);
        setTimeout(go, Math.max(ms, 20000));
      } else setTimeout(ok, ms);
    });
  }
  function reveiller(){
    return brut(location.origin + "/api/rapports?action=ping&t=" + Date.now(), {cache:"no-store"})
      .then(function(){}, function(){});
  }

  /* le bandeau : discret, en bas, le temps des nouveaux essais */
  var bandeau = null;
  function dire(t){
    try{
      if(!t){ if(bandeau){ bandeau.remove(); bandeau = null; } return; }
      if(!bandeau){
        bandeau = document.createElement("div");
        bandeau.setAttribute("role", "status");
        bandeau.style.cssText = "position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);"
          + "z-index:2147483000;max-width:min(92vw,420px);padding:9px 14px;border-radius:999px;background:#1F2933;color:#F2F5F9;"
          + "font:600 13px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);text-align:center";
        (document.body || document.documentElement).appendChild(bandeau);
      }
      bandeau.textContent = t;
    }catch(e){}
  }

  window.fetch = function(entree, options){
    if(!versLeSite(entree) || !renvoyable(entree, options)) return brut.apply(this, arguments);
    var soi = this, essai = 0;
    function tenter(){
      return brut.call(soi, entree, options).then(function(r){
        if(reponseDeRelais(r) && essai < ATTENTES.length) return encore(r);
        if(essai) dire("");
        return r;
      }, function(err){
        if(err && err.name === "AbortError") throw err;             /* annulé exprès */
        if(essai < ATTENTES.length) return encore(null, err);
        dire("");
        throw err;
      });
    }
    function encore(r, err){
      var n = essai + 1;
      dire("Connexion faible… nouvel essai (" + n + "/" + ATTENTES.length + ")");
      return attendre(ATTENTES[essai]).then(reveiller).then(function(){ essai = n; return tenter(); })
        .catch(function(e){ dire(""); if(r) return r; throw e || err; });
    }
    return tenter();
  };
})();
