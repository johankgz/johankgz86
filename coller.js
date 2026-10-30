/* =====================================================================
   coller.js — coller une capture d'écran là où la page prend des photos
   ou des fichiers
   ---------------------------------------------------------------------
   Une capture faite sur l'ordinateur (Windows : Win+Maj+S ; Mac :
   Ctrl+Maj+Cmd+4) est dans le presse-papier :
   - clic droit sur un bouton d'ajout (Photos, Galerie, Joindre un
     fichier, Importer un plan…) ou dans son bloc › « Coller la capture » ;
   - ou Ctrl+V (Cmd+V) hors d'un champ de saisie : si la page a plusieurs
     endroits où la mettre, elle demande lequel. Dans un champ (le message
     d'une discussion), une image seule va au bloc de ce champ.
   La capture passe par le même chemin qu'une photo choisie avec le
   bouton : le champ fichier de la page la reçoit, comme d'habitude.

   Les endroits sont trouvés à la demande, sans rien changer aux pages :
   - les boutons connus (PAIRES : identifiant du bouton › du champ) ;
   - une étiquette (label) qui contient un champ fichier ;
   - un bouton (Photo, Galerie, Fichier…) suivi de son champ fichier ;
   - un élément marqué data-coller, avec el.__coller(fichiers) ou
     el.__collerChamp (le champ fichier).
   ===================================================================== */
(function(){
"use strict";
if(window.Coller) return;

var PAIRES = {
  btnPhoto:"filePhoto", btnFichier:"fileDoc", btnImage:"fileImage", btnPhotos:"fichierPhotos", btnDeposer:"fichierDepot",
  ph_prendre:"ph_fichierG", ph_galerie:"ph_fichierG", btnPlanImport:"filePlan", btnPlanPhoto:"filePlan",
  btnToitPhoto:"toit_galerie", btnToitGalerie:"toit_galerie", btnQuickPhoto:"q_file"
};
var ZONES = ".block, .card, .carte, section, fieldset, form, [data-coller-zone]";

function $(id){ return document.getElementById(id); }
function visible(e){ return !!(e && e.isConnected && (e.offsetParent !== null || e.getClientRects().length) && !e.closest("[hidden]")); }
function champTexte(t){ return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ""))); }

/* ---------- les endroits de la page ---------- */
function libelleDe(b){
  var t = (b.getAttribute("data-coller") || b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent || "").replace(/\s+/g, " ").trim();
  return t.slice(0, 40) || "Ajouter";
}
function prendImages(champ){
  if(!champ) return false;
  var a = String(champ.accept || "").toLowerCase();
  return !a || /image|\.png|\.jpe?g|\*/.test(a);
}
function cibles(){
  var l = [], vus = [];
  function ajouter(bouton, champ, recevoir){
    if(!bouton || vus.indexOf(bouton) >= 0 || !visible(bouton)) return;
    if(!recevoir && !prendImages(champ)) return;
    vus.push(bouton);
    var zone = bouton.closest("[data-coller-zone]") || bouton.closest(ZONES);
    if(!zone || zone === document.body) zone = bouton.parentElement;
    l.push({bouton:bouton, champ:champ || null, recevoir:recevoir || null, zone:zone, libelle:libelleDe(bouton)});
  }
  Object.keys(PAIRES).forEach(function(id){ var b = $(id), c = $(PAIRES[id]); if(b && c) ajouter(b, c); });
  [].forEach.call(document.querySelectorAll("[data-coller]"), function(b){
    ajouter(b, b.__collerChamp, typeof b.__coller === "function" ? b.__coller : null);
  });
  [].forEach.call(document.querySelectorAll("label"), function(lb){
    var c = lb.querySelector("input[type=file]") || (lb.htmlFor && $(lb.htmlFor));
    if(c && c.type === "file" && !c.disabled) ajouter(lb, c);
  });
  [].forEach.call(document.querySelectorAll("input[type=file]"), function(c){
    var b = c.previousElementSibling;
    if(b && b.tagName === "BUTTON" && !c.disabled && /photo|galerie|image|fichier|joindre|document|plan|capture/i.test(libelleDe(b))) ajouter(b, c);
  });
  return l;
}
/* dans un même bloc, un seul endroit par champ, et la galerie avant l'appareil photo */
function sansDoublon(l){
  var r = [];
  l.forEach(function(c){
    var deja = r.filter(function(x){ return c.champ && x.champ === c.champ; })[0];
    if(!deja) r.push(c);
  });
  var galerie = r.filter(function(c){ return !c.champ || !c.champ.hasAttribute("capture"); });
  if(galerie.length) r = galerie;
  /* un champ fait pour les images passe avant un « tout fichier » du même bloc */
  var images = r.filter(function(c){ return c.recevoir || /image/i.test(c.champ.accept || ""); });
  return images.length ? images : r;
}

