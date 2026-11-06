/* =====================================================================
   commun.js — deux règles pour toutes les pages de l'application
   ---------------------------------------------------------------------
   1. Les noms de chantier en majuscules : le client (nom, raison sociale)
      et la référence des travaux s'écrivent en majuscules, même tapés en
      minuscules, et même remplis d'ailleurs (un dossier repris, un lien).
   2. Moins de textes d'aide : les longs paragraphes d'explication posés
      dans les pages (et leurs boutons « i ») sont retirés ; tout est dans
      l'Aide. Restent les messages qui disent où l'on en est (ils ont un
      identifiant ou s'affichent en cours de route), les mentions légales
      et les mentions sur les données sous les formulaires.
   3. La signature des PDF : chaque PDF fabriqué par le site (jsPDF) porte,
      en bas de chaque page, en petit et en gris, « Suivi travaux 360 — © 2026
      Johan Klughertz. Tous droits réservés » (Signature.texte), sauf si la page
      porte déjà la mention (le pied de page des rapports) ; le carnet, assemblé
      avec pdf-lib, la pose lui-même.
   ===================================================================== */
(function(){
  "use strict";
  if(window.__commun) return; window.__commun=true;

  /* ---------- 1. les majuscules ---------- */
  var CHAMPS="#c_nom,#c_client,#cClient,#c_ref,#a_chantier,#c_nomChamp,#c_refChamp,#r_client,#r_ref,#e_client,#e_ref,#ch_client,#ch_ref";
  function enMaj(el){
    if(!el || typeof el.value!=="string") return false;
    var v=el.value, m=v.toLocaleUpperCase("fr-FR");
    if(v===m) return false;
    var a=el.selectionStart, b=el.selectionEnd;
    el.value=m;
    try{ if(document.activeElement===el && a!=null) el.setSelectionRange(a, b); }catch(e){}
    return true;
  }
  /* à la frappe : avant que l'appli lise le champ (phase de capture) */
  document.addEventListener("input", function(e){ var t=e.target; if(t && t.matches && t.matches(CHAMPS)) enMaj(t); }, true);
  /* remplis par l'appli (dossier repris, adresse de la page) : redits en majuscules, et l'appli prévenue */
  function balayer(){
    var l=document.querySelectorAll(CHAMPS);
    for(var i=0;i<l.length;i++){
      var el=l[i];
      if(el===document.activeElement) continue;
      if(enMaj(el)){
        try{ el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new Event("change", {bubbles:true})); }catch(e){}
      }
    }
  }
  var st=document.createElement("style");
  st.textContent=CHAMPS.split(",").map(function(s){ return s+":not(:placeholder-shown)"; }).join(",")+"{text-transform:uppercase}"
    /* 2. les aides repliées derrière un « i » (sobre.js) : retirées */
    +".aide-i,.aide-repliee{display:none!important}";
  (document.head||document.documentElement).appendChild(st);

  /* ---------- 0. pas de zoom au double appui (téléphone, tablette) ----------
     Deux appuis rapides au même endroit (un « + », une case) ne zooment plus la page ;
     le pincement à deux doigts reste. Un élément qui gère ses propres gestes garde les siens. */
  (function(){
    var st=document.createElement("style"); st.setAttribute("data-theme-propre", "");
    st.textContent="html,body{touch-action:manipulation}"
      +"button,a,label,input,select,textarea,summary,[role=button],.act,.chip{touch-action:manipulation}";
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ---------- 2. les aides ---------- */
  var PAGES_GARDEES=/(aide|cgu|mentions-legales|confidentialite|conditions-abonnement|sous-traitance|client|rdv)\.html$/i;
  function retirerAides(){
    if(PAGES_GARDEES.test(location.pathname)) return;
    var l=document.querySelectorAll("p.hint, p.legend, .sv-aide, p.aide-txt");
    for(var i=0;i<l.length;i++){
      var p=l[i];
      if(p.id || p.hidden) continue;                                  /* un message d'état, rempli par la page */
      if(p.closest(".mention, .legal, footer, .pied, [data-garder]")) continue;
      if(p.classList.contains("mention") || p.classList.contains("err")) continue;
      if(p.querySelector("a[href*='confidentialite'], a[href*='cgu'], a[href*='mentions'], input, select, textarea, button")) continue;
      var t=(p.textContent||"").replace(/\s+/g, " ").trim();
      if(t.length < 60) continue;                                     /* un titre court ou une légende de champ */
      p.setAttribute("data-aide-retiree", "");
      p.style.display="none";
    }
  }
  function demarrer(){ retirerAides(); balayer(); setInterval(function(){ if(!document.hidden) balayer(); }, 1500); }

  /* ---------- 4. après une publication, retour à l'accueil ----------
     RetourAccueil("Suivi publié dans le dossier.") : une fiche enregistrée
     (relevé, suivi, commande, point…), on revient au menu d'accueil. Mais
     pas avant la fin des envois en cours (la fiche à rouvrir, les photos) :
     on les compte, et l'on attend qu'il n'y en ait plus (une minute au plus),
     et au moins 1,6 s pour lire la confirmation. L'accueil la redit. */
  var ENVOIS=0;
  if(window.fetch && !window.fetch.__compte){
    var f0=window.fetch;
    var fc=function(entree, init){
      var m=String((init && init.method) || (entree && entree.method) || "GET").toUpperCase(), compte = m!=="GET" && m!=="HEAD";
      if(compte) ENVOIS++;
      var pr; try{ pr=f0.apply(this, arguments); }catch(e){ if(compte) ENVOIS--; throw e; }
      return compte ? pr.then(function(r){ ENVOIS--; return r; }, function(e){ ENVOIS--; throw e; }) : pr;
    };
    fc.__compte=true; window.fetch=fc;
  }
  /* Un envoi de photos se fait en plusieurs fois (un lot, puis le suivant) :
     on attend qu'il n'y ait plus rien en route depuis une seconde, et tant
     que des photos partent (réseau lent), on ne coupe pas — un quart
     d'heure au plus. */
  window.RetourAccueil=function(msg){
    if(window.top!==window) return;                       /* une page ouverte dans une autre : elle reste */
    try{ if(msg) sessionStorage.setItem("accueil:message", String(msg)); }catch(e){}
    var t0=Date.now(), calme=0;
    (function attendre(){
      var occupe = ENVOIS>0 || window.PH_SITE_EN_COURS===true || (window.__envoisEnCours||0)>0;
      calme = occupe ? 0 : calme+250;
      if((occupe || calme<1000 || Date.now()-t0<1600) && Date.now()-t0<15*60000){ setTimeout(attendre, 250); return; }
      location.href="./index.html";
    })();
  };
  /* sur l'accueil : la confirmation de ce qui vient d'être publié */
  function messageAccueil(){
    if(!/(\/|index\.html)$/.test(location.pathname)) return;
    var m=null; try{ m=sessionStorage.getItem("accueil:message"); sessionStorage.removeItem("accueil:message"); }catch(e){}
    if(!m) return;
    var b=document.createElement("div"); b.setAttribute("role","status"); b.textContent="✓  "+m;
    b.style.cssText="position:fixed;left:50%;bottom:calc(22px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2147481000;"
      +"max-width:calc(100% - 32px);padding:12px 18px;border-radius:999px;background:linear-gradient(135deg,#2563EB,#06B6D4);color:#fff;"
      +"font:600 14.5px/1.3 inherit;font-family:inherit;box-shadow:0 12px 30px -10px rgba(11,18,32,.6);text-align:center;transition:opacity .4s";
    document.body.appendChild(b);
    setTimeout(function(){ b.style.opacity="0"; setTimeout(function(){ if(b.parentNode) b.parentNode.removeChild(b); }, 450); }, 3800);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", messageAccueil); else messageAccueil();

  /* ---------- 3. l'itinéraire, dans l'appli de cartes ----------
     Itineraire.ouvrir(destination, {chercher:true}) : une adresse ou « lat,lon ».
     Sur iPhone et iPad, un lien web vers Google Maps passe bien la main à
     l'appli, mais laisse derrière lui une fenêtre Safari vide (site installé
     sur l'écran d'accueil). On ouvre donc l'appli directement par son adresse
     propre (maps://, comgooglemaps://, waze://) : aucune fenêtre ne reste.
     Le premier coup, on choisit l'appli (Plans, Google Maps ou Waze) ; le
     choix est retenu sur l'appareil, et se change dans « Mon compte ».
     Ailleurs (Android, ordinateur) : Google Maps, comme avant. */
  var CLE_ITI="itineraire:appli";
  function surIOS(){
    var ua=navigator.userAgent||"";
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform==="MacIntel" && (navigator.maxTouchPoints||0)>1);
  }
  function lienWeb(d, chercher){
    return chercher ? "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(d)
                    : "https://www.google.com/maps/dir/?api=1&destination="+encodeURIComponent(d);
  }
  function lienAppli(appli, d, chercher){
    var e=encodeURIComponent(d);
    if(appli==="google") return chercher ? "comgooglemaps://?q="+e : "comgooglemaps://?daddr="+e+"&directionsmode=driving";
    if(appli==="waze") return "waze://?q="+e+(chercher ? "" : "&navigate=yes");
    return chercher ? "maps://?q="+e : "maps://?daddr="+e+"&dirflg=d";
  }
  function lancer(appli, d, chercher){
    var parti=false;
    function cache(){ if(document.hidden) parti=true; }
    document.addEventListener("visibilitychange", cache);
    location.href=lienAppli(appli, d, chercher);
    /* l'appli n'est pas installée (Google Maps, Waze) : la carte web, faute de mieux */
    setTimeout(function(){
      document.removeEventListener("visibilitychange", cache);
      if(!parti && !document.hidden && appli!=="plans") window.open(lienWeb(d, chercher), "_blank");
    }, 1600);
  }
  function choisir(d, chercher){
    var fond=document.createElement("div");
    fond.style.cssText="position:fixed;inset:0;z-index:2147482000;background:rgba(11,18,32,.45);display:flex;align-items:flex-end;justify-content:center";
    var boite=document.createElement("div");
    boite.setAttribute("role","dialog"); boite.setAttribute("aria-modal","true"); boite.setAttribute("aria-label","Ouvrir l'itinéraire avec");
    boite.style.cssText="width:100%;max-width:480px;background:#fff;color:#0B1220;border-radius:20px 20px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom,0px));"
      +"font-family:inherit;box-shadow:0 -10px 30px rgba(0,0,0,.25)";
    var t=document.createElement("p"); t.textContent="Ouvrir l'itinéraire avec";
    t.style.cssText="margin:0 0 4px;font-size:17px;font-weight:800;letter-spacing:-.01em";
    var st=document.createElement("p"); st.textContent="Votre choix est retenu sur cet appareil (modifiable dans Mon compte).";
    st.style.cssText="margin:0 0 14px;font-size:12.5px;color:#5B6475";
    boite.appendChild(t); boite.appendChild(st);
    [["plans","Plans","L'appli Plans d'Apple"],["google","Google Maps","Si elle est installée"],["waze","Waze","Si elle est installée"]].forEach(function(a){
      var b=document.createElement("button"); b.type="button";
      b.style.cssText="display:block;width:100%;text-align:left;margin:0 0 8px;padding:12px 14px;min-height:0;border:1px solid #E2E8F0;border-radius:14px;background:#F4F6FB;color:#0B1220;font:inherit;cursor:pointer";
      b.innerHTML="<b style=\"display:block;font-size:15.5px\"></b><small style=\"display:block;font-size:12.5px;color:#5B6475\"></small>";
      b.firstChild.textContent=a[1]; b.lastChild.textContent=a[2];
      b.addEventListener("click", function(){
        try{ localStorage.setItem(CLE_ITI, a[0]); }catch(e){}
        fermer(); lancer(a[0], d, chercher);
      });
      boite.appendChild(b);
    });
    var an=document.createElement("button"); an.type="button"; an.textContent="Annuler";
    an.style.cssText="display:block;width:100%;margin:4px 0 0;padding:12px;min-height:0;border:0;border-radius:14px;background:transparent;color:#2563EB;font:inherit;font-weight:700;cursor:pointer";
    an.addEventListener("click", fermer);
    boite.appendChild(an);
    fond.appendChild(boite);
    fond.addEventListener("click", function(e){ if(e.target===fond) fermer(); });
    function fermer(){ if(fond.parentNode) fond.parentNode.removeChild(fond); }
    document.body.appendChild(fond);
  }
  window.Itineraire={
    ouvrir:function(destination, opts){
      var d=String(destination||"").replace(/\n/g, ", ").trim(); if(!d) return;
      var chercher=!!(opts && opts.chercher);
      if(!surIOS()){ window.open(lienWeb(d, chercher), "_blank"); return; }
      var appli=null; try{ appli=localStorage.getItem(CLE_ITI); }catch(e){}
      if(/^(plans|google|waze)$/.test(appli||"")) lancer(appli, d, chercher); else choisir(d, chercher);
    },
    appli:function(){ try{ return localStorage.getItem(CLE_ITI)||""; }catch(e){ return ""; } },
    choisirAppli:function(v){ try{ if(v) localStorage.setItem(CLE_ITI, v); else localStorage.removeItem(CLE_ITI); }catch(e){} },
    surIOS:surIOS
  };
  /* un simple lien vers Google Maps (l'adresse d'une demande…) suit le même chemin sur iPhone */
  document.addEventListener("click", function(e){
    if(!surIOS() || e.defaultPrevented) return;
    var a=e.target && e.target.closest && e.target.closest('a[href^="https://www.google.com/maps"]'); if(!a) return;
    var u; try{ u=new URL(a.href); }catch(er){ return; }
    var d=u.searchParams.get("destination"), q=u.searchParams.get("query");
    if(!d && !q) return;
    e.preventDefault(); window.Itineraire.ouvrir(d||q, {chercher:!d});
  });
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();

/* ---------- la personne se sert du site ----------
   Une page ouverte (ou revenue au premier plan) le dit au serveur, au plus
   une fois par minute, avec l'appareil (son abonnement aux notifications) :
   une notification qui arrive en retard sur un AUTRE appareil — un
   ordinateur qui sort de veille — n'a plus à s'afficher (notifications.mjs). */
(function(){
  var s=null; try{ s=JSON.parse(localStorage.getItem("outils:session")||"null"); }catch(e){}
  if(!s || !s.jeton || !/^https?:$/.test(location.protocol)) return;
  function abonnement(){
    try{
      if(!("serviceWorker" in navigator) || !window.Notification || Notification.permission!=="granted") return Promise.resolve("");
      return navigator.serviceWorker.getRegistration().then(function(r){ return r && r.pushManager ? r.pushManager.getSubscription() : null; })
        .then(function(ab){ return ab ? ab.endpoint : ""; }).catch(function(){ return ""; });
    }catch(e){ return Promise.resolve(""); }
  }
  function signaler(){
    if(document.hidden) return;
    var k="push:actif", t=0; try{ t=+localStorage.getItem(k)||0; }catch(e){}
    if(Date.now()-t < 60000) return;
    try{ localStorage.setItem(k, String(Date.now())); }catch(e){}
    abonnement().then(function(ep){
      fetch("/api/rapports?action=push-actif"+(ep ? "&ap="+encodeURIComponent(ep) : ""), {headers:{"x-auth":s.jeton}}).catch(function(){});
    });
  }
  signaler();
  document.addEventListener("visibilitychange", signaler);
})();

/* ---------- 3. la signature des PDF ----------
   jsPDF est chargé après ce fichier (ou plus tard, à la demande) : on guette son arrivée
   (window.jspdf), puis, à la création de chaque document (« initialized »), on enveloppe son
   enregistrement (save) et sa sortie (output) : la ligne s'écrit en bas de chaque page juste avant.
   (Pas pendant l'assemblage : jsPDF écrit alors le fichier lui-même, un ajout le viderait.) */
(function(){
  "use strict";
  if(window.Signature) return;
  var TEXTE="Suivi travaux 360  —  © 2026 Johan Klughertz. Tous droits réservés";
  /* le logo Suivi Travaux 360° : le symbole (pied des PDF) et le logo horizontal (cartouche des plans) */
  var LOGO_SYMBOLE="data:image/png;base64,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";
  var LOGO_LONG={data:"data:image/png;base64,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", w:420, h:111};
  window.Signature={texte:TEXTE, logo:LOGO_SYMBOLE, logoLong:LOGO_LONG};
  function signer(){
    var doc=this, n, cur, f, fs, tc, k, i, w, h;
    try{
      n=doc.internal.getNumberOfPages(); cur=doc.internal.getCurrentPageInfo().pageNumber;
      doc.__signees=doc.__signees||{};
      f=doc.getFont(); fs=doc.getFontSize(); tc=doc.getTextColor(); k=doc.internal.scaleFactor||1;
      for(i=1;i<=n;i++){
        if(doc.__signees[i]) continue;
        doc.__signees[i]=true;
        /* une page qui porte déjà la mention (le pied de page des rapports) n'en reçoit pas une seconde */
        var pg=doc.internal.pages && doc.internal.pages[i];
        if(pg && pg.join && pg.join("\n").indexOf("Klughertz")>=0) continue;
        doc.setPage(i);
        w=doc.internal.pageSize.getWidth(); h=doc.internal.pageSize.getHeight();
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(150, 155, 165);
        /* à 3 mm du bas (8,5 points), au milieu */
        doc.text(TEXTE, w/2, h-8.5/k, {align:"center", baseline:"bottom"});
        /* le symbole, juste avant la mention (2,6 mm) */
        try{ var mm=72/25.4/k, tl=doc.getTextWidth(TEXTE), sz=2.6*mm; doc.addImage(LOGO_SYMBOLE, "PNG", w/2-tl/2-sz-0.8*mm, h-8.5/k-sz*0.82, sz, sz); }catch(e){}
      }
      doc.setPage(cur);
      if(f) doc.setFont(f.fontName, f.fontStyle);
      doc.setFontSize(fs); doc.setTextColor(tc);
    }catch(e){}
  }
  function installer(lib){
    var J=lib && lib.jsPDF;
    if(!J || !J.API || J.API.__signature) return;
    J.API.__signature=true;
    J.API.events.push(["initialized", function(){
      var doc=this;
      ["save", "output"].forEach(function(m){
        var f=doc[m]; if(typeof f!=="function") return;
        doc[m]=function(){ signer.call(doc); return f.apply(doc, arguments); };
      });
    }]);
  }
  if(window.jspdf && window.jspdf.jsPDF){ installer(window.jspdf); return; }
  /* la bibliothèque pose window.jspdf vide, puis le remplit : on installe juste après */
  var val=window.jspdf;
  try{
    Object.defineProperty(window, "jspdf", {configurable:true, enumerable:true,
      get:function(){ return val; },
      set:function(v){ val=v; Promise.resolve().then(function(){ installer(val); }); }});
  }catch(e){}
})();
