/* =====================================================================
   palette.js — tout trouver avec Ctrl + K (⌘ + K sur Mac)
   ---------------------------------------------------------------------
   Une seule barre de recherche, sur toutes les pages de l'application :
   - une appli (Relevé, Suivi, Outils, Tableau de bord…), selon les droits
     du compte, comme sur l'accueil ;
   - un chantier, par son client, sa référence ou sa ville ;
   - une référence de la base articles : Entrée la copie, comme un
     toucher dans l'onglet Références.
   ↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer. Les chantiers
   et les références ne sont lus qu'à la première ouverture.
   Ouvrable aussi par un bouton : window.Palette.ouvrir().
   ===================================================================== */
(function(){
  "use strict";
  if(window.Palette) return;

  function session(){
    try{ var s = JSON.parse(localStorage.getItem("outils:session") || "null"); return s && s.jeton ? s : null; }catch(e){ return null; }
  }
  function sans(t){ return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function villeDe(adresse){
    var t = String(adresse || "").replace(/\n/g, ", ").trim();
    if(!t) return "";
    var m = /\b\d{5}\s+([^,]+)$/.exec(t);
    if(m) return m[1].trim();
    var mo = t.split(",").map(function(x){ return x.trim(); }).filter(Boolean);
    return mo.length > 1 ? mo[mo.length - 1] : "";
  }

  /* ---------- les applis : [lien, nom, droit, mots en plus, réservé] ----------
     droit : la clé d'appli du compte (comme accesAppli de l'accueil) ;
     réservé : "bureau" (bureau et admin), "admin", ou rien. */
  var APPLIS = [
    ["./index.html", "Accueil", "", "menu maison"],
    ["./releve.html", "Relevé technique", "releve", "visite rendez-vous", "pas-tech"],
    ["./suivi.html", "Suivi de chantier", "suivi", "visite reserves"],
    ["./commande.html", "Commande de matériel", "commande", "fournisseur"],
    ["./point.html", "Le point", "commande", "bloquant reste a faire"],
    ["./autocontrole.html", "Autocontrôle", "autocontrole", "verification"],
    ["./reception.html", "Réception de travaux", "reception", "pv proces-verbal lots signature"],
    ["./sav.html", "SAV", "sav", "depannage intervention appel"],
    ["./etiquettes.html", "Étiquettes", "etiquettes", "tableau qr"],
    ["./photos.html", "Reportage photo", "photos", "images"],
    ["./carnet.html", "Carnet et DOE", "carnet", "dossier ouvrages"],
    ["./technique.html", "Documents", "technique", "fiches techniques"],
    ["./schema.html", "Schéma unifilaire", "schema", "tableau electrique"],
    ["./tableau.html", "Tableau de bord du bureau", "", "ts commandes bloquants relances", "bureau"],
    ["./rapports.html", "Carte des chantiers", "", "rapports dossiers plan"],
    ["./utilitaires.html", "Outils", "", "calcul boussole niveau"],
    ["./utilitaires.html#refs", "Références", "", "articles base catalogue batigest"],
    ["./utilitaires.html#cable", "Section de câble", "", "chute de tension outil"],
    ["./utilitaires.html#surface", "Surface", "", "m2 outil"],
    ["./utilitaires.html#croix", "Produit en croix", "", "regle de trois outil"],
    ["./dwg.html", "Plan · dessin, cotes et symboles", "", "dwg dxf 3d toiture photovoltaique"],
    ["./knx.html", "Adresses de groupe KNX", "", "domotique ets"],
    ["./notes.html", "To do list et notes", "", "taches"],
    ["./discussions.html", "Discussions", "", "messages groupe pole equipe photo croquis fichier"],
    ["./cloud.html", "Cloud", "", "drive dossier fichiers stockage partage telephone ordinateur icloud onedrive"],
    ["./plans.html", "Analyse de plan", "", "pdf symboles", "bureau"],
    ["./equipe.html", "Équipe et comptes", "", "utilisateurs societe", "admin"],
    ["./compte.html", "Mon compte", "", "mot de passe apparence theme sombre clair"],
    ["./aide.html", "Aide", "", "mode d'emploi"]
  ];
  function permise(s, a){
    var bureau = s.role === "bureau" || s.role === "admin" || s.proprietaire;
    if(a[4] === "pas-tech" && s.role === "technicien") return false;
    if(a[4] === "bureau" && !bureau) return false;
    if(a[4] === "admin" && !(s.role === "admin" || s.proprietaire)) return false;
    if(!a[2] || s.role === "admin" || s.proprietaire) return true;
    var l = s.applis;
    return !Array.isArray(l) || !l.length || l.indexOf(a[2]) >= 0;
  }

  /* ---------- l'apparence (ses deux versions : theme.js n'y touche pas) ---------- */
  var CSS =
    ":root{--pl-fond:rgba(5,8,12,.62);--pl-boite:#121821;--pl-boite2:#1A2230;--pl-trait:rgba(255,255,255,.10);--pl-trait2:rgba(255,255,255,.18);" +
    "--pl-fg:#EEF2F7;--pl-fg2:#AEB8C4;--pl-fg3:#7C8896;--pl-or:#FB923C;--pl-or-doux:rgba(251,146,60,.16);--pl-cy:#22D3EE}" +
    "html.theme-clair{--pl-fond:rgba(15,23,42,.38);--pl-boite:#FFFFFF;--pl-boite2:#F1F4F8;--pl-trait:rgba(12,18,28,.10);--pl-trait2:rgba(12,18,28,.18);" +
    "--pl-fg:#0C1119;--pl-fg2:#3F4A57;--pl-fg3:#5B6673;--pl-or:#C2560C;--pl-or-doux:rgba(194,86,12,.10);--pl-cy:#0E7490}" +
    "#palette{position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:12vh 16px 16px;background:var(--pl-fond);" +
    "-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
    "#palette[hidden]{display:none}" +
    "#palette .pl-boite{width:min(640px,100%);max-height:min(560px,76vh);display:flex;flex-direction:column;border-radius:18px;background:var(--pl-boite);" +
    "border:1px solid var(--pl-trait2);box-shadow:0 40px 90px -30px rgba(0,0,0,.6);overflow:hidden;animation:plArrive .16s cubic-bezier(.2,.9,.3,1)}" +
    "@keyframes plArrive{from{opacity:0;transform:translateY(-8px) scale(.985)}}" +
    "#palette .pl-champ{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--pl-trait)}" +
    "#palette .pl-champ svg{width:20px;height:20px;flex:none;fill:none;stroke:var(--pl-fg3);stroke-width:2;stroke-linecap:round}" +
    "#palette input{flex:1;min-width:0;border:0!important;outline:0;background:none!important;box-shadow:none!important;padding:4px 0!important;color:var(--pl-fg);font-size:16.5px;font-weight:500;line-height:1.3;font-family:inherit;margin:0}" +
    "#palette input::placeholder{color:var(--pl-fg3)}" +
    "#palette kbd{font-size:11px;font-weight:700;line-height:1;font-family:inherit;padding:5px 7px;border-radius:6px;border:1px solid var(--pl-trait2);color:var(--pl-fg3);background:none}" +
    "#palette ul{list-style:none;margin:0;padding:6px 8px 8px;overflow:auto;overscroll-behavior:contain}" +
    "#palette .pl-g{font-size:10.5px;font-weight:700;line-height:1;font-family:inherit;letter-spacing:.12em;text-transform:uppercase;color:var(--pl-fg3);padding:12px 10px 6px}" +
    "#palette .pl-l{display:flex;align-items:center;gap:12px;padding:10px;border-radius:11px;color:var(--pl-fg);cursor:pointer;text-decoration:none;font-size:14.5px;line-height:1.3}" +
    "#palette .pl-l[aria-selected=true]{background:var(--pl-or-doux)}" +
    "#palette .pl-ic{width:30px;height:30px;flex:none;display:grid;place-items:center;border-radius:9px;background:var(--pl-boite2);border:1px solid var(--pl-trait)}" +
    "#palette .pl-ic svg{width:16px;height:16px;fill:none;stroke:var(--pl-fg2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    "#palette .pl-l[aria-selected=true] .pl-ic svg{stroke:var(--pl-or)}" +
    "#palette .pl-t{flex:1;min-width:0;display:grid;gap:2px}" +
    "#palette .pl-t b{font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#palette .pl-t small{color:var(--pl-fg3);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#palette .pl-t mark{background:none;color:var(--pl-or);font-weight:800}" +
    "#palette .pl-act{font-size:12px;font-weight:700;color:var(--pl-fg3);white-space:nowrap}" +
    "#palette .pl-l.pl-ok .pl-act{color:#22C55E}" +
    "#palette .pl-vide{padding:22px 12px;color:var(--pl-fg2);font-size:14.5px;text-align:center}" +
    "#palette .pl-pied{display:flex;gap:16px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--pl-trait);color:var(--pl-fg3);font-size:12px}" +
    "#palette .pl-pied kbd{padding:3px 5px;margin-right:4px}" +
    "@media (max-width:560px){#palette{padding-top:8px}#palette .pl-pied{display:none}}" +
    "@media (prefers-reduced-motion:reduce){#palette .pl-boite{animation:none}}";

  var IC = {
    appli:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    chantier:'<path d="M4 11 12 4l8 7v9H4z"/><path d="M9.5 20v-5.5h5V20"/>',
    ref:'<path d="M4 7.5V4h3.5M16.5 4H20v3.5M20 16.5V20h-3.5M7.5 20H4v-3.5"/><path d="M8 9v6M11 9v6M14 9v6M16.5 9v6"/>'
  };

  var racine = null, champ = null, liste = null, choix = 0, items = [], retour = null;
  var CHANTIERS = null, REFS = null, chargement = null;

  function construire(){
    if(racine) return;
    var st = document.createElement("style");
    st.id = "paletteCss"; st.setAttribute("data-theme-propre", ""); st.textContent = CSS;
    document.head.appendChild(st);
    racine = document.createElement("div");
    racine.id = "palette"; racine.hidden = true;
    racine.innerHTML =
      '<div class="pl-boite" role="dialog" aria-modal="true" aria-label="Rechercher">' +
        '<label class="pl-champ"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>' +
        '<input type="text" autocomplete="off" spellcheck="false" placeholder="Un chantier, une appli, une référence…" ' +
        'role="combobox" aria-expanded="true" aria-controls="plListe" aria-autocomplete="list" aria-label="Rechercher un chantier, une appli, une référence">' +
        '<kbd>Échap</kbd></label>' +
        '<ul id="plListe" role="listbox" aria-label="Résultats"></ul>' +
        '<div class="pl-pied" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>choisir</span><span><kbd>Entrée</kbd>ouvrir ou copier</span><span><kbd>Échap</kbd>fermer</span></div>' +
      '</div>';
    document.body.appendChild(racine);
    champ = racine.querySelector("input");
    liste = racine.querySelector("ul");
    racine.addEventListener("mousedown", function(e){ if(e.target === racine) fermer(); });
    champ.addEventListener("input", function(){ choix = 0; peindre(); });
    champ.addEventListener("keydown", function(e){
      if(e.key === "ArrowDown"){ e.preventDefault(); bouger(1); }
      else if(e.key === "ArrowUp"){ e.preventDefault(); bouger(-1); }
      else if(e.key === "Enter"){ e.preventDefault(); lancer(items[choix]); }
      else if(e.key === "Escape"){ e.preventDefault(); fermer(); }
      else if(e.key === "Tab"){ e.preventDefault(); bouger(e.shiftKey ? -1 : 1); }
    });
    liste.addEventListener("mousemove", function(e){
      var li = e.target.closest(".pl-l"); if(!li) return;
      var i = +li.dataset.i; if(i !== choix){ choix = i; marquer(); }
    });
    liste.addEventListener("click", function(e){
      var li = e.target.closest(".pl-l"); if(!li) return;
      e.preventDefault(); lancer(items[+li.dataset.i]);
    });
  }

  function charger(s){
    if(chargement) return chargement;
    var h = {"x-auth": s.jeton};
    var base = ""; try{ base = localStorage.getItem("outils:refsBase") || ""; }catch(e){}
    var a = fetch("/api/rapports?action=liste", {headers:h})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ CHANTIERS = ((d && d.chantiers) || []).map(function(c){
        var ville = villeDe(c.adresse);
        return {ref:c.ref, client:c.client || c.ref, ville:ville, etat:c.etat, cle:sans([c.client, c.ref, ville, c.adresse].join(" "))};
      }); })
      .catch(function(){ CHANTIERS = CHANTIERS || []; });
    var b = fetch("/api/rapports?action=references" + (base ? "&base=" + encodeURIComponent(base) : ""), {headers:h})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(!d || !d.lignes){ REFS = []; return; }
        var c = typeof d.cle === "number" ? d.cle : 3, ds = typeof d.des === "number" ? d.des : 4;
        REFS = d.lignes.map(function(l){ return {ref:String(l[c] || ""), des:String(l[ds] || ""), marque:String(l[2] || ""), cle:sans(l.join(" "))}; })
          .filter(function(r){ return r.ref; });
      })
      .catch(function(){ REFS = REFS || []; });
    chargement = Promise.all([a, b]).then(function(){ if(racine && !racine.hidden) peindre(); });
    return chargement;
  }

  /* chaque mot tapé doit se trouver ; un début de mot compte plus */
  function score(cle, mots, titre){
    var s = 0;
    for(var i = 0; i < mots.length; i++){
      var p = cle.indexOf(mots[i]);
      if(p < 0) return -1;
      s += (p === 0 ? 4 : (cle.charAt(p - 1) === " " ? 2 : 1));
      if(titre && titre.indexOf(mots[i]) === 0) s += 3;
    }
    return s;
  }
  function surligne(texte, mots){
    var el = document.createElement("span"), t = String(texte), n = sans(t), pos = [];
    mots.forEach(function(m){ var p = n.indexOf(m); if(p >= 0) pos.push([p, p + m.length]); });
    pos.sort(function(a, b){ return a[0] - b[0]; });
    var i = 0;
    pos.forEach(function(p){
      if(p[0] < i) return;
      el.appendChild(document.createTextNode(t.slice(i, p[0])));
      var m = document.createElement("mark"); m.textContent = t.slice(p[0], p[1]); el.appendChild(m);
      i = p[1];
    });
    el.appendChild(document.createTextNode(t.slice(i)));
    return el;
  }

  function peindre(){
    var s = session(); if(!s) return;
    var q = sans(champ.value.trim()), mots = q.split(/\s+/).filter(Boolean);
    var groupes = [];
    /* applis */
    var ap = APPLIS.filter(function(a){ return permise(s, a); }).map(function(a){
      return {type:"appli", lien:a[0], titre:a[1], sous:"", sc: mots.length ? score(sans(a[1] + " " + a[3]), mots, sans(a[1])) : 1};
    }).filter(function(x){ return x.sc >= 0; });
    if(mots.length) ap.sort(function(a, b){ return b.sc - a.sc; });
    /* chantiers */
    var ch = (CHANTIERS || []).map(function(c){
      return {type:"chantier", lien:"./chantier.html?ref=" + encodeURIComponent(c.ref), titre:c.client,
        sous:[c.ref, c.ville].filter(Boolean).join(" · "), sc: mots.length ? score(c.cle, mots, sans(c.client)) : 1};
    }).filter(function(x){ return x.sc >= 0; });
    if(mots.length) ch.sort(function(a, b){ return b.sc - a.sc; });
    /* références : seulement quand on tape */
    var rf = [];
    if(mots.length && REFS){
      rf = REFS.map(function(r){ return {type:"ref", ref:r.ref, titre:r.ref, sous:[r.des, r.marque].filter(Boolean).join(" · "), sc:score(r.cle, mots, sans(r.ref))}; })
        .filter(function(x){ return x.sc >= 0; }).sort(function(a, b){ return b.sc - a.sc; });
    }
    if(!mots.length){
      groupes.push(["Chantiers récents", ch.slice(0, 5)]);
      groupes.push(["Applis", ap.slice(0, 8)]);
    } else {
      /* le groupe le mieux placé d'abord */
      var g = [["Applis", ap.slice(0, 6)], ["Chantiers", ch.slice(0, 7)], ["Références", rf.slice(0, 7)]];
      g.sort(function(a, b){ return ((b[1][0] || {}).sc || -1) - ((a[1][0] || {}).sc || -1); });
      groupes = g;
    }
    liste.textContent = ""; items = [];
    groupes.forEach(function(gr){
      if(!gr[1].length) return;
      var h = document.createElement("li"); h.className = "pl-g"; h.setAttribute("role", "presentation"); h.textContent = gr[0];
      liste.appendChild(h);
      gr[1].forEach(function(x){
        var li = document.createElement("li");
        li.className = "pl-l"; li.setAttribute("role", "option"); li.id = "plo" + items.length; li.dataset.i = items.length;
        var ic = document.createElement("span"); ic.className = "pl-ic";
        ic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[x.type] + "</svg>";
        var t = document.createElement("span"); t.className = "pl-t";
        var b = document.createElement("b"); b.appendChild(surligne(x.titre, mots)); t.appendChild(b);
        if(x.sous){ var sm = document.createElement("small"); sm.appendChild(surligne(x.sous, mots)); t.appendChild(sm); }
        var act = document.createElement("span"); act.className = "pl-act";
        act.textContent = x.type === "ref" ? "Copier" : "Ouvrir";
        li.appendChild(ic); li.appendChild(t); li.appendChild(act);
        liste.appendChild(li); items.push(x); x.el = li;
      });
    });
    if(!items.length){
      var v = document.createElement("li"); v.className = "pl-vide"; v.setAttribute("role", "presentation");
      v.textContent = (CHANTIERS === null || REFS === null) ? "Recherche en cours…" : "Rien ne correspond à « " + champ.value.trim() + " ».";
      liste.appendChild(v);
    }
    if(choix >= items.length) choix = 0;
    marquer();
  }
  function marquer(){
    items.forEach(function(x, i){ x.el.setAttribute("aria-selected", i === choix ? "true" : "false"); });
    var x = items[choix];
    if(x){ champ.setAttribute("aria-activedescendant", x.el.id); x.el.scrollIntoView({block:"nearest"}); }
    else champ.removeAttribute("aria-activedescendant");
  }
  function bouger(d){ if(!items.length) return; choix = (choix + d + items.length) % items.length; marquer(); }

  function copier(t){
    if(navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function(ok, ko){
      var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try{ document.execCommand("copy") ? ok() : ko(); }catch(e){ ko(e); }
      ta.remove();
    });
  }
  function lancer(x){
    if(!x) return;
    if(x.type === "ref"){
      var el = x.el, act = el.querySelector(".pl-act");
      copier(x.ref).then(function(){
        el.classList.add("pl-ok"); act.textContent = "Copié";
        setTimeout(fermer, 650);
      }, function(){ act.textContent = "Copie impossible"; });
      return;
    }
    var cible = new URL(x.lien, location.href);
    fermer(true);
    if(cible.pathname === location.pathname && cible.search === location.search && cible.hash){
      location.hash = cible.hash;                   /* même page (Outils) : on change d'onglet */
    } else location.href = x.lien;
  }

  function ouvrir(){
    var s = session(); if(!s) return;
    if(document.documentElement.classList.contains("vitrine-on")) return;
    construire();
    if(!racine.hidden){ champ.select(); return; }
    retour = document.activeElement;
    racine.hidden = false; champ.value = ""; choix = 0;
    peindre(); charger(s);
    champ.focus();
  }
  function fermer(sansRetour){
    if(!racine || racine.hidden) return;
    racine.hidden = true;
    if(!sansRetour && retour && retour.focus) try{ retour.focus(); }catch(e){}
    retour = null;
  }

  document.addEventListener("keydown", function(e){
    if((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "k" || e.key === "K")){
      if(!session()) return;
      e.preventDefault();
      if(racine && !racine.hidden) fermer(); else ouvrir();
    }
  });

  window.Palette = {ouvrir:ouvrir, fermer:fermer};
})();
