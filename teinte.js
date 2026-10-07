/* =====================================================================
   teinte.js — la couleur et l'épaisseur du crayon, comme sur l'iPad
   ---------------------------------------------------------------------
   Le panneau « Couleurs » d'Apple, partout où l'on écrit (relevé, notes,
   annotation des photos et croquis) :
   - Grille (gris et teintes, du sombre au clair), Spectre (on glisse le
     doigt sur l'arc-en-ciel), Curseurs (trichromie : rouge, vert, bleu,
     et le code) ;
   - l'opacité, de 0 à 100 % ;
   - la couleur en cours, et « + » pour la garder dans « mes couleurs » ;
   - les cinq épaisseurs du crayon, dessinées comme sur l'Apple Pencil
     (ou les cinq tailles du texte).
   Tout s'applique tout de suite (rappel « change »). La couleur rendue est
   « #RRGGBB », ou « #RRGGBBAA » quand l'opacité est sous 100 %.

   Teinte.ouvrir({ancre, couleur, taille, tailles:[5 valeurs], texte:false,
                  titreTaille, change:function(couleur, taille){}, fermer:function(){}})
   Teinte.fermer() · Teinte.pastille(couleur) · Teinte.lire("#RRGGBBAA") → {r,g,b,a}
   ===================================================================== */
