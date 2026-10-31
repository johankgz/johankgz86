/* Le chiffrage KNX. Comme l'outil Adresses de groupe, ce fichier n'est jamais servi
   tel quel : le serveur ne le livre (action knx-outil) qu'à une personne connectée qui
   a son code d'accès KNX, ou à l'administrateur.

   On saisit ce que l'installation pilote (volets, allumages, variation, portes, chauffage
   au sol, commandes, écrans, passerelles…) ; l'outil en tire la liste du matériel pour
   MDT, Zennio ou Theben, avec les références principales, et dimensionne l'alimentation
   du bus : chaque participant KNX consomme 10 mA. Le résultat se lit à l'écran ; son
   téléchargement (PDF, tableur) est verrouillé, l'administrateur l'ouvre personne par
   personne (Équipe). */
(function(){
"use strict";
function $(i){ return document.getElementById(i); }
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!==undefined) e.textContent=txt; return e; }
var TEMPO=null;
function toast(t){ var e=$("toast"); if(!e) return; e.textContent=t; e.hidden=false; clearTimeout(TEMPO); TEMPO=setTimeout(function(){ e.hidden=true; }, 2800); }
var S=null; try{ S=JSON.parse(localStorage.getItem("outils:session")||"null"); }catch(e){}
function api(action, corps){
  return fetch("/api/rapports?action="+action, {method: corps ? "POST" : "GET",
    headers: corps ? {"content-type":"application/json", "x-auth":S.jeton} : {"x-auth":S.jeton},
    body: corps ? JSON.stringify(corps) : undefined})
    .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, status:r.status, d:d}; }); });
}

/* ---------- le catalogue : les références principales de chaque marque ----------
   v:false = référence ou capacité à confirmer sur le tarif du fournisseur (la note dit quoi). */
var ALIM_PAR_PARTICIPANT = 10;           /* mA, par participant KNX */
var MAX_PARTICIPANTS_LIGNE = 64;         /* participants par ligne TP */
var MARQUES = {
  mdt: {nom:"MDT",
    alim:[{ref:"STV-0160.02", mA:160, nom:"Alimentation KNX 160 mA (2 modules)"},
          {ref:"STV-0320.02", mA:320, nom:"Alimentation KNX 320 mA (2 modules)"},
          {ref:"STV-0640.02", mA:640, nom:"Alimentation KNX 640 mA (4 modules)"}],
    commutation:{nom:"Actionneur de commutation {n} sorties 16 A (charges capacitives)", modules:[
      {ref:"AKS-0416.03", n:4}, {ref:"AKS-0816.03", n:8}, {ref:"AKS-1216.03", n:12},
      {ref:"AKS-1616.03", n:16}, {ref:"AKS-2016.03", n:20}, {ref:"AKS-2416.03", n:24}]},
    universel:{nom:"Actionneur universel {n} sorties 16 A, tout ou rien ou volets ({demi} volets au plus)", modules:[
      {ref:"AKU-0816.03", n:8}, {ref:"AKU-1616.03", n:16}, {ref:"AKU-2416.03", n:24}]},
    volets:{nom:"Actionneur volets {n} canaux 230 V, soit {n} volets ({2n} sorties montée / descente, moteurs jusqu'à 600 W)", modules:[
      {ref:"JAL-0410.02", n:4}, {ref:"JAL-0810.02", n:8}]},
    variation:{nom:"Variateur universel {n} canaux 250 W (LED, mesure de puissance)", modules:[
      {ref:"AKD-0201.02", n:2}, {ref:"AKD-0401.02", n:4}]},
    entrees:{nom:"Entrée binaire {n} entrées, contacts secs (rail DIN)", modules:[
      {ref:"BE-08000.02", n:8}, {ref:"BE-16000.02", n:16}]},
    chauffage:{nom:"Actionneur chauffage {n} sorties 24-230 V, un régulateur PI par sortie", modules:[
      {ref:"AKH-0400.03", n:4, thermo:4}, {ref:"AKH-0600.03", n:6, thermo:6}, {ref:"AKH-0800.03", n:8, thermo:8}]},
    routeur:{ref:"SCN-IP100.03", nom:"Routeur IP KNX (IP Secure)"},
    coupleur:{ref:"SCN-IP100.03", nom:"Routeur IP KNX utilisé en coupleur IP-TP (nouvelle ligne)"},
    dali:{ref:"SCN-DALI64.03", nom:"Passerelle DALI IP64 : 64 ballasts, 16 groupes"},
    clim:null,
    commande:{ref:"BE-GT20W.02", nom:"Glastaster II Smart, verre blanc"},
    commandeSonde:{ref:"BE-GT2TW.02", nom:"Glastaster II Smart avec sonde de température, verre blanc"},
    ecran:{ref:"BE-GTSP6TW.01S", nom:"Glass Touch Smart Plus 6 pouces, blanc (régulateur de température intégré)",
      note:"Vérifier s'il demande une alimentation auxiliaire 24-30 V."}
  },
  zennio: {nom:"Zennio",
    alim:[{ref:"ZPSU640", mA:640, nom:"KUPSupply 640 mA (sortie auxiliaire 29 V)"}],
    commutation:{nom:"MAXinBOX {n} Plus, actionneur multifonction {n} sorties 16 A, tout ou rien ou volets ({demi} volets au plus)", modules:[
      {ref:"ZIO-MB8P", n:8}, {ref:"ZIO-MB16P", n:16}]},
    volets:{nom:"MAXinBOX SHUTTER, actionneur volets {n} canaux, soit {n} volets ({2n} sorties montée / descente)", modules:[
      {ref:"ZIO-MBSHU4", n:4, v:false, note:"Une version v2 existe : prendre la référence en cours au tarif."},
      {ref:"ZIO-MBSHU8", n:8, v:false, note:"Une version v2 existe : prendre la référence en cours au tarif."}]},
    variation:{nom:"DIMinBOX, variateur universel {n} canaux (RLC, LED)", modules:[
      {ref:"ZDI-DBDX2", n:2}, {ref:"ZDIDBDX4", n:4}]},
    entrees:{nom:"RailQUAD, module {n} entrées (rail DIN)", modules:[
      {ref:"ZIORQ4", n:4}, {ref:"ZIORQ8V2", n:8}]},
    chauffage:{nom:"HeatingBOX 230V {n}X v2, actionneur chauffage avec thermostats", modules:[
      {ref:"ZCL4H230V2", n:4, thermo:4, v:false, note:"Nombre de thermostats (4) à confirmer sur la fiche v2."},
      {ref:"ZCL8H230V2", n:8, thermo:6, v:false, note:"6 thermostats pour 8 sorties (fiche de la v1) : à confirmer sur la fiche v2."}]},
    routeur:{ref:"ZSYIPRCL", nom:"IP Router CL, routeur KNX-IP"},
    coupleur:{ref:"ZSYIPRCL", nom:"IP Router CL utilisé en coupleur IP-TP (nouvelle ligne)"},
    dali:{ref:"ZDID64V3", nom:"DALI BOX Interface 64 v3 : 64 ballasts, 16 groupes"},
    clim:{ref:"ZCLDIV2", nom:"KLIC-DI v2, passerelle KNX pour Daikin (VRV, SKY)",
      note:"Autre marque de climatisation : prendre la passerelle KLIC de cette marque."},
    commande:{ref:"ZVI-SQTMD4-W", nom:"Square TMD, poussoir capacitif 4 boutons, sonde intégrée, blanc"},
    commandeSonde:{ref:"ZVI-SQTMD4-W", nom:"Square TMD, poussoir capacitif 4 boutons, sonde intégrée, blanc"},
    ecran:{ref:"ZVI-Z41PRO-W", nom:"Z41 Pro, écran tactile 4,1 pouces avec IP, blanc",
      note:"Écran de 4,1 pouces (pas de 6 pouces chez Zennio dans cette gamme)."}
  },
  theben: {nom:"Theben",
    alim:[{ref:"9070958", mA:640, nom:"PS 640 mA T KNX, alimentation 640 mA"}],
    commutation:{nom:"RMG 8 T KNX, actionneur 8 sorties, tout ou rien ou volets (4 volets au plus, MIX2)", modules:[{ref:"4930200", n:8}]},
    volets:{nom:"JMG 4 T KNX, actionneur volets 4 canaux, soit 4 volets (8 sorties montée / descente, module de base MIX2)", base:{ref:"4930250", n:4},
      ext:{ref:"4930255", n:4, max:2, nom:"JME 4 T KNX, extension volets 4 canaux, soit 4 volets (8 sorties montée / descente)"}},
    variation:{nom:"DMG 2 T KNX, variateur universel 2 canaux 400 W (module de base MIX2)", base:{ref:"4930270", n:2},
      ext:{ref:"4930275", n:2, max:2, nom:"DME 2 T KNX, extension variateur 2 canaux"}},
    entrees:{nom:"TA 8 S KNX, interface 8 entrées (encastrée)", modules:[{ref:"4969228", n:8}]},
    chauffage:{nom:"HMT 6 S KNX, actionneur chauffage 6 sorties 24 V avec régulateur", modules:[
      {ref:"4900373", n:6, thermo:6, v:false, note:"Sorties 24 V (têtes thermiques 24 V) ; nombre de régulateurs à confirmer sur la fiche."}]},
    routeur:{ref:"9070770", nom:"IPsecure Router KNX (alimentation 12-30 V ou PoE)"},
    coupleur:{ref:"9070770", nom:"IPsecure Router KNX utilisé en coupleur IP-TP (nouvelle ligne)"},
    dali:{ref:"4940301", nom:"DALI-Gateway S64 KNX : 64 luminaires"},
    clim:null,
    commande:{ref:"4969234", nom:"iON 104 KNX, poussoir 4 touches, sonde de température intégrée, blanc"},
    commandeSonde:{ref:"4969234", nom:"iON 104 KNX, poussoir 4 touches, sonde de température intégrée, blanc"},
    ecran:null
  }
};
var CLIM_TIERS = {ref:"—", nom:"Passerelle KNX / climatisation (Intesis ou équivalent)", v:false,
  note:"Pas de passerelle climatisation dans cette marque : la choisir selon la marque de la clim."};
