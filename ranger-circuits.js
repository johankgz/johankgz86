/* =====================================================================
   ranger-circuits.js — ranger les circuits d'un tableau sous ses
   interrupteurs différentiels, et en faire deux ou trois propositions
   ---------------------------------------------------------------------
   On donne pour chaque circuit son nom, sa puissance et sa
   caractéristique (calibre, courbe, pôles : « 20 A C », « 32 A 3P+N »).
   Le moteur en déduit l'usage (éclairage, prises, plaques, lave-linge,
   chauffage, borne…), puis range les circuits d'après la NF C 15-100 :
     - 8 circuits au plus par différentiel 30 mA (réglable) ;
     - logement : 1 différentiel jusqu'à 35 m², 2 jusqu'à 100 m²,
       3 au-delà, au moins ;
     - type A seulement là où il le faut : plaques de cuisson, lave-linge,
       sèche-linge, lave-vaisselle, PAC et clim, borne de recharge ; type AC
       pour tout le reste (ou type A partout, au choix) ; type F conseillé
       pour le congélateur ; la borne a son propre différentiel ;
     - l'éclairage partagé entre plusieurs différentiels, pour qu'un
       défaut ne plonge pas toute la maison dans le noir ;
     - en triphasé, les circuits monophasés répartis sur L1, L2, L3.
   Chaque proposition est à vérifier : calibres, sections et
   différentiels restent sous la responsabilité de l'installateur.
   Rien ici ne touche à l'écran : schema.html s'en sert, les essais aussi.
   ===================================================================== */
