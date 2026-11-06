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
   - en bas à gauche, la dernière photo : la toucher montre toutes les
     photos prises, la corbeille retire celles qu'on ne garde pas ;
   - au-dessus du déclencheur, l'objectif : 0,5 (l'ultra grand-angle,
     quand le téléphone le donne au navigateur), 1, 2 ;
   - en haut, le flash (non / à chaque photo / lampe allumée), quand le
     navigateur sait allumer la lampe du téléphone ;
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
    ".rf-fond{position:fixed;inset:0;z-index:2147483000;background:#000;color:#fff;display:flex;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;touch-action:none;-webkit-user-select:none;user-select:none}"
    +".rf-fond button{-webkit-tap-highlight-color:transparent;font-family:inherit}"
    +".rf-fond video,.rf-gel{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;transform-origin:50% 50%}"
    +".rf-fond video{opacity:0}.rf-fond video.pret{opacity:1;transition:transform .2s}"
    +".rf-gel{z-index:1;opacity:0;pointer-events:none;transition:opacity .2s}.rf-gel.vu{opacity:1;transition:none}"
    +".rf-haut{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:calc(10px + env(safe-area-inset-top,0px)) max(12px, env(safe-area-inset-right,0px)) 10px max(12px, env(safe-area-inset-left,0px));background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,0))}"
    +".rf-x,.rf-fl{width:46px;height:46px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);padding:0}"
    +".rf-x svg{width:22px;height:22px;stroke:#fff;stroke-width:2.6;fill:none;stroke-linecap:round}"
    +".rf-fl svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:1.9;stroke-linejoin:round;stroke-linecap:round}"
    +".rf-fl.on{background:#FACC15}.rf-fl.on svg{stroke:#111;fill:#111}"
    +".rf-fl.lampe{background:#FACC15}.rf-fl.lampe svg{stroke:#111;fill:none}"
    +".rf-fl[hidden]{display:none}"
    +".rf-compte{padding:8px 14px;border-radius:999px;background:rgba(0,0,0,.45);font-size:15px;font-weight:700}"
    +".rf-bulle{position:absolute;left:50%;top:calc(70px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:3;padding:6px 12px;border-radius:8px;background:rgba(0,0,0,.6);font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:0;transition:opacity .2s;pointer-events:none}"
    +".rf-bulle.vu{opacity:1}"
    +".rf-zoom{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(128px + env(safe-area-inset-bottom,0px));z-index:2;display:flex;gap:6px;padding:4px;border-radius:999px;background:rgba(0,0,0,.35)}"
    +".rf-zoom[hidden]{display:none}"
    +".rf-zoom button{min-width:38px;height:38px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;font-size:12px;font-weight:700;cursor:pointer;padding:0 4px}"
    +".rf-zoom button.on{background:rgba(0,0,0,.55);color:#FACC15;font-size:13px;transform:scale(1.12)}"
    +".rf-bas{position:absolute;left:0;right:0;bottom:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px max(22px, env(safe-area-inset-right,0px)) calc(22px + env(safe-area-inset-bottom,0px)) max(22px, env(safe-area-inset-left,0px));background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.6))}"
    +".rf-vign{width:58px;height:58px;border-radius:10px;border:2px solid rgba(255,255,255,.85);background:#222 center/cover no-repeat;padding:0;cursor:pointer}"
    +".rf-vign:not(.plein){opacity:.35;cursor:default}"
    +".rf-dec{width:78px;height:78px;border-radius:50%;border:5px solid #fff;background:rgba(255,255,255,.25);cursor:pointer;padding:0;transition:transform .08s}"
    +".rf-dec:active{transform:scale(.92)}.rf-dec i{display:block;width:100%;height:100%;border-radius:50%;background:#fff;transform:scale(.82)}"
    +".rf-tour{width:58px;height:58px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}"
    +".rf-tour svg{width:26px;height:26px;stroke:#fff;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}"
    +".rf-flash{position:absolute;inset:0;z-index:3;background:#fff;opacity:0;pointer-events:none;transition:opacity .18s}"
    +".rf-msg{position:relative;z-index:2;margin:auto;max-width:320px;padding:20px;text-align:center;font-size:15px;line-height:1.45}"
    +".rf-msg button{margin-top:14px;min-height:46px;padding:0 18px;border-radius:999px;border:0;background:#3B82F6;color:#fff;font:inherit;font-weight:700;cursor:pointer}"
    /* les photos prises : revoir, supprimer */
    +".rf-revue{position:absolute;inset:0;z-index:5;background:#0B0B0D;display:flex;flex-direction:column}"
    +".rf-revue[hidden]{display:none}"
    +".rf-rhaut{display:flex;align-items:center;gap:12px;padding:calc(10px + env(safe-area-inset-top,0px)) max(12px, env(safe-area-inset-right,0px)) 10px max(12px, env(safe-area-inset-left,0px))}"
    +".rf-rhaut b{flex:1;font-size:17px}"
    +".rf-retour{min-height:44px;padding:0 16px;border-radius:999px;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:15px;font-weight:700;cursor:pointer}"
    +".rf-grille{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px 3px calc(12px + env(safe-area-inset-bottom,0px));align-content:start}"
    +".rf-case{position:relative;aspect-ratio:3/4;background:#222 center/cover no-repeat;border:0;padding:0;cursor:pointer}"
    +".rf-case .rf-num{position:absolute;left:6px;top:6px;padding:2px 7px;border-radius:999px;background:rgba(0,0,0,.55);font-size:12px;font-weight:700;color:#fff}"
    +".rf-suppr{position:absolute;right:6px;bottom:6px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(220,38,38,.92);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}"
    +".rf-suppr svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
    +".rf-vide{grid-column:1/-1;padding:40px 20px;text-align:center;color:rgba(255,255,255,.7);font-size:15px}"
    +".rf-grand{position:absolute;inset:0;z-index:6;background:#000;display:flex;flex-direction:column}"
    +".rf-grand[hidden]{display:none}"
    +".rf-grand img{flex:1;min-height:0;width:100%;object-fit:contain}"
    +".rf-gbas{display:flex;justify-content:space-between;gap:12px;padding:12px max(16px, env(safe-area-inset-right,0px)) calc(16px + env(safe-area-inset-bottom,0px)) max(16px, env(safe-area-inset-left,0px))}"
    +".rf-gbas button{min-height:46px;padding:0 18px;border-radius:999px;border:0;font-size:15px;font-weight:700;cursor:pointer;color:#fff;background:rgba(255,255,255,.16)}"
    +".rf-gbas button.rouge{background:#DC2626}";
  document.head.appendChild(s);
}

