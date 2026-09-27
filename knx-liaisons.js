/* Relier les adresses de groupe aux objets des participants, directement
   dans un projet ETS (.knxproj), sans passer par ETS.

   Le .knxproj est un ZIP : le projet est dans P-xxxx/0.xml, la description
   de chaque produit dans M-xxxx/…. ETS 6 range les liaisons dans l'attribut
   Links des ComObjectInstanceRef du participant : « GA-21 GA-35 », la
   première adresse étant celle sur laquelle l'objet émet.

   Participants reconnus : passerelle Airzone (AZX6KNXGTWAY, application
   DI6Flexa). Les adresses sont celles de l'outil Adresses KNX : on lit leur
   nom (« System01 - Zone02 - CHAMBRE 2 - Temperature Setpoint Control »)
   pour savoir à quel objet elles vont.

   KnxLiaisons.lire(ArrayBuffer) → Promise<Projet>
     Projet.appareils   [{id, adresse, nom, systeme, zones:{n:{thermostat}}}]
     Projet.calculer()  → {liens:[…], alertes:[…]}
     Projet.ecrire({sansSignature}) → Promise<Blob>
     Projet.csv()       → texte du tableau des liaisons */
(function(){
"use strict";
var JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
function jszip(){
  if(window.JSZip) return Promise.resolve(window.JSZip);
  return new Promise(function(ok, non){
    var s=document.createElement("script"); s.src=JSZIP_URL;
    s.onload=function(){ window.JSZip ? ok(window.JSZip) : non(new Error("Lecture ZIP indisponible.")); };
    s.onerror=function(){ non(new Error("Lecture ZIP indisponible : vérifiez la connexion.")); };
    document.head.appendChild(s);
  });
}
function xml(texte){
  var d=new DOMParser().parseFromString(String(texte).replace(/^﻿/, ""), "application/xml");
  if(d.getElementsByTagName("parsererror").length) throw new Error("Fichier XML illisible dans le projet.");
  return d;
}
function enfants(e, nom){ return Array.prototype.filter.call(e.children, function(c){ return c.localName===nom; }); }
function tous(doc, nom){ return Array.prototype.slice.call(doc.getElementsByTagNameNS("*", nom)); }
function adresseGa(n){ n=parseInt(n, 10); return (n>>11) + "/" + ((n>>8)&7) + "/" + (n&255); }
function idCourt(id){ var i=id.indexOf("_"); return i<0 ? id : id.slice(i+1); }

/* ---------- la passerelle Airzone ----------
   16 objets par zone à partir de 23 : 23 défaut, 24 état marche, 25
   commande marche, 26 état consigne, 27 consigne, 28 humidité, 29 état
   température, 30 température envoyée, 31-32 ventilo-convecteur, 33-34 mode,
   35 état étage chaud, 36 étage chaud, 37 état étage froid, 38 étage froid. */
var AZ = {
  zone: function(z, decalage){ return 23 + (z-1)*16 + decalage; },
  ZONE: {"error status":0, "on/off status":1, "on/off control":2, "temperature setpoint status":3,
    "temperature setpoint control":4, "relative moisture status":5, "local temperature status":6, "local temperature control":7},
  SYSTEME: {"air demand status":21, "error status":0, "date status":15, "date control":16, "time status":17,
    "time control":18, "cool demand status":19, "heat demand status":20, "ground demand status":22},
  MODES: {"operation mode status":1, "operation mode control":2, "stop mode status":3, "stop mode control":4,
    "cool mode status":5, "cool mode control":6, "heat mode status":7, "heat mode control":8,
    "fan mode status":9, "fan mode control":10, "dry mode status":11, "dry mode control":12},
  ETAGES: {"heat stages status":12, "heat stages control":13, "cool stages status":14, "cool stages control":15}
};
function estStatut(nom){ return /status|statut/i.test(nom); }

function lire(buffer){
  var P={};
  return jszip().then(function(JSZip){ return JSZip.loadAsync(buffer); }).then(function(zip){
    P.zip=zip;
    var noms=Object.keys(zip.files);
    P.fichier = noms.filter(function(n){ return /^P-[0-9A-F]+\/0\.xml$/i.test(n); })[0];
    if(!P.fichier){
      if(noms.some(function(n){ return /^P-[0-9A-F]+\.zip$/i.test(n); }))
        throw new Error("Ce projet est protégé par un mot de passe : retirez-le dans ETS (Propriétés du projet) et exportez-le de nouveau.");
      throw new Error("Ce fichier n'est pas un projet ETS (.knxproj).");
    }
    P.id = P.fichier.split("/")[0];
    return zip.file(P.fichier).async("string");
  }).then(function(texte){
    P.bom = texte.charCodeAt(0)===0xFEFF;
    P.entete = (/^﻿?(<\?xml[^>]*\?>)/.exec(texte)||[])[1] || '<?xml version="1.0" encoding="utf-8"?>';
    P.doc = xml(texte);
    P.ns = P.doc.documentElement.namespaceURI;
    /* les adresses de groupe */
    P.gas = tous(P.doc, "GroupAddress").map(function(g){
      return {id:g.getAttribute("Id"), court:idCourt(g.getAttribute("Id")), adr:adresseGa(g.getAttribute("Address")),
        brut:parseInt(g.getAttribute("Address"), 10), nom:(g.getAttribute("Name")||"").trim()};
    });
    /* les participants et leur programme d'application */
    var devs = tous(P.doc, "DeviceInstance");
    return chargerHardware(P).then(function(h2p){
      var progs={};
      return Promise.all(devs.map(function(d){
        var app = h2p[d.getAttribute("Hardware2ProgramRefId")];
        if(!app) return null;
        if(!progs[app]) progs[app] = chargerProgramme(P, app);
        return progs[app].then(function(prog){ return {d:d, prog:prog}; });
      }));
    }).then(function(liste){
      P.appareils = [];
      liste.forEach(function(x){
        if(!x || !x.prog || !x.prog.airzone) return;
        P.appareils.push(appareil(P, x.d, x.prog));
      });
      P.appareils.forEach(function(a, i){
        var m=/SYST[EÈ]ME?\s*0*(\d+)/i.exec(a.nom);
        a.systeme = m ? parseInt(m[1], 10) : i+1;
      });
      P.calculer = function(){ return calculer(P); };
      P.ecrire = function(o){ return ecrire(P, o||{}); };
      P.csv = function(){ return csv(P); };
      return P;
    });
  });
}
function chargerHardware(P){
  var h2p={};
  var fichiers = Object.keys(P.zip.files).filter(function(n){ return /^M-[0-9A-F]+\/Hardware\.xml$/i.test(n); });
  return Promise.all(fichiers.map(function(f){
    return P.zip.file(f).async("string").then(function(t){
      tous(xml(t), "Hardware2Program").forEach(function(hp){
        var ref = tous(hp, "ApplicationProgramRef")[0];
        if(ref) h2p[hp.getAttribute("Id")] = ref.getAttribute("RefId");
      });
    });
  })).then(function(){ return h2p; });
}
function chargerProgramme(P, appId){
  var fab = appId.split("_")[0], f = fab + "/" + appId + ".xml";
  var z = P.zip.file(f);
  if(!z) return Promise.resolve(null);
  return z.async("string").then(function(t){
    var d=xml(t), objets={}, refs={};
    tous(d, "ComObject").forEach(function(c){ objets[c.getAttribute("Id")] = {num:parseInt(c.getAttribute("Number"), 10), nom:c.getAttribute("Name")||"", texte:c.getAttribute("Text")||""}; });
    tous(d, "ComObjectRef").forEach(function(r){ refs[r.getAttribute("Id")] = r; });
    var noms = Object.keys(objets).map(function(k){ return objets[k].nom; });
    var airzone = noms.indexOf("Zone01OnOff")>=0 && noms.indexOf("SysOpMode")>=0;
    return {id:appId, objets:objets, refs:refs, airzone:airzone};
  });
}
function appareil(P, d, prog){
  var seg=d.parentNode, ligne=seg && seg.parentNode, zone=ligne && ligne.parentNode;
  var adr = [zone && zone.getAttribute("Address"), ligne && ligne.getAttribute("Address"), d.getAttribute("Address")].join(".");
  /* les objets visibles, d'après l'arbre des objets du participant */
  var parNum={};
  tous(d, "Node").forEach(function(n){
    (n.getAttribute("GroupObjectInstances")||"").split(/\s+/).filter(Boolean).forEach(function(inst){
      var ref = prog.refs[prog.id + "_" + inst];
      if(!ref) return;
      var o = prog.objets[ref.getAttribute("RefId")];
      if(o) parNum[o.num] = {inst:inst, nom:ref.getAttribute("Text") || o.texte || o.nom};
    });
  });
  var zones={};
  for(var z=1;z<=14;z++){
    if(parNum[AZ.zone(z, 2)]) zones[z] = {thermostat: !!parNum[AZ.zone(z, 5)] && !parNum[AZ.zone(z, 7)]};
  }
  return {el:d, id:d.getAttribute("Id"), adresse:adr, nom:(d.getAttribute("Name")||"").trim() || ("Participant " + adr),
    objets:parNum, zones:zones, prog:prog};
}

/* ---------- qui va où ---------- */
function calculer(P){
  var liens=[], alertes=[], vus={};
  function lien(ga, app, num, silence, raison){
    var o = app.objets[num];
    if(!o){
      if(!silence) alertes.push(ga.adr + " « " + ga.nom + " » : " + (raison || ("l'objet " + num + " n'est pas visible sur " + app.adresse)));
      return;
    }
    var k = ga.court + "|" + app.id + "|" + num;
    if(vus[k]) return; vus[k]=1;
    liens.push({ga:ga, app:app, num:num, objet:o.nom, inst:o.inst});
  }
  function parSysteme(n){ return P.appareils.filter(function(a){ return a.systeme===n; }); }
  var rattachees=0;
  P.gas.forEach(function(ga){
    var nom=ga.nom, m, a0=ga.brut>>11;
    /* une zone : System01 - Zone02 - … - fonction */
    if((m=/^System\s*0*(\d+)\s*-\s*Zone\s*0*(\d+)\b.*-\s*([A-Za-z/ ]+?)\s*$/i.exec(nom))){
      var f=m[3].toLowerCase().replace(/\s+/g," "), dec=AZ.ZONE[f];
      if(dec===undefined) return;
      var apps=parSysteme(parseInt(m[1], 10));
      if(!apps.length){ alertes.push(ga.adr + " « " + nom + " » : aucune passerelle Airzone pour le système " + parseInt(m[1], 10)); return; }
      rattachees++;
      var z=parseInt(m[2], 10);
      apps.forEach(function(a){
        var num=AZ.zone(z, dec), raison;
        if(!a.zones[z]) raison="la zone " + z + " n'est pas activée sur " + a.adresse + " (paramètre « Zone " + z + " status »)";
        else if(dec===5 && !a.zones[z].thermostat) raison="la zone " + z + " de " + a.adresse + " n'a pas de thermostat Airzone (pas d'humidité)";
        else if(dec===7 && a.zones[z].thermostat) raison="la zone " + z + " de " + a.adresse + " a un thermostat Airzone : elle mesure elle-même";
        else raison="l'objet " + num + " n'est pas visible sur " + a.adresse + " (paramètre du participant)";
        lien(ga, a, num, false, raison);
      });
      return;
    }
    /* les étages chaud et froid d'un système : toutes ses zones */
    if((m=/^System\s*0*(\d+)\s*-\s*(Heat|Cool) Stages (Control|Status)$/i.exec(nom))){
      var cle=(m[2]+" stages "+m[3]).toLowerCase(), apps2=parSysteme(parseInt(m[1], 10));
      apps2.forEach(function(a){
        var zs=Object.keys(a.zones).map(Number);
        if(estStatut(nom)) zs=zs.slice(0, 1);          /* un seul objet émet sur une adresse d'état */
        zs.forEach(function(z){ lien(ga, a, AZ.zone(z, AZ.ETAGES[cle]), true); });
      });
      if(apps2.length) rattachees++;
      return;
    }
    /* le système lui-même */
    if((m=/^System\s*0*(\d+)\s*-\s*(.+?)\s*$/i.exec(nom))){
      var num=AZ.SYSTEME[m[2].toLowerCase()];
      if(num===undefined) return;
      var apps3=parSysteme(parseInt(m[1], 10));
      apps3.forEach(function(a){ lien(ga, a, num); });
      if(apps3.length) rattachees++;
      return;
    }
    /* le groupe commun (16 « VRV ») : les commandes vont à toutes les passerelles,
       les états viennent de la première */
    if(a0===16){
      var n=nom.toLowerCase().replace(/\s+/g," "), cible=[];
      if(AZ.MODES[n]!==undefined) cible=[function(a){ return [AZ.MODES[n]]; }];
      else if(/^(heat|cool) stages control$/.test(n)) cible=[function(a){ return Object.keys(a.zones).map(function(z){ return AZ.zone(+z, AZ.ETAGES[n]); }); }];
      else if(n==="temperature general") cible=[function(a){ return Object.keys(a.zones).map(function(z){ return AZ.zone(+z, 4); }); }];
      else if(n==="on/off general") cible=[function(a){ return Object.keys(a.zones).map(function(z){ return AZ.zone(+z, 2); }); }];
      if(!cible.length || !P.appareils.length) return;
      var tousApps = estStatut(nom) ? P.appareils.slice(0, 1) : P.appareils;
      tousApps.forEach(function(a){ cible[0](a).forEach(function(num){ lien(ga, a, num, true); }); });
      rattachees++;
    }
  });
  if(P.appareils.length && !rattachees) alertes.push("Aucune adresse Airzone de l'outil dans ce projet : importez d'abord le XML des adresses dans ETS.");
  return {liens:liens, alertes:alertes};
}

/* ---------- écrire les liaisons dans le projet ---------- */
function ecrire(P, o){
  var r=calculer(P), doc=P.doc.cloneNode(true), ns=P.ns;
  var parApp={};
  r.liens.forEach(function(l){ ((parApp[l.app.id]=parApp[l.app.id]||{})[l.inst]=parApp[l.app.id][l.inst]||[]).push(l.ga.court); });
  tous(doc, "DeviceInstance").forEach(function(d){
    var aLier=parApp[d.getAttribute("Id")]; if(!aLier) return;
    var boite=enfants(d, "ComObjectInstanceRefs")[0];
    if(!boite){
      boite=doc.createElementNS(ns, "ComObjectInstanceRefs");
      var apres=enfants(d, "ParameterInstanceRefs")[0];
      if(apres && apres.nextSibling) d.insertBefore(boite, apres.nextSibling);
      else if(apres) d.appendChild(boite);
      else d.insertBefore(boite, d.firstChild);
    }
    Object.keys(aLier).forEach(function(inst){
      var ref=enfants(boite, "ComObjectInstanceRef").filter(function(c){ return c.getAttribute("RefId")===inst; })[0];
      if(!ref){ ref=doc.createElementNS(ns, "ComObjectInstanceRef"); ref.setAttribute("RefId", inst); boite.appendChild(ref); }
      /* les liaisons déjà faites dans ETS restent en tête */
      var liste=(ref.getAttribute("Links")||"").split(/\s+/).filter(Boolean);
      aLier[inst].forEach(function(g){ if(liste.indexOf(g)<0) liste.push(g); });
      ref.setAttribute("Links", liste.join(" "));
    });
  });
  var texte=(P.bom ? "﻿" : "") + P.entete + "\r\n" + new XMLSerializer().serializeToString(doc.documentElement);
  var zip=P.zip;
  return jszip().then(function(JSZip){
    var sortie=new JSZip();
    var noms=Object.keys(zip.files);
    return Promise.all(noms.map(function(n){
      var f=zip.files[n];
      if(f.dir){ sortie.folder(n); return null; }
      if(n===P.fichier){ sortie.file(n, texte); return null; }
      if(o.sansSignature && (n===P.id + ".signature" || n===P.id + ".certificate" || n===".validation")) return null;
      return f.async("uint8array").then(function(b){ sortie.file(n, b, {date:f.date}); });
    })).then(function(){
      return sortie.generateAsync({type:"blob", compression:"DEFLATE", mimeType:"application/octet-stream"});
    });
  });
}
function csv(P){
  var r=calculer(P);
  var L=["Adresse de groupe;Nom de l'adresse;Participant;Nom du participant;Objet;Nom de l'objet"];
  r.liens.forEach(function(l){
    L.push([l.ga.adr, l.ga.nom, l.app.adresse, l.app.nom, l.num, l.objet].map(function(v){
      v=String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
    }).join(";"));
  });
  return "﻿" + L.join("\r\n") + "\r\n";
}

window.KnxLiaisons = {lire:lire, AZ:AZ};
})();
