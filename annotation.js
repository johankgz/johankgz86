/* Annotation des photos, croquis et plans : l'outil commun à toutes les applis.
   Chaque trait, texte, forme ou repère reste un objet : on le retouche, on le
   déplace, on change sa couleur même après avoir enregistré, car la photo
   d'origine est gardée à côté de l'image annotée.

   Annotation.ouvrir({image, objets, w, h, titre, fond, plan}) → Promise
     résolue avec {data, w, h, orig, objets, fond, reperes}, ou null si l'on
     ferme sans rien changer.
   Annotation.photo(ph, options) / Annotation.croquis(options) : raccourcis
     qui lisent et réécrivent directement une photo des fiches. */
(function(){
"use strict";

var COULEURS = [
  ["#E5484D","Rouge"], ["#FFFFFF","Blanc"], ["#111111","Noir"], ["#FDE047","Jaune"],
  ["#3B82F6","Bleu"], ["#22C55E","Vert"], ["#EA7A1E","Orange"]
];
var SURLIGNEURS = [["#FDE047","Jaune"], ["#86EFAC","Vert"], ["#F9A8D4","Rose"], ["#93C5FD","Bleu"]];
var FORMES = [
  ["rect","Rectangle",'<rect x="4" y="6" width="16" height="12" rx="1"/>'],
  ["cercle","Cercle",'<circle cx="12" cy="12" r="7.5"/>'],
  ["triangle","Triangle",'<path d="M12 4.5 20 19H4z"/>'],
  ["nuage","Nuage",'<path d="M6 17a3 3 0 0 1 0-6 4 4 0 0 1 7-3 3.5 3.5 0 0 1 5 3 3 3 0 0 1 0 6z"/>'],
  ["ligne","Ligne",'<path d="M4 19 20 5"/>'],
  ["fleche","Flèche",'<path d="M4 19 19 5"/><path d="M11 5h8v8"/>'],
  ["axe","Axe",'<path d="M3 12h5M10 12h1.5M13.5 12H21"/>'],
  ["cote","Cote",'<path d="M4 8v8M20 8v8M4 12h16"/><path d="M7 9.5 4 12l3 2.5M17 9.5l3 2.5-3 2.5"/>']
];
var LIGNES = {ligne:1, fleche:1, axe:1, cote:1};
var OUTILS = [
  ["stylo","Stylo",'<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>'],
  ["surligneur","Surligneur",'<path d="M9 14l6-10 4 2.5-6 10z"/><path d="M9 14l-1.5 4.5L12 17"/><path d="M4 21h16" stroke-width="3" stroke="#FDE047"/>'],
  ["texte","Texte",'<path d="M5 6V4h14v2"/><path d="M12 4v16"/><path d="M9 20h6"/>'],
  ["formes","Formes",'<rect x="3.5" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="4.5"/>'],
  ["gomme","Gomme",'<path d="M8.5 19.5 3.8 14.8a1.6 1.6 0 0 1 0-2.3l8-8a1.6 1.6 0 0 1 2.3 0l5.4 5.4a1.6 1.6 0 0 1 0 2.3l-7 7z"/><path d="M20.5 19.5H9"/>'],
  ["choisir","Choisir",'<path d="M5 3l14 8-6 1.5L10 19z"/>'],
  ["reperes","Repères",'<circle cx="12" cy="12" r="8"/><path d="M10.5 9.5 12 8.5V15.5"/>']
];
var ASTUCES = {
  stylo: "Dessinez. Gardez le doigt immobile une seconde en fin de tracé : le trait devient une forme parfaite.",
  surligneur: "Passez sur le texte photographié : il reste lisible dessous.",
  texte: "Touchez la photo pour écrire. Pincez à deux doigts pour agrandir, double-touche pour réécrire.",
  formes: "Tirez la forme du doigt. Poignées pour l'ajuster, deux doigts pour la tourner.",
  gomme: "La gomme coupe le trait là où elle passe ; la photo n'est jamais abîmée.",
  gommeEntier: "Touchez un trait, un texte ou une forme : il disparaît d'un coup.",
  choisir: "Touchez un élément : déplacez-le, changez sa couleur ou sa taille.",
  pastille: "Chaque touche pose le numéro suivant, repris dans la légende de la photo.",
  symbole: "Choisissez un symbole puis touchez l'endroit où le poser.",
  flou: "Tirez un cadre sur une plaque ou un visage : il sera flouté."
};
var EPAISSEURS = {fin:2.5, moyen:5, epais:10};
var SURL_EP = {fin:14, moyen:24, large:38};
var GOMMES = {petite:8, moyenne:16, grande:32};

/* ---------- symboles du métier (plans et photos) ---------- */
var SYMBOLES = [
  ["plafond","Point lumineux"], ["prise","Prise 16 A"], ["prise32","Prise 32 A"], ["prise2","Double prise"],
  ["inter","Interrupteur"], ["va","Va-et-vient"], ["poussoir","Bouton poussoir"], ["variateur","Variateur"],
  ["applique","Applique"], ["spot","Spot"], ["exterieur","Éclairage extérieur"], ["detecteur","Détecteur"],
  ["rj45","RJ45"], ["tv","TV"], ["sortie","Sortie de câble"], ["boite","Boîte de dérivation"],
  ["tableau","Tableau"], ["radiateur","Radiateur"], ["seche","Sèche-serviette"], ["pac","Pompe à chaleur"],
  ["vmc","VMC"], ["borne","Borne de recharge"], ["volet","Volet roulant"], ["interphone","Interphone"]
];
function dessinerSymbole(c, nom, x, y, r, couleur){
  c.save();
  c.translate(x, y);
  c.strokeStyle=couleur; c.fillStyle=couleur;
  c.lineWidth=Math.max(1.6, r*0.16); c.lineCap="round"; c.lineJoin="round";
  function cercle(plein){ c.beginPath(); c.arc(0,0,r,0,Math.PI*2); if(plein) c.fill(); else c.stroke(); }
  function demi(){ c.beginPath(); c.arc(0,0,r,Math.PI,0); c.closePath(); c.stroke(); }
  function trait(x1,y1,x2,y2){ c.beginPath(); c.moveTo(x1,y1); c.lineTo(x2,y2); c.stroke(); }
  function lettres(t, k){ c.font="bold "+(r*k)+"px Helvetica, Arial, sans-serif"; c.textAlign="center"; c.textBaseline="middle"; }
  switch(nom){
    case "prise":     demi(); trait(-r,0,r,0); trait(0,0,0,-r*0.72); break;
    case "prise32":   demi(); trait(-r,0,r,0); trait(0,0,0,-r*0.72);
                      lettres("32",0.8); c.textBaseline="alphabetic"; c.fillText("32", 0, r*0.95); break;
    case "prise2":    demi(); trait(-r,0,r,0); trait(0,0,0,-r*0.72); trait(-r*0.42,0,-r*0.42,-r*0.5); trait(r*0.42,0,r*0.42,-r*0.5); break;
    case "rj45":      demi(); trait(-r,0,r,0); lettres("RJ",0.72); c.textBaseline="alphabetic"; c.fillText("RJ", 0, -r*0.15); break;
    case "tv":        demi(); trait(-r,0,r,0); lettres("TV",0.72); c.textBaseline="alphabetic"; c.fillText("TV", 0, -r*0.15); break;
    case "inter":     cercle(true); trait(0,0,r*1.5,-r*1.25); break;
    case "va":        cercle(true); trait(0,0,r*1.5,-r*1.25); trait(r*0.5,-r*0.42,r*1.5,-r*0.42); break;
    case "poussoir":  cercle(false); trait(0,0,r*1.5,-r*1.25); c.beginPath(); c.arc(0,0,r*0.4,0,Math.PI*2); c.fill(); break;
    case "variateur": cercle(true); trait(0,0,r*1.5,-r*1.25); trait(r*0.9,-r*1.4,r*1.6,-r*0.6); break;
    case "plafond":   cercle(false); trait(-r*0.72,-r*0.72,r*0.72,r*0.72); trait(-r*0.72,r*0.72,r*0.72,-r*0.72); break;
    case "applique":  c.beginPath(); c.arc(0,0,r,Math.PI,0); c.closePath(); c.stroke();
                      trait(-r*1.15,0,r*1.15,0); trait(-r*0.6,-r*0.6,r*0.6,0); break;
    case "spot":      cercle(false); c.beginPath(); c.arc(0,0,r*0.42,0,Math.PI*2); c.fill(); break;
    case "exterieur": cercle(false); trait(-r*0.72,-r*0.72,r*0.72,r*0.72); trait(-r*0.72,r*0.72,r*0.72,-r*0.72);
                      c.beginPath(); c.arc(0,0,r*1.45,0,Math.PI*2); c.setLineDash([r*0.5,r*0.4]); c.stroke(); c.setLineDash([]); break;
    case "detecteur": cercle(false); lettres("D",0.85); c.fillText("D",0,0); break;
    case "sortie":    cercle(false); trait(0,0,r*1.4,0); break;
    case "boite":     c.strokeRect(-r,-r,r*2,r*2); trait(-r*0.5,-r,-r*0.5,r); trait(r*0.5,-r,r*0.5,r); break;
    case "tableau":   c.strokeRect(-r*1.3,-r,r*2.6,r*2); trait(-r*1.3,-r*0.3,r*1.3,-r*0.3);
                      trait(-r*0.6,-r*0.3,-r*0.6,r); trait(r*0.2,-r*0.3,r*0.2,r); break;
    case "radiateur": c.strokeRect(-r*1.3,-r*0.8,r*2.6,r*1.6);
                      trait(-r*0.6,-r*0.8,-r*0.6,r*0.8); trait(0,-r*0.8,0,r*0.8); trait(r*0.6,-r*0.8,r*0.6,r*0.8); break;
    case "seche":     c.strokeRect(-r*0.8,-r*1.2,r*1.6,r*2.4);
                      trait(-r*0.8,-r*0.5,r*0.8,-r*0.5); trait(-r*0.8,r*0.2,r*0.8,r*0.2); break;
    case "pac":       c.strokeRect(-r*1.3,-r,r*2.6,r*2);
                      c.beginPath(); c.arc(0,0,r*0.55,0,Math.PI*2); c.stroke();
                      trait(0,-r*0.55,0,r*0.55); trait(-r*0.55,0,r*0.55,0); break;
    case "vmc":       cercle(false); lettres("V",0.7); c.fillText("V",0,0); break;
    case "borne":     c.strokeRect(-r*0.75,-r*1.2,r*1.5,r*2.4);
                      c.beginPath(); c.moveTo(r*0.1,-r*0.7); c.lineTo(-r*0.3,r*0.05); c.lineTo(r*0.15,r*0.05); c.lineTo(-r*0.15,r*0.8); c.stroke(); break;
    case "volet":     c.strokeRect(-r*1.2,-r*0.9,r*2.4,r*1.8);
                      trait(-r*1.2,-r*0.3,r*1.2,-r*0.3); trait(-r*1.2,r*0.3,r*1.2,r*0.3); break;
    case "interphone":c.strokeRect(-r*0.8,-r*1.1,r*1.6,r*2.2);
                      c.beginPath(); c.arc(0,-r*0.35,r*0.35,0,Math.PI*2); c.stroke(); break;
    default:          cercle(false);
  }
  c.restore();
}
function nomSymbole(cle){
  for(var i=0;i<SYMBOLES.length;i++){ if(SYMBOLES[i][0]===cle) return SYMBOLES[i][1]; }
  return cle;
}

/* ---------- petits calculs ---------- */
function hyp(x, y){ return Math.sqrt(x*x + y*y); }
function dist(a, b){ return hyp(a[0]-b[0], a[1]-b[1]); }
function distSeg(p, a, b){
  var dx=b[0]-a[0], dy=b[1]-a[1], l=dx*dx+dy*dy;
  var t = l ? ((p[0]-a[0])*dx + (p[1]-a[1])*dy)/l : 0;
  t = t<0 ? 0 : (t>1 ? 1 : t);
  return hyp(p[0]-a[0]-t*dx, p[1]-a[1]-t*dy);
}
function tourner(p, c, a){
  var co=Math.cos(a), si=Math.sin(a), x=p[0]-c[0], y=p[1]-c[1];
  return [c[0] + x*co - y*si, c[1] + x*si + y*co];
}
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function borner(v, a, b){ return v<a ? a : (v>b ? b : v); }
function clair(c){
  var m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c||"");
  if(!m) return false;
  var r=parseInt(m[1],16), g=parseInt(m[2],16), b=parseInt(m[3],16);
  return (0.299*r + 0.587*g + 0.114*b) > 170;
}
function boiteDePoints(pts){
  var x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
  pts.forEach(function(p){ if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1]; });
  return {x0:x0, y0:y0, x1:x1, y1:y1, w:x1-x0, h:y1-y0, cx:(x0+x1)/2, cy:(y0+y1)/2};
}
/* simplification d'un tracé (Ramer-Douglas-Peucker) */
function simplifier(pts, eps){
  if(pts.length<3) return pts.slice();
  var dmax=0, idx=0, a=pts[0], b=pts[pts.length-1];
  for(var i=1;i<pts.length-1;i++){ var d=distSeg(pts[i], a, b); if(d>dmax){ dmax=d; idx=i; } }
  if(dmax>eps){
    var g=simplifier(pts.slice(0, idx+1), eps), dr=simplifier(pts.slice(idx), eps);
    return g.slice(0, -1).concat(dr);
  }
  return [a, b];
}
/* un tracé redécoupé à pas régulier, pour que la gomme coupe au bon endroit */
function reechantillonner(pts, pas){
  if(pts.length<2) return pts.slice();
  var out=[pts[0]];
  for(var i=1;i<pts.length;i++){
    var a=pts[i-1], b=pts[i], d=dist(a,b), n=Math.floor(d/pas);
    for(var k=1;k<=n;k++){ var t=k*pas/d; if(t<1) out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]); }
    out.push(b);
  }
  return out;
}

