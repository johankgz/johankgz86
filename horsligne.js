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
})();