/* ---------- donner les fichiers à la page ---------- */
function nommer(f, i){
  if(f.name && !/^image\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(f.name)) return f;
  var d = new Date(), z = function(n){ return (n < 10 ? "0" : "")+n; };
  var nom = "Capture "+z(d.getDate())+"-"+z(d.getMonth()+1)+"-"+d.getFullYear()+" "+z(d.getHours())+"h"+z(d.getMinutes())+(i ? " ("+(i+1)+")" : "")
    +"."+((String(f.type || "").split("/")[1] || "png").replace("jpeg", "jpg"));
  try{ return new File([f], nom, {type:f.type || "image/png", lastModified:Date.now()}); }catch(e){ return f; }
}
function accepte(champ, f){
  var a = String((champ && champ.accept) || "").toLowerCase().split(",").map(function(s){ return s.trim(); }).filter(Boolean);
  if(!a.length) return true;
  var type = String(f.type || "").toLowerCase(), ext = "."+String(f.name || "").split(".").pop().toLowerCase();
  return a.some(function(x){
    if(x === "*/*" || x === type || x === ext) return true;
    if(/\/\*$/.test(x)) return type.indexOf(x.slice(0, -1)) === 0;
    return x === ".jpg" && ext === ".jpeg" || x === ".jpeg" && ext === ".jpg";
  });
}
function donner(c, fichiers){
  var fs = [].slice.call(fichiers || []).map(nommer).filter(function(f){ return c.recevoir || accepte(c.champ, f); });
  if(!fs.length){ dire("Ce format ne va pas ici : collez une image."); return false; }
  if(c.champ && !c.champ.multiple) fs = fs.slice(0, 1);
  if(c.recevoir){ c.recevoir(fs); dire(fs.length > 1 ? fs.length+" captures collées." : "Capture collée."); return true; }
  try{
    var dt = new DataTransfer();
    fs.forEach(function(f){ dt.items.add(f); });
    c.champ.files = dt.files;
  }catch(e){ dire("Votre navigateur ne sait pas coller ici : enregistrez la capture, puis ajoutez-la avec le bouton."); return false; }
  c.champ.dispatchEvent(new Event("input", {bubbles:true}));
  c.champ.dispatchEvent(new Event("change", {bubbles:true}));
  dire(fs.length > 1 ? fs.length+" captures collées." : "Capture collée.");
  return true;
}