/* ---------- l'état de l'outil ---------- */
var A = null, D = null, MESURE = null;
var FLOUS = {};
var PREFS = {outil:"stylo", couleur:"#E5484D", surCouleur:"#FDE047", ep:"moyen", surEp:"moyen", droit:true,
  gommeMode:"partielle", gomme:"moyenne", forme:"fleche", rempli:false, repere:"pastille", symbole:"plafond",
  texteStyle:"bulle", texteTaille:40};
try{
  var lu = JSON.parse(localStorage.getItem("annotation:prefs") || "null");
  if(lu && typeof lu === "object") for(var kp in lu){ if(PREFS.hasOwnProperty(kp)) PREFS[kp]=lu[kp]; }
}catch(e){}
function garderPrefs(){
  try{ localStorage.setItem("annotation:prefs", JSON.stringify(PREFS)); }catch(e){}
}

function mctx(){
  if(!MESURE) MESURE = document.createElement("canvas").getContext("2d");
  return MESURE;
}
function policeTexte(t){ return "bold " + t + "px Helvetica, Arial, sans-serif"; }
function mesureTexte(o){
  var c=mctx(), lignes=String(o.s||"").split("\n"), lw=0;
  c.font = policeTexte(o.taille);
  lignes.forEach(function(l){ var w=c.measureText(l||" ").width; if(w>lw) lw=w; });
  if(!o.s) lw = Math.max(lw, o.taille*1.2);
  var lh=o.taille*1.2, pad=o.taille*0.32;
  return {lignes:lignes, lw:lw, lh:lh, pad:pad, W:lw+pad*2, H:lignes.length*lh+pad*1.3};
}

/* la boîte d'un objet, dans son repère tourné : centre, largeur, hauteur, angle */
function boite(o){
  var u = A ? A.u : 1;
  switch(o.t){
    case "trait":
      var b=boiteDePoints(o.pts), m=o.e/2;
      return {cx:b.cx, cy:b.cy, w:b.w+2*m, h:b.h+2*m, rot:0};
    case "texte":
      var mt=mesureTexte(o);
      return {cx:o.x, cy:o.y, w:mt.W, h:mt.H, rot:o.rot||0};
    case "forme": case "flou":
      return {cx:o.cx, cy:o.cy, w:o.w, h:o.h, rot:o.rot||0};
    case "ligne":
      var bl=boiteDePoints([[o.x1,o.y1],[o.x2,o.y2]]);
      return {cx:bl.cx, cy:bl.cy, w:bl.w+o.e, h:bl.h+o.e, rot:0};
    case "pastille":
      return {cx:o.x, cy:o.y, w:o.r*2, h:o.r*2, rot:0};
    case "symbole":
      return {cx:o.x, cy:o.y, w:o.r*3.2, h:o.r*3.2, rot:o.rot||0};
  }
  return {cx:0, cy:0, w:10*u, h:10*u, rot:0};
}
function versLocal(b, p){
  var q=tourner(p, [b.cx, b.cy], -(b.rot||0));
  return [q[0]-b.cx, q[1]-b.cy];
}

/* ---------- dessin ---------- */
function cheminLisse(c, pts){
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  if(pts.length===1){ c.lineTo(pts[0][0]+0.1, pts[0][1]); return; }
  if(pts.length===2){ c.lineTo(pts[1][0], pts[1][1]); return; }
  for(var i=1;i<pts.length-1;i++){
    var mx=(pts[i][0]+pts[i+1][0])/2, my=(pts[i][1]+pts[i+1][1])/2;
    c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  var d=pts[pts.length-1];
  c.lineTo(d[0], d[1]);
}
function cheminForme(c, f, w, h){
  var x=-w/2, y=-h/2;
  c.beginPath();
  if(f==="cercle"){ c.ellipse(0, 0, Math.max(0.5,w/2), Math.max(0.5,h/2), 0, 0, Math.PI*2); return; }
  if(f==="triangle"){ c.moveTo(0, y); c.lineTo(w/2, h/2); c.lineTo(x, h/2); c.closePath(); return; }
  if(f==="nuage"){
    /* nuage de révision : des festons tout autour du cadre */
    var d=borner(Math.min(w,h)/4, 6, 60);
    var coins=[[x,y],[-x,y],[-x,-y],[x,-y]];
    c.moveTo(x, y);
    for(var i=0;i<4;i++){
      var a=coins[i], b=coins[(i+1)%4], l=dist(a,b), n=Math.max(1, Math.round(l/d));
      var nx=(b[1]-a[1])/l, ny=-(b[0]-a[0])/l;
      for(var k=0;k<n;k++){
        var t0=k/n, t1=(k+1)/n, tm=(t0+t1)/2, bosse=l/n*0.55;
        c.quadraticCurveTo(a[0]+(b[0]-a[0])*tm - nx*bosse, a[1]+(b[1]-a[1])*tm - ny*bosse,
                           a[0]+(b[0]-a[0])*t1, a[1]+(b[1]-a[1])*t1);
      }
    }
    c.closePath();
    return;
  }
  c.rect(x, y, w, h);
}
function pointe(c, x, y, ang, L){
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - L*Math.cos(ang - 0.42), y - L*Math.sin(ang - 0.42));
  c.lineTo(x - L*Math.cos(ang + 0.42), y - L*Math.sin(ang + 0.42));
  c.closePath(); c.fill();
}
function dessinerLigne(c, o){
  var u=A.u, ang=Math.atan2(o.y2-o.y1, o.x2-o.x1), len=hyp(o.x2-o.x1, o.y2-o.y1);
  var L=Math.min(Math.max(o.e*4, 16*u), len*0.45);
  c.save();
  c.strokeStyle=o.c; c.fillStyle=o.c; c.lineWidth=o.e; c.lineCap="round"; c.lineJoin="round";
  var ax=o.x1, ay=o.y1, bx=o.x2, by=o.y2;
  if(o.f==="fleche" || o.f==="cote"){ bx -= Math.cos(ang)*L*0.8; by -= Math.sin(ang)*L*0.8; }
  if(o.f==="cote"){ ax += Math.cos(ang)*L*0.8; ay += Math.sin(ang)*L*0.8; }
  if(o.f==="axe"){ var e=o.e; c.setLineDash([e*5+12*u, e*1.6+6*u, e*0.4+1*u, e*1.6+6*u]); c.lineCap="butt"; }
  c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
  c.setLineDash([]);
  if(o.f==="fleche" || o.f==="cote") pointe(c, o.x2, o.y2, ang, L);
  if(o.f==="cote"){
    pointe(c, o.x1, o.y1, ang+Math.PI, L);
    var tk=L*0.9, px=-Math.sin(ang)*tk, py=Math.cos(ang)*tk;
    c.lineWidth=Math.max(1, o.e*0.6);
    c.beginPath(); c.moveTo(o.x1-px, o.y1-py); c.lineTo(o.x1+px, o.y1+py);
    c.moveTo(o.x2-px, o.y2-py); c.lineTo(o.x2+px, o.y2+py); c.stroke();
    if(o.val){
      var fs=Math.max(18*u, o.e*3.2+10*u), a2=ang;
      if(a2>Math.PI/2) a2-=Math.PI; if(a2<=-Math.PI/2) a2+=Math.PI;
      var mx=(o.x1+o.x2)/2, my=(o.y1+o.y2)/2, off=fs*0.75;
      c.translate(mx + Math.sin(a2)*off, my - Math.cos(a2)*off);
      c.rotate(a2);
      c.font=policeTexte(fs); c.textAlign="center"; c.textBaseline="middle";
      c.lineWidth=fs*0.22; c.strokeStyle=clair(o.c) ? "#111111" : "#FFFFFF"; c.lineJoin="round";
      c.strokeText(o.val, 0, 0); c.fillText(o.val, 0, 0);
    }
  }
  c.restore();
}
function dessinerTexte(c, o, sansLettres){
  var m=mesureTexte(o);
  c.save();
  c.translate(o.x, o.y); c.rotate(o.rot||0);
  var st=o.style||"bulle";
  if(st==="bulle"){
    c.fillStyle = clair(o.c) ? "rgba(17,17,17,.88)" : "rgba(255,255,255,.94)";
    var r=o.taille*0.3, x=-m.W/2, y=-m.H/2;
    c.beginPath();
    c.moveTo(x+r, y); c.arcTo(x+m.W, y, x+m.W, y+m.H, r); c.arcTo(x+m.W, y+m.H, x, y+m.H, r);
    c.arcTo(x, y+m.H, x, y, r); c.arcTo(x, y, x+m.W, y, r); c.closePath(); c.fill();
  }
  if(!sansLettres){
    c.font=policeTexte(o.taille); c.textAlign="center"; c.textBaseline="middle"; c.fillStyle=o.c;
    var y0=-m.H/2 + m.pad*0.65 + m.lh/2;
    m.lignes.forEach(function(l, i){
      if(st==="contour"){
        c.lineWidth=o.taille*0.2; c.lineJoin="round"; c.strokeStyle=clair(o.c) ? "#111111" : "#FFFFFF";
        c.strokeText(l, 0, y0 + i*m.lh);
      }
      c.fillText(l, 0, y0 + i*m.lh);
    });
  }
  c.restore();
}
function dessinerFlou(c, o){
  if(!A.img) return;
  var x=o.cx-o.w/2, y=o.cy-o.h/2;
  var cle=[Math.round(x),Math.round(y),Math.round(o.w),Math.round(o.h)].join(",");
  var pc=FLOUS[cle];
  if(!pc){
    var bloc=Math.max(8*A.u, Math.min(o.w, o.h)/7);
    pc=document.createElement("canvas");
    pc.width=Math.max(1, Math.round(o.w/bloc)); pc.height=Math.max(1, Math.round(o.h/bloc));
    try{ pc.getContext("2d").drawImage(A.img, x, y, o.w, o.h, 0, 0, pc.width, pc.height); }catch(e){}
    FLOUS[cle]=pc;
  }
  c.save();
  c.beginPath(); c.rect(x, y, o.w, o.h); c.clip();
  c.imageSmoothingEnabled=false;
  c.drawImage(pc, x, y, o.w, o.h);
  c.restore();
}
function dessinerObjet(c, o){
  if(o.t==="trait"){
    c.save();
    c.strokeStyle=o.c; c.lineWidth=o.e; c.lineJoin="round";
    c.lineCap = (o.sur && o.droit) ? "butt" : "round";
    if(o.sur){ c.globalAlpha=0.45; c.globalCompositeOperation="multiply"; }
    cheminLisse(c, o.pts); c.stroke();
    c.restore();
  } else if(o.t==="texte"){
    dessinerTexte(c, o, A.edition===o);
  } else if(o.t==="forme"){
    c.save();
    c.translate(o.cx, o.cy); c.rotate(o.rot||0);
    c.strokeStyle=o.c; c.fillStyle=o.c; c.lineWidth=o.e; c.lineJoin="round";
    cheminForme(c, o.f, o.w, o.h);
    if(o.rempli){ c.globalAlpha=0.22; c.fill(); c.globalAlpha=1; }
    c.stroke();
    c.restore();
  } else if(o.t==="ligne"){
    dessinerLigne(c, o);
  } else if(o.t==="pastille"){
    c.save();
    c.beginPath(); c.arc(o.x, o.y, o.r, 0, Math.PI*2);
    c.fillStyle=o.c; c.fill();
    c.lineWidth=o.r*0.14; c.strokeStyle=clair(o.c) ? "#111111" : "#FFFFFF"; c.stroke();
    c.fillStyle=clair(o.c) ? "#111111" : "#FFFFFF";
    c.font=policeTexte(o.r*(o.n>9 ? 0.95 : 1.15)); c.textAlign="center"; c.textBaseline="middle";
    c.fillText(String(o.n), o.x, o.y + o.r*0.05);
    c.restore();
  } else if(o.t==="symbole"){
    c.save();
    c.translate(o.x, o.y); c.rotate(o.rot||0);
    dessinerSymbole(c, o.nom, 0, 0, o.r, o.c);
    c.restore();
    if(o.label){
      c.save();
      c.font=policeTexte(Math.round(o.r*1.15)); c.textAlign="center"; c.textBaseline="top";
      c.lineWidth=o.r*0.25; c.lineJoin="round"; c.strokeStyle=clair(o.c) ? "#111111" : "#FFFFFF";
      c.strokeText(o.label, o.x, o.y + o.r*1.6);
      c.fillStyle=o.c; c.fillText(o.label, o.x, o.y + o.r*1.6);
      c.restore();
    }
  }
}
/* la scène complète, dans le repère de l'image */
function dessinerScene(c, objs){
  if(A.img){
    c.drawImage(A.img, 0, 0, A.w, A.h);
  } else {
    c.fillStyle="#FFFFFF"; c.fillRect(0, 0, A.w, A.h);
    if(A.fond==="grille"){
      c.strokeStyle="#DDE1E5"; c.lineWidth=1;
      for(var x=50;x<A.w;x+=50){ c.beginPath(); c.moveTo(x,0); c.lineTo(x,A.h); c.stroke(); }
      for(var y=50;y<A.h;y+=50){ c.beginPath(); c.moveTo(0,y); c.lineTo(A.w,y); c.stroke(); }
    }
  }
  objs.forEach(function(o){ if(o.t==="flou") dessinerFlou(c, o); });
  objs.forEach(function(o){ if(o.t!=="flou") dessinerObjet(c, o); });
}