var ECRAN_TIERS = {ref:"BE-GTSP6TW.01S", nom:"Écran 6 pouces MDT Glass Touch Smart Plus (pas d'écran 6 pouces Theben équivalent)", v:false,
  note:"Theben n'a pas d'écran 6 pouces équivalent : MDT proposé, à valider."};

var INDICATIF = "Références données à titre indicatif, à corriger au cas par cas (chantier, tarif du fournisseur) avant de commander.";

/* ---------- la saisie ---------- */
var CHAMPS = [
  ["volets", "Volets roulants", "un canal volet par volet : 2 sorties, montée et descente"],
  ["allumages", "Allumages tout ou rien (on/off)", "une sortie d'actionneur de commutation par circuit"],
  ["variation", "Allumages à variation", "un canal de variateur par circuit"],
  ["portes", "Portes sectionnelles / portails", "une sortie à contact sec (impulsion) chacun"],
  ["passerellesIp", "Passerelles IP", "visualisation, appli, programmation à distance"],
  ["clim", "Passerelles climatisation", "une par unité ou système de clim"],
  ["plexo", "Commandes Plexo (IP65) ou poussoirs classiques", "câblées sur des modules d'entrées"],
  ["commandes", "Commandes KNX", "boutons-poussoirs KNX"],
  ["commandesSonde", "Commandes KNX avec sonde de température", "boutons-poussoirs KNX à sonde intégrée"],
  ["ecrans", "Écrans tactiles 6 pouces", "type MDT Smart Plus ou Zennio Z41"],
  ["coupleurs", "Coupleurs IP-TP", "tableau secondaire, ou longueur de bus trop importante"],
  ["dali", "Passerelles DALI", "64 ballasts chacune"]
];
function vierge(){
  var s={nom:"", ref:"", marque:"mdt", plancher:false, zones:0, entreesParPlexo:1, etatPortes:true, reserve:20, secours:true, refs:{}, autres:[]};
  CHAMPS.forEach(function(c){ s[c[0]]=0; });
  return s;
}
var SAISIE = (function(){ try{ var v=JSON.parse(localStorage.getItem("knx:chiffrage")||"null"); if(v && typeof v==="object") return Object.assign(vierge(), v); }catch(e){} return vierge(); })();
var ID_COURANT = (function(){ try{ return localStorage.getItem("knx:chiffrage:id")||""; }catch(e){ return ""; } })();
var EXPORT_OUVERT = false;
function garderLocal(){ try{ localStorage.setItem("knx:chiffrage", JSON.stringify(SAISIE)); localStorage.setItem("knx:chiffrage:id", ID_COURANT); }catch(e){} }
function nb(v){ var n=parseInt(v, 10); return isFinite(n) && n>0 ? Math.min(n, 999) : 0; }

/* ---------- le calcul ---------- */
/* des modules de tailles données pour couvrir un besoin : les plus gros tant qu'il en
   faut plus, puis le plus petit qui suffit pour le reste */
function choisirModules(liste, besoin, taille){
  taille = taille || function(m){ return m.n; };
  var t = liste.slice().sort(function(a, b){ return taille(a) - taille(b); }), grand = t[t.length-1], out = [];
  var r = besoin;
  while(r > 0){
    if(r >= taille(grand)){ out.push(grand); r -= taille(grand); continue; }
    var m = t.filter(function(x){ return taille(x) >= r; })[0] || grand;
    out.push(m); r = 0;
  }
  return out;
}
function regrouper(mods){
  var m={}, ordre=[];
  mods.forEach(function(x){ if(!m[x.ref]){ m[x.ref]={mod:x, qte:0}; ordre.push(x.ref); } m[x.ref].qte++; });
  return ordre.map(function(r){ return m[r]; });
}
function nomDe(famille, mod){ return (mod.nom || famille.nom).replace(/\{n\}/g, mod.n).replace(/\{2n\}/g, 2*mod.n).replace(/\{demi\}/g, mod.n/2); }

/* une ligne du résultat, la même d'un calcul à l'autre : marque, catégorie, désignation, référence du catalogue */
function cleRef(marque, l){ return [marque, l.cat, l.nom, l.ref, l.option ? "option" : ""].join("|"); }
/* modifier une référence : le champ prend la place du texte ; Entrée ou en sortant, c'est gardé ;
   vide, la référence du catalogue revient */
function modifierRef(l, ou){
  var i=document.createElement("input"); i.type="text"; i.className="kc-ref-champ"; i.value=l.ref; i.maxLength=60;
  i.setAttribute("aria-label", "Référence de « "+l.nom+" »");
  ou.textContent=""; ou.appendChild(i); i.focus(); i.select();
  var fait=false;
  function garder(annuler){
    if(fait) return; fait=true;
    var v=i.value.trim();
    if(!annuler){
      SAISIE.refs=SAISIE.refs || {};
      if(!v || v===(l.refCatalogue || "")) delete SAISIE.refs[l.cle];
      else if(v!==l.ref || l.modifiee) SAISIE.refs[l.cle]=v;
      garderLocal();
    }
    peindreResultat();
  }
  i.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); garder(false); } if(e.key==="Escape"){ e.preventDefault(); garder(true); } });
  i.addEventListener("blur", function(){ garder(false); });
}
function celluleRef(l, cls, prefixe){
  var s=el("span", cls); s.appendChild(document.createTextNode((prefixe||"")+l.ref));
  if(l.modifiee) s.appendChild(el("span","kc-modif","modifiée"));
  /* un participant ajouté à la main : sa référence se change dans sa ligne, plus haut */
  if(l.cat==="Autres participants") return s;
  var b=el("button","kc-crayon"); b.type="button"; b.title="Modifier la référence"; b.setAttribute("aria-label","Modifier la référence de « "+l.nom+" »");
  b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/></svg>';
  b.addEventListener("click", function(e){ e.stopPropagation(); modifierRef(l, s); });
  s.appendChild(b);
  return s;
}
/* les autres participants KNX, en lignes libres : désignation, marque, référence, quantité ; « Garder »
   les range dans la Bibliothèque (Outils › Bibliothèque), catégorie KNX, d'où un toucher les reprend */
