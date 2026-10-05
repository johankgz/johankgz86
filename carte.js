/* =====================================================================
   carte.js — la carte de visite en QR code des chargés d'affaires
   ---------------------------------------------------------------------
   Un petit QR code à droite du prénom, sur l'accueil ; un appui l'ouvre
   en grand. Scanné par l'appareil photo d'un iPhone ou d'un Android, il
   propose d'ajouter le contact : nom, prénom, téléphone, e-mail,
   fonction, société et adresse postale (format vCard 3.0, celui que les
   deux lisent sans application).
   Les coordonnées viennent de « Mon compte » ; l'adresse, à défaut de
   celle de la personne, est celle de la fiche société.

   Carte.vcard(infos)        -> le texte vCard
   Carte.infos(session, compte) -> {prenom, nom, tel, email, fonction, org, adresse}
   Carte.ouvrir(infos)       la fenêtre en grand
   Carte.monter(hote, session) le petit bouton, rafraîchi depuis le site
   Demande qr.js.
   ===================================================================== */
(function(){
  "use strict";
  if(window.Carte) return;

  function propre(t){ return String(t == null ? "" : t).replace(/\s+/g, " ").trim(); }
  /* les caractères réservés du vCard */
  function ech(t){ return propre(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,"); }

  /* prénom et nom : un mot tout en capitales est le nom (DUPONT Martin),
     sinon le premier mot est le prénom, comme sur l'accueil (Johan Klughertz) */
  function decouper(complet){
    var mots = propre(complet).split(" ").filter(Boolean);
    if(!mots.length) return {prenom:"", nom:""};
    if(mots.length === 1) return {prenom:mots[0], nom:""};
    var caps = mots.filter(function(m){ return m.length > 1 && m === m.toLocaleUpperCase("fr") && m !== m.toLocaleLowerCase("fr"); });
    if(caps.length && caps.length < mots.length){
      return {prenom:mots.filter(function(m){ return caps.indexOf(m) < 0; }).join(" "), nom:caps.join(" ")};
    }
    return {prenom:mots[0], nom:mots.slice(1).join(" ")};
  }
  /* un numéro français en format international, lisible partout */
  function telInter(t){
    var c = String(t || "").replace(/[^\d+]/g, "");
    if(/^0\d{9}$/.test(c)) return "+33" + c.slice(1);
    if(/^0033\d{9}$/.test(c)) return "+" + c.slice(2);
    return c || propre(t);
  }
  /* « 12 rue des Lilas, 85440 Talmont-Saint-Hilaire » -> rue, code postal, ville */
  function adresseEnParties(a){
    var t = propre(String(a || "").replace(/\n/g, ", ")).replace(/\s*,\s*/g, ", ");
    if(!t) return null;
    var m = /^(.*?)[,\s]+(\d{5})\s+([^,]+?)(?:,\s*(France))?$/i.exec(t);
    if(m) return {rue:m[1].replace(/,\s*$/, ""), cp:m[2], ville:m[3], pays:"France"};
    return {rue:t, cp:"", ville:"", pays:""};
  }

  function infos(session, compte){
    var s = session || {}, c = compte || {}, soc = c.carteSociete || s.carteSociete || {};
    var n = decouper(c.nom || s.nom);
    /* un compte écrit « Nom Prénom » : la personne l'inverse dans Mon compte */
    if(c.carteInverse != null ? c.carteInverse : s.carteInverse) n = {prenom:n.nom || n.prenom, nom:n.nom ? n.prenom : ""};
    var role = c.role || s.role;
    return {
      prenom: n.prenom, nom: n.nom,
      tel: propre(c.tel != null ? c.tel : s.tel),
      email: propre(c.email != null ? c.email : s.email),
      fonction: propre(c.fonction || s.fonction) || (role === "technicien" ? "Technicien" : "Chargé d'affaires"),
      org: propre(soc.nom || c.societeNom || s.societeNom),
      adresse: propre(c.adresse || s.adresse) || propre(soc.adresse),
      web: propre(soc.web)
    };
  }

  function vcard(i){
    var l = ["BEGIN:VCARD", "VERSION:3.0",
      "N:" + ech(i.nom) + ";" + ech(i.prenom) + ";;;",
      "FN:" + ech([i.prenom, i.nom].filter(Boolean).join(" "))];
    if(i.org) l.push("ORG:" + ech(i.org));
    if(i.fonction) l.push("TITLE:" + ech(i.fonction));
    if(i.tel) l.push("TEL;TYPE=CELL,VOICE:" + telInter(i.tel));
    if(i.email) l.push("EMAIL;TYPE=INTERNET,WORK:" + propre(i.email));
    var a = adresseEnParties(i.adresse);
    if(a) l.push("ADR;TYPE=WORK:;;" + ech(a.rue) + ";" + ech(a.ville) + ";;" + ech(a.cp) + ";" + ech(a.pays));
    if(i.web) l.push("URL:" + propre(i.web));
    l.push("END:VCARD");
    return l.join("\r\n");
  }

  /* ---------- l'apparence (ses deux versions : theme.js n'y touche pas) ---------- */
  var cssPose = false;
  function css(){
    if(cssPose) return; cssPose = true;
    var st = document.createElement("style");
    st.id = "carteCss"; st.setAttribute("data-theme-propre", "");
    st.textContent =
      ".carte-qr{display:inline-flex;vertical-align:middle;margin-left:10px;width:36px;height:36px;padding:3px;border-radius:9px;" +
      "background:#fff;border:0;box-shadow:0 0 0 1px rgba(255,255,255,.25),0 4px 12px -4px rgba(0,0,0,.55);cursor:pointer;flex:none;position:relative;top:-2px}" +
      "html.theme-clair .carte-qr{box-shadow:0 0 0 1px rgba(12,18,28,.16),0 4px 10px -5px rgba(15,23,42,.35)}" +
      ".carte-qr svg{display:block;width:100%;height:100%}" +
      ".carte-qr:active{transform:scale(.94)}" +
      ".carte-qr:focus-visible{outline:2px solid #FB923C;outline-offset:3px}" +
      "#carteFen{position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;" +
      "background:rgba(5,8,12,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      "#carteFen[hidden]{display:none}" +
      "#carteFen .cf-boite{width:min(360px,100%);border-radius:22px;background:#fff;color:#0C1119;padding:22px 20px 18px;text-align:center;" +
      "box-shadow:0 40px 90px -30px rgba(0,0,0,.7);animation:cfArrive .22s cubic-bezier(.2,.9,.3,1.1)}" +
      "@keyframes cfArrive{from{opacity:0;transform:scale(.92)}}" +
      "#carteFen .cf-qr{width:min(280px,72vw);aspect-ratio:1;margin:0 auto}" +
      "#carteFen .cf-qr svg{display:block;width:100%;height:100%}" +
      "#carteFen b{display:block;margin-top:12px;font-size:19px;font-weight:800;letter-spacing:-.02em}" +
      "#carteFen .cf-fn{color:#4B5563;font-size:14px;margin-top:2px}" +
      "#carteFen .cf-co{color:#374151;font-size:13.5px;margin-top:8px;line-height:1.5}" +
      "#carteFen .cf-aide{color:#6B7280;font-size:12.5px;margin-top:12px;line-height:1.45}" +
      "#carteFen .cf-manque{color:#B45309;font-size:12.5px;margin-top:8px}" +
      "#carteFen .cf-manque a{color:inherit}" +
      "#carteFen .cf-fermer{margin-top:14px;min-height:44px;width:100%;border-radius:12px;border:1px solid #D1D5DB;background:#F3F4F6;color:#111827;font:700 15px/1 inherit;cursor:pointer}" +
      "@media (prefers-reduced-motion:reduce){#carteFen .cf-boite{animation:none}}";
    document.head.appendChild(st);
  }

  var fen = null, retour = null;
  function ouvrir(i){
    if(!window.QR) return;
    css();
    if(!fen){
      fen = document.createElement("div");
      fen.id = "carteFen"; fen.hidden = true;
      fen.innerHTML = '<div class="cf-boite" role="dialog" aria-modal="true" aria-labelledby="cfNom">' +
        '<div class="cf-qr" role="img"></div><b id="cfNom"></b><div class="cf-fn"></div><div class="cf-co"></div>' +
        '<p class="cf-manque" hidden></p>' +
        '<p class="cf-aide">Faites scanner ce code avec l\'appareil photo d\'un iPhone ou d\'un Android : il propose d\'ajouter le contact.</p>' +
        '<button type="button" class="cf-fermer">Fermer</button></div>';
      document.body.appendChild(fen);
      fen.addEventListener("click", function(e){ if(e.target === fen || e.target.closest(".cf-fermer")) fermer(); });
      document.addEventListener("keydown", function(e){ if(e.key === "Escape" && fen && !fen.hidden) fermer(); });
    }
    var nom = [i.prenom, i.nom].filter(Boolean).join(" ");
    var q = fen.querySelector(".cf-qr");
    q.innerHTML = QR.svg(vcard(i), {niveau:"M", marge:3});
    q.setAttribute("aria-label", "QR code de la carte de visite de " + nom);
    fen.querySelector("#cfNom").textContent = nom;
    fen.querySelector(".cf-fn").textContent = [i.fonction, i.org].filter(Boolean).join(" · ");
    var co = fen.querySelector(".cf-co"); co.textContent = "";
    [i.tel, i.email, i.adresse].filter(Boolean).forEach(function(t, k){ if(k) co.appendChild(document.createElement("br")); co.appendChild(document.createTextNode(t)); });
    var manque = [];
    if(!i.tel) manque.push("téléphone"); if(!i.email) manque.push("e-mail");
    var m = fen.querySelector(".cf-manque");
    m.hidden = !manque.length;
    if(manque.length){ m.innerHTML = ""; m.appendChild(document.createTextNode("Il manque votre " + manque.join(" et votre ") + " : ")); var a = document.createElement("a"); a.href = "./compte.html#blocCoord"; a.textContent = "complétez Mon compte"; m.appendChild(a); m.appendChild(document.createTextNode(".")); }
    retour = document.activeElement;
    fen.hidden = false;
    fen.querySelector(".cf-fermer").focus();
  }
  function fermer(){
    if(!fen || fen.hidden) return;
    fen.hidden = true;
    if(retour && retour.focus) try{ retour.focus(); }catch(e){}
  }

  /* le petit bouton, à droite du prénom */
  function bouton(i){
    css();
    var b = document.createElement("button");
    b.type = "button"; b.className = "carte-qr"; b.id = "carteQr";
    b.setAttribute("aria-label", "Ma carte de visite en QR code : l'agrandir");
    b.title = "Ma carte de visite";
    b.innerHTML = window.QR ? QR.svg(vcard(i), {niveau:"L", marge:1}) : "";
    b.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); ouvrir(b.__infos || i); });
    b.__infos = i;
    return b;
  }
  function monter(hote, session){
    if(!hote || !session || !session.jeton || !window.QR) return;
    var ancien = document.getElementById("carteQr"); if(ancien) ancien.remove();
    var b = bouton(infos(session));
    hote.appendChild(b);
    /* les coordonnées à jour, et gardées pour la prochaine fois (même hors réseau) */
    fetch("/api/rapports?action=mon-compte", {headers:{"x-auth":session.jeton}})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        if(!d) return;
        /* sur l'objet de la page aussi : une session réécrite ensuite par l'accueil les garde */
        session.tel = d.tel || ""; session.email = d.email || ""; session.fonction = d.fonction || ""; session.adresse = d.adresse || "";
        session.carteSociete = d.carteSociete || null; session.carteInverse = !!d.carteInverse;
        try{
          var s = JSON.parse(localStorage.getItem("outils:session") || "null");
          if(s && s.jeton === session.jeton){
            s.tel = d.tel || ""; s.email = d.email || ""; s.fonction = d.fonction || ""; s.adresse = d.adresse || "";
            s.carteSociete = d.carteSociete || null; s.carteInverse = !!d.carteInverse;
            localStorage.setItem("outils:session", JSON.stringify(s));
          }
        }catch(e){}
        var i = infos(session, d);
        b.__infos = i;
        b.innerHTML = QR.svg(vcard(i), {niveau:"L", marge:1});
      })
      .catch(function(){});
  }

  window.Carte = {vcard:vcard, infos:infos, ouvrir:ouvrir, monter:monter, decouper:decouper};
})();
