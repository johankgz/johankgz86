/* =====================================================================
   une-page.js — les fiches sur une seule page, comme le suivi
   ---------------------------------------------------------------------
   Plus d'onglets à ouvrir un par un : toutes les parties de la fiche se
   suivent sur la même page, qu'on descend en remplissant. La barre du
   bas reste, comme un sommaire : toucher une partie y descend, et la
   partie où l'on se trouve s'allume en défilant. L'avancement « Étape 1
   sur 4 » et les boutons Préc. / Suiv. n'ont plus lieu d'être.

   UnePage.aller(nom, TABS, entree)
                              à appeler depuis showTab ; rend vrai au
                              premier appel (la page vient de s'ouvrir) ;
                              entree(nom) est rappelée quand on arrive
                              dans une partie en défilant
   UnePage.changer(TABS)      la fiche change de parties (le SAV passe de
                              l'appel à l'intervention) : celles qui
                              sortent se cachent, les nouvelles s'ouvrent
   ===================================================================== */
(function(){
  var TABS=null, premier=true, pause=0, attente=false, ENTREE=null, COURANTE="";

  function style(){
    if(document.getElementById("unePageStyle")) return;
    var st=document.createElement("style"); st.id="unePageStyle";
    st.textContent=[
      "body.une-page header .avance{display:none!important}",
      "body.une-page .stepnav{display:none!important}",
      "body.une-page section[id^='tab-'] .haut{display:none!important}",
      "body.une-page section.up-dernier .haut{display:block!important}",
      "body.une-page section.up-suite{margin-top:4px}",
      "body.une-page section.up-suite::before{content:attr(data-partie);display:block;margin:6px 2px 10px;padding-top:14px;"
        +"border-top:1px solid var(--rule,rgba(0,0,0,.12));font-size:12px;font-weight:700;letter-spacing:.08em;"
        +"text-transform:uppercase;color:var(--ink-3,#777)}"
    ].join("\n");
    document.head.appendChild(st);
  }
  function section(nom){ return document.getElementById("tab-"+nom); }
  function boutons(){ return document.querySelectorAll("#nav [data-tab]"); }
  function marquer(nom){
    Array.prototype.forEach.call(boutons(), function(b){ b.setAttribute("aria-current", b.dataset.tab===nom ? "true" : "false"); });
  }
  function hauteurEntete(){
    var h=document.querySelector("header");
    return h ? h.getBoundingClientRect().height : 0;
  }
  function marges(){
    var m=Math.round(hauteurEntete())+8;
    (TABS||[]).forEach(function(t){ var s=section(t[0]); if(s) s.style.scrollMarginTop=m+"px"; });
  }
  /* la partie sous l'en-tête s'allume dans la barre du bas */
  function suivre(){
    if(attente) return; attente=true;
    requestAnimationFrame(function(){
      attente=false;
      if(!TABS || Date.now()<pause) return;
      var lim=hauteurEntete()+60, cour=TABS[0][0];
      TABS.forEach(function(t){ var s=section(t[0]); if(s && !s.hidden && s.getBoundingClientRect().top<=lim) cour=t[0]; });
      /* tout en bas : la dernière partie, même courte */
      if(window.innerHeight+window.scrollY >= document.documentElement.scrollHeight-4) cour=TABS[TABS.length-1][0];
      marquer(cour);
      /* arrivé dans une nouvelle partie : elle se remet à jour (aperçu, récapitulatif, signatures) */
      if(cour!==COURANTE){ COURANTE=cour; if(ENTREE) try{ ENTREE(cour); }catch(e){} }
    });
  }
  function appliquer(tabs){
    TABS=tabs;
    tabs.forEach(function(t, i){
      var s=section(t[0]); if(!s) return;
      s.hidden=false; s.dataset.partie=t[1];
      s.classList.toggle("up-suite", i>0);
      s.classList.toggle("up-dernier", i===tabs.length-1);
    });
    marges();
  }
  function installer(tabs){
    style();
    document.body.classList.add("une-page");
    appliquer(tabs);
    window.addEventListener("scroll", suivre, {passive:true});
    window.addEventListener("resize", function(){ marges(); suivre(); });
  }
  function changer(tabs){
    if(!TABS) return;                         /* pas encore ouverte : aller() prendra ces parties */
    var noms=tabs.map(function(t){ return t[0]; });
    TABS.forEach(function(t){
      var s=section(t[0]); if(!s || noms.indexOf(t[0])>=0) return;
      s.hidden=true; s.classList.remove("up-suite", "up-dernier");
    });
    appliquer(tabs);
    COURANTE=""; suivre();
  }
  function aller(nom, tabs, entree){
    var etaitPremier=premier;
    if(entree) ENTREE=entree;
    COURANTE=nom;
    if(!TABS) installer(tabs);
    tabs.forEach(function(t){ var s=section(t[0]); if(s) s.hidden=false; });
    marquer(nom);
    premier=false;
    var s=section(nom);
    if(etaitPremier){
      if(nom!==tabs[0][0] && s) setTimeout(function(){ marges(); s.scrollIntoView({block:"start"}); }, 60);
      return true;
    }
    pause=Date.now()+900;                     /* le défilement doux ne rallume pas les parties traversées */
    marges();
    if(nom===tabs[0][0] || !s) window.scrollTo({top:0, behavior:"smooth"});
    else s.scrollIntoView({block:"start", behavior:"smooth"});
    return false;
  }
  window.UnePage={aller:aller, changer:changer};
})();
