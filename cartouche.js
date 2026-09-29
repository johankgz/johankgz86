/* =====================================================================
   cartouche.js — le cartouche de nos documents dessinés
   ---------------------------------------------------------------------
   Un bandeau sur toute la largeur, en bas de la page : logo,
   dessinateur (mail, date, indice), affaire, objet, folio, remarques,
   et la mention soulignée au-dessus. Le schéma unifilaire et le plan
   DWG l'utilisent tous les deux : c'est le même dessin, au même
   rapport, quelle que soit la page.

   Il dessine dans une « trace » (liste d'ordres : trait, rectangle,
   texte, image), dans l'unité du schéma : une page A3 paysage fait
   1400 × 990. versPDF() pose une trace dans un PDF jsPDF, à l'échelle
   et à l'endroit voulus.
   ===================================================================== */
(function(){
  var MENTION_DEFAUT = "Synoptique donné à titre indicatif, à des fins d'usage interne, pour évaluation approximative, ne pouvant servir à d'autres fins";
  var ROUGE = "#B42318";
  /* les largeurs des cases, de gauche à droite (la dernière, les remarques, prend le reste) */
  var CASES = [232, 250, 226, 246, 128];
  var HAUT = 86;        /* la hauteur du bandeau */

  function Trace(){ this.o=[]; }
  Trace.prototype.l=function(x1,y1,x2,y2,w,dash,c){ this.o.push({t:"l",x1:x1,y1:y1,x2:x2,y2:y2,w:w||1.5,dash:dash||null,c:c||null}); };
  Trace.prototype.r=function(x,y,w,h,opt){ opt=opt||{}; this.o.push({t:"r",x:x,y:y,w:w,h:h,sw:opt.sw||1.4,dash:opt.dash||null,fill:opt.fill||null,c:opt.c||null}); };
  Trace.prototype.t=function(x,y,s,size,opt){ opt=opt||{}; if(s==null||s==="") return;
    this.o.push({t:"t",x:x,y:y,s:String(s),size:size||11,anchor:opt.anchor||"start",bold:!!opt.bold,gris:!!opt.gris,c:opt.c||null,u:!!opt.u}); };
  Trace.prototype.img=function(data,x,y,w,h,iw,ih){
    if(!data) return;
    var r=Math.min(w/(iw||w), h/(ih||h)), ww=(iw||w)*r, hh=(ih||h)*r;
    this.o.push({t:"i",data:data,x:x+(w-ww)/2,y:y+(h-hh)/2,w:ww,h:hh});
  };

  function frDate(d){ if(!d) return ""; var a=String(d).slice(0,10).split("-"); return a.length===3 ? a[2]+"/"+a[1]+"/"+a[0] : String(d); }
  /* un texte en lignes d'une longueur donnée, sur les mots (et sur les retours à la ligne) */
  function decouper(s, n){
    var out=[];
    String(s||"").split(/\n|\|/).forEach(function(par){
      var ligne="";
      par.split(/\s+/).forEach(function(m){
        if(!m) return;
        if((ligne+" "+m).trim().length>n && ligne){ out.push(ligne); ligne=m; }
        else ligne=(ligne+" "+m).trim();
      });
      if(ligne) out.push(ligne);
    });
    return out;
  }
  /* le logo : celui de la fiche société (sinon, le nom de la société en toutes lettres) */
  function choisirLogo(societe, logoFiche){
    return logoFiche ? {img:logoFiche, noir:false} : null;
  }

  /* S : {societe, auteur, mail, date (AAAA-MM-JJ), indice, remarques, mention,
          affaire:[lignes], objet:[lignes], folio, total}
     o : {x0, y1 (bas du bandeau), x1, logo:{img:{data,w,h}, noir}} dans l'unité du schéma */
  function dessiner(T, S, o){
    var x0=o.x0, x1=o.x1, y1=o.y1, y0=y1-HAUT, h=HAUT;
    var xs=[x0];
    CASES.forEach(function(w){ xs.push(xs[xs.length-1]+w); });
    var mention = S.mention==null ? MENTION_DEFAUT : String(S.mention);
    if(mention.trim()) T.t(x1-4, y0-8, mention.trim(), 10.5, {anchor:"end", u:true});
    T.r(x0,y0,x1-x0,h,{sw:1.2,fill:"#fff"});
    xs.slice(1).forEach(function(x){ T.l(x,y0,x,y1,1); });
    /* le logo */
    var lg=o.logo, L=CASES;
    if(lg && lg.noir){ T.r(xs[0]+5,y0+5,L[0]-10,h-10,{sw:1,fill:"#000000",c:"#000000"}); T.img(lg.img.data, xs[0]+10,y0+9,L[0]-20,h-18, lg.img.w, lg.img.h); }
    else if(lg) T.img(lg.img.data, xs[0]+8,y0+8,L[0]-16,h-16, lg.img.w, lg.img.h);
    else decouper(String(S.societe||"").toUpperCase(), 22).slice(0,3).forEach(function(m,i){ T.t(xs[0]+L[0]/2, y0+h/2+4+(i-0.5)*15, m, 12, {anchor:"middle", bold:true}); });
    /* le dessinateur */
    var xd=xs[1]+8;
    T.t(xd,y0+19,"Dess :",10.5,{bold:true}); T.t(xd+38,y0+19,S.auteur||"",10.5);
    T.t(xd,y0+38,"Mail :",10.5,{bold:true}); T.t(xd,y0+53,S.mail||"",10);
    T.t(xd,y0+75,"Date :",10.5,{bold:true}); T.t(xd+38,y0+75,frDate(S.date),10.5);
    T.t(xd+118,y0+75,"Indice :",10.5,{bold:true}); T.t(xd+164,y0+75,S.indice||"A",10.5);
    /* affaire, objet */
    function case2(k, etiquette, lignes){
      var x=xs[k], w=L[k]; T.t(x+8,y0+19,etiquette,10.5,{bold:true});
      var tout=[]; lignes.forEach(function(l){ decouper(l.s, Math.floor(w/7)).forEach(function(m){ tout.push({s:m, b:l.b}); }); });
      tout=tout.slice(0,3);
      var yc=y0+(h+22)/2-(tout.length-1)*7.5+4;
      tout.forEach(function(m,i){ T.t(x+w/2, yc+i*15, m.s, 11, {anchor:"middle", bold:m.b}); });
    }
    case2(2, "AFFAIRE", (S.affaire||[]).filter(Boolean).map(function(s){ return {s:s}; }));
    case2(3, "OBJET", (S.objet||[]).filter(Boolean).map(function(s){ return {s:s}; }));
    /* folio */
    T.t(xs[4]+8,y0+19,"FOLIO",10.5,{bold:true});
    T.t(xs[4]+L[4]/2,y0+h/2+12,(S.folio||1)+"/"+(S.total||1),14,{anchor:"middle", bold:true, c:ROUGE});
    /* remarques */
    var xr=xs[5]+8, wr=x1-xs[5]-16;
    T.t(xr,y0+19,"REMARQUES",10.5,{bold:true});
    decouper(S.remarques||"", Math.floor(wr/5.6)).slice(0,4).forEach(function(m,i){ T.t(xr,y0+36+i*13,m,9.5); });
  }

  /* ---------- une trace dans un PDF : k mm par unité, décalée de (dx, dy) mm ---------- */
  function rvb(h){ h=String(h||"#111111").replace("#",""); if(h.length===3) h=h.replace(/(.)/g,"$1$1");
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
  function versPDF(doc, T, k, dx, dy){
    dx=dx||0; dy=dy||0;
    T.o.forEach(function(o){
      var cc=rvb(o.c); doc.setDrawColor(cc[0],cc[1],cc[2]);
      if(o.t==="l"){
        doc.setLineWidth(o.w*k);
        if(o.dash) doc.setLineDashPattern(o.dash.split(" ").map(function(v){ return v*k; }),0); else doc.setLineDashPattern([],0);
        doc.line(dx+o.x1*k,dy+o.y1*k,dx+o.x2*k,dy+o.y2*k);
      } else if(o.t==="r"){
        if(!o.sw && !o.fill) return;
        doc.setLineWidth((o.sw||0.01)*k); doc.setLineDashPattern([],0);
        if(o.fill){ var cf=rvb(o.fill); doc.setFillColor(cf[0],cf[1],cf[2]); doc.rect(dx+o.x*k,dy+o.y*k,o.w*k,o.h*k, o.sw?"FD":"F"); }
        else doc.rect(dx+o.x*k,dy+o.y*k,o.w*k,o.h*k,"S");
      } else if(o.t==="t"){
        doc.setFont("helvetica", o.bold?"bold":"normal");
        doc.setFontSize(o.size*k/0.3528);
        var ct=rvb(o.c||(o.gris?"#666666":"#111111")); doc.setTextColor(ct[0],ct[1],ct[2]);
        var txt=String(o.s).replace(/≥/g,">=").replace(/≤/g,"<=").replace(/[✓✗]/g,"").replace(/−/g,"-");
        doc.text(txt, dx+o.x*k, dy+o.y*k, {align: o.anchor==="middle"?"center":o.anchor==="end"?"right":"left"});
        if(o.u){
          var lg=doc.getTextWidth(txt), xs=o.anchor==="middle" ? dx+o.x*k-lg/2 : o.anchor==="end" ? dx+o.x*k-lg : dx+o.x*k;
          doc.setDrawColor(ct[0],ct[1],ct[2]); doc.setLineDashPattern([],0); doc.setLineWidth(0.25*k/0.3); doc.line(xs, dy+o.y*k+0.6*k/0.3, xs+lg, dy+o.y*k+0.6*k/0.3);
        }
      } else if(o.t==="i"){
        try{ doc.addImage(o.data, /^data:image\/jpe?g/i.test(o.data) ? "JPEG" : "PNG", dx+o.x*k, dy+o.y*k, o.w*k, o.h*k); }catch(e){}
      }
    });
    doc.setLineDashPattern([],0);
  }

  window.Cartouche = {
    Trace: Trace, dessiner: dessiner, versPDF: versPDF, choisirLogo: choisirLogo, decouper: decouper,
    MENTION_DEFAUT: MENTION_DEFAUT, HAUT: HAUT,
    /* la place prise sous le bandeau (bord) et au-dessus (mention), dans l'unité du schéma */
    MARGE_BAS: 16, MARGE_GAUCHE: 36, MARGE_DROITE: 16, MENTION: 22
  };
})();
