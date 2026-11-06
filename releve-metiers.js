/* =====================================================================
   releve-metiers.js — les parties du relevé propres à chaque corps d'état
   ---------------------------------------------------------------------
   Menuiseries, maçonnerie / gros œuvre, couverture / charpente, plaquiste / isolation, peinture, carrelage / sols.
   Chaque partie est un onglet du relevé, qui n'apparaît que si la société
   réalise ce métier (Équipe › Nature des travaux réalisés ; rien de coché :
   tout), ou si la fiche en contient déjà. Les données vont dans S.metiers,
   et dans le PDF du relevé, un chapitre par métier rempli.
   ===================================================================== */
(function(){
  "use strict";

  /* ---------- les métiers : leurs natures, leurs champs ---------- */
  var METIERS=[
    {id:"menuiserie", onglet:"Menuis.", titre:"Menuiseries", natures:["Menuiserie"],
      chapeau:"Les ouvertures relevées, une par une : cotes en tableau, pose, matériau, vitrage, volet.",
      liste:{cle:"ouvertures", nom:"Ouverture", ajout:"Ajouter une ouverture", photo:true, champs:[
        {k:"type", t:"un", l:"Type", o:["Fenêtre","Porte-fenêtre","Baie coulissante","Porte d'entrée","Porte de service","Porte intérieure","Porte de garage","Fenêtre de toit","Volet seul"]},
        {k:"piece", t:"txt", l:"Pièce / emplacement", pieces:true},
        {k:"l", t:"nb", l:"Largeur tableau", u:"mm"}, {k:"h", t:"nb", l:"Hauteur tableau", u:"mm"},
        {k:"allege", t:"nb", l:"Allège", u:"mm"}, {k:"qte", t:"nb", l:"Quantité", u:""},
        {k:"pose", t:"un", l:"Pose", o:["Rénovation sur dormant","Dépose totale","Applique","Tunnel","Feuillure"]},
        {k:"mat", t:"un", l:"Matériau", o:["PVC","Alu","Bois","Mixte bois-alu"]},
        {k:"coulInt", t:"txt", l:"Couleur intérieure"}, {k:"coulExt", t:"txt", l:"Couleur extérieure"},
        {k:"vitrage", t:"un", l:"Vitrage", o:["Double","Triple","Feuilleté / sécurité","Phonique","Opaque"]},
        {k:"ouv", t:"un", l:"Ouverture", o:["Gauche tirant","Droite tirant","Oscillo-battant","Coulissant","Fixe","Basculant"]},
        {k:"volet", t:"un", l:"Volet", o:["Aucun","Roulant coffre intérieur","Roulant coffre extérieur","Battant","Persienne"]},
        {k:"manoeuvre", t:"un", l:"Manœuvre du volet", o:["Manuelle","Filaire","Radio","Solaire"]},
        {k:"note", t:"txt", l:"Note"}
      ]},
      champs:[{k:"note", t:"zone", l:"Observations"}]},
    {id:"maconnerie", onglet:"Maçon.", titre:"Maçonnerie / gros œuvre", natures:["Maçonnerie","Terrassement / VRD","Démolition"],
      chapeau:"Le terrain, l'existant, les ouvrages demandés et leurs métrés.",
      champs:[
        {k:"sol", t:"un", l:"Nature du sol", o:["Terre végétale","Argile","Sable","Remblai","Rocher"]},
        {k:"etude", t:"un", l:"Étude de sol", o:["Aucune","G1","G2 AVP","G2 PRO"]},
        {k:"acces", t:"un", l:"Accès des engins", o:["Facile","Limité","Manuel seulement"]},
        {k:"pente", t:"un", l:"Pente du terrain", o:["Plat","Légère","Forte"]},
        {k:"reseaux", t:"un", l:"Réseaux enterrés", o:["Repérés","DICT à faire","Sans objet"]},
        {k:"murs", t:"un", l:"Murs existants", o:["Parpaing","Brique","Pierre","Béton","Ossature bois"]},
        {k:"etat", t:"plus", l:"État de l'existant", o:["Bon","Fissures","Humidité","Dégradé"]},
        {k:"ouvrages", t:"plus", l:"Ouvrages demandés", o:["Fondations","Dalle","Mur","Ouverture dans mur porteur","Chape","Enduit","Clôture / muret","Terrasse","Démolition"]},
        {k:"note", t:"zone", l:"Observations"}
      ],
      alerte:function(d){ return (d.ouvrages||[]).indexOf("Ouverture dans mur porteur")>=0 ? "Ouverture dans un mur porteur : une étude béton armé (bureau d'études) est nécessaire." : ""; },
      liste:{cle:"metres", nom:"Métré", ajout:"Ajouter un métré", champs:[
        {k:"ouvrage", t:"txt", l:"Ouvrage"},
        {k:"lg", t:"nb", l:"Longueur", u:"m"}, {k:"la", t:"nb", l:"Largeur", u:"m"}, {k:"ht", t:"nb", l:"Hauteur / épaisseur", u:"m"}
      ], calcul:function(it){ var a=nombre(it.lg), b=nombre(it.la), c=nombre(it.ht);
        if(a && b && c) return dec(a*b*c, 2)+" m³"; if(a && b) return dec(a*b, 2)+" m²"; if(a) return dec(a, 2)+" ml"; return ""; }}},
    {id:"toiture", onglet:"Toiture", titre:"Couverture / charpente", natures:["Couverture","Charpente","Zinguerie"],
      chapeau:"La toiture, son état, la charpente, l'isolation des combles et la sécurité d'accès.",
      champs:[
        {k:"couv", t:"un", l:"Couverture", o:["Tuile mécanique","Tuile canal","Ardoise","Bac acier","Zinc","Shingle","Fibrociment"]},
        {k:"pente", t:"nb", l:"Pente", u:"°"}, {k:"hEgout", t:"nb", l:"Hauteur à l'égout", u:"m"},
        {k:"etat", t:"plus", l:"État de la couverture", o:["Tuiles cassées","Faîtage à reprendre","Rives","Solins","Gouttières","Descentes","Infiltrations","Mousses"]},
        {k:"charpente", t:"un", l:"Charpente", o:["Traditionnelle","Fermettes","Métallique"]},
        {k:"etatCh", t:"un", l:"État de la charpente", o:["Bon","Insectes","Pourriture","Déformée"]},
        {k:"ecran", t:"un", l:"Écran sous toiture", o:["Oui","Non"]},
        {k:"isolType", t:"txt", l:"Isolation des combles (type)"}, {k:"isolEp", t:"nb", l:"Épaisseur", u:"cm"},
        {k:"securite", t:"plus", l:"Accès et sécurité", o:["Échafaudage","Nacelle","Ligne de vie","Points d'ancrage","Échelle de toit"]},
        {k:"note", t:"zone", l:"Observations"}
      ],
      alerte:function(d){ return d.couv==="Fibrociment" ? "Fibrociment : repérage amiante obligatoire avant travaux (toiture antérieure à 1997)." : ""; },
      liste:{cle:"pans", nom:"Pan", ajout:"Ajouter un pan", champs:[
        {k:"nom", t:"txt", l:"Pan"}, {k:"rampant", t:"nb", l:"Rampant", u:"m"}, {k:"largeur", t:"nb", l:"Largeur", u:"m"}
      ], calcul:function(it){ var a=nombre(it.rampant), b=nombre(it.largeur); return a && b ? dec(a*b, 2)+" m²" : ""; },
      total:function(l){ var s=0; l.forEach(function(it){ var a=nombre(it.rampant), b=nombre(it.largeur); if(a && b) s+=a*b; }); return s ? "Surface totale : "+dec(s, 2)+" m²" : ""; }}},
    {id:"plaquiste", onglet:"Plaquiste", titre:"Plaquiste / isolation", natures:["Plâtrerie / plaquiste","Plâtrerie","Isolation"],
      chapeau:"Pièce par pièce : cloisons, doublages, plafonds, type de plaque et isolant.",
      liste:{cle:"pieces", nom:"Pièce", ajout:"Ajouter une pièce", reprendre:true, champs:[
        {k:"piece", t:"txt", l:"Pièce", pieces:true},
        {k:"cloisons", t:"nb", l:"Cloisons", u:"ml"}, {k:"hauteur", t:"nb", l:"Hauteur", u:"m"},
        {k:"doublage", t:"nb", l:"Doublages", u:"m²"}, {k:"plafond", t:"nb", l:"Plafond", u:"m²"},
        {k:"ouvrages", t:"plus", l:"Ouvrages", o:["Cloison","Doublage","Plafond","Faux plafond","Coffrage / soffite","Gaine technique"]},
        {k:"plaque", t:"plus", l:"Type de plaque", o:["BA13 standard","Hydrofuge (H1)","Phonique","Coupe-feu","Haute dureté"]},
        {k:"isolant", t:"un", l:"Isolant", o:["Aucun","Laine de verre","Laine de roche","Polystyrène","Polyuréthane","Fibre de bois"]},
        {k:"epIsolant", t:"nb", l:"Épaisseur isolant", u:"mm"},
        {k:"trappes", t:"nb", l:"Trappes de visite", u:""},
        {k:"note", t:"txt", l:"Note"}
      ], calcul:function(it){ var c=nombre(it.cloisons), h=nombre(it.hauteur); return c && h ? "cloisons "+dec(c*h, 2)+" m²" : ""; }},
      champs:[{k:"note", t:"zone", l:"Observations"}]},
    {id:"peintre", onglet:"Peinture", titre:"Peinture", natures:["Peinture"],
      chapeau:"Pièce par pièce : surfaces à peindre, état du support, préparation et finition.",
      liste:{cle:"pieces", nom:"Pièce", ajout:"Ajouter une pièce", reprendre:true, champs:[
        {k:"piece", t:"txt", l:"Pièce", pieces:true},
        {k:"murs", t:"nb", l:"Murs", u:"m²"}, {k:"plafond", t:"nb", l:"Plafond", u:"m²"},
        {k:"boiseries", t:"nb", l:"Boiseries / portes", u:"u"}, {k:"couches", t:"nb", l:"Couches de finition", u:""},
        {k:"support", t:"un", l:"Support", o:["Plaque neuve","Ancienne peinture","Papier peint à retirer","Enduit","Bois","Humide / taché"]},
        {k:"prepa", t:"plus", l:"Préparation", o:["Lessivage","Rebouchage","Ponçage","Enduit de lissage","Décollage papier","Traitement anti-tache"]},
        {k:"aspect", t:"un", l:"Aspect", o:["Mat","Velours","Satin","Brillant"]},
        {k:"teinte", t:"txt", l:"Teinte (référence)"}, {k:"note", t:"txt", l:"Note"}
      ], calcul:function(it){ var s=nombre(it.murs)+nombre(it.plafond); return s ? dec(s, 2)+" m² à peindre" : ""; },
      total:function(l){ var s=0; l.forEach(function(it){ s+=nombre(it.murs)+nombre(it.plafond); }); return s ? "Surface totale à peindre : "+dec(s, 2)+" m²" : ""; }},
      champs:[{k:"note", t:"zone", l:"Observations"}]},
    {id:"sols", onglet:"Sols", titre:"Carrelage / sols", natures:["Carrelage","Revêtements de sol"],
      chapeau:"Pièce par pièce : surfaces, support, revêtement et pose.",
      liste:{cle:"pieces", nom:"Pièce", ajout:"Ajouter une pièce", reprendre:true, champs:[
        {k:"piece", t:"txt", l:"Pièce", pieces:true},
        {k:"sol", t:"nb", l:"Sol", u:"m²"}, {k:"murs", t:"nb", l:"Faïence murale", u:"m²"},
        {k:"plinthes", t:"nb", l:"Plinthes", u:"ml"},
        {k:"support", t:"un", l:"Support", o:["Dalle béton","Chape","Ancien carrelage","Plancher bois","À ragréer","Humide"]},
        {k:"revetement", t:"un", l:"Revêtement", o:["Carrelage","Faïence","Parquet","Stratifié","Sol souple / PVC","Moquette"]},
        {k:"format", t:"txt", l:"Format / référence"},
        {k:"pose", t:"un", l:"Pose", o:["Droite","Décalée","Diagonale","Chevron","Flottante","Collée"]},
        {k:"etancheite", t:"un", l:"Étanchéité (pièce humide)", o:["Oui","Non","Sans objet"]},
        {k:"note", t:"txt", l:"Note"}
      ], calcul:function(it){ var s=nombre(it.sol)+nombre(it.murs); return s ? dec(s*1.1, 2)+" m² à commander (10 % de chute)" : ""; }},
      champs:[{k:"note", t:"zone", l:"Observations"}]}
  ];

  function nombre(v){ var n=parseFloat(String(v==null?"":v).replace(",", ".")); return isFinite(n) ? n : 0; }
  function dec(n, k){ var f=Math.pow(10, k==null?1:k); return String(Math.round(n*f)/f).replace(".", ","); }
  function uid(){ return "m"+Date.now().toString(36)+Math.random().toString(36).slice(2, 6); }
  function el(t, c, txt){ var e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; }
  function vide(v){ return v==null || v==="" || (Array.isArray(v) && !v.length); }

  /* ---------- l'état : S.metiers ---------- */
  function etat(S){
    if(!S.metiers || typeof S.metiers!=="object") S.metiers={};
    METIERS.forEach(function(m){
      var d=S.metiers[m.id]; if(!d || typeof d!=="object") d=S.metiers[m.id]={};
      if(m.liste && !Array.isArray(d[m.liste.cle])) d[m.liste.cle]=[];
    });
    return S.metiers;
  }
  function rempli(m, d){
    if(!d) return false;
    if(m.liste && (d[m.liste.cle]||[]).some(function(it){ return Object.keys(it).some(function(k){ return k!=="id" && !vide(it[k]); }); })) return true;
    return (m.champs||[]).some(function(c){ return !vide(d[c.k]); });
  }
  /* les métiers à montrer : ceux de la société (ou tous si elle n'a rien choisi), et ceux déjà remplis */
  function visibles(S, naturesSoc){
    etat(S);
    var tout=!naturesSoc || !naturesSoc.length;
    return METIERS.filter(function(m){
      return tout || m.natures.some(function(n){ return naturesSoc.indexOf(n)>=0; }) || rempli(m, S.metiers[m.id]);
    });
  }

  /* ---------- à l'écran ---------- */
  function chips(hote, c, valeur, fixer){
    var box=el("div", "chips");
    c.o.forEach(function(o){
      var on = c.t==="plus" ? (valeur||[]).indexOf(o)>=0 : valeur===o;
      var lab=el("label", "chip"+(c.t==="plus" ? " multi" : "")+(on ? " on" : ""));
      var i=document.createElement("input"); i.type=c.t==="plus" ? "checkbox" : "radio"; i.checked=on;
      lab.appendChild(i); lab.appendChild(document.createTextNode(o));
      lab.addEventListener("click", function(e){
        e.preventDefault();
        if(c.t==="plus"){ var v=(valeur||[]).slice(), k=v.indexOf(o); if(k>=0) v.splice(k, 1); else v.push(o); valeur=v; }
        else valeur = valeur===o ? "" : o;
        Array.prototype.forEach.call(box.children, function(l, n){ var x=c.o[n]; l.classList.toggle("on", c.t==="plus" ? valeur.indexOf(x)>=0 : valeur===x); });
        fixer(valeur);
      });
      box.appendChild(lab);
    });
    hote.appendChild(box);
  }
  function champ(hote, c, obj, ctx, apres){
    if(c.t==="un" || c.t==="plus"){
      hote.appendChild(el("p", "legend", c.l));
      chips(hote, c, obj[c.k], function(v){ obj[c.k]=v; ctx.save(); if(apres) apres(); });
      return;
    }
    var lab=el("label", "f"); lab.appendChild(el("span", null, c.l+(c.u ? " ("+c.u+")" : "")));
    var i=document.createElement(c.t==="zone" ? "textarea" : "input");
    if(c.t==="nb"){ i.type="text"; i.inputMode="decimal"; }
    else if(c.t!=="zone") i.type="text";
    if(c.t==="zone") i.rows=3;
    if(c.pieces){ i.setAttribute("list", "dlMetiersPieces"); }
    i.value=obj[c.k]==null ? "" : obj[c.k];
    i.addEventListener("input", function(){ obj[c.k]=i.value; ctx.save(); if(apres) apres(); });
    lab.appendChild(i); hote.appendChild(lab);
  }
  function peindreListe(m, d, ctx, hote){
    var L=m.liste, items=d[L.cle];
    hote.textContent="";
    items.forEach(function(it, n){
      var bloc=el("div", "block");
      var tete=el("div", "row"); tete.style.cssText="justify-content:space-between;align-items:center;margin-bottom:6px";
      var titre=el("h2", null, L.nom+" "+(n+1)+(it.type ? " — "+it.type : it.piece ? " — "+it.piece : it.nom ? " — "+it.nom : it.ouvrage ? " — "+it.ouvrage : ""));
      titre.style.margin="0";
      var acts=el("div", "row"); acts.style.gap="6px";
      var dup=el("button", "act ghost mini", "Dupliquer"); dup.type="button";
      dup.addEventListener("click", function(){ var c=JSON.parse(JSON.stringify(it)); c.id=uid(); c.photo=null; items.splice(n+1, 0, c); ctx.save(); peindreListe(m, d, ctx, hote); });
      var sup=el("button", "act danger mini", "Retirer"); sup.type="button";
      sup.addEventListener("click", function(){ if(!confirm("Retirer "+L.nom.toLowerCase()+" "+(n+1)+" ?")) return; items.splice(n, 1); ctx.save(); peindreListe(m, d, ctx, hote); });
      acts.appendChild(dup); acts.appendChild(sup);
      tete.appendChild(titre); tete.appendChild(acts); bloc.appendChild(tete);
      var res=L.calcul ? el("p", "hint", "") : null;
      function nomDe(){ return L.nom+" "+(n+1)+(it.type ? " — "+it.type : it.piece ? " — "+it.piece : it.nom ? " — "+it.nom : it.ouvrage ? " — "+it.ouvrage : ""); }
      function majCalcul(){ titre.textContent=nomDe(); if(res) res.textContent=L.calcul(it) ? "= "+L.calcul(it) : ""; if(tot) tot.textContent=L.total ? L.total(items) : ""; }
      var g=null;
      L.champs.forEach(function(c){
        if(c.t==="nb" || c.t==="txt"){
          if(!g || g.children.length>=2){ g=el("div", "grid2 toujours"); bloc.appendChild(g); }
          champ(g, c, it, ctx, majCalcul);
        } else { g=null; champ(bloc, c, it, ctx, majCalcul); }
      });
      if(res){ bloc.appendChild(res); }
      if(L.photo){
        var ph=el("div", "row"); ph.style.cssText="margin-top:8px;align-items:center";
        var vu=null;
        if(it.photo && it.photo.data){ vu=document.createElement("img"); vu.src=it.photo.data; vu.alt=""; vu.style.cssText="width:96px;height:72px;object-fit:cover;border-radius:8px"; ph.appendChild(vu); }
        var bp=el("button", "act ghost mini", it.photo ? "Changer la photo" : "Prendre la photo"); bp.type="button";
        var fi=document.createElement("input"); fi.type="file"; fi.accept="image/*"; fi.setAttribute("capture", "environment"); fi.hidden=true;
        bp.addEventListener("click", function(){ fi.click(); });
        fi.addEventListener("change", function(){
          var f=fi.files && fi.files[0]; if(!f || !ctx.compress) return;
          ctx.compress(f, function(r){ if(!r) return; it.photo={data:r.data, w:r.w, h:r.h}; ctx.save(); peindreListe(m, d, ctx, hote); });
        });
        ph.appendChild(bp); ph.appendChild(fi);
        if(it.photo){ var bx=el("button", "act ghost mini", "Retirer la photo"); bx.type="button"; bx.addEventListener("click", function(){ it.photo=null; ctx.save(); peindreListe(m, d, ctx, hote); }); ph.appendChild(bx); }
        bloc.appendChild(ph);
      }
      hote.appendChild(bloc);
      majCalcul();
    });
    var tot=L.total ? el("p", "hint", L.total(items)) : null;
    if(tot) hote.appendChild(tot);
    var rang=el("div", "row"); rang.style.marginBottom="14px";
    var ba=el("button", "act blue", "+ "+L.ajout); ba.type="button";
    ba.addEventListener("click", function(){ items.push({id:uid()}); ctx.save(); peindreListe(m, d, ctx, hote); });
    rang.appendChild(ba);
    if(L.reprendre){
      var br=el("button", "act ghost", "Reprendre les pièces du relevé"); br.type="button";
      br.addEventListener("click", function(){
        var deja=items.map(function(x){ return String(x.piece||"").trim().toLowerCase(); }), n=0;
        (ctx.S.pieces||[]).forEach(function(p){ var nom=String(p.nom||"").trim(); if(nom && deja.indexOf(nom.toLowerCase())<0){ items.push({id:uid(), piece:nom}); n++; } });
        ctx.save(); peindreListe(m, d, ctx, hote);
        if(ctx.toast) ctx.toast(n ? n+" pièce"+(n>1?"s":"")+" reprise"+(n>1?"s":"")+" du relevé." : "Toutes les pièces du relevé sont déjà là.");
      });
      rang.appendChild(br);
    }
    hote.appendChild(rang);
  }
  function peindre(S, ctx){
    var M=etat(S);
    ctx.S=S;
    /* les pièces du relevé, proposées dans les champs « Pièce » */
    var dl=document.getElementById("dlMetiersPieces");
    if(!dl){ dl=document.createElement("datalist"); dl.id="dlMetiersPieces"; document.body.appendChild(dl); }
    dl.textContent=""; (S.pieces||[]).forEach(function(p){ if(p.nom){ var o=document.createElement("option"); o.value=p.nom; dl.appendChild(o); } });
    METIERS.forEach(function(m){
      var sec=document.getElementById("tab-"+m.id); if(!sec) return;
      var d=M[m.id];
      sec.textContent="";
      var b=el("div", "block"); b.appendChild(el("h2", null, m.titre)); b.appendChild(el("p", "hint", m.chapeau));
      var al=el("p", "hint"); al.style.cssText="color:var(--danger,#B42318);font-weight:600";
      function majAlerte(){ var t=m.alerte ? m.alerte(d) : ""; al.textContent=t; al.hidden=!t; }
      (m.champs||[]).forEach(function(c){ champ(b, c, d, ctx, majAlerte); });
      b.appendChild(al); majAlerte();
      sec.appendChild(b);
      if(m.liste){ var h=el("div"); sec.appendChild(h); peindreListe(m, d, ctx, h); }
    });
  }

  /* ---------- dans le PDF du relevé : un chapitre par métier rempli ---------- */
  function pdf(S, P, naturesSoc){
    var M=etat(S);
    METIERS.forEach(function(m){
      var d=M[m.id]; if(!rempli(m, d)) return;
      P.chapitre(m.titre, m.titre, null, m.chapeau);
      var al=m.alerte ? m.alerte(d) : ""; if(al) P.blocTexte("À noter", al);
      var paires=(m.champs||[]).filter(function(c){ return c.t!=="zone"; }).map(function(c){
        var v=d[c.k]; return [c.l, Array.isArray(v) ? v.join(", ") : (vide(v) ? "" : v+(c.u ? " "+c.u : ""))]; });
      P.grille(m.titre, paires);
      if(m.liste){
        var L=m.liste;
        (d[L.cle]||[]).forEach(function(it, n){
          var pr=L.champs.map(function(c){ var v=it[c.k]; return [c.l, Array.isArray(v) ? v.join(", ") : (vide(v) ? "" : v+(c.u ? " "+c.u : ""))]; });
          if(L.calcul && L.calcul(it)) pr.push(["Calcul", L.calcul(it)]);
          var nom=L.nom+" "+(n+1)+(it.type ? " — "+it.type : it.piece ? " — "+it.piece : it.nom ? " — "+it.nom : it.ouvrage ? " — "+it.ouvrage : "");
          P.grille(nom, pr);
          if(it.photo && it.photo.data && P.photo) P.photo(it.photo);
        });
        if(L.total && L.total(d[L.cle]||[])) P.blocTexte("Total", L.total(d[L.cle]||[]));
      }
      (m.champs||[]).filter(function(c){ return c.t==="zone"; }).forEach(function(c){ if(!vide(d[c.k])) P.blocTexte(c.l, d[c.k]); });
    });
  }

  window.MetiersReleve={METIERS:METIERS, visibles:visibles, peindre:peindre, pdf:pdf, etat:etat};
})();
