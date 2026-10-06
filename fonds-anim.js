/* =====================================================================
   fonds-anim.js — les fonds d'écran animés de l'accueil, légers
   ---------------------------------------------------------------------
   Un seul canevas, transparent, posé sur le ciel du moment (ses couleurs
   et ses lueurs restent celles de l'heure). Pour ne pas peser sur un
   ordinateur :
   - 30 images par seconde au plus (24 sur un grand écran), jamais plus ;
   - une résolution plafonnée (le fond est doux, pas besoin du 4K) ;
   - rien ne tourne quand l'onglet est caché ;
   - « réduire les animations » (réglage du système) : une seule image, fixe.
   Deux fonds n'ont même pas de canevas : l'aurore et le carbone ne sont que
   des calques qui glissent, déplacés par la carte graphique.

   FondsAnim.demarrer(conteneur, nom)   lance un fond dans .ciel
   FondsAnim.arreter()                  l'arrête
   FondsAnim.apercu(nom, canevas)       une vignette fixe (Mon compte)
   FondsAnim.LISTE                      [nom, titre, description]
   ===================================================================== */
(function(){
  "use strict";
  if(window.FondsAnim) return;

  var ORANGE="#FB923C", CYAN="#38BDF8", TURQUOISE="#22D3EE", JAUNE="#FACC15", VERT="#84CC16", VIOLET="#A78BFA";
  function hasard(g){ var x=g; return function(){ x=(x*9301+49297)%233280; return x/233280; }; }
  function rgba(hex, a){
    var n=parseInt(hex.slice(1), 16);
    return "rgba("+(n>>16&255)+","+(n>>8&255)+","+(n&255)+","+a+")";
  }

  /* ---------- les scènes ----------
     init(ctx, W, H, r) prépare (une fois par taille d'écran) ; image(ctx, W, H, t, etat) dessine
     l'instant t (en secondes). Les scènes « calques » posent leurs calques dans le conteneur. */
  var SCENES={};

  /* Les réseaux : câbles et tuyaux aux couleurs du logo, à angles droits, avec des
     impulsions qui y courent (la même idée qu'avant, sans les halos flous qui coûtaient cher) */
  SCENES.reseaux={
    init:function(ctx, W, H){
      var r=hasard(11), COUL=[ORANGE, CYAN, JAUNE, VERT];
      var pas=Math.max(40, Math.round(Math.min(W,H)/9));
      var nb=Math.max(8, Math.min(14, Math.round(W*H/40000)));
      function arrondi(v, max){ return Math.max(pas, Math.min(max-pas, Math.round(v/pas)*pas)); }
      var traces=[], noeuds=[];
      for(var i=0;i<nb;i++){
        var coul=COUL[i%4], x, y, dir, bord=i%4, pos=((i*0.618034)+r()*0.12)%1;
        if(bord===0){ x=-10; y=arrondi(pos*H, H); dir=0; }
        else if(bord===1){ x=W+10; y=arrondi(pos*H, H); dir=2; }
        else if(bord===2){ x=arrondi(pos*W, W); y=-10; dir=1; }
        else { x=arrondi(pos*W, W); y=H+10; dir=3; }
        var pts=[[x,y]], segs=4+Math.floor(r()*4);
        for(var k=0;k<segs;k++){
          var lg=pas*(2+Math.floor(r()*4));
          if(dir===0) x+=lg; else if(dir===2) x-=lg; else if(dir===1) y+=lg; else y-=lg;
          if(dir===0||dir===2) x=Math.max(pas, Math.min(W-pas, x)); else y=Math.max(pas, Math.min(H-pas, y));
          if(k<segs-1 && r()<.55) noeuds.push([x,y,coul]);
          pts.push([x,y]);
          dir=(dir===0||dir===2) ? (r()<.5?1:3) : (r()<.5?0:2);
        }
        if(dir===0) x=W+10; else if(dir===2) x=-10; else if(dir===1) y=H+10; else y=-10;
        pts.push([x,y]);
        var cum=[0]; for(var q=1;q<pts.length;q++) cum.push(cum[q-1]+Math.hypot(pts[q][0]-pts[q-1][0], pts[q][1]-pts[q-1][1]));
        traces.push({pts:pts, cum:cum, L:cum[cum.length-1], coul:coul, duree:8+(i%4)*1.5, dec:[(i*1.7)%9, (i*1.7+4.5)%9]});
      }
      return {traces:traces, noeuds:noeuds.slice(0, 16)};
    },
    image:function(ctx, W, H, t, e){
      ctx.lineJoin="round"; ctx.lineCap="round";
      e.traces.forEach(function(tr){
        ctx.beginPath(); tr.pts.forEach(function(p, i){ if(i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
        ctx.strokeStyle=rgba(tr.coul, .24); ctx.lineWidth=1.4; ctx.stroke();
        /* deux impulsions par tracé, chacune 6 % de sa longueur, avec un halo en trois traits */
        tr.dec.forEach(function(d){
          var u=((t+d)/tr.duree)%1, a=u*tr.L, b=Math.min(tr.L, a+tr.L*.06);
          var seg=sousTrace(tr, a, b);
          [[7,.12],[4,.3],[2.2,1]].forEach(function(s){
            ctx.beginPath(); seg.forEach(function(p, i){ if(i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
            ctx.strokeStyle=rgba(tr.coul, s[1]); ctx.lineWidth=s[0]; ctx.stroke();
          });
        });
      });
      e.noeuds.forEach(function(n, j){
        var a=.35+.65*(.5+.5*Math.sin((t+j*.6)*Math.PI*2/2.8));
        ctx.beginPath(); ctx.arc(n[0], n[1], 4, 0, Math.PI*2);
        ctx.fillStyle="#0B0F15"; ctx.fill(); ctx.strokeStyle=rgba(n[2], a); ctx.lineWidth=1.6; ctx.stroke();
      });
    }
  };
  function sousTrace(tr, a, b){
    var out=[], p=tr.pts, c=tr.cum;
    function en(s){
      for(var i=1;i<p.length;i++) if(s<=c[i]){ var k=(s-c[i-1])/((c[i]-c[i-1])||1); return [p[i-1][0]+(p[i][0]-p[i-1][0])*k, p[i-1][1]+(p[i][1]-p[i-1][1])*k, i]; }
      return [p[p.length-1][0], p[p.length-1][1], p.length-1];
    }
    var A=en(a), B=en(b); out.push([A[0],A[1]]);
    for(var i=A[2]; i<B[2]; i++) out.push(p[i]);
    out.push([B[0],B[1]]);
    return out;
  }

  /* La constellation : des points qui dérivent et se relient quand ils se rapprochent,
     et qui se tournent vers le pointeur de la souris */
  SCENES.constellation={
    init:function(ctx, W, H){
      var r=hasard(5), n=Math.max(36, Math.min(110, Math.round(W*H/21000))), pts=[];
      for(var i=0;i<n;i++){
        var a=r()*Math.PI*2, v=6+r()*10;
        pts.push({x:r()*W, y:r()*H, vx:Math.cos(a)*v, vy:Math.sin(a)*v, r:1+r()*1.6, c:r()<.18 ? ORANGE : (r()<.5 ? TURQUOISE : "#CBD5E1")});
      }
      return {pts:pts, t0:null, D:Math.max(110, Math.min(160, Math.min(W,H)/6))};
    },
    image:function(ctx, W, H, t, e){
      var dt=e.t0==null ? 0 : Math.min(.1, t-e.t0); e.t0=t;
      var P=e.pts, D=e.D, D2=D*D, m=SOURIS;
      P.forEach(function(p){
        p.x+=p.vx*dt; p.y+=p.vy*dt;
        if(p.x<-20) p.x=W+20; if(p.x>W+20) p.x=-20; if(p.y<-20) p.y=H+20; if(p.y>H+20) p.y=-20;
      });
      ctx.lineWidth=1;
      for(var i=0;i<P.length;i++){
        var a=P[i];
        for(var j=i+1;j<P.length;j++){
          var b=P[j], dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy;
          if(d2<D2){ var k=1-Math.sqrt(d2)/D; ctx.strokeStyle="rgba(148,197,230,"+(k*.48).toFixed(3)+")"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        if(m.x!=null){
          var mx=a.x-m.x, my=a.y-m.y, md=mx*mx+my*my;
          if(md<D2*1.6){ var km=1-Math.sqrt(md)/(D*1.26); ctx.strokeStyle=rgba(ORANGE, (km*.45).toFixed(3)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.x, m.y); ctx.stroke(); }
        }
      }
      P.forEach(function(p){
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r*3.2, 0, Math.PI*2); ctx.fillStyle=rgba(p.c, .08); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fillStyle=rgba(p.c, .9); ctx.fill();
      });
    }
  };

  /* Les ondes : des lignes de lumière qui ondulent lentement, comme un signal */
  SCENES.ondes={
    init:function(ctx, W, H){
      var r=hasard(3), l=[], COUL=[TURQUOISE, CYAN, VIOLET, ORANGE, TURQUOISE, CYAN, ORANGE];
      for(var i=0;i<7;i++) l.push({base:.42+i*.055+r()*.02, amp:.04+r()*.06, k1:.0018+r()*.0016, k2:.004+r()*.003,
        w1:.12+r()*.18, w2:-.08-r()*.15, ph:r()*6.28, c:COUL[i], a:.42+r()*.3, lw:i===3 ? 2.4 : 1.5});
      return {l:l};
    },
    image:function(ctx, W, H, t, e){
      var pas=Math.max(6, Math.round(W/260));
      ctx.lineCap="round";
      e.l.forEach(function(o){
        ctx.beginPath();
        for(var x=0; x<=W+pas; x+=pas){
          var y=H*(o.base + o.amp*Math.sin(x*o.k1 + t*o.w1 + o.ph) + o.amp*.45*Math.sin(x*o.k2 + t*o.w2));
          if(x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        /* un halo large et pâle, puis le trait : la lumière sans filtre flou */
        [[o.lw*5, .12], [o.lw, 1]].forEach(function(s){
          var g=ctx.createLinearGradient(0, 0, W, 0), a=o.a*s[1];
          g.addColorStop(0, rgba(o.c, 0)); g.addColorStop(.25, rgba(o.c, a)); g.addColorStop(.75, rgba(o.c, a)); g.addColorStop(1, rgba(o.c, 0));
          ctx.strokeStyle=g; ctx.lineWidth=s[0]; ctx.stroke();
        });
      });
    }
  };

  /* L'horizon : une grille de lumière qui file vers l'horizon, sous un soleil couchant */
  SCENES.horizon={
    init:function(ctx, W, H){
      var hz=Math.round(H*.62), soleil=document.createElement("canvas"), R=Math.round(Math.min(W, H)*.15);
      soleil.width=R*2+4; soleil.height=R*2+4;
      var s=soleil.getContext("2d"), g=s.createLinearGradient(0, 2, 0, R*2+2);
      g.addColorStop(0, "#FDE68A"); g.addColorStop(.45, "#FB923C"); g.addColorStop(1, "#DB2777");
      s.fillStyle=g; s.beginPath(); s.arc(R+2, R+2, R, 0, Math.PI*2); s.fill();
      /* les bandes du bas du soleil, de plus en plus larges */
      s.globalCompositeOperation="destination-out";
      for(var i=0;i<7;i++){ var y=R+2+R*(.18+i*.12), h=2+i*1.6; s.fillRect(0, y, R*2+4, h); }
      return {hz:hz, soleil:soleil, R:R};
    },
    image:function(ctx, W, H, t, e){
      var hz=e.hz, cx=W/2;
      /* la lueur de l'horizon */
      var g=ctx.createLinearGradient(0, hz-H*.25, 0, hz+4);
      g.addColorStop(0, "rgba(219,39,119,0)"); g.addColorStop(1, "rgba(219,39,119,.16)");
      ctx.fillStyle=g; ctx.fillRect(0, hz-H*.25, W, H*.25+4);
      /* le soleil, à demi couché, un peu à droite du centre */
      ctx.globalAlpha=.8; ctx.drawImage(e.soleil, W*.66-e.R-2, hz-e.R*1.1); ctx.globalAlpha=1;
      ctx.fillStyle="rgba(5,8,14,.55)"; ctx.fillRect(0, hz, W, H-hz);
      /* le sol : des lignes vers le point de fuite, et des lignes qui avancent */
      ctx.lineWidth=1;
      var n=Math.round(W/70);
      for(var i=-n;i<=n;i++){
        var xb=cx+i*(W/n)*1.6, a=.12+.18*(1-Math.abs(i)/n);
        ctx.strokeStyle="rgba(34,211,238,"+a.toFixed(3)+")";
        ctx.beginPath(); ctx.moveTo(cx+i*6, hz); ctx.lineTo(xb, H); ctx.stroke();
      }
      var v=(t*.35)%1;
      for(var k=0;k<16;k++){
        var z=(k+1-v)/16, y=hz+(H-hz)*Math.pow(z, 2.2);
        if(y<=hz+1) continue;
        ctx.strokeStyle="rgba(34,211,238,"+(.08+.42*z).toFixed(3)+")";
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.strokeStyle="rgba(251,146,60,.55)"; ctx.lineWidth=1.4;
      ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
    }
  };

  /* Les hexagones : une ruche fine, dont quelques alvéoles s'allument tour à tour */
  SCENES.hexagones={
    init:function(ctx, W, H){
      var R=Math.max(26, Math.round(Math.min(W, H)/22)), w=Math.sqrt(3)*R, cells=[];
      for(var row=-1; row*R*1.5<H+R*2; row++) for(var col=-1; col*w<W+w; col++)
        cells.push([col*w+(row%2 ? w/2 : 0), row*R*1.5]);
      var fond=document.createElement("canvas"); fond.width=Math.ceil(W); fond.height=Math.ceil(H);
      var f=fond.getContext("2d"); f.strokeStyle="rgba(148,197,230,.10)"; f.lineWidth=1;
      cells.forEach(function(c){ hex(f, c[0], c[1], R-1.5); f.stroke(); });
      var r=hasard(17), vives=[];
      for(var i=0;i<Math.min(26, Math.round(cells.length/9)); i++) vives.push({c:cells[Math.floor(r()*cells.length)], dec:r()*12, d:7+r()*7, coul:r()<.3 ? ORANGE : TURQUOISE});
      return {R:R, fond:fond, vives:vives};
    },
    image:function(ctx, W, H, t, e){
      ctx.drawImage(e.fond, 0, 0, W, H);
      e.vives.forEach(function(v){
        var u=((t+v.dec)/v.d)%1, a=Math.max(0, Math.sin(u*Math.PI)); a=a*a;
        if(a<.02) return;
        hex(ctx, v.c[0], v.c[1], e.R-1.5);
        ctx.fillStyle=rgba(v.coul, (a*.10).toFixed(3)); ctx.fill();
        ctx.strokeStyle=rgba(v.coul, (a*.75).toFixed(3)); ctx.lineWidth=1.4; ctx.stroke();
      });
    }
  };
  function hex(ctx, x, y, R){
    ctx.beginPath();
    for(var i=0;i<6;i++){ var a=Math.PI/180*(60*i-30), px=x+R*Math.cos(a), py=y+R*Math.sin(a); if(i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
    ctx.closePath();
  }

  /* L'aurore : de grandes nappes de couleur qui se mêlent lentement (des calques, sans canevas) */
  SCENES.aurore={
    calques:function(box){
      [["#0EA5E9", "62vmax", "-18vmax", "-22vmax", 34, "auA"], ["#A855F7", "58vmax", "auto", "-20vmax", 41, "auB"],
       ["#14B8A6", "54vmax", "30vw", "auto", 47, "auC"], ["#FB923C", "40vmax", "auto", "auto", 53, "auD"]].forEach(function(n, i){
        var d=document.createElement("i");
        d.style.cssText="position:absolute;width:"+n[1]+";height:"+n[1]+";border-radius:50%;opacity:.42;will-change:transform;"
          +"background:radial-gradient(circle at 50% 50%,"+rgba(n[0], .9)+" 0%,"+rgba(n[0], .35)+" 35%,"+rgba(n[0], 0)+" 68%);"
          +(i===0 ? "left:"+n[2]+";top:"+n[3]+";" : i===1 ? "right:-16vmax;top:"+n[3]+";" : i===2 ? "left:"+n[2]+";bottom:-26vmax;" : "right:6vw;bottom:-14vmax;")
          +"animation:"+n[5]+" "+n[4]+"s ease-in-out infinite alternate";
        box.appendChild(d);
      });
    },
    css:"@keyframes auA{to{transform:translate(22vw,16vh) scale(1.18)}}@keyframes auB{to{transform:translate(-20vw,22vh) scale(.86)}}"
      +"@keyframes auC{to{transform:translate(18vw,-24vh) scale(1.12)}}@keyframes auD{to{transform:translate(-26vw,-18vh) scale(1.25)}}",
    vignette:function(c, W, H){
      [["#0EA5E9", .1, .05, .8], ["#A855F7", .9, .1, .75], ["#14B8A6", .45, 1, .7], ["#FB923C", .85, .95, .55]].forEach(function(n){
        var g=c.createRadialGradient(W*n[1], H*n[2], 0, W*n[1], H*n[2], W*n[3]);
        g.addColorStop(0, rgba(n[0], .5)); g.addColorStop(1, rgba(n[0], 0)); c.fillStyle=g; c.fillRect(0, 0, W, H);
      });
    }
  };

  /* Le carbone : une trame de fibre de carbone, et un reflet qui la balaie de temps en temps */
  SCENES.carbone={
    calques:function(box){
      var t=document.createElement("i");
      t.style.cssText="position:absolute;inset:0;opacity:.9;background:"+TRAME_CARBONE+";background-size:14px 14px";
      var reflet=document.createElement("i");
      reflet.style.cssText="position:absolute;top:-20%;bottom:-20%;left:0;width:45vw;will-change:transform;"
        +"background:linear-gradient(100deg,rgba(255,255,255,0) 0%,rgba(255,255,255,.07) 45%,rgba(56,189,248,.10) 50%,rgba(255,255,255,.07) 55%,rgba(255,255,255,0) 100%);"
        +"animation:cbReflet 11s cubic-bezier(.45,.05,.35,1) infinite";
      var bord=document.createElement("i");
      bord.style.cssText="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 40%,rgba(0,0,0,0) 40%,rgba(0,0,0,.55) 100%)";
      box.appendChild(t); box.appendChild(reflet); box.appendChild(bord);
    },
    css:"@keyframes cbReflet{0%{transform:translateX(-60vw) skewX(-12deg)}55%,100%{transform:translateX(130vw) skewX(-12deg)}}",
    vignette:function(c, W, H){
      c.fillStyle="#15181D"; c.fillRect(0, 0, W, H);
      for(var y=0;y<H;y+=7) for(var x=0;x<W;x+=7){
        var pair=((x/7+y/7)%2)===0, g=c.createLinearGradient(x, y, x+(pair?7:0), y+(pair?0:7));
        g.addColorStop(0, "#2A2F37"); g.addColorStop(.5, "#3A404A"); g.addColorStop(1, "#22262D");
        c.fillStyle=g; c.fillRect(x+.5, y+.5, 6, 6);
      }
      var r=c.createLinearGradient(W*.2, 0, W*.7, H); r.addColorStop(0, "rgba(255,255,255,0)"); r.addColorStop(.5, "rgba(255,255,255,.12)"); r.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle=r; c.fillRect(0, 0, W, H);
    }
  };
  /* la fibre : des carrés en damier, chacun dégradé dans le sens de sa fibre */
  var TRAME_CARBONE=
    "linear-gradient(27deg,#151719 5px,transparent 5px) 0 5px,"
    +"linear-gradient(207deg,#151719 5px,transparent 5px) 10px 0,"
    +"linear-gradient(27deg,#222428 5px,transparent 5px) 0 10px,"
    +"linear-gradient(207deg,#222428 5px,transparent 5px) 10px 5px,"
    +"linear-gradient(90deg,#1b1d20 10px,transparent 10px),"
    +"linear-gradient(#1d1f22 25%,#1a1c1f 25%,#1a1c1f 50%,transparent 50%,transparent 75%,#242629 75%,#242629)";

  /* la ville : dessinée en SVG par l'accueil ; ici seulement sa vignette */
  SCENES.ville={ vignette:function(c, W, H){
    var r=hasard(7), x=0;
    c.lineWidth=1;
    while(x<W){
      var w=8+r()*14, h=H*(.25+r()*.55);
      c.fillStyle="rgba(10,14,20,.5)"; c.fillRect(x, H-h, w, h);
      c.strokeStyle="rgba(34,211,238,.8)"; c.strokeRect(x+.5, H-h+.5, w-1, h);
      for(var k=0;k<5;k++) if(r()<.4){ c.fillStyle="rgba(253,230,138,.6)"; c.fillRect(x+2+r()*(w-5), H-h+4+r()*(h-8), 2, 2); }
      x+=w+2+r()*4;
    }
    c.strokeStyle="rgba(251,146,60,.9)"; c.beginPath(); c.moveTo(W*.62, H); c.lineTo(W*.62, H*.15); c.lineTo(W*.9, H*.15); c.stroke();
  }};

  var LISTE=[
    ["reseaux", "Les réseaux", "Câbles et tuyaux aux couleurs du logo, des impulsions qui y courent"],
    ["ville", "La ville en chantier", "Immeubles, chantier et grue, qui défilent lentement"],
    ["constellation", "Constellation", "Des points de lumière qui se relient, attirés par la souris"],
    ["ondes", "Ondes", "Des lignes de lumière qui ondulent, comme un signal"],
    ["horizon", "Horizon néon", "Une grille de lumière qui file sous un soleil couchant"],
    ["hexagones", "Hexagones", "Une ruche fine dont les alvéoles s'allument tour à tour"],
    ["aurore", "Aurore", "De grandes nappes de couleur qui se mêlent lentement"],
    ["carbone", "Carbone", "Une fibre de carbone et son reflet, sobre et élégante"]
  ];

  /* ---------- le moteur ---------- */
  var SOURIS={x:null, y:null};
  window.addEventListener("pointermove", function(e){ if(e.pointerType==="mouse"){ SOURIS.x=e.clientX; SOURIS.y=e.clientY; } }, {passive:true});
  document.addEventListener("pointerleave", function(){ SOURIS.x=SOURIS.y=null; });
  var EN_COURS=null;
  function calme(){ try{ return matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){ return false; } }
  function feuilleDeStyle(){
    if(document.getElementById("fondsAnimCss")) return;
    var st=document.createElement("style"); st.id="fondsAnimCss";
    st.textContent=".fa-boite{position:absolute;inset:0;overflow:hidden;pointer-events:none}.fa-boite>i{display:block}"
      +".fa-toile{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}"
      +Object.keys(SCENES).map(function(k){ return SCENES[k].css||""; }).join("")
      +"@media (prefers-reduced-motion:reduce){.fa-boite>i{animation:none!important}}";
    (document.head||document.documentElement).appendChild(st);
  }
  function arreter(){
    if(!EN_COURS) return;
    EN_COURS.fini=true;
    if(EN_COURS.raf) cancelAnimationFrame(EN_COURS.raf);
    if(EN_COURS.boite && EN_COURS.boite.parentNode) EN_COURS.boite.parentNode.removeChild(EN_COURS.boite);
    window.removeEventListener("resize", EN_COURS.surTaille);
    document.removeEventListener("visibilitychange", EN_COURS.surVue);
    EN_COURS=null;
  }
  function demarrer(conteneur, nom){
    arreter();
    var sc=SCENES[nom]; if(!conteneur || !sc || (!sc.image && !sc.calques)) return null;
    feuilleDeStyle();
    var boite=document.createElement("div"); boite.className="fa-boite fa-"+nom; boite.setAttribute("aria-hidden", "true");
    /* avant le voile du haut : le voile garde le haut lisible */
    var voile=conteneur.querySelector(".ciel-voile");
    conteneur.insertBefore(boite, voile || null);
    var m={nom:nom, boite:boite, fini:false};
    EN_COURS=m;
    if(sc.calques){ sc.calques(boite); return m; }
    var toile=document.createElement("canvas"); toile.className="fa-toile"; boite.appendChild(toile);
    var ctx=toile.getContext("2d"), etat=null, W=0, H=0, dpr=1, derniere=0;
    function taille(){
      W=Math.max(320, conteneur.clientWidth||window.innerWidth); H=Math.max(320, conteneur.clientHeight||window.innerHeight);
      /* une résolution plafonnée : au plus 1,5, et au plus 2,4 millions de points */
      dpr=Math.min(window.devicePixelRatio||1, 1.5, Math.sqrt(2400000/(W*H)));
      toile.width=Math.round(W*dpr); toile.height=Math.round(H*dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      etat=sc.init(ctx, W, H);
    }
    function dessiner(t){
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      sc.image(ctx, W, H, t, etat);
    }
    var intervalle=1000/(W*H > 1600000 ? 24 : 30);
    function boucle(ms){
      if(m.fini) return;
      m.raf=requestAnimationFrame(boucle);
      if(document.hidden || ms-derniere < intervalle) return;
      /* fond masqué (thème clair, anthracite) : rien à dessiner */
      if(!boite.getClientRects().length) return;
      derniere=ms;
      dessiner(ms/1000);
    }
    m.surTaille=function(){ clearTimeout(m.tT); m.tT=setTimeout(function(){ if(m.fini) return; taille(); intervalle=1000/(W*H > 1600000 ? 24 : 30); dessiner(performance.now()/1000); }, 200); };
    m.surVue=function(){ if(!document.hidden) derniere=0; };
    window.addEventListener("resize", m.surTaille);
    document.addEventListener("visibilitychange", m.surVue);
    taille();
    intervalle=1000/(W*H > 1600000 ? 24 : 30);
    dessiner(performance.now()/1000);
    if(!calme()) m.raf=requestAnimationFrame(boucle);
    return m;
  }
  /* une vignette fixe, sur le ciel du soir, pour choisir dans Mon compte */
  function apercu(nom, toile){
    var sc=SCENES[nom]; if(!sc || !toile) return;
    var W=toile.clientWidth||toile.width, H=toile.clientHeight||toile.height, d=Math.min(2, window.devicePixelRatio||1);
    toile.width=Math.round(W*d); toile.height=Math.round(H*d);
    var c=toile.getContext("2d"); c.setTransform(d, 0, 0, d, 0, 0);
    var g=c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1E2338"); g.addColorStop(.55, "#452B43"); g.addColorStop(1, "#653626");
    c.fillStyle=nom==="carbone" ? "#15181D" : g; c.fillRect(0, 0, W, H);
    if(sc.vignette){ sc.vignette(c, W, H); return; }
    /* les scènes du canevas : dessinées comme sur un grand écran, puis réduites */
    var grand=document.createElement("canvas"), GW=960, GH=Math.round(960*H/W);
    grand.width=GW; grand.height=GH;
    var gc=grand.getContext("2d"), e=sc.init(gc, GW, GH);
    sc.image(gc, GW, GH, 3.2, e);
    c.drawImage(grand, 0, 0, W, H);
  }
  window.FondsAnim={demarrer:demarrer, arreter:arreter, apercu:apercu, LISTE:LISTE,
    existe:function(n){ return LISTE.some(function(x){ return x[0]===n; }); }};
})();