/* ---------- les poignées de l'élément choisi ---------- */
function poignees(o){
  var k=A.vue.k, b=boite(o), out=[];
  function coin(id, sx, sy){
    var p=tourner([b.cx + sx*b.w/2, b.cy + sy*b.h/2], [b.cx,b.cy], b.rot);
    out.push({id:id, x:p[0], y:p[1], sx:sx, sy:sy});
  }
  if(o.t==="ligne"){
    out.push({id:"p1", x:o.x1, y:o.y1}); out.push({id:"p2", x:o.x2, y:o.y2});
    return out;
  }
  if(o.t==="forme" || o.t==="flou"){
    coin("c", -1, -1); coin("c", 1, -1); coin("c", 1, 1); coin("c", -1, 1);
  } else if(o.t==="texte" || o.t==="symbole" || o.t==="pastille"){
    coin("echelle", 1, 1);
  }
  if(o.t==="forme" || o.t==="texte" || o.t==="symbole"){
    var r=tourner([b.cx, b.cy - b.h/2 - 34/k], [b.cx,b.cy], b.rot);
    out.push({id:"rot", x:r[0], y:r[1]});
  }
  return out;
}
function dessinerSelection(c){
  var o=A.sel; if(!o) return;
  var k=A.vue.k;
  c.save();
  c.strokeStyle="#EA7A1E"; c.lineWidth=1.6/k; c.setLineDash([7/k, 5/k]);
  if(o.t==="ligne"){
    c.beginPath(); c.moveTo(o.x1,o.y1); c.lineTo(o.x2,o.y2); c.stroke();
  } else {
    var b=boite(o), m=6/k;
    c.translate(b.cx, b.cy); c.rotate(b.rot);
    c.strokeRect(-b.w/2-m, -b.h/2-m, b.w+2*m, b.h+2*m);
    if(o.t==="forme" || o.t==="texte" || o.t==="symbole"){
      c.beginPath(); c.moveTo(0, -b.h/2-m); c.lineTo(0, -b.h/2-34/k); c.stroke();
    }
  }
  c.restore();
  c.save();
  poignees(o).forEach(function(h){
    c.beginPath(); c.arc(h.x, h.y, (h.id==="rot" ? 8 : 9)/k, 0, Math.PI*2);
    c.fillStyle = h.id==="rot" ? "#EA7A1E" : "#FFFFFF"; c.fill();
    c.lineWidth=2/k; c.strokeStyle = h.id==="rot" ? "#FFFFFF" : "#EA7A1E"; c.stroke();
  });
  c.restore();
}

/* ---------- toucher un élément ---------- */
function touche(o, p, tol, strict){
  if(o.t==="trait"){
    var lim=o.e/2 + tol;
    if(o.pts.length===1) return dist(p, o.pts[0]) <= lim;
    for(var i=1;i<o.pts.length;i++){ if(distSeg(p, o.pts[i-1], o.pts[i]) <= lim) return true; }
    return false;
  }
  if(o.t==="ligne"){
    if(distSeg(p, [o.x1,o.y1], [o.x2,o.y2]) <= o.e/2 + tol) return true;
    if(o.f==="cote" && o.val) return dist(p, [(o.x1+o.x2)/2, (o.y1+o.y2)/2]) <= 40*A.u + tol;
    return false;
  }
  if(o.t==="pastille") return dist(p, [o.x, o.y]) <= o.r + tol;
  var b=boite(o), q=versLocal(b, p), hw=b.w/2 + tol, hh=b.h/2 + tol;
  var dedans = Math.abs(q[0]) <= hw && Math.abs(q[1]) <= hh;
  if(!dedans) return false;
  if(o.t==="forme" && strict && !o.rempli){
    var bord = o.e/2 + tol;
    if(o.f==="cercle"){
      var a=Math.max(1, b.w/2), bb=Math.max(1, b.h/2);
      var rho=hyp(q[0]/a, q[1]/bb);
      return Math.abs(rho-1) * (a+bb)/2 <= bord;
    }
    return Math.abs(q[0]) >= b.w/2 - bord || Math.abs(q[1]) >= b.h/2 - bord;
  }
  return true;
}
function trouver(p, filtre){
  var tol=12/A.vue.k, i, o;
  for(i=A.objs.length-1;i>=0;i--){ o=A.objs[i]; if((!filtre || filtre(o)) && touche(o, p, tol, true)) return o; }
  for(i=A.objs.length-1;i>=0;i--){ o=A.objs[i]; if((!filtre || filtre(o)) && touche(o, p, tol, false)) return o; }
  return null;
}
function poigneeSous(s){
  if(!A.sel) return null;
  var hs=poignees(A.sel);
  for(var i=0;i<hs.length;i++){
    var e=versEcran([hs[i].x, hs[i].y]);
    if(hyp(e[0]-s[0], e[1]-s[1]) <= 22) return hs[i];
  }
  return null;
}

/* ---------- transformer un élément ---------- */
function deplacer(o, base, dx, dy){
  if(o.t==="trait"){ o.pts = base.pts.map(function(p){ return [p[0]+dx, p[1]+dy]; }); return; }
  if(o.t==="ligne"){ o.x1=base.x1+dx; o.y1=base.y1+dy; o.x2=base.x2+dx; o.y2=base.y2+dy; return; }
  if(o.t==="forme" || o.t==="flou"){ o.cx=base.cx+dx; o.cy=base.cy+dy; return; }
  o.x=base.x+dx; o.y=base.y+dy;
}
function transformer(o, base, s, da, dx, dy){
  var u=A.u;
  if(o.t==="texte"){
    o.taille=borner(base.taille*s, 6*u, 400*u); o.rot=aimanter((base.rot||0)+da);
    o.x=base.x+dx; o.y=base.y+dy;
  } else if(o.t==="forme" || o.t==="flou"){
    o.w=Math.max(8*u, base.w*s); o.h=Math.max(8*u, base.h*s);
    if(o.t==="forme") o.rot=aimanter((base.rot||0)+da);
    o.cx=base.cx+dx; o.cy=base.cy+dy;
  } else if(o.t==="pastille"){
    o.r=borner(base.r*s, 6*u, 200*u); o.x=base.x+dx; o.y=base.y+dy;
  } else if(o.t==="symbole"){
    o.r=borner(base.r*s, 5*u, 200*u); o.rot=aimanter((base.rot||0)+da); o.x=base.x+dx; o.y=base.y+dy;
  } else if(o.t==="ligne"){
    var c=[(base.x1+base.x2)/2, (base.y1+base.y2)/2];
    var p1=tourner([c[0]+(base.x1-c[0])*s, c[1]+(base.y1-c[1])*s], c, da);
    var p2=tourner([c[0]+(base.x2-c[0])*s, c[1]+(base.y2-c[1])*s], c, da);
    o.x1=p1[0]+dx; o.y1=p1[1]+dy; o.x2=p2[0]+dx; o.y2=p2[1]+dy;
  } else if(o.t==="trait"){
    var b=boiteDePoints(base.pts), cc=[b.cx, b.cy];
    o.pts=base.pts.map(function(p){
      var q=tourner([cc[0]+(p[0]-cc[0])*s, cc[1]+(p[1]-cc[1])*s], cc, da);
      return [q[0]+dx, q[1]+dy];
    });
    o.e=borner(base.e*s, 1, 200*u);
  }
}
/* un angle presque droit devient droit */
function aimanter(a){
  var q=Math.PI/2, n=Math.round(a/q);
  return Math.abs(a - n*q) < 0.07 ? n*q : a;
}
function tirerPoignee(o, h, base, p, p0){
  var u=A.u;
  if(h.id==="p1"){ o.x1=p[0]; o.y1=p[1]; return; }
  if(h.id==="p2"){ o.x2=p[0]; o.y2=p[1]; return; }
  var b=boite(base);
  if(h.id==="rot"){
    o.rot=aimanter(Math.atan2(p[1]-b.cy, p[0]-b.cx) + Math.PI/2);
    return;
  }
  if(h.id==="echelle"){
    var r=dist(p, [b.cx,b.cy]) / Math.max(1, dist(p0, [b.cx,b.cy]));
    if(o.t==="texte") o.taille=borner(base.taille*r, 6*u, 400*u);
    else o.r=borner(base.r*r, 5*u, 200*u);
    return;
  }
  /* un coin : le coin opposé ne bouge pas */
  var q=versLocal(b, p), ax=-h.sx*b.w/2, ay=-h.sy*b.h/2;
  var w=Math.max(8*u, Math.abs(q[0]-ax)), hh=Math.max(8*u, Math.abs(q[1]-ay));
  var mx=ax + h.sx*w/2, my=ay + h.sy*hh/2;
  var c=tourner([b.cx+mx, b.cy+my], [b.cx,b.cy], b.rot);
  o.w=w; o.h=hh; o.cx=c[0]; o.cy=c[1];
}

