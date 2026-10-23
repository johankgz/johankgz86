/* =====================================================================
   transfert.js — importer et exporter les plans et les documents
   ---------------------------------------------------------------------
   Pensé pour l'ordinateur (le site installé comme un logiciel, depuis
   Edge ou Chrome), utilisable partout :
   - Importer : glisser des fichiers, ou un dossier entier, depuis
     l'Explorateur (ou le Finder) n'importe où sur la page, les choisir,
     ou les coller (Ctrl V). Ils rejoignent le dossier d'un chantier,
     chacun rangé selon sa nature : Plans, Documents techniques (fiche
     technique, schéma, notice, autre) ou Photos du chantier. PDF,
     images, plans DWG et DXF, Word, Excel, PowerPoint, texte : 25 Mo
     par fichier. Un lot ne fait qu'une notification à l'équipe.
   - Exporter : les documents d'un chantier partent dans un dossier de
     l'ordinateur, rangés comme sur le site (Plans, Documents
     techniques, Suivi de chantier, Photos du chantier…). Edge et Chrome
     écrivent directement dans le dossier choisi ; ailleurs, un ZIP.
   - Installer : ce que ce navigateur sait faire pour devenir un
     logiciel (sa fenêtre, son icône, « Ouvrir avec » dans l'Explorateur).
   Les pages s'en servent ainsi :
     Transfert.ouvrir({onglet, fichiers, ref, chantiers, apres, hote})
     Transfert.depot({ref, chantiers, apres, actif})  dépôt et collage sur la page
   ===================================================================== */
