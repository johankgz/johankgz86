/* =====================================================================
   symboles-elec.js — la bibliothèque des symboles électriques
   ---------------------------------------------------------------------
   Les 18 symboles de la légende « CFO » des plans électriques Trichet
   Loué Énergies (plan ELE03, TESSIER-SAVARY), relevés trait pour trait
   dans le dessin vectoriel de la légende : mêmes cercles, mêmes angles,
   mêmes pleins, mêmes couleurs (cyan pour l'éclairage et les commandes,
   bleu pour les prises, rouge pour les alimentations).

   Unité : le rayon du cercle de base (7,087 pt sur la légende, soit
   2,5 mm sur un plan au 1/50, 125 mm en vrai). Origine : le centre du
   cadre du symbole, comme dans la légende. y vers le bas.

   Un seul dessin sert partout :
     - dessiner(ctx, cle, x, y, taille, options)  pour un canvas
       (annotation des photos, croquis, plans, outil DWG) ;
     - svg(cle, px)                               pour une icône ;
     - dxf(poses, options)                        un fichier DXF R12 avec
       un bloc par symbole, pour AutoCAD.
   ===================================================================== */
(function(){
  var CYAN = "#00FFFF", BLEU = "#0000FF", ROUGE = "#FF0000";
  var EP = 0.09;                                  /* épaisseur du trait, en rayons (0,097 sur la légende) */

  /* les éléments : c cercle, l ligne, p polyligne, a arc (degrés, sens du dessin, y vers le bas),
     r anneau plein, s secteur plein, t polygone plein */
  function arcs4(rayons){
    var out=[];
    rayons.forEach(function(r){ [0,90,180,270].forEach(function(a){ out.push({a:[0,0,r,a-30,a+30]}); }); });
    return out;
  }
  var PINS = [
    {c:[-0.552,0,0.146], f:1}, {c:[0.552,0,0.146], f:1},   /* phase et neutre : pleins */
    {c:[0,-0.551,0.145]}                                    /* terre : vide */
  ];
  /* le voyant : la croix, et les secteurs gauche et droit pleins */
  function voyant(cx, cy, r){
    var k=r*Math.SQRT1_2;
    return [
      {s:[cx,cy,r,135,225]}, {s:[cx,cy,r,-45,45]},
      {l:[cx-k,cy-k,cx+k,cy+k]}, {l:[cx-k,cy+k,cx+k,cy-k]},
      {c:[cx,cy,r]}
    ];
  }
  var LISTE = [
    {cle:"cfo-dcl-plafond", court:"DCL plafond", nom:"DCL plafond", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_DCL_PLAFOND",
      el:[{c:[0,0,1]}, {l:[-0.242,-0.242,0.242,0.242]}, {l:[-0.242,0.242,0.242,-0.242]}]},
    {cle:"cfo-dcl-mural", court:"DCL mural", nom:"DCL mural", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_DCL_MURAL",
      el:[{a:[0,1,2,180,360]}, {l:[-2,1,2,1]}, {a:[0,1,1.764,180,360]}, {l:[-1.764,1,1.764,1]},
          {l:[-0.481,-0.373,0.484,0.597]}, {l:[-0.481,0.597,0.484,-0.373]}]},
    {cle:"cfo-spot-shot", court:"Spot shot light", nom:"Spot led shot light (type 5)", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_SPOT_SHOT",
      el:[{c:[0,0,1]}, {c:[0,0,0.254]}, {l:[-0.707,-0.707,0.707,0.707]}, {l:[-0.707,0.707,0.707,-0.707]}]},
    {cle:"cfo-spot-orientable", court:"Spot orientable", nom:"Spot led orientable (type 2)", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_SPOT_ORIENTABLE",
      el:[{c:[0,0,1]}, {c:[0,0,0.254]}]},
    {cle:"cfo-suspension", court:"Suspension", nom:"Suspension décorative (type 4)", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_SUSPENSION",
      el:[{r:[0,0,0.769,1]}, {c:[0,0,1]}, {c:[0,0,0.769]}]},
    {cle:"cfo-applique-brick", court:"Applique brick", nom:"Applique extérieur (type brick)", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_APPLIQUE_BRICK",
      el:[{p:[[-1,-1],[1,-1],[1,1],[-1,1]], z:1}, {c:[0,0,1]}, {l:[0,1,-1,-0.732]}, {l:[0,1,1,-0.732]}]},
    {cle:"cfo-encastre-mural", court:"Encastré mural", nom:"Encastré mural (type 6)", groupe:"Éclairage", couleur:CYAN, dxf:"TLE_ENCASTRE_MURAL",
      el:[{c:[0,0.23,0.7696]}, {l:[0,1,-1.1557,-1]}, {l:[0,1,1.1557,-1]}]},
    {cle:"cfo-prise-etanche", court:"Prise étanche", nom:"Prise 2P+T encastrée, étanche", groupe:"Prises", couleur:BLEU, dxf:"TLE_PRISE_ETANCHE",
      el:[{c:[0,0,1]}, {c:[0,0,0.772]}].concat(PINS)},
    {cle:"cfo-prise", court:"Prise 2P+T", nom:"Prise 2P+T encastrée", groupe:"Prises", couleur:BLEU, dxf:"TLE_PRISE",
      el:[{c:[0,0,1]}].concat(PINS)},
    {cle:"cfo-inter-va", court:"Va-et-vient", nom:"Interrupteur va-et-vient, encastré", groupe:"Commandes", couleur:CYAN, dxf:"TLE_INTER_VA_ET_VIENT",
      el:[{c:[0,0.498,0.504]}, {l:[0.2455,0.0494,0.8353,-1]}, {l:[-0.2498,0.0494,-0.8353,-1]}]},
    {cle:"cfo-inter-double-voyant", court:"Double allumage voyant", nom:"Interrupteur double allumage à voyant, connecté", groupe:"Commandes", couleur:CYAN, dxf:"TLE_INTER_DOUBLE_VOYANT",
      el:voyant(-0.3062,0.4953,0.5046).concat([
          {l:[-0.0579,0.0508,0.5263,-0.999]}, {l:[0.5263,-0.999,0.8128,-0.8382]}, {l:[0.4021,-0.7789,0.6872,-0.618]}])},
    {cle:"cfo-inter-voyant", court:"Simple allumage voyant", nom:"Interrupteur simple allumage à voyant, encastré", groupe:"Commandes", couleur:CYAN, dxf:"TLE_INTER_VOYANT",
      el:voyant(-0.1651,0.4967,0.5042).concat([{l:[0.0861,0.0494,0.6688,-1.0018]}])},
    {cle:"cfo-inter-simple", court:"Simple allumage", nom:"Interrupteur simple allumage, encastré", groupe:"Commandes", couleur:CYAN, dxf:"TLE_INTER_SIMPLE",
      el:[{c:[-0.1651,0.4967,0.5039]}, {l:[0.0861,0.0508,0.6688,-0.999]}]},
    {cle:"cfo-detecteur-360", court:"Détecteur 360°", nom:"Détecteur de présence 360° (plafond)", groupe:"Commandes", couleur:CYAN, dxf:"TLE_DETECTEUR_360",
      el:[{c:[0,0,0.331]}].concat(arcs4([0.432,0.5,0.584,0.701,0.830,1]))},
    {cle:"cfo-bouton-vr", court:"Volets roulants", nom:"Bouton volets roulants, encastré", groupe:"Commandes", couleur:CYAN, dxf:"TLE_BOUTON_VR",
      el:[{c:[0,0,1]}, {t:[[0,0.357],[-0.3556,-0.3584],[-0.7154,0.357]]}, {t:[[0,-0.3584],[0.3556,0.357],[0.7154,-0.3584]]}]},
    {cle:"cfo-bp-voyant", court:"Poussoir à voyant", nom:"Bouton poussoir à voyant, encastré", groupe:"Commandes", couleur:CYAN, dxf:"TLE_BP_VOYANT",
      el:voyant(0,0,1)},
    {cle:"cfo-bp", court:"Bouton poussoir", nom:"Bouton poussoir, encastré", groupe:"Commandes", couleur:CYAN, dxf:"TLE_BP",
      el:[{c:[0,0,1]}]},
    {cle:"cfo-alim", court:"Alim divers", nom:"Alim divers", groupe:"Alimentations", couleur:ROUGE, dxf:"TLE_ALIM_DIVERS",
      el:[{c:[-1.2445,0.6096,0.3903], f:1}, {p:[[-1.0681,0.2624],[0.2836,-0.745],[-0.1256,0.4064],[1.6368,-0.999]]},
          {l:[1.6368,-0.999,1.006,-0.8508]}, {l:[1.6368,-0.999,1.3546,-0.4191]}]}
  ];
  var PAR = {};
  LISTE.forEach(function(s){ PAR[s.cle]=s; });

  /* le cadre d'un symbole, en rayons, autour de son origine */
  function boite(cle){
    var s=PAR[cle]; if(!s) return null;
    if(s._b) return s._b;
    var x0=Infinity, y0=Infinity, x1=-Infinity, y1=-Infinity;
    function pt(x,y){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
    s.el.forEach(function(e){
      if(e.c){ pt(e.c[0]-e.c[2], e.c[1]-e.c[2]); pt(e.c[0]+e.c[2], e.c[1]+e.c[2]); }
      else if(e.r){ pt(e.r[0]-e.r[3], e.r[1]-e.r[3]); pt(e.r[0]+e.r[3], e.r[1]+e.r[3]); }
      else if(e.l){ pt(e.l[0],e.l[1]); pt(e.l[2],e.l[3]); }
      else if(e.p || e.t){ (e.p||e.t).forEach(function(q){ pt(q[0],q[1]); }); }
      else { var a=e.a||e.s; for(var k=0;k<=16;k++){ var t=(a[3]+(a[4]-a[3])*k/16)*Math.PI/180; pt(a[0]+a[2]*Math.cos(t), a[1]+a[2]*Math.sin(t)); } if(e.s) pt(a[0],a[1]); }
    });
    s._b={x0:x0, y0:y0, x1:x1, y1:y1};
    return s._b;
  }

  /* ---------- sur un canvas ----------
     taille : le rayon du cercle de base, en pixels ; options.rot en radians ;
     options.couleur remplace celle de la légende ; options.halo trace un
     liseré sombre dessous (lisible sur une photo). */
  function tracer(ctx, s, R, couleur, ep){
    ctx.strokeStyle=couleur; ctx.fillStyle=couleur;
    ctx.lineWidth=ep; ctx.lineCap="round"; ctx.lineJoin="round";
    s.el.forEach(function(e){
      ctx.beginPath();
      if(e.c){ ctx.arc(e.c[0]*R, e.c[1]*R, e.c[2]*R, 0, Math.PI*2); if(e.f) ctx.fill(); ctx.stroke(); }
      else if(e.l){ ctx.moveTo(e.l[0]*R, e.l[1]*R); ctx.lineTo(e.l[2]*R, e.l[3]*R); ctx.stroke(); }
      else if(e.p){ e.p.forEach(function(q,i){ if(i) ctx.lineTo(q[0]*R,q[1]*R); else ctx.moveTo(q[0]*R,q[1]*R); }); if(e.z) ctx.closePath(); ctx.stroke(); }
      else if(e.t){ e.t.forEach(function(q,i){ if(i) ctx.lineTo(q[0]*R,q[1]*R); else ctx.moveTo(q[0]*R,q[1]*R); }); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if(e.a){ ctx.arc(e.a[0]*R, e.a[1]*R, e.a[2]*R, e.a[3]*Math.PI/180, e.a[4]*Math.PI/180); ctx.stroke(); }
      else if(e.s){ ctx.moveTo(e.s[0]*R, e.s[1]*R); ctx.arc(e.s[0]*R, e.s[1]*R, e.s[2]*R, e.s[3]*Math.PI/180, e.s[4]*Math.PI/180); ctx.closePath(); ctx.fill(); }
      else if(e.r){ ctx.arc(e.r[0]*R, e.r[1]*R, e.r[3]*R, 0, Math.PI*2); ctx.arc(e.r[0]*R, e.r[1]*R, e.r[2]*R, 0, Math.PI*2, true); ctx.fill("evenodd"); }
    });
  }
  function dessiner(ctx, cle, x, y, taille, o){
    var s=PAR[cle]; if(!s) return false;
    o=o||{};
    var R=taille, ep=Math.max(o.epMin||1, R*EP);
    ctx.save();
    ctx.translate(x, y);
    if(o.rot) ctx.rotate(o.rot);
    if(o.halo){ tracer(ctx, s, R, o.halo===true ? "rgba(11,14,18,.6)" : o.halo, ep+Math.max(2, R*0.12)); }
    tracer(ctx, s, R, o.couleur || s.couleur, ep);
    ctx.restore();
    return true;
  }

  /* ---------- en SVG (icônes) ---------- */
  function n(v){ return Math.round(v*1000)/1000; }
  function svg(cle, px, o){
    var s=PAR[cle]; if(!s) return "";
    o=o||{};
    var b=boite(cle), m=0.12, w=b.x1-b.x0+2*m, h=b.y1-b.y0+2*m, cote=Math.max(w,h);
    var vx=(b.x0+b.x1)/2-cote/2, vy=(b.y0+b.y1)/2-cote/2, col=o.couleur||s.couleur;
    var out=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+n(vx)+' '+n(vy)+' '+n(cote)+' '+n(cote)+'" width="'+px+'" height="'+px+'" aria-hidden="true">'];
    var st='stroke="'+col+'" stroke-width="'+EP+'" stroke-linecap="round" stroke-linejoin="round"';
    function p2(a,t){ var r=a[2], t0=a[3]*Math.PI/180, t1=a[4]*Math.PI/180;
      var x0=a[0]+r*Math.cos(t0), y0=a[1]+r*Math.sin(t0), x1=a[0]+r*Math.cos(t1), y1=a[1]+r*Math.sin(t1);
      var grand=(a[4]-a[3])>180?1:0;
      return (t?'M'+n(a[0])+' '+n(a[1])+'L':'M')+n(x0)+' '+n(y0)+'A'+n(r)+' '+n(r)+' 0 '+grand+' 1 '+n(x1)+' '+n(y1)+(t?'Z':''); }
    s.el.forEach(function(e){
      if(e.c) out.push('<circle cx="'+n(e.c[0])+'" cy="'+n(e.c[1])+'" r="'+n(e.c[2])+'" fill="'+(e.f?col:'none')+'" '+st+'/>');
      else if(e.l) out.push('<line x1="'+n(e.l[0])+'" y1="'+n(e.l[1])+'" x2="'+n(e.l[2])+'" y2="'+n(e.l[3])+'" '+st+'/>');
      else if(e.p) out.push('<path d="M'+e.p.map(function(q){ return n(q[0])+' '+n(q[1]); }).join('L')+(e.z?'Z':'')+'" fill="none" '+st+'/>');
      else if(e.t) out.push('<path d="M'+e.t.map(function(q){ return n(q[0])+' '+n(q[1]); }).join('L')+'Z" fill="'+col+'" '+st+'/>');
      else if(e.a) out.push('<path d="'+p2(e.a,false)+'" fill="none" '+st+'/>');
      else if(e.s) out.push('<path d="'+p2(e.s,true)+'" fill="'+col+'"/>');
      else if(e.r) out.push('<circle cx="'+n(e.r[0])+'" cy="'+n(e.r[1])+'" r="'+n((e.r[2]+e.r[3])/2)+'" fill="none" stroke="'+col+'" stroke-width="'+n(e.r[3]-e.r[2])+'"/>');
    });
    out.push('</svg>');
    return out.join("");
  }

  /* ---------- en DXF (AutoCAD) ----------
     Format R12, le plus largement relu. Un bloc par symbole, dessiné au
     rayon 1 (y vers le haut, comme dans AutoCAD) ; chaque pose est une
     insertion à l'échelle du rayon voulu, dans les unités du plan. Les
     pleins sont des polylignes épaisses (disques, anneau) et des faces
     pleines (triangles, secteurs). Couleurs de la légende : 4 cyan,
     5 bleu, 1 rouge. */
  var ACI = {}; ACI[CYAN]=4; ACI[BLEU]=5; ACI[ROUGE]=1;
  var CALQUES = {"Éclairage":"ELEC-ECLAIRAGE", "Prises":"ELEC-PRISES", "Commandes":"ELEC-COMMANDES", "Alimentations":"ELEC-ALIMENTATIONS"};
  function dxfEl(s){
    var L=[];
    function g(){ for(var i=0;i<arguments.length;i+=2) L.push(String(arguments[i]), typeof arguments[i+1]==="number" ? String(n(arguments[i+1])) : String(arguments[i+1])); }
    function tete(t){ g(0,t, 8,"0", 62,0); }                         /* calque 0, couleur DUBLOC : l'insertion décide */
    function disque(cx,cy,r0,r1){                                    /* anneau ou disque plein : polyligne épaisse fermée */
      var rm=(r0+r1)/2, w=r1-r0;
      g(0,"POLYLINE", 8,"0", 62,0, 66,1, 10,0, 20,0, 30,0, 70,1, 40,w, 41,w);
      g(0,"VERTEX", 8,"0", 10,cx-rm, 20,-cy, 30,0, 42,1);
      g(0,"VERTEX", 8,"0", 10,cx+rm, 20,-cy, 30,0, 42,1);
      g(0,"SEQEND", 8,"0");
    }
    function face(a,b,c){ tete("SOLID"); g(10,a[0],20,-a[1],30,0, 11,b[0],21,-b[1],31,0, 12,c[0],22,-c[1],32,0, 13,c[0],23,-c[1],33,0); }
    s.el.forEach(function(e){
      if(e.c){
        if(e.f) disque(e.c[0], e.c[1], 0, e.c[2]);
        tete("CIRCLE"); g(10,e.c[0], 20,-e.c[1], 30,0, 40,e.c[2]);
      } else if(e.l){ tete("LINE"); g(10,e.l[0],20,-e.l[1],30,0, 11,e.l[2],21,-e.l[3],31,0); }
      else if(e.p || e.t){
        var pts=e.p||e.t;
        if(e.t) face(pts[0],pts[1],pts[2]);
        g(0,"POLYLINE", 8,"0", 62,0, 66,1, 10,0, 20,0, 30,0, 70,(e.z||e.t)?1:0);
        pts.forEach(function(q){ g(0,"VERTEX", 8,"0", 10,q[0], 20,-q[1], 30,0); });
        g(0,"SEQEND", 8,"0");
      } else if(e.a){
        /* y retourné : l'arc de a0 à a1 (sens horaire à l'écran) va de -a1 à -a0 dans AutoCAD */
        tete("ARC"); g(10,e.a[0], 20,-e.a[1], 30,0, 40,e.a[2], 50,-e.a[4], 51,-e.a[3]);
      } else if(e.s){
        var k=12, a0=e.s[3], a1=e.s[4], pr=null;
        for(var i=0;i<=k;i++){
          var t=(a0+(a1-a0)*i/k)*Math.PI/180, q=[e.s[0]+e.s[2]*Math.cos(t), e.s[1]+e.s[2]*Math.sin(t)];
          if(pr) face([e.s[0],e.s[1]], pr, q);
          pr=q;
        }
      } else if(e.r){ disque(e.r[0], e.r[1], e.r[2], e.r[3]); }
    });
    return L;
  }
  /* poses : [{cle, x, y, rot (degrés, sens trigo), taille (rayon, unités du plan), texte}] */
  function dxf(poses, o){
    o=o||{};
    var L=[];
    function g(){ for(var i=0;i<arguments.length;i+=2) L.push(String(arguments[i]), typeof arguments[i+1]==="number" ? String(n(arguments[i+1])) : String(arguments[i+1])); }
    var utiles = o.tous ? LISTE : LISTE.filter(function(s){ return (poses||[]).some(function(p){ return p.cle===s.cle; }); });
    g(0,"SECTION", 2,"HEADER", 9,"$ACADVER", 1,"AC1009", 9,"$INSBASE", 10,0,20,0,30,0, 0,"ENDSEC");
    g(0,"SECTION", 2,"TABLES");
    g(0,"TABLE", 2,"LTYPE", 70,1, 0,"LTYPE", 2,"CONTINUOUS", 70,0, 3,"Solid line", 72,65, 73,0, 40,0, 0,"ENDTAB");
    var calques=[["0",7]];
    Object.keys(CALQUES).forEach(function(k){ var c=LISTE.filter(function(s){ return s.groupe===k; })[0]; calques.push([CALQUES[k], ACI[c.couleur]||7]); });
    calques.push(["ELEC-REPERES",7]);
    g(0,"TABLE", 2,"LAYER", 70,calques.length);
    calques.forEach(function(c){ g(0,"LAYER", 2,c[0], 70,0, 62,c[1], 6,"CONTINUOUS"); });
    g(0,"ENDTAB", 0,"ENDSEC");
    g(0,"SECTION", 2,"BLOCKS");
    utiles.forEach(function(s){
      g(0,"BLOCK", 8,"0", 2,s.dxf, 70,0, 10,0, 20,0, 30,0, 3,s.dxf);
      L=L.concat(dxfEl(s));
      g(0,"ENDBLK", 8,"0");
    });
    g(0,"ENDSEC", 0,"SECTION", 2,"ENTITIES");
    (poses||[]).forEach(function(p){
      var s=PAR[p.cle]; if(!s) return;
      var t=p.taille||1;
      g(0,"INSERT", 8,CALQUES[s.groupe], 62,ACI[s.couleur]||7, 2,s.dxf, 10,p.x, 20,p.y, 30,0, 41,t, 42,t, 43,t, 50,p.rot||0);
      if(p.texte){ g(0,"TEXT", 8,"ELEC-REPERES", 62,ACI[s.couleur]||7, 10,p.x+t*1.3, 20,p.y-t*0.4, 30,0, 40,t*0.8, 1,String(p.texte).replace(/[\r\n]+/g," ")); }
    });
    /* la bibliothèque seule : les symboles en rang, avec leur nom */
    if(o.tous && !(poses||[]).length){
      utiles.forEach(function(s, i){
        var y=-i*3;
        g(0,"INSERT", 8,CALQUES[s.groupe], 62,ACI[s.couleur]||7, 2,s.dxf, 10,0, 20,y, 30,0, 41,1, 42,1, 43,1, 50,0);
        g(0,"TEXT", 8,"ELEC-REPERES", 62,7, 10,3, 20,y-0.35, 30,0, 40,0.8, 1,s.nom);
      });
    }
    g(0,"ENDSEC", 0,"EOF");
    /* un DXF R12 est en ASCII : les accents passent en \U+00E9, qu'AutoCAD relit */
    return L.join("\r\n").replace(/[^\x00-\x7F]/g, function(ch){
      return "\\U+"+("000"+ch.charCodeAt(0).toString(16).toUpperCase()).slice(-4);
    })+"\r\n";
  }

  window.SymbolesElec = {
    liste: LISTE,
    groupes: ["Éclairage","Prises","Commandes","Alimentations"],
    trouver: function(cle){ return PAR[cle] || null; },
    boite: boite,
    dessiner: dessiner,
    svg: svg,
    dxf: dxf,
    epaisseur: EP
  };
})();
