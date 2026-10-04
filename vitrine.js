/* =====================================================================
   vitrine.js — les gestes de la page de présentation
   ---------------------------------------------------------------------
   - « Se connecter » : la vitrine s'efface, le formulaire apparaît ;
     le retour arrière du téléphone ramène la vitrine.
   - « Demander une démo » / « Être rappelé » : le même, formulaire de
     demande d'accès ouvert, message prérempli.
   - « Découvrir Suivi travaux 360 », sous la connexion : le chemin inverse.
   - Les métiers défilent sans couture (la liste est doublée, la copie
     est muette pour les lecteurs d'écran) ; les blocs montent à
     l'apparition. Rien ne bouge si le téléphone demande moins
     d'animations.
   ===================================================================== */
(function(){
  "use strict";
  var html = document.documentElement, V = document.getElementById("vitrine");
  if(!V) return;
  function $(id){ return document.getElementById(id); }
  function connecte(){
    try{ var s = JSON.parse(localStorage.getItem("outils:session") || "null"); return !!(s && s.jeton); }catch(e){ return false; }
  }
  var fin = window.matchMedia && matchMedia("(pointer: fine)").matches;

  /* déjà connecté (arrivé par ?vitrine) : le bouton ouvre l'application */
  if(connecte()) V.querySelectorAll('[data-vt="connexion"]').forEach(function(b){ b.textContent = "Ouvrir l'application"; });

  /* ---------- les métiers, doublés pour un défilement continu ---------- */
  V.querySelectorAll(".vt-rail").forEach(function(r){
    Array.prototype.slice.call(r.children).forEach(function(c){
      var k = c.cloneNode(true); k.setAttribute("aria-hidden", "true"); r.appendChild(k);
    });
  });

  /* ---------- les blocs montent quand ils arrivent à l'écran ---------- */
  var blocs = V.querySelectorAll(".vt-monte");
  if("IntersectionObserver" in window){
    html.classList.add("vt-js");
    /* dans une même grille, un léger décalage de l'un à l'autre */
    blocs.forEach(function(b){
      var freres = Array.prototype.filter.call(b.parentNode.children, function(x){ return x.classList.contains("vt-monte"); });
      var i = freres.indexOf(b);
      if(i > 0) b.style.transitionDelay = Math.min(i, 8) * 50 + "ms";
    });
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("vt-vu"); io.unobserve(e.target); } });
    }, {rootMargin:"0px 0px -6% 0px"});
    blocs.forEach(function(b){ io.observe(b); });
  }

  /* ---------- vers la connexion ---------- */
  function versConnexion(mode){
    html.classList.remove("vitrine-on");
    try{ history.pushState({vitrine:false}, "", "#connexion"); }catch(e){}
    window.scrollTo(0, 0);
    if(mode === "demo"){
      var b = $("blocDemande");
      if(b){
        b.hidden = false;
        var m = $("d_msg");
        if(m && !m.value) m.value = "Je souhaite une démonstration de Suivi travaux 360.";
        setTimeout(function(){
          b.scrollIntoView({block:"start", behavior:"auto"});
          if(fin && $("d_nom")) $("d_nom").focus({preventScroll:true});
        }, 40);
      }
      return;
    }
    if(!fin) return;                          /* au doigt, pas de clavier qui surgit */
    var soc = $("soc"), u = $("u");
    var champ = soc && !soc.value ? soc : u;
    if(champ && $("vueConnexion") && !$("vueConnexion").hidden) champ.focus();
  }
  var doux = !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  V.addEventListener("click", function(e){
    /* les ancres de la barre : on défile, sans toucher à l'historique */
    var a = e.target.closest('a[href^="#"]');
    if(a){
      var cible = document.getElementById(a.getAttribute("href").slice(1));
      if(cible){
        e.preventDefault();
        if(cible === V) window.scrollTo({top:0, behavior: doux ? "smooth" : "auto"});
        else cible.scrollIntoView({block:"start", behavior: doux ? "smooth" : "auto"});
      }
      return;
    }
    var b = e.target.closest("[data-vt]");
    if(!b) return;
    e.preventDefault();
    versConnexion(b.getAttribute("data-vt"));
  });

  /* ---------- et retour ---------- */
  function versVitrine(){
    html.classList.add("vitrine-on");
    window.scrollTo(0, 0);
  }
  document.querySelectorAll("[data-vt-retour]").forEach(function(a){
    a.addEventListener("click", function(e){
      e.preventDefault();
      try{ history.pushState({vitrine:true}, "", location.pathname); }catch(x){}
      versVitrine();
    });
  });
  /* l'état de chaque pas d'historique ; sans état, celui de l'arrivée */
  var auDepart = html.classList.contains("vitrine-on");
  window.addEventListener("popstate", function(e){
    if(connecte()) return;
    var montrer = e.state && typeof e.state.vitrine === "boolean" ? e.state.vitrine : auDepart;
    if(montrer !== html.classList.contains("vitrine-on")){
      if(montrer) versVitrine(); else html.classList.remove("vitrine-on");
    }
  });
})();