/* ---------- lire le presse-papier (depuis le menu du clic droit) ---------- */
var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent), TOUCHE = MAC ? "Cmd+V" : "Ctrl+V";
var ARMEE = null, ARMEE_A = 0;
function lirePressePapier(){
  if(!navigator.clipboard || !navigator.clipboard.read) return Promise.reject(new Error("lecture"));
  return navigator.clipboard.read().then(function(items){
    var promesses = [];
    items.forEach(function(it){
      var t = (it.types || []).filter(function(x){ return /^image\//.test(x); })[0];
      if(t) promesses.push(it.getType(t).then(function(b){ return new File([b], "image."+(t.split("/")[1] || "png"), {type:t}); }));
    });
    return Promise.all(promesses);
  });
}
function collerDans(c){
  lirePressePapier().then(function(fs){
    if(!fs.length){ dire("Pas d'image dans le presse-papier. Faites d'abord la capture (Windows : Win+Maj+S ; Mac : Ctrl+Maj+Cmd+4)."); return; }
    donner(c, fs);
  }, function(){
    /* lecture refusée ou impossible : le Ctrl+V qui suit ira ici */
    ARMEE = c; ARMEE_A = Date.now();
    dire("Appuyez sur "+TOUCHE+" pour coller la capture ici.", 6000);
  });
}

/* ---------- le petit menu ---------- */
var MENU = null;
function style(){
  if($("collerStyle")) return;
  var s = document.createElement("style"); s.id = "collerStyle";
  s.setAttribute("data-theme-propre", "");      /* ses couleurs vont en clair comme en sombre : theme.js n'y touche pas */
  s.textContent = ".coller-menu{position:fixed;z-index:2147483000;min-width:220px;max-width:min(320px,calc(100vw - 16px));padding:6px;border-radius:12px;"
    +"background:var(--card,#fff);color:var(--ink,#1c1e22);border:1px solid var(--rule,#d4d9e3);box-shadow:0 12px 32px rgba(15,23,42,.22);font:inherit;font-size:14px}"
    +".coller-menu p{margin:4px 10px 6px;font-size:12px;color:var(--ink-3,#767d8b)}"
    +".coller-menu button{display:flex;align-items:center;gap:10px;width:100%;min-height:38px;padding:8px 10px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}"
    +".coller-menu button:hover,.coller-menu button:focus-visible{background:var(--field,#eef2f8);outline:none}"
    +".coller-menu svg{width:18px;height:18px;flex:0 0 auto;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}"
    +".coller-menu small{display:block;color:var(--ink-3,#767d8b);font-size:12px}"
    +".coller-dire{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483001;max-width:min(520px,calc(100vw - 32px));padding:10px 16px;border-radius:12px;"
    +"background:#1c1e22!important;color:#fff!important;font-size:14px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,.25)}";
  document.head.appendChild(s);
}
var ICONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="4" width="10" height="4" rx="1"/><path d="M8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2"/><path d="m8.5 16.5 2.5-3 2 2 1.5-1.5 2 2.5"/></svg>';
function fermer(){ if(MENU){ MENU.remove(); MENU = null; } }
function ouvrirMenu(x, y, liste, fichiers){
  fermer(); style();
  var m = document.createElement("div"); m.className = "coller-menu"; m.setAttribute("role", "menu");
  if(fichiers){ var p = document.createElement("p"); p.textContent = "Ajouter la capture à :"; m.appendChild(p); }
  liste.forEach(function(c){
    var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem");
    var t = fichiers ? c.libelle : (liste.length > 1 ? "Coller la capture : "+c.libelle : "Coller la capture");
    b.innerHTML = ICONE+"<span></span>"; b.lastChild.textContent = t;
    if(!fichiers && liste.length === 1){ var sm = document.createElement("small"); sm.textContent = "ou "+TOUCHE; b.lastChild.appendChild(sm); }
    b.addEventListener("click", function(){ fermer(); if(fichiers) donner(c, fichiers); else collerDans(c); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  var r = m.getBoundingClientRect();
  if(x == null){ x = (innerWidth - r.width)/2; y = (innerHeight - r.height)/2; }
  m.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8))+"px";
  m.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8))+"px";
  MENU = m; Y0 = scrollY;
  var premier = m.querySelector("button"); if(premier) premier.focus({preventScroll:true});
}
document.addEventListener("pointerdown", function(e){ if(MENU && !MENU.contains(e.target)) fermer(); }, true);
document.addEventListener("keydown", function(e){ if(MENU && e.key === "Escape") fermer(); }, true);
/* la page qui défile vraiment ferme le menu (pas les petits recalages de la page) */
var Y0 = 0;
window.addEventListener("scroll", function(){ if(MENU && Math.abs(scrollY - Y0) > 60) fermer(); }, {passive:true});
window.addEventListener("resize", fermer);

var DIRE = null, DIRE_T = null;
function dire(t, ms){
  style();
  if(!DIRE){ DIRE = document.createElement("div"); DIRE.className = "coller-dire"; DIRE.setAttribute("role", "status"); }
  DIRE.textContent = t; document.body.appendChild(DIRE);
  clearTimeout(DIRE_T); DIRE_T = setTimeout(function(){ if(DIRE) DIRE.remove(); }, ms || 2800);
}

/* ---------- clic droit : sur un bouton d'ajout, ou dans son bloc ---------- */
document.addEventListener("contextmenu", function(e){
  var t = e.target;
  if(e.defaultPrevented || !t || !t.closest || champTexte(t) || t.closest("img, video, canvas, svg image, a[href], input, textarea, select, [contenteditable]")) return;
  if(String(window.getSelection ? window.getSelection() : "").trim()) return;
  var l = cibles(); if(!l.length) return;
  var sur = l.filter(function(c){ return c.bouton.contains(t); });
  if(!sur.length) sur = sansDoublon(l.filter(function(c){ return c.zone && c.zone.contains(t); }));
  if(!sur.length) return;
  e.preventDefault();
  ouvrirMenu(e.clientX, e.clientY, sur.slice(0, 6));
});

/* ---------- Ctrl+V hors d'un champ : après les collages que la page gère déjà ---------- */
window.addEventListener("paste", function(e){
  if(e.defaultPrevented) return;
  var fs = [].slice.call((e.clipboardData && e.clipboardData.files) || []);
  if(!fs.length) return;
  var l = cibles(); if(!l.length) return;
  /* dans un champ de saisie : une image seule (pas de texte) va au bloc du champ, comme le
     message d'une discussion ; un texte se colle normalement */
  if(champTexte(e.target)){
    if((e.clipboardData.getData("text") || "").trim()) return;
    l = l.filter(function(c){ return c.zone && c.zone.contains(e.target); });
    if(!l.length) return;
  }
  e.preventDefault();
  if(ARMEE && Date.now() - ARMEE_A < 60000 && visible(ARMEE.bouton)){ var a = ARMEE; ARMEE = null; donner(a, fs); return; }
  l = sansDoublon(l);
  if(l.length === 1){ donner(l[0], fs); return; }
  ouvrirMenu(null, null, l.slice(0, 8), fs);
});

window.Coller = {cibles:cibles, donner:donner};
})();
