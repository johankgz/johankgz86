/* La fiche de liaisons : quelle adresse de groupe va sur quel objet de
   quel participant, à suivre dans ETS (ETS 6 refuse un projet modifié hors
   d'ETS, les liaisons s'y font donc à la main).

   Participant connu : la passerelle Airzone (AZX6KNXGTWAY). Ses objets ne
   bougent jamais : le système de 0 à 22, puis 16 objets par zone à partir
   de 23. Il suffit donc de son adresse physique et de ses zones, déjà
   saisies dans l'outil.

   KnxLiaisons.calculer(gas, appareils) → {liens, alertes}
     gas        [{adr:"8/1/4", brut, nom}]   les adresses de l'outil
     appareils  [{adresse:"1.1.60", nom, systeme, zones:{2:{thermostat:true}}}]
   KnxLiaisons.fiche(gas, appareils, titre) → page HTML à imprimer
   KnxLiaisons.csv(gas, appareils)          → tableau, un objet par ligne */
(function(){
"use strict";

/* ---------- les objets de la passerelle Airzone ---------- */
var SYS = ["System Error", "System Operation Mode Status", "System Operation Mode", "System Stop Mode Status",
  "System Stop Mode", "System Cool Mode Status", "System Cool Mode", "System Heat Mode Status", "System Heat Mode",
  "System Fan Mode Status", "System Fan Mode", "System Dry Mode Status", "System Dry Mode", "System Fan Speed Status",
  "System Fan Speed", "System Date Status", "System Date", "System Time Status", "System Time",
  "System Cool Demand Status", "System Heat Demand Status", "System Air Demand Status", "System Ground Demand Status"];
var ZN = ["Error", "On/Off Status", "On/Off Control", "Temperature Setpoint Status", "Temperature Setpoint Control",
  "Relative Moisture Status", "Local Temperature Status", "Local Temperature Control", "Fancoil Speed Status",
  "Fancoil Speed Control", "Operation Mode Status", "Operation Mode Control", "Heat Stages Status",
  "Heat Stages Control", "Cool Stages Status", "Cool Stages Control"];
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
function nomObjet(num){
  if(num<23) return SYS[num];
  var z=Math.floor((num-23)/16)+1;
  return "Zone" + ("0"+z).slice(-2) + " " + ZN[(num-23)%16];
}
/* les objets présents : le système, et pour chaque zone ses objets, avec
   l'humidité si elle a un thermostat Airzone, la température envoyée sinon */
function objetsDe(a){
  var o={};
  for(var n=0;n<23;n++) o[n]=true;
  Object.keys(a.zones).forEach(function(z){
    for(var d=0;d<16;d++){
      if(d===5 && !a.zones[z].thermostat) continue;
      if(d===7 && a.zones[z].thermostat) continue;
      o[AZ.zone(+z, d)]=true;
    }
  });
  return o;
}
function estStatut(nom){ return /status|statut/i.test(nom); }

/* ---------- qui va où ---------- */
function calculer(gas, appareils){
  var liens=[], alertes=[], vus={};
  appareils.forEach(function(a){ a.objets=objetsDe(a); });
  function lien(ga, a, num, raison){
    if(!a.objets[num]){ if(raison) alertes.push(ga.adr + " « " + ga.nom + " » : " + raison); return; }
    var k=ga.adr + "|" + a.adresse + "|" + num;
    if(vus[k]) return; vus[k]=1;
    liens.push({ga:ga, app:a, num:num, objet:nomObjet(num)});
  }
  function parSysteme(n){ return appareils.filter(function(a){ return a.systeme===n; }); }
  gas.forEach(function(ga){
    var nom=ga.nom, m;
    /* une zone : System01 - Zone02 - … - fonction */
    if((m=/^System\s*0*(\d+)\s*-\s*Zone\s*0*(\d+)\b.*-\s*([A-Za-z/ ]+?)\s*$/i.exec(nom))){
      var dec=AZ.ZONE[m[3].toLowerCase().replace(/\s+/g," ")];
      if(dec===undefined) return;
      var z=parseInt(m[2], 10);
      parSysteme(parseInt(m[1], 10)).forEach(function(a){
        lien(ga, a, AZ.zone(z, dec), a.zones[z] ? "" : "la zone " + z + " n'est pas déclarée sur " + a.adresse);
      });
      return;
    }
    /* les étages chaud et froid d'un système : toutes ses zones */
    if((m=/^System\s*0*(\d+)\s*-\s*(Heat|Cool) Stages (Control|Status)$/i.exec(nom))){
      var cle=(m[2]+" stages "+m[3]).toLowerCase();
      parSysteme(parseInt(m[1], 10)).forEach(function(a){
        var zs=Object.keys(a.zones).map(Number);
        if(estStatut(nom)) zs=zs.slice(0, 1);          /* un seul objet émet sur une adresse d'état */
        zs.forEach(function(z){ lien(ga, a, AZ.zone(z, AZ.ETAGES[cle])); });
      });
      return;
    }
    /* le système lui-même */
    if((m=/^System\s*0*(\d+)\s*-\s*(.+?)\s*$/i.exec(nom))){
      var num=AZ.SYSTEME[m[2].toLowerCase()];
      if(num===undefined) return;
      parSysteme(parseInt(m[1], 10)).forEach(function(a){ lien(ga, a, num); });
      return;
    }
    /* le groupe commun (16 « VRV ») : les commandes vont à toutes les
       passerelles, les états viennent de la première */
    if((ga.brut>>11)===16 && appareils.length){
      var n=nom.toLowerCase().replace(/\s+/g," "), cibles=null;
      if(AZ.MODES[n]!==undefined) cibles=function(){ return [AZ.MODES[n]]; };
      else if(/^(heat|cool) stages control$/.test(n)) cibles=function(a){ return Object.keys(a.zones).map(function(z){ return AZ.zone(+z, AZ.ETAGES[n]); }); };
      else if(n==="temperature general") cibles=function(a){ return Object.keys(a.zones).map(function(z){ return AZ.zone(+z, 4); }); };
      else if(n==="on/off general") cibles=function(a){ return Object.keys(a.zones).map(function(z){ return AZ.zone(+z, 2); }); };
      if(!cibles) return;
      (estStatut(nom) ? appareils.slice(0, 1) : appareils).forEach(function(a){
        cibles(a).forEach(function(num){ lien(ga, a, num); });
      });
    }
  });
  return {liens:liens, alertes:alertes};
}

/* ---------- la fiche : objet par objet, dans l'ordre d'ETS ---------- */
function parObjet(gas, appareils){
  var r=calculer(gas, appareils), out=[];
  appareils.forEach(function(a){
    var objs={};
    r.liens.forEach(function(l){
      if(l.app!==a) return;
      (objs[l.num]=objs[l.num]||{num:l.num, objet:l.objet, gas:[]}).gas.push(l.ga);
    });
    out.push({app:a, objets:Object.keys(objs).map(function(k){ return objs[k]; }).sort(function(x, y){ return x.num-y.num; })});
  });
  return out;
}
function esc(t){ return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fiche(gas, appareils, titre){
  var h=['<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de liaisons KNX</title><style>',
    'body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22201C;margin:24px;font-size:12.5px}',
    'h1{font-size:18px;margin:0 0 4px}h2{font-size:14.5px;margin:22px 0 6px}p{margin:0 0 10px;color:#6E675C}',
    '.param{background:#F4F1EA;border-radius:8px;padding:8px 12px;margin:0 0 10px;color:#22201C}',
    'table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #E2DCCE;padding:5px 6px;text-align:left;vertical-align:top}',
    'th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6E675C}td.n{font-weight:700;width:36px}',
    'td.a{font-family:Menlo,Consolas,monospace;white-space:nowrap}.e{font-weight:700}.c{color:#8C8475}',
    'td.v{width:22px}td.v span{display:inline-block;width:14px;height:14px;border:1.5px solid #8C8475;border-radius:3px}',
    '@media print{body{margin:10mm}h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>',
    '<h1>Fiche de liaisons KNX' + (titre ? ' — ' + esc(titre) : '') + '</h1>',
    '<p>Dans ETS, pour chaque objet : clic droit › Lier à… (ou glisser l\'adresse sur l\'objet). La première adresse, en gras, est celle sur laquelle l\'objet émet : liez-la en premier. Un objet absent dans ETS est masqué par un paramètre de la passerelle (le défaut de zone, par exemple) : activez-le ou passez la ligne.</p>'];
  parObjet(gas, appareils).forEach(function(b){
    var a=b.app, zs=Object.keys(a.zones).map(Number).sort(function(x, y){ return x-y; });
    var avec=zs.filter(function(z){ return a.zones[z].thermostat; }), sans=zs.filter(function(z){ return !a.zones[z].thermostat; });
    h.push('<h2>' + esc(a.adresse) + ' — ' + esc(a.nom) + '</h2>');
    h.push('<div class="param"><b>Paramètres de la passerelle</b> : zones activées ' + (zs.join(", ") || "aucune")
      + ' · thermostat Airzone : ' + (avec.join(", ") || "aucun")
      + (sans.length ? ' · sans thermostat (température envoyée par KNX) : ' + sans.join(", ") : '') + '</div>');
    if(!b.objets.length){ h.push('<p>Aucune liaison.</p>'); return; }
    h.push('<table><tr><th></th><th>Objet</th><th>Nom de l\'objet</th><th>Adresses</th><th>Nom des adresses</th></tr>');
    b.objets.forEach(function(o){
      h.push('<tr><td class="v"><span></span></td><td class="n">' + o.num + '</td><td>' + esc(o.objet) + '</td><td class="a">'
        + o.gas.map(function(g, i){ return '<div class="' + (i ? "c" : "e") + '">' + esc(g.adr) + '</div>'; }).join("")
        + '</td><td>' + o.gas.map(function(g){ return '<div>' + esc(g.nom) + '</div>'; }).join("") + '</td></tr>');
    });
    h.push('</table>');
  });
  h.push('</body></html>');
  return h.join("");
}
function csv(gas, appareils){
  var L=["Participant;Nom du participant;Objet;Nom de l'objet;Adresse de groupe;Nom de l'adresse;Rôle"];
  parObjet(gas, appareils).forEach(function(b){
    b.objets.forEach(function(o){
      o.gas.forEach(function(g, i){
        L.push([b.app.adresse, b.app.nom, o.num, o.objet, g.adr, g.nom, i ? "écoute" : "émet"].map(function(v){
          v=String(v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g,'""') + '"' : v;
        }).join(";"));
      });
    });
  });
  return "﻿" + L.join("\r\n") + "\r\n";
}

window.KnxLiaisons = {calculer:calculer, fiche:fiche, csv:csv, nomObjet:nomObjet, AZ:AZ};
})();
