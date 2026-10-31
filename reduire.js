/* =====================================================================
   reduire.js — mettre une fiche « en petit » pour aller ailleurs
   ---------------------------------------------------------------------
   En plein suivi (ou commande, point, relevé…), on veut jeter un œil au
   dossier, à sa note, à l'accueil, sans rien refaire. Le bouton
   « Réduire », à côté de ☰ en haut de la fiche, la range : elle est
   enregistrée (comme toujours), et une petite fenêtre la garde en bas à
   gauche de l'écran, sur toutes les pages du site. Un toucher dessus
   rouvre la fiche à l'endroit exact où on l'avait laissée ; la croix la
   retire de l'écran (la fiche, elle, reste enregistrée).
   Plusieurs fiches peuvent être réduites à la fois (une par sorte).
   ===================================================================== */
(function(){
"use strict";
if(window.__reduire) return; window.__reduire=true;

var CLE="fenetres:reduites", MAX=4;
/* les fiches qui se réduisent : [nom, icône] */
var FICHES={
  "suivi.html":["Suivi", '<path d="M4 19.5V8.5L12 4l8 4.5v11"/><path d="M9 19.5v-6h6v6"/>'],
  "releve.html":["Relevé", '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M8.5 8h7M8.5 11.5h7M8.5 15h4"/>'],
  "commande.html":["Commande", '<path d="M3.5 5h2.2l2 10.5h10.6l1.9-7.5H7"/><circle cx="9.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/>'],
  "point.html":["Le point", '<path d="M4.5 6.3l1.4 1.4 2.9-3.2M4.5 12.4l1.4 1.4 2.9-3.2M4.5 18.5l1.4 1.4 2.9-3.2"/><path d="M12 6h8M12 12h8M12 18h6"/>'],
  "autocontrole.html":["Autocontrôle", '<path d="M12 3.5 5 6.5v5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9v-5z"/><path d="M9 12l2.2 2.2L15.5 10"/>'],
  "reception.html":["Réception", '<path d="M5 12.5l4.5 4.5L19 7.5"/>'],
  "sav.html":["SAV", '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>'],
  "note.html":["Note", '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8 9h8M8 12.5h8M8 16h5"/>'],
  "photos.html":["Photos", '<rect x="3.5" y="6" width="17" height="13" rx="2"/><circle cx="12" cy="12.5" r="3.4"/><path d="M8.5 6l1.4-2h4.2l1.4 2"/>'],
  "technique.html":["Documents techniques", '<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5v5h5"/>'],
  "etiquettes.html":["Étiquettes", '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.4"/>'],
  "carnet.html":["Carnet", '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 3.5v17"/>']
};
var ICO_REDUIRE='<path d="M20.5 11V6.5a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><rect x="13" y="14" width="8" height="6" rx="1.3"/><path d="M7.5 7.5 12 12M12 8.4V12H8.4"/>';

function session(){ try{ return JSON.parse(localStorage.getItem("outils:session")||"null"); }catch(e){ return null; } }
function ici(){ return (location.pathname.split("/").pop() || "index.html").toLowerCase(); }
function svg(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'; }
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
function liste(){
  var l; try{ l=JSON.parse(localStorage.getItem(CLE)||"[]"); }catch(e){ l=[]; }
  return Array.isArray(l) ? l.filter(function(x){ return x && FICHES[x.page]; }) : [];
}
function garder(l){ try{ localStorage.setItem(CLE, JSON.stringify(l.slice(0, MAX))); }catch(e){} }
function valeur(sel){
  var e=document.querySelector(sel); return e && typeof e.value==="string" ? e.value.trim() : "";
}
/* le client et la référence de la fiche ouverte */
function quiEst(){
  return {
    client: valeur("#c_nom") || valeur("#c_client") || valeur("#r_client") || valeur("#e_client") || valeur("#ch_client"),
    ref: valeur("#a_chantier") || valeur("#c_ref") || valeur("#r_ref") || valeur("#e_ref") || valeur("#ch_ref")
  };
}

var STYLE=
 ".rd-btn{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 auto;min-width:40px;cursor:pointer;padding-top:0!important;padding-bottom:0!important;text-decoration:none!important}"
+".rd-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
/* la petite fenêtre, en bas à gauche */
+".rd-dock{position:fixed;left:calc(env(safe-area-inset-left,0px) + 12px);z-index:1400;display:flex;flex-direction:column-reverse;gap:8px;max-width:min(320px,calc(100vw - 84px));pointer-events:none}"
+".rd-f{pointer-events:auto;display:flex;align-items:center;gap:4px;padding:5px 5px 5px 6px;border-radius:16px;background:rgba(11,18,32,.94);color:#fff;"
+"border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 28px rgba(0,0,0,.38),0 0 0 1px rgba(37,99,235,.25);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);"
+"font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;animation:rdEntree .26s cubic-bezier(.2,.9,.3,1.2) both}"
+"@keyframes rdEntree{from{opacity:0;transform:translateY(14px) scale(.94)}to{opacity:1;transform:none}}"
+".rd-ouvrir{flex:1;min-width:0;display:flex;align-items:center;gap:10px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:4px 6px 4px 2px;cursor:pointer;-webkit-tap-highlight-color:transparent}"
+".rd-ic{flex:0 0 auto;width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#2563EB,#22D3EE);display:flex;align-items:center;justify-content:center}"
+".rd-ic svg{width:19px;height:19px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
+".rd-tx{min-width:0}"
+".rd-tx b{display:block;font-size:14px;font-weight:700;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".rd-tx small{display:block;font-size:12px;color:#9FB0CC;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".rd-agr{flex:0 0 auto;width:20px;height:20px;fill:none;stroke:#22D3EE;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;margin-left:2px}"
+".rd-x{flex:0 0 auto;width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:#9FB0CC;font-size:20px;line-height:1;cursor:pointer}"
+".rd-x:hover,.rd-ouvrir:hover .rd-tx b{color:#fff}"
/* le choix, à la réduction */
+".rd-fond{position:fixed;inset:0;z-index:1600;background:rgba(5,9,18,.55);display:flex;align-items:flex-end;justify-content:center;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}"
+".rd-feuille{box-sizing:border-box;width:100%;max-width:520px;background:#0F172A;color:#E2E8F0;border-radius:22px 22px 0 0;border-top:1px solid rgba(255,255,255,.12);"
+"padding:18px 16px calc(18px + env(safe-area-inset-bottom,0px));font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;animation:rdMonte .24s ease both}"
+"@media (min-width:700px){.rd-fond{align-items:center}.rd-feuille{border-radius:22px;border:1px solid rgba(255,255,255,.12)}}"
+"@keyframes rdMonte{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}"
+".rd-feuille h3{margin:0 0 4px;font-size:18px;color:#fff}"
+".rd-feuille p{margin:0 0 14px;font-size:13.5px;line-height:1.45;color:#9FB0CC}"
+".rd-aller{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;margin:0 0 8px;padding:13px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);"
+"background:rgba(255,255,255,.05);color:#fff;font:600 15px/1.25 inherit;font-family:inherit;text-align:left;cursor:pointer}"
+".rd-aller small{display:block;font-weight:500;font-size:12.5px;color:#9FB0CC;margin-top:2px}"
+".rd-aller svg{flex:0 0 auto;width:22px;height:22px;fill:none;stroke:#22D3EE;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
+".rd-aller.prem{background:#2563EB;border-color:#2563EB}.rd-aller.prem svg{stroke:#fff}.rd-aller.prem small{color:#DBEAFE}"
+".rd-annuler{display:block;width:100%;margin-top:4px;padding:12px;border:0;background:transparent;color:#9FB0CC;font:600 14.5px inherit;font-family:inherit;cursor:pointer}"
+"@media print{.rd-dock,.rd-btn{display:none!important}}";
function poserStyle(){
  if(document.getElementById("rdStyle")) return;
  var st=document.createElement("style"); st.id="rdStyle"; st.textContent=STYLE;
  (document.head||document.documentElement).appendChild(st);
}

/* ---------- la petite fenêtre, sur toutes les pages ---------- */
var DOCK=null;
function hauteurBarreBas(){
  /* les fiches ont leur barre d'onglets en bas : la fenêtre se pose au-dessus */
  var n=document.getElementById("nav");
  if(n){
    var cs=getComputedStyle(n), r=n.getBoundingClientRect();
    if((cs.position==="fixed" || cs.position==="sticky") && r.height && r.top>window.innerHeight*0.5 && r.top<window.innerHeight) return window.innerHeight-r.top;
  }
  return 0;
}
function placer(){ if(DOCK) DOCK.style.bottom="calc(env(safe-area-inset-bottom,0px) + "+(hauteurBarreBas()+14)+"px)"; }
function peindreDock(){
  var l=liste().filter(function(x){ return x.page!==ici(); });
  if(!l.length){ if(DOCK){ DOCK.remove(); DOCK=null; } return; }
  poserStyle();
  if(!DOCK){ DOCK=el("div", "rd-dock"); DOCK.setAttribute("aria-label", "Fiches réduites"); document.body.appendChild(DOCK); }
  DOCK.textContent="";
  l.forEach(function(x){
    var f=FICHES[x.page], c=el("div", "rd-f");
    var o=el("button", "rd-ouvrir"); o.type="button";
    o.setAttribute("aria-label", "Rouvrir "+f[0]+(x.client ? " — "+x.client : ""));
    o.innerHTML='<span class="rd-ic">'+svg(f[1])+'</span>';
    var tx=el("span", "rd-tx"); tx.appendChild(el("b", "", f[0]));
    tx.appendChild(el("small", "", [x.client, x.ref].filter(Boolean).join(" · ") || "Reprendre où vous en étiez"));
    o.appendChild(tx);
    o.insertAdjacentHTML("beforeend", '<svg class="rd-agr" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4.5h11.5V16"/><path d="M19.5 4.5 5 19"/></svg>');
    o.addEventListener("click", function(){ location.href="./"+x.page; });
    var fx=el("button", "rd-x", "×"); fx.type="button"; fx.title="Retirer de l'écran (la fiche reste enregistrée)";
    fx.setAttribute("aria-label", "Retirer "+f[0]+" de l'écran");
    fx.addEventListener("click", function(){ garder(liste().filter(function(y){ return y.page!==x.page; })); peindreDock(); });
    c.appendChild(o); c.appendChild(fx); DOCK.appendChild(c);
  });
  placer();
}

/* ---------- réduire la fiche ouverte ----------
   « Réduire » est en haut de la fiche : on y remonte pour le toucher. L'endroit où l'on
   travaillait est donc le dernier où l'on est resté un moment (2 s sans défiler). */
var POSE=0, tPose=0;
function suivrePose(){
  window.addEventListener("scroll", function(){
    clearTimeout(tPose);
    tPose=setTimeout(function(){ POSE=Math.round(window.scrollY||0); }, 2000);
  }, {passive:true});
}
function endroit(){
  var y=Math.round(window.scrollY||0);
  return (y<300 && POSE>y) ? POSE : y;
}
function reduire(apres){
  var a=document.activeElement;
  /* le champ en cours de frappe : on le quitte, pour que la fiche l'enregistre */
  try{ if(a && a.blur && a!==document.body){ a.dispatchEvent(new Event("change", {bubbles:true})); a.blur(); } }catch(e){}
  var q=quiEst();
  var l=liste().filter(function(x){ return x.page!==ici(); });
  l.unshift({page:ici(), client:q.client.slice(0, 60), ref:q.ref.slice(0, 40), y:endroit(), t:Date.now()});
  garder(l);
  /* les fiches enregistrent un instant après la dernière frappe : on leur laisse ce temps */
  setTimeout(apres, 750);
}
function choisir(){
  poserStyle();
  var f=FICHES[ici()], q=quiEst();
  var fond=el("div", "rd-fond"), fe=el("div", "rd-feuille");
  fe.setAttribute("role", "dialog"); fe.setAttribute("aria-label", "Réduire la fiche");
  fe.appendChild(el("h3", "", "Réduire : "+f[0].toLowerCase()));
  fe.appendChild(el("p", "", "La fiche est enregistrée et reste en petit en bas de l'écran, sur toutes les pages. Touchez-la pour revenir exactement où vous en étiez."));
  function bouton(ico, titre, sous, prem, action){
    var b=el("button", "rd-aller"+(prem ? " prem" : "")); b.type="button";
    b.innerHTML=svg(ico); var s=el("span"); s.appendChild(document.createTextNode(titre)); if(sous) s.appendChild(el("small", "", sous)); b.appendChild(s);
    b.addEventListener("click", function(){
      Array.prototype.forEach.call(fe.querySelectorAll("button"), function(x){ x.disabled=true; });
      b.lastChild.lastChild.textContent="Enregistrement…";
      reduire(function(){ fond.remove(); action(); });
    });
    fe.appendChild(b);
  }
  if(q.ref) bouton('<path d="M5.5 16.5V14a6.5 6.5 0 0 1 13 0v2.5"/><path d="M10 8v4.5M14 8v4.5"/><path d="M3.5 16.5h17V19h-17z"/>',
    "Le dossier du chantier", [q.client, q.ref].filter(Boolean).join(" · "), true,
    function(){ location.href="./chantier.html?ref="+encodeURIComponent(q.ref); });
  bouton('<path d="M4 11l8-6.5 8 6.5v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>', "L'accueil", "", !q.ref,
    function(){ location.href="./index.html"; });
  if(window.Navigation && Navigation.ouvrir) bouton('<path d="M4 7h16M4 12h16M4 17h16"/>', "Le menu", "Chantiers, calendrier, notes, Cloud…", false,
    function(){ Navigation.ouvrir(); });
  var an=el("button", "rd-annuler", "Annuler"); an.type="button";
  an.addEventListener("click", function(){ fond.remove(); });
  fe.appendChild(an);
  fond.appendChild(fe);
  fond.addEventListener("click", function(e){ if(e.target===fond) fond.remove(); });
  document.addEventListener("keydown", function esc(e){ if(e.key==="Escape"){ fond.remove(); document.removeEventListener("keydown", esc); } });
  document.body.appendChild(fond);
  try{ fe.querySelector(".rd-aller").focus({preventScroll:true}); }catch(e){}
}
/* le bouton, à côté de ☰ (navigation.js), avec la même allure */
var essais=0;
function poserBouton(){
  if(!FICHES[ici()] || document.querySelector(".rd-btn")) return;
  var paire=document.querySelector(".nv-paire"), modele=paire && paire.querySelector(".nv-btn");
  if(!paire){ if(++essais<20) setTimeout(poserBouton, 250); return; }
  poserStyle();
  var b=document.createElement("button"); b.type="button";
  b.className=(modele && modele.className ? modele.className.replace(/\bnv-btn\b/, "") : "")+" rd-btn";
  var st=modele && modele.getAttribute("style"); if(st) b.setAttribute("style", st);
  b.setAttribute("aria-label", "Réduire la fiche pour aller ailleurs");
  b.title="Réduire : aller au dossier, à l'accueil… et revenir ici ensuite";
  b.innerHTML=svg(ICO_REDUIRE);
  b.addEventListener("click", function(e){ e.preventDefault(); choisir(); });
  paire.appendChild(b);
}

/* ---------- revenir sur une fiche réduite : là où on l'avait laissée ---------- */
function retrouver(){
  var l=liste(), x=null;
  l=l.filter(function(y){ if(y.page===ici()){ x=y; return false; } return true; });
  if(!x) return;
  garder(l);
  if(!(x.y>0)) return;
  /* la fiche se remplit en plusieurs temps (photos, plans) : on y revient tant qu'on n'a pas touché l'écran */
  var touche=false;
  function stop(){ touche=true; }
  ["touchstart", "wheel", "keydown", "mousedown"].forEach(function(t){ window.addEventListener(t, stop, {passive:true, once:true}); });
  [350, 900, 1600, 2600, 4000].forEach(function(ms){
    setTimeout(function(){ if(!touche && Math.abs((window.scrollY||0)-x.y)>40) window.scrollTo(0, x.y); }, ms);
  });
}

function demarrer(){
  var s=session(); if(!s || !s.jeton) return;
  if(FICHES[ici()]){ retrouver(); poserBouton(); suivrePose(); }
  peindreDock();
  window.addEventListener("resize", placer);
  /* une autre page (un autre onglet) a réduit ou rouvert une fiche */
  window.addEventListener("storage", function(e){ if(e.key===CLE) peindreDock(); });
  /* retour par « Précédent » (page gardée en mémoire) : la liste a pu changer */
  window.addEventListener("pageshow", function(e){ if(!e.persisted) return; if(FICHES[ici()]) retrouver(); peindreDock(); });
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();

window.Reduire={ reduire:choisir, liste:liste };
})();
