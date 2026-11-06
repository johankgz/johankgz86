/* =====================================================================
   rafale.js — les photos en rafale, partout où l'on prend une photo
   ---------------------------------------------------------------------
   Sur un téléphone, un bouton « photo » (un champ fichier qui ouvre
   l'appareil photo : accept image, capture) n'ouvre plus l'appareil du
   téléphone pour une seule photo : il ouvre l'appareil photo du site,
   en plein écran. On enchaîne les photos sans revenir à la page ; la
   croix en haut à gauche arrête et ramène les photos prises, comme si on
   les avait choisies une à une.
   - un champ qui accepte plusieurs fichiers (multiple) les reçoit d'un coup ;
   - un champ qui n'en prend qu'une les reçoit l'une après l'autre ;
   - un champ marqué data-rafale="non" garde l'appareil du téléphone
     (une photo posée à un endroit précis du plan, par exemple).
   Sans caméra (refus, ordinateur sans webcam…), le bouton « Appareil
   photo du téléphone » rouvre l'appareil habituel.
   ===================================================================== */
(function(){
"use strict";
if(window.Rafale) return;

function tactile(){ try{ return matchMedia("(pointer:coarse)").matches; }catch(e){ return false; } }
function cible(el){
  if(!el || el.tagName!=="INPUT" || el.type!=="file" || !el.hasAttribute("capture")) return false;
  if(el.getAttribute("data-rafale")==="non" || el.__rafaleSauter) return false;
  return /image/i.test(el.accept||"");
}

var STYLE=false;
function style(){
  if(STYLE) return; STYLE=true;
  var s=document.createElement("style");
  s.setAttribute("data-theme-propre","");
  s.textContent=
    ".rf-fond{position:fixed;inset:0;z-index:2147483000;background:#000;color:#fff;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;touch-action:none}"
    +".rf-fond video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}"
    +".rf-haut{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) max(12px, env(safe-area-inset-right,0px)) 10px max(12px, env(safe-area-inset-left,0px));background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,0))}"
    +".rf-x{width:46px;height:46px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:24px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}"
    +".rf-x svg{width:22px;height:22px;stroke:#fff;stroke-width:2.6;fill:none;stroke-linecap:round}"
    +".rf-compte{padding:8px 14px;border-radius:999px;background:rgba(0,0,0,.45);font-size:15px;font-weight:700}"
    +".rf-bas{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px max(22px, env(safe-area-inset-right,0px)) calc(22px + env(safe-area-inset-bottom,0px)) max(22px, env(safe-area-inset-left,0px));background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.6))}"
    +".rf-vign{width:58px;height:58px;border-radius:10px;border:2px solid rgba(255,255,255,.85);background:#222 center/cover no-repeat}"
    +".rf-vign:not(.plein){opacity:.35}"
    +".rf-dec{width:78px;height:78px;border-radius:50%;border:5px solid #fff;background:rgba(255,255,255,.25);cursor:pointer;padding:0;transition:transform .08s}"
    +".rf-dec:active{transform:scale(.92)}.rf-dec i{display:block;width:100%;height:100%;border-radius:50%;background:#fff;transform:scale(.82)}"
    +".rf-tour{width:58px;height:58px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}"
    +".rf-tour svg{width:26px;height:26px;stroke:#fff;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}"
    +".rf-flash{position:absolute;inset:0;z-index:3;background:#fff;opacity:0;pointer-events:none;transition:opacity .18s}"
    +".rf-msg{position:relative;z-index:2;margin:auto;max-width:320px;padding:20px;text-align:center;font-size:15px;line-height:1.45}"
    +".rf-msg button{margin-top:14px;min-height:46px;padding:0 18px;border-radius:999px;border:0;background:#3B82F6;color:#fff;font:inherit;font-weight:700;cursor:pointer}"
    +".rf-aide{position:absolute;left:0;right:0;bottom:calc(122px + env(safe-area-inset-bottom,0px));z-index:2;text-align:center;font-size:13px;color:rgba(255,255,255,.85);text-shadow:0 1px 3px #000}";
  document.head.appendChild(s);
}

/* l'appareil photo du site : ouvert pour un champ, il lui rend les photos à la fin */
function ouvrir(champ){
  style();
  var photos=[], flux=null, face="environment", fini=false;
  var fond=document.createElement("div"); fond.className="rf-fond"; fond.setAttribute("role","dialog"); fond.setAttribute("aria-label","Appareil photo, en rafale");
  var video=document.createElement("video"); video.setAttribute("playsinline",""); video.muted=true; video.autoplay=true; fond.appendChild(video);
  var flash=document.createElement("div"); flash.className="rf-flash"; fond.appendChild(flash);
  var haut=document.createElement("div"); haut.className="rf-haut";
  var x=document.createElement("button"); x.type="button"; x.className="rf-x"; x.setAttribute("aria-label","Terminer : garder les photos prises");
  x.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  var compte=document.createElement("span"); compte.className="rf-compte"; compte.textContent="0 photo";
  haut.appendChild(x); haut.appendChild(compte); fond.appendChild(haut);
  var aide=document.createElement("div"); aide.className="rf-aide"; aide.textContent="Enchaînez les photos. La croix en haut à gauche termine."; fond.appendChild(aide);
  var bas=document.createElement("div"); bas.className="rf-bas";
  var vign=document.createElement("div"); vign.className="rf-vign"; vign.setAttribute("aria-hidden","true");
  var dec=document.createElement("button"); dec.type="button"; dec.className="rf-dec"; dec.setAttribute("aria-label","Prendre la photo"); dec.innerHTML="<i></i>";
  var tour=document.createElement("button"); tour.type="button"; tour.className="rf-tour"; tour.setAttribute("aria-label","Changer d'objectif");
  tour.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 4.6 1.3M14.5 12.5a2.5 2.5 0 0 0-4.6-1.3M14.4 15.6l-.3-.8.8-.2M9.6 10.4l.3.8-.8.2"/></svg>';
  bas.appendChild(vign); bas.appendChild(dec); bas.appendChild(tour); fond.appendChild(bas);
  document.body.appendChild(fond);
  var avantOverflow=document.documentElement.style.overflow; document.documentElement.style.overflow="hidden";

  function arreterFlux(){ if(flux){ flux.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); flux=null; } }
  function demarrer(){
    arreterFlux();
    var cont={audio:false, video:{facingMode:{ideal:face}, width:{ideal:3840}, height:{ideal:2160}}};
    return navigator.mediaDevices.getUserMedia(cont).then(function(s){
      if(fini){ s.getTracks().forEach(function(t){ t.stop(); }); return; }
      flux=s; video.srcObject=s; var p=video.play(); if(p && p.catch) p.catch(function(){});
    });
  }
  function echec(){
    video.remove(); bas.remove(); aide.remove(); compte.remove();
    var m=document.createElement("div"); m.className="rf-msg";
    m.appendChild(document.createTextNode("L'appareil photo du site n'est pas disponible (autorisation refusée, ou pas de caméra)."));
    var b=document.createElement("button"); b.type="button"; b.textContent="Appareil photo du téléphone";
    b.addEventListener("click", function(){ fermer(false); champ.__rafaleSauter=true; try{ champ.click(); } finally { setTimeout(function(){ champ.__rafaleSauter=false; }, 0); } });
    m.appendChild(document.createElement("br")); m.appendChild(b); fond.appendChild(m);
  }
  function prendre(){
    if(!flux || !video.videoWidth) return;
    var w=video.videoWidth, h=video.videoHeight, c=document.createElement("canvas"); c.width=w; c.height=h;
    c.getContext("2d").drawImage(video, 0, 0, w, h);
    flash.style.transition="none"; flash.style.opacity="0.85"; void flash.offsetWidth; flash.style.transition="opacity .25s"; flash.style.opacity="0";
    try{ if(navigator.vibrate) navigator.vibrate(15); }catch(e){}
    c.toBlob(function(b){
      if(!b) return;
      var n=photos.length+1, d=new Date(), z=function(v){ return (v<10?"0":"")+v; };
      var nom="photo-"+d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes())+z(d.getSeconds())+"-"+n+".jpg";
      var f; try{ f=new File([b], nom, {type:"image/jpeg", lastModified:Date.now()}); }catch(e){ f=b; f.name=nom; }
      photos.push(f);
      compte.textContent=photos.length+" photo"+(photos.length>1?"s":"");
      try{ var u=URL.createObjectURL(b); vign.style.backgroundImage="url('"+u+"')"; vign.classList.add("plein"); }catch(e){}
      aide.textContent = photos.length===1 ? "Encore une ? Touchez le rond. La croix termine." : "";
    }, "image/jpeg", 0.88);
  }
  function fermer(rendre){
    if(fini) return; fini=true;
    arreterFlux(); fond.remove(); document.documentElement.style.overflow=avantOverflow;
    champ.__rafaleRepos=Date.now()+3000;
    if(rendre && photos.length) livrer(champ, photos.slice());
    else champ.dispatchEvent(new Event("cancel"));
  }
  x.addEventListener("click", function(){ fermer(true); });
  dec.addEventListener("click", prendre);
  tour.addEventListener("click", function(){ face = face==="environment" ? "user" : "environment"; demarrer().catch(function(){}); });
  document.addEventListener("keydown", function k(e){ if(fini){ document.removeEventListener("keydown", k, true); return; } if(e.key==="Escape"){ e.preventDefault(); fermer(true); } else if(e.key===" " || e.key==="Enter"){ e.preventDefault(); prendre(); } }, true);
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ echec(); return; }
  demarrer().catch(echec);
}

