/* =====================================================================
   clavier.js — le dictionnaire du téléphone plutôt que les coordonnées
   ---------------------------------------------------------------------
   Sur un iPhone, un champ « Nom », « Adresse », « Interlocuteur »… fait
   proposer les coordonnées de sa fiche contact au-dessus du clavier, à la
   place des mots du dictionnaire. Chaque champ de texte (et chaque zone
   de texte) de la page, y compris ceux ajoutés ensuite, est donc réglé en
   saisie libre : pas de remplissage automatique, correction et
   suggestions de mots, majuscule en début de phrase.

   Les e-mails, téléphones et nombres (souvent ceux du client) ne sont
   plus préremplis non plus, mais gardent leur clavier, sans correction.
   Restent tels quels : les mots de passe, dates, et les champs qui ont
   déjà un réglage voulu (identifiant, mot de passe, code, coordonnées
   de l'utilisateur dans Mon compte). Un réglage déjà écrit sur un champ (autocorrect="off"
   pour un repère « PC4 », un champ numérique…) est respecté.

   Safari ne tient pas toujours compte de autocomplete="off" : quand la
   page contient un champ « Client » ou « Adresse », il propose
   « Préremplir le contact » sur tous les champs, même une tâche. Il
   écarte en revanche les champs de recherche : chaque champ libre sans
   nom en reçoit donc un qui le dit (search_…, sans tiret, le tiret lui
   faisant croire à un téléphone). Aucune page n'envoie de formulaire :
   ce nom ne sert qu'à Safari.
   ===================================================================== */
(function(){
  var TYPES_EXCLUS=/^(email|tel|password|number|date|time|datetime-local|month|week|url|file|checkbox|radio|range|color|hidden|submit|button|reset|image)$/;
  var AUTO_GARDE=/^(email|tel|username|current-password|new-password|one-time-code|url|cc-|postal-code|street-address|address-)/;
  var CHIFFRES=/^(numeric|decimal|tel|email|url)$/;
  var SAISIE=/^(text|search|email|tel|url|number)$/;
  var rang=0;

  function regler(el){
    if(!el || el.__clavier) return;
    var tag=el.tagName;
    if(tag!=="INPUT" && tag!=="TEXTAREA") return;
    el.__clavier=true;
    var ty=tag==="INPUT" ? (el.getAttribute("type")||"text").toLowerCase() : "textarea";
    if(tag==="INPUT" && !SAISIE.test(ty)) return;
    if(AUTO_GARDE.test((el.getAttribute("autocomplete")||"").toLowerCase())) return;
    /* le téléphone ou l'e-mail d'un client n'est pas le sien : pas de fiche contact là non plus */
    el.setAttribute("autocomplete", "off");
    if(!el.getAttribute("name")) el.setAttribute("name", "search_" + (el.id ? el.id.replace(/[^A-Za-z0-9_]/g, "_") : "champ" + (++rang)));
    if(tag==="INPUT" && TYPES_EXCLUS.test(ty)) return;
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