var ICO_FLASH='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/></svg>';
var ICO_FLASH_NON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/><path d="M4 4l16 16"/></svg>';
var ICO_LAMPE='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8v4l-2 3v10h-4V10L8 7z"/><path d="M8 7h8M12 13v2"/></svg>';
var ICO_SUPPR='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function el(tag, cls, html){ var e=document.createElement(tag); if(cls) e.className=cls; if(html!=null) e.innerHTML=html; return e; }
function bouton(cls, label, html){ var b=el("button", cls, html); b.type="button"; if(label) b.setAttribute("aria-label", label); return b; }
function attendre(ms){ return new Promise(function(ok){ setTimeout(ok, ms); }); }

/* l'appareil photo du site : ouvert pour un champ, il lui rend les photos à la fin */
function ouvrir(champ){
  style();
  var photos=[], flux=null, piste=null, face="environment", fini=false, occupe=false;
  /* objectifs : 0,5 (ultra grand-angle, une autre caméra du téléphone), 1, 2
     (téléobjectif s'il existe, sinon le zoom de la caméra, sinon un recadrage) */
  var CAMS={ultra:null, tele:null}, objectif="1", numerique=1;
  /* flash : « non », « oui » (à chaque photo), « lampe » (allumée en continu) */
  var modeFlash="non", torche=false;
  try{ modeFlash=localStorage.getItem("rafale:flash")||"non"; }catch(e){}
  if(["non","oui","lampe"].indexOf(modeFlash)<0) modeFlash="non";

  var fond=el("div","rf-fond"); fond.setAttribute("role","dialog"); fond.setAttribute("aria-label","Appareil photo, en rafale");
  var video=el("video"); video.setAttribute("playsinline",""); video.muted=true; video.autoplay=true; fond.appendChild(video);
  /* pendant un changement d'objectif : la dernière image, figée en plein écran */
  var gel=el("canvas","rf-gel"); fond.appendChild(gel);
  var flash=el("div","rf-flash"); fond.appendChild(flash);
  var haut=el("div","rf-haut");
  var x=bouton("rf-x","Terminer : garder les photos prises",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>');
  var fl=bouton("rf-fl","Flash"); fl.hidden=true;
  var compte=el("span","rf-compte"); compte.textContent="0 photo";
  haut.appendChild(x); haut.appendChild(fl); haut.appendChild(compte); fond.appendChild(haut);
  var bulle=el("div","rf-bulle"); fond.appendChild(bulle);
  var zoom=el("div","rf-zoom"); zoom.hidden=true; fond.appendChild(zoom);
  var bas=el("div","rf-bas");
  var vign=bouton("rf-vign","Voir les photos prises");
  var dec=bouton("rf-dec","Prendre la photo","<i></i>");
  var tour=bouton("rf-tour","Changer de côté (avant / arrière)",'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><path d="M9.5 13.5a2.5 2.5 0 0 0 4.6 1.3M14.5 12.5a2.5 2.5 0 0 0-4.6-1.3M14.4 15.6l-.3-.8.8-.2M9.6 10.4l.3.8-.8.2"/></svg>');
  bas.appendChild(vign); bas.appendChild(dec); bas.appendChild(tour); fond.appendChild(bas);
  /* la revue des photos prises */
  var revue=el("div","rf-revue"); revue.hidden=true;
  var rhaut=el("div","rf-rhaut"); var retour=bouton("rf-retour","",""); retour.textContent="‹ Appareil photo";
  var rtitre=el("b"); rhaut.appendChild(retour); rhaut.appendChild(rtitre); revue.appendChild(rhaut);
  var grille=el("div","rf-grille"); revue.appendChild(grille); fond.appendChild(revue);
  var grand=el("div","rf-grand"); grand.hidden=true; var gimg=el("img"); gimg.alt="";
  var gbas=el("div","rf-gbas"); var gret=bouton("",""); gret.textContent="‹ Retour"; var gsup=bouton("rouge",""); gsup.textContent="Supprimer";
  gbas.appendChild(gret); gbas.appendChild(gsup); grand.appendChild(gimg); grand.appendChild(gbas); fond.appendChild(grand);
  document.body.appendChild(fond);
  var avantOverflow=document.documentElement.style.overflow; document.documentElement.style.overflow="hidden";

  var tBulle=0;
  function dire(t){ bulle.textContent=t; bulle.classList.add("vu"); clearTimeout(tBulle); tBulle=setTimeout(function(){ bulle.classList.remove("vu"); }, 1300); }

  function arreterFlux(){ if(flux){ flux.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} }); flux=null; piste=null; torche=false; } }
  function capacites(){ try{ return piste && piste.getCapabilities ? piste.getCapabilities()||{} : {}; }catch(e){ return {}; } }
  function contraintes(){
    var v={width:{ideal:3840}, height:{ideal:2160}};
    if(face==="environment" && objectif==="0.5" && CAMS.ultra) v.deviceId={exact:CAMS.ultra};
    else if(face==="environment" && objectif==="2" && CAMS.tele) v.deviceId={exact:CAMS.tele};
    else v.facingMode={ideal:face};
    return {audio:false, video:v};
  }
  function figer(){
    if(!video.videoWidth || !video.classList.contains("pret")) return;
    try{ gel.width=video.videoWidth; gel.height=video.videoHeight; gel.getContext("2d").drawImage(video, 0, 0); gel.style.transform=video.style.transform; gel.classList.add("vu"); }catch(e){}
  }
  /* la vidéo ne se montre qu'une fois la nouvelle caméra prête : pas d'image
     réduite au milieu de l'écran pendant le changement (iPhone) */
  var nPret=0;
  function quandPret(){
    var n=++nPret, t0=Date.now();
    (function t(){
      if(n!==nPret || fini) return;
      if(!(video.videoWidth && video.readyState>=2) && Date.now()-t0<4000){ setTimeout(t, 40); return; }
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ setTimeout(function(){
        if(n!==nPret || fini) return;
        video.classList.add("pret"); gel.classList.remove("vu");
      }, 120); }); });
    })();
  }
  function demarrer(){
    figer(); video.classList.remove("pret"); nPret++;
    arreterFlux();
    return navigator.mediaDevices.getUserMedia(contraintes()).then(function(s){
      if(fini){ s.getTracks().forEach(function(t){ t.stop(); }); return; }
      flux=s; piste=s.getVideoTracks()[0]||null; video.srcObject=s; var p=video.play(); if(p && p.catch) p.catch(function(){});
      return chercherCameras().then(function(){ zoomCap=false; appliquerZoom(); majFlash(); if(modeFlash==="lampe") lampe(true); majZoom(); quandPret(); });
    });
  }
  /* les autres caméras arrière : le nom n'est connu qu'une fois la caméra autorisée */
  var camsLues=false;
  function chercherCameras(){
    if(camsLues || !navigator.mediaDevices.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(function(L){
      camsLues=true;
      L.forEach(function(d){
        if(d.kind!=="videoinput") return; var n=String(d.label||"");
        if(/front|avant|user|facetime/i.test(n) || /dual|triple|double/i.test(n)) return;
        if(/ultra/i.test(n) && !CAMS.ultra) CAMS.ultra=d.deviceId;
        else if(/t[ée]l[ée]|tele/i.test(n) && !CAMS.tele) CAMS.tele=d.deviceId;
      });
    }).catch(function(){});
  }
  /* 2 sans téléobjectif : le zoom de la caméra s'il existe, sinon un recadrage au centre */
  var zoomCap=false;
  function appliquerZoom(){
    numerique=1; video.style.transform="";
    var z=capacites().zoom;
    if(objectif!=="2" || CAMS.tele || face!=="environment"){
      if(zoomCap && z && piste.applyConstraints) piste.applyConstraints({advanced:[{zoom:z.min||1}]}).catch(function(){});
      zoomCap=false; return;
    }
    if(z && z.max>=2 && piste.applyConstraints){
      zoomCap=true;
      piste.applyConstraints({advanced:[{zoom:Math.max(z.min||1, 2)}]}).catch(function(){ zoomCap=false; numerique=2; video.style.transform="scale(2)"; });
    } else { numerique=2; video.style.transform="scale(2)"; }
  }
  function majZoom(){
    zoom.textContent="";
    if(face!=="environment"){ zoom.hidden=true; return; }
    var L=[]; if(CAMS.ultra) L.push("0.5"); L.push("1"); L.push("2");
    L.forEach(function(k){
      var b=bouton(k===objectif ? "on" : "", "Objectif "+k.replace(".",",")); b.textContent = k===objectif ? k.replace(".",",")+"×" : k.replace(".",",");
      b.addEventListener("click", function(){
        if(k===objectif || occupe) return;
        /* entre 1 et 2 sur la même caméra : on zoome sans couper l'image */
        var memeCamera = !CAMS.tele && k!=="0.5" && objectif!=="0.5";
        objectif=k; dire(k.replace(".",",")+"×");
        if(memeCamera){ appliquerZoom(); majZoom(); return; }
        demarrer().catch(function(){ objectif="1"; demarrer().catch(echec); });
      });
      zoom.appendChild(b);
    });
    zoom.hidden=false;
  }
  /* le flash : la lampe du téléphone, quand le navigateur la laisse allumer */
  function flashDispo(){ return !!capacites().torch; }
  function lampe(on){
    if(!piste || !flashDispo()) return Promise.resolve();
    torche=!!on;
    return piste.applyConstraints({advanced:[{torch:!!on}]}).catch(function(){});
  }
  function majFlash(){
    if(!flashDispo()){ fl.hidden=true; return; }
    fl.hidden=false;
    fl.classList.toggle("on", modeFlash==="oui"); fl.classList.toggle("lampe", modeFlash==="lampe");
    fl.innerHTML = modeFlash==="non" ? ICO_FLASH_NON : modeFlash==="oui" ? ICO_FLASH : ICO_LAMPE;
    fl.setAttribute("aria-label", modeFlash==="non" ? "Flash désactivé" : modeFlash==="oui" ? "Flash activé" : "Lampe allumée");
  }
  fl.addEventListener("click", function(){
    modeFlash = modeFlash==="non" ? "oui" : modeFlash==="oui" ? "lampe" : "non";
    try{ localStorage.setItem("rafale:flash", modeFlash); }catch(e){}
    lampe(modeFlash==="lampe"); majFlash();
    dire(modeFlash==="non" ? "Flash désactivé" : modeFlash==="oui" ? "Flash activé" : "Lampe allumée");
  });

  function echec(){
    video.remove(); bas.remove(); zoom.remove(); compte.remove(); fl.remove();
    var m=el("div","rf-msg");
    m.appendChild(document.createTextNode("L'appareil photo du site n'est pas disponible (autorisation refusée, ou pas de caméra)."));
    var b=bouton("",""); b.textContent="Appareil photo du téléphone";
    b.addEventListener("click", function(){ fermer(false); champ.__rafaleSauter=true; try{ champ.click(); } finally { setTimeout(function(){ champ.__rafaleSauter=false; }, 0); } });
    m.appendChild(el("br")); m.appendChild(b); fond.appendChild(m);
  }
  function majCompte(){
    compte.textContent=photos.length+" photo"+(photos.length>1?"s":"");
    var der=photos[photos.length-1];
    if(der){ vign.style.backgroundImage="url('"+der.url+"')"; vign.classList.add("plein"); }
    else { vign.style.backgroundImage=""; vign.classList.remove("plein"); }
  }
  function cliche(){
    var w=video.videoWidth, h=video.videoHeight, sx=0, sy=0, sw=w, sh=h;
    if(numerique>1){ sw=Math.round(w/numerique); sh=Math.round(h/numerique); sx=Math.round((w-sw)/2); sy=Math.round((h-sh)/2); }
    var c=document.createElement("canvas"); c.width=sw; c.height=sh;
    c.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
  }
  function prendre(){
    if(!flux || !video.videoWidth || occupe || !revue.hidden) return;
    var avecFlash = modeFlash==="oui" && flashDispo() && !torche;
    occupe=true;
    (avecFlash ? lampe(true).then(function(){ return attendre(450); }) : Promise.resolve()).then(function(){
      var c=cliche();
      if(avecFlash) lampe(false);
      occupe=false;
      flash.style.transition="none"; flash.style.opacity="0.85"; void flash.offsetWidth; flash.style.transition="opacity .25s"; flash.style.opacity="0";
      try{ if(navigator.vibrate) navigator.vibrate(15); }catch(e){}
      c.toBlob(function(b){
        if(!b) return;
        var n=photos.length+1, d=new Date(), z=function(v){ return (v<10?"0":"")+v; };
        var nom="photo-"+d.getFullYear()+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes())+z(d.getSeconds())+"-"+n+".jpg";
        var f; try{ f=new File([b], nom, {type:"image/jpeg", lastModified:Date.now()}); }catch(e){ f=b; f.name=nom; }
        var u=""; try{ u=URL.createObjectURL(b); }catch(e){}
        photos.push({f:f, url:u});
        majCompte();
      }, "image/jpeg", 0.88);
    }, function(){ occupe=false; });
  }

  /* la revue : toucher la vignette montre les photos prises ; la corbeille en retire une */
  var vue=-1;
  function peindreRevue(){
    rtitre.textContent=photos.length+" photo"+(photos.length>1?"s":"");
    grille.textContent="";
    if(!photos.length){ var v=el("div","rf-vide"); v.textContent="Aucune photo pour l'instant."; grille.appendChild(v); return; }
    photos.forEach(function(p, i){
      var c=bouton("rf-case","Voir la photo "+(i+1)); c.style.backgroundImage="url('"+p.url+"')";
      var n=el("span","rf-num"); n.textContent=i+1; c.appendChild(n);
      var s=bouton("rf-suppr","Supprimer la photo "+(i+1), ICO_SUPPR);
      s.addEventListener("click", function(e){ e.stopPropagation(); supprimer(i); });
      c.appendChild(s);
      c.addEventListener("click", function(){ vue=i; gimg.src=p.url; grand.hidden=false; });
      grille.appendChild(c);
    });
  }
  function supprimer(i){
    var p=photos.splice(i,1)[0]; if(p && p.url){ try{ URL.revokeObjectURL(p.url); }catch(e){} }
    majCompte(); peindreRevue();
  }
  function ouvrirRevue(){ if(!photos.length) return; peindreRevue(); revue.hidden=false; }
  function fermerRevue(){ grand.hidden=true; revue.hidden=true; vue=-1; }
  vign.addEventListener("click", ouvrirRevue);
  retour.addEventListener("click", fermerRevue);
  gret.addEventListener("click", function(){ grand.hidden=true; vue=-1; });
  gsup.addEventListener("click", function(){ if(vue<0) return; var i=vue; grand.hidden=true; vue=-1; supprimer(i); if(!photos.length) fermerRevue(); });

  function fermer(rendre){
    if(fini) return; fini=true;
    lampe(false); arreterFlux(); fond.remove(); document.documentElement.style.overflow=avantOverflow;
    champ.__rafaleRepos=Date.now()+3000;
    var fichiers=photos.map(function(p){ return p.f; });
    setTimeout(function(){ photos.forEach(function(p){ try{ URL.revokeObjectURL(p.url); }catch(e){} }); }, 1000);
    if(rendre && fichiers.length) livrer(champ, fichiers);
    else champ.dispatchEvent(new Event("cancel"));
  }
  x.addEventListener("click", function(){ fermer(true); });
  dec.addEventListener("click", prendre);
  tour.addEventListener("click", function(){ if(occupe) return; face = face==="environment" ? "user" : "environment"; objectif="1"; demarrer().catch(function(){}); });
  document.addEventListener("keydown", function k(e){
    if(fini){ document.removeEventListener("keydown", k, true); return; }
    if(e.key==="Escape"){ e.preventDefault(); if(!grand.hidden){ grand.hidden=true; vue=-1; } else if(!revue.hidden) fermerRevue(); else fermer(true); }
    else if((e.key===" " || e.key==="Enter") && revue.hidden){ e.preventDefault(); prendre(); }
  }, true);
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
