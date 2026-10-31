/* =====================================================================
   pdf-design.js — la mise en page des PDF, aux couleurs du site
   ---------------------------------------------------------------------
   Commune au suivi de chantier, au reportage photo et à la commande :
   - la couverture : un bandeau bleu nuit en dégradé, le logo dans une
     carte blanche, le genre du document en petites capitales cyan, le
     client en grand titre, la date et la référence dessous ; la société
     à droite ;
   - les pages suivantes : un bandeau fin, le document et le client ;
   - le pied de page : la société, « Page 2 / 5 » dans une pastille ;
   - des tuiles (client, adresse…), des chiffres clés, des sections
     numérotées, des pastilles, des cases à cocher, un encadré, l'en-tête
     d'un tableau, une image dans son cadre.
   Les titres sont en Outfit (la police des PDF du site) quand elle est
   chargée, en Helvetica sinon.

   PdfDesign.kit(doc, {M, PW, PH, genre, titre, sousTitre, pastilles, entete,
                       P:{logo, societe, lignes:[…], legal}})
   ===================================================================== */
(function(){
  "use strict";
  if(window.PdfDesign) return;

  /* ---------- les polices, chargées une fois par page ---------- */
  var POLICES = {};
  (function(){
    if(!(location.protocol==="http:" || location.protocol==="https:")) return;
    [["titre","./polices/outfit-400.ttf"],["titreGras","./polices/outfit-700.ttf"]].forEach(function(p){
      try{
        fetch(p[1]).then(function(r){ return r.ok ? r.arrayBuffer() : null; }).then(function(b){
          if(!b || b.byteLength < 1000) return;
          var u=new Uint8Array(b), s="";
          for(var i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null, u.subarray(i, i+0x8000));
          POLICES[p[0]]=btoa(s);
        }).catch(function(){});
      }catch(e){}
    });
  })();

  /* ---------- la palette D ---------- */
  var C = {
    NUIT:[11,18,32], NUIT2:[23,37,84], NUIT3:[30,58,138],
    BLEU:[37,99,235], BLEU_F:[29,78,216], CYAN:[6,182,212], CYAN_V:[34,211,238],
    BLEU_C:[234,241,255], BLEU_CC:[244,247,255],
    ENCRE:[15,23,42], GRIS:[91,100,117], GRIS2:[138,147,163], TRAIT:[226,232,240], FOND:[244,246,251],
    OK:[22,163,74], OK_C:[220,252,231], ROUGE:[220,38,38], ROUGE_C:[254,226,226],
    AMBRE:[217,119,6], AMBRE_C:[254,243,199], BLANC:[255,255,255], BRUME:[169,182,204]
  };

  function kit(doc, o){
    var M=o.M, PW=o.PW, PH=o.PH, CW=PW-2*M, P=o.P||{};
    var BAS = PH-20;                       /* dernière ligne utile, au-dessus du pied */

    /* les polices du document */
    var FT="helvetica";
    try{
      if(POLICES.titre && POLICES.titreGras && doc.addFileToVFS){
        doc.addFileToVFS("outfit-400.ttf", POLICES.titre); doc.addFont("outfit-400.ttf", "Outfit", "normal");
        doc.addFileToVFS("outfit-700.ttf", POLICES.titreGras); doc.addFont("outfit-700.ttf", "Outfit", "bold");
        FT="Outfit";
      }
    }catch(e){ FT="helvetica"; }
    function titre(gras){ try{ doc.setFont(FT, gras===false ? "normal" : "bold"); }catch(e){ doc.setFont("helvetica", gras===false ? "normal" : "bold"); } }
    function texte(gras){ doc.setFont("helvetica", gras ? "bold" : "normal"); }

    function fill(c){ doc.setFillColor(c[0],c[1],c[2]); }
    function ink(c){ doc.setTextColor(c[0],c[1],c[2]); }
    function draw(c){ doc.setDrawColor(c[0],c[1],c[2]); }
    function opacite(v){ try{ if(doc.GState && doc.setGState) doc.setGState(new doc.GState({opacity:v})); }catch(e){} }
    function espace(v){ try{ doc.setCharSpace(v); }catch(e){} }
    /* un texte espacé (petites capitales) : le PDF n'en tient pas compte pour centrer ou aligner à droite */
    function largeurEspacee(t, cs){ return doc.getTextWidth(t)+cs*t.length; }
    function texteEspace(t, x, y, cs, align){
      t=String(t); var w=largeurEspacee(t, cs);
      var x0 = align==="right" ? x-w : align==="center" ? x-w/2 : x;
      espace(cs); doc.text(t, x0, y); espace(0);
      return w;
    }
    function melange(a, b, t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

    /* un dégradé horizontal, en fines bandes (le PDF de base n'en a pas) ; 2 ou 3 couleurs */
    function degrade(x, y, w, h, c1, c2, c3){
      var n=Math.max(12, Math.min(140, Math.round(w*1.4))), pas=w/n;
      for(var i=0;i<n;i++){
        var t=i/(n-1), c = c3 ? (t<.5 ? melange(c1, c2, t*2) : melange(c2, c3, (t-.5)*2)) : melange(c1, c2, t);
        fill(c); doc.rect(x+i*pas, y, pas+0.08, h, "F");
      }
    }
    /* une pastille arrondie, posée sur la ligne de base y ; renvoie sa largeur */
    function pastille(x, y, t, fond, coul, opts){
      opts=opts||{};
      var taille=opts.taille||7.6, h=opts.h||5.4;
      texte(true); doc.setFontSize(taille);
      var tt = opts.capitales ? String(t).toUpperCase() : String(t), cs = opts.capitales ? 0.3 : 0;
      var w=largeurEspacee(tt, cs)+(opts.pad||5);
      var x0 = opts.droite ? x-w : x;
      fill(fond); doc.roundedRect(x0, y-h+1.5, w, h, h/2, h/2, "F");
      ink(coul); texteEspace(tt, x0+w/2, y-h/2+1.5+taille*0.125, cs, "center");
      return w;
    }
    /* une pastille sur le bandeau : un fond blanc translucide, le texte blanc par-dessus */
    function pastilleVerre(x, y, t){
      texte(true); doc.setFontSize(7.2);
      var w=doc.getTextWidth(String(t))+5, h=5.4;
      opacite(0.16); fill(C.BLANC); doc.roundedRect(x, y-h+1.5, w, h, h/2, h/2, "F"); opacite(1);
      ink(C.BLANC); doc.text(String(t), x+w/2, y-h/2+1.5+0.9, {align:"center"});
      return w;
    }
    /* une case à cocher dessinée (les polices de base n'ont pas de ☐) */
    function caseCoche(x, y, cochee, coul){
      coul=coul||C.BLEU;
      doc.setLineWidth(0.35);
      if(cochee){
        fill(coul); doc.roundedRect(x, y-3.4, 4, 4, 1, 1, "F");
        doc.setDrawColor(255,255,255); doc.setLineWidth(0.55);
        doc.line(x+0.9, y-1.5, x+1.75, y-0.6); doc.line(x+1.75, y-0.6, x+3.2, y-2.5);
      } else { draw(C.GRIS2); doc.roundedRect(x, y-3.4, 4, 4, 1, 1, "S"); }
    }

    /* ---------- la couverture ---------- */
    function couverture(){
      var H=52;
      degrade(0, 0, PW, H, C.NUIT, C.NUIT2, C.NUIT3);
      /* deux grands cercles très pâles, pour le relief */
      opacite(0.07); fill(C.CYAN_V); doc.circle(PW-22, 6, 34, "F"); fill(C.BLEU); doc.circle(PW-58, H+8, 26, "F"); opacite(1);
      /* le bas du bandeau redevient net (le second cercle déborde) */
      fill(C.BLANC); doc.rect(0, H+1.3, PW, 40, "F");
      degrade(0, H, PW, 1.3, C.BLEU, C.CYAN);
      /* le logo, dans une carte blanche */
      var L=P.logo, tx=M;
      if(L && L.data){
        var lh=17, lw=lh*(L.w/L.h);
        if(lw>42){ lw=42; lh=lw*(L.h/L.w); }
        fill(C.BLANC); doc.roundedRect(M, 12, lw+7, lh+7, 3, 3, "F");
        try{ doc.addImage(L.data, /^data:image\/png/i.test(L.data) ? "PNG" : "JPEG", M+3.5, 15.5, lw, lh); }catch(e){}
        tx=M+lw+14;
      }
      /* la société, à droite */
      var droite=PW-M, largSoc=0;
      if(P.societe){
        texte(true); doc.setFontSize(9); ink(C.BLANC);
        doc.text(String(P.societe), droite, 15, {align:"right"});
        largSoc=doc.getTextWidth(String(P.societe));
        texte(false); doc.setFontSize(7.6); ink(C.BRUME);
        var ly=19.6;
        (P.lignes||[]).forEach(function(t){ if(t){ doc.text(String(t), droite, ly, {align:"right"}); largSoc=Math.max(largSoc, doc.getTextWidth(String(t))); ly+=3.9; } });
      }
      var largTitre = Math.max(60, droite - tx - Math.min(62, largSoc) - 6);
      /* le genre du document, le titre, la ligne de dessous */
      texte(true); doc.setFontSize(7.4); ink(C.CYAN_V); espace(0.9);
      doc.text(String(o.genre||"").toUpperCase(), tx, 17.5); espace(0);
      titre(true); doc.setFontSize(21); ink(C.BLANC);
      var lt=doc.splitTextToSize(String(o.titre||""), largTitre).slice(0,2);
      doc.text(lt, tx, 26.5);
      var ys=26.5+(lt.length-1)*8+7;
      if(o.sousTitre){
        texte(false); doc.setFontSize(9); ink(C.BRUME);
        doc.text(doc.splitTextToSize(String(o.sousTitre), largTitre)[0], tx, ys);
      }
      /* les pastilles (date, référence…) */
      if(o.pastilles && o.pastilles.length){
        var px=tx, py=Math.min(H-5, ys+7.5);
        o.pastilles.forEach(function(t){ if(t) px+=pastilleVerre(px, py, t)+2.5; });
      }
      ink(C.ENCRE);
      return H+10;
    }

    /* ---------- les pages suivantes ---------- */
    function enteteSuite(){
      degrade(0, 0, PW, 13, C.NUIT, C.NUIT2, C.NUIT3);
      degrade(0, 13, PW, 0.7, C.BLEU, C.CYAN);
      var genre=String(o.genre||"").toUpperCase();
      texte(true); doc.setFontSize(6.8); ink(C.CYAN_V); espace(0.7);
      doc.text(genre, M, 8.2); espace(0);
      var lg=doc.getTextWidth(genre)+genre.length*0.7;
      titre(true); doc.setFontSize(9.5); ink(C.BLANC);
      doc.text(doc.splitTextToSize(String(o.titre||""), Math.max(30, CW-lg-50))[0], M+lg+4, 8.4);
      texte(false); doc.setFontSize(7.8); ink(C.BRUME);
      if(o.entete) doc.text(String(o.entete), PW-M, 8.4, {align:"right"});
      ink(C.ENCRE);
      return 23;
    }

    /* ---------- le pied, posé sur toutes les pages à la fin ---------- */
    function pieds(){
      var n=doc.internal.getNumberOfPages();
      for(var i=1;i<=n;i++){
        doc.setPage(i);
        fill(C.TRAIT); doc.rect(M, PH-14.2, CW, 0.3, "F");
        texte(false); doc.setFontSize(7.2); ink(C.GRIS);
        doc.text([P.societe||"", P.legal||""].filter(Boolean).join("   ·   ").slice(0,95), M, PH-9.6);
        pastille(PW-M, PH-8.3, "Page "+i+" / "+n, C.BLEU_C, C.BLEU, {droite:true, taille:7});
        doc.setFontSize(6.2); ink(C.GRIS2); texte(false);
        doc.text("Suivi travaux 360  —  © 2026 Johan Klughertz. Tous droits réservés", PW/2, PH-4.6, {align:"center"});
      }
      ink(C.ENCRE);
    }

    /* ---------- une section numérotée ---------- */
    function section(y, num, t){
      var x=M;
      fill(C.BLEU); doc.roundedRect(x, y-5.2, 7.2, 7.2, 1.8, 1.8, "F");
      fill(C.CYAN); doc.roundedRect(x+4.6, y-5.2, 2.6, 2.6, 1.2, 1.2, "F");
      titre(true); doc.setFontSize(9.5); ink(C.BLANC);
      doc.text(String(num), x+3.6, y+0.3, {align:"center"});
      titre(true); doc.setFontSize(13.5); ink(C.ENCRE);
      doc.text(String(t), x+11, y+0.6);
      var fin=x+11+doc.getTextWidth(String(t))+4;
      if(fin < PW-M){ fill(C.TRAIT); doc.rect(fin, y-1.6, PW-M-fin, 0.3, "F"); }
      texte(false);
      return y+9;
    }

    /* ---------- des tuiles : [libellé, valeur, pleineLargeur?] ---------- */
    function tuiles(y, items, colonnes){
      items=items.filter(function(it){ return it && it[1]!=null && String(it[1]).trim()!==""; });
      if(!items.length) return y;
      colonnes=colonnes||3;
      var gap=3, lc=(CW-gap*(colonnes-1))/colonnes, ligne=[], lignesT=[], used=0;
      items.forEach(function(it){
        var span = it[2] ? colonnes : 1;
        if(used+span>colonnes){ lignesT.push(ligne); ligne=[]; used=0; }
        ligne.push({it:it, span:span}); used+=span;
      });
      if(ligne.length) lignesT.push(ligne);
      lignesT.forEach(function(l){
        var hMax=0, prep=[];
        l.forEach(function(c){
          var w=c.span*lc+(c.span-1)*gap;
          texte(true); doc.setFontSize(9.6);
          var vl=doc.splitTextToSize(String(c.it[1]), w-8).slice(0,4);
          hMax=Math.max(hMax, 10.5+vl.length*4.3); prep.push({w:w, vl:vl, lib:c.it[0]});
        });
        var x=M;
        prep.forEach(function(p){
          fill(C.FOND); doc.roundedRect(x, y, p.w, hMax, 2.4, 2.4, "F");
          /* un libellé trop long rétrécit pour tenir dans sa tuile */
          var lib=String(p.lib).toUpperCase(), tl=6.4, cs=0.45;
          texte(true); doc.setFontSize(tl);
          while(largeurEspacee(lib, cs) > p.w-8 && tl>4.6){ tl-=0.2; cs=Math.max(0.15, cs-0.04); doc.setFontSize(tl); }
          ink(C.GRIS2); texteEspace(lib, x+4, y+5.4, cs);
          texte(true); doc.setFontSize(9.6); ink(C.ENCRE);
          doc.text(p.vl, x+4, y+10.6);
          x+=p.w+gap;
        });
        y+=hMax+gap;
      });
      ink(C.ENCRE);
      return y+2;
    }

    /* ---------- les chiffres clés : [nombre, libellé, couleur] ---------- */
    function chiffres(y, items){
      items=items.filter(Boolean);
      if(!items.length) return y;
      var gap=3, n=items.length, w=(CW-gap*(n-1))/n, h=19;
      items.forEach(function(it, i){
        var x=M+i*(w+gap), c=it[2]||C.BLEU;
        fill(C.BLANC); draw(C.TRAIT); doc.setLineWidth(0.3); doc.roundedRect(x, y, w, h, 2.4, 2.4, "FD");
        fill(c); doc.roundedRect(x+4, y+3.6, 7, 1.3, 0.65, 0.65, "F");
        titre(true); doc.setFontSize(String(it[0]).length>4 ? 12 : 17); ink(c);
        doc.text(String(it[0]), x+4, y+12.2);
        texte(false); doc.setFontSize(7.4); ink(C.GRIS);
        doc.text(doc.splitTextToSize(String(it[1]), w-8)[0], x+4, y+16.4);
      });
      ink(C.ENCRE);
      return y+h+7;
    }

    /* ---------- un encadré : un titre et un texte (déjà coupé en lignes de CW-12) ---------- */
    function encadreHaut(lignesTxt, avecTitre){ return lignesTxt.length*5+(avecTitre ? 13 : 8); }
    function encadre(y, t, lignesTxt){
      var h=encadreHaut(lignesTxt, !!t);
      fill(C.BLEU_C); doc.roundedRect(M, y, CW, h, 2.4, 2.4, "F");
      degrade(M, y+2, 1.4, h-4, C.BLEU, C.CYAN);
      var yy=y+6.2;
      if(t){ texte(true); doc.setFontSize(7); ink(C.BLEU); espace(0.5); doc.text(String(t).toUpperCase(), M+6, yy); espace(0); yy+=5.6; }
      texte(false); doc.setFontSize(10); ink(C.ENCRE);
      doc.text(lignesTxt, M+6, yy);
      return y+h+5;
    }

    /* ---------- l'en-tête d'un tableau : [[libellé, x, align?]…] ---------- */
    function enteteTableau(y, colonnes){
      fill(C.NUIT); doc.roundedRect(M, y, CW, 7.4, 1.8, 1.8, "F");
      texte(true); doc.setFontSize(6.8); ink(C.BLANC);
      colonnes.forEach(function(c){ texteEspace(String(c[0]).toUpperCase(), c[1], y+4.8, 0.45, c[2]); });
      ink(C.ENCRE);
      return y+11.6;
    }

    /* une image dans un cadre : un fond pâle autour, une fine bordure */
    function cadreImage(data, x, y, w, h, fmt){
      fill(C.FOND); doc.roundedRect(x-1.6, y-1.6, w+3.2, h+3.2, 2.2, 2.2, "F");
      try{ doc.addImage(data, fmt || (/^data:image\/png/i.test(String(data||"")) ? "PNG" : "JPEG"), x, y, w, h); }catch(e){}
      draw(C.TRAIT); doc.setLineWidth(0.25); doc.rect(x, y, w, h, "S");
    }

    return {C:C, M:M, PW:PW, PH:PH, CW:CW, BAS:BAS,
      titre:titre, texte:texte, fill:fill, ink:ink, draw:draw, opacite:opacite, espace:espace,
      degrade:degrade, pastille:pastille, caseCoche:caseCoche,
      couverture:couverture, enteteSuite:enteteSuite, pieds:pieds, section:section, tuiles:tuiles,
      chiffres:chiffres, encadre:encadre, encadreHaut:encadreHaut, enteteTableau:enteteTableau, cadreImage:cadreImage};
  }

  window.PdfDesign = {kit:kit, couleurs:C};
})();