(function(racine){
  "use strict";
  /* les usages : dans l'ordre où on les cherche dans le nom (« prise lave-linge » est un lave-linge) */
  var USAGES=[
    {k:"ve",     re:/borne|irve|recharge|v[ée]hicule|\bve\b|wallbox/i,                                  lib:"Borne de recharge",   ordre:90, cal:32, rec:"irve", typeA:true},
    {k:"plaque", re:/plaque|cuisson|induction|cuisini[eè]re|piano/i,                                    lib:"Plaques de cuisson",  ordre:40, cal:32, typeA:true},
    {k:"ll",     re:/lave.?linge|\bll\b|s[eè]che.?linge|\bsl\b|machine [àa] laver|buanderie/i,          lib:"Lave-linge, sèche-linge", ordre:45, cal:20, typeA:true},
    {k:"cong",   re:/cong[ée]lateur|r[ée]frig[ée]rateur|frigo|cave [àa] vin/i,                         lib:"Froid (congélateur)", ordre:50, cal:20},
    {k:"lv",     re:/lave.?vaisselle|\blv\b/i,                                                           lib:"Lave-vaisselle",      ordre:43, cal:20, typeA:true},
    {k:"four",   re:/four|micro.?onde|hotte/i,                                                          lib:"Cuisine (four)",      ordre:42, cal:20},
    {k:"ecs",    re:/chauffe.?eau|cumulus|ballon|\becs\b|thermodynamique/i,                             lib:"Chauffe-eau",         ordre:60, cal:20},
    {k:"pac",    re:/\bpac\b|pompe [àa] chaleur|clim|gainable|split|groupe ext|unit[ée] (int|ext)|module hydrau/i, lib:"PAC, climatisation", ordre:70, cal:20, typeA:true, rec:"moteur"},
    {k:"chauf",  re:/radiateur|chauffage|convecteur|plancher chauffant|s[eè]che.?serviette|panneau rayonnant/i, lib:"Chauffage", ordre:65, cal:20, rec:"chauffage"},
    {k:"vmc",    re:/vmc|ventilation|extracteur|double flux/i,                                          lib:"VMC",                 ordre:35, cal:2,  rec:"moteur"},
    {k:"volet",  re:/volet|store|motoris|porte de garage|portail/i,                                     lib:"Volets, motorisations", ordre:30, cal:16, rec:"moteur"},
    {k:"ext",    re:/ext[ée]rieur|jardin|terrasse|piscine|abri|relevage|arrosage|fontaine|spa\b/i,       lib:"Extérieur",           ordre:80, cal:16},
    {k:"vdi",    re:/vdi|\bbox\b|communication|alarme|interphone|visiophone|domotique|knx|serveur|baie|r[ée]seau/i, lib:"VDI, alarme, domotique", ordre:20, cal:16},
    {k:"ecl",    re:/[ée]clairage|[ée]cl\b|lumi[eè]re|spot|applique|plafonnier|lustre|\bled\b|luminaire|bandeau|\bdcl\b/i, lib:"Éclairage", ordre:10, cal:10, rec:"lampe"},
    {k:"pc",     re:/prise|\bpc\b|socle|\bpc16\b/i,                                                    lib:"Prises",              ordre:15, cal:16, rec:"prise"},
    {k:"autre",  re:/.*/,                                                                               lib:"Autre",               ordre:55, cal:16}
  ];
  var PAR_K={}; USAGES.forEach(function(u){ PAR_K[u.k]=u; });
  var CALIBRES=[2,3,6,10,16,20,25,32,40,50,63];

  function usageDe(nom){ for(var i=0;i<USAGES.length;i++) if(USAGES[i].re.test(nom||"")) return USAGES[i].k; return "autre"; }

  /* la puissance : « 2,5 kW », « 600 W », « 7400 », « 3 kVA » → en W */
  function lirePuissance(v){
    if(typeof v==="number") return v>0 ? v : 0;
    var t=String(v||"").replace(/\s/g,"").replace(",",".").toLowerCase(); if(!t) return 0;
    var m=/^(\d+(?:\.\d+)?)(kva|kw|va|w)?$/.exec(t) || /(\d+(?:\.\d+)?)(kva|kw|va|w)/.exec(t); if(!m) return 0;
    var n=parseFloat(m[1]); if(!(n>0)) return 0;
    if(m[2]==="kw" || m[2]==="kva") n*=1000;
    else if(!m[2] && n<100) n*=1000;          /* « 7,4 » sans unité : des kW */
    return Math.round(n);
  }
  /* la caractéristique : calibre, courbe, pôles, différentiel intégré */
  function lireCarac(v){
    var t=String(v||"");
    var cal=null, m=/(\d{1,3})\s*a\b/i.exec(t) || /\b[bcd]\s?(\d{1,3})\b/i.exec(t) || /^\s*(\d{1,3})\s*$/.exec(t);
    if(m) cal=parseInt(m[1],10);
    var cb=/\b(?:courbe\s*)?([bcd])\s?\d{1,3}\b/i.exec(t) || /\d\s*a\s*(?:courbe\s*)?([bcd])\b/i.exec(t) || /courbe\s*([bcd])\b/i.exec(t);
    var p = /3\s?p\s?\+\s?n|4\s?p|t[ée]tra|tri|400\s?v/i.test(t) ? "3P+N" : /3\s?p\b/i.test(t) ? "3P" : "1P+N";
    return {cal:cal, courbe:cb ? cb[1].toUpperCase() : "", poles:p};
  }
  function calibreAuDessus(I){ for(var i=0;i<CALIBRES.length;i++) if(CALIBRES[i]>=I) return CALIBRES[i]; return 63; }
  /* la section conseillée, d'après le calibre (cuivre, pose courante) : à vérifier selon la longueur */
  function sectionDe(cal, u){
    if(cal<=10) return "1,5²"; if(cal<=16) return u==="ecl" ? "1,5²" : "2,5²"; if(cal<=20) return "2,5²";
    if(cal<=25) return "4²"; if(cal<=32) return "6²"; if(cal<=40) return "10²"; return "16²";
  }

  /* un circuit tel qu'on l'a tapé → un circuit complet */
  function normaliser(c, opt, i){
    var nom=String(c.nom||"").trim() || "Circuit "+(i+1);
    var u=c.usage && PAR_K[c.usage] ? c.usage : usageDe(nom);
    var P=lirePuissance(c.puissance), k=lireCarac(c.carac);
    if(opt.reseau!=="tri" && k.poles!=="1P+N") k.poles="1P+N";
    var U = k.poles==="1P+N" ? 230 : 400*Math.sqrt(3);
    var cal=k.cal || (P ? Math.max(PAR_K[u].cal, calibreAuDessus(P/U*1.1)) : PAR_K[u].cal);
    if(u==="ecl" && !k.cal && cal>16) cal=16;
    return {i:i, nom:nom, usage:u, P:P, I:P ? P/U : cal*0.4, cal:cal, courbe:k.courbe || (u==="pac" || u==="vmc" ? "D" : "C"), poles:k.poles,
            section:sectionDe(cal, u), cable:(k.poles==="1P+N" ? "3G" : "5G")+sectionDe(cal, u).replace("²",""), zone:zoneDe(nom)};
  }
  /* la zone, d'après le nom : un niveau (RDC, étage…), sinon le jour ou la nuit */
  function zoneDe(nom){
    var t=String(nom||"");
    var m=/\b(rdc|rez[- ]de[- ]chauss[ée]e|r\+\d|[ée]tage|1er|2e|sous[- ]sol|combles|niveau\s*\d+|n\d)\b/i.exec(t);
    if(m){ var z=m[1].toLowerCase(); return /rez|rdc/.test(z) ? "RDC" : /sous/.test(z) ? "Sous-sol" : /combles/.test(z) ? "Combles" : z.replace(/^./, function(x){ return x.toUpperCase(); }); }
    if(/chambre|\bch\.?\s?\d|sdb|salle d'eau|salle de bains?|bureau|dressing|nuit|parental/i.test(t)) return "Nuit";
    if(/s[ée]jour|salon|cuisine|entr[ée]e|salle [àa] manger|cellier|garage|buanderie|jour|wc|toilettes|d[ée]gagement/i.test(t)) return "Jour";
    return "";
  }

  /* ---------- les différentiels ---------- */
  function nouvelId(type, raison){ return {type:type, raison:raison||"", circuits:[]}; }
  function charge(id){ return id.circuits.reduce(function(s, c){ return s+c.I; }, 0); }
  /* un différentiel tient 8 circuits au plus, et 63 A estimés (la somme × 0,8) */
  var CAP=63/0.8;
  function tient(d, c, opt){ return d.circuits.length<opt.max && (charge(d)+c.I<=CAP || !d.circuits.length); }
  /* des circuits d'une même famille, répartis sur assez de différentiels (nombre et charge), le moins chargé d'abord */
  function paquets(cs, type, raison, opt){
    var tot=cs.reduce(function(s, c){ return s+c.I; }, 0), n=Math.max(1, Math.ceil(cs.length/opt.max), Math.ceil(tot/CAP)), ids=[];
    for(var k=0;k<n;k++) ids.push(nouvelId(type, raison));
    cs.slice().sort(function(a, b){ return b.I-a.I; }).forEach(function(c){ if(!placer(ids, c, opt)){ var d=nouvelId(type, raison); ids.push(d); d.circuits.push(c); } });
    return ids;
  }
  function placer(ids, c, opt, filtre){
    var cand=ids.filter(function(d){ return !d.dedie && tient(d, c, opt) && (!filtre || filtre(d)); });
    if(!cand.length) return false;
    cand.sort(function(a, b){ return charge(a)-charge(b) || a.circuits.length-b.circuits.length; });
    cand[0].circuits.push(c); return true;
  }
  function typeRequis(c, opt){ return opt.typeA==="tous" || !!PAR_K[c.usage].typeA; }
  function minimumIds(n, opt){
    var m=Math.ceil(n/opt.max);
    if(opt.batiment!=="tertiaire"){ var s=Number(opt.surface)||0; m=Math.max(m, s>100 ? 3 : s>35 ? 2 : 1); }
    return Math.max(1, m);
  }
  /* la borne : chacune son différentiel ; ce qui reste se range */
  function separerBornes(L){
    var dedies=[], reste=[];
    L.forEach(function(c){ if(c.usage==="ve"){ var d=nouvelId("A", "Borne : son propre différentiel (type A si la borne détecte le continu 6 mA, sinon type B)"); d.dedie=true; d.circuits.push(c); dedies.push(d); } else reste.push(c); });
    return {dedies:dedies, reste:reste};
  }
  function trierUsage(a, b){ return PAR_K[a.usage].ordre-PAR_K[b.usage].ordre || a.i-b.i; }

  /* 1. répartie : l'éclairage et les prises partagés entre tous les différentiels, les gros consommateurs équilibrés */
  function proposerRepartie(L, opt){
    var sp=separerBornes(L), gen=sp.reste.slice().sort(trierUsage), ids=[];
    var nA=gen.filter(function(c){ return typeRequis(c, opt); }).length;
    var n=minimumIds(gen.length, opt);
    for(var k=0;k<n;k++) ids.push(nouvelId(opt.typeA==="tous" ? "A" : "AC"));
    if(nA && opt.typeA!=="tous") ids[ids.length-1].type="A";
    /* d'abord ce qui veut un type A, sur les type A */
    gen.filter(function(c){ return typeRequis(c, opt); }).forEach(function(c){
      if(!placer(ids, c, opt, function(d){ return d.type==="A"; })){ var d=nouvelId("A"); ids.push(d); d.circuits.push(c); }
    });
    /* puis l'éclairage, à tour de rôle ; les prises de même ; le reste au moins chargé */
    var tour=0;
    gen.filter(function(c){ return !typeRequis(c, opt); }).forEach(function(c){
      var ok=false;
      if(c.usage==="ecl" || c.usage==="pc"){
        for(var t=0;t<ids.length && !ok;t++){ var d=ids[(tour+t)%ids.length]; if(d.circuits.length<opt.max){ d.circuits.push(c); ok=true; tour=(tour+t+1)%ids.length; } }
      } else ok=placer(ids, c, opt);
      if(!ok){ var d2=nouvelId(opt.typeA==="tous" ? "A" : "AC"); ids.push(d2); d2.circuits.push(c); }
    });
    return finir({titre:"Répartie", desc:"L'éclairage et les prises partagés entre tous les différentiels : un défaut ne coupe qu'une partie de l'installation. Les gros consommateurs sont équilibrés.", ids:ids.concat(sp.dedies)}, opt);
  }
  /* 2. par usage : la vie (éclairage, prises), la cuisine et le linge en type A, le chauffage et l'eau chaude, l'extérieur */
  function proposerUsage(L, opt){
    var sp=separerBornes(L), familles=[
      {nom:"Éclairage et prises", u:["ecl","pc","vdi","volet","vmc"]},
      {nom:"Cuisine et linge", u:["plaque","four","lv","ll","cong"], A:true},
      {nom:"Chauffage, eau chaude, PAC", u:["chauf","ecs","pac"]},
      {nom:"Extérieur et divers", u:["ext","autre"]}], ids=[];
    familles.forEach(function(f){
      var cs=sp.reste.filter(function(c){ return f.u.indexOf(c.usage)>=0; }).sort(trierUsage); if(!cs.length) return;
      var A=opt.typeA==="tous" || cs.some(function(c){ return typeRequis(c, opt); });
      if(A && opt.typeA!=="tous"){
        /* dans une famille, seul ce qui l'exige va sur un type A ; le reste sur un AC */
        var ra=cs.filter(function(c){ return typeRequis(c, opt); }), rac=cs.filter(function(c){ return !typeRequis(c, opt); });
        ids.push.apply(ids, paquets(ra, "A", f.nom, opt)); if(rac.length) ids.push.apply(ids, paquets(rac, "AC", f.nom, opt));
      } else ids.push.apply(ids, paquets(cs, A ? "A" : "AC", f.nom, opt));
    });
    /* l'éclairage tout seul sur un différentiel : on en passe la moitié sur un autre */
    var ecl=[]; ids.forEach(function(d){ d.circuits.forEach(function(c){ if(c.usage==="ecl") ecl.push({d:d, c:c}); }); });
    var porteurs=ids.filter(function(d){ return d.circuits.some(function(c){ return c.usage==="ecl"; }); });
    if(ecl.length>=2 && porteurs.length===1){
      var autres=ids.filter(function(d){ return porteurs.indexOf(d)<0 && d.circuits.length<opt.max; });
      if(!autres.length){ var d0=nouvelId(opt.typeA==="tous" ? "A" : "AC", "Éclairage et prises (bis)"); ids.push(d0); autres=[d0]; }
      ecl.slice(Math.ceil(ecl.length/2)).forEach(function(x){
        var cible=autres.filter(function(d){ return d.circuits.length<opt.max; })[0]; if(!cible) return;
        x.d.circuits.splice(x.d.circuits.indexOf(x.c), 1); cible.circuits.unshift(x.c);
      });
    }
    /* le minimum du logement */
    while(opt.batiment!=="tertiaire" && ids.length<minimumIds(0, opt)){
      var plein=ids.slice().sort(function(a, b){ return b.circuits.length-a.circuits.length; })[0]; if(!plein || plein.circuits.length<2) break;
      var dn=nouvelId(plein.type, plein.raison); dn.circuits=plein.circuits.splice(Math.ceil(plein.circuits.length/2)); ids.push(dn);
    }
    return finir({titre:"Par usage", desc:"Un différentiel par famille : éclairage et prises, cuisine et linge (type A), chauffage et eau chaude, extérieur. L'éclairage reste partagé sur deux différentiels.", ids:ids.concat(sp.dedies)}, opt);
  }
  /* 3. par zone (niveaux, ou jour / nuit) ; sinon les gros consommateurs à part */
  function proposerZone(L, opt){
    var sp=separerBornes(L), zones={}, sans=[];
    sp.reste.forEach(function(c){ if(c.zone && !typeRequis(c, opt) || (c.zone && opt.typeA==="tous")) (zones[c.zone]=zones[c.zone]||[]).push(c); else sans.push(c); });
    var noms=Object.keys(zones), avecZone=sp.reste.length-sans.length;
    if(noms.length<2 || avecZone<sp.reste.length*0.4) return proposerGros(L, opt);
    var ids=[];
    noms.sort().forEach(function(z){
      ids.push.apply(ids, paquets(zones[z].sort(trierUsage), opt.typeA==="tous" ? "A" : "AC", "Zone "+z, opt));
    });
    sans.sort(trierUsage).forEach(function(c){
      var req=typeRequis(c, opt), ty=req ? "A" : "AC";
      if(placer(ids, c, opt, function(d){ return d.type===ty && /type A|Sans zone/.test(d.raison); }) || (!req && placer(ids, c, opt, function(d){ return d.type==="AC"; }))) return;
      var d=nouvelId(ty, req ? "Cuisine, linge, PAC (type A)" : "Sans zone"); ids.push(d); d.circuits.push(c);
    });
    return finir({titre:"Par zone", desc:"Un différentiel par zone ("+noms.join(", ")+") : on coupe une zone sans toucher aux autres. La cuisine, le linge et la PAC sur un type A à part.", ids:ids.concat(sp.dedies)}, opt);
  }
  function proposerGros(L, opt){
    var sp=separerBornes(L), gros=[], petits=[];
    sp.reste.forEach(function(c){ (c.cal>=20 || c.P>=2500 ? gros : petits).push(c); });
    var ids=[], nP=Math.max(1, Math.ceil(petits.length/opt.max)), nG=Math.ceil(gros.length/opt.max);
    if(opt.batiment!=="tertiaire") while(nP+nG<minimumIds(0, opt)) nP++;
    var gp=[], gg=[];
    for(var k=0;k<nP;k++){ var d=nouvelId(opt.typeA==="tous" ? "A" : "AC", "Petits circuits"); gp.push(d); ids.push(d); }
    for(var j=0;j<nG;j++){ var d2=nouvelId("A", "Gros consommateurs"); gg.push(d2); ids.push(d2); }
    var tour=0; petits.sort(trierUsage).forEach(function(c){ for(var t=0;t<gp.length;t++){ var d=gp[(tour+t)%gp.length]; if(d.circuits.length<opt.max){ d.circuits.push(c); tour=(tour+t+1)%gp.length; return; } } var dn=nouvelId(opt.typeA==="tous" ? "A" : "AC", "Petits circuits"); ids.push(dn); dn.circuits.push(c); });
    gros.sort(function(a, b){ return b.I-a.I; }).forEach(function(c){ if(!placer(gg, c, opt)){ var dn=nouvelId("A", "Gros consommateurs"); gg.push(dn); ids.push(dn); dn.circuits.push(c); } });
    return finir({titre:"Gros consommateurs à part", desc:"L'éclairage, les prises et les petits circuits d'un côté ; les plaques, le four, le chauffage, la PAC (20 A et plus) équilibrés sur des type A.", ids:ids.concat(sp.dedies)}, opt);
  }

  /* ---------- la fin : ordre, calibres, phases, remarques ---------- */
  /* les petits différentiels (1 ou 2 circuits) se fondent dans un autre du même type, s'il y a la place */
  function consolider(ids, opt){
    var mini=opt.batiment==="tertiaire" ? 1 : minimumIds(0, opt), encore=true;
    while(encore){
      encore=false;
      var actifs=ids.filter(function(d){ return d.circuits.length; });
      if(actifs.filter(function(d){ return !d.dedie; }).length<=mini) break;
      var petits=actifs.filter(function(d){ return !d.dedie && d.circuits.length<=2; }).sort(function(a, b){ return a.circuits.length-b.circuits.length || charge(a)-charge(b); });
      for(var i=0;i<petits.length && !encore;i++){
        var p=petits[i], autres=actifs.filter(function(d){ return d!==p && !d.dedie && d.type===p.type; });
        var essai=autres.map(function(d){ return {d:d, n:d.circuits.length, I:charge(d)}; }), place=[];
        var ok=p.circuits.every(function(c){
          var cand=essai.filter(function(x){ return x.n<opt.max && x.I+c.I<=CAP; }).sort(function(a, b){ return a.I-b.I; })[0];
          if(!cand) return false; cand.n++; cand.I+=c.I; place.push([cand.d, c]); return true;
        });
        if(ok && place.length){ place.forEach(function(x){ x[0].circuits.push(x[1]); }); p.circuits=[]; encore=true; }
      }
    }
  }
  function finir(p, opt){
    consolider(p.ids, opt);
    var ids=p.ids.filter(function(d){ return d.circuits.length; });
    ids.forEach(function(d){
      d.circuits.sort(trierUsage);
      if(opt.typeA!=="tous" && d.circuits.some(function(c){ return typeRequis(c, opt); })) d.type="A";

      var I=d.circuits.reduce(function(s, c){ return s+c.I; }, 0)*0.8;
      d.I=Math.round(I*10)/10;
      d.cal = d.dedie ? 40 : I<=40 ? 40 : I<=63 ? 63 : 80;
      d.poles = opt.reseau==="tri" ? "4P" : "2P";
    });
    /* les différentiels dans un ordre logique : la vie d'abord, la borne à la fin */
    ids.sort(function(a, b){ return (a.dedie?1:0)-(b.dedie?1:0) || PAR_K[a.circuits[0].usage].ordre-PAR_K[b.circuits[0].usage].ordre; });
    /* les phases : chaque circuit monophasé sur la phase la moins chargée */
    var ph={L1:0, L2:0, L3:0};
    if(opt.reseau==="tri"){
      var tous=[]; ids.forEach(function(d){ d.circuits.forEach(function(c){ tous.push(c); }); });
      tous.filter(function(c){ return c.poles!=="1P+N"; }).forEach(function(c){ c.phase="L1-L2-L3"; ["L1","L2","L3"].forEach(function(l){ ph[l]+=c.P/3; }); });
      tous.filter(function(c){ return c.poles==="1P+N"; }).sort(function(a, b){ return b.P-a.P; }).forEach(function(c){
        var l=["L1","L2","L3"].sort(function(x, y){ return ph[x]-ph[y]; })[0]; c.phase=l; ph[l]+=c.P; });
    }
    var n=0, nId=0;
    ids.forEach(function(d){ nId++; d.rep="ID"+nId; d.circuits.forEach(function(c){ n++; c.rep="D"+n; }); });
    /* la puissance foisonnée : tout ne marche pas en même temps */
    var KU={ecl:0.6, pc:0.2, plaque:0.5, four:0.4, ll:0.5, cong:1, ecs:0.5, chauf:0.6, pac:0.7, ve:0.5, vmc:1, volet:0.1, ext:0.3, vdi:1, autre:0.3};   /* chauffe-eau et borne : la nuit, en heures creuses */
    var Ptot=0, Pf=0; ids.forEach(function(d){ d.circuits.forEach(function(c){ Ptot+=c.P; Pf+=c.P*(KU[c.usage]||0.3); }); });
    var notes=[];
    ids.forEach(function(d){ if(d.dedie) notes.push(d.rep+" : "+d.raison+"."); });
    ids.forEach(function(d){ if(d.type!=="A" && d.circuits.some(function(c){ return c.usage==="cong"; })) notes.push(d.rep+" : le congélateur est sur un type AC ; un type F (ou haute immunité) évite les déclenchements intempestifs."); });
    var porteurs=ids.filter(function(d){ return d.circuits.some(function(c){ return c.usage==="ecl"; }); }).length;
    var nEcl=0; ids.forEach(function(d){ d.circuits.forEach(function(c){ if(c.usage==="ecl") nEcl++; }); });
    if(nEcl>=2 && porteurs<2) notes.push("Tout l'éclairage est sur un seul différentiel : un défaut coupe toute la lumière.");
    if(opt.reseau==="tri"){ var mx=Math.max(ph.L1, ph.L2, ph.L3), mn=Math.min(ph.L1, ph.L2, ph.L3); if(mx>0 && (mx-mn)/mx>0.35) notes.push("Phases déséquilibrées : à reprendre à la main."); }
    ids.forEach(function(d){ if(d.I>63) notes.push(d.rep+" : "+String(d.I).replace(".", ",")+" A estimés, plus qu'un 63 A : à scinder."); });
    var kva=Pf/1000, abo = opt.reseau==="tri" ? [12,15,18,24,30,36].filter(function(x){ return x>=kva; })[0]||36 : [6,9,12].filter(function(x){ return x>=kva; })[0]||12;
    if(opt.reseau!=="tri" && kva>12) notes.push("Plus de 12 kVA en monophasé : le triphasé est à envisager.");
    return {titre:p.titre, desc:p.desc, ids:ids, phases:opt.reseau==="tri" ? ph : null, Ptot:Ptot, kva:Math.round(kva*10)/10, abonnement:abo, notes:notes};
  }

  /* les options par défaut, et les deux ou trois propositions (sans doublon) */
  function options(o){
    o=o||{};
    return {reseau:o.reseau==="tri" ? "tri" : "mono", batiment:o.batiment==="tertiaire" ? "tertiaire" : "logement", surface:Number(o.surface)||0,
            typeA:o.typeA==="tous" ? "tous" : "requis", max:Math.max(2, Math.min(20, Number(o.max)||8)), pf:o.pf!==false, hc:o.hc!==false};
  }
  function signature(p){ return p.ids.map(function(d){ return d.circuits.map(function(c){ return c.i; }).sort(function(a,b){ return a-b; }).join(","); }).sort().join("|"); }
  function proposer(circuits, o){
    var opt=options(o), L=(circuits||[]).filter(function(c){ return String(c.nom||"").trim() || c.puissance || c.carac; }).map(function(c, i){ return normaliser(c, opt, i); });
    if(!L.length) return {circuits:[], propositions:[], options:opt};
    var vues={}, out=[];
    [proposerRepartie, proposerUsage, proposerZone].forEach(function(f){
      var p=f(JSON.parse(JSON.stringify(L)), opt), sg=signature(p);
      if(!vues[sg]){ vues[sg]=1; out.push(p); }
    });
    if(out.length<2){ var g=proposerGros(JSON.parse(JSON.stringify(L)), opt); if(!vues[signature(g)]) out.push(g); }
    return {circuits:L, propositions:out.slice(0,3), options:opt};
  }
  /* une liste collée : une ligne par circuit, « nom ; puissance ; caractéristique » (point-virgule, tabulation ou barre) */
  function lireListe(texte){
    return String(texte||"").split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean).map(function(l){
      var p=l.split(/\s*[;\t|]\s*/);
      if(p.length<2){ /* « Plaques de cuisson 7,2 kW 32 A » : on va chercher la puissance et le calibre dans la ligne */
        var mP=/(\d+(?:[.,]\d+)?\s*(?:kva|kw|w)\b)/i.exec(l), mC=/(\b[bcd]?\s?\d{1,3}\s*a\b[^;]*)$/i.exec(l);
        var nom=l; if(mP) nom=nom.replace(mP[1], ""); if(mC) nom=nom.replace(mC[1], "");
        return {nom:nom.replace(/[\s,–-]+$/,"").trim(), puissance:mP ? mP[1] : "", carac:mC ? mC[1].trim() : ""};
      }
      return {nom:p[0]||"", puissance:p[1]||"", carac:p.slice(2).join(" ")};
    });
  }

  racine.RangerCircuits={USAGES:USAGES, CALIBRES:CALIBRES, usageDe:usageDe, lirePuissance:lirePuissance, lireCarac:lireCarac,
    lireListe:lireListe, proposer:proposer, options:options, sectionDe:sectionDe};
})(typeof window!=="undefined" ? window : globalThis);
