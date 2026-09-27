/* =====================================================================
   sobre.js — la même fiche sobre dans toutes les applis
   ---------------------------------------------------------------------
   Ce que le relevé a gagné, les autres fiches le reçoivent sans qu'on
   réécrive chacune :
   - un symbole devant chaque titre de bloc ;
   - des tuiles à pictogramme pour les choix connus (la valeur
     enregistrée ne change pas, seul le mot affiché peut raccourcir) ;
   - le micro de dictée rangé dans le coin du champ ;
   - les longues phrases d'aide repliées derrière un petit « i » ;
   - l'en-tête des PDF pris sur la fiche de la société, réglée une fois
     pour toutes dans « Comptes et sociétés ».
   Les choix construits plus tard par l'appli sont habillés au vol.
   ===================================================================== */
(function(){
"use strict";
var NS = "http://www.w3.org/2000/svg";

function icone(d, cls){
  var s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true");
  if(cls) s.setAttribute("class", cls);
  var p = document.createElementNS(NS, "path"); p.setAttribute("d", d); s.appendChild(p);
  return s;
}

/* ---------- les choix : valeur → [tracé, mot court] ---------- */
var MAISON = "M4 11.5 12 5l8 6.5M6.5 10v9h11v-9";
var COCHE_ROND = "M12 3.5a8.5 8.5 0 1 0 .1 0M8.2 12.3l2.6 2.6 5-5.3";
var CROIX_ROND = "M12 3.5a8.5 8.5 0 1 0 .1 0M9 9l6 6M15 9l-6 6";
var DRAPEAU = "M5.5 20.5V4M5.5 4.8h11.8l-2.2 3.6 2.2 3.6H5.5";
var DEVIS = "M6 3.5h8l4 4v13H6zM14 3.5v4h4M13.8 11.2a2.6 2.6 0 1 0 0 4.6M9 12.6h4M9 14.4h4";
var CLE = "M14.5 4.5a4 4 0 0 0-5 5L4 15l2.5 2.5L12 12a4 4 0 0 0 5-5l-2.4 2.4-2-2z";
var CHOIX = {
  /* relevé */
  "Maison":[MAISON+"M10 19v-5h4v5"],
  "Appartement":["M6 3.5h12v17H6zM9.5 7h1.5M13 7h1.5M9.5 10.5h1.5M13 10.5h1.5M9.5 14h1.5M13 14h1.5M11 20.5v-3h2v3","Appart."],
  "Tertiaire":["M3.5 20.5h17M5 20.5V8h6v12.5M11 20.5V4h8v16.5M7.5 11h1.5M7.5 14.5h1.5M14 7.5h2M14 11h2M14 14.5h2"],
  "Électricité":["M13 2.5 5 13.5h6l-1 8 8-11h-6z"],
  "Plomberie":["M12 3.5s-6 6.4-6 10.5a6 6 0 0 0 12 0c0-4.1-6-10.5-6-10.5z"],
  "Climatisation":["M12 2.5v19M4 7l16 10M20 7 4 17M9.5 4 12 6.5 14.5 4M9.5 20 12 17.5l2.5 2.5","Clim"],
  "Photovoltaïque":["M4 20h16M6 20l2-9h8l2 9M7 15.5h10M12 11v9M12 3.5v2M6.5 5.5l1.2 1.2M17.5 5.5l-1.2 1.2","Solaire"],
  "Construction neuve":[MAISON+"M12 12v5M9.5 14.5h5","Neuf"],
  "Rénovation partielle":[MAISON+"M12 10v9","Réno partielle"],
  "Rénovation totale":[CLE,"Réno totale"],
  "Monophasé":["M3 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0","Mono"],
  "Triphasé":["M3 8c2-4 4-4 6 0s4 4 6 0 4-4 6 0M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0M3 16c2-4 4-4 6 0s4 4 6 0 4-4 6 0","Tri"],
  "À définir":["M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7v.8M12 17.5v.2"],
  "Logement occupé":[MAISON+"M12 12.2a1.6 1.6 0 1 0 0-.1M9.5 18.5c.5-1.8 1.4-2.6 2.5-2.6s2 .8 2.5 2.6","Occupé"],
  "Logement vacant":[MAISON,"Vacant"],
  "Partiellement occupé":[MAISON+"M12 10v9M8.5 14.5h2","Partiel"],
  "En travaux":["M9 20.5 12 4l3 16.5M6 20.5h12M10.2 13.5h3.6M9.4 17h5.2"],
  "Boîte à clés":["M5 6h14v12H5zM9.5 12a1.8 1.8 0 1 0 0-.1M11.3 12h4.2M14 12v1.8"],
  "Passe":["M8 12a3.5 3.5 0 1 1 0-.1M11.5 12h9M17.5 12v3M20.5 12v2.5"],
  "Menuisier":["M4 20 14 10M13 5l6 6-2.5 2.5-6-6zM16 3.5l4.5 4.5"],
  "Client présent":["M12 8.5a3.3 3.3 0 1 0 0-.1M5.5 20c.9-3.5 3.5-5.3 6.5-5.3s5.6 1.8 6.5 5.3","Client là"],
  "Gardien / syndic":["M4 20.5h16M6 20.5V6h12v14.5M10 20.5v-4h4v4M9 9.5h1.5M13.5 9.5H15M9 13h1.5M13.5 13H15","Syndic"],
  "Plain-pied":["M3 19h18M6 19V9h12v10M10 19v-5h4v5"],
  "Étage":["M4 20h4v-4h4v-4h4V8h4"],
  "Ascenseur":["M6 3.5h12v17H6zM12 3.5v17M9 8.5 9 8M8 10l1-2 1 2M15 8l-1 2-1-2"],
  "Escalier étroit":["M8 20h3v-3.5h3V13h3V9.5M8 20V9.5M17 20V9.5","Escalier étroit"],
  "Grutage nécessaire":["M5 20.5V4h13M5 7h11M16 4v7M16 11h-2v3h4v-3zM3 20.5h5","Grutage"],
  "Nacelle / échafaudage":["M5 3.5v17M19 3.5v17M5 8h14M5 13h14M5 18h14M5 8l14 5","Nacelle"],
  "Devant les travaux":["M6 20.5v-17h6a4.5 4.5 0 0 1 0 9H6","Devant"],
  "À proximité":["M5 20.5v-15h5a3.5 3.5 0 0 1 0 7H5M15 16h6M18.5 13.5 21 16l-2.5 2.5","Proche"],
  "Difficile":["M6 20.5v-17h6a4.5 4.5 0 0 1 0 9H6M4 4l16 16","Difficile"],
  "Autorisation de voirie à demander":["M9 20.5 12 4l3 16.5M6 20.5h12M10.2 13.5h3.6","Voirie"],
  "Borne":["M7 20.5V5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 15 5v15.5M5 20.5h12M12.5 7 10 11.5h3L10.5 16M15 9h2a1.5 1.5 0 0 1 1.5 1.5V15a1.5 1.5 0 0 0 3 0V8"],
  "Prise renforcée":["M5 5h14v14H5zM9.5 11v2M14.5 11v2M12 15.5v.5"],
  "Sud":["M12 4v16M12 20l-3.5-3.5M12 20l3.5-3.5"],
  "Nord":["M12 20V4M12 4 8.5 7.5M12 4l3.5 3.5"],
  "Est":["M4 12h16M20 12l-3.5-3.5M20 12l-3.5 3.5"],
  "Ouest":["M20 12H4M4 12l3.5-3.5M4 12l3.5 3.5"],

  /* suivi : l'objet de la visite */
  "Point d'avancement":["M3.5 20V4M3.5 20h17M7 16.2l3.8-4.6 3.3 3 4.9-6.4","Avancement"],
  "Réunion de chantier":["M8 8.5a2.6 2.6 0 1 0 0-.1M16 8.5a2.6 2.6 0 1 0 0-.1M3 18.5c.6-2.8 2.5-4.3 5-4.3s4.4 1.5 5 4.3M11 18.5c.6-2.8 2.5-4.3 5-4.3s4.4 1.5 5 4.3","Réunion"],
  "Réception":["M5.5 3.5h8l5 5v12H5.5zM13.5 3.5v5h5M8.5 14.2l2 2 4-4.4"],
  "Levée de réserves":[DRAPEAU+"M9 8.4l1.6 1.6 3-3.2","Réserves"],
  "Visite client":["M12 8.5a3.3 3.3 0 1 0 0-.1M5.5 20c.9-3.5 3.5-5.3 6.5-5.3s5.6 1.8 6.5 5.3","Visite client"],

  /* réception : le lot général et la décision */
  "Général":["M8 4.5h8v2.5H8zM6 5.8H5v14.7h14V5.8h-1M8.5 11h7M8.5 14.5h7M8.5 18h4"],
  "Réception sans réserve":[COCHE_ROND,"Sans réserve"],
  "Réception avec réserves":[DRAPEAU,"Avec réserves"],
  "Réception refusée":[CROIX_ROND,"Refusée"],

  /* le point : l'état du chantier */
  "Pas commencé":["M12 3.5a8.5 8.5 0 1 0 .1 0"],
  "En cours":["M12 3.5a8.5 8.5 0 1 0 .1 0M12 3.5V12l6 6"],
  "Presque fini":["M12 3.5a8.5 8.5 0 1 0 .1 0M12 7.5v4.5h4.5"],
  "Terminé":[COCHE_ROND],
  "À l'arrêt":["M12 3.5a8.5 8.5 0 1 0 .1 0M10 9v6M14 9v6"],

  /* autocontrôle */
  "Neuf":[MAISON+"M12 12v5M9.5 14.5h5"],
  "Réno totale":[CLE],
  "Réno partielle":[MAISON+"M12 10v9"],
  "Mise en sécurité":["M12 3.2 20 6v6.2c0 4.4-3.2 7.3-8 8.6-4.8-1.3-8-4.2-8-8.6V6zM8.6 12.1l2.4 2.4 4.4-4.8","Sécurité"],
  "Maison Indiv":[MAISON+"M10 19v-5h4v5","Maison"],
  "Autres":["M3.5 20.5h17M5 20.5V8h6v12.5M11 20.5V4h8v16.5"],

  /* SAV */
  "Dépannage":[CLE],
  "Entretien":["M12 8.8a3.2 3.2 0 1 0 .1 0M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"],
  "Mise en service":["M12 3v8M7 6.3a7.5 7.5 0 1 0 10 0","Mise en service"],
  "Diagnostic":["M10.8 4.5a6.3 6.3 0 1 0 .1 0M15.4 15.4l5.1 5.1"],
  "Reprise de réserve":[DRAPEAU,"Réserve"],
  "Sous garantie":["M12 3.2 20 6v6.2c0 4.4-3.2 7.3-8 8.6-4.8-1.3-8-4.2-8-8.6V6z","Garantie"],
  "Contrat d'entretien":["M6 3.5h8l4 4v13H6zM14 3.5v4h4M9 12h6M9 15.5h4","Contrat"],
  "Facturable":["M16.5 6.5a6.5 6.5 0 1 0 0 11M5 10.5h8M5 13.5h8"],
  "Geste commercial":["M4 9.5h16v3H4zM5.5 12.5v8h13v-8M12 9.5v11M12 9.5c-1-3-5-4-5-1.5 0 1.5 5 1.5 5 1.5s5 0 5-1.5c0-2.5-4-1.5-5 1.5","Geste"],
  "Normale":["M12 3.5a8.5 8.5 0 1 0 .1 0M12 7.5V12l3 2"],
  "Urgente":["M12 3.4 21 19.6H3zM12 9.6v4.3M12 16.8h.01"],
  "Sans alimentation":["M13 2.5 5 13.5h6l-1 8 8-11h-6zM3.5 3.5l17 17","Sans courant"],
  "Résolu":[COCHE_ROND],
  "Résolu provisoirement":["M12 3.5a8.5 8.5 0 1 0 .1 0M8.2 12.3l2.6 2.6 5-5.3","Provisoire"],
  "Non résolu":[CROIX_ROND],
  "Devis à établir":[DEVIS,"Devis"],
  "Rien à prévoir":["M5 12.5l4.5 4.5L19 7.5","Rien"],
  "Retour à planifier":["M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4M9 15h6","Retour"],
  "Pièce à commander":["M3 4.5h2.2l2.2 10.2h9.9l2.2-7.4H6.2M9.2 17.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4M16.8 17.3a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4","Pièce"],
  "Autre entreprise":["M3.5 20.5h17M5 20.5V8h6v12.5M11 20.5V4h8v16.5M7.5 11h1.5M7.5 14.5h1.5M14 7.5h2M14 11h2M14 14.5h2"],

  /* carnet : le document à produire */
  "Carnet d'échantillons":["M4.5 4.5h6v15h-6zM10.5 6.5l5.6-1.5 3.9 14.5-5.6 1.5zM7.5 8v.1","Échantillons"],
  "Mémoire technique":["M5.5 3.5h8l5 5v12H5.5zM13.5 3.5v5h5M8.5 13h7M8.5 16.5h4.5","Mémoire"],
  "Dossier des ouvrages exécutés":["M3.5 6.5h6l2 2.2h9v10.3H3.5zM9 13.8l2 2 4-4.2","DOE"]
};

function valeurDe(chip){
  if(chip.hasAttribute("data-valeur")) return chip.getAttribute("data-valeur");
  var i = chip.querySelector("input");
  if(i && i.value) return i.value;
  return (chip.textContent || "").trim();
}
function habillerGroupe(box){
  var chips = Array.prototype.filter.call(box.children, function(c){ return c.classList.contains("chip"); });
  if(!chips.length) return;
  var tous = chips.every(function(c){ return c.querySelector("svg") || CHOIX[valeurDe(c)]; });
  if(!tous){ if(box.classList.contains("tuiles")) box.classList.remove("tuiles"); return; }
  if(!box.classList.contains("tuiles")) box.classList.add("tuiles");
  chips.forEach(function(c){
    if(c.querySelector("svg")) return;
    var v = valeurDe(c), d = CHOIX[v], i = c.querySelector("input");
    c.setAttribute("data-valeur", v);
    c.insertBefore(icone(d[0]), i ? i.nextSibling : c.firstChild);
    if(d[1] && d[1] !== v){
      Array.prototype.forEach.call(c.childNodes, function(n){ if(n.nodeType === 3 && n.textContent.trim()) n.textContent = d[1]; });
      c.title = v;
    }
  });
}
function habillerChoix(racine){
  Array.prototype.forEach.call((racine || document).querySelectorAll(".chips"), habillerGroupe);
}

/* ---------- les titres : un symbole devant ---------- */
var TITRES = [
  [/^travaux suppl/, "M4.5 4.5h15v15h-15zM12 8.5v7M8.5 12h7"],
  [/^travaux réalisés/, CLE],
  [/^type de travaux/, CLE],
  [/^type de bâtiment/, "M3.5 20.5h17M5 20.5V8h6v12.5M11 20.5V4h8v16.5M7.5 11h1.5M7.5 14.5h1.5M14 7.5h2M14 11h2M14 14.5h2"],
  [/^si les travaux/, "M5 19 19 5M10 5h9v9"],
  [/^(client|signature du client)/, "M12 8.5a3.6 3.6 0 1 0 .1 0M5 20c1-3.6 3.8-5.6 7-5.6s6 2 7 5.6"],
  [/^signature/, "M3 17.4c2.8 0 3.6-9.2 6.4-9.2 2.2 0 2.3 6.4 4.3 6.4 1.7 0 2-3.4 5.3-3.4M3 20.8h18"],
  [/^(travaux|chantier)$/, MAISON+"M10 19v-5h4v5"],
  [/^(dossier|les documents du chantier|dépôt dans le dossier)/, "M3.5 6.5h6l2 2.2h9v10.3H3.5z"],
  [/^objet|^motif/, "M5 4.5h14v15H5zM8.5 9h7M8.5 12.5h7M8.5 16h4"],
  [/^intervention/, "M4 5.5h16v15H4zM4 10h16M8.5 3v4M15.5 3v4"],
  [/^(enregistrer sur|photos seules)/, "M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 17v3.5h15V17"],
  [/photo/, "M3.5 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.3-2h6.4l1.3 2h2a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM12 9.1a3.4 3.4 0 1 0 .1 0"],
  [/^plans/, "M9 3.6 3.5 5.8v14.6L9 18.2l6 2.2 5.5-2.2V3.6L15 5.8zM9 3.6v14.6M15 5.8v14.6"],
  [/^points bloquants/, "M12 3.4 21 19.6H3zM12 9.6v4.3M12 16.8h.01"],
  [/^enregistre/, "M5 3.5h11l3.5 3.5v13.5H5zM8 3.5v5h7v-5M8 20.5v-6h8v6"],
  [/^métier/, "M13 2.5 5 13.5h6l-1 8 8-11h-6z"],
  [/^destinataire/, "M21 3.5 2.8 11.2l7.5 2.6 2.6 7.2zM21 3.5 10.3 13.8"],
  [/^article hors/, "M12 3.5 20 8v8l-8 4.5L4 16V8zM4 8l8 4.5L20 8M12 12.5v8"],
  [/^récapitulatif/, "M4 6.3l1.4 1.4L8.3 4.5M4 12.4l1.4 1.4 2.9-3.2M4 18.5l1.4 1.4 2.9-3.2M11.5 6h8.5M11.5 12h8.5M11.5 18h6"],
  [/^publication/, "M7 18.5h-.5a4 4 0 0 1-.6-8 6 6 0 0 1 11.6-1.6A4.5 4.5 0 0 1 17.5 18.5H17M12 11v9M9 14l3-3 3 3"],
  [/^partage/, "M18 3.8a2.6 2.6 0 1 0 .1 0M6 9.4a2.6 2.6 0 1 0 .1 0M18 15a2.6 2.6 0 1 0 .1 0M8.3 13.2l7.4 3.8M15.7 7.4 8.3 11.2"],
  [/^vérification/, "M12 3.2 20 6v6.2c0 4.4-3.2 7.3-8 8.6-4.8-1.3-8-4.2-8-8.6V6zM8.6 12.1l2.4 2.4 4.4-4.8"],
  [/^observation|^note/, "M4 5h16v11H9l-5 4z"],
  [/^(techniciens|personnes présentes)/, "M8 8.5a2.6 2.6 0 1 0 0-.1M16 8.5a2.6 2.6 0 1 0 0-.1M3 18.5c.6-2.8 2.5-4.3 5-4.3s4.4 1.5 5 4.3M11 18.5c.6-2.8 2.5-4.3 5-4.3s4.4 1.5 5 4.3"],
  [/^report notice/, "M4 5.5c2.5-1.3 5.5-1.3 8 .5 2.5-1.8 5.5-1.8 8-.5v13c-2.5-1.3-5.5-1.3-8 .5-2.5-1.8-5.5-1.8-8-.5zM12 6v13"],
  [/^lots/, "M12 3.5 21 8l-9 4.5L3 8zM3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5"],
  [/^réserves/, DRAPEAU],
  [/^décision/, COCHE_ROND],
  [/^constat/, "M10.8 4.5a6.3 6.3 0 1 0 .1 0M15.4 15.4l5.1 5.1"],
  [/^matériel/, "M12 3.5 20 8v8l-8 4.5L4 16V8zM4 8l8 4.5L20 8M12 12.5v8"],
  [/^état/, "M12 3.5a8.5 8.5 0 1 0 .1 0M8.2 12.3l2.6 2.6 5-5.3"],
  [/^suite/, "M3.5 12h13M12.5 6.8 17.7 12l-5.2 5.2M20.5 5.5v13"],
  [/^format/, "M3.5 8.5h17v7h-17zM7 8.5v3M10.5 8.5v2M14 8.5v3M17.5 8.5v2"],
  [/^rangées/, "M4 5.5h16M4 10h16M4 14.5h16M4 19h16"],
  [/^contenu/, "M3.5 5.5h17v13h-17zM3.5 9.5h17M7 9.5v9M11 9.5v9M15 9.5v9"],
  [/^ajouter des documents/, "M12 20.5v-11M7.5 14 12 9.5l4.5 4.5M4.5 7V3.5h15V7"],
  [/^ajouter/, "M12 5v14M5 12h14"],
  [/^document à produire|^pages du document|^page de garde/, "M5.5 3.5h8l5 5v12H5.5zM13.5 3.5v5h5M8.5 13h7M8.5 16.5h4.5"]
];
function iconesTitres(racine){
  Array.prototype.forEach.call((racine || document).querySelectorAll(".block h2, details.block summary h2"), function(h){
    if(h.querySelector("svg") || h.hasAttribute("data-sobre")) return;
    h.setAttribute("data-sobre", "");
    var n = h.querySelector(".sv-num"); if(n) n.remove();
    var t = (h.textContent || "").trim().toLowerCase();
    for(var k = 0; k < TITRES.length; k++){
      if(TITRES[k][0].test(t)){ h.insertBefore(icone(TITRES[k][1], "ic"), h.firstChild); return; }
    }
  });
}

/* ---------- les longues aides : repliées derrière un « i » ---------- */
function replierAides(racine){
  Array.prototype.forEach.call((racine || document).querySelectorAll(".block"), function(b){
    var h = null;
    Array.prototype.some.call(b.children, function(c){ if(c.tagName === "H2"){ h = c; return true; } return false; });
    if(!h || h.querySelector(".aide-i")) return;
    var longues = Array.prototype.filter.call(b.children, function(c){
      return c.tagName === "P" && !c.id && (c.classList.contains("hint") || c.classList.contains("legend"))
        && !c.children.length && (c.textContent || "").trim().length > 70;
    });
    if(!longues.length) return;
    longues.forEach(function(p){ p.classList.add("aide-repliee"); });
    var bt = document.createElement("button");
    bt.type = "button"; bt.className = "aide-i";
    bt.setAttribute("aria-label", "Aide"); bt.setAttribute("aria-expanded", "false");
    bt.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      var o = b.classList.toggle("aide-ouverte");
      bt.setAttribute("aria-expanded", o ? "true" : "false");
    });
    h.appendChild(bt);
  });
}

