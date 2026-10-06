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
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
