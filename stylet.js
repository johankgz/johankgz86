/* =====================================================================
   stylet.js — une note écrite à la main (Apple Pencil, doigt, souris)
   ---------------------------------------------------------------------
   Plutôt que le clavier de l'iPad : une page lignée plein écran, on écrit
   au stylet, et la note devient une image posée dans la ligne (travaux
   supplémentaires, reste à faire, points bloquants…).
   - le trait suit la pression du stylet (lissée : pas de grumeaux), et colle à la pointe :
     à chaque image, seuls ses nouveaux morceaux sont dessinés, si long soit-il ;
   - dès que le stylet a touché la page, le doigt et la paume ne tracent
     plus (on peut poser la main) ; deux doigts font défiler ;
   - les mêmes outils que les Notes (mesnotes.html) : stylo,
     feutre, surligneur, formes (trait, rectangle, nuage, flèche, spline,
     cercle), gomme en trois tailles, les mêmes couleurs, et les réglages
     partagés avec elle (le dernier outil, sa couleur, sa taille) ;
   - « Annuler le trait » revient en arrière, « Effacer » vide la page ;
   - à la validation, l'écriture est recadrée et gardée en PNG léger.

   Stylet.ouvrir({titre, texte, ok: function(encre){…}})
     encre = {src: "data:image/png;base64,…", l: largeur, h: hauteur}
   Stylet.image(encre)  -> <img> prête à poser
   ===================================================================== */