/* ---------- le micro dans le coin du champ ---------- */
var MICRO = "M9 3.5h6v11H9zM5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5";
var STOP = "M7 7h10v10H7z";
function peindreMicro(btn){
  if(btn.querySelector("svg")) return;
  var t = (btn.textContent || "").trim();
  if(/non disponible/i.test(t)){ btn.hidden = true; return; }
  var enCours = btn.classList.contains("dictating");
  btn.textContent = "";
  btn.appendChild(icone(enCours ? STOP : MICRO));
  btn.title = enCours ? "Arrêter la dictée" : "Dicter";
  btn.setAttribute("aria-label", btn.title);
}
function rangerMicros(racine){
  Array.prototype.forEach.call((racine || document).querySelectorAll("button.rec[data-dictee], button.rec.micro"), function(btn){
    if(btn.hasAttribute("data-sobre")) return;
    btn.setAttribute("data-sobre", "");
    if(!btn.classList.contains("micro")){
      var cible = document.getElementById(btn.getAttribute("data-dictee"));
      if(!cible || !/^(TEXTAREA|INPUT)$/.test(cible.tagName)) return;
      var bloc = cible.closest("label.f") || cible;
      var enveloppe = bloc.parentNode.classList.contains("avec-micro") ? bloc.parentNode : null;
      if(!enveloppe){
        enveloppe = document.createElement("div"); enveloppe.className = "avec-micro" + (cible.tagName === "INPUT" ? " sur-ligne" : "");
        bloc.parentNode.insertBefore(enveloppe, bloc); enveloppe.appendChild(bloc);
      }
      var ancienne = btn.parentNode;
      btn.classList.add("micro", "dict");
      enveloppe.appendChild(btn);
      if(ancienne && ancienne !== enveloppe && ancienne.classList.contains("row") && !ancienne.children.length) ancienne.remove();
    }
    peindreMicro(btn);
    /* l'appli écrit « Arrêter la dictée » ou « Dicter » dans le bouton : on remet le symbole */
    new MutationObserver(function(){ peindreMicro(btn); }).observe(btn, {childList:true});
  });
}