/* ---------- gomme ---------- */
function rayonGomme(){ return GOMMES[PREFS.gomme]*A.u/borner(A.vue.k/A.fitK, 1, 4); }
function gommer(a, b){
  var R=rayonGomme(), change=false;
  if(PREFS.gommeMode==="entier"){
    var tol=R, pas=Math.max(1, Math.ceil(dist(a,b)/Math.max(1,R/2)));
    A.objs = A.objs.filter(function(o){
      for(var i=0;i<=pas;i++){
        var t=i/pas, p=[a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t];
        if(touche(o, p, tol, true)){ change=true; return false; }
      }
      return true;
    });
    if(change && A.sel && A.objs.indexOf(A.sel)<0) A.sel=null;
    return change;
  }
  var out=[];
  A.objs.forEach(function(o){
    if(o.t!=="trait"){ out.push(o); return; }
    var r=R + o.e/2, bb=boiteDePoints(o.pts);
    if(Math.max(a[0],b[0]) < bb.x0-r || Math.min(a[0],b[0]) > bb.x1+r ||
       Math.max(a[1],b[1]) < bb.y0-r || Math.min(a[1],b[1]) > bb.y1+r){ out.push(o); return; }
    var pts=reechantillonner(o.pts, Math.max(0.8, r/3)), morceaux=[], cur=[], coupe=false;
    pts.forEach(function(p){
      if(distSeg(p, a, b) <= r){ coupe=true; if(cur.length) morceaux.push(cur); cur=[]; }
      else cur.push(p);
    });
    if(cur.length) morceaux.push(cur);
    if(!coupe){ out.push(o); return; }
    change=true;
    morceaux.forEach(function(m){
      if(m.length<2) return;
      var n=clone(o); n.pts=m; out.push(n);
    });
  });
  if(change){ A.objs=out; if(A.sel && out.indexOf(A.sel)<0) A.sel=null; }
  return change;
}

/* ---------- un trait maintenu devient une forme parfaite ---------- */
function reconnaitre(pts){
  if(pts.length<6) return null;
  var b=boiteDePoints(pts), diag=hyp(b.w, b.h);
  if(diag < 30*A.u) return null;
  var ferme = dist(pts[0], pts[pts.length-1]) < diag*0.28;
  if(!ferme){
    var ecart=0;
    pts.forEach(function(p){ var d=distSeg(p, pts[0], pts[pts.length-1]); if(d>ecart) ecart=d; });
    if(ecart < diag*0.09) return {t:"ligne", f:"ligne", x1:pts[0][0], y1:pts[0][1], x2:pts[pts.length-1][0], y2:pts[pts.length-1][1]};
    return null;
  }
  /* sommets du polygone : simplification puis retrait des angles presque plats */
  var boucle=pts.concat([pts[0]]);
  var s=simplifier(boucle, diag*0.06);
  s.pop();
  var change=true;
  while(change && s.length>3){
    change=false;
    for(var i=0;i<s.length;i++){
      var p0=s[(i-1+s.length)%s.length], p1=s[i], p2=s[(i+1)%s.length];
      var a1=Math.atan2(p1[1]-p0[1], p1[0]-p0[0]), a2=Math.atan2(p2[1]-p1[1], p2[0]-p1[0]);
      var d=Math.abs(Math.atan2(Math.sin(a2-a1), Math.cos(a2-a1)));
      if(d < 0.5 || dist(p0,p1) < diag*0.08){ s.splice(i,1); change=true; break; }
    }
  }
  /* écart moyen au polygone et à l'ellipse : la forme la plus fidèle l'emporte */
  var a=Math.max(1,b.w/2), bb=Math.max(1,b.h/2), eEll=0, ePol=0;
  pts.forEach(function(p){
    eEll += Math.abs(hyp((p[0]-b.cx)/a, (p[1]-b.cy)/bb) - 1) * (a+bb)/2;
    var m=Infinity;
    for(var j=0;j<s.length;j++){ var d=distSeg(p, s[j], s[(j+1)%s.length]); if(d<m) m=d; }
    ePol += m;
  });
  eEll/=pts.length; ePol/=pts.length;
  if((s.length===3 || s.length===4) && ePol < eEll*0.8){
    if(s.length===3) return {t:"forme", f:"triangle", cx:b.cx, cy:b.cy, w:b.w, h:b.h, rot:0};
    var rot=aimanter(Math.atan2(s[1][1]-s[0][1], s[1][0]-s[0][0]));
    rot = ((rot % (Math.PI/2)) + Math.PI/2) % (Math.PI/2);
    if(rot > Math.PI/4) rot -= Math.PI/2;
    if(Math.abs(rot) < 0.14) return {t:"forme", f:"rect", cx:b.cx, cy:b.cy, w:b.w, h:b.h, rot:0};
    var cx=0, cy=0; s.forEach(function(p){ cx+=p[0]; cy+=p[1]; }); cx/=4; cy/=4;
    var loc=s.map(function(p){ return tourner(p, [cx,cy], -rot); }), bl=boiteDePoints(loc);
    return {t:"forme", f:"rect", cx:cx, cy:cy, w:bl.w, h:bl.h, rot:rot};
  }
  return {t:"forme", f:"cercle", cx:b.cx, cy:b.cy, w:b.w, h:b.h, rot:0};
}

/* ---------- vue : zoom et déplacement ---------- */
function versImage(s){ return [(s[0]-A.vue.x)/A.vue.k, (s[1]-A.vue.y)/A.vue.k]; }
function versEcran(p){ return [p[0]*A.vue.k + A.vue.x, p[1]*A.vue.k + A.vue.y]; }
function bornerVue(){
  var v=A.vue, W=A.sw, H=A.sh;
  v.k=borner(v.k, A.fitK, A.fitK*10);
  var iw=A.w*v.k, ih=A.h*v.k;
  v.x = iw<=W ? (W-iw)/2 : borner(v.x, W-iw, 0);
  v.y = ih<=H ? (H-ih)/2 : borner(v.y, H-ih, 0);
}
function ajuster(garder){
  var sc=D.scene, W=sc.clientWidth, H=sc.clientHeight;
  if(!W || !H) return;
  var dpr=Math.min(2.5, window.devicePixelRatio || 1);
  garder = garder && W===A.sw;
  A.sw=W; A.sh=H; A.dpr=dpr;
  D.cv.width=Math.round(W*dpr); D.cv.height=Math.round(H*dpr);
  D.cv.style.width=W+"px"; D.cv.style.height=H+"px";
  var fit=Math.min((W-16)/A.w, (H-16)/A.h);
  if(garder){ A.fitK=Math.min(fit, A.vue.k); }
  else { A.fitK=fit; A.vue={k:fit, x:0, y:0}; }
  bornerVue();
}
function zoomer(f, s){
  var v=A.vue, m=versImage(s);
  v.k=borner(v.k*f, A.fitK, A.fitK*10);
  v.x=s[0]-m[0]*v.k; v.y=s[1]-m[1]*v.k;
  bornerVue(); peindre(); majHaut();
}

function peindre(){
  if(!A) return;
  var c=D.cv.getContext("2d"), v=A.vue, dpr=A.dpr;
  c.setTransform(1,0,0,1,0,0);
  c.fillStyle="#1A1F26"; c.fillRect(0, 0, D.cv.width, D.cv.height);
  c.setTransform(dpr*v.k, 0, 0, dpr*v.k, dpr*v.x, dpr*v.y);
  c.save();
  c.beginPath(); c.rect(0, 0, A.w, A.h); c.clip();
  dessinerScene(c, A.objs);
  if(A.outil==="reperes" || (A.sel && A.sel.t==="flou")){
    A.objs.forEach(function(o){
      if(o.t!=="flou") return;
      c.save(); c.strokeStyle="rgba(255,255,255,.85)"; c.lineWidth=1.5/v.k; c.setLineDash([5/v.k,4/v.k]);
      c.strokeRect(o.cx-o.w/2, o.cy-o.h/2, o.w, o.h); c.restore();
    });
  }
  c.restore();
  dessinerSelection(c);
  if(A.curseur && A.outil==="gomme"){
    var R=rayonGomme();
    c.beginPath(); c.arc(A.curseur[0], A.curseur[1], R, 0, Math.PI*2);
    c.lineWidth=1.5/v.k; c.strokeStyle="#FFFFFF"; c.stroke();
    c.beginPath(); c.arc(A.curseur[0], A.curseur[1], R+1.5/v.k, 0, Math.PI*2);
    c.strokeStyle="rgba(0,0,0,.6)"; c.stroke();
  }
  if(A.edition) placerEditeur();
}

/* ---------- historique ---------- */
function photo(){ return JSON.stringify(A.objs); }
function valider(avant){
  if(avant===undefined || avant===null) return;
  if(photo()===avant) return;
  A.hist.push(avant); if(A.hist.length>80) A.hist.shift();
  A.redo=[]; A.modifie=true;
  majHaut();
}
function modifier(fn){
  var avant=photo();
  fn();
  valider(avant);
  peindre();
}
function annuler(){
  finirEdition();
  if(!A.hist.length) return;
  A.redo.push(photo());
  A.objs=JSON.parse(A.hist.pop());
  A.sel=null; A.modifie=true;
  peindre(); majUI();
}
function retablir(){
  finirEdition();
  if(!A.redo.length) return;
  A.hist.push(photo());
  A.objs=JSON.parse(A.redo.pop());
  A.sel=null; A.modifie=true;
  peindre(); majUI();
}

/* ---------- édition d'un texte, directement sur la photo ---------- */
function editer(o){
  if(A.edition && A.edition!==o) finirEdition();
  A.sel=o; A.edition=o; A.avantEdition = A.avantEdition || null;
  var t=D.saisie;
  t.value=o.s||"";
  t.hidden=false;
  placerEditeur();
  try{ t.focus({preventScroll:true}); }catch(e){ t.focus(); }
  try{ t.setSelectionRange(t.value.length, t.value.length); }catch(e){}
  peindre(); majUI();
}
function placerEditeur(){
  var o=A.edition, t=D.saisie; if(!o) return;
  var m=mesureTexte(o), k=A.vue.k, e=versEcran([o.x, o.y]);
  var w=m.lw*k + 12, h=m.lignes.length*m.lh*k + 4;
  t.style.font = "bold " + (o.taille*k) + "px Helvetica, Arial, sans-serif";
  t.style.lineHeight = (m.lh*k) + "px";
  t.style.color = o.c;
  t.style.width = w + "px"; t.style.height = h + "px";
  t.style.left = (e[0]-w/2) + "px"; t.style.top = (e[1]-h/2 + (m.pad*0.65 - (m.H - m.lignes.length*m.lh)/2)*k) + "px";
  t.style.transform = "rotate(" + (o.rot||0) + "rad)";
}
function finirEdition(){
  if(!A || !A.edition) return;
  var o=A.edition, avant=A.avantEdition;
  A.edition=null; A.avantEdition=null;
  D.saisie.hidden=true;
  try{ D.saisie.blur(); }catch(e){}
  o.s = String(o.s||"").replace(/\s+$/,"");
  if(!o.s.trim()){
    var i=A.objs.indexOf(o); if(i>=0) A.objs.splice(i,1);
    if(A.sel===o) A.sel=null;
  }
  valider(avant);
  peindre(); majUI();
}

