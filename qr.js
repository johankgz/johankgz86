/* =====================================================================
   qr.js — des QR codes, sans bibliothèque
   ---------------------------------------------------------------------
   Encodage en octets (UTF-8), correction d'erreur au choix (L, M, Q, H),
   version choisie au plus juste (1 à 40), masque retenu d'après les
   pénalités de la norme ISO/IEC 18004. Rendu sur un canvas, en SVG, ou
   en carrés vectoriels dans un PDF jsPDF.

   QR.matrice(texte, niveau)          -> {taille, sombre(x, y)}
   QR.canvas(canvas, texte, o)        o : {taille px, marge modules, niveau, couleur, fond}
   QR.svg(texte, o)                   -> chaîne <svg>
   QR.pdf(doc, texte, x, y, cote, o)  carrés noirs, cote en unités du document
   ===================================================================== */
(function(racine){
  "use strict";
  var NIVEAUX = {L: [0, 1], M: [1, 0], Q: [2, 3], H: [3, 2]};     /* rang dans les tables, bits de format */
  var ECC_BLOC = [
    [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]];
  var NB_BLOCS = [
    [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]];

  function modulesBruts(v){
    var r = (16 * v + 128) * v + 64;
    if(v >= 2){ var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if(v >= 7) r -= 36; }
    return r;
  }
  function octetsDonnees(v, rg){ return Math.floor(modulesBruts(v) / 8) - ECC_BLOC[rg][v] * NB_BLOCS[rg][v]; }

  /* ---------- Reed-Solomon sur GF(256), polynôme 0x11D ---------- */
  function mul(x, y){
    var z = 0;
    for(var i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function diviseur(deg){
    var r = []; for(var i = 0; i < deg; i++) r.push(0); r[deg - 1] = 1;
    var racineG = 1;
    for(var k = 0; k < deg; k++){
      for(var j = 0; j < r.length; j++){ r[j] = mul(r[j], racineG); if(j + 1 < r.length) r[j] ^= r[j + 1]; }
      racineG = mul(racineG, 0x02);
    }
    return r;
  }
  function reste(data, div){
    var r = div.map(function(){ return 0; });
    data.forEach(function(b){
      var f = b ^ r.shift(); r.push(0);
      for(var i = 0; i < div.length; i++) r[i] ^= mul(div[i], f);
    });
    return r;
  }

  function utf8(t){
    if(typeof TextEncoder !== "undefined") return Array.prototype.slice.call(new TextEncoder().encode(t));
    return unescape(encodeURIComponent(t)).split("").map(function(c){ return c.charCodeAt(0); });
  }

  function matrice(texte, niveau){
    var rg = (NIVEAUX[niveau] || NIVEAUX.M)[0], fmt = (NIVEAUX[niveau] || NIVEAUX.M)[1];
    var octets = utf8(String(texte));
    /* la plus petite version qui contient le texte */
    var v, cap;
    for(v = 1; v <= 40; v++){
      var bitsLong = v <= 9 ? 8 : 16;
      cap = octetsDonnees(v, rg) * 8;
      if(4 + bitsLong + octets.length * 8 <= cap) break;
    }
    if(v > 40) throw new Error("Texte trop long pour un QR code.");
    /* les bits : mode octets, longueur, données, fin, bourrage */
    var bits = [];
    function pousser(val, n){ for(var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    pousser(4, 4); pousser(octets.length, v <= 9 ? 8 : 16);
    octets.forEach(function(o){ pousser(o, 8); });
    pousser(0, Math.min(4, cap - bits.length));
    pousser(0, (8 - bits.length % 8) % 8);
    var donnees = [];
    for(var i = 0; i < bits.length; i += 8){ var b = 0; for(var j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; donnees.push(b); }
    for(var pad = 0xEC; donnees.length < cap / 8; pad ^= 0xEC ^ 0x11) donnees.push(pad);
    /* blocs et correction, entrelacés */
    var nb = NB_BLOCS[rg][v], ecc = ECC_BLOC[rg][v], brut = Math.floor(modulesBruts(v) / 8);
    var courts = nb - brut % nb, lgCourt = Math.floor(brut / nb), div = diviseur(ecc), blocs = [], k = 0;
    for(var bI = 0; bI < nb; bI++){
      var dat = donnees.slice(k, k + lgCourt - ecc + (bI < courts ? 0 : 1)); k += dat.length;
      var e = reste(dat, div);
      if(bI < courts) dat.push(0);
      blocs.push(dat.concat(e));
    }
    var mots = [];
    for(var c = 0; c < blocs[0].length; c++) for(var bb = 0; bb < blocs.length; bb++)
      if(c !== lgCourt - ecc || bb >= courts) mots.push(blocs[bb][c]);

    /* ---------- la grille ---------- */
    var n = v * 4 + 17, M = [], F = [];
    for(var y = 0; y < n; y++){ M.push([]); F.push([]); for(var x = 0; x < n; x++){ M[y].push(false); F[y].push(false); } }
    function fixe(x, y, s){ M[y][x] = s; F[y][x] = true; }
    for(var t = 0; t < n; t++){ fixe(6, t, t % 2 === 0); fixe(t, 6, t % 2 === 0); }
    function repere(cx, cy){
      for(var dy = -4; dy <= 4; dy++) for(var dx = -4; dx <= 4; dx++){
        var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = cx + dx, yy = cy + dy;
        if(xx >= 0 && xx < n && yy >= 0 && yy < n) fixe(xx, yy, d !== 2 && d !== 4);
      }
    }
    repere(3, 3); repere(n - 4, 3); repere(3, n - 4);
    if(v > 1){
      var na = Math.floor(v / 7) + 2, pas = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2, pos = [6];
      for(var p = n - 7; pos.length < na; p -= pas) pos.splice(1, 0, p);
      pos.forEach(function(ay, ia){ pos.forEach(function(ax, ib){
        if((ia === 0 && ib === 0) || (ia === 0 && ib === na - 1) || (ia === na - 1 && ib === 0)) return;
        for(var dy = -2; dy <= 2; dy++) for(var dx = -2; dx <= 2; dx++) fixe(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }); });
    }
    function format(masque){
      var d = (fmt << 3) | masque, r = d;
      for(var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bitsF = ((d << 10) | r) ^ 0x5412, g = function(i){ return ((bitsF >>> i) & 1) !== 0; };
      for(var a = 0; a <= 5; a++) fixe(8, a, g(a));
      fixe(8, 7, g(6)); fixe(8, 8, g(7)); fixe(7, 8, g(8));
      for(var b = 9; b < 15; b++) fixe(14 - b, 8, g(b));
      for(var c2 = 0; c2 < 8; c2++) fixe(n - 1 - c2, 8, g(c2));
      for(var d2 = 8; d2 < 15; d2++) fixe(8, n - 15 + d2, g(d2));
      fixe(8, n - 8, true);
    }
    format(0);
    if(v >= 7){
      var rv = v; for(var q = 0; q < 12; q++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
      var bv = (v << 12) | rv;
      for(var iv = 0; iv < 18; iv++){ var s = ((bv >>> iv) & 1) !== 0, a1 = n - 11 + iv % 3, b1 = Math.floor(iv / 3); fixe(a1, b1, s); fixe(b1, a1, s); }
    }
    /* les données, en zigzag de deux colonnes */
    var ib2 = 0;
    for(var droite = n - 1; droite >= 1; droite -= 2){
      if(droite === 6) droite = 5;
      for(var vert = 0; vert < n; vert++) for(var jj = 0; jj < 2; jj++){
        var xx2 = droite - jj, monte = ((droite + 1) & 2) === 0, yy2 = monte ? n - 1 - vert : vert;
        if(!F[yy2][xx2] && ib2 < mots.length * 8){ M[yy2][xx2] = ((mots[ib2 >>> 3] >>> (7 - (ib2 & 7))) & 1) !== 0; ib2++; }
      }
    }
    function masquer(m){
      for(var y = 0; y < n; y++) for(var x = 0; x < n; x++){
        if(F[y][x]) continue;
        var inv = m === 0 ? (x + y) % 2 === 0 : m === 1 ? y % 2 === 0 : m === 2 ? x % 3 === 0 : m === 3 ? (x + y) % 3 === 0
          : m === 4 ? (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0 : m === 5 ? x * y % 2 + x * y % 3 === 0
          : m === 6 ? (x * y % 2 + x * y % 3) % 2 === 0 : ((x + y) % 2 + x * y % 3) % 2 === 0;
        if(inv) M[y][x] = !M[y][x];
      }
    }
    function penalite(){
      var p = 0, sombres = 0;
      function lignes(get){
        for(var a = 0; a < n; a++){
          var run = 1;
          for(var b = 1; b < n; b++){
            if(get(a, b) === get(a, b - 1)){ run++; if(run === 5) p += 3; else if(run > 5) p++; }
            else run = 1;
          }
          /* motif 1:1:3:1:1 bordé de quatre clairs */
          for(var b2 = 0; b2 + 10 < n; b2++){
            var mo = [1,0,1,1,1,0,1,0,0,0,0], ok1 = true, ok2 = true;
            for(var k3 = 0; k3 < 11; k3++){ if(get(a, b2 + k3) !== !!mo[k3]) ok1 = false; if(get(a, b2 + k3) !== !!mo[10 - k3]) ok2 = false; }
            if(ok1) p += 40; if(ok2) p += 40;
          }
        }
      }
      lignes(function(a, b){ return M[a][b]; });
      lignes(function(a, b){ return M[b][a]; });
      for(var y = 0; y < n - 1; y++) for(var x = 0; x < n - 1; x++){
        var c0 = M[y][x]; if(c0 === M[y][x + 1] && c0 === M[y + 1][x] && c0 === M[y + 1][x + 1]) p += 3;
      }
      for(var y2 = 0; y2 < n; y2++) for(var x2 = 0; x2 < n; x2++) if(M[y2][x2]) sombres++;
      var tot = n * n; p += Math.max(0, Math.ceil(Math.abs(sombres * 20 - tot * 10) / tot) - 1) * 10;
      return p;
    }
    var meilleur = 0, pMin = Infinity;
    for(var m = 0; m < 8; m++){
      masquer(m); format(m);
      var pp = penalite(); if(pp < pMin){ pMin = pp; meilleur = m; }
      masquer(m);
    }
    masquer(meilleur); format(meilleur);
    return {taille: n, version: v, sombre: function(x, y){ return x >= 0 && y >= 0 && x < n && y < n && M[y][x]; }};
  }

  function canvas(cv, texte, o){
    o = o || {};
    var q = matrice(texte, o.niveau), marge = o.marge == null ? 4 : o.marge, tot = q.taille + 2 * marge;
    var px = o.taille || 240, r = (typeof devicePixelRatio !== "undefined" && devicePixelRatio) || 1;
    cv.width = Math.round(px * r); cv.height = Math.round(px * r);
    if(!o.fixe){ cv.style.width = px + "px"; cv.style.height = px + "px"; }
    var x = cv.getContext("2d"), m = cv.width / tot;
    x.fillStyle = o.fond || "#fff"; x.fillRect(0, 0, cv.width, cv.height);
    x.fillStyle = o.couleur || "#000";
    for(var yy = 0; yy < q.taille; yy++) for(var xx = 0; xx < q.taille; xx++)
      if(q.sombre(xx, yy)) x.fillRect(Math.floor((xx + marge) * m), Math.floor((yy + marge) * m), Math.ceil(m), Math.ceil(m));
    return q;
  }
  function svg(texte, o){
    o = o || {};
    var q = matrice(texte, o.niveau), marge = o.marge == null ? 4 : o.marge, tot = q.taille + 2 * marge, d = "";
    for(var y = 0; y < q.taille; y++){
      for(var x = 0; x < q.taille; x++){
        if(!q.sombre(x, y)) continue;
        var x0 = x; while(x + 1 < q.taille && q.sombre(x + 1, y)) x++;
        d += "M" + (x0 + marge) + " " + (y + marge) + "h" + (x - x0 + 1) + "v1h-" + (x - x0 + 1) + "z";
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + tot + " " + tot + '" shape-rendering="crispEdges">'
      + '<rect width="100%" height="100%" fill="' + (o.fond || "#fff") + '"/><path fill="' + (o.couleur || "#000") + '" d="' + d + '"/></svg>';
  }
  /* dans un PDF : une rangée de modules sombres d'affilée = un seul rectangle */
  function pdf(doc, texte, x0, y0, cote, o){
    o = o || {};
    var q = matrice(texte, o.niveau), m = cote / q.taille;
    doc.setFillColor(0, 0, 0);
    for(var y = 0; y < q.taille; y++){
      for(var x = 0; x < q.taille; x++){
        if(!q.sombre(x, y)) continue;
        var xa = x; while(x + 1 < q.taille && q.sombre(x + 1, y)) x++;
        doc.rect(x0 + xa * m, y0 + y * m, (x - xa + 1) * m + 0.01, m + 0.01, "F");
      }
    }
    return q;
  }
  /* l'étiquette « Nous contacter » (sur les tableaux, les devis, le véhicule) : la marque en
     bandeau, le QR, « Nous contacter » et le nom de l'entreprise, ce qu'on peut demander,
     son téléphone. l x h en mm (60 x 86 conseillé). */
  function etiquette(doc, x, y, l, h, o){
    o = o || {};
    var k = l / 60, bande = 13 * k, cx = x + l / 2;
    doc.setDrawColor(200, 192, 178); doc.setLineWidth(0.3);
    doc.setFillColor(255, 255, 255); doc.roundedRect(x, y, l, h, 3 * k, 3 * k, "FD");
    doc.setFillColor(34, 32, 28); doc.roundedRect(x, y, l, bande, 3 * k, 3 * k, "F"); doc.rect(x, y + bande - 3 * k, l, 3 * k, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(13 * k);
    var t1 = "Suivi travaux ", t2 = "360", w1 = doc.getTextWidth(t1), w2 = doc.getTextWidth(t2), x0 = cx - (w1 + w2) / 2, yb = y + bande / 2 + 1.6 * k;
    doc.setTextColor(255, 255, 255); doc.text(t1, x0, yb);
    doc.setTextColor(243, 161, 90); doc.text(t2, x0 + w1, yb);
    var cote = Math.min(l - 14 * k, h - bande - 34 * k), qy = y + bande + 4 * k;
    pdf(doc, o.url || "", cx - cote / 2, qy, cote, {niveau: "Q"});
    var ty = qy + cote + 6 * k;
    /* « Nous contacter », le nom de l'entreprise, ce qu'on peut demander */
    doc.setTextColor(34, 32, 28); doc.setFont("helvetica", "bold"); doc.setFontSize(11 * k);
    doc.text("Nous contacter", cx, ty, {align: "center"});
    doc.setFontSize(8.6 * k); doc.setTextColor(180, 98, 26);
    doc.text(doc.splitTextToSize(o.societe || "", l - 6 * k)[0] || "", cx, ty + 4.6 * k, {align: "center"});
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.4 * k); doc.setTextColor(110, 103, 92);
    doc.text("Dépannage  ·  Devis  ·  Information", cx, ty + 9 * k, {align: "center"});
    var bas = o.tel || o.web || "";
    if(bas){
      doc.setFillColor(226, 220, 206); doc.rect(x + 5 * k, y + h - 9 * k, l - 10 * k, 0.25, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8 * k); doc.setTextColor(34, 32, 28);
      doc.text(doc.splitTextToSize(bas, l - 6 * k)[0], cx, y + h - 4.4 * k, {align: "center"});
    }
    doc.setTextColor(0, 0, 0);
  }
  racine.QR = {matrice: matrice, canvas: canvas, svg: svg, pdf: pdf, etiquette: etiquette};
})(typeof window !== "undefined" ? window : globalThis);
