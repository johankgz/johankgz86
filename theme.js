/* =====================================================================
   theme.js — le mode clair ou sombre, selon le téléphone ou l'heure
   ---------------------------------------------------------------------
   « Mon compte » › « Apparence » (réglage propre à l'appareil) :
     auto    comme le téléphone (clair ou sombre dans ses réglages) — par défaut
     heure   clair le jour (de 7 h à 20 h), sombre le soir et la nuit
     sombre  toujours sombre        clair  toujours clair
   Le site est dessiné en sombre : un châssis graphite, des fiches blanches
   dessus. En clair, le châssis s'éclaircit (fonds sombres → gris très clairs,
   textes clairs → foncés, filets blancs → filets foncés) et les fiches
   blanches ne bougent pas. Le changement se fait dans les feuilles de style
   elles-mêmes, à l'ouverture de la page, et se défait si le mode change en
   cours de route (le téléphone bascule, ou 20 h sonne).
   Chargé tôt dans <head> : pas d'éclair sombre à l'ouverture en clair.
   ===================================================================== */
(function(){
  var CLE="site:theme", MATIN=7, SOIR=20, FOND="#F4F6FB";
  var mq=null; try{ mq=window.matchMedia("(prefers-color-scheme: dark)"); }catch(e){}
  function reglage(){ var v=null; try{ v=localStorage.getItem(CLE); }catch(e){} return /^(auto|heure|sombre|clair)$/.test(v||"") ? v : "auto"; }
  function veutClair(m){
    /* une page qui reste sombre (le plan DWG : un écran de dessin, comme AutoCAD) */
    if(document.documentElement.hasAttribute("data-theme-fixe")) return document.documentElement.getAttribute("data-theme-fixe")==="clair";
    m=m||reglage();
    if(m==="clair") return true;
    if(m==="sombre") return false;
    if(m==="heure"){ var h=new Date().getHours(); return h>=MATIN && h<SOIR; }
    return !(mq && mq.matches);
  }

  /* ---------- les couleurs ---------- */
  function hsl(r, g, b){
    r/=255; g/=255; b/=255;
    var mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2, h=0, s=0, d=mx-mn;
    if(d){ s = l>.5 ? d/(2-mx-mn) : d/(mx+mn);
      h = mx===r ? (g-b)/d+(g<b ? 6 : 0) : mx===g ? (b-r)/d+2 : (r-g)/d+4; h/=6; }
    return [h, s, l];
  }
  function rgb(h, s, l){
    function f(p, q, t){ if(t<0) t+=1; if(t>1) t-=1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; }
    if(!s) return [l*255, l*255, l*255];
    var q = l<.5 ? l*(1+s) : l+s-l*s, p=2*l-q;
    return [f(p,q,h+1/3)*255, f(p,q,h)*255, f(p,q,h-1/3)*255];
  }
  function ecrire(c, a){
    var r=Math.round(c[0]), g=Math.round(c[1]), b=Math.round(c[2]);
    return a>=1 ? "rgb("+r+", "+g+", "+b+")" : "rgba("+r+", "+g+", "+b+", "+(Math.round(a*1000)/1000)+")";
  }
  var NOMS={white:[255,255,255], black:[0,0,0]};
  var RE=/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,\/]\s*([\d.]+%?))?\s*\)|\b(white|black)\b/gi;
  function lire(m){
    var r, g, b, a=1;
    if(m[1]){
      var x=m[1]; if(x.length<5) x=x.replace(/./g, "$&$&");
      r=parseInt(x.slice(0,2),16); g=parseInt(x.slice(2,4),16); b=parseInt(x.slice(4,6),16); if(x.length===8) a=parseInt(x.slice(6,8),16)/255;
    } else if(m[2]){
      var v=function(t, mx){ return /%$/.test(t) ? parseFloat(t)*mx/100 : parseFloat(t); };
      r=v(m[2],255); g=v(m[3],255); b=v(m[4],255); if(m[5]!=null) a=v(m[5],1);
    } else { var n=NOMS[m[6].toLowerCase()]; r=n[0]; g=n[1]; b=n[2]; }
    return {r:r, g:g, b:b, a:a};
  }
  /* un fond : le sombre devient très clair (en gardant l'ordre : plus haut, plus clair) */
  var VOILE=false;     /* la règle couvre tout l'écran (le fond d'une fenêtre) : son voile sombre reste sombre */
  function fond(c){
    var t=hsl(c.r, c.g, c.b), h=t[0], s=t[1], l=t[2];
    if(c.a>=.85){
      if(l<.32 && (s<.55 || l<.12)) return ecrire(rgb(h, s*.55, Math.min(.985, .905+l*.28)), c.a);
      return null;
    }
    /* verre sombre (cartes posées sur l'animation) → verre clair */
    if(l<.3 && s<.55 && c.a>=.15) return VOILE ? null : ecrire(rgb(h, s*.4, .985), Math.min(.94, .5+c.a));
    if(l>.8 && s<.3) return ecrire([12, 18, 28], Math.max(.03, c.a*.75));       /* voile blanc sur graphite → voile foncé */
    return null;
  }
  /* un texte : le clair devient foncé (le plus clair, le plus foncé) */
  function texte(c){
    var t=hsl(c.r, c.g, c.b), l=t[2];
    if(l<=.5) return null;
    return ecrire(rgb(t[0], t[1], .1+(1-l)*.8), c.a);
  }
  /* un filet : blanc translucide → foncé translucide ; graphite opaque → gris clair */
  function filet(c){
    var t=hsl(c.r, c.g, c.b), s=t[1], l=t[2];
    if(c.a<.5 && l>.75 && s<.3) return ecrire([12, 18, 28], Math.max(.08, Math.min(.2, c.a*.9)));
    if(c.a>=.5 && l<.32 && s<.55) return ecrire(rgb(t[0], s*.5, .8+l*.35), c.a);
    return null;
  }
  /* une ombre : moins lourde sur fond clair ; une lueur blanche s'efface */
  function ombre(c){
    var l=hsl(c.r, c.g, c.b)[2];
    if(l<.3) return ecrire([c.r, c.g, c.b], c.a*.35);
    if(l>.8) return ecrire([c.r, c.g, c.b], 0);
    return null;
  }
  function recolorer(val, f){
    var change=false;
    var out=val.replace(RE, function(){ var n=f(lire(arguments)); if(n==null) return arguments[0]; change=true; return n; });
    return change ? out : null;
  }

  /* ---------- quelle sorte de propriété ---------- */
  function sorte(p){
    if(/^background/.test(p)) return "fond";
    if(/^(color|caret-color|-webkit-text-fill-color|text-decoration-color|fill|stroke)$/.test(p)) return "texte";
    if(/^(border|outline|column-rule)/.test(p)) return "filet";
    if(/shadow$/.test(p)) return "ombre";
    return null;
  }
  var FN_CLAIR={fond:fond, texte:texte, filet:filet, ombre:ombre}, FN=FN_CLAIR;

  /* ---------- en sombre : les fiches aussi ----------
     Les fiches blanches deviennent graphite, un cran plus claires que le châssis
     (les champs un cran encore), les textes foncés deviennent clairs, les filets
     clairs deviennent sombres. Ce qui doit rester sur du blanc (dessin, signature,
     aperçu d'un PDF ou d'une étiquette, QR code, impression) ne bouge pas. */
  function fondNuit(c){
    var t=hsl(c.r, c.g, c.b), h=t[0], s=t[1], l=t[2];
    if(c.a>=.6 && l>.8){
      /* blanc → bleu nuit, à peine plus clair que le fond ; gris clair → un cran plus clair */
      if(s<.35) return ecrire(rgb(.61, .42, .105+(1-l)*.5), c.a);
      return ecrire(rgb(h, Math.min(s, .6)*.6, .15+(1-l)*.45), c.a);         /* teinte pâle (bleu doux, vert doux) → teinte sombre */
    }
    return null;
  }
  function texteNuit(c){
    var t=hsl(c.r, c.g, c.b), l=t[2], s=t[1];
    if(l>=.5) return null;
    /* une couleur vive (l'orange de la marque, un vert, un rouge) : elle sert aussi de fond
       aux boutons, sous un texte blanc ; on la garde (à peine éclaircie si elle est très sombre) */
    if(s>=.4) return VIVE_GARDEE ? null : (l<.32 ? ecrire(rgb(t[0], s, .5), c.a) : null);
    return ecrire(rgb(t[0], Math.min(1, s*.95), .93-l*.55), c.a);
  }
  var VIVE_GARDEE=false;     /* une variable (--accent…) : sa couleur vive ne bouge pas du tout */
  function filetNuit(c){
    var t=hsl(c.r, c.g, c.b), s=t[1], l=t[2];
    if(c.a>=.5 && l>.7) return ecrire(rgb(t[0], s*.5, .3+(1-l)*.25), c.a);
    if(c.a<.5 && l<.3) return ecrire([255, 255, 255], Math.max(.06, Math.min(.16, c.a*1.1)));
    return null;
  }
  var FN_NUIT={fond:fondNuit, texte:texteNuit, filet:filetNuit, ombre:function(){ return null; }};
  /* ce qui reste clair, même en sombre */
  var GARDE_CLAIR=/canvas|signature|\bsig|annot|\ban[-_]|croquis|apercu|aperçu|vignette|\bqr|pdf|visionneuse|papier|feuille-a4|planche|cartouche|\betq|etiq-vue|impression|\bprint\b|toile|ardoise|tableau-blanc|carte-qr/i;
  /* avec var(), le navigateur garde la valeur sur le raccourci (background, border…) et laisse les détails vides */
  var RACCOURCIS=["background", "border", "border-top", "border-right", "border-bottom", "border-left", "border-color", "outline", "border-block", "border-inline", "border-block-start", "border-block-end"];
  function proprietes(st){
    var l=[], k;
    for(k=0;k<st.length;k++) l.push(st[k]);
    RACCOURCIS.forEach(function(p){ var v=st.getPropertyValue(p); if(v && v.indexOf("var(")>=0 && l.indexOf(p)<0) l.push(p); });
    return l;
  }

  /* ---------- parcourir les feuilles ---------- */
  var FAITS=[], VUES=[], USAGE={};
  function regles(feuille, cb){
    var l; try{ l=feuille.cssRules; }catch(e){ return; }
    if(!l) return;
    for(var i=0;i<l.length;i++){
      var r=l[i];
      if(r.style) cb(r);
      if(r.cssRules) regles(r, cb);
      if(r.media && r.media.mediaText && /prefers-color-scheme\s*:\s*dark/.test(r.media.mediaText)) cb(r, "media");
    }
  }
  /* les variables (--g-900…) : rangées d'après leur emploi (fond, texte, filet) dans les feuilles */
  function noterUsages(feuille){
    regles(feuille, function(r, genre){
      if(genre) return;
      var st=r.style, ps=proprietes(st);
      for(var k=0;k<ps.length;k++){
        var p=ps[k], s=sorte(p); if(!s) continue;
        var v=st.getPropertyValue(p), m, re=/var\(\s*(--[\w-]+)/g;
        while((m=re.exec(v))){ var u=USAGE[m[1]]||(USAGE[m[1]]={}); u[s]=(u[s]||0)+1; }
      }
    });
  }
  function sorteVariable(nom){
    var u=USAGE[nom]; if(!u) return null;
    /* l'emploi le plus fréquent (à égalité, le fond) ; les autres emplois reçoivent la couleur d'origine, en dur */
    var tri=Object.keys(u).sort(function(a, b){ return u[b]-u[a] || (a==="fond" ? -1 : b==="fond" ? 1 : 0); });
    return tri[0];
  }
  var ORIG={};
  function origines(){
    var cs=getComputedStyle(html);
    Object.keys(USAGE).forEach(function(n){ if(!(n in ORIG)) ORIG[n]=cs.getPropertyValue(n).trim(); });
  }
  /* var(--g-900) dans un texte, alors que --g-900 devient un fond clair : on y remet le graphite d'origine */
  function figer(v, s){
    return v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/g, function(t, n){
      var sv=sorteVariable(n), o=ORIG[n];
      if(!sv || sv===s || !o) return t;
      RE.lastIndex=0; return RE.test(o) ? o : t;
    });
  }
  /* ---------- l'en-tête bleu nuit ----------
     Le site est dessiné en sombre ; en clair, tout s'éclaircit… sauf l'en-tête,
     qui reste foncé (bleu nuit) avec ses textes clairs. Une règle qui ne vise que
     des éléments de l'en-tête (header h1, header .ref…) garde donc ses couleurs
     d'origine ; ses variables (--g-900…) reprennent leur valeur sombre. */
  var ENTETE={};
  function sansPseudo(t){ return t.replace(/::?[a-zA-Z-]+(\((?:[^()]|\([^()]*\))*\))?/g, ""); }
  function regleEntete(sel){
    if(!sel) return false;
    if(sel in ENTETE) return ENTETE[sel];
    var vu=false, ok=true;
    sel.split(",").forEach(function(part){
      if(!ok) return;
      var p=sansPseudo(part).trim(); if(!p){ ok=false; return; }
      var l; try{ l=document.querySelectorAll(p); }catch(e){ ok=false; return; }
      /* une partie qui ne vise rien sur cette page (.menu-link d'une autre page) ne compte pas */
      if(!l.length){ if(/(^|[\s>+~])header\b/.test(p)) vu=true; return; }
      for(var i=0;i<l.length;i++){ if(!l[i].closest || !l[i].closest("header")){ ok=false; return; } }
      vu=true;
    });
    return (ENTETE[sel] = ok && vu);
  }
  function figerTout(v){
    return v.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/g, function(t, n){
      var o=ORIG[n]; if(!o) return t; RE.lastIndex=0; return RE.test(o) ? o : t;
    });
  }
  function convertir(feuille){
    if(VUES.indexOf(feuille)>=0) return;
    VUES.push(feuille);
    regles(feuille, function(r, genre){
      if(genre==="media"){ if(FN===FN_NUIT) return; FAITS.push({media:r.media, avant:r.media.mediaText}); r.media.mediaText="not all"; return; }
      if(FN===FN_CLAIR && !SANS_NUIT && regleEntete(r.selectorText)){
        /* l'en-tête reste sombre : ses variables gardent leur valeur d'origine */
        var se=r.style, pe=proprietes(se);
        pe.forEach(function(p){
          if(p.indexOf("--")===0) return;
          var v=se.getPropertyValue(p); if(!v || v.indexOf("var(")<0) return;
          var n=figerTout(v); if(n===v) return;
          var prio=se.getPropertyPriority(p);
          FAITS.push({st:se, p:p, avant:v, prio:prio});
          try{ se.setProperty(p, n, prio); }catch(e){}
        });
        return;
      }
      if(FN===FN_NUIT){
        if(GARDE_CLAIR.test(r.selectorText||"")) return;
        for(var pr=r.parentRule; pr; pr=pr.parentRule) if(pr.media && /print/.test(pr.media.mediaText||"")) return;
      }
      var st=r.style, props=proprietes(st);
      VOILE = st.top==="0px" && st.left==="0px" && (st.right==="0px" || st.bottom==="0px");
      /* un texte blanc sur un fond de couleur (bouton orange, pastille) garde son blanc */
      var fondVif=false;
      ["background-color", "background-image", "background"].forEach(function(p){
        var v=st.getPropertyValue(p); if(!v) return;
        var m; RE.lastIndex=0;
        while((m=RE.exec(v))){ var c=lire(m), t=hsl(c.r, c.g, c.b); if(c.a>=.6 && t[1]>=.45 && t[2]>.2 && t[2]<.75) fondVif=true; }
        if(/var\(--(accent|vert|rouge|data|ok|alerte|danger)/.test(v)) fondVif=true;
      });
      props.forEach(function(p){
        var s = p.indexOf("--")===0 ? sorteVariable(p) : sorte(p);
        if(!s || (s==="texte" && fondVif && p.indexOf("--")!==0)) return;
        var v=st.getPropertyValue(p); if(!v || v.indexOf("url(")>=0 && !/gradient/.test(v)) return;
        var v2 = p.indexOf("--")===0 ? v : figer(v, s);
        VIVE_GARDEE = p.indexOf("--")===0;
        var n=recolorer(v2, FN[s]); VIVE_GARDEE=false; if(n==null){ if(v2===v) return; n=v2; }
        var prio=st.getPropertyPriority(p);
        FAITS.push({st:st, p:p, avant:v, prio:prio});
        try{ st.setProperty(p, n, prio); }catch(e){}
      });
    });
  }
  function toutConvertir(){
    var fs=document.styleSheets, i;
    if(html.hasAttribute("data-theme-fixe")) return;
    /* une feuille marquée data-theme-propre porte déjà ses deux versions (vitrine.css) */
    function propre(f){ return f.ownerNode && f.ownerNode.hasAttribute && f.ownerNode.hasAttribute("data-theme-propre"); }
    for(i=0;i<fs.length;i++) if(VUES.indexOf(fs[i])<0 && !propre(fs[i])) noterUsages(fs[i]);
    origines();
    for(i=0;i<fs.length;i++) if(!propre(fs[i])) convertir(fs[i]);
  }
  /* une page dont l'en-tête est clair par nature (data-entete="clair") */
  var SANS_NUIT=document.documentElement.getAttribute("data-entete")==="clair";
  function toutDefaire(){
    for(var i=FAITS.length-1;i>=0;i--){
      var f=FAITS[i];
      try{ if(f.media) f.media.mediaText=f.avant; else f.st.setProperty(f.p, f.avant, f.prio); }catch(e){}
    }
    FAITS=[]; VUES=[]; USAGE={}; ORIG={}; ENTETE={};
  }

  /* ---------- appliquer ---------- */
  var html=document.documentElement, CLAIR=false, attente=null, FICHES_EN_ATTENTE=false, DEJA=false;
  /* ce que les règles ne savent pas faire : les fonds animés laissent place à un fond clair uni */
  var css=document.createElement("style"); css.id="themeClair";
  /* ses couleurs sont déjà les bonnes, en clair comme en sombre : la conversion n'y touche pas */
  css.setAttribute("data-theme-propre","");
  css.textContent=
    "html.theme-clair{color-scheme:light}html.theme-attente{background:"+FOND+"}"
    +"html.theme-clair .ciel,html.theme-clair #fondPlan,html.theme-clair .fond-outils{background:"+FOND+"!important}"
    +"html.theme-clair .ciel>*,html.theme-clair #fondPlan>*,html.theme-clair .fond-outils>*{display:none!important}"
    +"html.theme-attente body{visibility:hidden}"
    +"html.theme-sombre{color-scheme:dark}"
    /* sous l'heure et la batterie (appli installée sur iPhone, iPad) : une bande bleu nuit pleine, pas le flou du système */
    +".barre-etat{position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,0px);background:#0B1220;z-index:2147483000;pointer-events:none}"
    /* l'en-tête bleu nuit, en clair comme en sombre */
    +"html:not([data-theme-fixe]):not([data-entete=clair]) header{background:linear-gradient(160deg,#0B1220 0%,#172554 62%,#1E3A8A 100%)!important;"
    +"border-bottom-color:rgba(255,255,255,.08)!important;color:#E2E8F0}"
    /* « Menu », ☰ et le titre : lisibles sur le bleu nuit, quel que soit le dessin de la page */
    +"html:not([data-theme-fixe]):not([data-entete=clair]) header a[href='./index.html'],html:not([data-theme-fixe]):not([data-entete=clair]) header .nv-paire>a{"
    +"background:rgba(255,255,255,.10)!important;border:1px solid rgba(255,255,255,.18)!important;color:#EDF1F6!important;box-shadow:none!important}"
    +"html:not([data-theme-fixe]):not([data-entete=clair]) header h1,html:not([data-theme-fixe]):not([data-entete=clair]) header .np-titre{color:#F8FAFC!important}"
    /* en sombre : un halo bleu en haut de page, des fiches bordées d'un filet de lumière */
    +"html.fiches-sombres body{background-image:radial-gradient(900px 520px at 0% -8%,rgba(37,99,235,.20),transparent 62%),radial-gradient(760px 460px at 105% 4%,rgba(6,182,212,.10),transparent 60%)!important;background-attachment:fixed!important}"
    +"html.fiches-sombres .block,html.fiches-sombres .carte,html.fiches-sombres .tuile,html.fiches-sombres .travaux{border:1px solid rgba(148,180,255,.09)!important;"
    +"box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 10px 28px -18px rgba(0,0,0,.7)!important}"
    /* en verre : les fiches laissent voir le fond (sans flou, léger pour l'ordinateur) */
    +"html.fiches-verre .block,html.fiches-verre .carte,html.fiches-verre .tuile,html.fiches-verre .travaux{background:rgba(22,26,32,.58)!important;border:1px solid rgba(255,255,255,.10)!important;box-shadow:none!important}";
  (document.head||html).appendChild(css);
  (function barreEtat(){
    if(!document.body){ document.addEventListener("DOMContentLoaded", barreEtat, {once:true}); return; }
    if(document.querySelector(".barre-etat")) return;
    var b=document.createElement("div"); b.className="barre-etat"; b.setAttribute("aria-hidden","true");
    document.body.appendChild(b);
  })();
  function metaCouleur(){
    var m=document.querySelector('meta[name="theme-color"]'); if(!m) return;
    if(!m.dataset.sombre) m.dataset.sombre=m.getAttribute("content")||"";
    /* l'en-tête est bleu nuit, en clair comme en sombre : la barre du téléphone aussi */
    var nuit = !html.hasAttribute("data-theme-fixe") && html.getAttribute("data-entete")!=="clair";
    m.setAttribute("content", nuit ? "#0B1220" : (CLAIR ? FOND : m.dataset.sombre));
  }
  /* en sombre, les fiches : sombres (par défaut), blanches (comme avant) ou en verre */
  var CLE_FICHES="site:fiches";
  function fiches(){ var v=null; try{ v=localStorage.getItem(CLE_FICHES); }catch(e){} return /^(sombres|blanches|verre)$/.test(v||"") ? v : "sombres"; }
  var FICHES_APPLIQUEES="";
  function appliquer(){
    var c=veutClair(), f=c ? "" : fiches();
    /* rien n'a changé depuis la dernière fois : on ne refait rien */
    if(DEJA && c===CLAIR && f===FICHES_APPLIQUEES) return;
    DEJA=true; CLAIR=c; FICHES_APPLIQUEES=f;
    html.classList.toggle("theme-clair", c);
    html.classList.toggle("theme-sombre", !c);
    ["sombres","blanches","verre"].forEach(function(x){ html.classList.toggle("fiches-"+x, !c && f===x); });
    toutDefaire();
    if(!c){
      metaCouleur();
      if(f==="blanches"){ try{ window.dispatchEvent(new CustomEvent("theme", {detail:{clair:c}})); }catch(e){} return; }
      FN=FN_NUIT;
      if(document.readyState==="loading"){
        FICHES_EN_ATTENTE=true;
        html.classList.add("theme-attente");
        clearTimeout(attente); attente=setTimeout(function(){ html.classList.remove("theme-attente"); }, 1500);
        document.addEventListener("DOMContentLoaded", function(){
          FICHES_EN_ATTENTE=false;
          try{ if(!CLAIR && FN===FN_NUIT) toutConvertir(); } finally { clearTimeout(attente); html.classList.remove("theme-attente"); }
        }, {once:true});
      } else toutConvertir();
      try{ window.dispatchEvent(new CustomEvent("theme", {detail:{clair:c}})); }catch(e){}
      return;
    }
    FN=FN_CLAIR;
    if(c){
      if(document.readyState==="loading"){
        /* pas encore toutes les feuilles : on cache le temps de les lire (une fraction de seconde) */
        html.classList.add("theme-attente");
        clearTimeout(attente); attente=setTimeout(function(){ html.classList.remove("theme-attente"); }, 1500);
        document.addEventListener("DOMContentLoaded", function(){
          try{ if(CLAIR) toutConvertir(); } finally { clearTimeout(attente); html.classList.remove("theme-attente"); }
        }, {once:true});
      } else toutConvertir();
    }
    metaCouleur();
    try{ window.dispatchEvent(new CustomEvent("theme", {detail:{clair:c}})); }catch(e){}
  }
  /* les feuilles ajoutées plus tard (une appli qui pose son style) */
  try{
    new MutationObserver(function(ms){
      if((!CLAIR && FN!==FN_NUIT) || document.readyState==="loading") return;
      var neuf=false;
      ms.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes, function(n){
        if(n.nodeName==="STYLE") neuf=true;
        if(n.nodeName==="LINK" && /stylesheet/.test(n.rel)) n.addEventListener("load", function(){ if(CLAIR || FN===FN_NUIT) toutConvertir(); });
      }); });
      if(neuf) toutConvertir();
    }).observe(html, {childList:true, subtree:true});
  }catch(e){}
  if(mq){ try{ mq.addEventListener("change", appliquer); }catch(e){ try{ mq.addListener(appliquer); }catch(e2){} } }
  setInterval(appliquer, 60000);
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) appliquer(); });
  window.addEventListener("storage", function(e){ if(e.key===CLE || e.key===CLE_FICHES) appliquer(); });

  window.theme={
    reglage:reglage,
    clair:function(){ return CLAIR; },
    choisir:function(m){ try{ if(m==="auto") localStorage.removeItem(CLE); else localStorage.setItem(CLE, m); }catch(e){} appliquer(); },
    fiches:fiches,
    choisirFiches:function(v){ try{ localStorage.setItem(CLE_FICHES, v); }catch(e){} appliquer(); },
    appliquer:appliquer
  };
  appliquer();
  /* la balise de couleur du téléphone vient après ce script, dans <head> */
  document.addEventListener("DOMContentLoaded", metaCouleur);
})();