(function(){
  "use strict";
  if(window.Teinte) return;
  var CLE_FAV="teinte:mes-couleurs", CLE_ONGLET="teinte:onglet";

  var css=document.createElement("style");
  css.setAttribute("data-theme-propre","");     /* le même panneau sombre, en clair comme en sombre */
  var DAMIER="background-image:linear-gradient(45deg,#BDBDBD 25%,transparent 25%,transparent 75%,#BDBDBD 75%),linear-gradient(45deg,#BDBDBD 25%,transparent 25%,transparent 75%,#BDBDBD 75%);background-size:14px 14px;background-position:0 0,7px 7px;background-color:#F4F4F4;";
  css.textContent=
    ".tn-fond{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.28)}"+
    ".tn{position:fixed;z-index:2147483001;width:344px;max-width:calc(100vw - 16px);box-sizing:border-box;background:#1C1C1E;color:#F2F2F7;"+
      "border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:14px 16px 16px;font:15px/1.3 -apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,sans-serif;"+
      "max-height:calc(100vh - 16px);overflow-y:auto;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}"+
    ".tn .tn-tete{display:flex;align-items:center;gap:8px;margin-bottom:12px}"+
    ".tn .tn-tete b{flex:1;text-align:center;font-size:17px;font-weight:600}"+
    ".tn .tn-rond{width:44px;height:44px;border-radius:50%;border:0;background:#2C2C2E;color:#F2F2F7;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;flex:0 0 auto}"+
    ".tn .tn-rond svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}"+
    ".tn .tn-rond.vide{visibility:hidden}"+
    ".tn .tn-seg{display:flex;background:#2C2C2E;border-radius:10px;padding:2px;margin-bottom:12px}"+
    ".tn .tn-seg button{flex:1;min-height:34px;border:0;border-radius:8px;background:none;color:#F2F2F7;font:inherit;font-size:14px;cursor:pointer}"+
    ".tn .tn-seg button[aria-selected=\"true\"]{background:#636366;font-weight:600}"+
    ".tn .tn-grille{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));border-radius:12px;overflow:hidden}"+
    ".tn .tn-grille button{aspect-ratio:1;border:0;border-radius:0;padding:0;margin:0;cursor:pointer;position:relative;min-height:22px;-webkit-appearance:none;appearance:none}"+
    ".tn .tn-grille button[aria-pressed=\"true\"]{outline:3px solid #fff;outline-offset:-3px;box-shadow:inset 0 0 0 5px #111;z-index:1}"+
    ".tn .tn-spectre{position:relative;height:220px;border-radius:12px;overflow:hidden;touch-action:none;cursor:crosshair}"+
    ".tn .tn-spectre canvas{width:100%;height:100%;display:block}"+
    ".tn .tn-spectre i{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5);pointer-events:none}"+
    ".tn .tn-curs{display:grid;grid-template-columns:22px 1fr 44px;align-items:center;gap:10px 10px}"+
    ".tn .tn-curs b{font-size:13px;color:#AEAEB2;text-align:center}"+
    ".tn .tn-curs span{font:600 13px ui-monospace,Menlo,monospace;text-align:right;color:#F2F2F7}"+
    ".tn .tn-hex{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;color:#AEAEB2;font-size:13px}"+
    ".tn .tn-hex input{width:120px;min-height:36px;border-radius:10px;border:0;background:#2C2C2E;color:#F2F2F7;font:600 15px ui-monospace,Menlo,monospace;text-align:center;text-transform:uppercase}"+
    ".tn h3{margin:16px 0 8px;font-size:12.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#8E8E93}"+
    ".tn input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:34px;border-radius:17px;margin:0;background:#3A3A3C;outline-offset:3px}"+
    ".tn input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:34px;height:34px;border-radius:50%;background:transparent;border:4px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.45)}"+
    ".tn input[type=range]::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:transparent;border:4px solid #fff}"+
    ".tn .tn-op{display:flex;align-items:center;gap:12px}"+
    ".tn .tn-op .piste{flex:1;border-radius:17px;"+DAMIER+"}"+
    ".tn .tn-op .val{min-width:62px;min-height:34px;border-radius:17px;background:#2C2C2E;display:flex;align-items:center;justify-content:center;font-size:15px}"+
    ".tn .tn-ep{display:flex;gap:6px;justify-content:space-between;background:#2C2C2E;border-radius:18px;padding:8px}"+
    ".tn .tn-ep button{flex:1;min-height:52px;border:0;border-radius:12px;background:none;cursor:pointer;color:#F2F2F7;display:flex;align-items:center;justify-content:center;padding:0}"+
    ".tn .tn-ep button svg{width:40px;height:34px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round}"+
    ".tn .tn-ep button[aria-pressed=\"true\"]{background:#F2F2F7;color:#111}"+
    ".tn .tn-ep button b{font-weight:700;line-height:1}"+
    ".tn .tn-bas{display:flex;align-items:flex-start;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid #38383A}"+
    ".tn .tn-cour{width:72px;height:72px;border-radius:20px;flex:0 0 auto;position:relative;overflow:hidden;"+DAMIER+"}"+
    ".tn .tn-cour i{position:absolute;inset:0}"+
    ".tn .tn-favs{display:flex;flex-wrap:wrap;gap:10px;align-items:center;min-height:44px}"+
    ".tn .tn-favs button{width:34px;height:34px;border-radius:50%;border:0;padding:0;cursor:pointer;position:relative;overflow:hidden;"+DAMIER+"}"+
    ".tn .tn-favs button i{position:absolute;inset:0}"+
    ".tn .tn-favs button[aria-pressed=\"true\"]{box-shadow:0 0 0 2px #1C1C1E,0 0 0 4px #F2F2F7}"+
    ".tn .tn-favs .plus{background:#E5E5EA;color:#1C1C1E;display:flex;align-items:center;justify-content:center}"+
    ".tn .tn-favs .plus svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round}"+
    ".tn-pastille{width:28px;height:28px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);padding:0;cursor:pointer;flex:0 0 auto;"+
      "background:conic-gradient(#ff3b30,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff2d55,#ff3b30);position:relative}"+
    ".tn-pastille i{position:absolute;inset:6px;border-radius:50%;border:1.5px solid #fff}";
  (document.head||document.documentElement).appendChild(css);

  /* ---------- les couleurs ---------- */
  function h2(n){ n=Math.max(0, Math.min(255, Math.round(n))); return (n<16?"0":"")+n.toString(16); }
  function ecrire(r,g,b,a){ var x="#"+h2(r)+h2(g)+h2(b); if(a!=null && a<0.995) x+=h2(a*255); return x.toUpperCase(); }
  function lire(h){
    var m=/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(h||"").trim()); if(!m) return {r:17,g:17,b:17,a:1};
    var x=m[1]; if(x.length===3) x=x.replace(/./g,"$&$&");
    return {r:parseInt(x.slice(0,2),16), g:parseInt(x.slice(2,4),16), b:parseInt(x.slice(4,6),16), a:x.length===8 ? parseInt(x.slice(6,8),16)/255 : 1};
  }
  function hsl(h, s, l){
    s/=100; l/=100; var k=function(n){ return (n+h/30)%12; }, a=s*Math.min(l,1-l);
    var f=function(n){ return l-a*Math.max(-1, Math.min(k(n)-3, 9-k(n), 1)); };
    return [Math.round(f(0)*255), Math.round(f(8)*255), Math.round(f(4)*255)];
  }
  /* la grille d'Apple : une ligne de gris, puis douze teintes du plus sombre au plus clair */
  var TEINTES=[195,222,250,278,330,4,18,32,44,56,68,95];
  var LUM=[[85,14],[80,24],[78,34],[76,44],[82,54],[88,62],[90,70],[88,78],[86,86]];
  var GRILLE=[];
  (function(){
    var l=[]; for(var i=0;i<12;i++){ var v=Math.round(255*(1-i/11)); l.push(ecrire(v,v,v)); } GRILLE.push(l);
    LUM.forEach(function(sl){ GRILLE.push(TEINTES.map(function(h){ var c=hsl(h, sl[0], sl[1]); return ecrire(c[0],c[1],c[2]); })); });
  })();

  function lu(cle, def){ try{ var v=JSON.parse(localStorage.getItem(cle)||"null"); return v==null ? def : v; }catch(e){ return def; } }
  function garde(cle, v){ try{ localStorage.setItem(cle, JSON.stringify(v)); }catch(e){} }
  function favoris(){ var l=lu(CLE_FAV, []); return Array.isArray(l) ? l.filter(function(c){ return /^#[0-9A-F]{6}([0-9A-F]{2})?$/i.test(c); }).slice(0,14) : []; }

  function el(t, c, txt){ var e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; }
  function svg(d){ return '<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>'; }

  var OUVERT=null;
  function fermer(){
    if(!OUVERT) return;
    var o=OUVERT; OUVERT=null;
    o.fond.remove(); o.boite.remove();
    document.removeEventListener("keydown", o.clavier, true);
    if(o.opt.fermer) try{ o.opt.fermer(); }catch(e){}
    if(o.opt.ancre && o.opt.ancre.isConnected && o.opt.ancre.focus) try{ o.opt.ancre.focus({preventScroll:true}); }catch(e){}
  }

  function ouvrir(opt){
    fermer();
    opt=opt||{};
    var c0=lire(opt.couleur||"#111111"), r=c0.r, g=c0.g, b=c0.b, a=c0.a;
    var aTaille=typeof opt.taille==="number", taille=aTaille ? opt.taille : 0;
    var tailles=opt.tailles && opt.tailles.length ? opt.tailles.slice(0,5) : null;
    if(aTaille && !tailles){
      var mn=opt.min||1, mx=opt.max||20; tailles=[0,1,2,3,4].map(function(i){ return Math.round(mn*Math.pow(mx/mn, i/4)*10)/10; });
    }

    var fond=el("div","tn-fond"), bx=el("div","tn");
    bx.setAttribute("role","dialog"); bx.setAttribute("aria-modal","true"); bx.setAttribute("aria-label","Couleurs");
    /* en-tête : la pipette (si l'appareil la permet), « Couleurs », la croix */
    var tete=el("div","tn-tete"), pip=el("button","tn-rond tn-pipette"), titre=el("b","","Couleurs"), x=el("button","tn-rond tn-x");
    pip.type="button"; x.type="button";
    pip.innerHTML=svg('<path d="M14.5 4.5l5 5M17 2.5a2.1 2.1 0 0 1 3 3l-3 3-3-3z"/><path d="M14 8.5 6 16.5 4.5 21 9 19.5l8-8"/>');
    pip.setAttribute("aria-label","Prendre une couleur à l'écran");
    x.innerHTML=svg('<path d="M6 6l12 12M18 6 6 18"/>'); x.setAttribute("aria-label","Fermer");
    if(!window.EyeDropper) pip.classList.add("vide");
    tete.appendChild(pip); tete.appendChild(titre); tete.appendChild(x); bx.appendChild(tete);

    /* Grille · Spectre · Curseurs */
    var seg=el("div","tn-seg"); seg.setAttribute("role","tablist");
    var vues={}, boutons={};
    [["grille","Grille"],["spectre","Spectre"],["curseurs","Curseurs"]].forEach(function(o){
      var bt=el("button","",o[1]); bt.type="button"; bt.setAttribute("role","tab"); bt.dataset.vue=o[0];
      bt.addEventListener("click", function(){ montrer(o[0]); });
      seg.appendChild(bt); boutons[o[0]]=bt;
      var v=el("div","tn-vue"); v.dataset.vue=o[0]; vues[o[0]]=v;
    });
    bx.appendChild(seg);
    Object.keys(vues).forEach(function(k){ bx.appendChild(vues[k]); });

    /* la grille */
    var grille=el("div","tn-grille");
    GRILLE.forEach(function(ligne){ ligne.forEach(function(c){
      var bt=document.createElement("button"); bt.type="button"; bt.style.background=c; bt.dataset.c=c; bt.setAttribute("aria-label","Couleur "+c);
      bt.addEventListener("click", function(){ var v=lire(c); r=v.r; g=v.g; b=v.b; peindre(true); });
      grille.appendChild(bt);
    }); });
    vues.grille.appendChild(grille);

    /* le spectre : la teinte de gauche à droite, du blanc (haut) au noir (bas) */
    var spec=el("div","tn-spectre"), scv=document.createElement("canvas"), mire=el("i");
    spec.appendChild(scv); spec.appendChild(mire); vues.spectre.appendChild(spec);
    var specPrete=false;
    function dessinerSpectre(){
      var w=spec.clientWidth||312, h=spec.clientHeight||220, d=Math.min(2, window.devicePixelRatio||1);
      scv.width=Math.round(w*d); scv.height=Math.round(h*d);
      var c=scv.getContext("2d"), gh=c.createLinearGradient(0,0,scv.width,0);
      for(var i=0;i<=12;i++){ var q=hsl(i*30, 100, 50); gh.addColorStop(i/12, "rgb("+q.join(",")+")"); }
      c.fillStyle=gh; c.fillRect(0,0,scv.width,scv.height);
      var gv=c.createLinearGradient(0,0,0,scv.height);
      gv.addColorStop(0,"rgba(255,255,255,1)"); gv.addColorStop(.5,"rgba(255,255,255,0)"); gv.addColorStop(.5,"rgba(0,0,0,0)"); gv.addColorStop(1,"rgba(0,0,0,1)");
      c.fillStyle=gv; c.fillRect(0,0,scv.width,scv.height);
      specPrete=true;
    }
    function prendreSpectre(e){
      var q=scv.getBoundingClientRect(), px=Math.max(0, Math.min(q.width-1, e.clientX-q.left)), py=Math.max(0, Math.min(q.height-1, e.clientY-q.top));
      var d=scv.getContext("2d").getImageData(Math.round(px*scv.width/q.width), Math.round(py*scv.height/q.height), 1, 1).data;
      r=d[0]; g=d[1]; b=d[2]; mire.style.left=px+"px"; mire.style.top=py+"px"; mire.hidden=false; peindre(true);
    }
    var tire=null;
    spec.addEventListener("pointerdown", function(e){ e.preventDefault(); tire=e.pointerId; try{ spec.setPointerCapture(e.pointerId); }catch(z){} prendreSpectre(e); });
    spec.addEventListener("pointermove", function(e){ if(e.pointerId===tire) prendreSpectre(e); });
    spec.addEventListener("pointerup", function(){ tire=null; });
    spec.addEventListener("pointercancel", function(){ tire=null; });
    mire.hidden=true;

    /* les curseurs : la trichromie, et le code */
    var cz=el("div","tn-curs"), curs=[], vals=[];
    [["R","Rouge"],["V","Vert"],["B","Bleu"]].forEach(function(o, i){
      var lab=el("b","",o[0]); lab.title=o[1];
      var rg=document.createElement("input"); rg.type="range"; rg.min="0"; rg.max="255"; rg.step="1"; rg.setAttribute("aria-label", o[1]+" (0 à 255)");
      var v=el("span");
      rg.addEventListener("input", function(){ var n=+rg.value; if(i===0) r=n; else if(i===1) g=n; else b=n; peindre(true); });
      cz.appendChild(lab); cz.appendChild(rg); cz.appendChild(v); curs.push(rg); vals.push(v);
    });
    var hx=el("label","tn-hex"); hx.appendChild(document.createTextNode("Code de la couleur"));
    var hin=document.createElement("input"); hin.type="text"; hin.maxLength=7; hin.spellcheck=false; hin.setAttribute("aria-label","Code de la couleur");
    hin.addEventListener("change", function(){ var v=lire(hin.value); r=v.r; g=v.g; b=v.b; peindre(true); });
    hx.appendChild(hin); cz.appendChild(hx);
    vues.curseurs.appendChild(cz);

    /* l'opacité */
    bx.appendChild(el("h3","","Opacité"));
    var op=el("div","tn-op"), piste=el("div","piste"), ro=document.createElement("input"), ov=el("div","val");
    ro.type="range"; ro.min="0"; ro.max="100"; ro.step="1"; ro.setAttribute("aria-label","Opacité");
    ro.addEventListener("input", function(){ a=Math.max(.05, +ro.value/100); peindre(true); });
    piste.appendChild(ro); op.appendChild(piste); op.appendChild(ov); bx.appendChild(op);

    /* les cinq épaisseurs (ou tailles du texte) */
    var ep=null;
    if(aTaille){
      bx.appendChild(el("h3","", opt.titreTaille || (opt.texte ? "Taille du texte" : "Épaisseur")));
      ep=el("div","tn-ep");
      tailles.forEach(function(v, i){
        var bt=el("button"); bt.type="button"; bt.dataset.t=String(v);
        bt.setAttribute("aria-label", (opt.texte ? "Taille " : "Épaisseur ")+(i+1)+" sur 5");
        if(opt.texte) bt.innerHTML='<b style="font-size:'+(12+i*4.5)+'px">Aa</b>';
        else bt.innerHTML='<svg viewBox="0 0 40 34" aria-hidden="true" style="stroke-width:'+[1.6,3,4.6,6.6,9][i]+'"><path d="M7 26c2-8 5-17 8-17 2.5 0-1 12 2 12 3 0 4-8 7-8 2.5 0 2 9 5 11 2 1.4 4 1 6 0"/></svg>';
        bt.addEventListener("click", function(){ taille=v; peindre(true); });
        ep.appendChild(bt);
      });
      bx.appendChild(ep);
    }

    /* la couleur en cours, et « mes couleurs » */
    var bas=el("div","tn-bas"), cour=el("div","tn-cour"), ci=el("i"); cour.appendChild(ci);
    var favs=el("div","tn-favs");
    bas.appendChild(cour); bas.appendChild(favs); bx.appendChild(bas);
    function peindreFavs(){
      favs.textContent="";
      var plus=el("button","plus"); plus.type="button"; plus.innerHTML=svg('<path d="M12 5v14M5 12h14"/>'); plus.setAttribute("aria-label","Garder cette couleur");
      plus.addEventListener("click", function(){ var c=couleur(), l=favoris().filter(function(x){ return x.toUpperCase()!==c; }); l.unshift(c); garde(CLE_FAV, l.slice(0,14)); peindreFavs(); peindre(false); });
      favs.appendChild(plus);
      favoris().forEach(function(c){
        var bt=el("button"); bt.type="button"; bt.dataset.c=c.toUpperCase(); var i=el("i"); i.style.background=c; bt.appendChild(i);
        bt.setAttribute("aria-label","Ma couleur "+c);
        bt.addEventListener("click", function(){ var v=lire(c); r=v.r; g=v.g; b=v.b; a=v.a; peindre(true); });
        favs.appendChild(bt);
      });
    }
    peindreFavs();

    function couleur(){ return ecrire(r,g,b,a); }
    function peindre(prevenir){
      var c=couleur(), plein=ecrire(r,g,b);
      ci.style.background=c;
      Array.prototype.forEach.call(grille.children, function(x){ x.setAttribute("aria-pressed", x.dataset.c===plein ? "true" : "false"); });
      Array.prototype.forEach.call(favs.querySelectorAll("button[data-c]"), function(x){ x.setAttribute("aria-pressed", x.dataset.c===c ? "true" : "false"); });
      var rgb=[r,g,b];
      curs.forEach(function(rg, i){
        var lo=rgb.slice(), hi=rgb.slice(); lo[i]=0; hi[i]=255;
        rg.value=String(rgb[i]); vals[i].textContent=String(rgb[i]);
        rg.style.background="linear-gradient(90deg,"+ecrire(lo[0],lo[1],lo[2])+","+ecrire(hi[0],hi[1],hi[2])+")";
      });
      if(document.activeElement!==hin) hin.value=plein;
      ro.value=String(Math.round(a*100)); ov.textContent=Math.round(a*100)+" %";
      ro.style.background="linear-gradient(90deg,rgba("+r+","+g+","+b+",0),rgb("+r+","+g+","+b+"))";
      if(ep){
        var proche=tailles.reduce(function(m, v){ return Math.abs(v-taille)<Math.abs(m-taille) ? v : m; }, tailles[0]);
        Array.prototype.forEach.call(ep.children, function(x){ x.setAttribute("aria-pressed", +x.dataset.t===proche ? "true" : "false"); });
      }
      if(prevenir && opt.change) try{ opt.change(c, aTaille ? taille : undefined); }catch(e){}
    }
    function montrer(v){
      Object.keys(vues).forEach(function(k){ vues[k].hidden = k!==v; boutons[k].setAttribute("aria-selected", k===v ? "true" : "false"); });
      garde(CLE_ONGLET, v);
      if(v==="spectre" && !specPrete) requestAnimationFrame(dessinerSpectre);
    }

    function placer(){
      var W=bx.offsetWidth, H=bx.offsetHeight, an=opt.ancre && opt.ancre.getBoundingClientRect ? opt.ancre.getBoundingClientRect() : null, px, py;
      if(window.innerWidth < 560 || !an){ px=(window.innerWidth-W)/2; py=Math.max(8, window.innerHeight-H-8); }
      else { px=Math.max(8, Math.min(window.innerWidth-W-8, an.left+an.width/2-W/2)); py = an.top-H-10 >= 8 ? an.top-H-10 : Math.min(window.innerHeight-H-8, an.bottom+10); }
      bx.style.left=Math.round(px)+"px"; bx.style.top=Math.round(Math.max(8,py))+"px";
    }
    pip.addEventListener("click", function(){
      if(!window.EyeDropper) return;
      try{ new window.EyeDropper().open().then(function(res){ var v=lire(res.sRGBHex); r=v.r; g=v.g; b=v.b; peindre(true); }).catch(function(){}); }catch(e){}
    });
    fond.addEventListener("pointerdown", function(e){ e.preventDefault(); fermer(); });
    x.addEventListener("click", fermer);
    var clavier=function(e){ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); fermer(); } };
    document.addEventListener("keydown", clavier, true);
    /* le panneau ne laisse pas passer les gestes au dessin dessous */
    ["pointerdown","pointermove","pointerup","touchstart","touchmove","click"].forEach(function(t){ bx.addEventListener(t, function(e){ e.stopPropagation(); }); });
    document.body.appendChild(fond); document.body.appendChild(bx);
    OUVERT={fond:fond, boite:bx, opt:opt, clavier:clavier};
    var onglet=lu(CLE_ONGLET, "grille"); montrer(/^(grille|spectre|curseurs)$/.test(onglet) ? onglet : "grille");
    peindre(false); placer();
    setTimeout(function(){ try{ x.focus({preventScroll:true}); }catch(e){} }, 20);
  }

  function pastille(c){
    var x=document.createElement("button"); x.type="button"; x.className="tn-pastille";
    x.setAttribute("aria-label","Couleurs et épaisseur"); x.title="Couleurs (grille, spectre, curseurs) et épaisseur";
    var i=document.createElement("i"); if(c) i.style.background=c; x.appendChild(i);
    return x;
  }

  window.Teinte={ouvrir:ouvrir, fermer:fermer, pastille:pastille, lire:lire, ecrire:ecrire, _ouvert:function(){ return !!OUVERT; }};
})();
