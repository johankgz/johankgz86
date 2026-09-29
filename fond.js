/* =====================================================================
   fond.js — le fond d'écran fixe, pour ceux qui ne veulent pas que ça bouge
   ---------------------------------------------------------------------
   « Mon compte » › « Fond d'écran » › « Anthracite, sans animation » :
   un fond uni anthracite à la place des fonds animés (le ciel et les
   réseaux de l'accueil, le plan technique des applis, l'aurore des
   outils) ; la page des to-do lists garde son crème, immobile. Réglage
   propre à l'appareil, lu avant l'affichage : aucune animation ne démarre.
   ===================================================================== */
(function(){
  var f=null;
  try{ f=localStorage.getItem("site:fond"); }catch(e){}
  if(f!=="anthracite") return;
  var A="#23272D";
  document.documentElement.classList.add("fond-fixe");
  var st=document.createElement("style");
  st.id="fondFixe";
  st.textContent=
    "html.fond-fixe .ciel,html.fond-fixe #fondPlan,html.fond-fixe .fond-outils{background:"+A+"!important}"
    +"html.fond-fixe .ciel>*,html.fond-fixe #fondPlan>*,html.fond-fixe .fond-outils>*{display:none!important}"
    +"html.fond-fixe #fondPastel i{animation:none!important}";
  (document.head||document.documentElement).appendChild(st);
})();
