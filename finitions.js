/* =====================================================================
   finitions.js — trois petits mouvements, communs aux pages
   ---------------------------------------------------------------------
   1. L'onglet qui glisse : dans la barre d'onglets d'une fiche (nav#nav),
      la pastille de l'onglet choisi glisse d'un bouton à l'autre au lieu
      de sauter. Elle reprend la couleur que la page donne à l'onglet
      actif : rien ne change d'aspect, seul le passage est animé.
   2. Les compteurs : Finitions.compter(el, n, suffixe) fait monter un
      chiffre depuis zéro la première fois qu'il s'affiche, puis l'écrit
      sans bruit ; Finitions.remplir(barre, pct) fait de même pour une
      jauge.
   3. Le halo : sur ordinateur, les cartes cliquables (tableau de bord,
      accueil) s'éclairent doucement sous le pointeur. Rien au doigt.
   Si le téléphone demande moins d'animations, tout reste immobile.
   ===================================================================== */
(function(){
  "use strict";
  if(window.Finitions) return;
  var calme = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var raf = window.requestAnimationFrame || function(f){ return setTimeout(function(){ f(Date.now()); }, 16); };

  var css = document.createElement("style");
  css.id = "finitionsCss"; css.setAttribute("data-theme-propre", "");
  css.textContent =
    "nav.fin-glisse{position:relative}" +
    "nav.fin-glisse>button{position:relative;z-index:1}" +
    "nav.fin-glisse>button[aria-current=\"true\"]{background:transparent!important;box-shadow:none!important}" +
    ".fin-curseur{position:absolute;left:0;top:0;z-index:0;pointer-events:none;will-change:transform,width}" +
    ".fin-curseur.fin-anime{transition:transform .36s cubic-bezier(.3,1.25,.5,1),width .36s cubic-bezier(.3,1.25,.5,1),height .2s ease}" +
    ".fin-lueur{position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;opacity:0;transition:opacity .25s ease;" +
    "background:radial-gradient(240px circle at var(--fin-x,50%) var(--fin-y,50%),rgba(251,146,60,.16),transparent 62%)}" +
    "html.theme-clair .fin-lueur{background:radial-gradient(240px circle at var(--fin-x,50%) var(--fin-y,50%),rgba(194,86,12,.09),transparent 62%)}" +
    ".fin-halo-on>.fin-lueur{opacity:1}" +
    "@media (prefers-reduced-motion:reduce){.fin-curseur.fin-anime{transition:none}.fin-lueur{display:none}}";
  (document.head || document.documentElement).appendChild(css);

  /* ---------- 1. l'onglet qui glisse ---------- */
  function glisser(nav){
    if(nav.__fin) return;
    nav.__fin = true;
    var cur = document.createElement("span");
    cur.className = "fin-curseur"; cur.setAttribute("aria-hidden", "true");
    var pret = false, couleurs = null;

    function actif(){ return nav.querySelector(':scope > button[aria-current="true"]'); }
    /* l'aspect de l'onglet actif, tel que la page (et le thème) le dessine */
    function lireCouleurs(){
      var b = actif(); if(!b) return;
      /* sans transition le temps de lire : sinon on lirait la couleur en plein fondu */
      var avant = b.style.transition;
      b.style.transition = "none";
      nav.classList.remove("fin-glisse");
      var st = getComputedStyle(b);
      couleurs = {fond:st.backgroundColor, ombre:st.boxShadow, rayon:st.borderRadius, image:st.backgroundImage};
      nav.classList.add("fin-glisse");
      void b.offsetWidth;
      b.style.transition = avant;
      cur.style.background = couleurs.image && couleurs.image !== "none" ? couleurs.image : couleurs.fond;
      cur.style.boxShadow = couleurs.ombre && couleurs.ombre !== "none" ? couleurs.ombre : "";
      cur.style.borderRadius = couleurs.rayon;
    }
    function placer(anime){
      var b = actif();
      if(!b || !b.offsetWidth || !nav.offsetWidth){ cur.style.opacity = "0"; return; }
      if(!couleurs) lireCouleurs();
      cur.classList.toggle("fin-anime", !!anime && pret && !calme);
      cur.style.opacity = "1";
      cur.style.width = b.offsetWidth + "px";
      cur.style.height = b.offsetHeight + "px";
      cur.style.transform = "translate(" + b.offsetLeft + "px," + b.offsetTop + "px)";
      pret = true;
    }
    function demarrer(){
      if(!actif()) return false;
      if(cur.parentNode !== nav) nav.insertBefore(cur, nav.firstChild);
      lireCouleurs(); placer(false);
      return true;
    }
    demarrer();
    try{
      new MutationObserver(function(ms){
        var bouge = ms.some(function(m){ return m.target !== cur; });
        if(!bouge) return;
        if(cur.parentNode !== nav){ pret = false; demarrer(); return; }
        placer(true);
      }).observe(nav, {attributes:true, attributeFilter:["aria-current", "hidden"], subtree:true, childList:true});
    }catch(e){}
    if(window.ResizeObserver){ try{ new ResizeObserver(function(){ placer(false); }).observe(nav); }catch(e){} }
    window.addEventListener("resize", function(){ placer(false); });
    window.addEventListener("theme", function(){ couleurs = null; placer(false); });
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ placer(false); });
  }
  function chercherBarres(){
    var n = document.getElementById("nav");
    if(n && n.tagName === "NAV") glisser(n);
  }

  /* ---------- 2. les compteurs ---------- */
  function compter(el, vers, suffixe){
    if(!el) return;
    suffixe = suffixe || "";
    var n = Number(vers);
    var jeton = (el.__finJeton = (el.__finJeton || 0) + 1);
    if(el.__finVu || calme || !isFinite(n) || n <= 0 || n !== Math.round(n)){
      el.__finVu = true; el.textContent = String(vers) + suffixe; return;
    }
    el.__finVu = true;
    var debut = null, duree = Math.min(1100, 600 + n * 25);
    el.textContent = "0" + suffixe;
    raf(function pas(t){
      if(el.__finJeton !== jeton) return;
      if(debut === null) debut = t;
      var x = Math.min(1, (t - debut) / duree);
      el.textContent = Math.round(n * (1 - Math.pow(1 - x, 3))) + suffixe;
      if(x < 1) raf(pas);
    });
  }
  function remplir(barre, pct){
    if(!barre) return;
    var v = Math.max(0, Math.min(100, Number(pct) || 0)) + "%";
    if(barre.__finVu || calme){ barre.__finVu = true; barre.style.width = v; return; }
    barre.__finVu = true;
    barre.style.width = "0";
    raf(function(){ raf(function(){ barre.style.width = v; }); });
  }

  /* ---------- 3. le halo sous le pointeur ---------- */
  var HALO = ".case-tb,.bulle-tb,.tuile-t,.tuile,.ch-ligne,.o-large,.carte-halo";
  var souris = !!(window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches);
  if(souris && !calme){
    var actuel = null;
    var lueur = function(c){
      var l = c.lastElementChild;
      if(l && l.classList.contains("fin-lueur")) return;
      if(getComputedStyle(c).position === "static") c.style.position = "relative";
      var s = document.createElement("span"); s.className = "fin-lueur"; s.setAttribute("aria-hidden", "true");
      c.appendChild(s);
    };
    var quitter = function(){ if(actuel){ actuel.classList.remove("fin-halo-on"); actuel = null; } };
    document.addEventListener("pointermove", function(e){
      if(e.pointerType && e.pointerType !== "mouse") return;
      var c = e.target && e.target.closest ? e.target.closest(HALO) : null;
      if(c && c.closest("#vitrine")) c = null;
      if(c !== actuel){ quitter(); if(c){ lueur(c); c.classList.add("fin-halo-on"); actuel = c; } }
      if(c){
        var r = c.getBoundingClientRect();
        c.style.setProperty("--fin-x", (e.clientX - r.left) + "px");
        c.style.setProperty("--fin-y", (e.clientY - r.top) + "px");
      }
    }, {passive:true});
    document.addEventListener("pointerleave", quitter);
    window.addEventListener("blur", quitter);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", chercherBarres);
  else chercherBarres();
  /* une barre construite plus tard (la fiche se dessine après lecture) */
  window.addEventListener("load", chercherBarres);

  window.Finitions = {compter:compter, remplir:remplir, glisser:glisser};
})();
