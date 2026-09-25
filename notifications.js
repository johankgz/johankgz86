/* =====================================================================
   notifications.js — activer les notifications sur cet appareil
   ---------------------------------------------------------------------
   Utilisé par « Mon compte » (le réglage complet) et par l'accueil
   (une invitation discrète, une fois).

   Sur iPhone, les notifications d'un site n'existent que pour un site
   installé sur l'écran d'accueil (iOS 16.4 et plus) : dans Safari, on
   explique comment l'installer plutôt que de proposer un bouton qui ne
   marcherait pas.

     Notif.etat(session)        -> Promise {possible, raison, actif, prefs, appareils}
     Notif.activer(session)     -> Promise   (à appeler dans le clic)
     Notif.desactiver(session)  -> Promise
     Notif.prefs(session, {messages, documents, rappels})
     Notif.essai(session)
     Notif.inviter(hote, session)
   ===================================================================== */
(function(){
"use strict";
var API="/api/rapports";

function prisEnCharge(){
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
function surIOS(){
  var ua=navigator.userAgent||"";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
}
function installe(){
  try{ return !!window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches; }
  catch(e){ return false; }
}
function appareil(){
  var ua=navigator.userAgent||"";
  var quoi = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1) ? "iPad"
    : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Ordinateur";
  var nav = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return quoi + (nav && !installe() ? " · " + nav : "");
}
function octetsDe(b64){
  var p="=".repeat((4 - b64.length % 4) % 4);
  var bin=atob((b64+p).replace(/-/g,"+").replace(/_/g,"/"));
  var out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
  return out;
}
function appel(S, action, corps, query){
  return fetch(API+"?action="+action+(query||""), {
    method: corps ? "POST" : "GET",
    headers: corps ? {"content-type":"application/json", "x-auth":S.jeton} : {"x-auth":S.jeton},
    body: corps ? JSON.stringify(corps) : undefined
  }).then(function(r){ return r.json().then(function(d){ if(!r.ok) throw new Error(d.erreur||"Refusé."); return d; }); });
}

/* le service des notifications et la clé du serveur, préparés dès
   l'ouverture de la page : sur iPhone, la demande d'autorisation doit
   partir tout de suite dans le clic, sans rien attendre avant */
var ENREG=null, CLE=null;
function preparer(S){
  if(!prisEnCharge()) return Promise.resolve(null);
  if(!ENREG){
    ENREG=navigator.serviceWorker.register("/sw.js", {scope:"/"})
      .then(function(){ return navigator.serviceWorker.ready; });
    ENREG.catch(function(){ ENREG=null; });
  }
  if(!CLE && S && S.jeton){
    CLE=appel(S, "push-cle").then(function(d){ return d.cle; });
    CLE.catch(function(){ CLE=null; });
  }
  return ENREG;
}
function abonnementIci(){
  if(!ENREG) return Promise.resolve(null);
  return ENREG.then(function(r){ return r.pushManager.getSubscription(); }).catch(function(){ return null; });
}

function etat(S){
  if(!prisEnCharge()){
    return Promise.resolve({possible:false, raison: surIOS() && !installe() ? "ios-installer" : "non-pris", actif:false});
  }
  if(Notification.permission==="denied"){
    return Promise.resolve({possible:false, raison:"refuse", actif:false});
  }
  preparer(S);
  return abonnementIci().then(function(sub){
    var q = sub ? "&endpoint="+encodeURIComponent(sub.endpoint) : "";
    return appel(S, "push-etat", null, q).then(function(d){
      return {possible:true, raison:null, actif: !!sub && !!d.cetAppareil && Notification.permission==="granted",
        prefs:d.prefs, appareils:d.appareils};
    });
  });
}

function activer(S){
  if(!prisEnCharge()) return Promise.reject(new Error("Cet appareil ne reçoit pas les notifications d'un site."));
  preparer(S);
  /* d'abord l'autorisation, dans le geste même */
  var demande = Notification.permission==="granted"
    ? Promise.resolve("granted") : Notification.requestPermission();
  return Promise.resolve(demande).then(function(p){
    if(p!=="granted") throw new Error(p==="denied"
      ? "Notifications refusées. Pour les rétablir : Réglages du téléphone › Notifications › Travaux 360."
      : "Autorisation non donnée.");
    if(!ENREG || !CLE) preparer(S);          /* un premier essai a pu échouer hors réseau */
    return Promise.all([ENREG, CLE]);
  }).then(function(r){
    var enreg=r[0], cle=r[1];
    var options={userVisibleOnly:true, applicationServerKey:octetsDe(cle)};
    return enreg.pushManager.subscribe(options).catch(function(){
      /* abonné avec une ancienne clé du serveur : on repart à neuf */
      return enreg.pushManager.getSubscription().then(function(vieux){
        return (vieux ? vieux.unsubscribe() : Promise.resolve()).then(function(){ return enreg.pushManager.subscribe(options); });
      });
    });
  }).then(function(sub){
    return appel(S, "push-abonner", {abonnement: sub.toJSON ? sub.toJSON() : sub, appareil: appareil()});
  });
}

function desactiver(S){
  return abonnementIci().then(function(sub){
    if(!sub) return null;
    var ep=sub.endpoint;
    return sub.unsubscribe().catch(function(){}).then(function(){ return appel(S, "push-desabonner", {endpoint:ep}); });
  });
}
function prefs(S, p){ return appel(S, "push-prefs", p); }
function essai(S){ return appel(S, "push-essai", {}); }

/* ---------- l'invitation de l'accueil ----------
   Une carte, une fois : « Activer » ou « Plus tard » (elle revient
   dans deux semaines). Rien si l'appareil ne peut pas, si c'est déjà
   fait, ou si la personne a refusé. */
var CLE_PLUS_TARD="notif:plusTard";
function inviter(hote, S){
  if(!hote || !S || !S.jeton || !prisEnCharge()) return;
  try{
    var t=parseInt(localStorage.getItem(CLE_PLUS_TARD)||"0",10);
    if(t && Date.now()-t < 14*24*3600*1000) return;
  }catch(e){}
  etat(S).then(function(e){
    if(!e.possible || e.actif) return;
    hote.textContent="";
    var ic=document.createElement("span"); ic.className="in-ic";
    ic.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>';
    var tx=document.createElement("div"); tx.className="in-tx";
    tx.innerHTML="<b>Être prévenu sur ce téléphone</b><span>Messages, documents déposés pour vous et rappels, même site fermé.</span>";
    var oui=document.createElement("button"); oui.type="button"; oui.className="in-oui"; oui.textContent="Activer";
    var non=document.createElement("button"); non.type="button"; non.className="in-non"; non.textContent="Plus tard";
    var btns=document.createElement("div"); btns.className="in-btns";
    btns.appendChild(oui); btns.appendChild(non);
    hote.appendChild(ic); hote.appendChild(tx); hote.appendChild(btns);
    hote.hidden=false;
    non.addEventListener("click", function(){
      try{ localStorage.setItem(CLE_PLUS_TARD, String(Date.now())); }catch(e){}
      hote.hidden=true;
    });
    oui.addEventListener("click", function(){
      oui.disabled=true; oui.textContent="…";
      activer(S).then(function(){
        tx.innerHTML="<b>Notifications activées</b><span>Réglez ce que vous recevez dans Mon compte.</span>";
        btns.remove();
        setTimeout(function(){ hote.hidden=true; }, 4000);
      }).catch(function(err){
        oui.disabled=false; oui.textContent="Activer";
        tx.querySelector("span").textContent=err && err.message ? err.message : "Activation impossible.";
      });
    });
  }).catch(function(){});
}

window.Notif={
  prisEnCharge:prisEnCharge, surIOS:surIOS, installe:installe,
  preparer:preparer, etat:etat, activer:activer, desactiver:desactiver,
  prefs:prefs, essai:essai, inviter:inviter
};
})();