var BIBLIO=[];
function nomMarque(m){ m=String(m||"").trim(); return MARQUES[m.toLowerCase()] ? MARQUES[m.toLowerCase()].nom : m; }
function sansAccent(t){ return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function blocAutres(){
  var box=el("div","kc-autres");
  box.appendChild(el("h3","","Autres participants KNX"));
  box.appendChild(el("p","hint","Ce qui n'est pas dans la liste : détecteur de présence, station météo, interface, sonde… Chacun compte sur le bus (10 mA)."));
  /* les marques proposées en tapant : celles du catalogue, puis celles de la bibliothèque */
  var dl=el("datalist"); dl.id="kc_marques"; box.appendChild(dl);
  function majMarques(){
    var vues={}, l=[];
    Object.keys(MARQUES).map(function(k){ return MARQUES[k].nom; }).concat((BIBLIO||[]).map(function(p){ return nomMarque(p.marque); }))
      .forEach(function(m){ var k=sansAccent(m); if(m && !vues[k]){ vues[k]=true; l.push(m); } });
    dl.textContent=""; l.forEach(function(m){ var o=el("option"); o.value=m; dl.appendChild(o); });
  }
  var liste=el("div","kc-autres-liste"); box.appendChild(liste);
  function rang(a){
    var r=el("div","kc-autre");
    var n=el("input"); n.type="text"; n.placeholder="Désignation (détecteur de présence…)"; n.value=a.nom||""; n.maxLength=120; n.setAttribute("aria-label","Désignation");
    var mq=el("input"); mq.type="text"; mq.placeholder="Marque"; mq.value=a.marque||""; mq.maxLength=40; mq.className="mq"; mq.setAttribute("list","kc_marques"); mq.setAttribute("aria-label","Marque");
    var f=el("input"); f.type="text"; f.placeholder="Référence"; f.value=a.ref||""; f.maxLength=60; f.className="ref"; f.setAttribute("aria-label","Référence");
    var q=el("div","kc-num");
    var m=el("button","","−"); m.type="button"; m.setAttribute("aria-label","Un de moins");
    var qi=el("input"); qi.type="number"; qi.min="0"; qi.max="999"; qi.inputMode="numeric"; qi.value=String(nb(a.qte)); qi.setAttribute("aria-label","Quantité");
    var p=el("button","","+"); p.type="button"; p.setAttribute("aria-label","Un de plus");
    q.appendChild(m); q.appendChild(qi); q.appendChild(p);
    var x=el("button","kc-autre-x","×"); x.type="button"; x.setAttribute("aria-label","Retirer ce participant");
    /* le garder dans la bibliothèque, pour les prochains chiffrages */
    var gd=el("button","kc-garder","Garder"); gd.type="button"; gd.title="Garder ce participant dans la bibliothèque, pour les autres chiffrages";
    gd.addEventListener("click", function(){
      if(!String(n.value).trim()){ toast("Donnez d'abord une désignation."); n.focus(); return; }
      gd.disabled=true;
      api("knx-participant-enregistrer", {nom:n.value, ref:f.value, marque:mq.value}).then(function(x){
        gd.disabled=false;
        if(!x.ok){ toast(x.d.erreur || "Pas gardé."); return; }
        BIBLIO=x.d.participants || BIBLIO; peindreBiblio(); toast("Gardé dans la bibliothèque.");
      }).catch(function(){ gd.disabled=false; toast("Pas de réseau : réessayez."); });
    });
    function maj(){ a.nom=n.value; a.marque=mq.value; a.ref=f.value; a.qte=nb(qi.value); garderLocal(); peindreResultat(); }
    n.addEventListener("input", maj); mq.addEventListener("input", maj); f.addEventListener("input", maj); qi.addEventListener("input", maj);
    m.addEventListener("click", function(){ qi.value=String(Math.max(0, nb(qi.value)-1)); maj(); });
    p.addEventListener("click", function(){ qi.value=String(Math.min(999, nb(qi.value)+1)); maj(); });
    x.addEventListener("click", function(){ SAISIE.autres=SAISIE.autres.filter(function(y){ return y!==a; }); r.remove(); garderLocal(); peindreResultat(); });
    r.appendChild(n); r.appendChild(mq); r.appendChild(f); r.appendChild(q); r.appendChild(gd); r.appendChild(x);
    return r;
  }
  function ajouterLigne(a){
    SAISIE.autres.push(a);
    var r=rang(a); liste.appendChild(r);
    garderLocal(); peindreResultat();
    return r;
  }
  /* la bibliothèque, faite pour en tenir des centaines : une recherche (désignation, référence,
     marque), un filtre par marque, une liste compacte qui défile ; un toucher ajoute au chiffrage */
  var bib=el("div","kc-biblio"), FILTRE={texte:"", marque:""};
  var tete=el("div","kc-biblio-tete"), titre=el("h4",""), compte=el("span","kc-biblio-n");
  tete.appendChild(titre); tete.appendChild(compte);
  var cherche=el("input"); cherche.type="search"; cherche.className="kc-biblio-cherche"; cherche.placeholder="Chercher (nom, référence, marque)";
  cherche.setAttribute("aria-label","Chercher dans la bibliothèque");
  cherche.addEventListener("input", function(){ FILTRE.texte=cherche.value; peindreListe(); });
  var marques=el("div","kc-biblio-mq"), vide=el("p","hint"), lst=el("div","kc-biblio-l");
  bib.appendChild(tete); bib.appendChild(cherche); bib.appendChild(marques); bib.appendChild(vide); bib.appendChild(lst);
  function peindreBiblio(){
    majMarques();
    var l=BIBLIO||[];
    titre.textContent="Bibliothèque · KNX";
    var rien=!l.length;
    vide.hidden=!rien; vide.textContent="La catégorie KNX de votre Bibliothèque est vide : « Garder » sur un participant (avec sa référence) l'y range, pour tous vos chiffrages.";
    cherche.hidden=rien; marques.hidden=rien; lst.hidden=rien;
    /* les marques présentes, avec leur nombre ; celle du chiffrage d'abord */
    var n={}, ordre=[];
    l.forEach(function(p){ var m=nomMarque(p.marque) || "Sans marque"; if(!n[m]){ n[m]=0; ordre.push(m); } n[m]++; });
    var dCh=nomMarque(SAISIE.marque);
    ordre.sort(function(a, b){ return (a===dCh?-1:0)-(b===dCh?-1:0) || a.localeCompare(b, "fr"); });
    if(FILTRE.marque && !n[FILTRE.marque]) FILTRE.marque="";
    marques.textContent="";
    [["", "Toutes", l.length]].concat(ordre.map(function(m){ return [m, m, n[m]]; })).forEach(function(x){
      var b=el("button","chip"+(FILTRE.marque===x[0] ? " on" : ""), x[1]+" · "+x[2]); b.type="button";
      b.setAttribute("aria-pressed", FILTRE.marque===x[0] ? "true" : "false");
      b.addEventListener("click", function(){ FILTRE.marque=x[0]; peindreBiblio(); });
      marques.appendChild(b);
    });
    peindreListe();
  }
  function peindreListe(){
    var l=BIBLIO||[], dCh=nomMarque(SAISIE.marque), mots=sansAccent(FILTRE.texte).split(/\s+/).filter(Boolean);
    var vus=l.filter(function(p){
      var m=nomMarque(p.marque) || "Sans marque";
      if(FILTRE.marque && m!==FILTRE.marque) return false;
      var tout=sansAccent([p.nom, p.ref, m].join(" "));
      return mots.every(function(w){ return tout.indexOf(w)>=0; });
    }).sort(function(a, b){
      var ma=nomMarque(a.marque)===dCh?0:1, mb=nomMarque(b.marque)===dCh?0:1;
      return ma-mb || nomMarque(a.marque).localeCompare(nomMarque(b.marque), "fr") || a.nom.localeCompare(b.nom, "fr");
    });
    compte.textContent = l.length ? (vus.length===l.length ? String(l.length) : vus.length+" sur "+l.length) : "";
    lst.textContent="";
    if(l.length && !vus.length){ lst.appendChild(el("p","hint","Aucun participant ne correspond.")); return; }
    vus.forEach(function(p){
      var it=el("div","kc-biblio-it");
      var b=el("button","kc-biblio-aj"); b.type="button"; b.title="Ajouter à ce chiffrage";
      var nm=el("b",""); nm.appendChild(el("span","pl","+ ")); nm.appendChild(document.createTextNode(p.nom)); b.appendChild(nm);
      if(nomMarque(p.marque)) b.appendChild(el("span","mq",nomMarque(p.marque)));
      if(p.ref) b.appendChild(el("span","ref",p.ref));
      b.addEventListener("click", function(){ ajouterLigne({nom:p.nom, marque:nomMarque(p.marque), ref:p.ref, qte:1}); toast("« "+p.nom+" » ajouté."); });
      var s=el("button","kc-biblio-x","×"); s.type="button"; s.setAttribute("aria-label","Retirer « "+p.nom+" » de la bibliothèque");
      s.addEventListener("click", function(){
        if(!window.confirm("Retirer « "+p.nom+" » de la bibliothèque ?\n\nLes chiffrages qui l'utilisent le gardent.")) return;
        api("knx-participant-supprimer", {id:p.id}).then(function(x){ if(x.ok){ BIBLIO=x.d.participants || []; peindreBiblio(); } else toast(x.d.erreur || "Refusé."); });
      });
      it.appendChild(b); it.appendChild(s); lst.appendChild(it);
    });
  }
  if(!Array.isArray(SAISIE.autres)) SAISIE.autres=[];
  SAISIE.autres.forEach(function(a){ liste.appendChild(rang(a)); });
  var aj=el("button","act","+ Ajouter un participant"); aj.type="button";
  aj.addEventListener("click", function(){ ajouterLigne({nom:"", marque:"", ref:"", qte:1}).querySelector("input").focus(); });
  box.appendChild(aj);
  box.appendChild(bib);
  peindreBiblio();
  api("knx-participants").then(function(x){ if(x.ok){ BIBLIO=x.d.participants || []; peindreBiblio(); peindreMaterielPieces(); } }).catch(function(){});
  return box;
}
function calculer(s){
  var M = MARQUES[s.marque] || MARQUES.mdt;
  var lignes = [], alertes = [], notes = [];
  function ajouter(cat, nom, ref, qte, o){
    if(!(qte > 0)) return;
    o = o || {};
    lignes.push({cat:cat, nom:nom, ref:ref, qte:qte, v:o.v !== false, note:o.note || "", option:!!o.option, bus:o.bus !== false});
  }
  /* les actionneurs, canal par canal */
  function famille(cat, F, besoin, mots){
    mots = mots || ["canal libre", "canaux libres"];
    if(!(besoin > 0) || !F) return 0;
    var places = 0;
    if(F.base){                                   /* Theben MIX2 : un module de base, jusqu'à 2 extensions */
      var unites = Math.ceil(besoin / F.base.n), bases = Math.ceil(unites / (1 + F.ext.max)), exts = unites - bases;
      ajouter(cat, F.nom, F.base.ref, bases);
      ajouter(cat, F.ext.nom, F.ext.ref, exts);
      places = unites * F.base.n;
    } else {
      regrouper(choisirModules(F.modules, besoin)).forEach(function(g){
        ajouter(cat, nomDe(F, g.mod), g.mod.ref, g.qte, {v:g.mod.v, note:g.mod.note});
        places += g.mod.n * g.qte;
      });
    }
    if(places > besoin) notes.push(cat+" : "+(places-besoin)+" "+(places-besoin>1 ? mots[1] : mots[0])+" en réserve.");
    return places;
  }
  /* les volets : les actionneurs volets remplis restent. Le dernier, s'il n'est rempli qu'à
     moitié ou moins, est remplacé par l'actionneur tout ou rien en fonction volet (2 sorties par
     volet) ; rempli à plus de la moitié, il reste, sauf si les sorties libres du tout ou rien
     suffisent sans ajouter d'actionneur. */
  var volets = nb(s.volets), sortiesTor = nb(s.allumages) + nb(s.portes), Fv = M.volets;
  var mVolets = Fv.base ? [] : choisirModules(Fv.modules, volets), dernier = Fv.base ? Fv.base.n : (mVolets.length ? mVolets[mVolets.length-1].n : 0);
  var reste = Fv.base ? volets % dernier : volets - mVolets.slice(0, -1).reduce(function(a, m){ return a + m.n; }, 0);
  if(reste === dernier) reste = 0;
  var surTor = 0, U = M.universel || M.commutation;
  function combien(F, besoin){ return besoin > 0 ? choisirModules(F.modules, besoin).length : 0; }
  if(reste && (reste <= dernier/2 || combien(U, sortiesTor + 2*reste) <= combien(M.commutation, sortiesTor))) surTor = reste;
  var surVolets = volets - surTor, sorties = sortiesTor + 2*surTor;
  if(volets) notes.push("Volets : "+volets+" volet"+(volets>1?"s":"")+" = "+2*volets+" sorties (une pour la montée, une pour la descente), verrouillées pour ne jamais être alimentées ensemble."
    +(surTor ? " "+(surVolets ? surVolets+" sur actionneur volets (rempli), " : "")+surTor+" sur l'actionneur tout ou rien en fonction volet ("+2*surTor+" sorties) : "
      +(surVolets ? "un actionneur volets de moins." : "pas d'actionneur volets pour si peu.") : ""));
  famille("Commutation", surTor ? U : M.commutation, sorties, ["sortie libre", "sorties libres"]);
  if(nb(s.portes)) notes.push("Portes et portails : une sortie de commutation chacun, en contact sec (impulsion), soit "+nb(s.portes)+" sur les "+sorties+" sorties de commutation.");
  famille("Volets", Fv, surVolets);
  famille("Variation", M.variation, nb(s.variation));
  var entrees = nb(s.plexo) * Math.max(1, nb(s.entreesParPlexo) || 1) + (s.etatPortes ? nb(s.portes) : 0);
  famille("Entrées", M.entrees, entrees, ["entrée libre", "entrées libres"]);
  if(nb(s.plexo)) notes.push("Commandes Plexo : "+nb(s.plexo)+" × "+Math.max(1, nb(s.entreesParPlexo) || 1)+" contact"+((nb(s.entreesParPlexo)||1)>1?"s":"")+" = "+nb(s.plexo)*Math.max(1, nb(s.entreesParPlexo) || 1)+" entrée(s)"+(s.etatPortes && nb(s.portes) ? ", plus "+nb(s.portes)+" pour l'état des portes" : "")+".");

  /* le plancher chauffant : autant de régulateurs (fonction thermostat) que de zones */
  var zones = s.plancher ? nb(s.zones) : 0;
  if(zones){
    var F = M.chauffage, cap = function(m){ return Math.min(m.n, m.thermo || m.n); };
    var mods = choisirModules(F.modules, zones, cap), thermo = 0;
    regrouper(mods).forEach(function(g){
      ajouter("Chauffage au sol", nomDe(F, g.mod)+" ("+(g.mod.thermo || g.mod.n)+" régulateurs)", g.mod.ref, g.qte, {v:g.mod.v, note:g.mod.note});
      thermo += cap(g.mod) * g.qte;
    });
    notes.push("Chauffage au sol : "+zones+" zone"+(zones>1?"s":"")+", "+thermo+" fonction"+(thermo>1?"s":"")+" thermostat (une par zone, au moins).");
    /* chaque zone a besoin d'une mesure de température */
    var sondes = nb(s.commandesSonde) + nb(s.ecrans) + (s.marque!=="mdt" ? nb(s.commandes) : 0);
    if(sondes < zones) alertes.push("Il manque "+(zones-sondes)+" mesure"+(zones-sondes>1?"s":"")+" de température pour les zones de chauffage : ajoutez des commandes avec sonde (une par zone).");
  }
  ajouter("Commandes", M.commande.nom, M.commande.ref, nb(s.commandes), {v:M.commande.v, note:M.commande.note});
  ajouter("Commandes", M.commandeSonde.nom, M.commandeSonde.ref, nb(s.commandesSonde), {v:M.commandeSonde.v, note:M.commandeSonde.note});
  var E = M.ecran || ECRAN_TIERS;
  ajouter("Écrans", E.nom, E.ref, nb(s.ecrans), {v:E.v, note:E.note});
  ajouter("Passerelles", M.routeur.nom, M.routeur.ref, nb(s.passerellesIp));
  var C = M.clim || CLIM_TIERS;
  ajouter("Passerelles", C.nom, C.ref, nb(s.clim), {v:C.v, note:C.note});
  ajouter("Passerelles", M.dali.nom, M.dali.ref, nb(s.dali));

  /* les autres participants, ajoutés à la main (détecteur, station météo, interface…) : chacun compte sur le bus */
  (s.autres||[]).forEach(function(a){
    var q=nb(a.qte), mq=String(a.marque||"").trim(), nom=(String(a.nom||"").trim() || "Participant KNX")+(mq ? " ("+mq+")" : ""), ref=String(a.ref||"").trim();
    ajouter("Autres participants", nom, ref || "—", q, {v:!!ref, note: ref ? "" : "Référence à compléter."});
  });

  /* le bus : 10 mA par participant, des lignes de 64 participants au plus, une
     alimentation par ligne, avec la réserve choisie */
  var reserve = Math.max(0, Math.min(50, parseInt(s.reserve, 10) || 0)) / 100;
  var alimMax = M.alim[M.alim.length-1].mA;
  var parLigneMax = Math.min(MAX_PARTICIPANTS_LIGNE, Math.floor(alimMax / (1 + reserve) / ALIM_PAR_PARTICIPANT));
  var appareils = lignes.reduce(function(a, l){ return a + (l.bus ? l.qte : 0); }, 0);
  var coupleursSaisis = nb(s.coupleurs), coupleurs = coupleursSaisis, nLignes = 1, participants = appareils;
  for(var k=0; k<8; k++){
    participants = appareils + coupleurs;
    nLignes = Math.max(1 + coupleursSaisis, Math.ceil(participants / parLigneMax));
    if(nLignes - 1 <= coupleurs) break;
    coupleurs = nLignes - 1;
  }
  if(coupleurs > coupleursSaisis) alertes.push((coupleurs - coupleursSaisis)+" coupleur"+(coupleurs - coupleursSaisis>1?"s":"")+" IP-TP ajouté"+(coupleurs - coupleursSaisis>1?"s":"")+" : "+participants+" participants dépassent "+parLigneMax+" par ligne (alimentation de "+alimMax+" mA avec "+Math.round(reserve*100)+" % de réserve).");
  ajouter("Bus KNX", M.coupleur.nom, M.coupleur.ref, coupleurs);
  var parLigne = Math.ceil(participants / nLignes);
  var besoinLigne = parLigne * ALIM_PAR_PARTICIPANT, besoinAvecReserve = Math.ceil(besoinLigne * (1 + reserve));
  var alim = M.alim.filter(function(a){ return a.mA >= besoinAvecReserve; })[0] || M.alim[M.alim.length-1];
  ajouter("Bus KNX", alim.nom, alim.ref, nLignes, {bus:false});
  if(s.secours) ajouter("Bus KNX", "Option : "+alim.nom.charAt(0).toLowerCase()+alim.nom.slice(1)+", de secours", alim.ref, 1, {bus:false, option:true});
  var bus = {participants:participants, appareils:appareils, lignes:nLignes, parLigne:parLigne, mA:participants*ALIM_PAR_PARTICIPANT,
    mALigne:besoinLigne, mAReserve:besoinAvecReserve, alim:alim, reserve:Math.round(reserve*100), parLigneMax:parLigneMax};
  if(!appareils) alertes.push("Rien à chiffrer pour l'instant : indiquez au moins un élément.");
  /* les références modifiées à la main (le crayon à côté de la référence) : gardées dans la saisie,
     elles remplacent celle du catalogue sur le site, dans le PDF et dans le tableur */
  var faites=s.refs || {};
  lignes.forEach(function(l){
    var k=cleRef(s.marque, l), r=faites[k];
    if(r){ l.refCatalogue=l.ref; l.ref=r; l.modifiee=true; l.v=true; l.note=(l.note ? l.note+" " : "")+"Référence modifiée (catalogue : "+l.refCatalogue+")."; }
    l.cle=k;
  });
  return {saisie:s, marque:M.nom, cle:s.marque, indicatif:INDICATIF, lignes:lignes, bus:bus, alertes:alertes, notes:notes,
    aVerifier:lignes.filter(function(l){ return !l.v; }).length, date:new Date().toISOString()};
}

/* ---------- l'écran ---------- */
var STYLE = ".vues{display:flex;gap:6px;max-width:1100px;margin:12px auto 0;padding:0 16px}"
  +".vues button{min-height:38px;padding:0 16px;border-radius:999px;border:1px solid var(--rule);background:#fff;color:var(--ink-2);font-weight:600;font-size:14px}"
  +".vues button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}"
  +".kc-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}"
  +".kc-champ{border:1px solid var(--rule);border-radius:10px;padding:10px 12px;background:#FCFBF8;display:flex;align-items:center;gap:10px}"
  +".kc-champ .tx{flex:1;min-width:0}.kc-champ b{display:block;font-size:14px}.kc-champ small{display:block;font-size:12px;color:var(--ink-3);line-height:1.3}"
  +".kc-num{display:flex;align-items:center;gap:4px;flex:0 0 auto}"
  +".kc-num button{width:34px;height:34px;border-radius:50%;border:1px solid var(--rule);background:#fff;font-size:18px;line-height:1;color:var(--ink-2);padding:0}"
  +".kc-num input{width:54px;text-align:center;font:inherit;font-size:16px;font-weight:700;min-height:36px;border:1px solid var(--rule);border-radius:8px;background:#fff;color:var(--ink);-moz-appearance:textfield}"
  +".kc-num input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}"
  +".kc-marques{display:flex;gap:8px;flex-wrap:wrap}"
  +".kc-marques button{min-height:42px;padding:0 18px;border-radius:10px;border:1px solid var(--rule);background:#fff;font-weight:700;font-size:15px}"
  +".kc-marques button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff}"
  +".kc-oui{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}"
  +".kc-oui label{display:inline-flex;align-items:center;gap:7px;font-weight:600;font-size:14px}"
  +".kc-autres{margin-top:16px;padding-top:12px;border-top:1px solid var(--rule)}"
  +".kc-autres h3{margin:0 0 2px;font-size:15px}"
  +".kc-autres-liste{display:flex;flex-direction:column;gap:8px;margin:8px 0 10px}"
  +".kc-autre{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap;border:1px solid var(--rule);border-radius:10px;padding:8px 48px 8px 10px;background:#FCFBF8}"
  +".kc-autre input[type=text]{flex:2 1 200px;min-width:0;min-height:38px;font:inherit;font-size:15px;padding:6px 10px;border:1px solid var(--rule);border-radius:8px;background:#fff;color:var(--ink)}"
  +".kc-autre input.ref{flex:1 1 130px;font-family:var(--mono);font-size:14px}"
  +".kc-garder{min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--rule);background:#fff;color:var(--ink-2);font:600 13px/1 inherit;font-family:inherit}"
  +".kc-biblio{margin-top:14px;padding:10px 12px;border:1px dashed var(--rule);border-radius:10px}"
  +".kc-biblio-tete{display:flex;align-items:baseline;gap:8px}"
  +".kc-biblio h4{margin:0 0 6px;font-size:13.5px}"
  +".kc-biblio-n{font-size:12px;font-weight:700;color:var(--ink-3)}"
  +".kc-biblio-cherche{width:100%;min-height:38px;font:inherit;font-size:15px;padding:6px 12px;border:1px solid var(--rule);border-radius:8px;background:#fff;color:var(--ink);margin:2px 0 8px}"
  +".kc-biblio-mq{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-bottom:6px;scrollbar-width:thin}"
  +".kc-biblio-mq .chip{flex:0 0 auto;min-height:32px;font-size:12.5px}"
  +".kc-biblio-l{max-height:300px;overflow-y:auto;border:1px solid var(--rule);border-radius:8px;background:#fff}"
  +".kc-biblio-it{display:flex;align-items:stretch;border-bottom:1px solid #EEF1F4}"
  +".kc-biblio-it:last-child{border-bottom:0}"
  +".kc-biblio-aj{flex:1;min-width:0;display:flex;align-items:center;flex-wrap:wrap;gap:2px 8px;min-height:40px;padding:6px 10px;border:0;background:none;color:var(--ink);font:inherit;font-size:13.5px;text-align:left;cursor:pointer}"
  +".kc-biblio-aj:hover{background:#F4F7FD}"
  +".kc-biblio-aj .pl{font-weight:800;color:var(--accent)}"
  +".kc-biblio-aj b{font-weight:600}"
  +".kc-biblio-aj .mq{font-size:11px;font-weight:700;color:var(--accent);background:#EEF3FF;border-radius:999px;padding:1px 7px}"
  +".kc-biblio-aj .ref{font-family:var(--mono);font-size:12px;color:var(--ink-3);white-space:nowrap;margin-left:auto}"
  +".kc-biblio-x{flex:0 0 auto;border:0;border-left:1px solid #EEF1F4;background:#F8F9FB;color:var(--ink-3);width:36px;font-size:16px;padding:0;min-height:0}"
  +".kc-autre input.mq{flex:1 1 110px;font-size:14px}"
  +".kc-autre-x{position:absolute;top:11px;right:9px;width:32px;height:32px;min-height:0;padding:0;border-radius:50%;border:0;background:#F1F3F6;color:var(--ink-2);font-size:18px;line-height:1}"
  +".kc-res table{width:100%;border-collapse:collapse;font-size:13.5px}"
  +".kc-res th{text-align:left;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);padding:6px 8px;border-bottom:1px solid var(--rule)}"
  +".kc-res td{padding:8px;border-bottom:1px solid #EEF1F4;vertical-align:top}"
  +".kc-res td.ref{font-family:var(--mono);font-size:12.5px;white-space:nowrap}.kc-res td.q{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}"
  +".kc-res tr.cat td{background:#F4F6FA;font-weight:700;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-2)}"
  +".kc-res tr.opt td{color:var(--ink-3);font-style:italic}"
  +".kc-verif{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:999px;background:#FFF4D6;color:#8A5A00;font-size:11px;font-weight:700;font-style:normal}"
  +".kc-note{display:block;font-size:12px;color:var(--ink-3);margin-top:2px}"
  +".kc-ref{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}"
  +".kc-crayon{width:26px;height:26px;min-height:0;padding:0;margin-left:2px;border:1px solid transparent;border-radius:50%;background:none;color:var(--ink-3);display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;cursor:pointer}"
  +".kc-crayon:hover{background:#EEF2F8;color:var(--accent)}"
  +".kc-crayon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
  +".kc-modif{display:inline-block;padding:1px 7px;border-radius:999px;background:#E3F0FF;color:#1D4ED8;font:700 11px/1.5 inherit;font-family:inherit}"
  +".kc-ref-champ{font:inherit;font-family:var(--mono);font-size:13px;width:150px;max-width:100%;min-height:32px;padding:4px 8px;border:1px solid var(--accent);border-radius:8px;background:#fff;color:var(--ink)}"
  +".kc-bus{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:0 0 12px}"
  +".kc-bus div{border:1px solid var(--rule);border-radius:10px;padding:8px 10px;background:#FCFBF8}"
  +".kc-bus b{display:block;font-size:20px;letter-spacing:-.02em}.kc-bus span{font-size:12px;color:var(--ink-3)}"
  +".kc-alerte{border-left:3px solid var(--rouge);background:var(--rouge-soft);padding:8px 12px;border-radius:8px;margin:0 0 8px;font-size:13.5px}"
  +".kc-indicatif{background:#FDF3DC;color:#8A5A00;font-weight:700;font-size:13.5px;padding:8px 12px;border-radius:8px;margin:0 0 10px}"
  +".kc-info{font-size:13px;color:var(--ink-2);margin:4px 0 0;padding-left:18px}"
  +".kc-verrou{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px dashed var(--rule);border-radius:10px;padding:10px 12px;margin-top:12px;font-size:13.5px;color:var(--ink-2)}"
  +".kc-liste{display:flex;flex-direction:column;gap:6px}"
  +".kc-liste .it{display:flex;align-items:center;gap:8px;border:1px solid var(--rule);border-radius:10px;padding:8px 10px;background:#fff}"
  +".kc-liste .it .tx{flex:1;min-width:0}.kc-liste .it b{display:block;font-size:14px}.kc-liste .it small{color:var(--ink-3);font-size:12px}"
  +".kc-champ[hidden],.kc-note[hidden],.vues[hidden]{display:none!important}"
  +"@media (max-width:640px){.kc-res .ref-col{display:none}}";

var VUE=null;
function construire(){
  if($("outilChiffrage") && $("outilChiffrage").__fait) return;
  if(!$("kcStyle")){ var st=document.createElement("style"); st.id="kcStyle"; st.textContent=STYLE; document.head.appendChild(st); }
  /* les deux vues de l'outil : adresses de groupe, chiffrage */
  var nav=$("vues"), main=$("outilChiffrage");
  main.__fait=true;
  nav.hidden=false;
  VUE = function vue(v){
    var chif = v==="chiffrage";
    $("outil").hidden=chif; main.hidden=!chif;
    Array.prototype.forEach.call(nav.querySelectorAll("button"), function(b){ b.setAttribute("aria-pressed", b.dataset.vue===v ? "true" : "false"); });
    var h=document.querySelector("header h1"); if(h) h.textContent = chif ? "Chiffrage KNX" : "Adresses de groupe KNX";
    if($("total")) $("total").style.visibility = chif ? "hidden" : "";      /* le compte des adresses : seulement dans leur vue */
    document.title = (chif ? "Chiffrage KNX" : "Adresses KNX")+" — Suivi travaux 360";
    try{ localStorage.setItem("knx:vue", v); }catch(e){}
    if(chif){ peindre(); chargerListe(); }
  };
  if(!nav.__lie){ nav.__lie=true; nav.addEventListener("click", function(e){ var b=e.target.closest("button[data-vue]"); if(b) VUE(b.dataset.vue); }); }

  /* le projet */
  var b1=el("div","block");
  b1.appendChild(el("h2","","Le projet"));
  b1.appendChild(el("p","hint","Saisissez ce que l'installation pilote : la liste du matériel se calcule à mesure, avec les références de la marque choisie."));
  var lg=el("div","ligne");
  [["kc_nom","Nom du chiffrage","ex. Maison DUPONT","nom"],["kc_ref","Référence du chantier (facultatif)","ex. 2026-041","ref"]].forEach(function(c){
    var d=el("div"); var l=el("label","l",c[1]); l.htmlFor=c[0]; var i=el("input"); i.type="text"; i.id=c[0]; i.placeholder=c[2]; i.value=SAISIE[c[3]]||"";
    i.addEventListener("input", function(){ SAISIE[c[3]]=i.value; garderLocal(); peindreResultat(); });
    d.appendChild(l); d.appendChild(i); lg.appendChild(d);
  });
  b1.appendChild(lg);
  var lm=el("label","l","Marque"); lm.style.marginTop="12px"; b1.appendChild(lm);
  var mq=el("div","kc-marques"); mq.setAttribute("role","group"); mq.setAttribute("aria-label","Marque");
  ["mdt","zennio","theben"].forEach(function(k){
    var b=el("button","",MARQUES[k].nom); b.type="button"; b.dataset.m=k;
    b.addEventListener("click", function(){ SAISIE.marque=k; garderLocal(); peindre(); peindreMaterielPieces(); });
    mq.appendChild(b);
  });
  b1.appendChild(mq);
  main.appendChild(b1);

  /* les quantités */
  var b2=el("div","block");
  b2.appendChild(el("h2","","Les éléments"));
  var rp=blocReprise(); if(rp) b2.appendChild(rp);
  var g=el("div","kc-grille"); g.id="kc_grille";
  CHAMPS.forEach(function(c){ g.appendChild(champ(c[0], c[1], c[2])); });
  b2.appendChild(g);
  var ou=el("div","kc-oui");
  ou.appendChild(caseCoche("kc_plancher", "Plancher chauffant", "plancher"));
  var zc=champ("zones", "Zones à contrôler", "un régulateur (fonction thermostat) par zone"); zc.id="kc_zones"; zc.style.flex="1 1 260px";
  ou.appendChild(zc);
  b2.appendChild(ou);
  var ou2=el("div","kc-oui");
  ou2.appendChild(caseCoche("kc_etat", "Retour d'état des portes (une entrée chacune)", "etatPortes"));
  ou2.appendChild(caseCoche("kc_secours", "Alimentation de secours en option", "secours"));
  var lr=el("label",""); lr.appendChild(document.createTextNode("Réserve d'alimentation "));
  var sr=el("select"); sr.id="kc_reserve"; sr.style.width="auto"; [0,10,20,30].forEach(function(v){ var o=el("option","",v+" %"); o.value=v; sr.appendChild(o); });
  sr.value=String(SAISIE.reserve); sr.addEventListener("change", function(){ SAISIE.reserve=parseInt(sr.value,10)||0; garderLocal(); peindreResultat(); });
  lr.appendChild(sr); ou2.appendChild(lr);
  var lp=el("label",""); lp.appendChild(document.createTextNode("Contacts par commande Plexo "));
  var sp=el("select"); sp.id="kc_ppx"; sp.style.width="auto"; [1,2,3,4].forEach(function(v){ var o=el("option","",String(v)); o.value=v; sp.appendChild(o); });
  sp.value=String(SAISIE.entreesParPlexo||1); sp.addEventListener("change", function(){ SAISIE.entreesParPlexo=parseInt(sp.value,10)||1; garderLocal(); peindreResultat(); });
  lp.appendChild(sp); ou2.appendChild(lp);
  b2.appendChild(ou2);
  b2.appendChild(blocAutres());
  var bt=el("div","boutons");
  var bz=el("button","act","Remettre à zéro"); bz.type="button";
  bz.addEventListener("click", function(){ if(!window.confirm("Effacer la saisie en cours ?")) return; var m=SAISIE.marque; SAISIE=vierge(); SAISIE.marque=m; ID_COURANT=""; garderLocal(); main.textContent=""; main.__fait=false; construireDeNouveau(); });
  bt.appendChild(bz); b2.appendChild(bt);
  main.appendChild(b2);

  /* le résultat */
  var b3=el("div","block kc-res"); b3.id="kc_res"; main.appendChild(b3);

  /* les chiffrages enregistrés */
  var b4=el("div","block");
  b4.appendChild(el("h2","","Chiffrages enregistrés"));
  b4.appendChild(el("p","hint","Sur le site, pour toutes les personnes qui ont l'outil KNX."));
  var bb=el("div","boutons"); bb.style.marginTop="0";
  var be=el("button","act plein","Enregistrer ce chiffrage"); be.type="button"; be.id="kc_enr";
  be.addEventListener("click", enregistrer);
  var bn=el("button","act","Nouveau chiffrage"); bn.type="button";
  bn.addEventListener("click", function(){ ID_COURANT=""; var m=SAISIE.marque; SAISIE=vierge(); SAISIE.marque=m; garderLocal(); main.textContent=""; main.__fait=false; construireDeNouveau(); toast("Nouveau chiffrage."); });
  bb.appendChild(be); bb.appendChild(bn); b4.appendChild(bb);
  var li=el("div","kc-liste"); li.id="kc_liste"; li.style.marginTop="12px"; b4.appendChild(li);
  main.appendChild(b4);

  var v="adresses"; try{ v=localStorage.getItem("knx:vue")||"adresses"; }catch(e){}
  VUE(v==="chiffrage" ? "chiffrage" : "adresses");
}
function construireDeNouveau(){ construire(); VUE("chiffrage"); }
function champ(k, titre, aide){
  var c=el("div","kc-champ");
  var tx=el("div","tx"); tx.appendChild(el("b","",titre)); tx.appendChild(el("small","",aide)); c.appendChild(tx);
  var n=el("div","kc-num");
  var m=el("button","","−"); m.type="button"; m.setAttribute("aria-label","Un de moins : "+titre);
  var i=el("input"); i.type="number"; i.min="0"; i.max="999"; i.inputMode="numeric"; i.id="kc_"+k; i.setAttribute("aria-label", titre);
  i.value=String(SAISIE[k]||0);
  var p=el("button","","+"); p.type="button"; p.setAttribute("aria-label","Un de plus : "+titre);
  function mettre(v){ SAISIE[k]=Math.max(0, Math.min(999, v)); i.value=String(SAISIE[k]); garderLocal(); peindreResultat(); }
  m.addEventListener("click", function(){ mettre(nb(i.value)-1); });
  p.addEventListener("click", function(){ mettre(nb(i.value)+1); });
  i.addEventListener("input", function(){ SAISIE[k]=nb(i.value); garderLocal(); peindreResultat(); });
  i.addEventListener("focus", function(){ try{ i.select(); }catch(e){} });
  n.appendChild(m); n.appendChild(i); n.appendChild(p); c.appendChild(n);
  return c;
}
function caseCoche(id, txt, k){
  var l=el("label",""); var c=el("input"); c.type="checkbox"; c.id=id; c.checked=!!SAISIE[k];
  c.addEventListener("change", function(){ SAISIE[k]=c.checked; garderLocal(); peindre(); });
  l.appendChild(c); l.appendChild(document.createTextNode(txt)); return l;
}
function peindre(){
  Array.prototype.forEach.call(document.querySelectorAll(".kc-marques button"), function(b){ b.setAttribute("aria-pressed", b.dataset.m===SAISIE.marque ? "true" : "false"); });
  var z=$("kc_zones"); if(z) z.hidden=!SAISIE.plancher;
  peindreResultat();
}
var DERNIER=null;
function peindreResultat(){
  var h=$("kc_res"); if(!h) return;
  var R=DERNIER=calculer(SAISIE);
  h.textContent="";
  var tete=el("div",""); tete.style.cssText="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px";
  var h2=el("h2","","Matériel "+R.marque); h2.style.flex="1"; tete.appendChild(h2);
  h.appendChild(tete);
  R.alertes.forEach(function(a){ h.appendChild(el("p","kc-alerte",a)); });
  var B=R.bus, bus=el("div","kc-bus");
  [[B.participants, "participants KNX"], [B.mA+" mA", "consommation du bus (10 mA chacun)"], [B.lignes, B.lignes>1 ? "lignes" : "ligne"],
   [B.alim.mA+" mA", "alimentation par ligne ("+B.mAReserve+" mA avec "+B.reserve+" % de réserve)"]].forEach(function(x){
    var d=el("div",""); d.appendChild(el("b","",String(x[0]))); d.appendChild(el("span","",x[1])); bus.appendChild(d);
  });
  h.appendChild(bus);
  if(R.lignes.length) h.appendChild(el("p","kc-indicatif",INDICATIF));
  if(R.lignes.length){
    var t=el("table"); var th=el("thead"); var tr=el("tr");
    [["Désignation",""],["Référence","ref-col"],["Qté",""]].forEach(function(x){ var c=el("th",x[1],x[0]); if(x[0]==="Qté") c.style.textAlign="right"; tr.appendChild(c); });
    th.appendChild(tr); t.appendChild(th);
    var tb=el("tbody"), cat="";
    R.lignes.forEach(function(l){
      if(l.cat!==cat){ cat=l.cat; var r0=el("tr","cat"); var c0=el("td","",cat); c0.colSpan=3; r0.appendChild(c0); tb.appendChild(r0); }
      var r=el("tr", l.option ? "opt" : "");
      var d=el("td",""); d.appendChild(document.createTextNode(l.nom));
      if(!l.v){ d.appendChild(el("span","kc-verif","à vérifier")); }
      d.appendChild(celluleRef(l, "kc-note ref-mobile", "Réf. "));
      if(l.note) d.appendChild(el("span","kc-note",l.note));
      var tdRef=el("td","ref ref-col"); tdRef.appendChild(celluleRef(l, "kc-ref"));
      r.appendChild(d); r.appendChild(tdRef); r.appendChild(el("td","q",String(l.qte)));
      tb.appendChild(r);
    });
    t.appendChild(tb); h.appendChild(t);
  }
  if(R.notes.length){ var ul=el("ul","kc-info"); R.notes.forEach(function(n){ ul.appendChild(el("li","",n)); }); h.appendChild(ul); }
  if(R.aVerifier) h.appendChild(el("p","hint","« À vérifier » : référence ou capacité à confirmer sur le tarif du fournisseur avant de commander."));
  /* le téléchargement, verrouillé tant que l'administrateur ne l'a pas ouvert */
  var v=el("div","kc-verrou");
  if(EXPORT_OUVERT){
    var bp=el("button","act plein","Télécharger le PDF"); bp.type="button"; bp.addEventListener("click", function(){ exporter("pdf", bp); });
    var bc=el("button","act","Télécharger pour le tableur"); bc.type="button"; bc.addEventListener("click", function(){ exporter("csv", bc); });
    v.appendChild(bp); v.appendChild(bc);
  } else {
    v.appendChild(el("span","","🔒 Téléchargement verrouillé : l'administrateur l'ouvre dans Équipe."));
    var bd=el("button","act petit","Demander l'accès"); bd.type="button";
    bd.addEventListener("click", function(){
      bd.disabled=true;
      api("knx-export-demande", {}).then(function(x){ toast(x.ok ? "Demande envoyée à l'administrateur." : (x.d.erreur || "Demande refusée.")); })
        .catch(function(){ bd.disabled=false; toast("Pas de réseau."); });
    });
    v.appendChild(bd);
  }
  h.appendChild(v);
  /* sur téléphone, la colonne Référence se replie sous la désignation */
  var montrerRef = window.matchMedia && window.matchMedia("(max-width:640px)").matches;
  Array.prototype.forEach.call(h.querySelectorAll(".ref-mobile"), function(x){ x.hidden=!montrerRef; });
}
var EXPORT_SCRIPT=null;
function exporter(format, b){
  if(!DERNIER || !DERNIER.lignes.length){ toast("Rien à télécharger."); return; }
  b.disabled=true;
  (EXPORT_SCRIPT ? Promise.resolve(true) : api("knx-export", {}).then(function(x){
    if(!x.ok){ if(x.d.verrou){ EXPORT_OUVERT=false; peindreResultat(); } throw new Error(x.d.erreur || "Téléchargement refusé."); }
    var s=document.createElement("script"); s.textContent=x.d.script; document.body.appendChild(s); EXPORT_SCRIPT=true; return true;
  })).then(function(){
    return window.KnxExport[format](DERNIER);
  }).then(function(){ b.disabled=false; }, function(e){ b.disabled=false; toast(e && e.message ? e.message : "Téléchargement impossible."); });
}

/* ---------- les chiffrages enregistrés sur le site ---------- */
function chargerListe(){
  var li=$("kc_liste"); if(!li) return;
  api("knx-chiffrages").then(function(x){
    if(!x.ok){ li.textContent=x.d.erreur || ""; return; }
    var avant=EXPORT_OUVERT; EXPORT_OUVERT=!!x.d.export; if(avant!==EXPORT_OUVERT) peindreResultat();
    li.textContent="";
    var l=x.d.chiffrages||[];
    if(!l.length){ li.appendChild(el("p","hint","Aucun chiffrage enregistré.")); return; }
    l.forEach(function(c){
      var it=el("div","it"); var tx=el("div","tx");
      tx.appendChild(el("b","",c.nom+(c.ref ? " · "+c.ref : "")));
      tx.appendChild(el("small","",(MARQUES[c.marque] ? MARQUES[c.marque].nom : c.marque)+" · "+(c.par||"")+" · "+new Date(c.maj).toLocaleDateString("fr-FR")+(c.id===ID_COURANT ? " · ouvert" : "")));
      it.appendChild(tx);
      var o=el("button","act petit","Ouvrir"); o.type="button";
      o.addEventListener("click", function(){
        api("knx-chiffrage-enregistrer", {id:c.id, lire:true}).then(function(y){
          if(!y.ok){ toast(y.d.erreur || "Chiffrage introuvable."); return; }
          SAISIE=Object.assign(vierge(), y.d.chiffrage.saisie, {nom:y.d.chiffrage.nom, ref:y.d.chiffrage.ref, marque:y.d.chiffrage.marque});
          ID_COURANT=c.id; garderLocal();
          var main=$("outilChiffrage"); main.textContent=""; main.__fait=false; construireDeNouveau();
          toast("Chiffrage ouvert : "+c.nom+".");
        }).catch(function(){ toast("Pas de réseau."); });
      });
      var s=el("button","x","×"); s.type="button"; s.setAttribute("aria-label","Supprimer "+c.nom);
      s.addEventListener("click", function(){
        if(!window.confirm("Supprimer le chiffrage « "+c.nom+" » ?")) return;
        api("knx-chiffrage-supprimer", {id:c.id}).then(function(){ if(c.id===ID_COURANT){ ID_COURANT=""; garderLocal(); } chargerListe(); });
      });
      it.appendChild(o); it.appendChild(s); li.appendChild(it);
    });
  }).catch(function(){ li.textContent="Pas de réseau : la liste n'a pas pu être lue."; });
}
function enregistrer(){
  var b=$("kc_enr"); b.disabled=true;
  var corps={id:ID_COURANT, nom:SAISIE.nom, ref:SAISIE.ref, marque:SAISIE.marque, saisie:SAISIE};
  api("knx-chiffrage-enregistrer", corps).then(function(x){
    b.disabled=false;
    if(!x.ok){ toast(x.d.erreur || "Enregistrement refusé."); return; }
    ID_COURANT=x.d.id; garderLocal(); chargerListe(); toast("Chiffrage enregistré sur le site.");
  }).catch(function(){ b.disabled=false; toast("Pas de réseau : chiffrage non enregistré."); });
}

/* ---------- depuis les pièces des adresses de groupe ----------
   Les pièces saisies dans « Adresses de groupe » donnent les quantités : volets et BSO,
   allumages, prises commandées, variation, portes et gâches, zones de chauffage, commandes,
   détecteurs. Le bloc « Matériel » de cette vue en tire les actionneurs et leurs références,
   à mesure ; « Ouvrir dans le chiffrage » reprend ces quantités dans le chiffrage complet,
   où l'on ajoute ce que les pièces ne disent pas (écrans, passerelles IP, DALI, Plexo). */
var AUTO = [["rvb", "Contrôleur LED RVB (couleur)", /\b(rvb|rgb)/], ["detecteurs", "Détecteur de présence", /detecteur|presence/],
  ["exterieur", "Sonde de température extérieure", /exterieur|meteo/]];
/* la référence d'un participant ajouté pour les pièces : celle de la bibliothèque KNX, de la même marque */
function refBiblio(re, marque){
  var m=nomMarque(marque), p=(BIBLIO||[]).filter(function(x){ return re.test(sansAccent(x.nom)) && nomMarque(x.marque)===m && x.ref; })[0];
  return p ? {nom:p.nom, ref:p.ref, marque:m} : null;
}
function depuisPieces(b, marque){
  var d={volets:b.volets+b.bso, allumages:b.eclTor+b.prises+b.vmc, variation:b.variation, portes:b.garages+b.gaches,
    plancher:!b.airzone && b.zones>0, zones:b.airzone ? 0 : b.zones, clim:b.airzone ? b.systemes : 0,
    commandes:b.commandes, commandesSonde:b.sondes, autres:[]};
  AUTO.forEach(function(x){
    var q = x[0]==="exterieur" ? (b.exterieur ? 1 : 0) : b[x[0]];
    if(!q) return;
    var t=refBiblio(x[2], marque);
    d.autres.push({nom:t ? t.nom : x[1], marque:t ? t.marque : "", ref:t ? t.ref : "", qte:q, auto:x[0]});
  });
  return d;
}
function saisieDesPieces(){
  var b=window.KNX.besoins();
  var s=Object.assign(vierge(), {marque:SAISIE.marque, reserve:SAISIE.reserve, secours:SAISIE.secours, etatPortes:SAISIE.etatPortes, refs:SAISIE.refs||{}},
    depuisPieces(b, SAISIE.marque));
  return {b:b, s:s};
}
function reprendrePieces(){
  if(!window.KNX || !window.KNX.besoins) return;
  var b=window.KNX.besoins();
  if(!b.pieces){ toast("Aucune pièce dans les adresses de groupe."); return; }
  var d=depuisPieces(b, SAISIE.marque);
  Object.keys(d).forEach(function(k){ if(k!=="autres") SAISIE[k]=d[k]; });
  /* les participants ajoutés à la main restent ; ceux venus des pièces sont remplacés */
  var avant={};
  (SAISIE.autres||[]).forEach(function(a){ if(a.auto) avant[a.auto]=a; });
  d.autres.forEach(function(a){
    var v=avant[a.auto];                                          /* une référence déjà tapée sur cette ligne reste */
    if(v && String(v.ref||"").trim()){ a.nom=v.nom||a.nom; a.marque=v.marque; a.ref=v.ref; }
  });
  SAISIE.autres=(SAISIE.autres||[]).filter(function(a){ return !a.auto; }).concat(d.autres);
  if(!String(SAISIE.nom||"").trim() && b.nom) SAISIE.nom=b.nom;
  SAISIE.depuisPieces=new Date().toISOString();
  garderLocal();
  var main=$("outilChiffrage"); main.textContent=""; main.__fait=false; construireDeNouveau();
  try{ window.scrollTo(0, 0); }catch(e){}
  toast("Quantités reprises des "+b.pieces+" pièce"+(b.pieces>1?"s":"")+" : ajoutez écrans, passerelles IP…");
}
function plur(n, un, des){ return n+" "+(n>1 ? des : un); }
/* ce que les pièces demandent, en mots */
function resumeBesoins(b){
  var l=[];
  if(b.volets+b.bso) l.push(plur(b.volets+b.bso, "volet", "volets")+(b.bso ? " (dont "+b.bso+" BSO)" : ""));
  var tor=b.eclTor+b.prises+b.vmc;
  if(tor){
    var det=[]; if(b.eclTor) det.push(plur(b.eclTor, "allumage", "allumages")); if(b.prises) det.push(plur(b.prises, "prise", "prises")); if(b.vmc) det.push("VMC");
    l.push(plur(tor, "sortie tout ou rien", "sorties tout ou rien")+(det.length>1 || b.vmc ? " ("+det.join(", ")+")" : ""));
  }
  if(b.variation) l.push(plur(b.variation, "variation", "variations"));
  if(b.rvb) l.push(plur(b.rvb, "circuit RVB", "circuits RVB"));
  if(b.garages+b.gaches) l.push(plur(b.garages+b.gaches, "porte ou gâche", "portes ou gâches"));
  if(b.zones) l.push(b.airzone ? plur(b.zones, "zone Airzone", "zones Airzone")+" ("+plur(b.systemes, "système", "systèmes")+")" : plur(b.zones, "zone de chauffage", "zones de chauffage"));
  if(b.commandes) l.push(plur(b.commandes, "commande", "commandes"));
  if(b.sondes) l.push(plur(b.sondes, "commande à sonde", "commandes à sonde"));
  if(b.detecteurs) l.push(plur(b.detecteurs, "détecteur", "détecteurs"));
  if(b.exterieur) l.push("sonde extérieure");
  return l;
}
var STYLE_PIECES = ".kp-tete{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.kp-tete h2{flex:1}"
  +".kp-besoins{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 12px}"
  +".kp-besoins span{font-size:12.5px;font-weight:600;padding:3px 10px;border-radius:999px;background:#EEF3FF;color:#1D4ED8}"
  +".kp-l{border:1px solid var(--rule);border-radius:10px;background:#fff;overflow:hidden}"
  +".kp-cat{background:#F4F6FA;font-weight:700;font-size:11.5px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-2);padding:6px 10px}"
  +".kp-it{display:grid;grid-template-columns:44px 1fr auto;gap:2px 10px;align-items:baseline;padding:8px 10px;border-top:1px solid #EEF1F4;font-size:13.5px}"
  +".kp-it .q{font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;text-align:right}"
  +".kp-it .r{font-family:var(--mono);font-size:12.5px;white-space:nowrap;color:var(--ink-2)}"
  +".kp-it.opt{color:var(--ink-3);font-style:italic}"
  +".kp-bus{font-size:13px;color:var(--ink-2);margin:10px 0 0}"
  +".kp-reprise{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid #C9D8FF;background:#F4F7FF;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13.5px}"
  +".kp-reprise .tx{flex:1 1 220px}"
  +"@media (max-width:640px){.kp-it{grid-template-columns:34px 1fr}.kp-it .r{grid-column:2}}";
function peindreMaterielPieces(){
  var host=$("kc_pieces"); if(!host || !window.KNX || !window.KNX.besoins) return;
  var x=saisieDesPieces(), b=x.b, R=calculer(x.s);
  host.textContent="";
  var tete=el("div","kp-tete"); tete.appendChild(el("h2","","Matériel"));
  var mq=el("div","kc-marques"); mq.setAttribute("role","group"); mq.setAttribute("aria-label","Marque");
  ["mdt","zennio","theben"].forEach(function(k){
    var bt=el("button","",MARQUES[k].nom); bt.type="button"; bt.dataset.m=k; bt.setAttribute("aria-pressed", SAISIE.marque===k ? "true" : "false");
    bt.addEventListener("click", function(){ SAISIE.marque=k; garderLocal(); peindreMaterielPieces(); peindre(); });
    mq.appendChild(bt);
  });
  tete.appendChild(mq); host.appendChild(tete);
  if(!b.pieces){ host.appendChild(el("p","hint","Les actionneurs, leurs références et l'alimentation du bus se calculent ici à mesure que vous remplissez les pièces.")); return; }
  host.appendChild(el("p","hint","Calculé à partir des pièces, à mesure. Les écrans, passerelles IP, DALI et commandes Plexo s'ajoutent dans le chiffrage."));
  var bs=el("div","kp-besoins"); resumeBesoins(b).forEach(function(t){ bs.appendChild(el("span","",t)); }); host.appendChild(bs);
  R.alertes.filter(function(a){ return !/^Rien à chiffrer/.test(a); }).forEach(function(a){ host.appendChild(el("p","kc-alerte",a)); });
  if(!R.lignes.length){ host.appendChild(el("p","hint","Rien à chiffrer pour l'instant : ajoutez des circuits aux pièces.")); return; }
  host.appendChild(el("p","kc-indicatif",INDICATIF));
  var l=el("div","kp-l"), cat="";
  R.lignes.forEach(function(li){
    if(li.cat!==cat){ cat=li.cat; l.appendChild(el("div","kp-cat",cat)); }
    var it=el("div","kp-it"+(li.option ? " opt" : ""));
    it.appendChild(el("span","q",li.qte+" ×"));
    var n=el("span","n",li.nom); if(!li.v) n.appendChild(el("span","kc-verif","à vérifier"));
    it.appendChild(n); it.appendChild(el("span","r",li.ref));
    l.appendChild(it);
  });
  host.appendChild(l);
  var B=R.bus;
  host.appendChild(el("p","kp-bus",plur(B.participants, "participant", "participants")+" KNX · "+B.mA+" mA · "+plur(B.lignes, "ligne", "lignes")+" · alimentation "+B.alim.mA+" mA par ligne"));
  var bx=el("div","boutons");
  var bo=el("button","act plein","Ouvrir dans le chiffrage"); bo.type="button";
  bo.title="Reprendre ces quantités dans le chiffrage complet (PDF, tableur, enregistrement)";
  bo.addEventListener("click", function(){
    if(SAISIE.depuisPieces===undefined && CHAMPS.some(function(c){ return nb(SAISIE[c[0]]); })
      && !window.confirm("Le chiffrage en cours a déjà des quantités.\n\nLes remplacer par celles des pièces ? (écrans, passerelles IP, DALI, Plexo et participants ajoutés à la main restent)")) return;
    reprendrePieces();
  });
  bx.appendChild(bo); host.appendChild(bx);
}
function installerPieces(){
  if(!window.KNX || !window.KNX.surChange || $("kc_pieces")) return;
  if(!$("kpStyle")){ var st=document.createElement("style"); st.id="kpStyle"; st.textContent=STYLE_PIECES; document.head.appendChild(st); }
  var sc=$("scenarios"), apres=sc && sc.closest(".block");
  if(!apres) return;
  var bloc=el("div","block"); bloc.id="kc_pieces";
  apres.parentNode.insertBefore(bloc, apres.nextSibling);
  window.KNX.surChange(peindreMaterielPieces);
  peindreMaterielPieces();
}
/* dans le chiffrage : reprendre les pièces des adresses de groupe */
function blocReprise(){
  if(!window.KNX || !window.KNX.besoins) return null;
  var b=window.KNX.besoins(); if(!b.pieces) return null;
  var r=el("div","kp-reprise"), tx=el("div","tx");
  tx.appendChild(el("b","",(b.nom ? "« "+b.nom+" »" : "Adresses de groupe")+" : "+plur(b.pieces, "pièce", "pièces")));
  var dt=SAISIE.depuisPieces ? new Date(SAISIE.depuisPieces) : null;
  tx.appendChild(el("small","",dt && !isNaN(dt) ? " · quantités reprises le "+dt.toLocaleDateString("fr-FR")+" à "+dt.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"}) : " · les quantités peuvent venir des pièces"));
  var bt=el("button","act petit",SAISIE.depuisPieces ? "Reprendre à nouveau" : "Reprendre les pièces"); bt.type="button";
  bt.addEventListener("click", function(){
    if(!window.confirm("Remplacer les quantités par celles des pièces ?\n\nÉcrans, passerelles IP, DALI, Plexo et participants ajoutés à la main restent.")) return;
    reprendrePieces();
  });
  r.appendChild(tx); r.appendChild(bt);
  return r;
}

/* les essais et l'export s'appuient sur le calcul */
window.KnxChiffrage = {calculer:calculer, marques:MARQUES, saisie:function(){ return SAISIE; }};
function demarrer(){ construire(); installerPieces(); }
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