/* ---------- gestes ---------- */
var DOIGTS = {}, G = null, DERNIER_TAP = {t:0, o:null}, MAINTIEN = null;
function restaurer(o, base){
  Object.keys(o).forEach(function(k){ delete o[k]; });
  var b=clone(base); Object.keys(b).forEach(function(k){ o[k]=b[k]; });
}
function nbDoigts(){ return Object.keys(DOIGTS).length; }
function deuxDoigts(){
  var k=Object.keys(DOIGTS), a=DOIGTS[k[0]], b=DOIGTS[k[1]];
  return {m:[(a[0]+b[0])/2, (a[1]+b[1])/2], d:Math.max(1, hyp(a[0]-b[0], a[1]-b[1])), a:Math.atan2(b[1]-a[1], b[0]-a[0]), p:[a,b]};
}
function posEcran(e){
  var r=D.cv.getBoundingClientRect();
  return [e.clientX-r.left, e.clientY-r.top];
}
function ep(){ return EPAISSEURS[PREFS.ep]*A.u; }
function nouveau(o){ A.objs.push(o); return o; }
function prochainNumero(){
  var n=0; A.objs.forEach(function(o){ if(o.t==="pastille" && o.n>n) n=o.n; });
  return n+1;
}
function arreterMaintien(){ if(MAINTIEN){ clearTimeout(MAINTIEN); MAINTIEN=null; } }
function armerMaintien(){
  arreterMaintien();
  if(!G || G.type!=="dessin" || G.o.sur) return;
  MAINTIEN=setTimeout(function(){
    MAINTIEN=null;
    if(!G || G.type!=="dessin") return;
    var f=reconnaitre(G.o.pts);
    if(!f) return;
    f.c=G.o.c; f.e=G.o.e;
    if(f.t==="forme") f.rempli=false;
    var i=A.objs.indexOf(G.o); if(i>=0) A.objs[i]=f; else A.objs.push(f);
    A.sel=f;
    G={type:"fini", avant:G.avant};
    try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
    astuce("Forme redressée : ajustez-la avec les poignées.");
    peindre(); majUI();
  }, 1000);
}

function surAppui(e){
  if(!A) return;
  e.preventDefault();
  try{ D.cv.setPointerCapture(e.pointerId); }catch(er){}
  var s=posEcran(e);
  DOIGTS[e.pointerId]=s;
  var n=nbDoigts();
  if(n===2){
    arreterMaintien();
    /* le premier doigt a peut-être commencé un trait : on l'efface, c'est un pincement */
    var avant = (G && G.avant!==undefined && G.avant!==null) ? G.avant : photo();
    if(G && (G.type==="deplacer" || G.type==="poignee") && G.base && A.sel){
      restaurer(A.sel, G.base);
    } else if(G && (G.type==="dessin" || G.type==="forme" || G.type==="gomme")){
      A.objs=JSON.parse(G.avant);
      A.sel = (G.sel===null || G.sel===undefined) ? null : (A.objs[G.sel] || null);
    }
    var dd=deuxDoigts();
    var surSel=false;
    if(A.sel && !A.edition){
      var b=boite(A.sel), marge=70/A.vue.k;
      surSel = dd.p.some(function(q){
        var l=versLocal(b, versImage(q));
        return Math.abs(l[0]) <= b.w/2+marge && Math.abs(l[1]) <= b.h/2+marge;
      });
    } else if(A.sel && A.edition){ surSel=true; }
    if(surSel){
      G={type:"pince", avant:avant, base:clone(A.sel), d0:dd.d, a0:dd.a, m0:versImage(dd.m)};
    } else {
      G={type:"pincevue", avant:avant, d0:dd.d, k0:A.vue.k, m0:versImage(dd.m)};
    }
    peindre();
    return;
  }
  if(n>2) return;
  var actif=document.activeElement;
  if(actif && actif!==D.saisie && actif!==document.body && actif.blur) actif.blur();
  if(A.edition){ finirEdition(); G={type:"rien"}; return; }
  var p=versImage(s), avant1=photo(), selIdx = A.sel ? A.objs.indexOf(A.sel) : null;
  G=null;
  var h=poigneeSous(s);
  if(h){ G={type:"poignee", h:h, base:clone(A.sel), p0:[h.x,h.y], avant:avant1, s0:s}; return; }
  if(A.sel && A.outil!=="gomme" && touche(A.sel, p, 12/A.vue.k, false)){
    G={type:"deplacer", o:A.sel, base:clone(A.sel), p0:p, s0:s, avant:avant1, tap:true, t0:Date.now()};
    return;
  }
  var o;
  switch(A.outil){
    case "stylo": case "surligneur":
      A.sel=null;
      var sur = A.outil==="surligneur";
      o=nouveau({t:"trait", pts:[p], c: sur ? PREFS.surCouleur : PREFS.couleur, e: sur ? SURL_EP[PREFS.surEp]*A.u : ep()});
      if(sur){ o.sur=true; if(PREFS.droit) o.droit=true; }
      G={type:"dessin", o:o, p0:p, avant:avant1, sel:null, ancre:s};
      armerMaintien();
      break;
    case "gomme":
      A.sel=null; A.curseur=p;
      G={type:"gomme", dernier:p, avant:avant1, sel:null};
      gommer(p, p);
      break;
    case "texte":
      o=trouver(p, function(x){ return x.t==="texte"; });
      if(o){ A.sel=o; G={type:"deplacer", o:o, base:clone(o), p0:p, s0:s, avant:avant1, tap:true, t0:Date.now()}; }
      else { A.sel=null; G={type:"tap", p:p, s0:s, action:"texte", avant:avant1}; }
      break;
    case "formes":
      A.sel=null;
      G={type:"forme", p0:p, s0:s, avant:avant1, sel:null};
      break;
    case "reperes":
      if(PREFS.repere==="flou"){
        o=trouver(p, function(x){ return x.t==="flou"; });
        if(o){ A.sel=o; G={type:"deplacer", o:o, base:clone(o), p0:p, s0:s, avant:avant1, tap:true, t0:Date.now()}; break; }
        A.sel=null; G={type:"forme", p0:p, s0:s, avant:avant1, sel:null, flou:true};
        break;
      }
      o=trouver(p, function(x){ return x.t==="pastille" || x.t==="symbole"; });
      if(!o){
        if(PREFS.repere==="pastille") o=nouveau({t:"pastille", x:p[0], y:p[1], r:22*A.u, n:prochainNumero(), c:PREFS.couleur, texte:""});
        else o=nouveau({t:"symbole", nom:PREFS.symbole, x:p[0], y:p[1], r:22*A.u, c:PREFS.couleur, rot:0, label:""});
        A.sel=o;
        G={type:"deplacer", o:o, base:clone(o), p0:p, s0:s, avant:avant1, tap:false, pose:true};
        peindre(); majUI();
        break;
      }
      A.sel=o; G={type:"deplacer", o:o, base:clone(o), p0:p, s0:s, avant:avant1, tap:true, t0:Date.now()};
      break;
    case "choisir":
      o=trouver(p);
      if(o){ A.sel=o; G={type:"deplacer", o:o, base:clone(o), p0:p, s0:s, avant:avant1, tap:true, t0:Date.now()}; }
      else { A.sel=null; G={type:"pan", s0:s, x0:A.vue.x, y0:A.vue.y}; }
      break;
  }
  if(G && G.sel===undefined) G.sel=selIdx;
  peindre(); if(G && G.type!=="dessin" && G.type!=="gomme") majUI();
}

function surMouvement(e){
  if(!A) return;
  var s=posEcran(e);
  if(!DOIGTS[e.pointerId]){
    if(e.pointerType==="mouse" && A.outil==="gomme"){ A.curseur=versImage(s); peindre(); }
    return;
  }
  e.preventDefault();
  DOIGTS[e.pointerId]=s;
  if(!G) return;
  var p=versImage(s), o;
  if(G.type==="pince" && nbDoigts()>=2){
    if(!A.sel) return;
    var dd=deuxDoigts(), m=versImage(dd.m);
    transformer(A.sel, G.base, dd.d/G.d0, dd.a-G.a0, m[0]-G.m0[0], m[1]-G.m0[1]);
    peindre(); return;
  }
  if(G.type==="pincevue" && nbDoigts()>=2){
    var d2=deuxDoigts();
    A.vue.k=borner(G.k0*d2.d/G.d0, A.fitK, A.fitK*10);
    A.vue.x=d2.m[0]-G.m0[0]*A.vue.k; A.vue.y=d2.m[1]-G.m0[1]*A.vue.k;
    bornerVue(); peindre(); return;
  }
  if(nbDoigts()>1) return;
  switch(G.type){
    case "dessin":
      o=G.o;
      if(o.droit){
        var dx=p[0]-G.p0[0], dy=p[1]-G.p0[1];
        if(Math.abs(dy) < Math.abs(dx)*0.1) dy=0;
        o.pts=[G.p0, [G.p0[0]+dx, G.p0[1]+dy]];
      } else {
        var der=o.pts[o.pts.length-1];
        if(dist(der, p) >= 1.2/A.vue.k) o.pts.push(p);
      }
      if(hyp(s[0]-G.ancre[0], s[1]-G.ancre[1]) > 5){ G.ancre=s; armerMaintien(); }
      break;
    case "gomme":
      gommer(G.dernier, p); G.dernier=p; A.curseur=p;
      break;
    case "forme":
      if(!G.o){
        if(hyp(s[0]-G.s0[0], s[1]-G.s0[1]) < 6) return;
        if(G.flou) G.o=nouveau({t:"flou", cx:p[0], cy:p[1], w:1, h:1});
        else if(LIGNES[PREFS.forme]) G.o=nouveau({t:"ligne", f:PREFS.forme, x1:G.p0[0], y1:G.p0[1], x2:p[0], y2:p[1], c:PREFS.couleur, e:ep()});
        else G.o=nouveau({t:"forme", f:PREFS.forme, cx:p[0], cy:p[1], w:1, h:1, rot:0, c:PREFS.couleur, e:ep(), rempli:!!PREFS.rempli});
        if(G.o.t==="ligne" && PREFS.forme==="cote") G.o.val="";
      }
      o=G.o;
      if(o.t==="ligne"){
        var lx=p[0], ly=p[1], ang=Math.atan2(ly-G.p0[1], lx-G.p0[0]), q=Math.PI/4, na=Math.round(ang/q)*q;
        if(Math.abs(ang-na) < 0.06){ var L=dist(G.p0, p); lx=G.p0[0]+Math.cos(na)*L; ly=G.p0[1]+Math.sin(na)*L; }
        o.x2=lx; o.y2=ly;
      } else {
        o.cx=(G.p0[0]+p[0])/2; o.cy=(G.p0[1]+p[1])/2;
        o.w=Math.max(2, Math.abs(p[0]-G.p0[0])); o.h=Math.max(2, Math.abs(p[1]-G.p0[1]));
      }
      break;
    case "deplacer":
      if(G.tap && hyp(s[0]-G.s0[0], s[1]-G.s0[1]) < 7) return;
      G.tap=false;
      deplacer(G.o, G.base, p[0]-G.p0[0], p[1]-G.p0[1]);
      break;
    case "poignee":
      tirerPoignee(A.sel, G.h, G.base, p, G.p0);
      break;
    case "pan":
      A.vue.x=G.x0 + s[0]-G.s0[0]; A.vue.y=G.y0 + s[1]-G.s0[1];
      bornerVue();
      break;
    case "tap":
      if(hyp(s[0]-G.s0[0], s[1]-G.s0[1]) > 10){ G={type:"pan", s0:G.s0, x0:A.vue.x, y0:A.vue.y}; }
      break;
  }
  peindre();
}