(function(){
"use strict";
if(window.Transfert) return;

var API="/api/rapports";
var MAX=25*1024*1024, MAX_FICHIERS=300;
var FORMATS={pdf:"PDF", jpg:"Image", jpeg:"Image", png:"Image", webp:"Image", dwg:"Plan DWG", dxf:"Plan DXF",
  doc:"Word", docx:"Word", odt:"Texte", xls:"Excel", xlsx:"Excel", ods:"Tableur", ppt:"PowerPoint", pptx:"PowerPoint",
  txt:"Texte", csv:"Tableur"};
var ACCEPT=Object.keys(FORMATS).map(function(e){ return "."+e; }).join(",");
var NATURES=["Plan", "Fiche technique", "Schéma", "Notice", "Photo", "Autre"];
/* ce que l'Explorateur et le Finder rangent dans les dossiers : jamais importé */
var CACHES=/^(\.|~\$|thumbs\.db$|desktop\.ini$|icon\r?$)/i;
/* les documents d'un dossier qu'on sait exporter (pas les brouillons) */
var EXPORTABLES=/\.(pdf|zip|jpe?g|png|webp|dwg|dxf|docx?|odt|xlsx?|ods|pptx?|txt|csv)$/i;
/* les sous-dossiers d'un chantier, comme sur le site ; « dossier » : à la racine */
var GROUPES=[
  ["plans", "Plans", "Plans"],
  ["techniques", "Documents techniques", "Documents techniques"],
  ["dossier", "Relevé, schémas, réception, DOE…", ""],
  ["suivi", "Suivi de chantier", "Suivi de chantier"],
  ["commandes", "Commandes", "Commandes"],
  ["points", "Le point de chantier", "Le point de chantier"],
  ["notes", "Notes", "Notes"],
  ["photos", "Photos du chantier", "Photos du chantier"]
];

/* ---------- petits outils ---------- */
function session(){ try{ return JSON.parse(localStorage.getItem("outils:session")||"null"); }catch(e){ return null; } }
function jeton(){ var s=session(); return s && s.jeton ? s.jeton : ""; }
function plat(t){ return String(t||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
function extDe(nom){ var m=/\.([a-z0-9]{1,5})$/i.exec(String(nom||"")); return m ? m[1].toLowerCase() : ""; }
function poids(o){
  o=o||0;
  if(o<1024) return "moins d'1 Ko";
  if(o<1048576) return Math.round(o/1024)+" Ko";
  return (o/1048576).toFixed(o<10485760 ? 1 : 0).replace(".", ",")+" Mo";
}
function deux(n){ return (n<10 ? "0" : "")+n; }
function jour(){ var d=new Date(); return d.getFullYear()+"-"+deux(d.getMonth()+1)+"-"+deux(d.getDate()); }
/* un nom de fichier ou de dossier que Windows, macOS et le ZIP acceptent */
function nomPropre(t, n){
  return String(t||"").normalize("NFC").replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[. ]+$/, "").slice(0, n||90).trim() || "document";
}
function el(tag, cls, txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
function svg(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'; }
var ICO={
  importer:'<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14.5v4A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  exporter:'<path d="M12 4v11.5M7.5 11 12 15.5 16.5 11"/><path d="M4 14.5v4A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  loupe:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  ecran:'<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8.5 20h7M12 16.5V20"/><path d="M12 7.5v5.5M9.6 10.8 12 13.2l2.4-2.4"/>',
  ok:'<path d="M5 12.5l4.2 4.2L19 7"/>'
};
function auDoigt(){ try{ return !window.matchMedia("(hover:hover) and (pointer:fine)").matches; }catch(e){ return false; } }

/* ---------- les chantiers ---------- */
function villeDe(adr){
  var a=String(adr||"").replace(/\n/g, ", ").trim();
  var m=/\b\d{5}\s+([^,]+?)\s*$/.exec(a);
  return m ? m[1] : a.split(",").pop().trim();
}
function nomChantier(c){ return c ? (c.client || c.ref) : ""; }
function correspond(c, q){
  var mots=plat(q).split(/\s+/).filter(Boolean);
  if(!mots.length) return true;
  var t=plat([c.client, c.ref, c.adresse].join(" "));
  return mots.every(function(m){ return t.indexOf(m)>=0; });
}
var LISTE=null, LISTE_P=null;
function chargerListe(){
  if(LISTE_P) return LISTE_P;
  LISTE_P=fetch(API+"?action=liste", {headers:{"x-auth":jeton()}})
    .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error(r.status===401 ? "session" : "liste")); })
    .then(function(d){ LISTE=(d && d.chantiers) || []; LISTE_P=null; return LISTE; },
          function(e){ LISTE_P=null; throw e; });
  return LISTE_P;
}
/* la liste de la page si elle l'a déjà, sinon celle du site */
function lesChantiers(){
  if(LISTE) return Promise.resolve(LISTE);
  var l=typeof OPT.chantiers==="function" ? OPT.chantiers() : OPT.chantiers;
  if(Array.isArray(l) && l.length){ LISTE=l; return Promise.resolve(l); }
  return chargerListe();
}
function trouver(ref){ return (LISTE||[]).filter(function(c){ return c.ref===ref; })[0] || null; }
function accesImport(){
  var s=session();
  if(!s) return false;
  if(s.role==="admin" || s.proprietaire) return true;
  var a=s.applis;
  if(!Array.isArray(a) || !a.length) return true;
  return a.indexOf("technique")>=0;
}

/* ---------- ce qu'on importe ---------- */
function titreDe(nom){
  return String(nom||"").replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Document";
}
/* la nature, d'après le nom du fichier et du dossier d'où il vient */
function natureDe(nom, ext, chemin){
  var t=plat(nom+" "+(chemin||""));
  if(ext==="dwg" || ext==="dxf") return "Plan";
  if(/schema|unifilaire|synoptique/.test(t)) return "Schéma";
  if(/notice|manuel|mode d.emploi|guide d|instruction/.test(t)) return "Notice";
  if(/fiche|(^|[^a-z])ft([^a-z]|$)|datasheet|data sheet|caracteristiques/.test(t)) return "Fiche technique";
  if(/plan de prevention|plan particulier|ppsps/.test(t)) return "Autre";
  if(/(^|[^a-z])plans?([^a-z]|$)|implantation|(^|[^a-z])niveau|(^|[^a-z])rdc([^a-z]|$)|(^|[^a-z])r ?\+ ?\d|etage|facade|cadastr|calepinage|sous-sol|toiture/.test(t)) return "Plan";
  if(/^(jpe?g|png|webp)$/.test(ext)) return "Photo";
  return "Autre";
}
var SEQ=0;
var IMP={items:[], ref:"", envoi:false, xhr:null, bilan:null};
var EXP={ref:"", coches:{}, encours:false};
var OPT={}, ONGLET="importer";

function ajouter(liste){
  if(!liste || !liste.length) return;
  /* un nouveau lot après un import : ceux importés (et ceux refusés alors) laissent la place */
  if(!IMP.envoi){
    var apresImport=!!IMP.bilan;
    IMP.items=IMP.items.filter(function(i){ return i.etat!=="fait" && !(apresImport && i.etat==="refuse"); });
    IMP.bilan=null;
  }
  var trop=0;
  Array.prototype.forEach.call(liste, function(x){
    var f=x && x.file ? x.file : x, chemin=(x && x.chemin) || f.webkitRelativePath || "";
    var nom=f.name || "document", ext=extDe(nom);
    if(CACHES.test(nom)) return;
    if(IMP.items.length>=MAX_FICHIERS){ trop++; return; }
    if(IMP.items.some(function(i){ return i.etat!=="fait" && i.nom===nom && i.taille===f.size && i.chemin===chemin; })) return;
    var it={id:++SEQ, file:f, nom:nom, chemin:chemin, ext:ext, taille:f.size||0, titre:titreDe(nom),
      nature:natureDe(nom, ext, chemin.replace(/[^\/]*$/, "")), etat:"pret", pct:0, raison:""};
    if(!FORMATS[ext]){ it.etat="refuse"; it.raison="Format non pris en charge"+(ext ? " (."+ext+")" : ""); }
    else if(!f.size){ it.etat="refuse"; it.raison="Fichier vide"; }
    else if(f.size>MAX){ it.etat="refuse"; it.raison="Trop lourd ("+poids(f.size)+") : 25 Mo au plus"; }
    IMP.items.push(it);
  });
  if(trop) etatImp(trop+" fichier"+(trop>1?"s":"")+" de plus non repris : "+MAX_FICHIERS+" au plus par import.", "alerte");
  peindreFichiers();
}
/* une capture collée (Ctrl V) s'appelle « image.png » : on lui donne la date */
function nommerCapture(f){
  if(!/^image\.(png|jpe?g|webp)$/i.test(f.name||"")) return f;
  var d=new Date(), nom="Capture du "+deux(d.getDate())+"-"+deux(d.getMonth()+1)+"-"+d.getFullYear()+" "+deux(d.getHours())+"h"+deux(d.getMinutes())+"."+extDe(f.name);
  try{ return new File([f], nom, {type:f.type}); }catch(e){ return f; }
}

/* ---------- lire un dépôt : des fichiers, ou des dossiers entiers ---------- */
function lireDepot(dt){
  /* à lire tout de suite, pendant l'événement : ensuite le navigateur les retire */
  var items=dt && dt.items ? Array.prototype.slice.call(dt.items) : [];
  var entrees=items.map(function(it){ return it.kind==="file" && it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
  var simples=Array.prototype.map.call((dt && dt.files) || [], function(f){ return {file:f, chemin:""}; });
  if(!entrees.some(function(e){ return e.isDirectory; })) return Promise.resolve(simples);
  var out=[];
  function marcher(e, base){
    if(out.length>MAX_FICHIERS) return Promise.resolve();
    if(e.isFile){
      if(CACHES.test(e.name)) return Promise.resolve();
      return new Promise(function(ok){ e.file(function(f){ out.push({file:f, chemin:base+f.name}); ok(); }, function(){ ok(); }); });
    }
    if(!e.isDirectory || CACHES.test(e.name)) return Promise.resolve();
    var lecteur=e.createReader(), toutes=[];
    return new Promise(function(ok){
      (function lire(){
        lecteur.readEntries(function(l){ if(!l.length){ ok(); return; } toutes=toutes.concat(Array.prototype.slice.call(l)); lire(); }, function(){ ok(); });
      })();
    }).then(function(){
      toutes.sort(function(a, b){ return a.name.localeCompare(b.name, "fr", {numeric:true}); });
      return toutes.reduce(function(p, x){ return p.then(function(){ return marcher(x, base+e.name+"/"); }); }, Promise.resolve());
    });
  }
  return entrees.reduce(function(p, e){ return p.then(function(){ return marcher(e, ""); }); }, Promise.resolve())
    .then(function(){ return out; });
}

/* ---------- l'envoi ---------- */
function lireB64(file){
  return new Promise(function(ok, ko){
    var fr=new FileReader();
    fr.onload=function(){ var s=String(fr.result||""); ok(s.slice(s.indexOf(",")+1)); };
    fr.onerror=function(){ ko(new Error("Fichier illisible sur cet ordinateur")); };
    fr.readAsDataURL(file);
  });
}
/* avec sa progression (un plan de 20 Mo prend son temps) */
function poster(corps, progres){
  return new Promise(function(ok, ko){
    var x=new XMLHttpRequest();
    IMP.xhr=x;
    x.open("POST", API+"?action=publier");
    x.setRequestHeader("content-type", "application/json");
    x.setRequestHeader("x-auth", jeton());
    if(x.upload) x.upload.onprogress=function(e){ if(e.lengthComputable) progres(e.loaded/e.total); };
    x.onload=function(){
      IMP.xhr=null;
      var d=null; try{ d=JSON.parse(x.responseText); }catch(e){}
      if(x.status>=200 && x.status<300 && d && d.ok) return ok(d);
      var er=new Error((d && d.erreur) || ("Refusé par le site ("+x.status+")")); er.statut=x.status; ko(er);
    };
    x.onerror=function(){ IMP.xhr=null; var er=new Error("Pas de réseau"); er.reseau=true; ko(er); };
    x.onabort=function(){ IMP.xhr=null; var er=new Error("Envoi arrêté"); er.arret=true; ko(er); };
    x.send(corps);
  });
}
function importer(){
  if(IMP.envoi) return;
  var c=trouver(IMP.ref);
  if(!c){ etatImp("Choisissez d'abord le chantier.", "alerte"); var q=R.imp.ch.q; if(q && !q.closest("[hidden]")) q.focus(); return; }
  var lot=IMP.items.filter(function(i){ return i.etat==="pret" || i.etat==="echec"; });
  if(!lot.length) return;
  IMP.envoi=true; IMP.bilan=null;
  var n=lot.length, k=0, faits=0, echecs=0, nom=(session()||{}).nom||"";
  if(document.activeElement===R.imp.go) try{ R.boite.focus({preventScroll:true}); }catch(e){}
  peindreFichiers();
  function suivant(){
    if(k>=n || !IMP.envoi){ fin(); return; }
    var it=lot[k++];
    it.etat="envoi"; it.pct=0; it.raison=""; peindreLigne(it);
    etatImp("Envoi de « "+(it.titre||it.nom)+" » ("+k+" sur "+n+")…");
    lireB64(it.file).then(function(b64){
      if(!IMP.envoi){ var er=new Error("Envoi arrêté"); er.arret=true; throw er; }
      var meta={ext:it.ext, chantier:c.ref, type:"technique", date:jour(),
        titre:String(it.titre||"").trim() || titreDe(it.nom), visite:it.nature, etape:it.nature,
        auteur:nom, destinataires:[], dossier:true};
      /* une seule notification pour le lot : avec le dernier document */
      if(n>1){ if(k<n) meta.silencieux=true; else meta.lot=faits+1; }
      var tete=JSON.stringify(meta);
      var corps=new Blob([tete.slice(0, -1)+',"pdf":"', b64, '"}'], {type:"application/json"});
      return poster(corps, function(p){ it.pct=p; majBarre(it); });
    }).then(function(d){
      it.etat="fait"; it.cle=d.cle||""; faits++; peindreLigne(it); suivant();
    }, function(e){
      it.etat="echec"; it.raison=e.message||"Échec"; peindreLigne(it);
      if(e.arret){ it.etat="pret"; it.raison=""; peindreLigne(it); fin(); return; }
      echecs++;
      if(e.statut===401){
        IMP.envoi=false; IMP.bilan={faits:faits, echecs:echecs, ref:c.ref, session:true};
        fin(); return;
      }
      suivant();
    });
  }
  function fin(){
    var session401=IMP.bilan && IMP.bilan.session;
    IMP.envoi=false; IMP.xhr=null;
    IMP.bilan={faits:faits, echecs:echecs, ref:c.ref, nom:nomChantier(c), session:session401};
    majImport();
    peindreFichiers();
    if(faits){
      /* les documents arrivés comptent tout de suite, dans l'export aussi */
      LISTE=null;
      chargerListe().then(function(){ if(FEN && !FEN.hidden) peindre(); }, function(){});
      /* les fichiers arrivés, pour qui veut savoir lesquels (les fichiers partagés depuis le téléphone) */
      try{ if(OPT.apres) OPT.apres(c.ref, lot.filter(function(i){ return i.etat==="fait"; }).map(function(i){ return i.file; })); }catch(e){}
    }
  }
  suivant();
}

/* ---------- l'export ---------- */
function groupeDe(f){
  var v=String(f.visite||"").trim();
  if(f.type==="suivi") return "suivi";
  if(f.type==="commande") return "commandes";
  if(f.type==="point") return "points";
  if(f.type==="note") return "notes";
  if(f.type==="technique") return /^plans?(\s|$)/i.test(v) ? "plans" : /^photos?(\s|$)/i.test(v) ? "photos" : "techniques";
  if(f.type==="photos" || f.type==="reportage") return "photos";
  return "dossier";
}
function docsDe(c){ return ((c && c.fichiers) || []).filter(function(f){ return !f.brouillon && EXPORTABLES.test(f.cle||""); }); }
function nomExport(f){
  var ext=extDe(f.cle), date=String(f.date||"").slice(0, 10);
  var base = f.type==="technique" ? (f.titre||"Document") : ((date ? date+" " : "")+(f.titre||"Document"));
  return nomPropre(base, 110)+"."+ext;
}
/* nos ZIP de photos sont écrits sans compression : on lit leurs photos telles quelles */
function lireZip(octets){
  var v=new DataView(octets.buffer, octets.byteOffset, octets.byteLength), dec=new TextDecoder("utf-8"), out=[], i=0;
  while(i+30<=octets.length){
    if(v.getUint32(i, true)!==0x04034b50) break;
    var methode=v.getUint16(i+8, true), taille=v.getUint32(i+18, true), lgNom=v.getUint16(i+26, true), lgExtra=v.getUint16(i+28, true);
    var nom=dec.decode(octets.subarray(i+30, i+30+lgNom)), debut=i+30+lgNom+lgExtra;
    if(methode!==0) return [];
    if(taille>0 && /\.(jpe?g|png|webp)$/i.test(nom)) out.push({nom:nom.split("/").pop(), octets:octets.subarray(debut, debut+taille)});
    i=debut+taille;
  }
  return out;
}
var CRC=null;
function crc32(b){
  if(!CRC){ CRC=new Uint32Array(256); for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=(c&1) ? (0xEDB88320^(c>>>1)) : (c>>>1); CRC[n]=c>>>0; } }
  var x=0xFFFFFFFF; for(var i=0;i<b.length;i++) x=CRC[(x^b[i])&0xFF]^(x>>>8);
  return (x^0xFFFFFFFF)>>>0;
}
function creerZip(fichiers){
  var enc=new TextEncoder(), parts=[], central=[], offset=0;
  function u32(n){ return new Uint8Array([n&255, (n>>>8)&255, (n>>>16)&255, (n>>>24)&255]); }
  function u16(n){ return new Uint8Array([n&255, (n>>>8)&255]); }
  fichiers.forEach(function(f){
    var nom=enc.encode(f.nom), d=f.octets, crc=crc32(d);
    [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(d.length), u32(d.length), u16(nom.length), u16(0), nom, d]
      .forEach(function(p){ parts.push(p); });
    central.push({nom:nom, crc:crc, taille:d.length, offset:offset});
    offset+=30+nom.length+d.length;
  });
  var debut=offset, taille=0;
  central.forEach(function(c){
    [u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(c.crc), u32(c.taille), u32(c.taille), u16(c.nom.length),
     u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset), c.nom].forEach(function(p){ parts.push(p); });
    taille+=46+c.nom.length;
  });
  [u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(taille), u32(debut), u16(0)].forEach(function(p){ parts.push(p); });
  return new Blob(parts, {type:"application/zip"});
}
function telechargerBlob(blob, nom){
  var url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 8000);
}
/* chaque document, l'un après l'autre : on le lit sur le site, on l'écrit */
function parcourir(docs, ecrire, avance){
  var pris={}, faits=0, echecs=0, fichiers=0, k=0;
  function unique(chemin){
    var c=chemin, i=2;
    while(pris[c.toLowerCase()]) c=chemin.replace(/(\.[^.\/]+)?$/, " ("+(i++)+")$1");
    pris[c.toLowerCase()]=true; return c;
  }
  function dossierDe(f){ var g=groupeDe(f); for(var i=0;i<GROUPES.length;i++) if(GROUPES[i][0]===g) return GROUPES[i][2]; return ""; }
  return docs.reduce(function(p, f){
    return p.then(function(){
      k++; avance(k, docs.length, f);
      return fetch(API+"?action=fichier&cle="+encodeURIComponent(f.cle), {headers:{"x-auth":jeton()}})
        .then(function(r){ if(!r.ok) throw new Error("document"); return r.blob(); })
        .then(function(blob){
          var sous=dossierDe(f), prefixe=sous ? sous+"/" : "";
          if(/\.zip$/i.test(f.cle)){
            return blob.arrayBuffer().then(function(buf){
              var photos=lireZip(new Uint8Array(buf));
              var date=String(f.date||"").slice(0, 10), lot=nomPropre((date ? date+" " : "")+(f.titre||"Photos"), 90);
              if(!photos.length){ fichiers++; return ecrire(unique(prefixe+lot+".zip"), blob); }
              return photos.reduce(function(q, ph){
                return q.then(function(){ fichiers++; return ecrire(unique(prefixe+lot+"/"+nomPropre(ph.nom, 110)), new Blob([ph.octets], {type:/\.png$/i.test(ph.nom) ? "image/png" : "image/jpeg"})); });
              }, Promise.resolve());
            });
          }
          fichiers++;
          return ecrire(unique(prefixe+nomExport(f)), blob);
        })
        .then(function(){ faits++; }, function(e){ if(e && e.name==="NotAllowedError") throw e; echecs++; });
    });
  }, Promise.resolve()).then(function(){ return {faits:faits, echecs:echecs, fichiers:fichiers}; });
}
function ecrireDans(racine, chemin, blob, memo){
  var parts=chemin.split("/"), nom=parts.pop(), p=Promise.resolve(racine), acc="";
  parts.forEach(function(d){
    p=p.then(function(h){
      acc+=d+"/";
      if(memo[acc]) return memo[acc];
      return (memo[acc]=h.getDirectoryHandle(d, {create:true}));
    });
  });
  return p.then(function(h){ return h.getFileHandle(nom, {create:true}); })
    .then(function(fh){ return fh.createWritable(); })
    .then(function(w){ return w.write(blob).then(function(){ return w.close(); }); });
}
function exporter(mode){
  if(EXP.encours) return;
  /* les boutons se désactivent pendant l'export : le focus reste dans la fenêtre */
  if(document.activeElement===R.exp.dossier || document.activeElement===R.exp.zip) try{ R.boite.focus({preventScroll:true}); }catch(e){}
  var c=trouver(EXP.ref);
  if(!c){ etatExp("Choisissez d'abord le chantier.", "alerte"); return; }
  var docs=docsDe(c).filter(function(f){ return EXP.coches[groupeDe(f)]!==false; });
  if(!docs.length){ etatExp("Aucun document coché.", "alerte"); return; }
  var racineNom=nomPropre([c.ref, c.client].filter(Boolean).join(" "), 80);
  function avance(k, n, f){ etatExp("Export "+k+" sur "+n+" : « "+(f.titre||nomExport(f))+" »…"); }
  function bilan(b, ou){
    var t=b.faits+" document"+(b.faits>1?"s":"")+" exporté"+(b.faits>1?"s":"")+" "+ou;
    if(b.fichiers>b.faits) t+=" ("+b.fichiers+" fichiers, photos comprises)";
    t+=".";
    if(b.echecs) t+=" "+b.echecs+" n'ont pas pu être lus sur le site : réessayez.";
    etatExp(t, b.echecs ? "alerte" : "ok");
  }
  function finir(){ EXP.encours=false; majExport(); }
  EXP.encours=true; majExport();
  if(mode==="dossier" && window.showDirectoryPicker){
    var choisi=null;
    var demande;
    try{ demande=window.showDirectoryPicker({id:"travaux360-export", mode:"readwrite", startIn:"documents"}); }
    catch(e){ demande=Promise.reject(e); }
    demande.then(function(dir){
      choisi=dir; etatExp("Préparation du dossier « "+racineNom+" »…");
      return dir.getDirectoryHandle(racineNom, {create:true});
    }).then(function(racine){
      var memo={};
      return parcourir(docs, function(chemin, blob){ return ecrireDans(racine, chemin, blob, memo); }, avance);
    }).then(function(b){
      bilan(b, "dans « "+choisi.name+" › "+racineNom+" »");
      finir();
    }).catch(function(e){
      finir();
      if(e && e.name==="AbortError"){ etatExp(""); return; }
      if(e && (e.name==="NotAllowedError" || e.name==="SecurityError")){ etatExp("L'écriture dans ce dossier n'a pas été permise. Choisissez un autre dossier (Documents, Bureau…), ou téléchargez le ZIP.", "alerte"); return; }
      etatExp("L'export n'a pas pu se faire ("+((e && e.message) || "erreur")+"). Essayez le ZIP.", "alerte");
    });
    return;
  }
  var tous=[];
  parcourir(docs, function(chemin, blob){
    return blob.arrayBuffer().then(function(b){ tous.push({nom:racineNom+"/"+chemin, octets:new Uint8Array(b)}); });
  }, avance).then(function(b){
    if(!tous.length){ etatExp("Rien n'a pu être lu sur le site : vérifiez la connexion.", "alerte"); finir(); return; }
    etatExp("Création du ZIP…");
    telechargerBlob(creerZip(tous), racineNom+".zip");
    bilan(b, "dans le ZIP « "+racineNom+".zip » (dossier Téléchargements)");
    finir();
  }).catch(function(){ etatExp("L'export n'a pas pu se faire : vérifiez la connexion.", "alerte"); finir(); });
}

/* ---------- l'installation comme logiciel ---------- */
var INVITE=null;
window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); INVITE=e; majInstall(); });
window.addEventListener("appinstalled", function(){ INVITE=null; majInstall(); });
function installe(){
  try{
    return ["standalone", "window-controls-overlay", "minimal-ui", "fullscreen"].some(function(m){ return window.matchMedia("(display-mode: "+m+")").matches; })
      || navigator.standalone===true;
  }catch(e){ return false; }
}
function navigateur(){
  var u=navigator.userAgent||"";
  if(/Edg\//.test(u)) return "edge";
  if(/OPR\/|Opera/.test(u)) return "opera";
  if(/Firefox\//.test(u)) return "firefox";
  if(/Chrome\//.test(u)) return "chrome";
  if(/Safari\//.test(u) && /Macintosh/.test(u)) return "safari";
  return "autre";
}
function surOrdinateur(){ return !auDoigt() && !(navigator.maxTouchPoints>1 && /Macintosh/.test(navigator.userAgent||"")); }
function plusTard(){ try{ return localStorage.getItem("transfert:installation")==="plus-tard"; }catch(e){ return false; } }
function installer(){
  if(INVITE){
    var inv=INVITE;
    inv.prompt();
    return Promise.resolve(inv.userChoice).then(function(c){
      if(c && c.outcome==="accepted"){ INVITE=null; montrerConsignes("fait"); }
      majInstall();
      return c && c.outcome;
    });
  }
  montrerConsignes(navigateur());
  return Promise.resolve("consignes");
}
var CONSIGNES={
  edge:["Ouvrez le menu « … » en haut à droite d'Edge.", "Choisissez « Applications », puis « Installer ce site en tant qu'application ».", "Suivi travaux 360 s'ouvre dans sa fenêtre ; épinglez-le à la barre des tâches."],
  chrome:["Au bout de la barre d'adresse, cliquez sur l'icône d'installation (un petit écran avec une flèche).", "Ou, dans le menu « ⋮ », « Caster, enregistrer et partager », puis « Installer la page en tant qu'application ».", "Suivi travaux 360 s'ouvre dans sa fenêtre ; épinglez-le à la barre des tâches."],
  opera:["Au bout de la barre d'adresse, cliquez sur l'icône d'installation.", "Suivi travaux 360 s'ouvre dans sa fenêtre."],
  safari:["Dans le menu « Fichier » de Safari, choisissez « Ajouter au Dock ».", "Suivi travaux 360 s'ouvre depuis le Dock, dans sa fenêtre. (« Ouvrir avec » depuis le Finder demande Chrome ou Edge.)"],
  firefox:["Firefox ne sait pas installer un site comme logiciel.", "Ouvrez Suivi travaux 360 dans Microsoft Edge (déjà sur Windows) ou Google Chrome, puis installez-le."],
  autre:["Ouvrez Suivi travaux 360 dans Microsoft Edge ou Google Chrome, puis installez-le depuis la barre d'adresse."],
  fait:["C'est installé : Suivi travaux 360 est dans le menu Démarrer (ou le Launchpad).", "Clic droit sur un PDF, un DWG, un Word ou un Excel › « Ouvrir avec » › Suivi travaux 360 : il arrive dans l'import."]
};
function montrerConsignes(genre){
  if(!R.ins) return;
  var ol=R.ins.consignes; ol.textContent="";
  (CONSIGNES[genre]||CONSIGNES.autre).forEach(function(t){ ol.appendChild(el("li", "", t)); });
  ol.hidden=false;
  majInstall();
}
function majInstall(){
  if(!R.ins) return;
  var consignes=!R.ins.consignes.hidden;
  /* sur l'ordinateur, tant que ce n'est pas installé (ou les consignes demandées) */
  R.ins.boite.hidden=!(consignes || (surOrdinateur() && !installe() && !plusTard()));
  R.ins.bouton.hidden=consignes && !INVITE;
  R.ins.bouton.textContent=INVITE ? "Installer" : "Comment faire";
}

/* ---------- l'affichage ---------- */
var STYLE=
".tr-fen{position:fixed;top:0;left:0;right:0;bottom:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}"
+".tr-fen[hidden],.tr-fen [hidden]{display:none!important}"
+".tr-fond{position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(21,23,26,.55)}"
+".tr-boite:focus{outline:none}"
+".tr-boite{position:relative;box-sizing:border-box;width:min(740px,100%);max-height:min(90vh,900px);display:flex;flex-direction:column;background:#FFFFFF;color:#1E2329;border-radius:16px;box-shadow:0 24px 60px rgba(15,17,20,.28);overflow:hidden;font-size:15px;line-height:1.4;text-align:left;animation:trEntree .18s ease both}"
+"@keyframes trEntree{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}"
+".tr-tete{display:flex;align-items:center;gap:10px;padding:14px 14px 10px 20px;flex:0 0 auto}"
+".tr-tete b{font-size:18px;font-weight:800;letter-spacing:-.02em;flex:1;min-width:0}"
+".tr-x{width:44px;height:44px;flex:0 0 auto;border:0;border-radius:50%;background:#F1F3F6;color:#1E2329;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;margin:0}"
+".tr-x svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}"
+".tr-onglets{display:flex;gap:4px;margin:0 20px;padding:4px;background:#F1F3F6;border-radius:12px;flex:0 0 auto}"
+".tr-onglets button{flex:1;min-height:42px;border:0;border-radius:9px;background:transparent;color:#5B6470;font:inherit;font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;margin:0;box-shadow:none}"
+".tr-onglets button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
+".tr-onglets button[aria-selected=\"true\"]{background:#FFFFFF;color:#1E2329;box-shadow:0 1px 3px rgba(15,17,20,.14)}"
+".tr-corps{flex:1 1 auto;overflow-y:auto;overscroll-behavior:contain;padding:4px 20px 0;-webkit-overflow-scrolling:touch}"
+".tr-install{display:flex;align-items:flex-start;gap:12px;margin:12px 20px 0;padding:12px 12px 12px 14px;border:1px solid #D6E2F5;border-radius:12px;background:#EEF4FF;flex:0 0 auto}"
+".tr-install>svg{width:30px;height:30px;flex:0 0 auto;fill:none;stroke:#2563EB;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;margin-top:2px}"
+".tr-install .tr-ins-t{flex:1;min-width:0}"
+".tr-install b{display:block;font-size:14.5px}"
+".tr-install .tr-ins-t>span{display:block;font-size:13px;color:#5B6470;margin-top:1px}"
+".tr-install ol{margin:8px 0 2px;padding-left:20px;font-size:13.5px;color:#1E2329}"
+".tr-install ol li{margin:2px 0}"
+".tr-install .tr-btn{min-height:40px;padding:0 14px;font-size:14px;align-self:center}"
+".tr-install .tr-x{width:40px;height:40px;background:transparent;align-self:center}"
+".tr-zone{display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;margin-top:14px;padding:22px 16px 18px;border:2px dashed #CBD2DA;border-radius:14px;background:#F7F8FA;transition:border-color .15s,background-color .15s}"
+".tr-zone.survol{border-color:#2563EB;background:#EAF1FF}"
+".tr-zone>svg{width:36px;height:36px;fill:none;stroke:#2563EB;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}"
+".tr-zone p{margin:0;display:flex;flex-direction:column;gap:2px}"
+".tr-zone p b{font-size:16.5px}"
+".tr-zone p span{color:#5B6470;font-size:14px}"
+".tr-zone small{color:#8A929B;font-size:12.5px}"
+".tr-zone-btns{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:4px}"
+".tr-btn{min-height:44px;padding:0 18px;border:0;border-radius:11px;background:#2563EB;color:#fff;font:inherit;font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;margin:0;box-shadow:none;text-decoration:none;white-space:nowrap}"
+".tr-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"
+".tr-btn:disabled{opacity:.45;cursor:default}"
+".tr-btn.tr-sec{background:#FFFFFF;color:#1E2329;border:1px solid #CBD2DA}"
+".tr-lib{display:block;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#8A929B;margin:20px 0 8px}"
+".tr-choisi{display:flex;align-items:center;gap:12px;padding:8px 8px 8px 14px;border:1px solid #E1E5EA;border-radius:12px;background:#FFFFFF}"
+".tr-choisi .tr-ch-t{flex:1;min-width:0}"
+".tr-choisi b,.tr-ligne b{display:block;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".tr-choisi small,.tr-ligne small{display:block;color:#5B6470;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".tr-lien{border:0;background:none;color:#2563EB;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;padding:0 10px;min-height:44px;margin:0;text-decoration:none;display:inline-flex;align-items:center;box-shadow:none}"
+".tr-cherche{display:flex;align-items:center;gap:8px;min-height:46px;padding:0 12px;border:1px solid #E1E5EA;border-radius:12px;background:#FFFFFF;box-sizing:border-box}"
+".tr-cherche svg{width:18px;height:18px;flex:0 0 auto;fill:none;stroke:#8A929B;stroke-width:2;stroke-linecap:round}"
+".tr-cherche input{flex:1;min-width:0;width:auto;border:0!important;background:none!important;box-shadow:none!important;outline:none;font:inherit;font-size:16px;color:#1E2329;padding:0!important;margin:0;min-height:44px;height:auto;border-radius:0}"
+".tr-liste{margin-top:6px;max-height:236px;overflow-y:auto;overscroll-behavior:contain;border:1px solid #E1E5EA;border-radius:12px;background:#FFFFFF}"
+".tr-ligne{display:block;width:100%;box-sizing:border-box;min-height:54px;padding:8px 14px;border:0;border-bottom:1px solid #EBEEF2;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;margin:0;border-radius:0;box-shadow:none}"
+".tr-ligne:last-child{border-bottom:0}"
+".tr-ligne:hover,.tr-ligne:focus-visible{background:#F4F6F8;outline:none}"
+".tr-vide{margin:0;padding:14px;color:#5B6470;font-size:14px}"
+".tr-f-tete{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin:20px 0 8px}"
+".tr-f-tete b{flex:1;font-size:12px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#8A929B}"
+".tr-f-tete label{display:flex;align-items:center;gap:8px;font-size:13.5px;color:#5B6470;margin:0}"
+".tr-f-liste{border:1px solid #E1E5EA;border-radius:12px;overflow:hidden}"
+".tr-f{display:flex;align-items:center;gap:10px;padding:9px 8px 9px 12px;border-bottom:1px solid #EBEEF2;background:#FFFFFF}"
+".tr-f:last-child{border-bottom:0}"
+".tr-ico{flex:0 0 auto;width:44px;height:44px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:800;letter-spacing:.02em;background:#F1F3F6;color:#5B6470}"
+".tr-f[data-etat=\"fait\"] .tr-ico{background:#E6EEDA;color:#3F6212}"
+".tr-f-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}"
+".tr-titre{display:block;width:100%;box-sizing:border-box;min-height:34px;height:auto;padding:4px 8px!important;margin:-3px 0 0 -9px!important;border:1px solid transparent!important;border-radius:8px!important;background:transparent!important;font:inherit;font-size:15px;font-weight:700;color:#1E2329;box-shadow:none!important}"
+".tr-titre:hover{border-color:#E1E5EA!important}"
+".tr-titre:focus{border-color:#2563EB!important;background:#FFFFFF!important;outline:none}"
+".tr-nom{font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".tr-f-t small{color:#8A929B;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
+".tr-f-t small.tr-raison{color:#A6291F;font-weight:600;white-space:normal}"
+".tr-f[data-etat=\"refuse\"] .tr-nom{color:#8A929B;text-decoration:line-through}"
+".tr-f select,.tr-f-tete select{flex:0 0 auto;min-height:40px;max-width:180px;padding:0 8px;border:1px solid #CBD2DA;border-radius:9px;background-color:#FFFFFF;color:#1E2329;font:inherit;font-size:14px;margin:0;width:auto}"
+".tr-retirer{width:40px;height:40px;flex:0 0 auto;border:0;border-radius:50%;background:none;color:#8A929B;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;margin:0}"
+".tr-retirer svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round}"
+".tr-retirer:hover{background:#EEF1F4;color:#1E2329}"
+".tr-barre{display:block;height:5px;border-radius:3px;background:#F1F3F6;overflow:hidden;margin-top:5px}"
+".tr-barre>i{display:block;height:100%;width:0;background:#2563EB;transition:width .2s}"
+".tr-fait{flex:0 0 auto;color:#3F6212;font-weight:700;font-size:13.5px;display:inline-flex;align-items:center;gap:5px;padding-right:8px}"
+".tr-fait svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}"
+".tr-encours{flex:0 0 auto;color:#5B6470;font-size:13.5px;font-weight:600;padding-right:8px}"
+".tr-pied{position:sticky;bottom:0;display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:18px -20px 0;padding:12px 20px calc(14px + env(safe-area-inset-bottom,0px));background:#FFFFFF;border-top:1px solid #EBEEF2}"
+".tr-pied .tr-go{flex:0 0 auto}"
+".tr-etat{flex:1 1 220px;margin:0;font-size:14px;color:#5B6470;min-width:0}"
+".tr-etat.ok{color:#3F6212;font-weight:600}"
+".tr-etat.alerte{color:#A6291F;font-weight:600}"
+".tr-etat a{color:#2563EB;font-weight:700}"
+".tr-note{margin:10px 0 0;font-size:13px;color:#8A929B}"
+".tr-groupes{border:1px solid #E1E5EA;border-radius:12px;overflow:hidden}"
+".tr-g{display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 14px;border-bottom:1px solid #EBEEF2;cursor:pointer;margin:0}"
+".tr-g:last-child{border-bottom:0}"
+".tr-g input{width:20px;height:20px;accent-color:#2563EB;flex:0 0 auto;margin:0}"
+".tr-g span{flex:1;min-width:0;display:block;margin:0;font-size:15px;font-weight:600;color:inherit}"
+".tr-g em{font-style:normal;color:#5B6470;font-size:13.5px;white-space:nowrap}"
+".tr-g.tr-tout{background:#F7F8FA}"
+".tr-survol{position:fixed;top:0;left:0;right:0;bottom:0;z-index:1400;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(37,99,235,.16)}"
+".tr-survol[hidden]{display:none}"
+".tr-survol>div{pointer-events:none;display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 40px;border:3px dashed #2563EB;border-radius:22px;background:#FFFFFF;color:#1E2329;box-shadow:0 20px 50px rgba(15,17,20,.25);text-align:center;max-width:420px}"
+".tr-survol svg{width:44px;height:44px;fill:none;stroke:#2563EB;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}"
+".tr-survol b{font-size:19px}"
+".tr-survol span{color:#5B6470;font-size:15px}"
/* en pleine page (la page Importer) : pas de voile, la page défile */
+".tr-fen.tr-page{position:static;display:block;padding:0;z-index:auto}"
+".tr-page .tr-fond,.tr-page .tr-tete{display:none}"
+".tr-page .tr-onglets{margin-top:16px}"
+".tr-page .tr-boite{width:auto;max-height:none;box-shadow:0 1px 2px rgba(15,17,20,.06);border:1px solid #E1E5EA;overflow:visible;animation:none}"
+".tr-page .tr-corps{overflow:visible}"
+".tr-page .tr-pied{border-radius:0 0 16px 16px}"
+"@media (max-width:720px){"
+  ".tr-fen:not(.tr-page){align-items:flex-end;padding:0}"
+  ".tr-fen:not(.tr-page) .tr-boite{width:100%;max-height:94vh;border-radius:20px 20px 0 0}"
+  ".tr-tete{padding:12px 12px 8px 16px}.tr-onglets{margin:0 16px}.tr-corps{padding:4px 16px 0}.tr-install{margin:12px 16px 0}.tr-pied{margin:18px -16px 0;padding-left:16px;padding-right:16px}"
+  ".tr-f{flex-wrap:wrap}.tr-f select{order:3;flex:1 1 auto;max-width:none;margin-left:54px}"
+  ".tr-zone{padding:18px 12px 16px}"
+"}"
+"@media (prefers-reduced-motion:reduce){.tr-boite{animation:none}.tr-barre>i{transition:none}}";

var R={};          /* les éléments de la fenêtre */
var FEN=null, AVANT=null, SURVOL=null;

function poserStyle(){
  if(document.getElementById("transfertStyle")) return;
  var st=document.createElement("style"); st.id="transfertStyle"; st.textContent=STYLE;
  (document.head||document.documentElement).appendChild(st);
}
/* le choix du chantier : une recherche, la liste, le chantier choisi */
function selecteur(quand){
  var o={};
  o.boite=el("div", "tr-ch");
  o.choisi=el("div", "tr-choisi"); o.choisi.hidden=true;
  var t=el("div", "tr-ch-t"); o.nom=el("b"); o.sous=el("small"); t.appendChild(o.nom); t.appendChild(o.sous);
  o.changer=el("button", "tr-lien", "Changer"); o.changer.type="button";
  o.choisi.appendChild(t); o.choisi.appendChild(o.changer);
  o.cherche=el("label", "tr-cherche");
  o.cherche.innerHTML=svg(ICO.loupe);
  o.q=el("input"); o.q.type="search"; o.q.placeholder="Client, référence, ville…"; o.q.autocomplete="off";
  o.q.setAttribute("enterkeyhint", "go"); o.q.setAttribute("aria-label", "Rechercher le chantier");
  o.cherche.appendChild(o.q);
  o.liste=el("div", "tr-liste"); o.liste.setAttribute("role", "listbox"); o.liste.setAttribute("aria-label", "Les chantiers");
  o.boite.appendChild(o.choisi); o.boite.appendChild(o.cherche); o.boite.appendChild(o.liste);
  o.ref="";
  o.peindre=function(){
    var c=o.ref ? trouver(o.ref) : null;
    o.choisi.hidden=!c; o.cherche.hidden=!!c; o.liste.hidden=!!c;
    if(c){
      o.nom.textContent=nomChantier(c);
      o.sous.textContent=[c.ref!==nomChantier(c) ? c.ref : "", villeDe(c.adresse)].filter(Boolean).join(" · ");
      return;
    }
    o.liste.textContent="";
    if(!LISTE){ o.liste.appendChild(el("p", "tr-vide", "Chargement des chantiers…")); return; }
    var l=LISTE.slice().sort(function(a, b){ return String(b.maj||"").localeCompare(String(a.maj||"")); })
      .filter(function(c){ return correspond(c, o.q.value); });
    if(!LISTE.length){ o.liste.appendChild(el("p", "tr-vide", "Aucun chantier pour le moment.")); return; }
    if(!l.length){ o.liste.appendChild(el("p", "tr-vide", "Aucun chantier ne correspond à « "+o.q.value.trim()+" ».")); return; }
    l.slice(0, 80).forEach(function(c){
      var b=el("button", "tr-ligne"); b.type="button"; b.setAttribute("role", "option");
      b.appendChild(el("b", "", nomChantier(c)));
      b.appendChild(el("small", "", [c.ref!==nomChantier(c) ? c.ref : "", villeDe(c.adresse)].filter(Boolean).join(" · ")));
      b.addEventListener("click", function(){ o.choisir(c.ref); });
      o.liste.appendChild(b);
    });
  };
  o.choisir=function(ref){ o.ref=ref; o.q.value=""; o.peindre(); quand(ref); };
  o.changer.addEventListener("click", function(){ o.ref=""; quand(""); o.peindre(); if(!auDoigt()) o.q.focus(); });
  o.q.addEventListener("input", o.peindre);
  o.q.addEventListener("keydown", function(e){
    if(e.key!=="Enter") return;
    e.preventDefault();
    var b=o.liste.querySelector(".tr-ligne"); if(b) b.click();
  });
  return o;
}
function construire(){
  poserStyle();
  var f=el("div", "tr-fen"); f.id="trFen"; f.hidden=true;
  f.setAttribute("role", "dialog"); f.setAttribute("aria-modal", "true"); f.setAttribute("aria-labelledby", "trTitre");
  var fond=el("div", "tr-fond"); fond.setAttribute("data-fermer", "");
  var boite=el("div", "tr-boite"); boite.tabIndex=-1;
  var tete=el("div", "tr-tete"); var tt=el("b", "", "Importer et exporter"); tt.id="trTitre";
  var x=el("button", "tr-x"); x.type="button"; x.setAttribute("aria-label", "Fermer"); x.setAttribute("data-fermer", ""); x.innerHTML=svg(ICO.x);
  tete.appendChild(tt); tete.appendChild(x);
  var ong=el("div", "tr-onglets"); ong.setAttribute("role", "tablist"); ong.setAttribute("aria-label", "Importer ou exporter");
  R.onglets={};
  [["importer", "Importer"], ["exporter", "Exporter"]].forEach(function(o){
    var b=el("button"); b.type="button"; b.setAttribute("role", "tab"); b.id="trOnglet-"+o[0];
    b.setAttribute("aria-controls", "trVue-"+o[0]); b.innerHTML=svg(ICO[o[0]]);
    b.appendChild(el("span", "", o[1]));
    b.addEventListener("click", function(){ montrerOnglet(o[0]); });
    ong.appendChild(b); R.onglets[o[0]]=b;
  });
  ong.addEventListener("keydown", function(e){
    if(e.key!=="ArrowLeft" && e.key!=="ArrowRight") return;
    e.preventDefault();
    var o=ONGLET==="importer" ? "exporter" : "importer";
    montrerOnglet(o); R.onglets[o].focus();
  });
  /* l'installation */
  var ins=el("div", "tr-install"); ins.hidden=true;
  ins.innerHTML=svg(ICO.ecran);
  var it=el("div", "tr-ins-t");
  it.appendChild(el("b", "", "Installer le logiciel sur cet ordinateur"));
  it.appendChild(el("span", "", "Sa fenêtre, son icône, et « Ouvrir avec » dans l'Explorateur."));
  var ol=el("ol"); ol.hidden=true; it.appendChild(ol);
  var bi=el("button", "tr-btn tr-sec", "Installer"); bi.type="button";
  var bx=el("button", "tr-x"); bx.type="button"; bx.setAttribute("aria-label", "Plus tard"); bx.title="Plus tard"; bx.innerHTML=svg(ICO.x);
  ins.appendChild(it); ins.appendChild(bi); ins.appendChild(bx);
  bi.addEventListener("click", function(){ installer(); });
  bx.addEventListener("click", function(){ try{ localStorage.setItem("transfert:installation", "plus-tard"); }catch(e){} ol.hidden=true; ins.hidden=true; });
  R.ins={boite:ins, bouton:bi, consignes:ol};

  var corps=el("div", "tr-corps");
  /* ----- importer ----- */
  var vi=el("section"); vi.id="trVue-importer"; vi.setAttribute("role", "tabpanel"); vi.setAttribute("aria-labelledby", "trOnglet-importer");
  var zone=el("div", "tr-zone");
  zone.innerHTML=svg(ICO.importer);
  var zp=el("p"); var zb=el("b"); var zs=el("span"); zp.appendChild(zb); zp.appendChild(zs);
  var zbtn=el("div", "tr-zone-btns");
  var bF=el("button", "tr-btn", "Choisir des fichiers"); bF.type="button";
  var bD=el("button", "tr-btn tr-sec", "Choisir un dossier"); bD.type="button";
  zbtn.appendChild(bF); zbtn.appendChild(bD);
  var zsm=el("small", "", "PDF, plans DWG et DXF, images, Word, Excel, PowerPoint · 25 Mo par fichier");
  var inF=el("input"); inF.type="file"; inF.multiple=true; inF.hidden=true; inF.setAttribute("aria-label", "Choisir des fichiers");
  /* sur l'ordinateur, le sélecteur ne montre que les formats acceptés ; au téléphone, tout se choisit :
     l'iPhone grise dans Fichiers ce qu'il ne reconnaît pas (un plan .dwg), et le format est vérifié juste après */
  if(!auDoigt()) inF.accept=ACCEPT;
  var inD=el("input"); inD.type="file"; inD.multiple=true; inD.hidden=true; inD.setAttribute("webkitdirectory", ""); inD.setAttribute("aria-label", "Choisir un dossier");
  zone.appendChild(zp); zone.appendChild(zbtn); zone.appendChild(zsm); zone.appendChild(inF); zone.appendChild(inD);
  bF.addEventListener("click", function(){ inF.click(); });
  bD.addEventListener("click", function(){ inD.click(); });
  inF.addEventListener("change", function(){ var l=Array.prototype.slice.call(inF.files||[]); inF.value=""; ajouter(l); });
  inD.addEventListener("change", function(){ var l=Array.prototype.slice.call(inD.files||[]); inD.value=""; ajouter(l); });
  vi.appendChild(zone);
  var libI=el("span", "tr-lib", "Dans le chantier"); vi.appendChild(libI);
  var selI=selecteur(function(ref){ IMP.ref=ref; if(ref && !EXP.ref){ EXP.ref=ref; R.exp.ch.ref=ref; } majImport(); });
  vi.appendChild(selI.boite);
  var fl=el("div", "tr-fichiers"); fl.hidden=true;
  var flt=el("div", "tr-f-tete"); var flb=el("b"); var lab=el("label", "", "Tout ranger en ");
  var tout=el("select"); tout.setAttribute("aria-label", "Ranger tous les fichiers en");
  tout.appendChild(new Option("…", "")); NATURES.forEach(function(n){ tout.appendChild(new Option(n, n)); });
  tout.addEventListener("change", function(){
    if(!tout.value) return;
    IMP.items.forEach(function(i){ if(i.etat==="pret" || i.etat==="echec") i.nature=tout.value; });
    tout.value=""; peindreFichiers();
  });
  lab.appendChild(tout); flt.appendChild(flb); flt.appendChild(lab);
  var fll=el("div", "tr-f-liste");
  fl.appendChild(flt); fl.appendChild(fll); vi.appendChild(fl);
  var piedI=el("div", "tr-pied");
  var go=el("button", "tr-btn tr-go"); go.type="button"; go.innerHTML=svg(ICO.importer); go.appendChild(el("span", "", "Importer"));
  var etI=el("p", "tr-etat"); etI.setAttribute("aria-live", "polite");
  piedI.appendChild(go); piedI.appendChild(etI); vi.appendChild(piedI);
  go.addEventListener("click", importer);
  R.imp={zone:zone, zb:zb, zs:zs, bD:bD, ch:selI, fl:fl, flb:flb, liste:fll, go:go, etat:etI};

  /* ----- exporter ----- */
  var ve=el("section"); ve.id="trVue-exporter"; ve.setAttribute("role", "tabpanel"); ve.setAttribute("aria-labelledby", "trOnglet-exporter");
  ve.appendChild(el("span", "tr-lib", "Le chantier"));
  var selE=selecteur(function(ref){ EXP.ref=ref; EXP.coches={}; majExport(); });
  ve.appendChild(selE.boite);
  var gl=el("span", "tr-lib", "Les documents à enregistrer sur l'ordinateur"); gl.hidden=true; ve.appendChild(gl);
  var gr=el("div", "tr-groupes"); gr.hidden=true; ve.appendChild(gr);
  var note=el("p", "tr-note", "Rangés comme sur le site ; exporter à nouveau met à jour."); note.hidden=true;
  ve.appendChild(note);
  var piedE=el("div", "tr-pied");
  var bDos=el("button", "tr-btn tr-go"); bDos.type="button"; bDos.innerHTML=svg(ICO.exporter); bDos.appendChild(el("span", "", "Enregistrer dans un dossier"));
  var bZip=el("button", "tr-btn tr-sec", "Télécharger en ZIP"); bZip.type="button";
  var etE=el("p", "tr-etat"); etE.setAttribute("aria-live", "polite");
  piedE.appendChild(bDos); piedE.appendChild(bZip); piedE.appendChild(etE); ve.appendChild(piedE);
  bDos.addEventListener("click", function(){ exporter("dossier"); });
  bZip.addEventListener("click", function(){ exporter("zip"); });
  R.exp={ch:selE, lib:gl, groupes:gr, note:note, dossier:bDos, zip:bZip, etat:etE};

  corps.appendChild(vi); corps.appendChild(ve);
  boite.appendChild(tete); boite.appendChild(ong); boite.appendChild(ins); boite.appendChild(corps);
  f.appendChild(fond); f.appendChild(boite);
  R.fen=f; R.boite=boite; R.vues={importer:vi, exporter:ve};

  f.addEventListener("click", function(e){ if(e.target.closest("[data-fermer]")) fermer(); });
  document.addEventListener("keydown", function(e){
    if(e.key!=="Escape" || f.hidden || f.classList.contains("tr-page")) return;
    e.preventDefault(); e.stopPropagation(); fermer();
  }, true);
  f.addEventListener("keydown", function(e){
    if(e.key!=="Tab" || f.classList.contains("tr-page")) return;
    var l=Array.prototype.filter.call(boite.querySelectorAll("button,input,select,a[href],[tabindex]:not([tabindex='-1'])"), function(x){ return !x.disabled && x.offsetParent; });
    if(!l.length) return;
    if(e.shiftKey && document.activeElement===l[0]){ e.preventDefault(); l[l.length-1].focus(); }
    else if(!e.shiftKey && document.activeElement===l[l.length-1]){ e.preventDefault(); l[0].focus(); }
  });
  window.addEventListener("beforeunload", function(e){ if(IMP.envoi || EXP.encours){ e.preventDefault(); e.returnValue=""; } });
  return f;
}
function montrerOnglet(o){
  ONGLET=o;
  Object.keys(R.onglets).forEach(function(k){
    R.onglets[k].setAttribute("aria-selected", k===o ? "true" : "false");
    R.onglets[k].tabIndex = k===o ? 0 : -1;
    R.vues[k].hidden = k!==o;
  });
  if(o==="exporter"){ if(!R.exp.ch.ref && IMP.ref){ R.exp.ch.ref=IMP.ref; EXP.ref=IMP.ref; } majExport(); }
  else majImport();
}
function etatImp(t, genre){ if(!R.imp) return; R.imp.etat.textContent=t||""; R.imp.etat.className="tr-etat"+(genre ? " "+genre : ""); }
function etatExp(t, genre){ if(!R.exp) return; R.exp.etat.textContent=t||""; R.exp.etat.className="tr-etat"+(genre ? " "+genre : ""); }
function peindreLigne(it){
  var n=ligne(it);
  if(it.ligne && it.ligne.parentNode) it.ligne.parentNode.replaceChild(n, it.ligne);
  it.ligne=n;
  majImport(true);
}
function majBarre(it){ if(it.barre) it.barre.style.width=Math.round(it.pct*100)+"%"; }
function ligne(it){
  var r=el("div", "tr-f"); r.setAttribute("data-etat", it.etat);
  r.appendChild(el("span", "tr-ico", (it.ext||"?").toUpperCase().slice(0, 4)));
  var t=el("div", "tr-f-t");
  var modifiable=(it.etat==="pret" || it.etat==="echec") && !IMP.envoi;
  if(modifiable){
    var inp=el("input", "tr-titre"); inp.type="text"; inp.value=it.titre; inp.maxLength=120;
    inp.setAttribute("aria-label", "Nom du document « "+it.nom+" »");
    inp.addEventListener("input", function(){ it.titre=inp.value; });
    t.appendChild(inp);
  } else t.appendChild(el("b", "tr-nom", it.titre));
  var dossier=it.chemin.indexOf("/")>=0 ? it.chemin.replace(/\/[^\/]*$/, "")+"/" : "";
  t.appendChild(el("small", "", [dossier, FORMATS[it.ext] || (it.ext ? "."+it.ext : ""), poids(it.taille), it.etat==="fait" ? it.nature : ""].filter(Boolean).join(" · ")));
  if(it.raison) t.appendChild(el("small", "tr-raison", it.raison));
  it.barre=null;
  if(it.etat==="envoi"){ var b=el("i", "tr-barre"), bi=el("i"); bi.style.width=Math.round(it.pct*100)+"%"; b.appendChild(bi); t.appendChild(b); it.barre=bi; }
  r.appendChild(t);
  if(modifiable){
    var s=el("select"); s.setAttribute("aria-label", "Ranger « "+it.titre+" » en");
    NATURES.forEach(function(n){ s.appendChild(new Option(n, n, false, n===it.nature)); });
    s.value=it.nature;
    s.addEventListener("change", function(){ it.nature=s.value; });
    r.appendChild(s);
  }
  if(it.etat==="fait"){ var ok=el("span", "tr-fait"); ok.innerHTML=svg(ICO.ok); ok.appendChild(el("span", "", "Importé")); r.appendChild(ok); }
  else if(it.etat==="envoi"){ r.appendChild(el("span", "tr-encours", "Envoi…")); }
  else if(IMP.envoi && it.etat==="pret"){ r.appendChild(el("span", "tr-encours", "En attente")); }
  else if(!IMP.envoi || it.etat==="refuse"){
    var x=el("button", "tr-retirer"); x.type="button"; x.innerHTML=svg(ICO.x);
    x.setAttribute("aria-label", "Retirer « "+it.nom+" »");
    x.addEventListener("click", function(){ IMP.items=IMP.items.filter(function(i){ return i!==it; }); peindreFichiers(); });
    r.appendChild(x);
  }
  return r;
}
function peindreFichiers(){
  if(!R.imp) return;
  var h=R.imp.liste; h.textContent="";
  IMP.items.forEach(function(it){ it.ligne=ligne(it); h.appendChild(it.ligne); });
  majImport();
}
function majImport(sansListe){
  if(!R.imp) return;
  var doigt=auDoigt();
  R.imp.zb.textContent=doigt ? "Choisissez vos plans et documents" : "Glissez ici vos plans et vos documents";
  R.imp.zs.textContent=doigt ? "depuis l'appareil ou un service de fichiers" : "ou un dossier entier, depuis l'Explorateur ou le Finder";
  R.imp.bD.hidden=doigt;
  R.imp.ch.ref=IMP.ref; R.imp.ch.peindre();
  var items=IMP.items, prets=items.filter(function(i){ return i.etat==="pret" || i.etat==="echec"; });
  var total=items.filter(function(i){ return i.etat!=="refuse"; }).reduce(function(s, i){ return s+i.taille; }, 0);
  R.imp.fl.hidden=!items.length;
  R.imp.flb.textContent=items.length+" fichier"+(items.length>1?"s":"")+(total ? " · "+poids(total) : "");
  if(!sansListe && items.length && R.imp.liste.children.length!==items.length) peindreFichiers();
  var lib=R.imp.go.querySelector("span");
  lib.textContent=IMP.envoi ? "Import en cours…" : prets.length ? "Importer "+prets.length+" document"+(prets.length>1?"s":"") : "Importer";
  R.imp.go.disabled=IMP.envoi || !prets.length || !IMP.ref || !accesImport();
  if(!accesImport()){ etatImp("L'import n'est pas ouvert à votre compte (appli Documents techniques). Voyez avec votre administrateur.", "alerte"); return; }
  if(IMP.envoi) return;
  var b=IMP.bilan;
  if(b){
    R.imp.etat.className="tr-etat "+(b.echecs ? "alerte" : "ok"); R.imp.etat.textContent="";
    if(b.session){ R.imp.etat.textContent="Session expirée : reconnectez-vous, puis importez à nouveau les documents restants."; return; }
    if(b.faits){
      R.imp.etat.appendChild(document.createTextNode(b.faits+" document"+(b.faits>1?"s":"")+" importé"+(b.faits>1?"s":"")+" dans "+b.nom+". "));
      if(!/chantier\.html/.test(location.pathname) || (new URLSearchParams(location.search).get("ref")||"")!==b.ref){
        var a=el("a", "", "Ouvrir le chantier"); a.href="./chantier.html?ref="+encodeURIComponent(b.ref);
        R.imp.etat.appendChild(a);
      }
    }
    if(b.echecs) R.imp.etat.appendChild(document.createTextNode((b.faits ? " " : "")+b.echecs+" en échec : voyez la raison sous chacun, puis réessayez."));
    return;
  }
  if(!items.length) etatImp("");
  else if(!IMP.ref) etatImp("Choisissez le chantier qui reçoit les documents.");
  else if(!prets.length) etatImp("Aucun fichier à importer : voyez la raison sous chacun.", "alerte");
  else etatImp("");
}
function majExport(){
  if(!R.exp) return;
  R.exp.ch.ref=EXP.ref; R.exp.ch.peindre();
  var c=EXP.ref ? trouver(EXP.ref) : null, docs=docsDe(c);
  var gr=R.exp.groupes; gr.textContent="";
  R.exp.lib.hidden=!c; gr.hidden=!c; R.exp.note.hidden=!c;
  R.exp.dossier.hidden=!window.showDirectoryPicker;
  R.exp.zip.classList.toggle("tr-sec", !!window.showDirectoryPicker);
  R.exp.dossier.disabled=R.exp.zip.disabled=EXP.encours || !c || !docs.length;
  if(!c){ if(!EXP.encours) etatExp(""); return; }
  if(!docs.length){ gr.appendChild(el("p", "tr-vide", "Aucun document dans ce chantier pour le moment.")); return; }
  var par={};
  docs.forEach(function(f){ var g=groupeDe(f); (par[g]=par[g]||{n:0, o:0, lots:0}); par[g].n++; par[g].o+=f.taille||0; if(/\.zip$/i.test(f.cle)) par[g].lots++; });
  var presents=GROUPES.filter(function(g){ return par[g[0]]; });
  function ligneG(cls, cle, libelle, info, coche, change){
    var l=el("label", "tr-g"+(cls ? " "+cls : ""));
    var cb=el("input"); cb.type="checkbox"; cb.checked=coche; cb.setAttribute("data-g", cle);
    /* la liste est repeinte : la case cochée au clavier garde le focus */
    cb.addEventListener("change", function(){
      change(cb.checked);
      var n=gr.querySelector('input[data-g="'+cle+'"]'); if(n) n.focus();
    });
    l.appendChild(cb); l.appendChild(el("span", "", libelle)); l.appendChild(el("em", "", info));
    gr.appendChild(l); return cb;
  }
  var tous=presents.every(function(g){ return EXP.coches[g[0]]!==false; });
  var tot=docs.reduce(function(s, f){ return s+(f.taille||0); }, 0);
  if(presents.length>1) ligneG("tr-tout", "tout", "Tout le dossier", docs.length+" document"+(docs.length>1?"s":"")+" · "+poids(tot), tous, function(v){
    presents.forEach(function(g){ EXP.coches[g[0]]=v; }); majExport();
  });
  presents.forEach(function(g){
    var p=par[g[0]];
    ligneG("", g[0], g[1], p.n+(p.lots===p.n && g[0]==="photos" ? " lot"+(p.n>1?"s":"") : "")+" · "+poids(p.o), EXP.coches[g[0]]!==false, function(v){ EXP.coches[g[0]]=v; majExport(); });
  });
  var aucun=presents.every(function(g){ return EXP.coches[g[0]]===false; });
  if(aucun) R.exp.dossier.disabled=R.exp.zip.disabled=true;
}
function peindre(){
  majInstall();
  montrerOnglet(ONGLET);
}

/* ---------- ouvrir, fermer ---------- */
function ouvrir(o){
  o=o||{};
  if(o.chantiers!==undefined) OPT.chantiers=o.chantiers;
  if(o.apres) OPT.apres=o.apres;
  if(o.quandOuvert) OPT.quandOuvert=o.quandOuvert;
  if(!R.fen){
    FEN=construire();
    if(o.hote){ FEN.classList.add("tr-page"); FEN.removeAttribute("role"); FEN.removeAttribute("aria-modal"); o.hote.appendChild(FEN); }
    else document.body.appendChild(FEN);
  }
  var dejaOuvert=!FEN.hidden;
  /* la liste des chantiers de la page, relue à chaque ouverture ; et sans chantier désigné
     (l'accueil), on le choisit à nouveau : pas d'import par mégarde dans celui de la dernière fois */
  if(!dejaOuvert && !IMP.envoi && !EXP.encours){
    LISTE=null;
    if(!o.ref){ IMP.ref=""; EXP.ref=""; EXP.coches={}; }
  }
  if(o.ref){ if(!IMP.envoi) IMP.ref=o.ref; if(!EXP.encours){ if(EXP.ref!==o.ref) EXP.coches={}; EXP.ref=o.ref; } }
  if(o.onglet) ONGLET=o.onglet;
  if(o.fichiers && o.fichiers.length){ ONGLET="importer"; ajouter(o.fichiers); }
  if(!dejaOuvert){
    AVANT=document.activeElement;
    FEN.hidden=false;
    if(!FEN.classList.contains("tr-page")) document.documentElement.style.overflow="hidden";
  }
  peindre();
  lesChantiers().then(function(){ peindre(); }, function(e){
    if(e && e.message==="session"){ etatImp("Session expirée : reconnectez-vous.", "alerte"); return; }
    if(!LISTE){ LISTE=[]; peindre(); etatImp("Liste des chantiers indisponible hors connexion.", "alerte"); }
  });
  if(!dejaOuvert && !FEN.classList.contains("tr-page")){
    setTimeout(function(){
      var cible=null;
      if(!auDoigt() && ONGLET==="importer" && !IMP.ref) cible=R.imp.ch.q;
      if(!auDoigt() && ONGLET==="exporter" && !EXP.ref) cible=R.exp.ch.q;
      (cible || R.onglets[ONGLET]).focus();
    }, 30);
  }
  if(OPT.quandOuvert) OPT.quandOuvert(true);
}
function fermer(){
  if(!FEN || FEN.hidden || FEN.classList.contains("tr-page")) return;
  if(IMP.envoi){
    if(!window.confirm("Des documents sont en cours d'envoi. Fermer quand même ?\n\nL'envoi s'arrête ; les documents déjà importés restent dans le chantier.")) return;
    IMP.envoi=false;
    if(IMP.xhr) try{ IMP.xhr.abort(); }catch(e){}
  }
  FEN.hidden=true;
  document.documentElement.style.overflow="";
  if(OPT.quandOuvert) OPT.quandOuvert(false);
  if(AVANT && AVANT.focus && document.contains(AVANT)) try{ AVANT.focus(); }catch(e){}
}

/* ---------- le dépôt n'importe où sur la page, et le collage ---------- */
function aDesFichiers(e){
  var t=e.dataTransfer && e.dataTransfer.types;
  return !!t && Array.prototype.indexOf.call(t, "Files")>=0;
}
function depot(o){
  o=o||{};
  function actif(){ return !!jeton() && (!o.actif || o.actif()); }
  function ref(){ return typeof o.ref==="function" ? o.ref() : (o.ref||""); }
  function montrer(){
    poserStyle();
    /* la fenêtre est ouverte : c'est elle qui reçoit */
    if(FEN && !FEN.hidden){ R.imp.zone.classList.add("survol"); return; }
    if(!SURVOL){
      SURVOL=el("div", "tr-survol"); SURVOL.hidden=true;
      var d=el("div"); d.innerHTML=svg(ICO.importer);
      d.appendChild(el("b", "", "Déposez pour importer")); d.appendChild(el("span"));
      SURVOL.appendChild(d);
      document.body.appendChild(SURVOL);
      SURVOL.addEventListener("dragleave", function(e){ if(!e.relatedTarget || !SURVOL.contains(e.relatedTarget)) cacher(); });
    }
    var c=ref() ? (trouver(ref()) || (typeof o.chantier==="function" ? o.chantier() : null)) : null;
    SURVOL.querySelector("span").textContent = c ? "dans « "+nomChantier(c)+" »" : "vos plans et vos documents, dans un chantier";
    SURVOL.hidden=false;
  }
  function cacher(){ if(SURVOL) SURVOL.hidden=true; if(R.imp) R.imp.zone.classList.remove("survol"); }
  window.addEventListener("dragenter", function(e){ if(!actif() || !aDesFichiers(e)) return; e.preventDefault(); montrer(); });
  window.addEventListener("dragover", function(e){ if(!actif() || !aDesFichiers(e)) return; e.preventDefault(); try{ e.dataTransfer.dropEffect="copy"; }catch(er){} });
  window.addEventListener("dragleave", function(e){ if(!e.relatedTarget && (e.clientX<=0 || e.clientY<=0 || e.clientX>=window.innerWidth || e.clientY>=window.innerHeight)) cacher(); });
  window.addEventListener("dragend", cacher);
  window.addEventListener("drop", function(e){
    if(!actif() || !aDesFichiers(e)) return;
    e.preventDefault(); cacher();
    lireDepot(e.dataTransfer).then(function(l){
      if(l.length) ouvrir({onglet:"importer", fichiers:l, ref:ref(), chantiers:o.chantiers, apres:o.apres, quandOuvert:o.quandOuvert});
    });
  });
  document.addEventListener("paste", function(e){
    if(!actif()) return;
    var t=e.target;
    if(t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName||""))) return;
    var fs=e.clipboardData && e.clipboardData.files;
    if(!fs || !fs.length) return;
    e.preventDefault();
    ouvrir({onglet:"importer", fichiers:Array.prototype.map.call(fs, function(f){ return {file:nommerCapture(f), chemin:""}; }), ref:ref(), chantiers:o.chantiers, apres:o.apres, quandOuvert:o.quandOuvert});
  });
}

/* revenu en arrière sur la page (cache du navigateur) : la fenêtre est refermée, comme les autres */
window.addEventListener("pageshow", function(e){
  if(e.persisted && FEN && !FEN.hidden && !IMP.envoi && !EXP.encours && !FEN.classList.contains("tr-page")) fermer();
});

window.Transfert={
  ouvrir:ouvrir,
  fermer:fermer,
  depot:depot,
  lireDepot:lireDepot,
  installer:installer,
  installe:installe,
  ouvert:function(){ return !!FEN && !FEN.hidden; },
  /* pour les essais et la page Importer */
  _etat:function(){ return {imp:IMP, exp:EXP}; }
};
})();