/* les photos rendues au champ : d'un coup s'il en prend plusieurs, sinon l'une après l'autre */
function poser(champ, fichiers){
  try{
    var dt=new DataTransfer(); fichiers.forEach(function(f){ dt.items.add(f); });
    champ.files=dt.files;
  }catch(e){ return false; }
  champ.dispatchEvent(new Event("input", {bubbles:true}));
  champ.dispatchEvent(new Event("change", {bubbles:true}));
  return true;
}
function livrer(champ, photos){
  if(champ.multiple){ poser(champ, photos); return; }
  var i=0;
  (function suivante(){
    if(i>=photos.length) return;
    poser(champ, [photos[i++]]);
    champ.__rafaleRepos=Date.now()+3000;
    setTimeout(suivante, 700);
  })();
}

/* un champ photo touché : la rafale à la place de l'appareil du téléphone */
document.addEventListener("click", function(e){
  var el=e.target;
  if(!cible(el) || !tactile()) return;
  e.preventDefault(); e.stopPropagation();
  /* une page qui rouvre l'appareil d'elle-même après chaque photo :
     la croix a dit stop, on ne rouvre pas aussitôt */
  if(el.__rafaleRepos && Date.now()<el.__rafaleRepos) return;
  ouvrir(el);
}, true);

window.Rafale={ouvrir:ouvrir};
})();
