/* =====================================================================
   visionneuse.js — ouvrir un PDF sans jamais rester coincé dedans
   ---------------------------------------------------------------------
   Installé en icône sur l'écran d'accueil, le site n'a plus la barre du
   navigateur. Un document publié s'ouvre alors dans la fenêtre « OK »
   du téléphone (lien vers un onglet à part, voir dossier.js). Mais un
   PDF fabriqué sur l'appareil (« Générer la fiche ») n'a pas d'adresse
   sur le site : le télécharger remplaçait la page par le PDF, sans barre
   ni retour. Il s'ouvre donc ici, par-dessus l'appli, avec une barre en
   haut : OK pour revenir, Partager pour l'envoyer ou l'enregistrer.
   Dans un navigateur ordinaire, rien ne change : le PDF se télécharge.

   Visionneuse.installee()        vrai dans l'appli installée
   Visionneuse.pdf(blob, nom)     ouvre le PDF par-dessus la page
   Visionneuse.fichier(blob, nom) PDF : la visionneuse dans l'appli
                                  installée, sinon le téléchargement
   ===================================================================== */
(function(){
  var PDFJS = "./vendor/pdfjs-3.11.174/";
  var chargement = null, ouverte = null;

  function installee(){
    try{
      return !!window.navigator.standalone
        || window.matchMedia("(display-mode: standalone)").matches
        || window.matchMedia("(display-mode: fullscreen)").matches;
    }catch(e){ return false; }
  }
  function telecharger(blob, nom){
    var a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
  }
  function chargerPdfJs(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if(chargement) return chargement;
    chargement = new Promise(function(ok, ko){
      var s=document.createElement("script"); s.src=PDFJS+"pdf.min.js"; s.async=true;
      s.onload=function(){
        if(!window.pdfjsLib){ ko(new Error("pdf.js")); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS+"pdf.worker.min.js";
        ok(window.pdfjsLib);
      };
      s.onerror=function(){ chargement=null; ko(new Error("pdf.js")); };
      document.head.appendChild(s);
    });
    return chargement;
  }
  function style(el, css){ el.style.cssText=css; return el; }

  function fermer(parHistorique){
    if(!ouverte) return;
    var o=ouverte; ouverte=null;
    window.removeEventListener("popstate", o.pop);
    document.removeEventListener("keydown", o.cle);
    if(o.ov.parentNode) o.ov.parentNode.removeChild(o.ov);
    document.documentElement.style.overflow=o.debord;
    if(o.url) setTimeout(function(){ URL.revokeObjectURL(o.url); }, 1000);
    if(o.doc) try{ o.doc.destroy(); }catch(e){}
    if(!parHistorique && history.state && history.state.visionneuse) try{ history.back(); }catch(e){}
  }

  /* opts (facultatif) : {retour:"Modifier", action:{texte:"Créer le PDF", faire:function(){…}}}
     pour un aperçu : OK prend le nom de retour, et l'action remplace Partager */
  function pdf(blob, nom, opts){
    fermer(false); opts = opts || {};
    nom = nom || "document.pdf";
    var ov=style(document.createElement("div"), "position:fixed;inset:0;z-index:2147483000;background:#23252A;display:flex;flex-direction:column;"
      +"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif");
    ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-label", nom);
    ov.className="visionneuse";
    var barre=style(document.createElement("div"), "flex:0 0 auto;display:flex;align-items:center;gap:8px;"
      +"padding:calc(env(safe-area-inset-top,0px) + 8px) 10px 8px;background:#F4F4F6;border-bottom:1px solid rgba(0,0,0,.14);color:#111");
    var ok=style(document.createElement("button"), "flex:0 0 auto;min-height:40px;min-width:52px;padding:0 12px;border:0;background:none;"
      +"color:#0A6CFF;font:600 17px/1 inherit;cursor:pointer");
    ok.type="button"; ok.textContent=opts.retour || "OK"; ok.setAttribute("aria-label", "Fermer le document et revenir");
    ok.className="vis-ok";
    var titre=style(document.createElement("div"), "flex:1;min-width:0;text-align:center;font:600 15px/1.2 inherit;"
      +"overflow:hidden;text-overflow:ellipsis;white-space:nowrap");
    titre.textContent=nom.replace(/\.pdf$/i, "");
    var part=style(document.createElement("button"), "flex:0 0 auto;min-height:40px;padding:0 12px;border:0;background:none;"
      +"color:#0A6CFF;font:600 15px/1 inherit;cursor:pointer");
    part.type="button"; part.className="vis-partager";
    var fichier=null; try{ fichier=new File([blob], nom, {type:"application/pdf"}); }catch(e){}
    var peutPartager = !!(fichier && navigator.canShare && navigator.canShare({files:[fichier]}));
    part.textContent = opts.action ? opts.action.texte : peutPartager ? "Partager" : "Enregistrer";
    if(opts.action){ part.className="vis-action"; part.style.color="#fff"; part.style.background="#0A6CFF"; part.style.borderRadius="999px"; part.style.minHeight="36px"; }
    var imp=style(document.createElement("button"), "flex:0 0 auto;min-height:40px;padding:0 10px;border:0;background:none;"
      +"color:#0A6CFF;font:600 15px/1 inherit;cursor:pointer");
    imp.type="button"; imp.className="vis-imprimer"; imp.textContent="Imprimer";
    imp.addEventListener("click", function(){ imprimer(blob, nom); });
    barre.appendChild(ok); barre.appendChild(titre); if(!opts.action) barre.appendChild(imp); barre.appendChild(part);
    var corps=style(document.createElement("div"), "flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 10px calc(env(safe-area-inset-bottom,0px) + 16px);"
      +"display:flex;flex-direction:column;align-items:center;gap:12px;touch-action:pan-x pan-y pinch-zoom");
    corps.className="vis-pages";
    var etat=style(document.createElement("p"), "color:#C7CCD7;font-size:14px;margin:24px 0");
    etat.textContent="Ouverture du document…";
    corps.appendChild(etat);
    ov.appendChild(barre); ov.appendChild(corps);
    document.body.appendChild(ov);

    var o={ov:ov, url:null, doc:null, debord:document.documentElement.style.overflow};
    document.documentElement.style.overflow="hidden";
    /* le geste « retour » du téléphone ferme le document, pas l'appli */
    try{ history.pushState({visionneuse:1}, ""); }catch(e){}
    o.pop=function(){ fermer(true); };
    o.cle=function(e){ if(e.key==="Escape") fermer(false); };
    window.addEventListener("popstate", o.pop);
    document.addEventListener("keydown", o.cle);
    ouverte=o;

    ok.addEventListener("click", function(){ fermer(false); });
    part.addEventListener("click", function(){
      if(opts.action){
        /* l'action vient après la fermeture et son retour d'historique, pour ne pas les mêler */
        var fait=false, histo=!!(history.state && history.state.visionneuse);
        var go=function(){ if(fait) return; fait=true; window.removeEventListener("popstate", go); opts.action.faire(); };
        if(histo) window.addEventListener("popstate", go);
        fermer(false);
        if(histo) setTimeout(go, 800); else go();
        return;
      }
      if(peutPartager) navigator.share({files:[fichier], title:nom}).catch(function(){});
      else telecharger(blob, nom);
    });

    /* les pages, dessinées une à une à la largeur de l'écran */
    chargerPdfJs().then(function(lib){
      return blob.arrayBuffer().then(function(buf){ return lib.getDocument({data:new Uint8Array(buf)}).promise; });
    }).then(function(doc){
      if(ouverte!==o){ doc.destroy(); return; }
      o.doc=doc; corps.removeChild(etat);
      var largeur=Math.min(corps.clientWidth-20, 1100), dpr=Math.min(3, window.devicePixelRatio||1);
      var n=0;
      function suivante(){
        if(ouverte!==o || ++n>doc.numPages) return;
        doc.getPage(n).then(function(page){
          var v1=page.getViewport({scale:1}), k=largeur/v1.width, v=page.getViewport({scale:k*dpr});
          var c=document.createElement("canvas"); c.width=Math.floor(v.width); c.height=Math.floor(v.height);
          style(c, "display:block;width:"+Math.floor(v1.width*k)+"px;max-width:100%;height:auto;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35)");
          c.setAttribute("aria-label", "Page "+n);
          corps.appendChild(c);
          return page.render({canvasContext:c.getContext("2d"), viewport:v}).promise;
        }).then(suivante, suivante);
      }
      suivante();
    }).catch(function(){
      /* pas de lecteur (hors connexion) : le PDF tel quel, et toujours la barre */
      if(ouverte!==o) return;
      o.url=URL.createObjectURL(blob);
      corps.textContent="";
      var f=style(document.createElement("iframe"), "flex:1;width:100%;min-height:70vh;border:0;background:#fff");
      f.src=o.url; f.title=nom;
      corps.appendChild(f);
    });
  }

  function fichierPdf(blob, nom){
    if(installee()) pdf(blob, nom); else telecharger(blob, nom);
  }

  /* imprimer un PDF ou une image, sans le télécharger :
     - iPhone, iPad : la feuille de partage, qui propose « Imprimer » (l'impression d'un cadre y est capricieuse) ;
     - ailleurs : le document dans un cadre invisible, et la fenêtre d'impression du navigateur ;
       si le navigateur refuse, le document s'ouvre dans un onglet, à imprimer de là. */
  function imprimer(blob, nom){
    nom = nom || "document.pdf";
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
    if(ios){
      try{ var f=new File([blob], nom, {type:blob.type||"application/pdf"});
        if(navigator.canShare && navigator.canShare({files:[f]})){ navigator.share({files:[f], title:nom}).catch(function(){}); return; } }catch(e){}
    }
    var url=URL.createObjectURL(blob), image=/^image\//.test(blob.type||"") || /\.(jpe?g|png|webp)$/i.test(nom);
    var ifr=document.createElement("iframe"); ifr.setAttribute("aria-hidden", "true"); ifr.className="impression-cadre";
    ifr.style.cssText="position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
    function secours(){ var w=window.open(url, "_blank"); if(!w) location.href=url; }
    ifr.onload=function(){
      setTimeout(function(){
        try{ ifr.contentWindow.focus(); ifr.contentWindow.print(); }catch(e){ secours(); }
      }, image ? 150 : 400);
    };
    if(image) ifr.srcdoc='<!doctype html><html><head><style>@page{margin:8mm}html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:auto}</style></head><body><img src="'+url+'"></body></html>';
    else ifr.src=url;
    document.body.appendChild(ifr);
    setTimeout(function(){ try{ ifr.remove(); }catch(e){} try{ URL.revokeObjectURL(url); }catch(e){} }, 180000);
  }
  window.Visionneuse = {installee:installee, pdf:pdf, fichier:fichierPdf, fermer:function(){ fermer(false); }, pdfjs:chargerPdfJs, imprimer:imprimer};
})();
