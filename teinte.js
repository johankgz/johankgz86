/* =====================================================================
   teinte.js — la couleur et la taille du crayon, partout pareil
   ---------------------------------------------------------------------
   Un petit panneau, ouvert depuis la palette du stylet (relevé, notes)
   ou de l'annotation (photos, croquis) :
   - un nuancier et les dernières couleurs employées ;
   - la trichromie : trois curseurs Rouge, Vert, Bleu (0 à 255) qui
     composent n'importe quelle couleur, avec son aperçu et son code ;
   - la taille du crayon (ou du texte), avec l'aperçu du trait.
   Tout changement s'applique tout de suite (rappel « change »).

   Teinte.ouvrir({ancre, couleur:"#RRGGBB", taille, min, max, pas,
                  titreTaille:"Taille du crayon", texte:false,
                  change:function(couleur, taille){}, fermer:function(){}})
   Teinte.fermer()
   Teinte.pastille(couleur) → un rond « arc-en-ciel » pour ouvrir le panneau
   ===================================================================== */
(function(){
  "use strict";
  if(window.Teinte) return;
  var NUANCIER=["#111111","#4B5563","#FFFFFF","#B91C1C","#E5484D","#EA7A1E","#F2A007","#FDE047",
                "#22C55E","#15803D","#06B6D4","#3B82F6","#1E3A8A","#7C3AED","#DB2777","#8B5E3C"];
  var CLE="teinte:recentes";

  var css=document.createElement("style");
  css.setAttribute("data-theme-propre","");     /* les mêmes couleurs en clair et en sombre */
  css.textContent=
    ".tn-fond{position:fixed;inset:0;z-index:2147483000;background:rgba(10,14,20,.25)}"+
    ".tn{position:fixed;z-index:2147483001;width:300px;max-width:calc(100vw - 16px);box-sizing:border-box;background:#FFFFFF;color:#1E2329;"+
      "border-radius:16px;box-shadow:0 18px 50px rgba(10,14,20,.35);padding:14px 14px 12px;font:14px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"+
      "max-height:calc(100vh - 16px);overflow-y:auto;-webkit-user-select:none;user-select:none}"+
    ".tn h3{margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#5C6570}"+
    ".tn .tn-tete{display:flex;align-items:center;gap:10px;margin-bottom:10px}"+
    ".tn .tn-ap{width:44px;height:44px;border-radius:12px;border:1px solid rgba(0,0,0,.12);flex:0 0 auto}"+
    ".tn .tn-code{flex:1;font:600 15px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em}"+
    ".tn .tn-ok{min-height:40px;padding:0 16px;border-radius:10px;border:0;background:#E2761B;color:#fff;font:inherit;font-weight:700;cursor:pointer}"+
    ".tn .tn-grille{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px;margin-bottom:10px}"+
    ".tn .tn-grille button{aspect-ratio:1;min-height:28px;border-radius:50%;border:1px solid rgba(0,0,0,.18);padding:0;cursor:pointer}"+
    ".tn .tn-grille button[aria-pressed=\"true\"]{box-shadow:0 0 0 2px #fff,0 0 0 4px #1E2329}"+
    ".tn .tn-rvb{display:grid;grid-template-columns:18px 1fr 34px;align-items:center;gap:6px 8px;margin-bottom:12px}"+
    ".tn .tn-rvb b{font-size:13px;text-align:center}"+
    ".tn .tn-rvb span{font:600 12.5px ui-monospace,Menlo,monospace;text-align:right;color:#3E4650}"+
    ".tn input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:26px;border-radius:13px;margin:0;background:#E5E7EB;outline-offset:3px}"+
    ".tn input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;border:2px solid #1E2329;box-shadow:0 1px 4px rgba(0,0,0,.3)}"+
    ".tn input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;border:2px solid #1E2329}"+
    ".tn .tn-taille{display:flex;align-items:center;gap:10px}"+
    ".tn .tn-trait{height:40px;flex:0 0 72px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:#F3F4F6}"+
    ".tn .tn-trait i{display:block;border-radius:999px}"+
    ".tn .tn-val{font:600 12.5px ui-monospace,Menlo,monospace;width:40px;text-align:right;color:#3E4650}"+
    ".tn-pastille{width:28px;height:28px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);padding:0;cursor:pointer;flex:0 0 auto;"+
      "background:conic-gradient(#ff3b30,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff2d55,#ff3b30);position:relative}"+
    ".tn-pastille i{position:absolute;inset:6px;border-radius:50%;border:1.5px solid #fff}";
  (document.head||document.documentElement).appendChild(css);

  function hex2(n){ n=Math.max(0, Math.min(255, Math.round(n))); return (n<16?"0":"")+n.toString(16); }
  function versHex(r,g,b){ return ("#"+hex2(r)+hex2(g)+hex2(b)).toUpperCase(); }
  function lireHex(h){
    var m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(h||"").trim()); if(!m) return [17,17,17];
    var x=m[1]; if(x.length===3) x=x.replace(/./g,"$&$&");
    return [parseInt(x.slice(0,2),16), parseInt(x.slice(2,4),16), parseInt(x.slice(4,6),16)];
  }
  function recentes(){ try{ var l=JSON.parse(localStorage.getItem(CLE)||"[]"); return Array.isArray(l) ? l.filter(function(c){ return /^#[0-9A-F]{6}$/i.test(c); }).slice(0,8) : []; }catch(e){ return []; } }
  function retenir(c){ try{ var l=recentes().filter(function(x){ return x.toUpperCase()!==c.toUpperCase(); }); l.unshift(c.toUpperCase()); localStorage.setItem(CLE, JSON.stringify(l.slice(0,8))); }catch(e){} }

  var OUVERT=null;
  function fermer(){
    if(!OUVERT) return;
    var o=OUVERT; OUVERT=null;
    o.fond.remove(); o.boite.remove();
    document.removeEventListener("keydown", o.clavier, true);
    if(o.opt.couleurTouchee) retenir(o.couleur());
    if(o.opt.fermer) try{ o.opt.fermer(); }catch(e){}
    if(o.opt.ancre && o.opt.ancre.focus) try{ o.opt.ancre.focus({preventScroll:true}); }catch(e){}
  }
  function el(t, c, txt){ var e=document.createElement(t); if(c) e.className=c; if(txt!=null) e.textContent=txt; return e; }

  function ouvrir(opt){
    fermer();
    opt=opt||{};
    var rvb=lireHex(opt.couleur||"#111111");
    var aTaille = typeof opt.taille==="number";
    var taille = aTaille ? opt.taille : 0;
    var fond=el("div","tn-fond"), b=el("div","tn");
    b.setAttribute("role","dialog"); b.setAttribute("aria-modal","true"); b.setAttribute("aria-label","Couleur et taille");
    var tete=el("div","tn-tete"), ap=el("div","tn-ap"), code=el("div","tn-code"), ok=el("button","tn-ok","OK"); ok.type="button";
    tete.appendChild(ap); tete.appendChild(code); tete.appendChild(ok); b.appendChild(tete);

    b.appendChild(el("h3","","Nuancier"));
    var grille=el("div","tn-grille"); b.appendChild(grille);
    var rec=recentes(), grilleRec=null;
    if(rec.length){ b.appendChild(el("h3","","Dernières couleurs")); grilleRec=el("div","tn-grille"); b.appendChild(grilleRec); }

    b.appendChild(el("h3","","Trichromie · rouge, vert, bleu"));
    var zone=el("div","tn-rvb"), curs=[], vals=[];
    [["R","Rouge"],["V","Vert"],["B","Bleu"]].forEach(function(x, i){
      var lab=el("b","",x[0]); lab.title=x[1];
      var r=document.createElement("input"); r.type="range"; r.min="0"; r.max="255"; r.step="1"; r.value=String(rvb[i]);
      r.setAttribute("aria-label", x[1]+" (0 à 255)");
      var v=el("span","",String(rvb[i]));
      r.addEventListener("input", function(){ rvb[i]=+r.value; opt.couleurTouchee=true; peindre(true); });
      zone.appendChild(lab); zone.appendChild(r); zone.appendChild(v); curs.push(r); vals.push(v);
    });
    b.appendChild(zone);

    var rTaille=null, trait=null, val=null;
    if(aTaille){
      b.appendChild(el("h3","", opt.titreTaille || "Taille du crayon"));
      var lt=el("div","tn-taille"); trait=el("div","tn-trait"); var ti=el("i"); trait.appendChild(ti);
      rTaille=document.createElement("input"); rTaille.type="range";
      rTaille.min=String(opt.min!=null ? opt.min : 1); rTaille.max=String(opt.max!=null ? opt.max : 20); rTaille.step=String(opt.pas||0.5);
      rTaille.value=String(taille); rTaille.setAttribute("aria-label", opt.titreTaille || "Taille du crayon");
      val=el("span","tn-val");
      rTaille.addEventListener("input", function(){ taille=+rTaille.value; peindre(true); });
      lt.appendChild(trait); lt.appendChild(rTaille); lt.appendChild(val); b.appendChild(lt);
    }

    function boutonCouleur(c, box){
      var x=document.createElement("button"); x.type="button"; x.style.background=c; x.title=c; x.setAttribute("aria-label","Couleur "+c);
      x.addEventListener("click", function(){ rvb=lireHex(c); opt.couleurTouchee=true; curs.forEach(function(r,i){ r.value=String(rvb[i]); }); peindre(true); });
      box.appendChild(x);
    }
    NUANCIER.forEach(function(c){ boutonCouleur(c, grille); });
    if(grilleRec) rec.forEach(function(c){ boutonCouleur(c, grilleRec); });

    function couleur(){ return versHex(rvb[0], rvb[1], rvb[2]); }
    function peindre(prevenir){
      var c=couleur();
      ap.style.background=c; code.textContent=c;
      /* chaque curseur montre où il mène : le dégradé de sa couleur, les deux autres fixées */
      curs.forEach(function(r, i){
        var a=rvb.slice(), z=rvb.slice(); a[i]=0; z[i]=255;
        r.style.background="linear-gradient(90deg,"+versHex(a[0],a[1],a[2])+","+versHex(z[0],z[1],z[2])+")";
        vals[i].textContent=String(rvb[i]);
      });
      Array.prototype.forEach.call(b.querySelectorAll(".tn-grille button"), function(x){ x.setAttribute("aria-pressed", x.title.toUpperCase()===c ? "true" : "false"); });
      if(aTaille){
        var ti=trait.firstChild, px=Math.max(1, Math.min(34, taille*(opt.echelle||1)));
        if(opt.texte){ ti.style.width="auto"; ti.style.height="auto"; ti.style.background="none"; ti.textContent="Aa"; ti.style.color=c; ti.style.font="700 "+Math.max(9, Math.min(34, px))+"px sans-serif"; ti.style.fontStyle="normal"; }
        else { ti.style.width="52px"; ti.style.height=px+"px"; ti.style.background=c; }
        val.textContent=(Math.round(taille*10)/10)+(opt.unite||"");
      }
      if(prevenir && opt.change) try{ opt.change(c, aTaille ? taille : undefined); }catch(e){}
    }

    function placer(){
      var W=b.offsetWidth, H=b.offsetHeight, a=opt.ancre && opt.ancre.getBoundingClientRect ? opt.ancre.getBoundingClientRect() : null;
      var x, y;
      if(window.innerWidth < 520 || !a){ x=(window.innerWidth-W)/2; y=Math.max(8, window.innerHeight-H-8); }
      else {
        x=Math.max(8, Math.min(window.innerWidth-W-8, a.left+a.width/2-W/2));
        y = a.top-H-10 >= 8 ? a.top-H-10 : Math.min(window.innerHeight-H-8, a.bottom+10);
      }
      b.style.left=Math.round(x)+"px"; b.style.top=Math.round(Math.max(8,y))+"px";
    }
    fond.addEventListener("pointerdown", function(e){ e.preventDefault(); fermer(); });
    ok.addEventListener("click", fermer);
    var clavier=function(e){ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); fermer(); } };
    document.addEventListener("keydown", clavier, true);
    /* le panneau ne laisse pas passer les gestes au dessin dessous */
    ["pointerdown","pointermove","pointerup","touchstart","touchmove","click"].forEach(function(t){ b.addEventListener(t, function(e){ e.stopPropagation(); }); });
    document.body.appendChild(fond); document.body.appendChild(b);
    OUVERT={fond:fond, boite:b, opt:opt, clavier:clavier, couleur:couleur};
    peindre(false); placer();
    setTimeout(function(){ try{ ok.focus({preventScroll:true}); }catch(e){} }, 20);
  }

  function pastille(c){
    var x=document.createElement("button"); x.type="button"; x.className="tn-pastille";
    x.setAttribute("aria-label","Couleur et taille du crayon"); x.title="Couleur (trichromie) et taille";
    var i=document.createElement("i"); if(c) i.style.background=c; x.appendChild(i);
    return x;
  }

  window.Teinte={ouvrir:ouvrir, fermer:fermer, pastille:pastille, versHex:versHex, lireHex:lireHex, _ouvert:function(){ return !!OUVERT; }};
})();
