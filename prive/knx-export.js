/* Le téléchargement du chiffrage KNX (PDF, tableur). Ce fichier n'est jamais servi tel
   quel : le serveur ne le livre (action knx-export) qu'à l'administrateur et aux personnes
   à qui il a ouvert le téléchargement (Équipe). */
(function(){
"use strict";
var S=null; try{ S=JSON.parse(localStorage.getItem("outils:session")||"null"); }catch(e){}
function nomFichier(R, ext){
  var base=String((R.saisie.nom||"Chiffrage KNX")+(R.saisie.ref ? " "+R.saisie.ref : "")).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 _-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Chiffrage KNX";
  return "Chiffrage KNX "+R.marque+" - "+base+"."+ext;
}
function enregistrer(blob, nom){
  var a=document.createElement("a"), u=URL.createObjectURL(blob);
  a.href=u; a.download=nom; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); }, 4000);
}
function dateFr(iso){ var d=new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR"); }

/* ---------- le tableur : CSV séparé par des points-virgules, accents compris (Excel) ---------- */
function csv(R){
  function c(v){ v=String(v==null ? "" : v); return /[;"\n]/.test(v) ? '"'+v.replace(/"/g, '""')+'"' : v; }
  var l=[["Chiffrage KNX", R.saisie.nom||""], ["Référence chantier", R.saisie.ref||""], ["Marque", R.marque], ["Date", dateFr(R.date)],
    ["Établi par", (S && S.nom) || ""], [R.indicatif], [], ["Catégorie", "Désignation", "Référence", "Quantité", "À vérifier", "Option", "Note"]];
  R.lignes.forEach(function(x){ l.push([x.cat, x.nom, x.ref, x.qte, x.v ? "" : "oui", x.option ? "oui" : "", x.note]); });
  var B=R.bus;
  l.push([], ["Bus KNX"], ["Participants", B.participants], ["Consommation (10 mA par participant)", B.mA+" mA"],
    ["Lignes", B.lignes], ["Par ligne", B.parLigne+" participants, "+B.mALigne+" mA ("+B.mAReserve+" mA avec "+B.reserve+" % de réserve)"],
    ["Alimentation par ligne", B.alim.mA+" mA ("+B.alim.ref+")"]);
  if(R.alertes.length){ l.push([], ["Points d'attention"]); R.alertes.forEach(function(a){ l.push([a]); }); }
  if(R.notes.length){ l.push([], ["Notes"]); R.notes.forEach(function(a){ l.push([a]); }); }
  var texte="﻿"+l.map(function(r){ return r.map(c).join(";"); }).join("\r\n");
  enregistrer(new Blob([texte], {type:"text/csv;charset=utf-8"}), nomFichier(R, "csv"));
  return Promise.resolve();
}

/* ---------- le PDF ---------- */
function jspdf(){
  if(window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  return new Promise(function(ok, ko){
    var s=document.createElement("script"); s.src="./vendor/jspdf-2.5.1/jspdf.umd.min.js";
    s.onload=function(){ window.jspdf && window.jspdf.jsPDF ? ok(window.jspdf.jsPDF) : ko(new Error("Module PDF indisponible.")); };
    s.onerror=function(){ ko(new Error("Module PDF indisponible (connexion).")); };
    document.head.appendChild(s);
  });
}
function pdf(R){
  return jspdf().then(function(JsPDF){
    var doc=new JsPDF({unit:"mm", format:"a4"}), L=210, H=297, m=14, y=m;
    var BLEU=[37,99,235], ENCRE=[28,30,34], GRIS=[118,125,139], FILET=[207,213,225], AMBRE=[138,90,0];
    /* un texte déjà coupé en lignes (splitTextToSize) reste un tableau : jsPDF les pose l'une sous l'autre */
    function texte(t, x, yy, o){ doc.text(Array.isArray(t) ? t : String(t), x, yy, o || {}); }
    function police(taille, gras, coul){ doc.setFontSize(taille); doc.setFont("helvetica", gras ? "bold" : "normal"); doc.setTextColor.apply(doc, coul || ENCRE); }
    function place(h){ if(y + h > H - 16){ pied(); doc.addPage(); y = m; entete(true); } }
    var page=1;
    function pied(){
      police(8, false, GRIS);
      texte("Chiffrage KNX "+R.marque+" — "+(R.saisie.nom||"")+" — page "+page, m, H-8);
      texte("Références indicatives, à corriger au cas par cas.", L-m, H-8, {align:"right"});
      page++;
    }
    function entete(suite){
      doc.setFillColor.apply(doc, BLEU); doc.rect(0, 0, L, suite ? 6 : 30, "F");
      if(suite){ y = 14; return; }
      police(18, true, [255,255,255]); texte("Chiffrage KNX — "+R.marque, m, 14);
      police(10.5, false, [255,255,255]);
      texte([R.saisie.nom||"", R.saisie.ref ? "Chantier "+R.saisie.ref : ""].filter(Boolean).join("  ·  "), m, 22);
      texte(dateFr(R.date)+((S && S.nom) ? "  ·  "+S.nom : ""), L-m, 22, {align:"right"});
      y = 40;
    }
    entete(false);
    /* le bus */
    var B=R.bus, cases=[[String(B.participants), "participants KNX"], [B.mA+" mA", "consommation (10 mA chacun)"],
      [String(B.lignes), B.lignes>1 ? "lignes" : "ligne"], [B.alim.mA+" mA", "alimentation par ligne"]];
    var w=(L - 2*m - 3*4)/4;
    cases.forEach(function(c, i){
      var x=m + i*(w+4);
      doc.setDrawColor.apply(doc, FILET); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, 16, 2, 2, "S");
      police(13, true); texte(c[0], x+3, y+7);
      police(8, false, GRIS); texte(c[1], x+3, y+12.5);
    });
    y += 22;
    police(9, false, GRIS);
    doc.setLineHeightFactor(1.3);
    var ligneBus=doc.splitTextToSize("Par ligne : "+B.parLigne+" participants, "+B.mALigne+" mA, soit "+B.mAReserve+" mA avec "+B.reserve
      +" % de réserve : alimentation "+B.alim.mA+" mA ("+B.alim.ref+"). Au plus "+B.parLigneMax+" participants par ligne avec cette réserve.", L-2*m);
    texte(ligneBus, m, y); y += ligneBus.length*4.2 + 3;
    /* les références sont indicatives */
    police(9.5, true, AMBRE);
    var ind=doc.splitTextToSize(R.indicatif, L-2*m-6);
    doc.setFillColor(253,243,220); doc.rect(m, y-1, L-2*m, ind.length*4.4+3, "F");
    texte(ind, m+3, y+3); y += ind.length*4.4+6;
    /* les points d'attention */
    R.alertes.forEach(function(a){
      police(9.5, true, [160,58,51]);                /* la largeur se mesure dans la police où le texte sera écrit */
      var t=doc.splitTextToSize(a, L-2*m-6); place(t.length*4.4+5);
      doc.setFillColor(248,228,224); doc.rect(m, y-1, L-2*m, t.length*4.4+3, "F");
      police(9.5, true, [160,58,51]); texte(t, m+3, y+3); y += t.length*4.4+6;
    });
    /* le tableau */
    var cX=[m, m+122, L-m];
    function tete(){
      place(10);
      police(8, true, GRIS);
      texte("DÉSIGNATION", cX[0], y); texte("RÉFÉRENCE", cX[1], y); texte("QTÉ", cX[2], y, {align:"right"});
      y += 2; doc.setDrawColor.apply(doc, FILET); doc.line(m, y, L-m, y); y += 5;
    }
    tete();
    var cat="";
    R.lignes.forEach(function(x){
      if(x.cat!==cat){
        cat=x.cat; place(20);                        /* le titre de la catégorie ne reste pas seul en bas de page */
        doc.setFillColor(244,246,250); doc.rect(m, y-4, L-2*m, 6.5, "F");
        police(8.5, true, [93,98,109]); texte(cat.toUpperCase(), m+2, y); y += 6;
      }
      police(9.5, false); if(x.option) doc.setFont("helvetica", "italic");
      var nom=doc.splitTextToSize(x.nom+(x.v ? "" : "  (à vérifier)"), cX[1]-m-4);
      police(8, false);
      var note=x.note ? doc.splitTextToSize(x.note, cX[1]-m-4) : [];
      var h=nom.length*4.4 + note.length*3.8 + 2.5;
      place(h+2);
      police(9.5, false, x.option ? GRIS : ENCRE); if(x.option) doc.setFont("helvetica", "italic");
      texte(nom, cX[0], y);
      police(9.5, false, ENCRE); doc.setFont("courier", "normal"); texte(x.ref, cX[1], y);
      police(10, true); texte(String(x.qte), cX[2], y, {align:"right"});
      if(note.length){ police(8, false, x.v ? GRIS : AMBRE); texte(note, cX[0], y + nom.length*4.4); }
      y += h;
      doc.setDrawColor(238,241,244); doc.line(m, y-1.5, L-m, y-1.5); y += 2;
    });
    /* les notes */
    if(R.notes.length){
      y += 3; place(10); police(10, true); texte("Notes", m, y); y += 5;
      R.notes.forEach(function(n){ police(9, false, [93,98,109]); var t=doc.splitTextToSize("• "+n, L-2*m); place(t.length*4.2+1); texte(t, m, y); y += t.length*4.2+1; });
    }
    pied();
    doc.save(nomFichier(R, "pdf"));
  });
}
window.KnxExport = {pdf:pdf, csv:csv};
})();