function surLacher(e){
  if(!A) return;
  if(!DOIGTS[e.pointerId]) return;
  delete DOIGTS[e.pointerId];
  var reste=nbDoigts();
  if(!G) return;
  if(G.type==="pince" || G.type==="pincevue"){
    if(reste<2){ var av=G.avant; G={type:"rien", avant:av}; valider(av); majUI(); majHaut(); peindre(); }
    return;
  }
  if(reste>0) return;
  arreterMaintien();
  var g=G; G=null;
  var u=A.u, o;
  switch(g.type){
    case "dessin":
      valider(g.avant);
      break;
    case "fini": case "gomme": case "poignee":
      valider(g.avant);
      if(g.type==="gomme" && e.pointerType!=="mouse") A.curseur=null;
      break;
    case "forme":
      if(!g.o){
        /* une simple touche : la forme sélectionnée dessous, sinon une forme de taille courante */
        var existe = g.flou ? null : trouver(g.p0, function(x){ return x.t==="forme" || x.t==="ligne"; });
        if(existe){ A.sel=existe; break; }
        var p=g.p0, t=110*u;
        if(g.flou) o=nouveau({t:"flou", cx:p[0], cy:p[1], w:t*1.6, h:t});
        else if(LIGNES[PREFS.forme]) o=nouveau({t:"ligne", f:PREFS.forme, x1:p[0]-t, y1:p[1], x2:p[0]+t, y2:p[1], c:PREFS.couleur, e:ep()});
        else o=nouveau({t:"forme", f:PREFS.forme, cx:p[0], cy:p[1], w:t*1.6, h:(PREFS.forme==="cercle" ? t*1.6 : t), rot:0, c:PREFS.couleur, e:ep(), rempli:!!PREFS.rempli});
        if(o.t==="ligne" && PREFS.forme==="cote") o.val="";
        g.o=o;
      }
      A.sel=g.o;
      valider(g.avant);
      majUI();
      if(g.o.t==="ligne" && g.o.f==="cote" && D.champ) focusChamp();
      break;
    case "deplacer":
      if(g.tap){
        var maintenant=Date.now();
        var double = DERNIER_TAP.o===g.o && (maintenant-DERNIER_TAP.t) < 380;
        DERNIER_TAP={t:maintenant, o:g.o};
        if(double){
          if(g.o.t==="texte"){ A.avantEdition=g.avant; editer(g.o); return; }
          if(D.champ) focusChamp();
        }
      } else {
        valider(g.avant);
      }
      break;
    case "tap":
      if(g.action==="texte"){
        o=nouveau({t:"texte", x:g.p[0], y:g.p[1], s:"", taille:PREFS.texteTaille*u, c:PREFS.couleur, style:PREFS.texteStyle, rot:0});
        A.avantEdition=g.avant;
        editer(o);
        return;
      }
      break;
  }
  peindre(); majUI();
}