(function(){
  "use strict";
  if(window.Stylet) return;
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
   +".sty-barre button{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}"
   +".sty-barre button.ok{background:#16A34A;border-color:#16A34A}"
   +".sty-barre button:disabled{opacity:.4;cursor:default}"
   +".sty-coul{display:inline-flex;gap:6px;margin:0 4px}"
   +".sty-coul button{width:34px;min-height:34px;height:34px;padding:0;border-radius:50%;border:3px solid transparent}"
   +".sty-coul button[aria-pressed=true]{border-color:#fff}"
   +".sty-page{flex:1;position:relative;background:#fff;touch-action:none;overflow:hidden}"
   +".sty-page canvas{position:absolute;inset:0;width:100%;height:100%;display:block}"
   +".sty-page canvas{z-index:1}.sty-page canvas.sty-dessous{z-index:0;pointer-events:none}.sty-page canvas.sty-bout{z-index:2;pointer-events:none}"
   +".sty-aide{position:absolute;left:0;right:0;top:40%;text-align:center;color:#9CA3AF;font-size:17px;pointer-events:none}"
   +".sty-outils{display:inline-flex;gap:2px;margin:0 2px;flex-wrap:wrap}"
   +".sty-outils button{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-width:52px;min-height:46px;padding:2px 4px;border-radius:10px;border:0;background:none;color:#fff;font-size:10.5px;font-weight:600}"
   +".sty-outils button[aria-pressed=true]{background:rgba(255,255,255,.18)}"
   +".sty-outils svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}"
   +".sty-sous{display:flex;gap:4px;flex-wrap:wrap;justify-content:center;padding:6px 10px;background:#273444;touch-action:manipulation}"
   +".sty-sous[hidden]{display:none}"
   +".sty-sous button{display:inline-flex;flex-direction:column;align-items:center;gap:2px;min-width:58px;min-height:48px;padding:4px 6px;border:0;border-radius:10px;background:none;color:#fff;font:inherit;font-size:10.5px;cursor:pointer}"
   +".sty-sous button[aria-pressed=true]{background:#F4F1EA;color:#22201C}"
   +".sty-sous svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}"
   +".sty-sous button[data-gomme] svg{fill:rgba(244,241,234,.25)}"
   +"img.sty-encre{display:block;max-width:100%;max-height:150px;background:#fff;border-radius:8px;border:1px solid rgba(15,23,42,.12);padding:4px;cursor:pointer}";
  (document.head||document.documentElement).appendChild(css);

  function el(t, c, txt){ var e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; }
  /* Apple Pencil : sur iPad, un toucher de bouton où la pointe glisse d'un rien ne donne pas de « click »
     (au doigt, si). On le fait donc nous-mêmes : posé puis levé sur le même bouton, au crayon, le bouton
     est actionné ; le « click » du système, s'il arrive quand même dans l'instant, est ignoré. */
  function toucherCrayon(racine){
    var vise=null, ignorer=null, jusqua=0;
    racine.addEventListener("pointerdown", function(e){
      vise=null;
      if(e.pointerType!=="pen" || !e.target || !e.target.closest) return;
      var b=e.target.closest("button"); if(b && !b.disabled && racine.contains(b)) vise=b;
    }, true);
    racine.addEventListener("pointerup", function(e){
      if(e.pointerType!=="pen" || !vise) return;
      var b=vise, r=b.getBoundingClientRect(); vise=null;
      if(e.clientX<r.left-10 || e.clientX>r.right+10 || e.clientY<r.top-10 || e.clientY>r.bottom+10) return;
      ignorer=b; jusqua=Date.now()+700;
      b.click();
    }, true);
    racine.addEventListener("click", function(e){
      if(!e.isTrusted || !ignorer || Date.now()>jusqua) return;
      e.stopPropagation(); e.preventDefault();   /* le bouton a pu être redessiné : tout « click » du système dans l'instant est le doublon */
      ignorer=null;
    }, true);
  }
  function bouton(t, f, cls){ var b=el("button", cls||"", t); b.type="button"; b.addEventListener("click", f); return b; }

  /* ---------- les outils, comme dans les Notes ---------- */
  var COULEURS=[["#1E3A8A","Bleu"],["#22201C","Noir"],["#B91C1C","Rouge"],["#15803D","Vert"]];
  var OUTILS=[["stylo","Stylo",'<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="m14 6 3 3"/>'],
    ["feutre","Feutre",'<path d="M6 21h12"/><path d="M8 17l2-9h4l2 9z"/><path d="M10 8V4h4v4"/>'],
    ["surligneur","Surligneur",'<path d="M4 21h9"/><path d="m6 17 3-7 7-7 4 4-7 7z"/><path d="m9 10 5 5"/>'],
    ["formes","Formes",'<rect x="3.5" y="11" width="8" height="8" rx="1"/><circle cx="16" cy="8" r="4.5"/>'],
    ["gomme","Gomme",'<path d="M8 20h11"/><path d="m4.5 14.5 8-8 6 6-6.5 6.5H9z"/><path d="m9.5 9.5 6 6"/>']];
  var FORMES=[["ligne","Trait",'<path d="M4 20 20 4"/>'],["rect","Rectangle",'<rect x="4" y="6" width="16" height="12" rx="1"/>'],
    ["nuage","Nuage",'<path d="M6 17a3 3 0 0 1 0-6 4 4 0 0 1 7-3 3.5 3.5 0 0 1 5 3 3 3 0 0 1 0 6z"/>'],["fleche","Flèche",'<path d="M4 20 19 5"/><path d="M11 5h8v8"/>'],
    ["spline","Spline",'<path d="M3 17c4-10 7 4 10-4s5-5 8-6"/>'],["cercle","Cercle",'<circle cx="12" cy="12" r="8"/>']];
  var GOMMES=[["petite","Petite",8],["moyenne","Moyenne",16],["grande","Grande",34]];
  /* les réglages du crayon : les mêmes que les Notes */
  var PREF_NOTES="mesnotes:crayon";
  function lireNotes(){
    var m={outil:"stylo", couleur:null, surl:"#EAB308", k:{stylo:1, feutre:1, surligneur:1, forme:1}, forme:"ligne", gomme:"moyenne"};
    try{
      var x=JSON.parse(localStorage.getItem(PREF_NOTES)||"null");
      if(x){
        if(/^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(x.couleur)) m.couleur=x.couleur;
        if(/^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(x.surl)) m.surl=x.surl;
        if(x.k) ["stylo","feutre","surligneur","forme"].forEach(function(o){ var v=+x.k[o]; if(v>=.2 && v<=6) m.k[o]=v; });
        if(FORMES.some(function(f){ return f[0]===x.forme; })) m.forme=x.forme;
        if(GOMMES.some(function(g){ return g[0]===x.gomme; })) m.gomme=x.gomme;
        if(OUTILS.some(function(o){ return o[0]===x.outil; })) m.outil=x.outil;
      }
    }catch(e){}
    return m;
  }
  function garderNotes(m){
    try{
      var x=JSON.parse(localStorage.getItem(PREF_NOTES)||"null")||{};
      x.couleur=m.couleur; x.surl=m.surl; x.k=m.k; x.forme=m.forme; x.gomme=m.gomme; x.outil=m.outil;
      localStorage.setItem(PREF_NOTES, JSON.stringify(x));
    }catch(e){}
  }
  function alpha(h){ return /^#[0-9a-f]{8}$/i.test(h||"") ? parseInt(h.slice(7,9),16)/255 : 1; }
  function distSeg(q, a, b){
    var dx=b.x-a.x, dy=b.y-a.y, l=dx*dx+dy*dy, u=l ? Math.max(0, Math.min(1, ((q.x-a.x)*dx+(q.y-a.y)*dy)/l)) : 0;
    return Math.hypot(q.x-(a.x+u*dx), q.y-(a.y+u*dy));
  }
  function simplifier(pts, eps){
    if(pts.length<3) return pts;
    var a=pts[0], b=pts[pts.length-1], m=0, iM=0;
    for(var i=1;i<pts.length-1;i++){ var d=distSeg(pts[i], a, b); if(d>m){ m=d; iM=i; } }
    if(m<=eps) return [a, b];
    return simplifier(pts.slice(0, iM+1), eps).slice(0,-1).concat(simplifier(pts.slice(iM), eps));
  }
  /* le contour d'une forme : des lignes brisées */
  function contour(t){
    var p=t.pts, a=p[0], b=p[p.length-1], x0=Math.min(a.x,b.x), x1=Math.max(a.x,b.x), y0=Math.min(a.y,b.y), y1=Math.max(a.y,b.y), i, P=function(x, y){ return {x:x, y:y}; };
    if(t.f==="ligne") return [[a,b]];
    if(t.f==="fleche"){
      var an=Math.atan2(b.y-a.y, b.x-a.x), L=Math.max(12, (t.w||3)*3.4);
      return [[a,b],[P(b.x-L*Math.cos(an-.45), b.y-L*Math.sin(an-.45)), b, P(b.x-L*Math.cos(an+.45), b.y-L*Math.sin(an+.45))]];
    }
    if(t.f==="rect") return [[P(x0,y0),P(x1,y0),P(x1,y1),P(x0,y1),P(x0,y0)]];
    if(t.f==="cercle"){
      var cx=(x0+x1)/2, cy=(y0+y1)/2, rx=(x1-x0)/2, ry=(y1-y0)/2, e=[];
      for(i=0;i<=72;i++){ var th=i/72*Math.PI*2; e.push(P(cx+rx*Math.cos(th), cy+ry*Math.sin(th))); }
      return [e];
    }
    if(t.f==="nuage"){
      /* le nuage de reprise : des arcs bombés vers l'extérieur, tout autour du cadre */
      var arc=Math.max(8, Math.min(40, Math.min(x1-x0, y1-y0)/3)), out=[];
      [[P(x0,y0),P(x1,y0),[0,-1]],[P(x1,y0),P(x1,y1),[1,0]],[P(x1,y1),P(x0,y1),[0,1]],[P(x0,y1),P(x0,y0),[-1,0]]].forEach(function(c){
        var A=c[0], B=c[1], n=c[2], len=Math.hypot(B.x-A.x, B.y-A.y), k=Math.max(1, Math.round(len/arc));
        for(var s2=0;s2<k;s2++){
          var Px=A.x+(B.x-A.x)*s2/k, Py=A.y+(B.y-A.y)*s2/k, Qx=A.x+(B.x-A.x)*(s2+1)/k, Qy=A.y+(B.y-A.y)*(s2+1)/k;
          var mx=(Px+Qx)/2, my=(Py+Qy)/2, ux=(Qx-Px)/2, uy=(Qy-Py)/2, h=Math.hypot(ux,uy);
          for(var j=0;j<=8;j++){ var th2=j/8*Math.PI; out.push(P(mx-ux*Math.cos(th2)+n[0]*h*.85*Math.sin(th2), my-uy*Math.cos(th2)+n[1]*h*.85*Math.sin(th2))); }
        }
      });
      return [out];
    }
    if(t.f==="spline"){
      /* Catmull-Rom : une courbe douce qui passe par chaque point */
      if(p.length<3) return [p];
      var o2=[];
      for(i=0;i<p.length-1;i++){
        var p0=p[Math.max(0,i-1)], p1=p[i], p2=p[i+1], p3=p[Math.min(p.length-1,i+2)];
        for(var k2=0;k2<10;k2++){
          var u=k2/10, u2=u*u, u3=u2*u;
          o2.push(P(.5*((2*p1.x)+(-p0.x+p2.x)*u+(2*p0.x-5*p1.x+4*p2.x-p3.x)*u2+(-p0.x+3*p1.x-3*p2.x+p3.x)*u3),
                    .5*((2*p1.y)+(-p0.y+p2.y)*u+(2*p0.y-5*p1.y+4*p2.y-p3.y)*u2+(-p0.y+3*p1.y-3*p2.y+p3.y)*u3)));
        }
      }
      o2.push(p[p.length-1]);
      return [o2];
    }
    return [p];
  }
  /* tous les points d'un trait, pour le cadre et la gomme */
  function lignesDe(t){ return t.o==="forme" ? contour(t) : [t.pts]; }
  /* un morceau du trait au stylo : du milieu au milieu en passant par le point (une courbe, sans angle),
     à l'épaisseur de ses deux bouts ; le dernier morceau finit sur le dernier point. Le même morceau sert
     au trait en cours et au trait fini : rien ne bouge quand on lève le crayon. */
  function segment(c, p, i, k, dx, dy){
    var a=p[i-1], b=p[i], d=p[i+1], sx=i===1 ? a.x : (a.x+b.x)/2, sy=i===1 ? a.y : (a.y+b.y)/2;
    var ex=d ? (b.x+d.x)/2 : b.x, ey=d ? (b.y+d.y)/2 : b.y;
    c.lineWidth=Math.max(0.8, (a.w+b.w)/2*k);
    c.beginPath(); c.moveTo((sx-dx)*k, (sy-dy)*k); c.quadraticCurveTo((b.x-dx)*k, (b.y-dy)*k, (ex-dx)*k, (ey-dy)*k); c.stroke();
  }
  /* d'un seul tenant, mais en courbes (feutre, surligneur, couleur transparente) */
  function cheminLisse(c, p, k, dx, dy){
    c.beginPath(); c.moveTo((p[0].x-dx)*k, (p[0].y-dy)*k);
    for(var j=1;j<p.length-1;j++) c.quadraticCurveTo((p[j].x-dx)*k, (p[j].y-dy)*k, ((p[j].x+p[j+1].x)/2-dx)*k, ((p[j].y+p[j+1].y)/2-dy)*k);
    c.lineTo((p[p.length-1].x-dx)*k, (p[p.length-1].y-dy)*k);
  }
  /* un trait : stylo (à la pression), feutre, surligneur (transparent), ou forme */
  function tracer(c, t, k, dx, dy){
    var p=t.pts; if(!p || !p.length) return;
    c.save();
    c.strokeStyle=t.c; c.fillStyle=t.c; c.lineCap="round"; c.lineJoin="round";
    if(t.o==="forme"){
      c.lineWidth=Math.max(0.8, (t.w||3)*k);
      contour(t).forEach(function(pl){ if(pl.length<2) return; c.beginPath(); c.moveTo((pl[0].x-dx)*k, (pl[0].y-dy)*k); for(var z=1;z<pl.length;z++) c.lineTo((pl[z].x-dx)*k, (pl[z].y-dy)*k); c.stroke(); });
      c.restore(); return;
    }
    var surl=t.o==="surligneur";
    if(surl){ c.globalAlpha=.32; c.lineCap="butt"; }
    /* surligneur, feutre ou couleur transparente : d'un seul tenant (sinon, les morceaux se superposent en perles) */
    if((surl || t.o==="feutre" || /^#[0-9a-f]{8}$/i.test(t.c)) && p.length>1){
      var moy=p.reduce(function(s, q){ return s+q.w; }, 0)/p.length;
      c.lineWidth=Math.max(0.8, moy*k); cheminLisse(c, p, k, dx, dy);
      c.stroke(); c.restore(); return;
    }
    if(p.length===1){ c.beginPath(); c.arc((p[0].x-dx)*k, (p[0].y-dy)*k, Math.max(1, p[0].w*k/2), 0, Math.PI*2); c.fill(); c.restore(); return; }
    /* du milieu au milieu, en passant par chaque point : un trait lisse */
    for(var i=1;i<p.length;i++) segment(c, p, i, k, dx, dy);
    c.restore();
  }

  function ouvrir(o){
    o=o||{};
    var pref=lirePref(), M=lireNotes();
    var tailleCrayon=pref ? pref.t : 2.6;
    if(!M.couleur) M.couleur=pref ? pref.c : COULEURS[0][0];
    var traits=[], retours=[], courant=null, stylo=false, dpr=Math.min(window.devicePixelRatio||1, 2);
    /* rouvrir une note pour la compléter : on reprend ses tracés (vecteurs,
       qualité intacte) ; une note d'avant, sans tracés, est montrée en fond
       pour écrire par-dessus (et ce fond est reporté d'une fois sur l'autre). */
    if(Array.isArray(o.traits)) traits=o.traits.filter(function(t){ return t && t.pts && t.pts.length; })
      .map(function(t){ var n={c:t.c, pts:t.pts.map(function(p){ return {x:p.x, y:p.y, w:p.w}; })}; if(t.o) n.o=t.o; if(t.f) n.f=t.f; if(t.w) n.w=t.w; return n; });
    var fondImg=null, fondRect=null, fondL=o.fondL||0, fondH=o.fondH||0;
    if(o.fond){ fondImg=new Image(); fondImg.onload=function(){ peindre(); maj(); }; fondImg.src=o.fond; }
    var fond=el("div","sty-fond"); fond.setAttribute("role","dialog"); fond.setAttribute("aria-modal","true");
    fond.setAttribute("aria-label", o.titre||"Note manuscrite");
    var barre=el("div","sty-barre");
    barre.appendChild(el("b","",o.titre||"Note manuscrite"));
    /* les outils : stylo, feutre, surligneur, formes, gomme */
    var outils=el("span","sty-outils"); outils.setAttribute("role","group"); outils.setAttribute("aria-label","Outil");
    var sous=el("div","sty-sous"); sous.setAttribute("role","toolbar"); sous.setAttribute("aria-label","Formes ou taille de la gomme");
    function peindreOutils(){
      outils.textContent="";
      OUTILS.forEach(function(x){
        var b=bouton("", function(){ M.outil=x[0]; garderNotes(M); peindreOutils(); });
        b.setAttribute("aria-pressed", M.outil===x[0] ? "true" : "false"); b.setAttribute("aria-label", x[1]); b.dataset.outil=x[0];
        var teinteOutil = x[0]==="surligneur" ? M.surl : x[0]==="gomme" ? "#F4F1EA" : M.couleur;
        b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true" style="stroke:'+(x[0]==="gomme" ? "#fff" : teinteOutil)+'">'+x[2]+'</svg>';
        b.appendChild(el("span","",x[1]));
        outils.appendChild(b);
      });
      sous.textContent="";
      if(M.outil==="formes") FORMES.forEach(function(f){
        var b=bouton("", function(){ M.forme=f[0]; garderNotes(M); peindreOutils(); });
        b.dataset.forme=f[0]; b.setAttribute("aria-pressed", M.forme===f[0] ? "true" : "false");
        b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+f[2]+'</svg>'; b.appendChild(el("span","",f[1]));
        sous.appendChild(b);
      });
      if(M.outil==="gomme") GOMMES.forEach(function(g){
        var b=bouton("", function(){ M.gomme=g[0]; garderNotes(M); peindreOutils(); });
        b.dataset.gomme=g[0]; b.setAttribute("aria-pressed", M.gomme===g[0] ? "true" : "false"); b.setAttribute("aria-label","Gomme "+g[1].toLowerCase());
        var d=Math.round(6+g[2]/34*18);
        b.innerHTML='<svg viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="'+(d/2)+'"/></svg>'; b.appendChild(el("span","","Gomme "+g[1].toLowerCase()));
        sous.appendChild(b);
      });
      sous.hidden=!sous.children.length;
      marquer();
    }
    var coul=el("span","sty-coul"); coul.setAttribute("role","group"); coul.setAttribute("aria-label","Couleur");
    function couleurOutil(){ return M.outil==="surligneur" ? M.surl : M.couleur; }
    function marquer(){ Array.prototype.forEach.call(coul.querySelectorAll("button:not(.tn-pastille)"), function(x){ x.setAttribute("aria-pressed", x.dataset.c===couleurOutil() ? "true" : "false"); }); if(tn) tn.firstChild.style.background=couleurOutil(); }
    function retenir(){ try{ localStorage.setItem(PREF, JSON.stringify({c:M.couleur, t:tailleCrayon})); }catch(e){} garderNotes(M); }
    COULEURS.forEach(function(c){
      var b=bouton("", function(){
        if(M.outil==="surligneur") M.surl=c[0]; else M.couleur=c[0];
        if(M.outil==="gomme") M.outil="stylo";
        retenir(); peindreOutils();
      });
      b.style.background=c[0]; b.dataset.c=c[0]; b.setAttribute("aria-label", c[1]);
      coul.appendChild(b);
    });
    /* toute couleur (trichromie) et la taille de l'outil */
    var tn=window.Teinte ? window.Teinte.pastille(M.couleur) : null;
    if(tn){
      tn.addEventListener("click", function(){
        if(M.outil==="gomme") M.outil="stylo";
        var ou=M.outil==="formes" ? "forme" : M.outil;
        if(ou==="stylo"){
          window.Teinte.ouvrir({ancre:tn, couleur:M.couleur, taille:tailleCrayon, tailles:[1.5, 2.6, 4, 6, 9], titreTaille:"Épaisseur du crayon",
            change:function(c, t){ M.couleur=c; tailleCrayon=t; retenir(); peindreOutils(); }});
          return;
        }
        var base=ou==="feutre" ? 7 : ou==="surligneur" ? 26 : 3.5;
        window.Teinte.ouvrir({ancre:tn, couleur:ou==="surligneur" ? M.surl : M.couleur, taille:Math.round(base*M.k[ou]*10)/10,
          tailles:[.5,.75,1,1.6,2.5].map(function(f){ return Math.round(base*f*10)/10; }), titreTaille:ou==="forme" ? "Épaisseur des formes" : "Épaisseur du "+ou,
          change:function(c, t){ if(ou==="surligneur") M.surl=c; else M.couleur=c; M.k[ou]=Math.max(.2, Math.min(6, t/base)); retenir(); peindreOutils(); }});
      });
      coul.appendChild(tn);
    }
    barre.appendChild(outils);
    barre.appendChild(coul);
    var bAnnuler=bouton("Annuler le trait", function(){ if(!retours.length) return; traits=retours.pop(); peindre(); maj(); });
    var bEffacer=bouton("Effacer", function(){ if(!traits.length) return; retours.push(traits.slice()); traits=[]; peindre(); maj(); });
    var bFermer=bouton("Fermer", function(){
      if(retours.length && !window.confirm("Fermer sans garder la note ?")) return;
      fermer();
    });
    var bOk=bouton("Ajouter", valider, "ok");
    if(o.bouton) bOk.textContent=o.bouton;
    barre.appendChild(bAnnuler); barre.appendChild(bEffacer); barre.appendChild(bFermer); barre.appendChild(bOk);
    /* trois calques : dessous, les lignes et l'écriture déjà faite (peinte une fois) ; au milieu, le trait
       en cours, qui ne reçoit à chaque image que ses nouveaux morceaux (un long trait ne ralentit pas) ;
       dessus, le bout encore provisoire du trait et l'avance prédite du crayon, seuls effacés à chaque image */
    var page=el("div","sty-page"), cvF=el("canvas"), cv=el("canvas"), cvB=el("canvas"), aide=el("p","sty-aide","Écrivez ici avec le stylet (ou le doigt)");
    cvF.className="sty-dessous"; cvB.className="sty-bout"; page.appendChild(cv); page.appendChild(cvF); page.appendChild(cvB); page.appendChild(aide);
    fond.appendChild(barre); fond.appendChild(sous); fond.appendChild(page);
    document.body.appendChild(fond);
    peindreOutils();
    var ctx=cv.getContext("2d"), ctxF=cvF.getContext("2d"), ctxB=cvB.getContext("2d");
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
    toucherCrayon(fond);

    function taille(){
      var r=page.getBoundingClientRect();
      cv.width=cvF.width=cvB.width=Math.round(r.width*dpr); cv.height=cvF.height=cvB.height=Math.round(r.height*dpr);
      rectCv=null; boutSale=null; peindre();
    }
    function lignes(){
      ctxF.save(); ctxF.strokeStyle="#DBEAFE"; ctxF.lineWidth=1*dpr;
      for(var y=56; y<cvF.height/dpr; y+=44){ ctxF.beginPath(); ctxF.moveTo(0, y*dpr); ctxF.lineTo(cvF.width, y*dpr); ctxF.stroke(); }
      ctxF.restore();
    }
    /* tout repeindre : à l'ouverture, au redimensionnement, Annuler, Effacer et pendant la gomme */
    function peindre(){
      ctxF.setTransform(1,0,0,1,0,0); ctxF.clearRect(0,0,cvF.width,cvF.height);
      lignes();
      /* la note d'avant, en fond, pour écrire par-dessus */
      if(fondImg && fondImg.complete && fondImg.naturalWidth){
        var cssW=cvF.width/dpr, nat=fondImg.naturalWidth, dw=Math.min((fondL||nat)*0.5, cssW-24);
        if(!(dw>0)) dw=Math.min(nat, cssW-24);
        var dh=dw*(fondImg.naturalHeight/fondImg.naturalWidth);
        fondRect={x:12, y:12, w:dw, h:dh};
        ctxF.drawImage(fondImg, fondRect.x*dpr, fondRect.y*dpr, dw*dpr, dh*dpr);
      }
      traits.forEach(function(t){ tracer(ctxF, t, dpr, 0, 0); });
      peindreCourant(true);
    }
    function gommeRayon(){ var g=GOMMES.filter(function(x){ return x[0]===M.gomme; })[0]; return g ? g[2] : 16; }
    var posGomme=null, boutSale=null;
    /* le trait au stylo, d'une couleur pleine : dessiné au fil de l'eau */
    function vif(t){ return !!(t && !t.gomme && !t.o && t.pts && t.pts.length && !/^#[0-9a-f]{8}$/i.test(t.c)); }
    function style(c, t){ c.strokeStyle=t.c; c.fillStyle=t.c; c.lineCap="round"; c.lineJoin="round"; }
    /* les morceaux devenus sûrs (leur point suivant est connu) passent sur le calque du milieu, une seule fois */
    function avancer(t){
      var p=t.pts, n=p.length, i0=(t.fait||0)+1;
      if(n<3 || i0>n-2) return;
      ctx.save(); style(ctx, t);
      for(var i=i0;i<=n-2;i++) segment(ctx, p, i, dpr, 0, 0);
      ctx.restore(); t.fait=n-2;
    }
    function effacerBout(tout){
      ctxB.setTransform(1,0,0,1,0,0);
      if(tout) ctxB.clearRect(0,0,cvB.width,cvB.height);
      else if(boutSale) ctxB.clearRect(boutSale[0], boutSale[1], boutSale[2], boutSale[3]);
      boutSale=null;
    }
    /* le bout : le dernier morceau, qui changera au point suivant, et l'avance prédite du crayon */
    function bout(t){
      effacerBout(false);
      var p=t.pts, n=p.length, q=p[n-1], x0=q.x, y0=q.y, x1=q.x, y1=q.y, wm=q.w;
      var voir=function(a){ x0=Math.min(x0,a.x); y0=Math.min(y0,a.y); x1=Math.max(x1,a.x); y1=Math.max(y1,a.y); if(a.w>wm) wm=a.w; };
      ctxB.save(); style(ctxB, t);
      if(n===1){ ctxB.beginPath(); ctxB.arc(q.x*dpr, q.y*dpr, Math.max(1, q.w*dpr/2), 0, Math.PI*2); ctxB.fill(); }
      else { segment(ctxB, p, n-1, dpr, 0, 0); voir(p[n-2]); }
      if(t.predits && t.predits.length){
        ctxB.lineWidth=Math.max(0.8, q.w*dpr); ctxB.beginPath(); ctxB.moveTo(q.x*dpr, q.y*dpr);
        t.predits.forEach(function(a){ ctxB.lineTo(a.x*dpr, a.y*dpr); voir(a); });
        ctxB.stroke();
      }
      ctxB.restore();
      var m=(wm/2+3)*dpr;
      boutSale=[Math.floor(x0*dpr-m), Math.floor(y0*dpr-m), Math.ceil((x1-x0)*dpr+2*m), Math.ceil((y1-y0)*dpr+2*m)];
    }
    /* complet : tout le trait en cours (ouverture, redimensionnement) ; sinon, seulement ce qui est nouveau */
    function peindreCourant(complet){
      var t=courant;
      if(vif(t) && !complet){ avancer(t); bout(t); return; }
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,cv.width,cv.height); effacerBout(true);
      if(vif(t)){ t.fait=0; avancer(t); bout(t); return; }
      if(courant && !courant.gomme) tracer(ctx, courant, dpr, 0, 0);
      /* la gomme se voit pendant qu'on efface : un cercle à sa taille */
      if(courant && courant.gomme && posGomme){
        ctx.save(); ctx.lineWidth=1.5*dpr; ctx.strokeStyle="rgba(34,32,28,.55)"; ctx.fillStyle="rgba(255,255,255,.35)";
        ctx.beginPath(); ctx.arc(posGomme.x*dpr, posGomme.y*dpr, gommeRayon()*dpr, 0, Math.PI*2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    /* la gomme coupe le trait là où elle passe (le reste du trait demeure) ; une forme touchée part entière */
    function densifier(p, pas){
      var out=[p[0]];
      for(var i=1;i<p.length;i++){
        var a=p[i-1], b=p[i], n=Math.ceil(Math.hypot(b.x-a.x, b.y-a.y)/pas);
        for(var k=1;k<=n;k++){ var u=k/n; out.push({x:a.x+(b.x-a.x)*u, y:a.y+(b.y-a.y)*u, w:a.w+(b.w-a.w)*u}); }
      }
      return out;
    }
    function effacerPres(q){
      var r=gommeRayon(), res=[], change=false;
      traits.forEach(function(t){
        var pres=function(pl){ if(pl.length===1) return Math.hypot(pl[0].x-q.x, pl[0].y-q.y) < r; for(var i=1;i<pl.length;i++) if(distSeg(q, pl[i-1], pl[i]) < r) return true; return false; };
        if(t.o==="forme"){ if(contour(t).some(pres)){ change=true; return; } res.push(t); return; }
        if(!pres(t.pts)){ res.push(t); return; }
        change=true;
        var pts=densifier(t.pts, Math.max(1, r/3)), morceau=[];
        var garder=function(){ if(morceau.length>=2){ var n=Object.assign({}, t); n.pts=morceau; res.push(n); } morceau=[]; };
        pts.forEach(function(a){ if(Math.hypot(a.x-q.x, a.y-q.y) < r) garder(); else morceau.push(a); });
        garder();
      });
      if(change){ traits=res; courant.change=true; }
      return change;
    }
    function gommer(q){
      var d=posGomme, r=gommeRayon(), ch=false;
      if(d){ var n=Math.ceil(Math.hypot(q.x-d.x, q.y-d.y)/(r/2)); for(var k=1;k<n;k++) ch=effacerPres({x:d.x+(q.x-d.x)*k/n, y:d.y+(q.y-d.y)*k/n}) || ch; }
      ch=effacerPres(q) || ch; posGomme=q;
      if(ch) peindre(); else peindreCourant();
    }
    var image_=0;
    function bientot(){ if(!image_) image_=requestAnimationFrame(function(){ image_=0; peindreCourant(); }); }
    function maj(){ bAnnuler.disabled=!retours.length; bEffacer.disabled=!traits.length; bOk.disabled=!traits.length && !(fondImg && fondImg.complete && fondImg.naturalWidth); aide.hidden=!!traits.length || !!courant; }
    var rectCv=null;
    function pos(e){ var r=rectCv||(rectCv=cv.getBoundingClientRect()); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
    /* la taille de l'outil, et la pression du stylet en plus pour le stylo : appuyer épaissit */
    function epaisseur(e){
      if(M.outil==="feutre") return 7*M.k.feutre;
      if(M.outil==="surligneur") return 26*M.k.surligneur;
      if(e.pointerType==="pen"){ var p=e.pressure||0.5; return tailleCrayon*(0.7+p*0.6); }
      return tailleCrayon;
    }
    /* le tremblement de la main, filtré (filtre « 1 € ») : lent, le trait est lissé ; rapide, il suit
       la pointe presque sans retard. Le dernier point vrai est gardé : le trait finit où l'on lève le crayon. */
    function filtreTrait(){
      var x=null, vx=0, vy=0, t0=0;
      function a(fc, dt){ return 1/(1+1/(2*Math.PI*fc*dt)); }
      return function(p, t){
        if(!x){ x={x:p.x, y:p.y}; t0=t; return p; }
        var dt=t-t0>.5 ? Math.min(50, t-t0)/1000 : 1/240; t0=t;
        var ad=a(1, dt);
        vx+=((p.x-x.x)/dt-vx)*ad; vy+=((p.y-x.y)/dt-vy)*ad;
        var al=a(2.5+.06*Math.hypot(vx, vy), dt);
        x={x:x.x+(p.x-x.x)*al, y:x.y+(p.y-x.y)*al};
        return {x:x.x, y:x.y};
      };
    }
    var actif=null;
    cv.addEventListener("pointerdown", function(e){
      if(e.pointerType==="pen") stylo=true;
      else if(stylo && e.pointerType==="touch") return;           /* la main posée sur la page */
      if(actif!==null) return;
      actif=e.pointerId; try{ cv.setPointerCapture(e.pointerId); }catch(x){}
      rectCv=null; var p=pos(e);
      aide.hidden=true; e.preventDefault();
      if(M.outil==="gomme"){ courant={gomme:true, avant:traits.slice()}; posGomme=null; gommer(p); return; }
      if(M.outil==="formes"){ courant={o:"forme", f:M.forme, c:M.couleur, w:Math.round(3.5*M.k.forme*100)/100, pts:[{x:p.x, y:p.y}, {x:p.x, y:p.y}]}; peindreCourant(); return; }
      courant={c:couleurOutil(), pts:[{x:p.x, y:p.y, w:epaisseur(e)}], fait:0};
      if(e.pointerType!=="mouse"){ courant.filtre=filtreTrait(); courant.filtre(p, e.timeStamp); }
      if(M.outil!=="stylo") courant.o=M.outil;
      peindreCourant(true);
    });
    cv.addEventListener("pointermove", function(e){
      if(e.pointerId!==actif || !courant) return;
      var evs=e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if(!evs.length) evs=[e];
      evs.forEach(function(ev){
        var p=pos(ev);
        if(courant.gomme){ gommer(p); return; }
        if(courant.o==="forme"){
          if(courant.f==="spline"){ var ds=courant.pts[courant.pts.length-1]; if(Math.hypot(p.x-ds.x, p.y-ds.y)>=1.5) courant.pts.push({x:p.x, y:p.y}); }
          else courant.pts[1]={x:p.x, y:p.y};
          return;
        }
        if(courant.filtre){ courant.brut=p; p=courant.filtre(p, ev.timeStamp); }
        var d=courant.pts[courant.pts.length-1];
        if(Math.abs(p.x-d.x)+Math.abs(p.y-d.y) < 0.8) return;
        /* la pression lissée : l'épaisseur varie en douceur, sans grumeaux */
        var w=epaisseur(ev); if(ev.pointerType==="pen") w=d.w+(w-d.w)*0.35;
        courant.pts.push({x:p.x, y:p.y, w:w});
      });
      /* là où le crayon va dans un instant (si le navigateur le sait) : le trait colle à la pointe */
      if(vif(courant)){
        var pr=[]; try{ pr=e.getPredictedEvents ? e.getPredictedEvents() : []; }catch(x){ pr=[]; }
        courant.predits=Array.prototype.slice.call(pr, 0, 3).map(pos);
      }
      bientot(); e.preventDefault();
    });
    function fin(e){
      if(e.pointerId!==actif) return;
      actif=null;
      var t=courant; courant=null; posGomme=null;
      if(image_){ cancelAnimationFrame(image_); image_=0; }
      if(t) delete t.predits;
      /* le filtre a un peu de retard : le trait rejoint le point où le crayon s'est levé */
      if(t && t.filtre){
        var bq=t.brut, dq=t.pts[t.pts.length-1];
        if(bq && Math.hypot(bq.x-dq.x, bq.y-dq.y)>=.5) t.pts.push({x:bq.x, y:bq.y, w:dq.w});
        delete t.filtre; delete t.brut;
      }
      if(t && t.gomme){ if(t.change) retours.push(t.avant); }
      else if(t && t.o==="forme"){
        if(t.f==="spline") t.pts=simplifier(t.pts, 2.5);
        var a0=t.pts[0], b0=t.pts[t.pts.length-1];
        /* une simple touche ne pose pas de forme */
        if(Math.hypot(b0.x-a0.x, b0.y-a0.y)>=4 || t.pts.length>2){ retours.push(traits.slice()); traits.push(t); tracer(ctxF, t, dpr, 0, 0); }
      }
      /* le trait fini passe sur le calque du dessous, une fois pour toutes */
      else if(t && t.pts.length){ delete t.fait; retours.push(traits.slice()); traits.push(t); tracer(ctxF, t, dpr, 0, 0); }
      peindreCourant(true); maj();
    }
    cv.addEventListener("pointerup", fin);
    cv.addEventListener("pointercancel", fin);

    function valider(){
      if(!traits.length && !(fondImg && fondImg.complete && fondImg.naturalWidth)) return;
      var x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
      traits.forEach(function(t){
        var w=t.o==="forme" ? (t.w||3) : 0;
        lignesDe(t).forEach(function(pl){ pl.forEach(function(p){ var r=(p.w||w)/2+1; x0=Math.min(x0,p.x-r); y0=Math.min(y0,p.y-r); x1=Math.max(x1,p.x+r); y1=Math.max(y1,p.y+r); }); });
      });
      /* le fond (note d'avant) entre aussi dans le cadre */
      if(fondRect){ x0=Math.min(x0, fondRect.x); y0=Math.min(y0, fondRect.y); x1=Math.max(x1, fondRect.x+fondRect.w); y1=Math.max(y1, fondRect.y+fondRect.h); }
      if(x0>x1){ x0=0; y0=0; x1=1; y1=1; }
      var marge=10; x0-=marge; y0-=marge; x1+=marge; y1+=marge;
      var l=x1-x0, h=y1-y0, k=Math.min(2, MAX_L/l);
      var c=document.createElement("canvas"); c.width=Math.max(1, Math.round(l*k)); c.height=Math.max(1, Math.round(h*k));
      var g=c.getContext("2d"); g.fillStyle="#fff"; g.fillRect(0,0,c.width,c.height);
      if(fondImg && fondRect && fondImg.complete && fondImg.naturalWidth) g.drawImage(fondImg, (fondRect.x-x0)*k, (fondRect.y-y0)*k, fondRect.w*k, fondRect.h*k);
      traits.forEach(function(t){ tracer(g, t, k, x0, y0); });
      /* on garde les tracés (pour compléter plus tard) et le fond reporté */
      var arr=function(v, n){ return Math.round(v*n)/n; };
      var encre={src:c.toDataURL("image/png"), l:c.width, h:c.height,
        traits: traits.map(function(t){
          var n={c:t.c, pts:t.pts.map(function(p){ var q={x:arr(p.x,10), y:arr(p.y,10)}; if(p.w!=null) q.w=arr(p.w,100); return q; })};
          if(t.o) n.o=t.o; if(t.f) n.f=t.f; if(t.w) n.w=t.w; return n;
        })};
      if(o.fond){ encre.fond=o.fond; encre.fondL=fondL; encre.fondH=fondH; }
      fermer();
      if(o.ok) o.ok(encre);
    }
    function clavier(e){ if(e.key==="Escape"){ e.preventDefault(); bFermer.click(); } if((e.ctrlKey||e.metaKey) && e.key==="z"){ e.preventDefault(); bAnnuler.click(); } }
    function fermer(){
      window.removeEventListener("resize", taille); document.removeEventListener("keydown", clavier, true);
      if(ro) ro.disconnect();
      if(image_){ cancelAnimationFrame(image_); image_=0; }
      fond.remove(); if(!document.querySelector(".sty-fond")) document.documentElement.classList.remove("sty-ouvert");
      if(avant && avant.focus) try{ avant.focus({preventScroll:true}); }catch(x){}
    }
    window.addEventListener("resize", taille);
    /* la barre des formes ou de la gomme change la hauteur de la page : la toile suit (sinon le trait s'étire) */
    var ro=null, roRaf=0;
    if(window.ResizeObserver){ ro=new ResizeObserver(function(){ if(roRaf) return; roRaf=requestAnimationFrame(function(){ roRaf=0; var r=page.getBoundingClientRect(); if(Math.round(r.width*dpr)!==cv.width || Math.round(r.height*dpr)!==cv.height) taille(); }); }); ro.observe(page); }
    document.addEventListener("keydown", clavier, true);
    fond.tabIndex=-1; taille(); maj(); try{ fond.focus({preventScroll:true}); }catch(x){}
    var inst={ fermer: fermer, _traits: function(){ return traits; }, _crayon: function(){ return {couleur:M.couleur, taille:tailleCrayon, outil:M.outil}; } };
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
