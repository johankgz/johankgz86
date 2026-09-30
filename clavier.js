/* =====================================================================
   clavier.js — le dictionnaire du téléphone plutôt que les coordonnées
   ---------------------------------------------------------------------
   Sur un iPhone, un champ « Nom », « Adresse », « Interlocuteur »… fait
   proposer les coordonnées de sa fiche contact au-dessus du clavier, à la
   place des mots du dictionnaire. Chaque champ de texte (et chaque zone
   de texte) de la page, y compris ceux ajoutés ensuite, est donc réglé en
   saisie libre : pas de remplissage automatique, correction et
   suggestions de mots, majuscule en début de phrase.

   Restent tels quels : les e-mails, téléphones, mots de passe, nombres,
   dates, et les champs qui ont déjà un réglage voulu (identifiant, mot de
   passe, code…). Un réglage déjà écrit sur un champ (autocorrect="off"
   pour un repère « PC4 », un champ numérique…) est respecté.
   ===================================================================== */
(function(){
  var TYPES_EXCLUS=/^(email|tel|password|number|date|time|datetime-local|month|week|url|file|checkbox|radio|range|color|hidden|submit|button|reset|image)$/;
  var AUTO_GARDE=/^(email|tel|username|current-password|new-password|one-time-code|url|cc-|postal-code|street-address|address-)/;
  var CHIFFRES=/^(numeric|decimal|tel|email|url)$/;

  function regler(el){
    if(!el || el.__clavier) return;
    var tag=el.tagName;
    if(tag!=="INPUT" && tag!=="TEXTAREA") return;
    el.__clavier=true;
    if(tag==="INPUT" && TYPES_EXCLUS.test((el.getAttribute("type")||"text").toLowerCase())) return;
    if(AUTO_GARDE.test((el.getAttribute("autocomplete")||"").toLowerCase())) return;
    el.setAttribute("autocomplete", "off");
    var mode=(el.getAttribute("inputmode")||"").toLowerCase();
    if(CHIFFRES.test(mode)) return;                   /* un nombre, une cote : ni correction ni majuscule */
    if(!el.hasAttribute("autocorrect")) el.setAttribute("autocorrect", "on");
    if(!el.hasAttribute("spellcheck")) el.setAttribute("spellcheck", "true");
    if(!el.hasAttribute("autocapitalize")) el.setAttribute("autocapitalize", "sentences");
  }
  function parcourir(racine){
    if(!racine || !racine.querySelectorAll) return;
    if(racine.tagName==="INPUT" || racine.tagName==="TEXTAREA") regler(racine);
    Array.prototype.forEach.call(racine.querySelectorAll("input, textarea"), regler);
    if(racine.tagName==="FORM") racine.setAttribute("autocomplete", "off");
    Array.prototype.forEach.call(racine.querySelectorAll("form"), function(f){ f.setAttribute("autocomplete", "off"); });
  }
  function demarrer(){
    parcourir(document.body);
    /* les champs ajoutés ensuite (lignes de liste, légendes de photos, fenêtres) */
    if(window.MutationObserver) new MutationObserver(function(ms){
      ms.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes, function(n){ if(n.nodeType===1) parcourir(n); }); });
    }).observe(document.body, {childList:true, subtree:true});
  }
  /* au cas où : réglé aussi au moment où l'on touche le champ, avant que le clavier s'ouvre */
  document.addEventListener("focusin", function(e){ regler(e.target); }, true);
  if(document.body) demarrer(); else document.addEventListener("DOMContentLoaded", demarrer);
  window.Clavier={regler:regler};
})();