/* ---------- l'écran ---------- */
var CSS = [
  "#annot{position:fixed;inset:0;z-index:9000;background:#0B0E12;color:#F2F5F9;display:flex;flex-direction:column;",
  "font-family:inherit;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}",
  "#annot[hidden],#annot [hidden]{display:none!important}",
  "#annot button{touch-action:manipulation}",
  "#annot button{font-family:inherit;cursor:pointer}",
  "#annot button:focus-visible{outline:2px solid #22D3EE;outline-offset:2px}",
  ".an-haut{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:8px 10px;padding-top:calc(8px + env(safe-area-inset-top,0px));background:#0B0E12}",
  ".an-haut .an-t{flex:1 1 auto;min-width:0;font-size:14px;font-weight:700;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".an-pill{flex:0 0 auto;min-height:38px;padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#E5E9EF;font-size:13.5px;font-weight:600}",
  ".an-pill.or{background:#EA7A1E;border-color:#EA7A1E;color:#0B0E12;font-weight:800}",
  ".an-ic{flex:0 0 auto;width:38px;height:38px;border-radius:10px;border:0;background:rgba(255,255,255,.08);display:inline-flex;align-items:center;justify-content:center;padding:0;color:#E5E9EF}",
  ".an-ic[disabled]{opacity:.35;cursor:default}",
  ".an-ic.on{background:#F2F5F9;color:#0B0E12}",
  ".an-ic svg,.an-outil svg,.an-chip svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}",
  ".an-scene{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;background:#1A1F26}",
  ".an-scene canvas{position:absolute;left:0;top:0;touch-action:none;display:block}",
  ".an-astuce{position:absolute;left:12px;right:12px;top:10px;padding:9px 12px;border-radius:12px;background:rgba(11,14,18,.84);color:#F2F5F9;",
  "font-size:12.5px;line-height:1.4;pointer-events:none;opacity:0;transition:opacity .25s;max-width:560px;margin:0 auto}",
  ".an-astuce.vue{opacity:1}",
  ".an-saisie{position:absolute;margin:0;padding:0 6px;border:0;outline:0;background:transparent;",
  "resize:none;overflow:hidden;white-space:pre;text-align:center;caret-color:#EA7A1E;transform-origin:50% 50%;-webkit-user-select:text;user-select:text}",
  ".an-rang{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 12px;min-height:52px;box-sizing:border-box;background:#141920;",
  "border-top:1px solid rgba(255,255,255,.06);overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}",
  ".an-rang::-webkit-scrollbar{display:none}",
  ".an-rang[hidden]{display:none}",
  ".an-flottant{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column}",
  ".an-flottant .an-rang{background:rgba(20,25,32,.94);border-top:1px solid rgba(255,255,255,.08)}",
  ".an-flottant .an-sel{background:rgba(27,34,43,.96)}",
  ".an-dot{flex:0 0 auto;width:30px;height:30px;border-radius:50%;border:2px solid rgba(255,255,255,.28);padding:0}",
  ".an-dot.on{border-color:#fff;box-shadow:0 0 0 2px #EA7A1E}",
  ".an-chip{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:4px 12px;border-radius:999px;",
  "border:1px solid rgba(255,255,255,.2);background:transparent;color:#C7CED6;font-size:12.5px;font-weight:600;white-space:nowrap}",
  ".an-chip.on{background:#F2F5F9;color:#0B0E12;border-color:#F2F5F9}",
  ".an-chip.rouge{color:#FCA5A5;border-color:rgba(252,165,165,.4)}",
  ".an-chip.forme{padding:4px 9px}",
  ".an-chip canvas{display:block}",
  ".an-lab{flex:0 0 auto;font-size:11.5px;color:#8A97A6;font-weight:600;white-space:nowrap}",
  ".an-sep{flex:0 0 auto;width:1px;height:24px;background:rgba(255,255,255,.14)}",
  ".an-esp{flex:1 1 auto}",
  ".an-ep{flex:0 0 auto;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:transparent;display:inline-flex;align-items:center;justify-content:center;padding:0}",
  ".an-ep i{display:block;border-radius:50%;background:#E5E9EF}",
  ".an-ep.on{background:#F2F5F9}.an-ep.on i{background:#0B0E12}",
  ".an-champ{flex:1 1 180px;min-width:150px;min-height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:#0B0E12;color:#F2F5F9;",
  "font:inherit;font-size:14px;padding:6px 10px;-webkit-user-select:text;user-select:text}",
  ".an-outils{flex:0 0 auto;display:grid;grid-template-columns:repeat(7,1fr);gap:2px;padding:6px 6px;padding-bottom:calc(8px + env(safe-area-inset-bottom,0px));background:#141920}",
  ".an-outil{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 0 6px;border-radius:12px;border:0;background:none;color:#9AA4B0;font-size:10.5px;font-weight:600;min-width:0}",
  ".an-outil svg{width:24px;height:24px;stroke-width:1.8}",
  ".an-outil span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  ".an-outil.on{background:rgba(234,122,30,.18);color:#FDBA74}",
  "@media (min-width:760px){.an-outils{max-width:640px;margin:0 auto;width:100%;box-sizing:border-box}}",
  "@media (prefers-reduced-motion:reduce){.an-astuce{transition:none}}"
].join("\n");

function el(tag, cls, txt){
  var e=document.createElement(tag);
  if(cls) e.className=cls;
  if(txt!==undefined) e.textContent=txt;
  return e;
}
function svg(corps){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+corps+'</svg>'; }
function icone(label, corps, fn){
  var b=el("button","an-ic"); b.type="button"; b.innerHTML=svg(corps);
  b.setAttribute("aria-label", label); b.title=label;
  b.addEventListener("click", fn);
  return b;
}
function chip(label, on, fn, cls){
  var b=el("button", "an-chip"+(on?" on":"")+(cls?" "+cls:""), label); b.type="button";
  b.setAttribute("aria-pressed", on ? "true" : "false");
  b.addEventListener("click", fn);
  return b;
}

function construire(){
  if(D) return;
  var st=el("style"); st.textContent=CSS; document.head.appendChild(st);
  var r=el("div"); r.id="annot"; r.hidden=true;
  r.setAttribute("role","dialog"); r.setAttribute("aria-modal","true"); r.setAttribute("aria-label","Annotation");
  var haut=el("div","an-haut");
  var fermer=el("button","an-pill","Fermer"); fermer.type="button"; fermer.id="an_fermer";
  var und=icone("Annuler", '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12h-2"/>', function(){ annuler(); });
  var red=icone("Rétablir", '<path d="m15 7 5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12h2"/>', function(){ retablir(); });
  und.id="an_annuler"; red.id="an_retablir";
  var titre=el("span","an-t");
  var grille=icone("Quadrillage", '<path d="M3.5 3.5h17v17h-17z"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>', function(){
    A.fond = A.fond==="grille" ? "blanc" : "grille"; A.modifie=true; majHaut(); peindre();
  });
  grille.id="an_grille";
  var entier=icone("Vue entière", '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', function(){ A.vue.k=A.fitK; bornerVue(); peindre(); majHaut(); });
  entier.id="an_entier";
  var ok=el("button","an-pill or","Enregistrer"); ok.type="button"; ok.id="an_ok";
  [fermer, und, red, titre, grille, entier, ok].forEach(function(x){ haut.appendChild(x); });
  var scene=el("div","an-scene");
  var cv=el("canvas"); cv.id="an_canvas";
  var saisie=el("textarea","an-saisie"); saisie.hidden=true; saisie.setAttribute("aria-label","Texte sur la photo");
  saisie.setAttribute("autocapitalize","sentences"); saisie.spellcheck=true; saisie.rows=1;
  var ast=el("div","an-astuce"); ast.setAttribute("role","status");
  var selr=el("div","an-rang an-sel"); selr.id="an_selection";
  var opts=el("div","an-rang"); opts.id="an_options";
  /* les réglages flottent sur le bas de la photo : elle ne saute pas quand ils changent */
  var flot=el("div","an-flottant"); flot.appendChild(selr); flot.appendChild(opts);
  scene.appendChild(cv); scene.appendChild(saisie); scene.appendChild(ast); scene.appendChild(flot);
  var coul=el("div","an-rang"); coul.id="an_couleurs";
  var outils=el("div","an-outils");
  OUTILS.forEach(function(o){
    var b=el("button","an-outil"); b.type="button"; b.dataset.outil=o[0];
    b.innerHTML=svg(o[2]) + "<span>"+o[1]+"</span>";
    b.setAttribute("aria-label", o[1]);
    b.addEventListener("click", function(){ choisirOutil(o[0]); });
    outils.appendChild(b);
  });
  [haut, scene, coul, outils].forEach(function(x){ r.appendChild(x); });
  document.body.appendChild(r);
  D={racine:r, cv:cv, scene:scene, saisie:saisie, astuce:ast, selection:selr, options:opts, couleurs:coul, outils:outils,
     titre:titre, annuler:und, retablir:red, grille:grille, entier:entier, fermer:fermer, ok:ok, champ:null};

  cv.addEventListener("pointerdown", surAppui);
  cv.addEventListener("pointermove", surMouvement);
  cv.addEventListener("pointerup", surLacher);
  cv.addEventListener("pointercancel", surLacher);
  cv.addEventListener("pointerleave", function(e){ if(e.pointerType==="mouse" && A && !G){ A.curseur=null; peindre(); } });
  cv.addEventListener("wheel", function(e){
    if(!A) return;
    e.preventDefault();
    zoomer(e.deltaY<0 ? 1.15 : 1/1.15, posEcran(e));
  }, {passive:false});
  cv.addEventListener("contextmenu", function(e){ e.preventDefault(); });
  saisie.addEventListener("input", function(){
    if(!A || !A.edition) return;
    A.edition.s = saisie.value; peindre();
  });
  saisie.addEventListener("keydown", function(e){
    if(e.key==="Escape" || (e.key==="Enter" && (e.ctrlKey || e.metaKey))){ e.preventDefault(); finirEdition(); }
  });
  saisie.addEventListener("blur", function(){ setTimeout(function(){ if(A && A.edition && document.activeElement!==saisie) finirEdition(); }, 120); });
  fermer.addEventListener("click", function(){
    finirEdition();
    if(A.modifie && !window.confirm("Fermer sans enregistrer les annotations ?")) return;
    terminer(null);
  });
  ok.addEventListener("click", enregistrer);
  document.addEventListener("keydown", function(e){
    if(!A || D.racine.hidden) return;
    var dansChamp = e.target && (e.target.tagName==="INPUT" || e.target.tagName==="TEXTAREA");
    if((e.ctrlKey || e.metaKey) && !dansChamp && (e.key==="z" || e.key==="Z")){ e.preventDefault(); if(e.shiftKey) retablir(); else annuler(); return; }
    if((e.ctrlKey || e.metaKey) && !dansChamp && (e.key==="y" || e.key==="Y")){ e.preventDefault(); retablir(); return; }
    if(!dansChamp && A.sel && (e.key==="Delete" || e.key==="Backspace")){ e.preventDefault(); supprimerSel(); }
  });
  window.addEventListener("resize", function(){ if(A && !D.racine.hidden){ ajuster(true); peindre(); majHaut(); } });
  /* Safari : pas de zoom de la page pendant qu'on pince la photo */
  r.addEventListener("gesturestart", function(e){ e.preventDefault(); });
}

var TEMPO_ASTUCE=null;
function astuce(t){
  if(!D) return;
  D.astuce.textContent=t;
  D.astuce.classList.add("vue");
  clearTimeout(TEMPO_ASTUCE);
  TEMPO_ASTUCE=setTimeout(function(){ D.astuce.classList.remove("vue"); }, 3800);
}
function astuceOutil(){
  var o=A.outil;
  if(o==="gomme") astuce(PREFS.gommeMode==="entier" ? ASTUCES.gommeEntier : ASTUCES.gomme);
  else if(o==="reperes") astuce(ASTUCES[PREFS.repere]);
  else astuce(ASTUCES[o]);
}
function choisirOutil(o){
  finirEdition();
  A.outil=o; PREFS.outil=o; garderPrefs();
  if(o!=="choisir") A.sel=null;
  if(o!=="gomme") A.curseur=null;
  if(o==="reperes" && PREFS.repere==="flou" && !A.img) PREFS.repere="pastille";
  astuceOutil();
  peindre(); majUI();
}
function supprimerSel(){
  if(!A.sel) return;
  var o=A.sel;
  finirEdition();
  modifier(function(){ var i=A.objs.indexOf(o); if(i>=0) A.objs.splice(i,1); A.sel=null; });
  majUI();
}
function dupliquerSel(){
  if(!A.sel) return;
  var o=clone(A.sel), d=24*A.u;
  deplacer(o, clone(o), d, d);
  if(o.t==="pastille") o.n=prochainNumero();
  modifier(function(){ A.objs.push(o); A.sel=o; });
  majUI();
}
/* la couleur choisie s'applique aussi à l'élément sélectionné */
function choisirCouleur(c){
  var o=A.sel;
  if(o && o.t!=="flou"){
    modifier(function(){ o.c=c; });
    if(o.t==="trait" && o.sur) PREFS.surCouleur=c; else PREFS.couleur=c;
  } else if(A.outil==="surligneur") PREFS.surCouleur=c;
  else PREFS.couleur=c;
  garderPrefs();
  if(A.edition) placerEditeur();
  majUI();
}
function choisirEpaisseur(cle){
  var o=A.sel;
  if(o && (o.t==="trait" || o.t==="forme" || o.t==="ligne")){
    var val = (o.t==="trait" && o.sur) ? SURL_EP[cle] : EPAISSEURS[cle];
    if(val) modifier(function(){ o.e=val*A.u; });
    if(o.t==="trait" && o.sur) PREFS.surEp=cle; else PREFS.ep=cle;
  } else if(A.outil==="surligneur") PREFS.surEp=cle;
  else PREFS.ep=cle;
  garderPrefs(); majUI();
}
function tailleTexte(f){
  var o=A.sel;
  if(o && o.t==="texte"){
    modifier(function(){ o.taille=borner(o.taille*f, 6*A.u, 400*A.u); });
    PREFS.texteTaille=Math.round(o.taille/A.u);
  } else {
    PREFS.texteTaille=borner(Math.round(PREFS.texteTaille*f), 10, 200);
  }
  garderPrefs(); majUI();
}
function focusChamp(){
  if(!D.champ) return;
  try{ D.champ.focus({preventScroll:true}); }catch(e){ D.champ.focus(); }
}

function majHaut(){
  if(!A) return;
  D.annuler.disabled = !A.hist.length;
  D.retablir.disabled = !A.redo.length;
  D.grille.hidden = !!A.img;
  D.grille.classList.toggle("on", A.fond==="grille");
  D.grille.setAttribute("aria-pressed", A.fond==="grille" ? "true" : "false");
  D.entier.hidden = !(A.vue.k > A.fitK*1.02);
  /* sur un téléphone étroit, le titre cède la place aux icônes */
  D.titre.style.visibility = (window.innerWidth < 420 && (!D.grille.hidden || !D.entier.hidden)) ? "hidden" : "";
}
function epaisseurActuelle(){
  var o=A.sel;
  function cle(tab, v){ var best=null, d=Infinity; for(var k in tab){ var dd=Math.abs(tab[k]*A.u - v); if(dd<d){ d=dd; best=k; } } return best; }
  if(o && o.t==="trait" && o.sur) return {tab:SURL_EP, cle:cle(SURL_EP, o.e)};
  if(o && (o.t==="trait" || o.t==="forme" || o.t==="ligne")) return {tab:EPAISSEURS, cle:cle(EPAISSEURS, o.e)};
  if(A.outil==="surligneur") return {tab:SURL_EP, cle:PREFS.surEp};
  return {tab:EPAISSEURS, cle:PREFS.ep};
}
function rangEpaisseurs(box){
  var ea=epaisseurActuelle(), noms={fin:"Fin", moyen:"Moyen", epais:"Épais", large:"Large"}, i=0;
  for(var k in ea.tab){
    (function(k){
      var b=el("button","an-ep"+(ea.cle===k?" on":"")); b.type="button";
      var t=[6,10,15][i++]; var dot=el("i"); dot.style.width=t+"px"; dot.style.height=t+"px"; b.appendChild(dot);
      b.setAttribute("aria-label","Trait "+noms[k].toLowerCase()); b.title=noms[k];
      b.setAttribute("aria-pressed", ea.cle===k ? "true" : "false");
      b.addEventListener("click", function(){ choisirEpaisseur(k); });
      box.appendChild(b);
    })(k);
  }
}
function majUI(){
  if(!A) return;
  majHaut();
  Array.prototype.forEach.call(D.outils.children, function(b){
    var on=b.dataset.outil===A.outil;
    b.classList.toggle("on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  var op=D.options, sr=D.selection, co=D.couleurs, o=A.sel;
  var actif=document.activeElement;
  if(D.champ && actif===D.champ && D.champ.dataset.pour && o && D.champ.dataset.pour===String(A.objs.indexOf(o))){
    /* on ne reconstruit pas le champ en cours de saisie */
  } else {
    sr.textContent=""; D.champ=null;
    if(o) remplirSelection(sr, o);
  }
  sr.hidden = !sr.children.length;
  op.textContent="";
  remplirOptions(op, o);
  op.hidden = !op.children.length;
  co.textContent="";
  var montrerCouleurs = !(A.outil==="gomme" && !o) && !(o && o.t==="flou") && !(A.outil==="reperes" && PREFS.repere==="flou" && !o);
  if(montrerCouleurs){
    var surl = (o && o.t==="trait" && o.sur) || (!o && A.outil==="surligneur");
    var courant = o ? o.c : (surl ? PREFS.surCouleur : PREFS.couleur);
    (surl ? SURLIGNEURS : COULEURS).forEach(function(c){
      var b=el("button","an-dot"+(String(courant).toLowerCase()===c[0].toLowerCase()?" on":"")); b.type="button";
      b.style.background=c[0]; b.setAttribute("aria-label", c[1]); b.title=c[1];
      b.setAttribute("aria-pressed", String(courant).toLowerCase()===c[0].toLowerCase() ? "true" : "false");
      b.addEventListener("click", function(){ choisirCouleur(c[0]); });
      co.appendChild(b);
    });
  }
  co.appendChild(el("span","an-esp"));
  var tailleTrait = (o && (o.t==="trait" || o.t==="forme" || o.t==="ligne")) ||
    (!o && (A.outil==="stylo" || A.outil==="surligneur" || A.outil==="formes"));
  if(tailleTrait) rangEpaisseurs(co);
  else if((o && o.t==="texte") || (!o && A.outil==="texte")){
    var moins=chip("A−", false, function(){ tailleTexte(1/1.2); }); moins.setAttribute("aria-label","Texte plus petit");
    var plus=chip("A+", false, function(){ tailleTexte(1.2); }); plus.setAttribute("aria-label","Texte plus grand");
    co.appendChild(moins); co.appendChild(plus);
  } else if(!o && A.outil==="gomme"){
    co.appendChild(el("span","an-lab","Taille"));
    [["petite","Petite"],["moyenne","Moyenne"],["grande","Grande"]].forEach(function(g){
      co.appendChild(chip(g[1], PREFS.gomme===g[0], function(){ PREFS.gomme=g[0]; garderPrefs(); majUI(); }));
    });
  }
  if(co.children.length===1) co.insertBefore(el("span","an-lab", A.outil==="choisir" ? "Touchez un élément de la photo." : ""), co.firstChild);
}
function champ(op, o, cle, placeholder){
  var i=el("input","an-champ"); i.type="text"; i.value=o[cle]||""; i.placeholder=placeholder;
  i.setAttribute("aria-label", placeholder); i.dataset.pour=String(A.objs.indexOf(o));
  var avant=null;
  i.addEventListener("focus", function(){ avant=photo(); });
  i.addEventListener("input", function(){ o[cle]=i.value; peindre(); });
  i.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); i.blur(); } });
  i.addEventListener("blur", function(){ o[cle]=i.value.trim(); if(avant!==null) valider(avant); avant=null; peindre(); });
  op.appendChild(i); D.champ=i;
  return i;
}
function remplirSelection(op, o){
  {
    var nf=""; FORMES.forEach(function(f){ if(f[0]===o.f) nf=f[1]; });
    var noms={trait:(o.sur?"Surligneur":"Trait"), texte:"Texte", forme:nf, ligne:nf, pastille:"Repère n° "+o.n, symbole:nomSymbole(o.nom), flou:"Flou"};
    op.appendChild(el("span","an-lab", noms[o.t]||""));
    if(o.t==="texte"){
      op.appendChild(chip("Modifier", false, function(){ A.avantEdition=photo(); editer(o); }));
      op.appendChild(el("span","an-sep"));
      [["bulle","Bulle"],["nu","Sans fond"],["contour","Contour"]].forEach(function(s){
        op.appendChild(chip(s[1], (o.style||"bulle")===s[0], function(){ modifier(function(){ o.style=s[0]; }); PREFS.texteStyle=s[0]; garderPrefs(); majUI(); }));
      });
    } else if(o.t==="forme"){
      [[false,"Vide"],[true,"Voilé"]].forEach(function(v){
        op.appendChild(chip(v[1], !!o.rempli===v[0], function(){ modifier(function(){ o.rempli=v[0]; }); PREFS.rempli=v[0]; garderPrefs(); majUI(); }));
      });
    } else if(o.t==="ligne" && o.f==="cote"){
      champ(op, o, "val", "Valeur de la cote (ex. 1,20 m)");
    } else if(o.t==="pastille"){
      champ(op, o, "texte", "Légende du repère " + o.n);
    } else if(o.t==="symbole"){
      champ(op, o, "label", "Repère (ex. P1)");
    }
    op.appendChild(el("span","an-sep"));
    if(o.t!=="flou") op.appendChild(chip("Dupliquer", false, dupliquerSel));
    op.appendChild(chip("Supprimer", false, supprimerSel, "rouge"));
  }
}
/* les réglages de l'outil, pour le prochain élément posé */
function remplirOptions(op, o){
  switch(A.outil){
    case "surligneur":
      op.appendChild(chip("Trait droit", !!PREFS.droit, function(){ PREFS.droit=!PREFS.droit; garderPrefs(); majUI(); }));
      op.appendChild(el("span","an-lab", PREFS.droit ? "Il suit la ligne, même tracé à main levée." : "Trait libre."));
      break;
    case "texte":
      if(o) break;
      op.appendChild(el("span","an-lab","Style"));
      [["bulle","Bulle"],["nu","Sans fond"],["contour","Contour"]].forEach(function(s){
        op.appendChild(chip(s[1], PREFS.texteStyle===s[0], function(){ PREFS.texteStyle=s[0]; garderPrefs(); majUI(); }));
      });
      break;
    case "formes":
      FORMES.forEach(function(f){
        var b=chip("", PREFS.forme===f[0], function(){ PREFS.forme=f[0]; A.sel=null; garderPrefs(); peindre(); majUI(); }, "forme");
        b.innerHTML=svg(f[2]) + f[1];
        b.setAttribute("aria-label", f[1]);
        op.appendChild(b);
      });
      if(!LIGNES[PREFS.forme] && !o){
        op.appendChild(el("span","an-sep"));
        op.appendChild(el("span","an-lab","Remplissage"));
        [[false,"Vide"],[true,"Voilé"]].forEach(function(v){
          op.appendChild(chip(v[1], !!PREFS.rempli===v[0], function(){ PREFS.rempli=v[0]; garderPrefs(); majUI(); }));
        });
      }
      break;
    case "gomme":
      op.appendChild(el("span","an-lab","Mode"));
      [["partielle","Partielle"],["entier","Trait entier"]].forEach(function(m){
        op.appendChild(chip(m[1], PREFS.gommeMode===m[0], function(){ PREFS.gommeMode=m[0]; garderPrefs(); astuceOutil(); majUI(); }));
      });
      op.appendChild(el("span","an-sep"));
      op.appendChild(chip("Tout effacer", false, function(){
        if(!A.objs.length) return;
        if(!window.confirm("Effacer toutes les annotations ? La photo reste intacte.")) return;
        modifier(function(){ A.objs=[]; A.sel=null; });
        majUI();
      }, "rouge"));
      break;
    case "reperes":
      var modes=[["pastille","Pastilles 1 2 3"],["symbole","Symboles"]];
      if(A.img) modes.push(["flou","Flouter"]);
      modes.forEach(function(m){
        op.appendChild(chip(m[1], PREFS.repere===m[0], function(){ PREFS.repere=m[0]; A.sel=null; garderPrefs(); astuceOutil(); peindre(); majUI(); }));
      });
      if(PREFS.repere==="symbole"){
        op.appendChild(el("span","an-sep"));
        SYMBOLES.forEach(function(sy){
          var on=PREFS.symbole===sy[0];
          var b=chip("", on, function(){ PREFS.symbole=sy[0]; A.sel=null; garderPrefs(); peindre(); majUI(); }, "forme");
          var cv=document.createElement("canvas"); cv.width=52; cv.height=36; cv.style.width="26px"; cv.style.height="18px";
          var c=cv.getContext("2d"); c.scale(2,2);
          dessinerSymbole(c, sy[0], 13, 10, 5.5, on ? "#0B0E12" : "#E5E9EF");
          b.appendChild(cv); b.appendChild(document.createTextNode(sy[1]));
          b.setAttribute("aria-label", sy[1]);
          op.appendChild(b);
        });
      }
      break;
  }
}

/* ---------- ouvrir, enregistrer, fermer ---------- */
function charger(src){
  return new Promise(function(ok, non){
    if(!src) return ok(null);
    var im=new Image();
    im.onload=function(){ ok(im); };
    im.onerror=function(){ non(new Error("Image illisible.")); };
    im.src=src;
  });
}
function ouvrir(opt){
  opt = opt || {};
  construire();
  if(A && A.resolve) terminer(null);
  return charger(opt.image).then(function(img){
    return new Promise(function(resolve){
      var w = (img && img.naturalWidth) || opt.w || 1400;
      var h = (img && img.naturalHeight) || opt.h || 1000;
      A = {img:img, src:opt.image||null, w:w, h:h, u:Math.max(0.6, Math.max(w,h)/1000),
        fond: img ? null : (opt.fond==="grille" ? "grille" : "blanc"),
        objs: Array.isArray(opt.objets) ? clone(opt.objets) : [],
        sel:null, edition:null, avantEdition:null, hist:[], redo:[], modifie:false, curseur:null,
        outil: PREFS.outil, vue:{k:1,x:0,y:0}, fitK:1, sw:1, sh:1, dpr:1, resolve:resolve};
      FLOUS={};
      if(opt.plan){ A.outil="reperes"; PREFS.repere="symbole"; }
      if(A.outil==="reperes" && PREFS.repere==="flou" && !img) PREFS.repere="pastille";
      DOIGTS={}; G=null;
      D.titre.textContent = opt.titre || (img ? "Annoter la photo" : "Croquis");
      D.racine.hidden=false;
      A.scrollAvant=document.documentElement.style.overflow;
      document.documentElement.style.overflow="hidden";
      ajuster();
      peindre(); majUI();
      astuceOutil();
    });
  });
}
function terminer(res){
  if(!A) return;
  var r=A.resolve;
  finirEdition();
  arreterMaintien();
  D.racine.hidden=true;
  document.documentElement.style.overflow = A.scrollAvant || "";
  A=null; G=null; DOIGTS={}; FLOUS={};
  if(r) r(res);
}
function arrondir(objs){
  return JSON.parse(JSON.stringify(objs, function(k, v){
    if(typeof v!=="number") return v;
    if(k==="rot") return Math.round(v*1e4)/1e4;
    return Math.round(v*10)/10;
  }));
}
function rendre(objs, qualite){
  var cv=document.createElement("canvas"); cv.width=A.w; cv.height=A.h;
  var c=cv.getContext("2d");
  var sel=A.sel, ed=A.edition; A.sel=null; A.edition=null;
  dessinerScene(c, objs);
  A.sel=sel; A.edition=ed;
  return cv.toDataURL("image/jpeg", qualite || 0.82);
}
function enregistrer(){
  finirEdition();
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
  var objs=A.objs.filter(function(o){ return !(o.t==="texte" && !String(o.s||"").trim()); });
  if(!A.img && !objs.length){ astuce("Rien n'a été dessiné."); return; }
  if(!A.modifie){ terminer(null); return; }
  var orig=A.src;
  /* le flou est gravé dans la photo d'origine : ce qui est masqué ne se retrouve nulle part en clair */
  if(A.img && objs.some(function(o){ return o.t==="flou"; })){
    orig=rendre(objs.filter(function(o){ return o.t==="flou"; }), 0.9);
    objs=objs.filter(function(o){ return o.t!=="flou"; });
  }
  var data=rendre(A.img ? objs.concat(A.objs.filter(function(o){ return o.t==="flou"; })) : objs);
  var reperes=objs.filter(function(o){ return o.t==="pastille"; })
    .sort(function(a,b){ return a.n-b.n; })
    .map(function(o){ return {n:o.n, texte:String(o.texte||"").trim()}; });
  terminer({data:data, w:A.w, h:A.h, orig: A.img ? orig : null, objets:arrondir(objs), fond:A.fond, reperes:reperes});
}

/* la légende d'une photo reprend ses repères numérotés */
function legende(base, reperes){
  base = String(base||"").replace(/\s*—?\s*Repères\s*:.*$/, "").trim();
  var l=(reperes||[]).filter(function(r){ return r.texte; }).map(function(r){ return r.n + " " + r.texte; });
  if(!l.length) return base;
  return (base ? base + " — " : "") + "Repères : " + l.join(" ; ");
}
/* ouvre une photo déjà enregistrée : l'original et ses annotations si on les a */
function optionsPhoto(ph, opt){
  var o={titre:opt && opt.titre, plan:opt && opt.plan};
  if(ph.annot && !ph.orig && ph.croquis){
    o.image=null; o.objets=ph.annot; o.w=ph.w; o.h=ph.h; o.fond=ph.fond||"blanc";
  } else {
    o.image=ph.orig || ph.data; o.objets=ph.orig ? (ph.annot||[]) : []; o.w=ph.w; o.h=ph.h;
  }
  return o;
}
function appliquer(ph, r){
  ph.w=r.w; ph.h=r.h; ph.data=r.data;
  if(!r.orig){
    ph.annot=r.objets; ph.fond=r.fond; delete ph.orig;
  } else if(!r.objets.length){
    /* plus aucune annotation : la photo redevient l'originale */
    ph.data=r.orig;
    if(ph.orig || ph.annot){ ph.annotee=false; }
    delete ph.orig; delete ph.annot;
  } else {
    ph.orig=r.orig; ph.annot=r.objets; ph.annotee=true;
  }
  if(r.reperes && (r.reperes.length || /Repères\s*:/.test(ph.legende||""))) ph.legende=legende(ph.legende, r.reperes);
  return ph;
}
function annoterPhoto(ph, opt){
  return ouvrir(optionsPhoto(ph, opt)).then(function(r){
    if(!r) return null;
    appliquer(ph, r);
    return ph;
  });
}
function nouveauCroquis(opt){
  opt = opt || {};
  return ouvrir({titre:opt.titre || "Croquis", fond:opt.fond || "blanc", w:1400, h:1000, plan:opt.plan}).then(function(r){
    if(!r) return null;
    var ph={data:r.data, w:r.w, h:r.h, legende:"Croquis", croquis:true, annot:r.objets, fond:r.fond};
    if(r.reperes && r.reperes.some(function(x){ return x.texte; })) ph.legende=legende("Croquis", r.reperes);
    return ph;
  });
}

window.Annotation = {
  ouvrir: ouvrir,
  photo: annoterPhoto,
  croquis: nouveauCroquis,
  appliquer: appliquer,
  legende: legende,
  symboles: SYMBOLES,
  dessinerSymbole: dessinerSymbole,
  ouvert: function(){ return !!A; }
};
})();
