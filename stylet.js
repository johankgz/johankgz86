/* =====================================================================
   stylet.js — une note écrite à la main (Apple Pencil, doigt, souris)
   ---------------------------------------------------------------------
   Plutôt que le clavier de l'iPad : une page lignée plein écran, on écrit
   au stylet, et la note devient une image posée dans la ligne (travaux
   supplémentaires, reste à faire, points bloquants…).
   - le trait suit la pression du stylet ;
   - dès que le stylet a touché la page, le doigt et la paume ne tracent
     plus (on peut poser la main) ; deux doigts font défiler ;
   - « Annuler » retire le dernier trait, « Effacer » vide la page ;
   - à la validation, l'écriture est recadrée et gardée en PNG léger.

   Stylet.ouvrir({titre, texte, ok: function(encre){…}})
     encre = {src: "data:image/png;base64,…", l: largeur, h: hauteur}
   Stylet.image(encre)  -> <img> prête à poser
   ===================================================================== */
(function(){
  "use strict";
  if(window.Stylet) return;
  var COULEURS=[["#1E3A8A","Bleu"],["#111827","Noir"],["#B91C1C","Rouge"]];
  var MAX_L=900;
  /* la couleur en trichromie et la taille du crayon : teinte.js, à côté de ce fichier */
  (function(){
    if(window.Teinte) return;
    try{
      var moi=document.currentScript && document.currentScript.src, sc=document.createElement("script");
      sc.src=(moi ? moi.replace(/stylet\.js(\?.*)?$/, "teinte.js") : "./teinte.js")+"?v=20261007e";
      (document.head||document.documentElement).appendChild(sc);
    }catch(e){}
  })();
  var PREF="stylet:crayon";
  function lirePref(){ try{ var x=JSON.parse(localStorage.getItem(PREF)||"null"); if(x && /^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(x.c) && x.t>0) return x; }catch(e){} return null; }

  var css=document.createElement("style");
  css.setAttribute("data-theme-propre", "");     /* mêmes couleurs en clair et en sombre : theme.js n'y touche pas */
  css.textContent=
    ".sty-fond{position:fixed;inset:0;z-index:9000;background:rgba(10,14,20,.6);display:flex;flex-direction:column;"
     /* rien ne se sélectionne, rien ne défile : sur iPad, le crayon ne doit qu'écrire */
   +"-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none;overscroll-behavior:none}"
   +"html.sty-ouvert,html.sty-ouvert body{overflow:hidden!important;overscroll-behavior:none}"
   +".sty-barre{display:flex;align-items:center;gap:8px;padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:#1F2937;color:#fff;flex-wrap:wrap;touch-action:manipulation}"
   +".sty-barre b{flex:1 1 160px;font-size:16px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"
   +".sty-barre button{min-height:42px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}"
   +".sty-barre button.ok{background:#16A34A;border-color:#16A34A}"
   +".sty-barre button:disabled{opacity:.4;cursor:default}"
   +".sty-coul{display:inline-flex;gap:6px;margin:0 4px}"
   +".sty-coul button{width:34px;min-height:34px;height:34px;padding:0;border-radius:50%;border:3px solid transparent}"
   +".sty-coul button[aria-pressed=true]{border-color:#fff}"
   +".sty-page{flex:1;position:relative;background:#fff;touch-action:none;overflow:hidden}"
   +".sty-page canvas{position:absolute;inset:0;width:100%;height:100%;display:block}"
   +".sty-page canvas{z-index:1}.sty-page canvas.sty-dessous{z-index:0;pointer-events:none}"
   +".sty-aide{position:absolute;left:0;right:0;top:40%;text-align:center;color:#9CA3AF;font-size:17px;pointer-events:none}"
   +"img.sty-encre{display:block;max-width:100%;max-height:150px;background:#fff;border-radius:8px;border:1px solid rgba(15,23,42,.12);padding:4px;cursor:pointer}";
  (document.head||document.documentElement).appendChild(css);

  function el(t, c, txt){ var e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; }
  function bouton(t, f, cls){ var b=el("button", cls||"", t); b.type="button"; b.addEventListener("click", f); return b; }

  function ouvrir(o){
    o=o||{};
    var pref=lirePref();
    var traits=[], courant=null, couleur=pref ? pref.c : COULEURS[0][0], tailleCrayon=pref ? pref.t : 2.6, stylo=false, dpr=Math.min(window.devicePixelRatio||1, 2);
    var fond=el("div","sty-fond"); fond.setAttribute("role","dialog"); fond.setAttribute("aria-modal","true");
    fond.setAttribute("aria-label", o.titre||"Note manuscrite");
    var barre=el("div","sty-barre");
    barre.appendChild(el("b","",o.titre||"Note manuscrite"));
    var coul=el("span","sty-coul"); coul.setAttribute("role","group"); coul.setAttribute("aria-label","Couleur");
    function marquer(){ Array.prototype.forEach.call(coul.querySelectorAll("button:not(.tn-pastille)"), function(x){ x.setAttribute("aria-pressed", x.dataset.c===couleur ? "true" : "false"); }); if(tn) tn.firstChild.style.background=couleur; }
    function retenir(){ try{ localStorage.setItem(PREF, JSON.stringify({c:couleur, t:tailleCrayon})); }catch(e){} }
    COULEURS.forEach(function(c){
      var b=bouton("", function(){ couleur=c[0]; marquer(); retenir(); });
      b.style.background=c[0]; b.dataset.c=c[0]; b.setAttribute("aria-label", c[1]);
      coul.appendChild(b);
    });
    /* toute couleur (trichromie) et la taille du crayon */
    var tn=window.Teinte ? window.Teinte.pastille(couleur) : null;
    if(tn){
      tn.addEventListener("click", function(){
        window.Teinte.ouvrir({ancre:tn, couleur:couleur, taille:tailleCrayon, tailles:[1.5, 2.6, 4, 6, 9], titreTaille:"Épaisseur du crayon",
          change:function(c, t){ couleur=c; tailleCrayon=t; marquer(); retenir(); }});
      });
      coul.appendChild(tn);
    }
    marquer();
    barre.appendChild(coul);
    var bAnnuler=bouton("Annuler le trait", function(){ traits.pop(); peindre(); maj(); });
    var bEffacer=bouton("Effacer", function(){ traits=[]; peindre(); maj(); });
    var bFermer=bouton("Fermer", function(){
      if(traits.length && !window.confirm("Fermer sans garder la note ?")) return;
      fermer();
    });
    var bOk=bouton("Ajouter", valider, "ok");
    if(o.bouton) bOk.textContent=o.bouton;
    barre.appendChild(bAnnuler); barre.appendChild(bEffacer); barre.appendChild(bFermer); barre.appendChild(bOk);
    /* deux calques : dessous, les lignes et l'écriture déjà faite (peinte une fois) ;
       dessus, le seul trait en cours, redessiné une fois par image : le trait suit le crayon */
    var page=el("div","sty-page"), cvF=el("canvas"), cv=el("canvas"), aide=el("p","sty-aide","Écrivez ici avec le stylet (ou le doigt)");
    cvF.className="sty-dessous"; page.appendChild(cv); page.appendChild(cvF); page.appendChild(aide);
    fond.appendChild(barre); fond.appendChild(page);
    document.body.appendChild(fond);
    var ctx=cv.getContext("2d"), ctxF=cvF.getContext("2d");
    var avant=document.activeElement;
    /* la page derrière ne bouge plus tant que la fenêtre est ouverte */
    document.documentElement.classList.add("sty-ouvert");
    function bloquer(e){ if(e.cancelable) e.preventDefault(); }
    /* iOS : sans cela, un appui du crayon lance la sélection de texte ou la loupe, et la page glisse */
    page.addEventListener("touchstart", bloquer, {passive:false});
    page.addEventListener("touchmove", bloquer, {passive:false});
    fond.addEventListener("touchmove", bloquer, {passive:false});
    fond.addEventListener("selectstart", bloquer);
    fond.addEventListener("contextmenu", bloquer);
    fond.addEventListener("dblclick", bloquer);

    function taille(){
      var r=page.getBoundingClientRect();
      cv.width=cvF.width=Math.round(r.width*dpr); cv.height=cvF.height=Math.round(r.height*dpr);
      peindre();
    }
    function lignes(){
      ctxF.save(); ctxF.strokeStyle="#DBEAFE"; ctxF.lineWidth=1*dpr;
      for(var y=56; y<cvF.height/dpr; y+=44){ ctxF.beginPath(); ctxF.moveTo(0, y*dpr); ctxF.lineTo(cvF.width, y*dpr); ctxF.stroke(); }
      ctxF.restore();
    }
    function tracer(c, t, k, dx, dy){
      var p=t.pts; if(!p.length) return;
      c.strokeStyle=t.c; c.fillStyle=t.c; c.lineCap="round"; c.lineJoin="round";
      /* une couleur transparente : le trait d'un seul tenant (sinon, les morceaux se superposent en perles) */
      if(/^#[0-9a-f]{8}$/i.test(t.c) && p.length>1){
        var moy=p.reduce(function(s, q){ return s+q.w; }, 0)/p.length;
        c.save(); c.lineWidth=Math.max(0.8, moy*k); c.beginPath(); c.moveTo((p[0].x-dx)*k, (p[0].y-dy)*k);
        for(var j=1;j<p.length;j++) c.lineTo((p[j].x-dx)*k, (p[j].y-dy)*k);
        c.stroke(); c.restore(); return;
      }
      if(p.length===1){ c.beginPath(); c.arc((p[0].x-dx)*k, (p[0].y-dy)*k, Math.max(1, p[0].w*k/2), 0, Math.PI*2); c.fill(); return; }
      /* du milieu au milieu, en passant par chaque point : un trait lisse */
      var s0={x:p[0].x, y:p[0].y};
      for(var i=1;i<p.length;i++){
        var b=p[i], e=i<p.length-1 ? {x:(b.x+p[i+1].x)/2, y:(b.y+p[i+1].y)/2} : b;
        c.lineWidth=Math.max(0.8, (p[i-1].w+b.w)/2*k);
        c.beginPath(); c.moveTo((s0.x-dx)*k, (s0.y-dy)*k);
        c.quadraticCurveTo((b.x-dx)*k, (b.y-dy)*k, (e.x-dx)*k, (e.y-dy)*k);
        c.stroke(); s0=e;
      }
    }
    /* tout repeindre : seulement à l'ouverture, au redimensionnement, Annuler et Effacer */
    function peindre(){
      ctxF.setTransform(1,0,0,1,0,0); ctxF.clearRect(0,0,cvF.width,cvF.height);
      lignes();
      traits.forEach(function(t){ tracer(ctxF, t, dpr, 0, 0); });
      peindreCourant();
    }
    function peindreCourant(){
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height);
      if(courant) tracer(ctx, courant, dpr, 0, 0);
    }
    var image_=0;
    function bientot(){ if(!image_) image_=requestAnimationFrame(function(){ image_=0; peindreCourant(); }); }
    function maj(){ bAnnuler.disabled=bEffacer.disabled=bOk.disabled=!traits.length; aide.hidden=!!traits.length || !!courant; }
    function pos(e){ var r=cv.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
    /* la taille choisie, et la pression du stylet en plus : appuyer épaissit */
    function epaisseur(e){
      if(e.pointerType==="pen"){ var p=e.pressure||0.5; return tailleCrayon*(0.45+p*1.1); }
      return tailleCrayon;
    }
    var actif=null;
    cv.addEventListener("pointerdown", function(e){
      if(e.pointerType==="pen") stylo=true;
      else if(stylo && e.pointerType==="touch") return;           /* la main posée sur la page */
      if(actif!==null) return;
      actif=e.pointerId; try{ cv.setPointerCapture(e.pointerId); }catch(x){}
      var p=pos(e); courant={c:couleur, pts:[{x:p.x, y:p.y, w:epaisseur(e)}]};
      aide.hidden=true; peindreCourant(); e.preventDefault();
    });
    cv.addEventListener("pointermove", function(e){
      if(e.pointerId!==actif || !courant) return;
      var evs=e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if(!evs.length) evs=[e];
      evs.forEach(function(ev){
        var p=pos(ev), d=courant.pts[courant.pts.length-1];
        if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y) < 0.8) return;
        courant.pts.push({x:p.x, y:p.y, w:epaisseur(ev)});
      });
      bientot(); e.preventDefault();
    });
    function fin(e){
      if(e.pointerId!==actif) return;
      actif=null;
      var t=courant; courant=null;
      if(image_){ cancelAnimationFrame(image_); image_=0; }
      /* le trait fini passe sur le calque du dessous, une fois pour toutes */
      if(t && t.pts.length){ traits.push(t); tracer(ctxF, t, dpr, 0, 0); }
      peindreCourant(); maj();
    }
    cv.addEventListener("pointerup", fin);
    cv.addEventListener("pointercancel", fin);

    function valider(){
      if(!traits.length) return;
      var x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
      traits.forEach(function(t){ t.pts.forEach(function(p){ x0=Math.min(x0,p.x-p.w); y0=Math.min(y0,p.y-p.w); x1=Math.max(x1,p.x+p.w); y1=Math.max(y1,p.y+p.w); }); });
      var marge=10; x0-=marge; y0-=marge; x1+=marge; y1+=marge;
      var l=x1-x0, h=y1-y0, k=Math.min(2, MAX_L/l);
      var c=document.createElement("canvas"); c.width=Math.max(1, Math.round(l*k)); c.height=Math.max(1, Math.round(h*k));
      var g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height);
      traits.forEach(function(t){ tracer(g, t, k, x0, y0); });
      var encre={src:c.toDataURL("image/png"), l:c.width, h:c.height};
      fermer();
      if(o.ok) o.ok(encre);
    }
    function clavier(e){ if(e.key==="Escape"){ e.preventDefault(); bFermer.click(); } if((e.ctrlKey||e.metaKey) && e.key==="z"){ e.preventDefault(); bAnnuler.click(); } }
    function fermer(){
      window.removeEventListener("resize", taille); document.removeEventListener("keydown", clavier, true);
      if(image_){ cancelAnimationFrame(image_); image_=0; }
      fond.remove(); if(!document.querySelector(".sty-fond")) document.documentElement.classList.remove("sty-ouvert");
      if(avant && avant.focus) try{ avant.focus({preventScroll:true}); }catch(x){}
    }
    window.addEventListener("resize", taille);
    document.addEventListener("keydown", clavier, true);
    fond.tabIndex=-1; taille(); maj(); try{ fond.focus({preventScroll:true}); }catch(x){}
    var inst={ fermer: fermer, _traits: function(){ return traits; }, _crayon: function(){ return {couleur:couleur, taille:tailleCrayon}; } };
    window.Stylet._dernier=inst;
    return inst;
  }
  function image(encre, alt){
    var im=el("img","sty-encre"); im.src=encre.src; im.alt=alt||"Note manuscrite";
    if(encre.l && encre.h){ im.width=encre.l; im.height=encre.h; im.style.width=Math.min(encre.l/2, 600)+"px"; im.style.height="auto"; }
    return im;
  }
  /* une note manuscrite reçue d'ailleurs (fiche, serveur) : seulement une image PNG en data: */
  function valide(e){ return !!(e && typeof e.src==="string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(e.src) && e.src.length < 400000); }
  window.Stylet={ouvrir:ouvrir, image:image, valide:valide};
})();
