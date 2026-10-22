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
