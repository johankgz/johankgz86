/* =====================================================================
   navigation.js — le menu ☰ sur toutes les pages de l'appli
   ---------------------------------------------------------------------
   Sur l'accueil, le bouton ☰ ouvre le menu. Ailleurs, il fallait revenir
   à l'accueil pour aller plus loin. Ce fichier pose le même bouton ☰ à
   côté de « Menu », en haut de chaque page, avec le même tiroir :
   l'accueil, les chantiers (une recherche ; un toucher ouvre le
   chantier), le calendrier, la to-do list, les notes, les discussions,
   le Cloud, l'import, les petits outils et Mon compte.
   Le bouton reprend la classe et l'adresse du bouton « Menu » de la page :
   il en a l'allure, en clair comme en sombre, sans style à refaire.
   ===================================================================== */
(function(){
"use strict";
if(window.__navigation) return;
window.__navigation=true;

var API="/api/rapports";
function session(){ try{ return JSON.parse(localStorage.getItem("outils:session")||"null"); }catch(e){ return null; } }
function plat(t){ return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function deux(n){ return (n<10 ? "0" : "")+n; }
function jour(){ var d=new Date(); return d.getFullYear()+"-"+deux(d.getMonth()+1)+"-"+deux(d.getDate()); }
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
function svg(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'; }
function auDoigt(){ try{ return !window.matchMedia("(hover:hover) and (pointer:fine)").matches; }catch(e){ return false; } }
function empreinte(t){ var h=5381; for(var i=0;i<t.length;i++) h=((h<<5)+h+t.charCodeAt(i))|0; return (h>>>0).toString(36); }

/* les mêmes icônes que le menu de l'accueil */
var ICO={
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  accueil:'<path d="M4 11l8-6.5 8 6.5v8a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>',
  reactu:'<path d="M20 12a8 8 0 1 1-2.3-5.65"/><path d="M20 4v4.5h-4.5"/>',
  chantiers:'<path d="M5.5 16.5V14a6.5 6.5 0 0 1 13 0v2.5"/><path d="M10 8V12.5M14 8v4.5"/><path d="M3.5 16.5h17v2.5h-17z"/>',
  calendrier:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2"/>',
  todo:'<path d="M4 6.3l1.4 1.4 2.9-3.2M4 12.4l1.4 1.4 2.9-3.2M4 18.5l1.4 1.4 2.9-3.2"/><path d="M11.5 6h8.5M11.5 12h8.5M11.5 18h6"/>',
  notes:'<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M4.5 8h15M8 12h8M8 15.5h5"/>',
  discu:'<path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
  cloud:'<path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.2 4.7 4.7 0 0 0 7 18.5z"/>',
  importer:'<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14.5v4A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  retour:'<path d="M15 5l-7 7 7 7"/>',
  suite:'<path d="M9 5l7 7-7 7"/>',
  loupe:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>'
};
/* les petits outils, comme dans le menu de l'accueil */
var OUTILS=[
  ["./utilitaires.html#boussole", "Boussole"], ["./utilitaires.html#niveau", "Niveau"], ["./utilitaires.html#calcul", "Calculatrice"],
  ["./utilitaires.html#conversion", "kW · A"], ["./utilitaires.html#cable", "Câble"], ["./utilitaires.html#surface", "Surface"],
  ["./utilitaires.html#croix", "Produit en croix"], ["./utilitaires.html#qr", "QR contact"], ["./utilitaires.html#refs", "Références"],
  ["./dwg.html", "Plan DWG"], ["./knx.html", "KNX"]
];

var STYLE=
/* le bouton ☰ : l'allure du bouton « Menu » de la page, une icône à la place du mot */
".nv-paire{display:inline-flex;align-items:stretch;gap:8px;flex:0 0 auto;vertical-align:middle}"
/* ☰ prend la hauteur de « Menu » : pas de marge haute ou basse en plus de l'icône */
+".nv-btn{display:inline-flex!important;align-items:center;justify-content:center;flex:0 0 auto;min-width:40px;cursor:pointer;padding-top:0!important;padding-bottom:0!important;text-decoration:none!important}"
+".nv-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round;flex:0 0 auto}"
/* le tiroir */
+".nv-fond{position:fixed;top:0;left:0;right:0;bottom:0;z-index:1500;background:rgba(20,24,30,.42)}"
+".nv-fond[hidden],.nv-tiroir[hidden],.nv-tiroir [hidden]{display:none!important}"
+".nv-tiroir{position:fixed;top:0;left:0;bottom:0;z-index:1501;box-sizing:border-box;width:312px;max-width:86vw;display:flex;flex-direction:column;"
+"background:#FFFFFF;color:#1E2329;border-radius:0 20px 20px 0;box-shadow:8px 0 30px rgba(20,24,30,.18);"
+"padding:calc(14px + env(safe-area-inset-top,0px)) 12px calc(14px + env(safe-area-inset-bottom,0px));overflow-y:auto;overscroll-behavior:contain;"
+"font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.35;text-align:left;animation:nvEntree .22s ease both}"
+"@keyframes nvEntree{from{transform:translateX(-104%)}to{transform:none}}"
+".nv-tete{display:flex;align-items:center;gap:10px;padding:0 2px 10px 4px}"
+".nv-logo{width:38px;height:38px;border-radius:11px;background:#2B323A;display:flex;align-items:center;justify-content:center;flex:0 0 auto}"
+".nv-logo svg{width:21px;height:21px;fill:none;stroke:#F08A2E;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}"
+".nv-tete b{flex:1;min-width:0;font-size:15px;font-weight:800;letter-spacing:-.01em}"
+".nv-x{width:44px;height:44px;flex:0 0 auto;border:0;border-radius:50%;background:#F1F3F6;color:#1E2329;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;margin:0}"
+".nv-x svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}"
+".nv-it{display:flex;align-items:center;gap:13px;width:100%;box-sizing:border-box;min-height:48px;padding:0 12px;margin:0;border:0;border-radius:12px;background:transparent;"
+"color:#1E2329;font:inherit;font-size:15.5px;font-weight:600;text-decoration:none;text-align:left;cursor:pointer;box-shadow:none}"
+".nv-it svg{width:22px;height:22px;flex:0 0 auto;fill:none;stroke:#E2761B;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}"
+".nv-it .nv-lib{flex:1;min-width:0}"
+".nv-it .nv-suite{width:16px;height:16px;stroke:#8A929B;stroke-width:2.2}"
+".nv-it[aria-current=\"page\"]{background:#FDEFE3;color:#B4561A;font-weight:700}"
+".nv-it[aria-current=\"page\"] svg{stroke:currentColor}"
+"@media (hover:hover){.nv-it:hover:not([aria-current=\"page\"]){background:#F1F3F6}.nv-ch:hover{background:#F4F6F8}}"
+".nv-it:focus-visible,.nv-x:focus-visible,.nv-ch:focus-visible,.nv-outils a:focus-visible,.nv-compte:focus-visible{outline:2px solid #E2761B;outline-offset:2px}"
+".nv-titre{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8A929B;padding:14px 12px 8px}"
+".nv-outils{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding:0 2px 4px}"
+".nv-outils a{min-height:46px;display:flex;align-items:center;justify-content:center;text-align:center;padding:2px 4px;border-radius:10px;background:#F6F8FA;color:#3E4650;font-size:12px;font-weight:600;text-decoration:none;line-height:1.15}"
+".nv-compte{display:flex;align-items:center;gap:11px;margin-top:auto;padding:12px 6px 2px;border-top:1px solid #E1E5EA;color:inherit;text-decoration:none}"
+".nv-ini{width:40px;height:40px;flex:0 0 auto;border-radius:50%;background:#EA7A1E;color:#fff;font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center}"
+".nv-compte span{display:flex;flex-direction:column;min-width:0}"
+".nv-compte b{font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".nv-compte small{font-size:12.5px;color:#5B6470}"
+".nv-vue{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}"
/* les chantiers, dans le tiroir */
+".nv-ch-tete{display:flex;align-items:center;gap:6px;padding:0 0 8px}"
+".nv-retour{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px 0 4px;border:0;border-radius:10px;background:none;color:#B4561A;font:inherit;font-size:15px;font-weight:700;cursor:pointer;margin:0}"
+".nv-retour svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}"
+".nv-ch-tete b{flex:1;font-size:16px;font-weight:800;text-align:right;padding-right:6px}"
+".nv-ch-tete small{font-size:12.5px;color:#8A929B;font-weight:600}"
+".nv-cherche{display:flex;align-items:center;gap:8px;min-height:46px;padding:0 12px;margin:0 0 8px;border:1px solid #E1E5EA;border-radius:12px;background:#FFFFFF;box-sizing:border-box}"
+".nv-cherche svg{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:#8A929B;stroke-width:2;stroke-linecap:round}"
+".nv-cherche input{flex:1;min-width:0;width:auto;border:0!important;background:none!important;box-shadow:none!important;outline:none;font:inherit;font-size:16px;color:#1E2329;padding:0!important;margin:0;min-height:44px;height:auto;border-radius:0}"
+".nv-liste{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;border:1px solid #E1E5EA;border-radius:12px;min-height:120px}"
+".nv-ch{display:block;padding:10px 14px;border-bottom:1px solid #EBEEF2;color:inherit;text-decoration:none}"
+".nv-ch:last-child{border-bottom:0}"
+".nv-ch b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".nv-ch small{display:block;font-size:12.5px;color:#5B6470;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".nv-ch[aria-current=\"page\"]{background:#FDEFE3}"
+".nv-ch[aria-current=\"page\"] b{color:#B4561A}"
+".nv-vide{margin:0;padding:14px;color:#5B6470;font-size:14px}"
+".nv-tous{display:block;margin-top:10px;padding:12px 4px 0;color:#B4561A;font-weight:700;font-size:14.5px;text-decoration:none;border-top:1px solid #E1E5EA}"
+"@media (max-width:760px){.nv-pc{display:none!important}}"
+"@media (prefers-reduced-motion:reduce){.nv-tiroir{animation:none}}";

var BTN=null, FOND=null, TIROIR=null, R={}, AVANT=null, LISTE=null, CHARGE=null;

function poserStyle(){
  if(document.getElementById("navigationStyle")) return;
  var st=document.createElement("style"); st.id="navigationStyle"; st.textContent=STYLE;
  (document.head||document.documentElement).appendChild(st);
}
/* le bouton « Menu » de la page : vers l'accueil, écrit « Menu » */
function lienMenu(){
  var l=document.querySelectorAll('a[href="./index.html"]');
  for(var i=0;i<l.length;i++){
    var a=l[i];
    if(a.classList.contains("nv-btn")) continue;
    if((a.textContent||"").trim()==="Menu" || a.getAttribute("aria-label")==="Menu") return a;
  }
  return null;
}
function ici(){ return (location.pathname.split("/").pop() || "index.html").toLowerCase(); }
function refIci(){
  try{ return ici()==="chantier.html" ? (new URLSearchParams(location.search).get("ref")||"") : ""; }catch(e){ return ""; }
}

function entree(tag, ico, lib, o){
  o=o||{};
  var e=el(tag, "nv-it"+(o.cls ? " "+o.cls : ""));
  if(tag==="a") e.href=o.href; else e.type="button";
  e.innerHTML=svg(ICO[ico]);
  e.appendChild(el("span", "nv-lib", lib));
  if(o.suite){ var s=document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "nv-suite"); s.innerHTML=ICO.suite; e.appendChild(s); }
  if(o.page && o.page.indexOf(ici())>=0) e.setAttribute("aria-current", "page");
  return e;
}
function construire(){
  poserStyle();
  FOND=el("div", "nv-fond"); FOND.hidden=true;
  TIROIR=el("nav", "nv-tiroir"); TIROIR.id="nvTiroir"; TIROIR.hidden=true;
  TIROIR.setAttribute("aria-label", "Menu");
  var tete=el("div", "nv-tete");
  var logo=el("span", "nv-logo"); logo.innerHTML=svg('<path d="M6 12.5l4 4 8-9"/>');
  var x=el("button", "nv-x"); x.type="button"; x.setAttribute("aria-label", "Fermer le menu"); x.innerHTML=svg(ICO.x);
  tete.appendChild(logo); tete.appendChild(el("b", "", "Suivi travaux 360")); tete.appendChild(x);
  TIROIR.appendChild(tete);

  /* ----- le menu ----- */
  var vm=el("div", "nv-vue"); vm.setAttribute("data-vue", "menu");
  vm.appendChild(entree("a", "accueil", "Accueil", {href:"./index.html"}));
  var reactu=entree("button", "reactu", "Réactualiser");
  reactu.addEventListener("click", function(){ try{ location.reload(); }catch(e){ location.href=location.href; } });
  vm.appendChild(reactu);
  var ch=entree("button", "chantiers", "Chantiers", {suite:true, page:["chantier.html", "rapports.html"]});
  ch.setAttribute("aria-haspopup", "true");
  ch.addEventListener("click", function(){ montrerVue("chantiers"); });
  vm.appendChild(ch);
  vm.appendChild(entree("a", "calendrier", "Calendrier", {href:"./index.html?calendrier="+jour()}));
  vm.appendChild(entree("a", "todo", "To-do list", {href:"./notes.html", page:["notes.html"]}));
  vm.appendChild(entree("a", "notes", "Notes", {href:"./mesnotes.html", page:["mesnotes.html"]}));
  vm.appendChild(entree("a", "discu", "Discussions", {href:"./discussions.html", page:["discussions.html"]}));
  vm.appendChild(entree("a", "cloud", "Cloud", {href:"./cloud.html", page:["cloud.html"]}));
  vm.appendChild(entree("a", "importer", "Importer et exporter", {href:"./importer.html", page:["importer.html"], cls:"nv-pc"}));
  vm.appendChild(el("div", "nv-titre", "Outils"));
  var outils=el("div", "nv-outils");
  OUTILS.forEach(function(o){ var a=el("a", "", o[1]); a.href=o[0]; outils.appendChild(a); });
  vm.appendChild(outils);
  var s=session()||{};
  var cpt=el("a", "nv-compte"); cpt.href="./compte.html";
  if(ici()==="compte.html") cpt.setAttribute("aria-current", "page");
  cpt.appendChild(el("span", "nv-ini", String(s.nom||"?").trim().charAt(0).toUpperCase()||"?"));
  var lc=el("span"); lc.appendChild(el("b", "", s.nom||"")); lc.appendChild(el("small", "", "Mon compte"));
  cpt.appendChild(lc);
  vm.appendChild(cpt);

  /* ----- les chantiers ----- */
  var vc=el("div", "nv-vue"); vc.setAttribute("data-vue", "chantiers"); vc.hidden=true;
  var ct=el("div", "nv-ch-tete");
  var ret=el("button", "nv-retour"); ret.type="button"; ret.innerHTML=svg(ICO.retour); ret.appendChild(el("span", "", "Menu"));
  ret.setAttribute("aria-label", "Revenir au menu");
  var ctb=el("b", "", "Chantiers "); var nb=el("small"); ctb.appendChild(nb);
  ct.appendChild(ret); ct.appendChild(ctb);
  var cherche=el("label", "nv-cherche"); cherche.innerHTML=svg(ICO.loupe);
  var q=el("input"); q.type="search"; q.placeholder="Client, référence, ville…"; q.autocomplete="off";
  q.setAttribute("aria-label", "Rechercher un chantier"); q.setAttribute("enterkeyhint", "go");
  cherche.appendChild(q);
  var liste=el("div", "nv-liste");
  var tous=el("a", "nv-tous", "Tous mes chantiers, avec la carte →"); tous.href="./rapports.html";
  vc.appendChild(ct); vc.appendChild(cherche); vc.appendChild(liste); vc.appendChild(tous);
  ret.addEventListener("click", function(){ montrerVue("menu"); });
  q.addEventListener("input", peindreChantiers);
  q.addEventListener("keydown", function(e){
    if(e.key!=="Enter") return;
    var a=liste.querySelector("a.nv-ch"); if(a){ e.preventDefault(); location.href=a.href; }
  });

  TIROIR.appendChild(vm); TIROIR.appendChild(vc);
  R={x:x, menu:vm, chantiers:vc, entreeCh:ch, q:q, liste:liste, nb:nb, ret:ret};
  document.body.appendChild(FOND); document.body.appendChild(TIROIR);
  FOND.addEventListener("click", fermer);
  x.addEventListener("click", function(){ fermer(); });
  document.addEventListener("keydown", function(e){
    if(e.key!=="Escape" || !TIROIR || TIROIR.hidden) return;
    e.preventDefault(); e.stopPropagation(); fermer();
  }, true);
  /* le focus reste dans le tiroir */
  TIROIR.addEventListener("keydown", function(e){
    if(e.key!=="Tab") return;
    var l=Array.prototype.filter.call(TIROIR.querySelectorAll("a[href],button,input"), function(n){ return n.offsetParent; });
    if(!l.length) return;
    if(e.shiftKey && document.activeElement===l[0]){ e.preventDefault(); l[l.length-1].focus(); }
    else if(!e.shiftKey && document.activeElement===l[l.length-1]){ e.preventDefault(); l[0].focus(); }
  });
  window.addEventListener("pageshow", function(e){ if(e.persisted) fermer(true); });
}
function montrerVue(v){
  R.menu.hidden = v!=="menu";
  R.chantiers.hidden = v!=="chantiers";
  if(v==="chantiers"){
    R.q.value=""; peindreChantiers(); chargerChantiers();
    setTimeout(function(){ try{ (auDoigt() ? R.ret : R.q).focus({preventScroll:true}); }catch(e){} }, 30);
  } else setTimeout(function(){ try{ R.entreeCh.focus(); }catch(e){} }, 30);
}

/* ---------- les chantiers : gardés le temps de la visite, relus à chaque ouverture ---------- */
function cleMemo(){ var s=session(); return "nav:chantiers:"+empreinte((s && s.jeton) || ""); }
function chargerChantiers(){
  if(!LISTE){ try{ var m=JSON.parse(sessionStorage.getItem(cleMemo())||"null"); if(Array.isArray(m)){ LISTE=m; peindreChantiers(); } }catch(e){} }
  if(CHARGE) return CHARGE;
  var s=session(); if(!s || !s.jeton) return Promise.resolve();
  CHARGE=fetch(API+"?action=liste", {headers:{"x-auth":s.jeton}})
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("liste")); })
    .then(function(d){
      LISTE=((d && d.chantiers) || []).map(function(c){ return {ref:c.ref, client:c.client||"", adresse:c.adresse||"", maj:c.maj||""}; });
      try{ sessionStorage.setItem(cleMemo(), JSON.stringify(LISTE)); }catch(e){}
      CHARGE=null; peindreChantiers();
    }, function(){ CHARGE=null; if(!LISTE){ LISTE=[]; LISTE.horsLigne=true; } peindreChantiers(); });
  return CHARGE;
}
function villeDe(adr){
  var a=String(adr||"").replace(/\n/g, ", ").trim();
  var m=/\b\d{5}\s+([^,]+?)\s*$/.exec(a);
  return m ? m[1] : a.split(",").pop().trim();
}
function peindreChantiers(){
  if(!R.liste) return;
  var h=R.liste; h.textContent="";
  function mot(t){ h.appendChild(el("p", "nv-vide", t)); }
  if(!LISTE){ R.nb.textContent=""; mot("Chargement des chantiers…"); return; }
  if(!LISTE.length){ R.nb.textContent=""; mot(LISTE.horsLigne ? "Liste indisponible hors connexion." : "Aucun chantier pour l'instant."); return; }
  var mots=plat(R.q.value).split(/\s+/).filter(Boolean), courant=refIci();
  var l=LISTE.slice().sort(function(a, b){ return String(b.maj||"").localeCompare(String(a.maj||"")); })
    .filter(function(c){ var t=plat([c.client, c.ref, c.adresse].join(" ")); return mots.every(function(m){ return t.indexOf(m)>=0; }); });
  R.nb.textContent=mots.length ? l.length+" sur "+LISTE.length : String(LISTE.length);
  if(!l.length){ mot("Aucun chantier ne correspond à « "+R.q.value.trim()+" »."); return; }
  l.slice(0, 200).forEach(function(c){
    var a=el("a", "nv-ch"); a.href="./chantier.html?ref="+encodeURIComponent(c.ref);
    if(c.ref===courant) a.setAttribute("aria-current", "page");
    a.appendChild(el("b", "", c.client || c.ref));
    a.appendChild(el("small", "", [c.client ? c.ref : "", villeDe(c.adresse)].filter(Boolean).join(" · ")));
    h.appendChild(a);
  });
}

/* ---------- ouvrir, fermer ---------- */
function ouvrir(){
  if(!TIROIR) construire();
  if(!TIROIR.hidden){ fermer(); return; }
  AVANT=document.activeElement;
  montrerVue("menu");
  FOND.hidden=false; TIROIR.hidden=false;
  document.documentElement.style.overflow="hidden";
  if(BTN) BTN.setAttribute("aria-expanded", "true");
  setTimeout(function(){ try{ R.x.focus({preventScroll:true}); }catch(e){} }, 30);
}
function fermer(sansFocus){
  if(!TIROIR || TIROIR.hidden) return;
  TIROIR.hidden=true; FOND.hidden=true;
  document.documentElement.style.overflow="";
  if(BTN) BTN.setAttribute("aria-expanded", "false");
  if(sansFocus!==true && AVANT && AVANT.focus && document.contains(AVANT)) try{ AVANT.focus({preventScroll:true}); }catch(e){}
}

/* ---------- le bouton ☰, à côté de « Menu » ---------- */
function poser(){
  var s=session();
  if(!s || !s.jeton || document.querySelector(".nv-btn")) return;
  var m=lienMenu(); if(!m) return;
  poserStyle();
  var b=document.createElement("a");
  b.href="./index.html";
  b.className=(m.className ? m.className+" " : "")+"nv-btn";
  var st=m.getAttribute("style"); if(st) b.setAttribute("style", st);
  b.setAttribute("role", "button");
  b.setAttribute("aria-label", "Ouvrir le menu");
  b.setAttribute("aria-haspopup", "dialog");
  b.setAttribute("aria-expanded", "false");
  b.setAttribute("aria-controls", "nvTiroir");
  b.title="Menu : chantiers, to-do list, notes…";
  b.innerHTML=svg(ICO.menu);
  /* « Menu » et ☰ côte à côte, dans un même bloc : l'en-tête les place comme il plaçait « Menu »
     seul (à gauche, aligné sur la ligne du titre), même s'il répartit ses éléments sur la largeur */
  var paire=document.createElement("span"); paire.className="nv-paire";
  var cs=window.getComputedStyle(m);
  paire.style.marginLeft=cs.marginLeft; paire.style.marginRight=cs.marginRight;
  m.parentNode.insertBefore(paire, m);
  paire.appendChild(m); paire.appendChild(b);
  m.style.marginLeft="0"; m.style.marginRight="0";
  b.style.marginLeft="0"; b.style.marginRight="0";
  /* un clic ouvre le tiroir ; Ctrl + clic garde le lien vers l'accueil (nouvel onglet) */
  b.addEventListener("click", function(e){
    if(e.ctrlKey || e.metaKey || e.shiftKey || e.button===1) return;
    e.preventDefault(); ouvrir();
  });
  b.addEventListener("keydown", function(e){ if(e.key===" " || e.key==="Spacebar"){ e.preventDefault(); ouvrir(); } });
  BTN=b;
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", poser); else poser();

window.Navigation={ ouvrir:ouvrir, fermer:fermer, chantiers:function(){ if(!TIROIR || TIROIR.hidden) ouvrir(); montrerVue("chantiers"); } };
})();
