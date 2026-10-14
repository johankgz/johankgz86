/* =====================================================================
   personnes.js — choisir quelqu'un de l'équipe, partout pareil
   ---------------------------------------------------------------------
   Deux pièces, communes aux pages qui font choisir des personnes
   (qui voit un dossier, à qui envoyer une fiche) :
   - ChercherPersonne(o) : un champ « Rechercher un nom » ; on tape, les
     personnes qui correspondent s'affichent dessous (sans les accents,
     sur le prénom comme sur le nom), un toucher en ajoute une. Rien
     n'est listé tant qu'on n'a rien tapé : avec vingt comptes, la liste
     de tous les noms prenait l'écran.
       o.personnes  [{nom, role}]
       o.exclure    noms déjà choisis
       o.ajouter    fonction(nom)
       o.placeholder, o.vide (texte quand rien n'est tapé)
   - PastillePersonne(nom, retirer, o) : le nom choisi et sa croix, une
     vraie cible ronde de 32 px, centrée, que les réglages de boutons de
     la page ne déforment plus. o.etiquette (« auteur »…) remplace la croix.
   ===================================================================== */
(function(){
  "use strict";
  if(window.ChercherPersonne) return;

  var css = document.createElement("style");
  css.id = "personnesCss";
  css.textContent =
    ".cp{width:100%}" +
    ".cp .cp-champ{display:block;width:100%!important;min-height:46px!important;margin:0!important;padding:0 14px 0 40px!important;box-sizing:border-box;" +
      "border:1px solid var(--rule,#E2DCCE)!important;border-radius:12px!important;background:var(--card,#fff) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238C8475' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='m20 20-3.5-3.5'/%3E%3C/svg%3E\") no-repeat 12px 50%/18px 18px!important;" +
      "color:var(--ink,#22201C);font:inherit;font-size:16px!important;-webkit-appearance:none;appearance:none}" +
    ".cp .cp-champ:focus{outline:none;border-color:var(--accent,#B4621A)!important;box-shadow:0 0 0 3px rgba(180,98,26,.16)}" +
    ".cp .cp-res{display:flex;flex-direction:column;margin-top:6px;border-radius:12px;overflow:hidden;background:var(--card,#fff);border:1px solid var(--rule,#E2DCCE)}" +
    ".cp .cp-res:empty{display:none}" +
    ".cp .cp-res > button.cp-item{display:flex!important;align-items:center;gap:10px;width:100%!important;min-height:52px!important;margin:0!important;padding:6px 12px!important;" +
      "border:0!important;border-top:1px solid var(--rule,#E2DCCE)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;" +
      "color:var(--ink,#22201C)!important;font:inherit;text-align:left;cursor:pointer}" +
    ".cp .cp-res > button.cp-item:first-child{border-top:0!important}" +
    ".cp .cp-res > button.cp-item:active,.cp .cp-res > button.cp-item:focus-visible{background:var(--field,#EFEBE1)!important;outline:none}" +
    ".cp .cp-av{flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff}" +
    ".cp .cp-n{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}" +
    ".cp .cp-n b{font-size:15.5px;font-weight:600;overflow-wrap:anywhere}" +
    ".cp .cp-n small{font-size:12.5px;color:var(--ink-3,#8C8475)}" +
    ".cp .cp-plus{flex:0 0 auto;font-size:13.5px;font-weight:700;color:var(--accent,#B4621A)}" +
    ".cp .cp-rien{margin:0;padding:12px 14px;font-size:14px;color:var(--ink-3,#8C8475)}" +
    ".cp .cp-aide{margin:6px 2px 0;font-size:12.5px;color:var(--ink-3,#8C8475)}" +
    ".cp-pil{display:inline-flex;align-items:center;gap:6px;max-width:100%;min-height:40px;padding:4px 4px 4px 12px;box-sizing:border-box;" +
      "border-radius:10px;background:var(--accent-soft,#FBEDE0);color:var(--accent,#B4621A);font-size:14.5px;font-weight:600;line-height:1.2}" +
    ".cp-pil .cp-pn{min-width:0;overflow-wrap:anywhere}" +
    ".cp-pil .cp-tag{padding:0 8px 0 2px;font-size:11.5px;font-weight:500;opacity:.7}" +
    ".cp-pil > button.cp-x{flex:0 0 auto;display:inline-flex!important;align-items:center!important;justify-content:center!important;" +
      "width:32px!important;height:32px!important;min-width:32px!important;min-height:32px!important;max-width:32px;margin:0!important;padding:0!important;" +
      "border:0!important;border-radius:50%!important;background:rgba(180,98,26,.14)!important;box-shadow:none!important;color:inherit!important;" +
      "font:inherit;font-size:19px!important;font-weight:500;line-height:1!important;cursor:pointer}" +
    ".cp-pil > button.cp-x:active{background:rgba(180,98,26,.28)!important}";
  (document.head || document.documentElement).appendChild(css);

  var ROLES = {admin:"Administrateur", bureau:"Bureau", technicien:"Technicien"};
  function sans(t){ return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim(); }
  function initiales(n){ var m = String(n || "").trim().split(/[\s-]+/).filter(Boolean); return ((m[0] || "")[0] || "").toUpperCase() + ((m[1] || "")[0] || "").toUpperCase(); }
  function teinte(n){ var h = 0; String(n || "").split("").forEach(function(c){ h = (h * 31 + c.charCodeAt(0)) % 360; }); return "hsl(" + h + ",42%,42%)"; }
  var REFOCUS = 0;

  window.ChercherPersonne = function(o){
    o = o || {};
    var box = document.createElement("div"); box.className = "cp";
    var champ = document.createElement("input");
    champ.type = "search"; champ.className = "cp-champ";
    champ.placeholder = o.placeholder || "Rechercher un nom";
    champ.setAttribute("aria-label", o.placeholder || "Rechercher un nom");
    champ.setAttribute("autocomplete", "off"); champ.setAttribute("autocapitalize", "words"); champ.spellcheck = false;
    champ.setAttribute("enterkeyhint", "search");
    champ.setAttribute("data-sans-marque", "");   /* une recherche, pas une donnée de la fiche (brouillon, mémoire) */
    var res = document.createElement("div"); res.className = "cp-res"; res.setAttribute("role", "listbox");
    var aide = document.createElement("p"); aide.className = "cp-aide"; aide.textContent = o.vide || "Tapez les premières lettres d'un prénom ou d'un nom.";
    box.appendChild(champ); box.appendChild(res); box.appendChild(aide);
    var trouves = [];
    function choisir(nom){ REFOCUS = Date.now(); champ.value = ""; peindre(); if(o.ajouter) o.ajouter(nom); }
    function peindre(){
      res.textContent = "";
      var q = sans(champ.value);
      aide.hidden = !!q;
      if(!q){ trouves = []; return; }
      var ex = (o.exclure || []).map(sans);
      var tous = o.personnes || [];
      var l = tous.filter(function(p){ return p && p.nom && ex.indexOf(sans(p.nom)) < 0 && sans(p.nom).indexOf(q) >= 0; });
      /* d'abord ceux dont un mot commence par ce qu'on tape, puis l'ordre donné par la page
         (au SAV, les techniciens avant le bureau) */
      l.sort(function(a, b){
        var da = (" " + sans(a.nom)).indexOf(" " + q) >= 0 ? 0 : 1, db = (" " + sans(b.nom)).indexOf(" " + q) >= 0 ? 0 : 1;
        return da - db || tous.indexOf(a) - tous.indexOf(b);
      });
      trouves = l.slice(0, 8);
      if(!trouves.length){ var r = document.createElement("p"); r.className = "cp-rien"; r.textContent = "Personne ne correspond à « " + champ.value.trim() + " »."; res.appendChild(r); return; }
      trouves.forEach(function(p){
        var b = document.createElement("button"); b.type = "button"; b.className = "cp-item"; b.setAttribute("role", "option");
        b.setAttribute("aria-label", "Ajouter " + p.nom);
        var av = document.createElement("span"); av.className = "cp-av"; av.textContent = initiales(p.nom); av.style.background = teinte(p.nom); av.setAttribute("aria-hidden", "true");
        var n = document.createElement("span"); n.className = "cp-n";
        var nb = document.createElement("b"); nb.textContent = p.nom; n.appendChild(nb);
        var role = ROLES[p.role] || p.role || "";
        if(role){ var sm = document.createElement("small"); sm.textContent = role; n.appendChild(sm); }
        var plus = document.createElement("span"); plus.className = "cp-plus"; plus.textContent = "Ajouter"; plus.setAttribute("aria-hidden", "true");
        b.appendChild(av); b.appendChild(n); b.appendChild(plus);
        b.addEventListener("click", function(){ choisir(p.nom); });
        res.appendChild(b);
      });
    }
    champ.addEventListener("input", peindre);
    champ.addEventListener("keydown", function(e){
      if(e.key === "Enter"){ e.preventDefault(); if(trouves.length) choisir(trouves[0].nom); }
      if(e.key === "Escape" && champ.value){ e.stopPropagation(); champ.value = ""; peindre(); }
    });
    /* la page se redessine après un ajout : le nouveau champ reprend le curseur */
    if(Date.now() - REFOCUS < 1500) setTimeout(function(){ try{ champ.focus({preventScroll:true}); }catch(e){ champ.focus(); } }, 0);
    peindre();
    box.champ = champ;
    return box;
  };

  /* une seule personne à choisir (le technicien à qui confier, le conducteur de travaux) :
     son nom et sa croix quand elle est choisie, sinon la recherche. Dessiné à côté
     de l'élément donné, qui est caché (ses tuiles listaient tout le monde). */
  window.ChoisirUnePersonne = function(ancien, o){
    if(!ancien) return;
    var h = ancien.__cp;
    if(!h){ h = document.createElement("div"); h.className = "cp-un"; ancien.parentNode.insertBefore(h, ancien.nextSibling); ancien.__cp = h; }
    ancien.style.display = "none";
    h.textContent = "";
    if(o.choisi) h.appendChild(PastillePersonne(o.choisi, function(){ o.choisir(""); }));
    else h.appendChild(ChercherPersonne({personnes:o.personnes, exclure:[], ajouter:o.choisir, placeholder:o.placeholder, vide:o.vide}));
    return h;
  };

  window.PastillePersonne = function(nom, retirer, o){
    o = o || {};
    var p = document.createElement("span"); p.className = "cp-pil";
    var n = document.createElement("span"); n.className = "cp-pn"; n.textContent = nom; p.appendChild(n);
    if(o.etiquette){
      var t = document.createElement("span"); t.className = "cp-tag"; t.textContent = o.etiquette; p.appendChild(t);
    } else if(retirer){
      var x = document.createElement("button"); x.type = "button"; x.className = "cp-x";
      /* un dessin plutôt que le caractère « × » : la police le posait trop bas dans le rond */
      x.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style="display:block;fill:none;stroke:currentColor;stroke-width:2.6;stroke-linecap:round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      x.setAttribute("aria-label", "Retirer " + nom); x.title = "Retirer " + nom;
      x.addEventListener("click", function(){ retirer(nom); });
      p.appendChild(x);
    } else p.style.paddingRight = "12px";
    return p;
  };
})();
