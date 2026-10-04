/* =====================================================================
   horsligne.js — le site sans réseau
   ---------------------------------------------------------------------
   Sur chaque page : allume la mise en cache du service (sw.js), et dit
   d'un bandeau en haut quand le réseau manque. Sans réseau, on continue :
   les fiches restent sur l'appareil, les pages déjà ouvertes et les
   données déjà vues se rouvrent, et un envoi attend le retour du réseau
   pour partir tout seul (reseau.js), page ouverte.
   Déconnecté, l'appareil oublie les données gardées de l'ancien compte.
   Les essais automatiques (navigateur piloté) gardent un site sans cache,
   sauf s'ils le demandent (localStorage « horsligne:essai »).
   ===================================================================== */
(function(){
  if(window.__horsLigne) return; window.__horsLigne=true;
  var pilote = !!navigator.webdriver, essai = false;
  try{ essai = localStorage.getItem("horsligne:essai")==="1"; }catch(e){}
  var actif = !pilote || essai;
  var sansSession = false;
  try{ sansSession = !localStorage.getItem("outils:session"); }catch(e){}

  function dire(msg){
    if(!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.ready.then(function(r){ if(r.active) r.active.postMessage(msg); }).catch(function(){});
  }
  if("serviceWorker" in navigator && /^https?:$/.test(location.protocol) && (actif || navigator.serviceWorker.controller)){
    navigator.serviceWorker.register("/sw.js", {scope:"/"}).catch(function(){});
    dire({type:"horsligne", actif:actif});
    if(sansSession) dire({type:"oublier"});
  }

  /* le bandeau */
  var b=null, minuteur=null;
  function bandeau(texte, couleur, duree){
    clearTimeout(minuteur);
    if(!texte){ if(b){ b.remove(); b=null; } return; }
    if(!b){
      b=document.createElement("div"); b.id="bandeauHorsLigne"; b.setAttribute("role","status");
      b.style.cssText="position:fixed;left:50%;top:calc(6px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:2147482000;"
        +"max-width:min(94vw,460px);padding:7px 14px;border-radius:999px;color:#fff;font:600 12.5px/1.35 system-ui,-apple-system,sans-serif;"
        +"box-shadow:0 8px 24px -10px rgba(0,0,0,.6);text-align:center;pointer-events:none";
      (document.body||document.documentElement).appendChild(b);
    }
    b.style.background=couleur; b.textContent=texte;
    if(duree) minuteur=setTimeout(function(){ bandeau(""); }, duree);
  }
  function etat(){
    if(navigator.onLine===false) bandeau("Hors ligne · vos saisies restent sur l'appareil ; les envois partiront au retour du réseau", "#7C2D12");
    else if(b && /Hors ligne/.test(b.textContent)) bandeau("Réseau revenu", "#166534", 2500);
  }
  window.addEventListener("offline", etat);
  window.addEventListener("online", etat);
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", etat); else etat();
  window.HorsLigne={etat:etat};

  /* la pastille sur l'icône de l'appli, sur l'écran d'accueil du téléphone :
     le nombre de la cloche de l'accueil. Le service la tient à jour quand
     une notification arrive appli fermée (sw.js), l'accueil la remet au
     compte juste à chaque ouverture. iPhone : appli ajoutée à l'écran
     d'accueil et notifications autorisées. */
  /* la nuit (19 h – 7 h par défaut, réglable dans « Mon compte ») : pas de pastille sur l'icône */
  function silence(){
    var r={silence:true, debut:"19:00", fin:"07:00"};
    try{ var g=JSON.parse(localStorage.getItem("outils:silence")||"null"); if(g) r=g; }catch(e){}
    if(r.silence===false || r.debut===r.fin) return false;
    var d=new Date(), hm;
    try{ hm=new Intl.DateTimeFormat("fr-FR", {timeZone:"Europe/Paris", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).format(d); }
    catch(e){ hm=("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2); }
    return r.debut < r.fin ? (hm >= r.debut && hm < r.fin) : (hm >= r.debut || hm < r.fin);
  }
  function pastille(n){
    n = Math.max(0, parseInt(n, 10) || 0);
    try{
      if(silence()){ if(navigator.clearAppBadge) navigator.clearAppBadge().catch(function(){}); }
      else if(n && navigator.setAppBadge) navigator.setAppBadge(n).catch(function(){});
      else if(!n && navigator.clearAppBadge) navigator.clearAppBadge().catch(function(){});
    }catch(e){}
    dire({type:"pastille", n:n});
  }
  window.PastilleAppli={poser:pastille};
  if(sansSession) pastille(0);
})();
