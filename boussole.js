/* =====================================================================
   boussole.js — la boussole, ouverte depuis une page (relevé PV…)
   ---------------------------------------------------------------------
   La même que dans Outils, en fenêtre plein écran : le cadran suit le
   téléphone ou l'iPad, « Prendre cette orientation » renvoie le cap à la
   page (0 = nord, 90 = est, 180 = sud, 270 = ouest). Sur iPhone et iPad,
   l'accès aux capteurs se demande sur l'appui qui ouvre la boussole. Un
   ordinateur n'a pas de capteur : on le dit, et le cap se tape à la main.

   Boussole.ouvrir({titre, consigne, bouton, ok: function(cap){…}})
   Boussole.nom(cap)  -> « Sud-ouest »…
   ===================================================================== */
(function(){
  "use strict";
  if(window.Boussole) return;
  var POINTS=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSO","SO","OSO","O","ONO","NO","NNO"];
  var NOMS={N:"Nord",E:"Est",S:"Sud",O:"Ouest",NE:"Nord-est",SE:"Sud-est",SO:"Sud-ouest",NO:"Nord-ouest"};
  function nom(cap){ var p=POINTS[Math.round((((cap%360)+360)%360)/22.5)%16]; return NOMS[p]||p; }

  var css=document.createElement("style");
  css.setAttribute("data-theme-propre", "");     /* mêmes couleurs en clair et en sombre : theme.js n'y touche pas */
  css.textContent=
    ".bsl-fond{position:fixed;inset:0;z-index:9000;background:#0B1017;color:#E7ECF2;display:flex;flex-direction:column;align-items:center;overflow-y:auto}"
   +".bsl-barre{align-self:stretch;display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) 14px 10px}"
   +".bsl-barre b{flex:1;font-size:17px}"
   +".bsl-fond button{min-height:44px;padding:0 16px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:15px;font-weight:650;cursor:pointer}"
   +".bsl-fond button.ok{background:#EA580C;border-color:#EA580C}"
   +".bsl-fond button:disabled{opacity:.4;cursor:default}"
   +".bsl-consigne{max-width:520px;margin:0 18px 8px;text-align:center;color:#AEB8C4;font-size:14.5px;line-height:1.45}"
   +".bsl-cadre{position:relative;width:min(78vw,52vh,360px);aspect-ratio:1;margin:8px 0 10px}"
   +".bsl-cadre::before{content:'';position:absolute;left:50%;top:-12px;margin-left:-9px;border:9px solid transparent;border-top:14px solid #FB923C;z-index:2}"
   +".bsl-cadran{position:absolute;inset:0;will-change:transform}"
   +".bsl-cadran svg{width:100%;height:100%;display:block}"
   +".bsl-cap{font-size:44px;font-weight:800;letter-spacing:-.02em;line-height:1}"
   +".bsl-dir{font-size:15px;font-weight:700;letter-spacing:.12em;color:#FB923C;margin:4px 0 12px}"
   +".bsl-etat{max-width:520px;margin:0 18px 12px;text-align:center;color:#AEB8C4;font-size:13.5px}"
   +".bsl-main{display:flex;gap:8px;align-items:center;margin:0 0 12px;color:#AEB8C4;font-size:14.5px}"
   +".bsl-main input{width:110px;min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:#111A25;color:#fff;font:inherit;font-size:17px;text-align:center}"
   +".bsl-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;padding:0 14px calc(18px + env(safe-area-inset-bottom,0px))}";
  (document.head||document.documentElement).appendChild(css);

  function cadranSvg(){
    var s='<svg viewBox="0 0 200 200" aria-hidden="true">'
      +'<circle cx="100" cy="100" r="96" fill="#10161F" stroke="rgba(255,255,255,.16)" stroke-width="1.5"/>';
    for(var d=0; d<360; d+=5){
      var long=d%30===0, r1=long ? 80 : 86, a=(d-90)*Math.PI/180;
      s+='<line x1="'+(100+r1*Math.cos(a)).toFixed(2)+'" y1="'+(100+r1*Math.sin(a)).toFixed(2)+'" x2="'+(100+92*Math.cos(a)).toFixed(2)+'" y2="'+(100+92*Math.sin(a)).toFixed(2)
        +'" stroke="'+(long?"rgba(255,255,255,.7)":"rgba(255,255,255,.28)")+'" stroke-width="'+(long?1.6:1)+'"/>';
      if(long && d%90!==0){
        var at=(d-90)*Math.PI/180, tx=(100+66*Math.cos(at)).toFixed(2), ty=(100+66*Math.sin(at)).toFixed(2);
        s+='<text x="'+tx+'" y="'+(+ty+3).toFixed(2)+'" text-anchor="middle" font-size="9" fill="#8A97A6" transform="rotate('+d+' '+tx+' '+ty+')">'+d+'</text>';
      }
    }
    [["N",0,"#FB923C"],["E",90,"#E7ECF2"],["S",180,"#E7ECF2"],["O",270,"#E7ECF2"]].forEach(function(c){
      var a=(c[1]-90)*Math.PI/180, x=(100+66*Math.cos(a)).toFixed(2), y0=(100+66*Math.sin(a)).toFixed(2);
      s+='<text x="'+x+'" y="'+(+y0+6).toFixed(2)+'" text-anchor="middle" font-size="18" font-weight="700" fill="'+c[2]+'" transform="rotate('+c[1]+' '+x+' '+y0+')">'+c[0]+'</text>';
    });
    return s+'<path d="M100 44 L108 100 L100 96 L92 100 Z" fill="#FB923C"/><path d="M100 156 L108 100 L100 104 L92 100 Z" fill="#8A97A6"/><circle cx="100" cy="100" r="5" fill="#E7ECF2"/></svg>';
  }
  function angleEcran(){
    var o=(screen.orientation && typeof screen.orientation.angle==="number") ? screen.orientation.angle : (typeof window.orientation==="number" ? window.orientation : 0);
    return o||0;
  }
  function el(t, c, txt){ var e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; }

  function ouvrir(o){
    o=o||{};
    var CAP=null, AFF=null, ROT=0, ABS=false, vu=false, fige=null, fini=false, raf=0;
    var fond=el("div","bsl-fond"); fond.setAttribute("role","dialog"); fond.setAttribute("aria-modal","true"); fond.setAttribute("aria-label", o.titre||"Boussole");
    var barre=el("div","bsl-barre"); barre.appendChild(el("b","",o.titre||"Boussole"));
    var bX=el("button","","Fermer"); bX.type="button"; barre.appendChild(bX);
    fond.appendChild(barre);
    if(o.consigne) fond.appendChild(el("p","bsl-consigne",o.consigne));
    var cadre=el("div","bsl-cadre"), cadran=el("div","bsl-cadran"); cadran.innerHTML=cadranSvg(); cadre.appendChild(cadran);
    fond.appendChild(cadre);
    var capT=el("div","bsl-cap","—"), dirT=el("div","bsl-dir","");
    fond.appendChild(capT); fond.appendChild(dirT);
    var etat=el("p","bsl-etat","Recherche du nord…"); etat.setAttribute("role","status");
    fond.appendChild(etat);
    var main=el("label","bsl-main"); main.appendChild(el("span","","Ou tapez le cap :"));
    var inp=el("input"); inp.type="number"; inp.min="0"; inp.max="359"; inp.inputMode="numeric"; inp.placeholder="°"; inp.setAttribute("aria-label","Cap en degrés, 0 = nord");
    main.appendChild(inp); main.appendChild(el("span","","°")); main.hidden=true;
    fond.appendChild(main);
    var act=el("div","bsl-actions");
    var bFige=el("button","","Figer"); bFige.type="button"; bFige.disabled=true;
    var bOk=el("button","ok",o.bouton||"Prendre cette orientation"); bOk.type="button"; bOk.disabled=true;
    act.appendChild(bFige); act.appendChild(bOk); fond.appendChild(act);
    document.body.appendChild(fond);
    var avant=document.activeElement;

    function surOrientation(e, absolue){
      if(!absolue && ABS && typeof e.webkitCompassHeading!=="number") return;
      var cap=null;
      if(typeof e.webkitCompassHeading==="number" && !isNaN(e.webkitCompassHeading)) cap=e.webkitCompassHeading;
      else if((absolue || e.absolute) && typeof e.alpha==="number") cap=360-e.alpha;
      if(cap===null) return;
      if(typeof e.webkitCompassHeading!=="number") cap+=angleEcran();
      CAP=((cap%360)+360)%360;
      if(!vu){ vu=true; etat.textContent="Éloignez l'appareil des masses métalliques et des tableaux électriques : ils faussent la mesure."; bFige.disabled=false; bOk.disabled=false; }
    }
    function surAbs(e){ ABS=true; surOrientation(e, true); }
    function surRel(e){ surOrientation(e, false); }
    function sansCapteur(msg){
      if(vu) return;
      etat.textContent=msg||"Cet appareil ne donne pas son orientation (un ordinateur n'a pas de boussole). Tapez le cap mesuré ailleurs, ou ouvrez cette page sur le téléphone ou l'iPad.";
      main.hidden=false;
    }
    function brancher(){
      window.addEventListener("deviceorientationabsolute", surAbs, true);
      window.addEventListener("deviceorientation", surRel, true);
      setTimeout(function(){ if(!fini) sansCapteur(); }, 2500);
    }
    var D=window.DeviceOrientationEvent;
    if(!D) sansCapteur();
    else if(typeof D.requestPermission==="function"){
      /* iPhone, iPad : sur l'appui qui a ouvert la boussole */
      D.requestPermission().then(function(r){ if(r==="granted") brancher(); else sansCapteur("Accès refusé à l'orientation. Autorisez « Mouvement et orientation » dans les réglages de Safari, ou tapez le cap."); })
        .catch(function(){ sansCapteur("Touchez « Activer » pour autoriser la boussole, ou tapez le cap."); montrerActiver(); });
    } else brancher();
    function montrerActiver(){
      var b=el("button","","Activer la boussole"); b.type="button";
      b.addEventListener("click", function(){ D.requestPermission().then(function(r){ if(r==="granted"){ b.remove(); main.hidden=true; etat.textContent="Recherche du nord…"; brancher(); } }).catch(function(){}); });
      act.insertBefore(b, act.firstChild);
    }
    inp.addEventListener("input", function(){
      var v=parseFloat(inp.value);
      if(isFinite(v)){ CAP=((v%360)+360)%360; AFF=CAP; bOk.disabled=false; } else if(!vu) bOk.disabled=true;
    });
    function capActuel(){ return fige!==null ? fige : (AFF!==null ? AFF : CAP); }
    (function anime(){
      if(fini) return;
      if(CAP!==null && fige===null){
        if(AFF===null) AFF=CAP;
        var d=((CAP-AFF+540)%360)-180;
        AFF=(AFF+d*0.18+360)%360;
      }
      var c=capActuel();
      if(c!==null){
        var cible=-c, delta=((cible-ROT)%360+540)%360-180; ROT+=delta;
        cadran.style.transform="rotate("+ROT.toFixed(2)+"deg)";
        capT.textContent=Math.round(c)%360+"°"; dirT.textContent=nom(c).toUpperCase();
      }
      raf=requestAnimationFrame(anime);
    })();
    bFige.addEventListener("click", function(){
      if(fige===null){ fige=capActuel(); bFige.textContent="Reprendre"; }
      else { fige=null; bFige.textContent="Figer"; }
    });
    function fermer(){
      fini=true; cancelAnimationFrame(raf);
      window.removeEventListener("deviceorientationabsolute", surAbs, true);
      window.removeEventListener("deviceorientation", surRel, true);
      document.removeEventListener("keydown", clavier, true);
      fond.remove(); if(avant && avant.focus) try{ avant.focus(); }catch(x){}
    }
    function clavier(e){ if(e.key==="Escape"){ e.preventDefault(); fermer(); } }
    document.addEventListener("keydown", clavier, true);
    bX.addEventListener("click", fermer);
    bOk.addEventListener("click", function(){
      var c=capActuel(); if(c===null) return;
      c=Math.round(c)%360; fermer(); if(o.ok) o.ok(c);
    });
    bX.focus();
    /* pour les essais : un cap comme s'il venait du capteur */
    var inst={ fermer: fermer, _cap: function(c){ surOrientation({webkitCompassHeading:c}, true); } };
    window.Boussole._derniere=inst;
    return inst;
  }
  window.Boussole={ouvrir:ouvrir, nom:nom};
})();