/* ---------- la fiche de la société ----------
   Nom, téléphone, site, adresse, mentions et logo pour l'en-tête des
   PDF. Rend vrai si les préférences ont changé ; l'appli enregistre. */
function ficheSociete(P){
  var ses = null;
  try{ ses = JSON.parse(localStorage.getItem("outils:session") || "null"); }catch(e){}
  if(!P || !ses || !ses.jeton || !/^https?:$/.test(location.protocol)) return Promise.resolve(false);
  return fetch(location.origin + "/api/rapports?action=societe-fiche", {headers:{"x-auth":ses.jeton}})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){
      if(!d) return false;
      var f = d.fiche, nom = d.nom || ses.societeNom || "", avant = JSON.stringify(P);
      if(f){
        P.societe = f.nom || nom || P.societe;
        P.socTel = f.tel || ""; P.socWeb = f.web || ""; P.socAdr = f.adresse || ""; P.socLegal = f.mentions || "";
        P.logo = f.logo || null;
      } else if(nom && String(P.societe || "").trim().toUpperCase() !== String(nom).trim().toUpperCase()){
        P.societe = nom; P.socTel = ""; P.socWeb = ""; P.socAdr = ""; P.socLegal = ""; P.logo = null;
      }
      return JSON.stringify(P) !== avant;
    })
    .catch(function(){ return false; });
}

/* ---------- tout d'un coup, puis au fil des changements ---------- */
function passe(){
  iconesTitres(); replierAides(); rangerMicros(); habillerChoix();
}
var prevue = false;
function planifier(){
  if(prevue) return;
  prevue = true;
  Promise.resolve().then(function(){ prevue = false; passe(); });
}
passe();
/* à qui est la fiche : la personne connectée, rappelée discrètement */
(function(){
  var el = document.getElementById("parQui");
  if(!el || el.textContent) return;
  try{ var ses = JSON.parse(localStorage.getItem("outils:session") || "null"); if(ses && ses.nom) el.textContent = ses.nom; }catch(e){}
})();
if(window.MutationObserver) new MutationObserver(planifier).observe(document.body, {childList:true, subtree:true});

window.Sobre = { choix: CHOIX, habiller: habillerChoix, ficheSociete: ficheSociete, passe: passe };
})();
